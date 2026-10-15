// @ts-expect-error missing types
import GnomeBluetooth from 'gi://GnomeBluetooth?version=3.0';
import GObject from 'gi://GObject';
import Service from '../service.js';
import type { Disposable } from '../service.js';
import Gio from 'gi://Gio';
import type { ChildScope } from '../internal/resource-scope.js';

const _ADAPTER_STATE = {
    [GnomeBluetooth.AdapterState.ABSENT]: 'absent',
    [GnomeBluetooth.AdapterState.ON]: 'on',
    [GnomeBluetooth.AdapterState.TURNING_ON]: 'turning-on',
    [GnomeBluetooth.AdapterState.TURNING_OFF]: 'turning-off',
    [GnomeBluetooth.AdapterState.OFF]: 'off',
};

/**
 * Bluetooth Device
 *
 * Represents a single Bluetooth device with connection state tracking.
 *
 * Lifecycle:
 * 1. Construction - Bind to GnomeBluetooth.Device
 * 2. Active - Monitor device properties and connection state
 * 3. Disposal - Disconnect property signals
 *
 * @property {string} address - Bluetooth hardware address (MAC)
 * @property {string} alias - User-facing device alias
 * @property {number} battery_level - Coarse battery level (0-100 or -1)
 * @property {number} battery_percentage - Battery percentage (0-100 or -1)
 * @property {boolean} connected - Whether device is connected
 * @property {string} icon_name - Icon name for device type
 * @property {string} name - Device name
 * @property {boolean} paired - Whether device is paired
 * @property {boolean} trusted - Whether device is trusted
 * @property {string} type - Human-readable device type
 * @property {boolean} connecting - Whether connection attempt is in progress
 *
 * @fires changed - Emitted when device state changes
 */
export class BluetoothDevice extends Service implements Disposable {
    static {
        Service.register(
            this,
            {},
            {
                address: ['string'],
                alias: ['string'],
                'battery-level': ['int'],
                'battery-percentage': ['int'],
                connected: ['boolean'],
                'icon-name': ['string'],
                name: ['string'],
                paired: ['boolean'],
                trusted: ['boolean'],
                type: ['string'],
                connecting: ['boolean'],
            },
        );
    }

    private _device: GnomeBluetooth.Device;
    private _connecting = false;

    /** The underlying GnomeBluetooth.Device instance. */
    get device() {
        return this._device;
    }

    constructor(device: GnomeBluetooth.Device) {
        super();

        this._device = device;
        for (const prop of [
            'address',
            'alias',
            'battery-level',
            'battery-percentage',
            'connected',
            'name',
            'paired',
            'trusted',
        ]) {
            this.resources.connect(device, `notify::${prop}`, () => {
                this.changed(prop);
            });
        }

        this.resources.connect(device, 'notify::icon', () => {
            this.changed('icon-name');
        });
    }

    close() {
        // Call dispose to cleanup
        this.dispose();
    }

    /** The Bluetooth hardware address (MAC). */
    get address() {
        return this._device.address;
    }

    /** The user-facing alias for this device. */
    get alias() {
        return this._device.alias;
    }

    /** Coarse battery level (0-100 or -1 if unknown). */
    get battery_level() {
        return this._device.battery_level;
    }

    /** Battery percentage (0-100 or -1 if unknown). */
    get battery_percentage() {
        return this._device.battery_percentage;
    }

    /** Whether the device is currently connected. */
    get connected() {
        return this._device.connected;
    }

    /** Icon name representing the device type. */
    get icon_name() {
        return this._device.icon;
    }

    /** The reported device name. */
    get name() {
        return this._device.name;
    }

    /** Whether the device is paired. */
    get paired() {
        return this._device.paired;
    }

    /** Whether the device is trusted. */
    get trusted() {
        return this._device.trusted;
    }

    /** Human-readable device type string. */
    get type() {
        return GnomeBluetooth.type_to_string(this._device.type);
    }

    /** Whether a connection attempt is currently in progress. */
    get connecting() {
        return this._connecting || false;
    }

    /**
     * Initiates or terminates a connection to this device.
     *
     * @param connect - True to connect, false to disconnect
     */
    readonly setConnection = (connect: boolean) => {
        if (this.isDisposed || bluetooth.isDisposed) return;
        this._connecting = true;
        bluetooth.connectDevice(this, connect, () => {
            this._connecting = false;
            this.changed('connecting');
        });
        this.changed('connecting');
    };

}

/**
 * Bluetooth Service
 *
 * Service for managing Bluetooth adapter state and paired devices via GnomeBluetooth.
 *
 * Lifecycle:
 * 1. Construction - Connect to GnomeBluetooth client
 * 2. Initialization - Enumerate existing devices
 * 3. Ready - Monitor device additions, removals, adapter state
 * 4. Disposal - Cleanup all devices and client connections
 *
 * @property {BluetoothDevice[]} devices - All paired or trusted devices
 * @property {BluetoothDevice[]} connected_devices - Currently connected devices
 * @property {boolean} enabled - Whether Bluetooth adapter is powered on
 * @property {string} state - Adapter state
 *
 * @fires device-added - Emitted when device is added (address: string)
 * @fires device-removed - Emitted when device is removed (address: string)
 * @fires changed - Emitted when Bluetooth state changes
 */
