import Gtk from 'gi://Gtk?version=3.0';
import Gdk from 'gi://Gdk?version=3.0';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Service from './service.js';
import Variable from './variable.js';
import Widget from './widget.js';
import Utils from './utils.js';
import { timeout, readFileAsync } from './utils.js';
import { loadInterfaceXML } from './utils.js';
import { AgsConfigError } from './utils/errors.js';

/** @internal */
function deprecated(config: Config) {
    console.warn(
        'passing the config object with default export is DEPRECATED. ' +
            'use App.config() instead',
    );

    const warning = (from: string, to: string) =>
        console.warn(`${from} config option has been removed: use ${to} instead`);

    if (config.notificationPopupTimeout !== undefined)
        warning('notificationPopupTimeout', 'Notifications.popupTimeout');

    if (config.notificationForceTimeout !== undefined)
        warning('notificationForceTimeout', 'Notifications.forceTimeout');

    if (config.cacheNotificationActions !== undefined)
        warning('cacheNotificationActions', 'Notifications.cacheActions');

    if (config.cacheCoverArt !== undefined) warning('cacheCoverArt', 'Mpris.cacheCoverArt');

    if (config.maxStreamVolume !== undefined) warning('maxStreamVolume', 'Audio.maxStreamVolume');
}

const AgsIFace = (bus: string) => loadInterfaceXML('com.github.Aylur.ags')?.replace('@BUS@', bus);

/**
 * Configuration object for the AGS application.
 *
 * Can be passed to {@link App.config} or exported as the default export of
 * the user's config file.
 */
export interface Config {
    /** Windows to display on startup. Can be an array or a factory function. */
    windows?: Gtk.Window[] | (() => Gtk.Window[]);
    /** Path to a CSS file or inline CSS string for styling. */
    style?: string;
    /** Path to a directory of custom icons. */
    icons?: string;
    /** GTK theme name override. */
    gtkTheme?: string;
    /** Icon theme name override. */
    iconTheme?: string;
    /** Cursor theme name override. */
    cursorTheme?: string;
    /** Map of window names to close delay in milliseconds. */
    closeWindowDelay?: { [key: string]: number };
    /** Map of window names to factory functions for lazy construction. */
    lazyWindows?: Record<string, () => Gtk.Window>;
    /** Map of theme names to CSS file paths or inline CSS strings. */
    themes?: Record<string, string>;

    /** Callback invoked whenever a window is toggled. */
    onWindowToggled?: (windowName: string, visible: boolean) => void;
    /** Callback invoked after the config file has been parsed. */
    onConfigParsed?: (app: App) => void;

    /** @deprecated Use `Notifications.popupTimeout` instead. */
    notificationPopupTimeout?: number;
    /** @deprecated Use `Notifications.forceTimeout` instead. */
    notificationForceTimeout?: boolean;
    /** @deprecated Use `Notifications.cacheActions` instead. */
    cacheNotificationActions?: boolean;
    /** @deprecated Use `Mpris.cacheCoverArt` instead. */
    cacheCoverArt?: boolean;
    /** @deprecated Use `Audio.maxStreamVolume` instead. */
    maxStreamVolume?: number;
}

/**
 * The main AGS application singleton.
 *
 * Manages windows, CSS styling, icon themes, and the DBus interface.
 * Access the running instance via the global `App` object or import
 * `app` from this module.
 *
 * @example
 * ```typescript
 * App.config({
 *     style: './style.css',
 *     windows: [MyWindow()],
 * });
 * ```
 */
export class App extends Gtk.Application {
    static {
        Service.register(this, {
            'window-toggled': ['string', 'boolean'],
            'config-parsed': [],
        });
    }

    private _dbus!: Gio.DBusExportedObject;
    private _cssProviders: Gtk.CssProvider[] = [];
    private _objectPath!: string;
    private _windows: Map<string, Gtk.Window> = new Map();
    private _configPath!: string;
    private _configDir!: string;

    private _windowFactories: Map<string, () => Gtk.Window> = new Map();
    private _themes: Map<string, string> = new Map();
    private _activeTheme: string | null = null;
    private _closeWindowDelay: Config['closeWindowDelay'] = {};
    /** Map of window names to close delays in milliseconds. */
    get closeWindowDelay() {
        return this._closeWindowDelay!;
    }

    set closeWindowDelay(v) {
        this._closeWindowDelay = v;
    }

    /** All registered windows. */
    get windows() {
        return [...this._windows.values()];
    }

    /** Absolute path to the user's config file. */
    get configPath() {
        return this._configPath;
    }

