// @ts-expect-error no types for locally-built GIR library
import BrightnessLib from 'gi://Brightness';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Service from '../service.js';
import type { Disposable } from '../service.js';

const BACKLIGHT_DIR = '/sys/class/backlight';

/**
 * Brightness Service
 *
 * Controls screen backlight via the locally-built `Brightness` GIR library,
 * which reads and writes /sys/class/backlight/<device>/brightness directly.
 * No external process is spawned.
 *
 * Write permission on the sysfs brightness file is a system-level concern;
 * set it via a udev rule (`TAG+="uaccess"`) or membership in the `video` group.
 *
 * @property screen      - Current brightness as a fraction in [0, 1] (rw)
 * @property device_name - The backlight device in use (read-only)
 */
export class Brightness extends Service implements Disposable {
    static {
        Service.register(
            this,
            {},
            {
                screen: ['float', 'rw'],
                'device-name': ['string', 'r'],
            },
        );
    }

    private _device: any = null;
    private _screen = 0;
    private _deviceName = '';
    private _monitor: Gio.FileMonitor | null = null;
    private _monitorId = 0;

    /** Current brightness normalised to [0, 1]. */
    get screen() {
        return this._screen;
    }

    set screen(percent: number) {
        if (!this._device) return;
        percent = Math.max(0, Math.min(1, percent));
        const raw = Math.round(percent * this._device.max_brightness);
        const ok: boolean = this._device.set_brightness(raw, null);
        if (ok) {
            this._screen = percent;
            this.notify('screen');
            this.emit('changed');
        }
    }

    /** The /sys/class/backlight device name in use. */
    get device_name() {
        return this._deviceName;
    }

    constructor(deviceName?: string) {
        super();

        const devices: string[] = BrightnessLib.enumerate_devices();
        const name = deviceName ?? devices[0];

        if (!name) {
            console.error('Brightness: no backlight devices found under ' + BACKLIGHT_DIR);
            return;
        }

        this._device = BrightnessLib.Device.new(name);
        if (!this._device) {
            console.error(`Brightness: could not open device '${name}'`);
            return;
        }

        this._deviceName = name;
        this._screen = this._device.brightness / this._device.max_brightness;

        this._setupMonitor(name);
    }

    private _setupMonitor(name: string) {
        const path = `${BACKLIGHT_DIR}/${name}/brightness`;
        const file = Gio.File.new_for_path(path);

        try {
            this._monitor = file.monitor_file(Gio.FileMonitorFlags.NONE, null);
        } catch {
            // inotify may not fire for sysfs on all kernels; poll instead
            this._startPolling();
            return;
        }

        this._monitorId = this._monitor.connect(
            'changed',
            (_monitor: Gio.FileMonitor, _file: Gio.File, _other: Gio.File | null, event: Gio.FileMonitorEvent) => {
                if (
                    event !== Gio.FileMonitorEvent.CHANGED &&
                    event !== Gio.FileMonitorEvent.CREATED
                )
                    return;
                this._refresh();
            },
        );
    }

    private _startPolling() {
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
            if (!this._device) return GLib.SOURCE_REMOVE;
            this._refresh();
            return GLib.SOURCE_CONTINUE;
        });
    }

    private _refresh() {
        if (!this._device) return;
        const raw: number = this._device.refresh(null);
        if (raw < 0) return;
        const percent = raw / this._device.max_brightness;
        if (percent !== this._screen) {
            this._screen = percent;
            this.notify('screen');
            this.emit('changed');
        }
    }

    dispose(): void {
        if (this._monitor) {
            if (this._monitorId) this._monitor.disconnect(this._monitorId);
            this._monitor.cancel();
            this._monitor = null;
        }
        this._device = null;
        super.dispose();
    }
}

export const brightness = new Brightness();
export default brightness;