export class Bluetooth extends Service implements Disposable {
    static {
        Service.register(
            this,
            {
                'device-added': ['string'],
                'device-removed': ['string'],
            },
            {
                devices: ['jsobject'],
                'connected-devices': ['jsobject'],
                enabled: ['boolean', 'rw'],
                state: ['string'],
            },
        );
    }

    private _client: GnomeBluetooth.Client;
    private _devices: Map<string, BluetoothDevice>;
    private _deviceScopes: Map<string, ChildScope>;
    private _cancellable = new Gio.Cancellable();

    constructor() {
        super();

        this._devices = new Map();
        this._deviceScopes = new Map();
        this.resources.add(() => this._cancellable.cancel());
        this.resources.add(() => {
            this._devices.clear();
            this._deviceScopes.clear();
        });
        this._client = new GnomeBluetooth.Client();
        this.resources.connect(this._client, 'device-added', (_client, device) =>
            this._deviceAdded(this._client, device as GnomeBluetooth.Device),
        );
        this.resources.connect(this._client, 'device-removed', (_client, path) =>
            this._deviceRemoved(this._client, path as string),
        );
        this.resources.connect(this._client, 'notify::default-adapter-state', () =>
            this.changed('state'),
        );
        this.resources.connect(this._client, 'notify::default-adapter-powered', () =>
            this.changed('enabled'),
        );

        this._getDevices().forEach(device => this._deviceAdded(this, device));
    }

    /** Toggles the default Bluetooth adapter power state. */
    readonly toggle = () => {
        this._client.default_adapter_powered = !this._client.default_adapter_powered;
    };

    private _getDevices() {
        const devices = [];
        const deviceStore = this._client.get_devices();

        for (let i = 0; i < deviceStore.get_n_items(); ++i) {
            const device = deviceStore.get_item(i);

            if (device.paired || device.trusted) devices.push(device);
        }

        return devices;
    }

    private _deviceAdded(_: GnomeBluetooth.Client, device: GnomeBluetooth.Device) {
        if (this.isDisposed || this._devices.has(device.address)) return;

        const d = new BluetoothDevice(device);

        const child = this.resources.child();
        child.scope.add(() => d.dispose());
        child.scope.connect(d as unknown as GObject.Object, 'changed', () => this.emit('changed'));
        child.scope.connect(d as unknown as GObject.Object, 'notify::connected', () =>
            this.notify('connected-devices'),
        );
        this._deviceScopes.set(device.address, child);

        this._devices.set(device.address, d);
        this.changed('devices');
        this.emit('device-added', device.address);
    }

    private _deviceRemoved(_: GnomeBluetooth.Client, path: string) {
        const device = this.devices.find(d => d.device.get_object_path() === path);
        if (!device || !this._devices.has(device.address)) return;

        this._deviceScopes.get(device.address)?.release();
        this._deviceScopes.delete(device.address);
        this._devices.delete(device.address);
        this.notify('devices');
        this.notify('connected-devices');
        this.emit('changed');
        this.emit('device-removed', device.address);
    }

    /**
     * Connects or disconnects a Bluetooth device asynchronously.
     *
     * @param device - The device to connect/disconnect
     * @param connect - True to connect, false to disconnect
     * @param callback - Called with the success status when complete
     */
    readonly connectDevice = (
        device: BluetoothDevice,
        connect: boolean,
        callback: (s: boolean) => void,
    ) => {
        if (this.isDisposed || device.isDisposed) return;
        this._client.connect_service(
            device.device.get_object_path(),
            connect,
            this._cancellable,
            (client: GnomeBluetooth.Client, res: Gio.AsyncResult) => {
                try {
                    const s = client.connect_service_finish(res);
                    if (this.isDisposed || device.isDisposed) return;
                    callback(s);

                    if (!this.isDisposed && !device.isDisposed) this.changed('connected-devices');
                } catch (error) {
                    if (this.isDisposed || device.isDisposed) return;
                    logError(error);
                    callback(false);
                }
            },
        );
    };

    /**
     * Looks up a device by its Bluetooth address.
     *
     * @param address - The MAC address to look up
     * @returns The BluetoothDevice or undefined
     */
    readonly getDevice = (address: string) => this._devices.get(address);

    /** Whether the Bluetooth adapter is powered on. */
    set enabled(v) {
        this._client.default_adapter_powered = v;
    }

    get enabled() {
        return this.state === 'on' || this.state === 'turning-on';
    }

    /** Adapter state: "absent", "on", "turning-on", "turning-off", or "off". */
    get state() {
        return _ADAPTER_STATE[this._client.default_adapter_state];
    }

    /** All known paired or trusted Bluetooth devices. */
    get devices() {
        return Array.from(this._devices.values());
    }

    /** Devices that are currently connected. */
    get connected_devices() {
        const list = [];
        for (const [, device] of this._devices) {
            if (device.connected) list.push(device);
        }
        return list;
    }

}

export const bluetooth = new Bluetooth();
export default bluetooth;