    /** Directory containing the user's config file. */
    get configDir() {
        return this._configDir;
    }

    /** The current GTK icon theme name. */
    set iconTheme(name: string) {
        Gtk.Settings.get_default()!.gtk_icon_theme_name = name;
    }

    get iconTheme() {
        return Gtk.Settings.get_default()!.gtk_icon_theme_name || '';
    }

    /** The current cursor theme name. */
    set cursorTheme(name: string) {
        Gtk.Settings.get_default()!.gtk_cursor_theme_name = name;
    }

    get cursorTheme() {
        return Gtk.Settings.get_default()!.gtk_cursor_theme_name || '';
    }

    /** The current GTK theme name. */
    set gtkTheme(name: string) {
        Gtk.Settings.get_default()!.gtk_theme_name = name;
    }

    get gtkTheme() {
        return Gtk.Settings.get_default()!.gtk_theme_name || '';
    }

    /** Removes all CSS providers that were applied via {@link applyCss}. */
    readonly resetCss = () => {
        const screen = Gdk.Screen.get_default();
        if (!screen) {
            console.error("couldn't get screen");
            return;
        }

        this._cssProviders.forEach(provider => {
            Gtk.StyleContext.remove_provider_for_screen(screen, provider);
        });

        this._cssProviders = [];
    };

    /**
     * Applies CSS styling from a file path or inline CSS string.
     *
     * @param pathOrStyle - A file path to a CSS file or an inline CSS string
     * @param reset - If `true`, removes all previously applied CSS first
     */
    readonly applyCss = (pathOrStyle: string, reset = false) => {
        const screen = Gdk.Screen.get_default();
        if (!screen) {
            console.error("couldn't get screen");
            return;
        }

        if (reset) this.resetCss();

        const cssProvider = new Gtk.CssProvider();
        cssProvider.connect('parsing-error', (_, section, err) => {
            const file = section.get_file().get_path();
            const location = section.get_start_line();
            console.error(`CSS ERROR: ${err.message} at line ${location} in ${file}`);
        });

        try {
            if (GLib.file_test(pathOrStyle, GLib.FileTest.EXISTS)) {
                cssProvider.load_from_path(pathOrStyle);
            } else {
                cssProvider.load_from_data(new TextEncoder().encode(pathOrStyle));
            }
        } catch (error) {
            console.error('CSS loading error:', error);
            throw new AgsConfigError('Failed to load CSS', {
                path: pathOrStyle,
                error: error instanceof Error ? error.message : String(error),
            });
        }

        Gtk.StyleContext.add_provider_for_screen(
            screen,
            cssProvider,
            Gtk.STYLE_PROVIDER_PRIORITY_USER,
        );

        this._cssProviders.push(cssProvider);
    };

    /**
     * Prepends a directory to the icon search path.
     *
     * @param path - Directory containing icon files
     */
    readonly addIcons = (path: string) => {
        Gtk.IconTheme.get_default().prepend_search_path(path);
    };

    /**
     * Registers a named theme (CSS file path or inline CSS string).
     *
     * @param name - A unique theme name
     * @param pathOrCss - Path to a CSS file or inline CSS string
     */
    readonly registerTheme = (name: string, pathOrCss: string) => {
        this._themes.set(name, pathOrCss);
    };

    /**
     * Switches to a registered theme by name.
     *
     * Resets all current CSS and applies the theme CSS. Use
     * `@define-color` in theme CSS files for GTK3-compatible theming.
     *
     * @param name - The theme name previously registered via {@link registerTheme}
     */
    readonly setTheme = (name: string) => {
        const theme = this._themes.get(name);
        if (!theme) {
            console.error(Error(`No theme registered as "${name}"`));
            return;
        }
        this.applyCss(theme, true);
        this._activeTheme = name;
    };

    /** The name of the currently active theme, or `null` if none has been set. */
    get activeTheme() {
        return this._activeTheme;
    }

    /** @internal Configures the app's bus name, object path, and config paths. */
    setup(bus: string, path: string, configDir: string, entry: string) {
        this.application_id = bus;
        this.flags = Gio.ApplicationFlags.DEFAULT_FLAGS;
        this._objectPath = path;

        this._configDir = configDir;
        this._configPath = entry;
    }

    vfunc_activate() {
        this.hold();

        Object.assign(globalThis, {
            Widget,
            Service,
            Variable,
            Utils,
            App: this,
        });

        this._register();
        this._load();
    }

