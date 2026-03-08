import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Service from '../service.js';
import type { Disposable } from '../service.js';
import { CACHE_DIR, ensureDirectory, readFile, writeFile, globalSignalRegistry } from '../utils.js';

// Use GioUnix.DesktopAppInfo to avoid deprecation warning
// @ts-expect-error GioUnix types not available in @girs yet
import GioUnix from 'gi://GioUnix?version=2.0';
type DesktopAppInfo = GioUnix.DesktopAppInfo;

const APPS_CACHE_DIR = `${CACHE_DIR}/apps`;
const CACHE_FILE = APPS_CACHE_DIR + '/apps_frequency.json';

/**
 * Application
 *
 * Represents a single desktop application entry with launch frequency tracking.
 *
 * @property {DesktopAppInfo} app - Underlying desktop app info
 * @property {number} frequency - Launch count
 * @property {string} name - Display name
 * @property {string} desktop - Desktop file ID
 * @property {string} description - Application description
 * @property {string} wm_class - WM_CLASS hint
 * @property {string} executable - Executable command
 * @property {string} icon_name - Icon name
 *
 * @fires changed - Emitted when application properties change
 */
export class Application extends Service implements Disposable {
    static {
        Service.register(
            this,
            {},
            {
                app: ['jsobject'],
                frequency: ['int'],
                name: ['string'],
                desktop: ['jsobject'],
                description: ['jsobject'],
                'wm-class': ['jsobject'],
                executable: ['string'],
                'icon-name': ['string'],
            },
        );
    }

    private _app: DesktopAppInfo;
    private _frequency: number;

    /** The underlying DesktopAppInfo instance. */
    get app() {
        return this._app;
    }

    /** How many times this application has been launched. */
    get frequency() {
        return this._frequency;
    }

    set frequency(value) {
        this._frequency = value;
        this.changed('frequency');
    }

    /** The display name of the application. */
    get name() {
        return this._app.get_name();
    }

    /** The desktop file ID (e.g. "org.gnome.Calculator.desktop"). */
    get desktop() {
        return this._app.get_id();
    }

    /** A short human-readable description of the application. */
    get description() {
        return this._app.get_description();
    }

    /** The WM_CLASS hint used for window matching. */
    get wm_class() {
        return this._app.get_startup_wm_class();
    }

    /** The executable command from the desktop entry. */
    get executable() {
        return this._app.get_string('Exec') || this._app.get_executable();
    }

    /** The icon name from the desktop entry. */
    get icon_name() {
        return this._app.get_string('Icon');
    }

    constructor(app: DesktopAppInfo, frequency?: number) {
        super();
        this._app = app;
        this._frequency = frequency || 0;
    }

    private _match(prop: string | null, search: string) {
        if (!prop) return false;

        if (!search) return true;

        return prop?.toLowerCase().includes(search.toLowerCase());
    }

    /**
     * Retrieves a string value from the desktop entry by key.
     *
     * @param key - The desktop entry key to look up
     * @returns The string value or null
     */
    readonly getKey = (key: string) => {
        return this._app.get_string(key);
    };

    /**
     * Tests whether the application matches the given search term.
     *
     * @param term - Case-insensitive search string matched against
     *   name, desktop, executable, and description
     * @returns True if any field contains the search term
     */
    readonly match = (term: string) => {
        const { name, desktop, description, executable } = this;
        return (
            this._match(name, term) ||
            this._match(desktop, term) ||
            this._match(executable, term) ||
            this._match(description, term)
        );
    };

    /** Launches the application and increments its frequency counter. */
    readonly launch = () => {
        this.app.launch([], null);
        this.frequency++;
    };

    dispose(): void {
        super.dispose();
        // No signal connections to clean up
    }
}

/**
 * Applications Service
 *
 * Service that manages all visible desktop applications and tracks launch frequency.
 *
 * Lifecycle:
 * 1. Construction - Connect to AppInfoMonitor, load frequency cache
 * 2. Ready - Monitor application additions, removals, changes
 * 3. Disposal - Cleanup all application bindings and monitor connection
 *
 * @property {Application[]} list - All visible desktop applications
 * @property {{[app: string]: number}} frequents - Map of desktop IDs to launch counts
 *
 * @fires changed - Emitted when application list or frequency changes
 */
export class Applications extends Service implements Disposable {
    static {
        Service.register(
            this,
            {},
            {
                list: ['jsobject'],
                frequents: ['jsobject'],
            },
        );
    }

    private _list!: Application[];
    private _frequents: { [app: string]: number };
    private _frequencyBindings: Array<{ app: Application; id: number }> = [];
    private _monitor: Gio.AppInfoMonitor;

    /**
     * Filters and sorts applications by a search term, ordered by launch frequency.
     *
     * @param term - Case-insensitive search string
     * @returns Matching applications sorted by frequency (most used first)
     */
    readonly query = (term: string) => {
        return this._list.filter(app => app.match(term)).sort((a, b) => b.frequency - a.frequency);
    };

    constructor() {
        super();
        this._monitor = Gio.AppInfoMonitor.get();
        const monitorId = this._monitor.connect('changed', this.reload.bind(this));
        globalSignalRegistry.register(this._monitor as unknown as GObject.Object, monitorId);

        try {
            this._frequents = JSON.parse(readFile(CACHE_FILE)) as { [app: string]: number };
        } catch (_) {
            this._frequents = {};
        }

        this.reload();
    }

    /** All visible desktop applications. */
    get list() {
        return this._list;
    }

    /** Map of desktop IDs to their launch counts. */
    get frequents() {
        return this._frequents;
    }

    private _launched(id: string | null) {
        if (!id) return;

        typeof this._frequents[id] === 'number'
            ? (this._frequents[id] += 1)
            : (this._frequents[id] = 1);

        ensureDirectory(APPS_CACHE_DIR);
        const json = JSON.stringify(this._frequents, null, 2);
        writeFile(json, CACHE_FILE).catch(err => console.error(err));
        this.changed('frequents');
    }

    /** Reloads the application list from the system and restores frequency data. */
    readonly reload = () => {
        // Disconnect old app bindings
        for (const { app, id } of this._frequencyBindings) {
            app.disconnect(id);
            globalSignalRegistry.disconnect(app as unknown as GObject.Object);
        }
        this._frequencyBindings = [];

        this._list = Gio.AppInfo.get_all()
            .filter(app => app.should_show())
            .map(app => GioUnix.DesktopAppInfo.new(app.get_id() || ''))
            .filter(app => app)
            .map(app => new Application(app, this.frequents[app.get_id() || '']));

        this._list.forEach(app => {
            const id = app.connect('notify::frequency', () => {
                this._launched(app.desktop);
            });
            globalSignalRegistry.register(app as unknown as GObject.Object, id);
            this._frequencyBindings.push({ app, id });
        });

        this.changed('list');
    };

    dispose(): void {
        // Cleanup app frequency bindings
        for (const { app, id } of this._frequencyBindings) {
            app.disconnect(id);
            globalSignalRegistry.disconnect(app as unknown as GObject.Object);
            app.dispose();
        }
        this._frequencyBindings = [];

        // Cleanup monitor connection
        if (this._monitor) {
            globalSignalRegistry.disconnect(this._monitor as unknown as GObject.Object);
        }

        super.dispose();
    }
}

export const applications = new Applications();
export default applications;
