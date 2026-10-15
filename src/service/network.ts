import NM from 'gi://NM';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Service from '../service.js';
import type { Disposable } from '../service.js';
import type { ChildScope } from '../internal/resource-scope.js';
import { AgsServiceError } from '../utils/errors.js';

const _INTERNET = (device: NM.Device) => {
    switch (device?.active_connection?.state) {
        case NM.ActiveConnectionState.ACTIVATED:
            return 'connected';
        case NM.ActiveConnectionState.ACTIVATING:
            return 'connecting';
        case NM.ActiveConnectionState.DEACTIVATING:
        case NM.ActiveConnectionState.DEACTIVATED:
        default:
            return 'disconnected';
    }
};

const _DEVICE_STATE = (device: NM.Device) => {
    switch (device?.state) {
        case NM.DeviceState.UNMANAGED:
            return 'unmanaged';
        case NM.DeviceState.UNAVAILABLE:
            return 'unavailable';
        case NM.DeviceState.DISCONNECTED:
            return 'disconnected';
        case NM.DeviceState.PREPARE:
            return 'prepare';
        case NM.DeviceState.CONFIG:
            return 'config';
        case NM.DeviceState.NEED_AUTH:
            return 'need_auth';
        case NM.DeviceState.IP_CONFIG:
            return 'ip_config';
        case NM.DeviceState.IP_CHECK:
            return 'ip_check';
        case NM.DeviceState.SECONDARIES:
            return 'secondaries';
        case NM.DeviceState.ACTIVATED:
            return 'activated';
        case NM.DeviceState.DEACTIVATING:
            return 'deactivating';
        case NM.DeviceState.FAILED:
            return 'failed';
        default:
            return 'unknown';
    }
};

const _CONNECTIVITY_STATE = (client: NM.Client) => {
    switch (client.connectivity) {
        case NM.ConnectivityState.NONE:
            return 'none';
        case NM.ConnectivityState.PORTAL:
            return 'portal';
        case NM.ConnectivityState.LIMITED:
            return 'limited';
        case NM.ConnectivityState.FULL:
            return 'full';
        default:
            return 'unknown';
    }
};

const _CONNECTION_STATE = (activeConnection: NM.ActiveConnection | null) => {
    switch (activeConnection?.get_state()) {
        case NM.ActiveConnectionState.ACTIVATED:
            return 'connected';
        case NM.ActiveConnectionState.ACTIVATING:
            return 'connecting';
        case NM.ActiveConnectionState.DEACTIVATING:
            return 'disconnecting';
        case NM.ActiveConnectionState.DEACTIVATED:
        default:
            return 'disconnected';
    }
};

const _VPN_CONNECTION_STATE = (activeVpnConnection: ActiveVpnConnection) => {
    switch (activeVpnConnection?.get_vpn_state()) {
        case NM.VpnConnectionState.UNKNOWN:
            return 'unknown';
        case NM.VpnConnectionState.PREPARE:
            return 'prepare';
        case NM.VpnConnectionState.NEED_AUTH:
            return 'needs_auth';
        case NM.VpnConnectionState.CONNECT:
            return 'connect';
        case NM.VpnConnectionState.IP_CONFIG_GET:
            return 'ip_config';
        case NM.VpnConnectionState.ACTIVATED:
            return 'activated';
        case NM.VpnConnectionState.FAILED:
            return 'failed';
        case NM.VpnConnectionState.DISCONNECTED:
        default:
            return 'disconnected';
    }
};

const _STRENGTH_ICONS = [
    { value: 80, icon: 'network-wireless-signal-excellent-symbolic' },
    { value: 60, icon: 'network-wireless-signal-good-symbolic' },
    { value: 40, icon: 'network-wireless-signal-ok-symbolic' },
    { value: 20, icon: 'network-wireless-signal-weak-symbolic' },
    { value: 0, icon: 'network-wireless-signal-none-symbolic' },
];

const DEVICE = (device: string) => {
    switch (device) {
        case '802-11-wireless':
            return 'wifi';
        case '802-3-ethernet':
            return 'wired';
        default:
            return null;
    }
};

