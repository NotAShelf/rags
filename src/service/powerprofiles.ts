import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Service from '../service.js';
import type { Disposable } from '../service.js';
import { loadInterfaceXML, globalSignalRegistry } from '../utils.js';
import { PowerProfilesProxy, connectSignal } from '../dbus/types.js';
import { kebabify } from '../utils/gobject.js';
import { isRunning } from '../utils/init.js';

const BUSNAME = 'net.hadess.PowerProfiles';
const PowerProfilesIFace = loadInterfaceXML(BUSNAME)!;
const PowerProfilesProxy = Gio.DBusProxy.makeProxyWrapper(
    PowerProfilesIFace,
) as unknown as PowerProfilesProxy;

const DummyProxy = {
    ActiveProfile: '',
    PerformanceInhibited: '',
    PerformanceDegraded: '',
    Profiles: [],
    Actions: [],
    ActiveProfileHolds: [],
    HoldProfile: () => 0,
    ReleaseProfile: () => null,
} as unknown as PowerProfilesProxy;

/**
 * Power Profiles Service
 *
 * Service for managing system power profiles via the net.hadess.PowerProfiles D-Bus interface.
 *
 * Lifecycle:
 * 1. Construction - Connect to PowerProfiles D-Bus service
 * 2. Ready - Monitor active profile and performance state
 * 3. Disposal - Disconnect proxy and cleanup
 *
 * @property {string} active_profile - Currently active profile
 * @property {string} performance_inhibited - Reason performance is inhibited
 * @property {string} performance_degraded - Reason performance is degraded
 * @property {object[]} profiles - Available power profiles
 * @property {string[]} actions - Available actions
 * @property {object[]} active_profile_holds - Currently held profile holds
 * @property {string} icon_name - Icon name for current profile
 *
 * @fires profile-released - Emitted when profile hold is released (cookie: number)
 * @fires changed - Emitted when power profile state changes
 */
class PowerProfiles extends Service implements Disposable {
    static {
        Service.register(
            this,
            {
                'profile-released': ['int'],
            },
            {
                'active-profile': ['string', 'rw'],
                'performance-inhibited': ['string', 'r'],
                'performance-degraded': ['string', 'r'],
                profiles: ['jsobject', 'r'],
                actions: ['jsobject', 'r'],
                'active-profile-holds': ['jsobject', 'r'],
                'icon-name': ['string', 'r'],
            },
        );
    }

    private _proxy = DummyProxy;
    private _unpackDict(dict: { [prop: string]: GLib.Variant }) {
        const data: { [key: string]: string } = {};
        for (const [key, variant] of Object.entries(dict)) data[key] = variant.unpack() as string;

        return data;
    }

    constructor() {
        super();

        if (isRunning(BUSNAME, 'system')) {
            this._proxy = new PowerProfilesProxy(
                Gio.DBus.system,
                'net.hadess.PowerProfiles',
                '/net/hadess/PowerProfiles',
            );

            const propertiesId = this._proxy.connect('g-properties-changed', (_, changed) => {
                for (const prop of Object.keys(changed.deepUnpack() as {})) {
                    this.notify(kebabify(prop));
                    if (prop === 'ActiveProfile') this.notify('icon-name');
                }

                this.emit('changed');
            });
            this.trackConnection(propertiesId);
            globalSignalRegistry.register(this._proxy as unknown as GObject.Object, propertiesId);

            const signalId = connectSignal(
                this._proxy,
                'ProfileReleased',
                (_p: any, _n: any, [cookie]: any) => {
                    this.emit('profile-released', cookie);
                },
            );
            this.trackConnection(signalId);
            globalSignalRegistry.register(this._proxy as unknown as GObject.Object, signalId);
        } else {
            console.error(`${BUSNAME} is not available`);
        }
    }

    /** The currently active power profile (e.g. "balanced", "performance", "power-saver"). */
    get active_profile() {
        return this._proxy.ActiveProfile;
    }

    /** Sets the active power profile. */
    set active_profile(profile: string) {
        this._proxy.ActiveProfile = profile;
    }

    /** Reason performance profile is inhibited, or empty string. */
    get performance_inhibited() {
        return this._proxy.PerformanceInhibited;
    }

    /** Reason performance is degraded, or empty string. */
    get performance_degraded() {
        return this._proxy.PerformanceDegraded;
    }

    /** List of available power profiles. */
    get profiles() {
        return this._proxy.Profiles.map(this._unpackDict);
    }

    /** Available power profile actions. */
    get actions() {
        return this._proxy.Actions;
    }

    /** List of currently held profile holds. */
    get active_profile_holds() {
        return this._proxy.ActiveProfileHolds.map(this._unpackDict);
    }

    /** Symbolic icon name for the current power profile. */
    get icon_name() {
        return `power-profile-${this.active_profile}-symbolic`;
    }

    dispose(): void {
        super.dispose();

        // Cleanup proxy connections
        if (this._proxy && this._proxy !== DummyProxy) {
            globalSignalRegistry.disconnect(this._proxy as unknown as GObject.Object);
        }
    }
}

const service = new PowerProfiles();
export default service;