    /**
     * Connects a callback to a signal.
     *
     * @param signal - The signal name (defaults to `'window-toggled'`)
     * @param callback - The callback to invoke
     * @returns The connection ID
     */
    readonly connect = (signal = 'window-toggled', callback: (_: this, ...args: any[]) => void) => {
        return super.connect(signal, callback);
    };

    /**
     * Toggles a window's visibility by name.
     *
     * @param name - The window name
     */
    readonly toggleWindow = (name: string) => {
        if (this._windowFactories.has(name)) {
            this.openWindow(name);
            return;
        }
        const w = this.getWindow(name);
        if (w) w.visible ? this.closeWindow(name) : this.openWindow(name);
        else return 'There is no window named ' + name;
    };

    /**
     * Shows a window by name.
     *
     * @param name - The window name
     */
    readonly openWindow = (name: string) => {
        if (this._windowFactories.has(name)) {
            const factory = this._windowFactories.get(name)!;
            this._windowFactories.delete(name);
            this.addWindow(factory());
        }
        this.getWindow(name)?.show();
    };

    /**
     * Hides a window by name, respecting any configured close delay.
     *
     * @param name - The window name
     */
    readonly closeWindow = (name: string) => {
        const w = this.getWindow(name);
        if (!w || !w.visible) return;

        const delay = this.closeWindowDelay[name];
        if (delay && w.visible) {
            timeout(delay, () => w.hide());
            this.emit('window-toggled', name, false);
        } else {
            w.hide();
        }
    };

    /**
     * Retrieves a registered window by name.
     *
     * @param name - The window name
     * @returns The window, or `undefined` if not found
     */
    readonly getWindow = (name: string) => {
        const w = this._windows.get(name);
        if (!w && !this._windowFactories.has(name))
            console.error(Error(`There is no window named ${name}`));

        return w;
    };

    /**
     * Removes and destroys a registered window.
     *
     * @param w - The window instance or its name
     */
    readonly removeWindow = (w: Gtk.Window | string) => {
        const name = typeof w === 'string' ? w : w.name || 'gtk-layer-shell';

        const win = this._windows.get(name);
        if (!win) {
            console.error(Error('There is no window named ' + name));
            return;
        }

        win.destroy();
        this._windows.delete(name);
    };

    /**
     * Registers a window with the application.
     *
     * The window must have a `name` property set. Emits `'window-toggled'`
     * when the window's visibility changes.
     *
     * @param w - The GTK window to register
     */
    readonly addWindow = (w: Gtk.Window) => {
        if (!(w instanceof Gtk.Window)) {
            return console.error(
                Error(`${w} is not an instanceof Gtk.Window, ` + ` but it is of type ${typeof w}`),
            );
        }

        if (!w.name) return console.error(Error(`${w} has no name`));

        w.connect('notify::visible', () => this.emit('window-toggled', w.name, w.visible));

        if (this._windows.has(w.name)) {
            console.error(Error('There is already a window named' + w.name));
            this.quit();
            return;
        }

        this._windows.set(w.name, w);
    };

    /** Quits the application. */
    readonly quit = () => super.quit();

    /**
     * Applies configuration settings to the application.
     *
     * @param config - The configuration object
     */
    readonly config = (config: Config) => {
        const {
            windows,
            lazyWindows,
            closeWindowDelay,
            style,
            icons,
            gtkTheme,
            iconTheme,
            cursorTheme,
            themes,
            onConfigParsed,
            onWindowToggled,
        } = config;

        if (closeWindowDelay) this.closeWindowDelay = closeWindowDelay;

        if (gtkTheme) this.gtkTheme = gtkTheme;

        if (iconTheme) this.iconTheme = iconTheme;

        if (cursorTheme) this.cursorTheme = cursorTheme;

        if (style) {
            this.applyCss(style.startsWith('.') ? `${this.configDir}${style.slice(1)}` : style);
        }

        if (icons) {
            this.addIcons(icons.startsWith('.') ? `${this.configDir}${icons.slice(1)}` : icons);
        }

        if (typeof onWindowToggled === 'function')
            this.connect('window-toggled', (_, n, v) => onWindowToggled!(n, v));

        if (typeof onConfigParsed === 'function') this.connect('config-parsed', onConfigParsed);

        if (typeof windows === 'function') windows().forEach(this.addWindow);

        if (Array.isArray(windows)) windows.forEach(this.addWindow);

        if (lazyWindows) {
            for (const [name, factory] of Object.entries(lazyWindows)) {
                if (this._windows.has(name)) {
                    console.error(
                        Error(
                            `Cannot register lazy window "${name}": a window with that name already exists`,
                        ),
                    );
                    continue;
                }
                this._windowFactories.set(name, factory);
            }
        }

        if (themes) {
            for (const [name, pathOrCss] of Object.entries(themes)) {
                this.registerTheme(name, pathOrCss);
            }
        }
    };