interface AccessPointInfo {
    bssid: string | null;
    address: string | null;
    lastSeen: number;
    ssid: string;
    active: boolean;
    strength: number;
    frequency: number;
    iconName: string | undefined;
}

/** Service representing a Wi-Fi device, its access points, and connection state. */
/**
 * WiFi Service
 *
 * Manages WiFi device state and access points.
 *
 * @property {boolean} enabled - Whether WiFi is enabled
 * @property {string} internet - Connection state
 * @property {string} ssid - Currently connected SSID
 * @property {number} strength - Signal strength (0-100)
 *
 * @fires changed - Emitted when WiFi state changes
 */
export class Wifi extends Service implements Disposable {
    static {
        Service.register(
            this,
            {},
            {
                enabled: ['boolean', 'rw'],
                internet: ['boolean'],
                strength: ['int'],
                frequency: ['int'],
                'access-points': ['jsobject'],
                ssid: ['string'],
                state: ['string'],
                'icon-name': ['string'],
            },
        );
    }

    private _client: NM.Client;
    private _device: NM.DeviceWifi;
    private _ap!: NM.AccessPoint;
    private _apScope?: ChildScope;
    private _cancellable = new Gio.Cancellable();

    #cachedAccessPoints: AccessPointInfo[] = [];
    #apCacheDirty = true;

    constructor(client: NM.Client, device: NM.DeviceWifi) {
        super();
        this._client = client;
        this._device = device;

        this.resources.add(() => this._cancellable.cancel());
        this.resources.connect(this._client, 'notify::wireless-enabled', () =>
            this.changed('enabled'),
        );

        if (this._device) {
            this.resources.connect(this._device, 'notify::active-access-point', () =>
                this._activeAp(),
            );
            this.resources.connect(this._device, 'access-point-added', () => {
                this.#apCacheDirty = true;
                this.emit('changed');
            });
            this.resources.connect(this._device, 'access-point-removed', () => {
                this.#apCacheDirty = true;
                this.emit('changed');
            });
            this._activeAp();
        }
    }

    /** Triggers an asynchronous Wi-Fi access point scan. */
    readonly scan = () => {
        if (this.isDisposed) return;
        this._device?.request_scan_async(this._cancellable, (device, res) => {
            try {
                device?.request_scan_finish(res);
                if (!this.isDisposed) this.emit('changed');
            } catch (error) {
                if (!this._cancellable.is_cancelled()) throw error;
            }
        });
    };

    private _activeAp() {
        this._apScope?.release();
        this._apScope = undefined;
        if (this.isDisposed) return;

        this._ap = this._device.get_active_access_point();
        if (!this._ap) return;

        const child = this.resources.child();
        this._apScope = child;
        child.scope.connect(this._ap, 'notify::strength', () => {
            this.#apCacheDirty = true;
            this.emit('changed');
            const props = [
                'enabled',
                'internet',
                'strength',
                'frequency',
                'access-points',
                'ssid',
                'state',
                'icon-name',
            ];
            props.forEach(prop => this.notify(prop));
        });
    }

