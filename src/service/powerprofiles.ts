import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Service from '../service.js';
import { loadInterfaceXML } from '../utils.js';
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

/** Service for managing system power profiles via the net.hadess.PowerProfiles D-Bus interface. */
class PowerProfiles extends Service {
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

            this._proxy.connect('g-properties-changed', (_, changed) => {
                for (const prop of Object.keys(changed.deepUnpack() as {})) {
                    this.notify(kebabify(prop));
                    if (prop === 'ActiveProfile') this.notify('icon-name');
                }

                this.emit('changed');
            });

            connectSignal(this._proxy, 'ProfileReleased', (_p: any, _n: any, [cookie]: any) => {
                this.emit('profile-released', cookie);
            });
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
}

const service = new PowerProfiles();
export default service;