    private async _load() {
        try {
            const entry = await import(`file://${this.configPath}`);
            const config = entry.default as Config;
            if (!config) return this.emit('config-parsed');
            else
                // FIXME:
                deprecated(config);

            this.config(config);
            this.emit('config-parsed');
        } catch (err) {
            const error = err as { name?: string; message: string };
            const msg = `Unable to load file from: file://${this._configPath}`;
            if (error?.name === 'ImportError' && error.message.includes(msg)) {
                print(`config file not found: "${this._configPath}"`);
                this.quit();
            } else {
                logError(err);
            }
        }
    }

    private _register() {
        Gio.bus_own_name(
            Gio.BusType.SESSION,
            this.application_id!,
            Gio.BusNameOwnerFlags.NONE,
            (connection: Gio.DBusConnection) => {
                this._dbus = Gio.DBusExportedObject.wrapJSObject(
                    AgsIFace(this.application_id!) as string,
                    this,
                );

                this._dbus.export(connection, this._objectPath);
            },
            null,
            null,
        );
    }

    /** Returns a JSON-serializable representation of the application state. */
    toJSON() {
        return {
            bus: this.application_id,
            configDir: this.configDir,
            windows: Object.fromEntries(this.windows.entries()),
        };
    }

    /**
     * Evaluates a JavaScript string in the application context.
     * Called via DBus from the client.
     *
     * @param js - JavaScript code to evaluate
     * @param clientBusName - The client's DBus bus name for returning results
     * @param clientObjPath - The client's DBus object path
     */
    RunJs(js: string, clientBusName?: string, clientObjPath?: string) {
        let fn;

        const dbus = (method: 'Return' | 'Print') => (out: unknown) =>
            Gio.DBus.session.call(
                clientBusName!,
                clientObjPath!,
                clientBusName!,
                method,
                new GLib.Variant('(s)', [`${out}`]),
                null,
                Gio.DBusCallFlags.NONE,
                -1,
                null,
                null,
            );

        const response = dbus('Return');
        const print = dbus('Print');
        const client = clientBusName && clientObjPath;

        try {
            fn = Function(`return (async function(print) {
                ${js.includes(';') ? js : `return ${js}`}
            })`);
        } catch (error) {
            client ? response(error) : logError(error);
            return;
        }

        fn()(print)
            .then((out: unknown) => {
                client ? response(`${out}`) : print(`${out}`);
            })
            .catch((err: Error) => {
                client ? response(`${err}`) : logError(err);
            });
    }

    /**
     * Reads and evaluates a JavaScript file in the application context.
     *
     * @param file - Path to the JavaScript file
     * @param bus - The client's DBus bus name
     * @param path - The client's DBus object path
     */
    RunFile(file: string, bus?: string, path?: string) {
        readFileAsync(file)
            .then(content => {
                if (content.startsWith('#!')) content = content.split('\n').slice(1).join('\n');

                this.RunJs(content, bus, path);
            })
            .catch(logError);
    }

    /** @deprecated Use {@link RunJs} instead, which now supports `await` syntax. */
    RunPromise(js: string, busName?: string, objPath?: string) {
        console.warn(
            '--run-promise is DEPRECATED, ' +
                ' use --run-js instead, which now supports await syntax',
        );

        const client = busName && objPath;
        const response = (out: unknown) =>
            Gio.DBus.session.call(
                busName!,
                objPath!,
                busName!,
                'Return',
                new GLib.Variant('(s)', [`${out}`]),
                null,
                Gio.DBusCallFlags.NONE,
                -1,
                null,
                null,
            );

        new Promise((res, rej) => Function('resolve', 'reject', js)(res, rej))
            .then(out => {
                client ? response(`${out}`) : print(`${out}`);
            })
            .catch(err => {
                client ? response(`${err}`) : console.error(`${err}`);
            });
    }

    /** DBus method to toggle a window. Returns the window's visibility as a string. */
    ToggleWindow(name: string) {
        this.toggleWindow(name);
        return `${this.getWindow(name)?.visible}`;
    }

    /** Opens the GTK interactive debugger. */
    Inspector() {
        Gtk.Window.set_interactive_debugging(true);
    }

    /** DBus method to quit the application. */
    Quit() {
        this.quit();
    }
}

/** The singleton App instance. */
export const app = new App();
export default app;
