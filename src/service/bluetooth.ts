// @ts-expect-error missing types
import GnomeBluetooth from 'gi://GnomeBluetooth?version=3.0';
import GObject from 'gi://GObject';
import Service from '../service.js';
import type { Disposable } from '../service.js';
import Gio from 'gi://Gio';
import { bulkConnect, bulkDisconnect, globalSignalRegistry } from '../utils.js';

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
    private _ids: number[];
    private _connecting = false;

    /** The underlying GnomeBluetooth.Device instance. */
    get device() {
        return this._device;
    }

    constructor(device: GnomeBluetooth.Device) {
        super();

        this._device = device;
        this._ids = [
            'address',
            'alias',
            'battery-level',
            'battery-percentage',
            'connected',
            'name',
            'paired',
            'trusted',
        ].map(prop => {
            const id = device.connect(`notify::${prop}`, () => {
                this.changed(prop);
            });
            this.trackConnection(id);
            globalSignalRegistry.register(device, id);
            return id;
        });

        const iconId = device.connect('notify::icon', () => {
            this.changed('icon-name');
        });
        this._ids.push(iconId);
        this.trackConnection(iconId);
        globalSignalRegistry.register(device, iconId);
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
        this._connecting = true;
        bluetooth.connectDevice(this, connect, () => {
            this._connecting = false;
            this.changed('connecting');
        });
        this.changed('connecting');
    };

    dispose(): void {
        super.dispose();

        // Disconnect device property signals
        if (this._device && this._ids) {
            bulkDisconnect(this._device, this._ids);
            globalSignalRegistry.disconnect(this._device);
        }
    }
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
    private _deviceSignals: Map<string, number[]>;

    constructor() {
        super();

        this._devices = new Map();
        this._deviceSignals = new Map();
        this._client = new GnomeBluetooth.Client();
        bulkConnect(this._client, [
            ['device-added', this._deviceAdded.bind(this)],
            ['device-removed', this._deviceRemoved.bind(this)],
            ['notify::default-adapter-state', () => this.changed('state')],
            ['notify::default-adapter-powered', () => this.changed('enabled')],
        ]);

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
        if (this._devices.has(device.address)) return;

        const d = new BluetoothDevice(device);

        const changedId = d.connect('changed', () => this.emit('changed'));
        globalSignalRegistry.register(d as unknown as GObject.Object, changedId);

        const connectedId = d.connect('notify::connected', () => this.notify('connected-devices'));
        globalSignalRegistry.register(d as unknown as GObject.Object, connectedId);

        // Store signal IDs for proper cleanup on device removal
        this._deviceSignals.set(device.address, [changedId, connectedId]);

        this._devices.set(device.address, d);
        this.changed('devices');
        this.emit('device-added', device.address);
    }

    private _deviceRemoved(_: GnomeBluetooth.Client, path: string) {
        const device = this.devices.find(d => d.device.get_object_path() === path);
        if (!device || !this._devices.has(device.address)) return;

        // Disconnect device signals before closing
        const signals = this._deviceSignals.get(device.address);
        if (signals) {
            bulkDisconnect(device as unknown as GObject.Object, signals);
            globalSignalRegistry.disconnect(device as unknown as GObject.Object);
            this._deviceSignals.delete(device.address);
        }

        this._devices.get(device.address)?.close();
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
        this._client.connect_service(
            device.device.get_object_path(),
            connect,
            null,
            (client: GnomeBluetooth.Client, res: Gio.AsyncResult) => {
                try {
                    const s = client.connect_service_finish(res);
                    callback(s);

                    this.changed('connected-devices');
                } catch (error) {
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

    dispose(): void {
        super.dispose();

        // Cleanup all devices
        for (const device of this._devices.values()) {
            globalSignalRegistry.disconnect(device as unknown as GObject.Object);
            device.dispose();
        }
        this._devices.clear();

        // Cleanup client connections
        if (this._client) {
            globalSignalRegistry.disconnect(this._client);
        }
    }
}

export const bluetooth = new Bluetooth();
export default bluetooth;