    /** List of visible access points with their SSID, strength, frequency, and status. */
    get access_points() {
        if (this.#apCacheDirty) {
            this.#cachedAccessPoints = this._device.get_access_points().map(ap => ({
                bssid: ap.bssid,
                address: ap.hw_address,
                lastSeen: ap.last_seen,
                ssid: ap.ssid
                    ? NM.utils_ssid_to_utf8(ap.ssid.get_data() || new Uint8Array())
                    : 'Unknown',
                active: ap === this._ap,
                strength: ap.strength,
                frequency: ap.frequency,
                iconName: _STRENGTH_ICONS.find(({ value }) => value <= ap.strength)?.icon,
            }));
            this.#apCacheDirty = false;
        }
        return this.#cachedAccessPoints;
    }

    /** Whether Wi-Fi is enabled on the adapter. */
    get enabled() {
        return this._client.wireless_enabled;
    }

    set enabled(v) {
        this._client.wireless_enabled = v;
    }

    /** Signal strength of the active access point (0-100, or -1 if none). */
    get strength() {
        return this._ap?.strength || -1;
    }

    /** Frequency in MHz of the active access point (-1 if none). */
    get frequency() {
        return this._ap?.frequency || -1;
    }

    /** Internet connectivity state: "connected", "connecting", or "disconnected". */
    get internet() {
        return _INTERNET(this._device);
    }

    /** SSID of the active access point (empty string if none). */
    get ssid() {
        if (!this._ap) return '';
        const ssidData = this._ap.get_ssid();
        if (!ssidData) return 'Unknown';
        const ssid = ssidData.get_data();
        if (!ssid) return 'Unknown';
        return NM.utils_ssid_to_utf8(ssid);
    }

    /** NM device state string (e.g. "activated", "disconnected"). */
    get state() {
        return _DEVICE_STATE(this._device);
    }

    /** Symbolic icon name reflecting Wi-Fi state and signal strength. */
    get icon_name() {
        const iconNames: [number, string][] = [
            [80, 'excellent'],
            [60, 'good'],
            [40, 'ok'],
            [20, 'weak'],
            [0, 'none'],
        ];

        // Check if wifi is enabled first, since internet might be provided by
        // a wired network.
        if (!this.enabled) return 'network-wireless-offline-symbolic';

        if (this.internet === 'connected') {
            for (const [threshold, name] of iconNames) {
                if (this.strength >= threshold) return `network-wireless-signal-${name}-symbolic`;
            }
        }

        if (this.internet === 'connecting') return 'network-wireless-acquiring-symbolic';

        return 'network-wireless-disabled-symbolic';
    }

}

/**
 * Wired Ethernet Service
 *
 * Manages wired Ethernet device state and connectivity.
 *
 * Lifecycle:
 * 1. Construction - Connect to NetworkManager device
 * 2. Ready - Monitor link speed and state changes
 * 3. Disposal - Cleanup signal connections
 *
 * @property {number} speed - Link speed in Mbit/s
 * @property {string} internet - Connection state
 * @property {string} state - Device state
 * @property {string} icon_name - Icon name based on state
 *
 * @fires changed - Emitted when device state changes
 */
export class Wired extends Service implements Disposable {
    static {
        Service.register(
            this,
            {},
            {
                speed: ['int'],
                internet: ['string'],
                state: ['string'],
                'icon-name': ['string'],
            },
        );
    }

    private _device: NM.DeviceEthernet;

    constructor(device: NM.DeviceEthernet) {
        super();
        this._device = device;

        if (this._device) {
            this.resources.connect(this._device, 'notify::speed', () => {
                this.emit('changed');
                ['speed', 'internet', 'state', 'icon-name'].forEach(prop => this.notify(prop));
            });
        }
    }

    /** Current link speed in Mbit/s. */
    get speed() {
        return this._device.get_speed();
    }

    /** Internet connectivity state: "connected", "connecting", or "disconnected". */
    get internet() {
        return _INTERNET(this._device);
    }

    /** NM device state string (e.g. "activated", "disconnected"). */
    get state() {
        return _DEVICE_STATE(this._device);
    }

    /** Symbolic icon name reflecting wired connection state. */
    get icon_name() {
        if (this.internet === 'connecting') return 'network-wired-acquiring-symbolic';

        if (this.internet === 'connected') return 'network-wired-symbolic';

        if (network.connectivity !== 'full') return 'network-wired-no-route-symbolic';

        return 'network-wired-disconnected-symbolic';
    }

}

/** A nullable NM.VpnConnection alias. */
export type ActiveVpnConnection = null | NM.VpnConnection;

/**
 * VPN Connection Service
 *
 * Represents a single VPN connection profile and its active connection state.
 *
 * Lifecycle:
 * 1. Construction - Bind to NM.Connection profile
 * 2. Active - Monitor connection and VPN state changes
 * 3. Disposal - Cleanup signal connections
 *
 * @property {string} id - Display name of the VPN connection
 * @property {string} state - Connection state
 * @property {string} vpn_state - VPN-specific state
 * @property {string} icon_name - Icon name based on state
 *
 * @fires changed - Emitted when VPN state changes
 */
export class VpnConnection extends Service implements Disposable {
    static {
        Service.register(
            this,
            {},
            {
                id: ['string'],
                state: ['string'],
                'vpn-state': ['string'],
                'icon-name': ['string'],
            },
        );
    }

