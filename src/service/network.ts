import NM from 'gi://NM';
import GObject from 'gi://GObject';
import Service from '../service.js';
import type { Disposable } from '../service.js';
import { bulkConnect, globalSignalRegistry } from '../utils.js';
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
    private _apBind!: number;

    #cachedAccessPoints: AccessPointInfo[] = [];
    #apCacheDirty = true;

    constructor(client: NM.Client, device: NM.DeviceWifi) {
        super();
        this._client = client;
        this._device = device;

        const clientId = this._client.connect('notify::wireless-enabled', () =>
            this.changed('enabled'),
        );
        this.trackConnection(clientId);
        globalSignalRegistry.register(this._client, clientId);

        if (this._device) {
            const deviceIds = [
                this._device.connect('notify::active-access-point', this._activeAp.bind(this)),
                this._device.connect('access-point-added', () => {
                    this.#apCacheDirty = true;
                    this.emit('changed');
                }),
                this._device.connect('access-point-removed', () => {
                    this.#apCacheDirty = true;
                    this.emit('changed');
                }),
            ];
            deviceIds.forEach(id => {
                this.trackConnection(id);
                globalSignalRegistry.register(this._device, id);
            });
            this._activeAp();
        }
    }

    /** Triggers an asynchronous Wi-Fi access point scan. */
    readonly scan = () => {
        this._device?.request_scan_async(null, (device, res) => {
            device?.request_scan_finish(res);
            this.emit('changed');
        });
    };

    private _activeAp() {
        if (this._ap && this._apBind) {
            this._ap.disconnect(this._apBind);
            globalSignalRegistry.disconnect(this._ap);
        }

        this._ap = this._device.get_active_access_point();
        if (!this._ap) return;

        this._apBind = this._ap.connect('notify::strength', () => {
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
        this.trackConnection(this._apBind);
        globalSignalRegistry.register(this._ap, this._apBind);
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

    dispose(): void {
        super.dispose();
        if (this._client) {
            globalSignalRegistry.disconnect(this._client);
        }
        if (this._device) {
            globalSignalRegistry.disconnect(this._device);
        }
        if (this._ap && this._apBind) {
            this._ap.disconnect(this._apBind);
            globalSignalRegistry.disconnect(this._ap);
        }
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
            const id = this._device.connect('notify::speed', () => {
                this.emit('changed');
                ['speed', 'internet', 'state', 'icon-name'].forEach(prop => this.notify(prop));
            });
            this.trackConnection(id);
            globalSignalRegistry.register(this._device, id);
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

    dispose(): void {
        super.dispose();
        if (this._device) {
            globalSignalRegistry.disconnect(this._device);
        }
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
    private _stateBind: undefined | number = undefined;
    private _vpnState: ReturnType<typeof _VPN_CONNECTION_STATE> = 'disconnected';
    private _vpnStateBind: undefined | number = undefined;

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
        const id = this._connection.connect('changed', () => this._updateId());
        this.trackConnection(id);
        globalSignalRegistry.register(this._connection, id);
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
        if (this._activeConnection) {
            if (this._stateBind) {
                this._activeConnection.disconnect(this._stateBind);
            }
            if (this._vpnStateBind) {
                this._activeConnection.disconnect(this._vpnStateBind);
            }
            globalSignalRegistry.disconnect(this._activeConnection);
        }

        this._activeConnection = activeConnection;
        if (this._activeConnection) {
            this._stateBind = this._activeConnection.connect('notify::state', () =>
                this._updateState(),
            );
            this.trackConnection(this._stateBind);
            globalSignalRegistry.register(this._activeConnection, this._stateBind);

            this._vpnStateBind = this._activeConnection.connect('notify::vpn-state', () =>
                this._updateVpnState(),
            );
            this.trackConnection(this._vpnStateBind);
            globalSignalRegistry.register(this._activeConnection, this._vpnStateBind);
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

    dispose(): void {
        super.dispose();
        if (this._connection) {
            globalSignalRegistry.disconnect(this._connection);
        }
        if (this._activeConnection) {
            if (this._stateBind) {
                this._activeConnection.disconnect(this._stateBind);
            }
            if (this._vpnStateBind) {
                this._activeConnection.disconnect(this._vpnStateBind);
            }
            globalSignalRegistry.disconnect(this._activeConnection);
        }
    }
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

    constructor(client: NM.Client) {
        super();

        this._client = client;
        this._vpnConnections = new Map();

        bulkConnect(this._client as unknown as GObject.Object, [
            ['connection-added', this._connectionAdded.bind(this)],
            ['connection-removed', this._connectionRemoved.bind(this)],
        ]);

        this._client
            .get_connections()
            .map((connection: NM.RemoteConnection) =>
                this._connectionAdded(this._client, connection),
            );

        const activeAddedId = this._client.connect(
            'active-connection-added',
            (_: NM.Client, ac: NM.ActiveConnection) => {
                const uuid = ac.get_uuid();
                if (uuid && this._vpnConnections.has(uuid))
                    this._vpnConnections
                        .get(uuid)
                        ?.updateActiveConnection(ac as ActiveVpnConnection);
            },
        );
        this.trackConnection(activeAddedId);
        globalSignalRegistry.register(this._client, activeAddedId);

        const activeRemovedId = this._client.connect(
            'active-connection-removed',
            (_: NM.Client, ac: NM.ActiveConnection) => {
                const uuid = ac.get_uuid();
                if (uuid && this._vpnConnections.has(uuid))
                    this._vpnConnections.get(uuid)?.updateActiveConnection(null);
            },
        );
        this.trackConnection(activeRemovedId);
        globalSignalRegistry.register(this._client, activeRemovedId);
    }

    private _connectionAdded(client: NM.Client, connection: NM.RemoteConnection) {
        if (connection.get_connection_type() !== 'vpn' || connection.get_uuid() === null) return;

        const vpnConnection = new VpnConnection(this, connection);
        const activeConnection = client
            .get_active_connections()
            .find((ac: NM.ActiveConnection) => ac.get_uuid() === vpnConnection.uuid);

        if (activeConnection)
            vpnConnection.updateActiveConnection(activeConnection as NM.VpnConnection);

        const changedId = vpnConnection.connect('changed', () => this.emit('changed'));
        this.trackConnection(changedId);
        globalSignalRegistry.register(vpnConnection as unknown as GObject.Object, changedId);

        const stateId = vpnConnection.connect('notify::state', (c: VpnConnection) => {
            if (c.state === 'connected' || c.state === 'disconnected')
                this.changed('activated-connections');
        });
        this.trackConnection(stateId);
        globalSignalRegistry.register(vpnConnection as unknown as GObject.Object, stateId);

        this._vpnConnections.set(vpnConnection.uuid, vpnConnection);

        this.changed('connections');
        this.emit('connection-added', vpnConnection.uuid);
    }

    private _connectionRemoved(_: NM.Client, connection: NM.RemoteConnection) {
        const uuid = connection.get_uuid() || '';
        if (!uuid || !this._vpnConnections.has(uuid)) return;

        this._vpnConnections.get(uuid)!.updateActiveConnection(null);
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
        this._client.activate_connection_async(vpn.connection, null, null, null, null);
    };

    /**
     * Deactivates a VPN connection.
     *
     * @param vpn - The VPN connection to deactivate
     */
    readonly deactivateVpnConnection = (vpn: VpnConnection) => {
        if (vpn.active_connection === null) return;

        this._client.deactivate_connection_async(vpn.active_connection, null, null);
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

    dispose(): void {
        super.dispose();

        // Cleanup all VPN connections
        for (const connection of this._vpnConnections.values()) {
            connection.dispose();
        }
        this._vpnConnections.clear();

        // Cleanup client connections
        if (this._client) {
            globalSignalRegistry.disconnect(this._client as unknown as GObject.Object);
        }
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
        bulkConnect(this._client as unknown as GObject.Object, [
            ['notify::wireless-enabled', this._sync.bind(this)],
            ['notify::connectivity', this._sync.bind(this)],
            ['notify::primary-connection', this._sync.bind(this)],
            ['notify::activating-connection', this._sync.bind(this)],
        ]);

        this.wifi = new Wifi(this._client, this._getDevice(NM.DeviceType.WIFI) as NM.DeviceWifi);

        this.wired = new Wired(this._getDevice(NM.DeviceType.ETHERNET) as NM.DeviceEthernet);

        this.vpn = new Vpn(this._client);

        const wifiId = this.wifi.connect('changed', this._sync.bind(this));
        this.trackConnection(wifiId);
        globalSignalRegistry.register(this.wifi as unknown as GObject.Object, wifiId);

        const wiredId = this.wired.connect('changed', this._sync.bind(this));
        this.trackConnection(wiredId);
        globalSignalRegistry.register(this.wired as unknown as GObject.Object, wiredId);

        const vpnId = this.vpn.connect('changed', () => this.emit('changed'));
        this.trackConnection(vpnId);
        globalSignalRegistry.register(this.vpn as unknown as GObject.Object, vpnId);

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

    dispose(): void {
        super.dispose();

        // Cleanup sub-services
        if (this.wifi) {
            this.wifi.dispose();
        }
        if (this.wired) {
            this.wired.dispose();
        }
        if (this.vpn) {
            this.vpn.dispose();
        }

        // Cleanup client connections
        if (this._client) {
            globalSignalRegistry.disconnect(this._client as unknown as GObject.Object);
        }
    }
}

const network = new Network();
export default network;