    private _vpn!: Vpn;
    private _connection!: NM.Connection;
    private _id!: string;
    private _activeConnection: ActiveVpnConnection = null;
    private _state: ReturnType<typeof _CONNECTION_STATE> = 'disconnected';
    private _activeScope?: ChildScope;
    private _vpnState: ReturnType<typeof _VPN_CONNECTION_STATE> = 'disconnected';

    /** The underlying NM.Connection profile. */
    get connection() {
        return this._connection;
    }

    /** The currently active VPN connection, or null. */
    get active_connection() {
        return this._activeConnection;
    }

    /** UUID of the connection profile. */
    get uuid() {
        return this._connection.get_uuid()!;
    }

    /** Display name of the VPN connection. */
    get id() {
        return this._connection.get_id() || '';
    }

    /** Connection state: "connected", "connecting", "disconnecting", or "disconnected". */
    get state() {
        return this._state;
    }

    /** VPN-specific state string. */
    get vpn_state() {
        return this._vpnState;
    }

    /** Symbolic icon name reflecting VPN connection state. */
    get icon_name() {
        switch (this._state) {
            case 'connected':
                return 'network-vpn-symbolic';
            case 'disconnected':
                return 'network-vpn-disabled-symbolic';
            case 'connecting':
            case 'disconnecting':
                return 'network-vpn-acquiring-symbolic';
            default:
                return '';
        }
    }

    constructor(vpn: Vpn, connection: NM.RemoteConnection) {
        super();

        this._vpn = vpn;
        this._connection = connection;

        this._id = this._connection.get_id() || '';
        this.resources.connect(this._connection, 'changed', () => this._updateId());
    }

    private _updateId() {
        const id = this._connection.get_id() || '';
        if (id !== this._id) {
            this._id = id;
            this.changed('id');
        }
    }

    private _updateState() {
        const state = _CONNECTION_STATE(this._activeConnection);
        if (state !== this._state) {
            this._state = state;
            this.notify('state');
            this.notify('icon-name');
            this.emit('changed');
        }
    }

    private _updateVpnState() {
        const vpnState = _VPN_CONNECTION_STATE(this._activeConnection);
        if (vpnState !== this._vpnState) {
            this._vpnState = vpnState;
            this.changed('vpn-state');
        }
    }

    /**
     * Binds this VPN connection to an active connection and tracks its state changes.
     *
     * @param activeConnection - The active VPN connection, or null to unbind
     */
    readonly updateActiveConnection = (activeConnection: ActiveVpnConnection) => {
        this._activeScope?.release();
        this._activeScope = undefined;
        if (this.isDisposed) return;

        this._activeConnection = activeConnection;
        if (this._activeConnection) {
            const child = this.resources.child();
            this._activeScope = child;
            child.scope.connect(this._activeConnection, 'notify::state', () => this._updateState());
            child.scope.connect(this._activeConnection, 'notify::vpn-state', () =>
                this._updateVpnState(),
            );
        }

        this._updateState();
        this._updateVpnState();
    };

    /**
     * Activates or deactivates this VPN connection.
     *
     * @param connect - True to connect, false to disconnect
     */
    readonly setConnection = (connect: boolean) => {
        if (connect) {
            if (this._state === 'disconnected') this._vpn.activateVpnConnection(this);
        } else {
            if (this._state === 'connected') this._vpn.deactivateVpnConnection(this);
        }
    };

}

/**
 * VPN Manager Service
 *
 * Manages all VPN connection profiles and their active states.
 *
 * Lifecycle:
 * 1. Construction - Connect to NetworkManager client
 * 2. Initialization - Enumerate VPN connections
 * 3. Ready - Monitor VPN additions, removals, state changes
 * 4. Disposal - Cleanup all VPN connections and signals
 *
 * @property {VpnConnection[]} connections - All VPN connection profiles
 * @property {VpnConnection[]} activated_vpnConnections - Currently active VPNs
 *
 * @fires connection-added - Emitted when VPN connection added
 * @fires connection-removed - Emitted when VPN connection removed
 * @fires changed - Emitted when VPN state changes
 */
export class Vpn extends Service implements Disposable {
    static {
        Service.register(
            this,
            {
                'connection-added': ['string'],
                'connection-removed': ['string'],
            },
            {
                connections: ['jsobject'],
                'activated-connections': ['jsobject'],
            },
        );
    }

    private _client: NM.Client;
    private _vpnConnections: Map<string, VpnConnection>;
    private _connectionScopes = new Map<string, ChildScope>();
    private _cancellable = new Gio.Cancellable();

    constructor(client: NM.Client) {
        super();

        this._client = client;
        this._vpnConnections = new Map();

        this.resources.add(() => this._cancellable.cancel());
        this.resources.add(() => {
            this._vpnConnections.clear();
            this._connectionScopes.clear();
        });
        this.resources.connect(this._client, 'connection-added', (_client, connection) =>
            this._connectionAdded(this._client, connection as NM.RemoteConnection),
        );
        this.resources.connect(this._client, 'connection-removed', (_client, connection) =>
            this._connectionRemoved(this._client, connection as NM.RemoteConnection),
        );

        this._client
            .get_connections()
            .map((connection: NM.RemoteConnection) =>
                this._connectionAdded(this._client, connection),
            );

        this.resources.connect(this._client, 'active-connection-added', (_client, connection) => {
            const ac = connection as NM.ActiveConnection;
            const uuid = ac.get_uuid();
            if (uuid && this._vpnConnections.has(uuid))
                this._vpnConnections.get(uuid)?.updateActiveConnection(ac as ActiveVpnConnection);
        });

        this.resources.connect(this._client, 'active-connection-removed', (_client, connection) => {
            const ac = connection as NM.ActiveConnection;
            const uuid = ac.get_uuid();
            if (uuid && this._vpnConnections.has(uuid))
                this._vpnConnections.get(uuid)?.updateActiveConnection(null);
        });
    }

    private _connectionAdded(client: NM.Client, connection: NM.RemoteConnection) {
        if (this.isDisposed) return;
        if (connection.get_connection_type() !== 'vpn' || connection.get_uuid() === null) return;

        const uuid = connection.get_uuid()!;
        this._connectionScopes.get(uuid)?.release();
        const child = this.resources.child();
        this._connectionScopes.set(uuid, child);
        const vpnConnection = new VpnConnection(this, connection);
        child.scope.add(() => vpnConnection.dispose());
        const activeConnection = client
            .get_active_connections()
            .find((ac: NM.ActiveConnection) => ac.get_uuid() === vpnConnection.uuid);

        if (activeConnection)
            vpnConnection.updateActiveConnection(activeConnection as NM.VpnConnection);

        const emitter = vpnConnection as unknown as GObject.Object;
        child.scope.connect(emitter, 'changed', () => this.emit('changed'));
        child.scope.connect(emitter, 'notify::state', () => {
            if (vpnConnection.state === 'connected' || vpnConnection.state === 'disconnected')
                this.changed('activated-connections');
        });

        this._vpnConnections.set(vpnConnection.uuid, vpnConnection);

        this.changed('connections');
        this.emit('connection-added', vpnConnection.uuid);
    }

    private _connectionRemoved(_: NM.Client, connection: NM.RemoteConnection) {
        const uuid = connection.get_uuid() || '';
        if (!uuid || !this._vpnConnections.has(uuid)) return;

        this._vpnConnections.get(uuid)!.updateActiveConnection(null);
        this._connectionScopes.get(uuid)?.release();
        this._connectionScopes.delete(uuid);
        this._vpnConnections.delete(uuid);

        this.notify('connections');
        this.notify('activated-connections');
        this.emit('changed');
        this.emit('connection-removed', uuid);
    }

    /**
     * Activates a VPN connection profile.
     *
     * @param vpn - The VPN connection to activate
     */
    readonly activateVpnConnection = (vpn: VpnConnection) => {
        if (this.isDisposed || vpn.isDisposed) return;
        this._client.activate_connection_async(vpn.connection, null, null, this._cancellable, null);
    };

    /**
     * Deactivates a VPN connection.
     *
     * @param vpn - The VPN connection to deactivate
     */
    readonly deactivateVpnConnection = (vpn: VpnConnection) => {
        if (this.isDisposed || vpn.isDisposed || vpn.active_connection === null) return;

        this._client.deactivate_connection_async(vpn.active_connection, this._cancellable, null);
    };

    /**
     * Looks up a VPN connection by UUID.
     *
     * @param uuid - The connection UUID
     * @returns The VpnConnection or undefined
     */
    readonly getConnection = (uuid: string) => this._vpnConnections.get(uuid);

    /** All known VPN connection profiles. */
    get connections() {
        return Array.from(this._vpnConnections.values());
    }

    /** VPN connections that are currently active/connected. */
    get activated_connections() {
        const list: VpnConnection[] = [];
        for (const [, connection] of this._vpnConnections) {
            if (connection.state === 'connected') list.push(connection);
        }
        return list;
    }

}

/**
 * Network Manager Service
 *
 * Top-level NetworkManager service providing Wi-Fi, wired, and VPN sub-services.
 *
 * Lifecycle:
 * 1. Construction - Initialize NetworkManager client
 * 2. Client Ready - Create wifi, wired, vpn sub-services
 * 3. Ready - Monitor connectivity and primary connection changes
 * 4. Disposal - Cleanup all sub-services and client connections
 *
 * @property {Wifi} wifi - Wi-Fi sub-service
 * @property {Wired} wired - Wired Ethernet sub-service
 * @property {Vpn} vpn - VPN sub-service
 * @property {'wifi'|'wired'|null} primary - Primary connection type
 * @property {string} connectivity - Overall connectivity state
 *
 * @fires changed - Emitted when network state changes
 */
export class Network extends Service implements Disposable {
    static {
        Service.register(
            this,
            {},
            {
                wifi: ['jsobject'],
                wired: ['jsobject'],
                primary: ['string'],
                connectivity: ['string'],
                vpn: ['jsobject'],
            },
        );
    }

    private _client!: NM.Client;

    /** The Wi-Fi sub-service. */
    wifi!: Wifi;
    /** The wired Ethernet sub-service. */
    wired!: Wired;
    /** The primary connection type: "wifi", "wired", or null. */
    primary: null | 'wifi' | 'wired' = null;
    /** Overall connectivity state: "none", "portal", "limited", "full", or "unknown". */
    connectivity!: string;
    /** The VPN sub-service. */
    vpn!: Vpn;

    constructor() {
        super();
        try {
            this._client = new NM.Client();
            this._client.init(null);
            this._clientReady();
        } catch (e) {
            logError(e);
        }
    }

    /** Toggles Wi-Fi enabled state. */
    readonly toggleWifi = () => {
        this._client.wireless_enabled = !this._client.wireless_enabled;
    };

    private _getDevice(devType: NM.DeviceType) {
        const valid_devices = this._client
            .get_devices()
            .filter(device => device.get_device_type() === devType);

        return valid_devices.find(d => d.active_connection !== null) || valid_devices.at(0);
    }

    private _clientReady() {
        for (const signal of [
            'notify::wireless-enabled',
            'notify::connectivity',
            'notify::primary-connection',
            'notify::activating-connection',
        ]) this.resources.connect(this._client, signal, () => this._sync());

        this.wifi = new Wifi(this._client, this._getDevice(NM.DeviceType.WIFI) as NM.DeviceWifi);
        const wifi = this.wifi;
        this.resources.add(() => wifi.dispose());

        this.wired = new Wired(this._getDevice(NM.DeviceType.ETHERNET) as NM.DeviceEthernet);
        const wired = this.wired;
        this.resources.add(() => wired.dispose());

        this.vpn = new Vpn(this._client);
        const vpn = this.vpn;
        this.resources.add(() => vpn.dispose());

        this.resources.connect(wifi as unknown as GObject.Object, 'changed', () => this._sync());
        this.resources.connect(wired as unknown as GObject.Object, 'changed', () => this._sync());
        this.resources.connect(vpn as unknown as GObject.Object, 'changed', () => this.emit('changed'));

        this._sync();
    }

    private _sync() {
        const mainConnection =
            this._client.get_primary_connection() || this._client.get_activating_connection();

        this.primary = DEVICE(mainConnection?.type || '');
        this.connectivity = _CONNECTIVITY_STATE(this._client);

        this.notify('primary');
        this.notify('connectivity');
        this.emit('changed');
    }

}

const network = new Network();
export default network;
