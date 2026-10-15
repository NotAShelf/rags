import Gio from 'gi://Gio';
import GdkPixbuf from 'gi://GdkPixbuf';
import GLib from 'gi://GLib';
import Service from '../service.js';
import type { Disposable } from '../service.js';
import type { ChildScope, ScopeHandle } from '../internal/resource-scope.js';
import {
    CACHE_DIR,
    ensureDirectory,
    loadInterfaceXML,
    readFileAsync,
    timeout,
    writeFile,
} from '../utils.js';
import { daemon } from '../utils/notify.js';

const NOTIFICATIONS_CACHE_PATH = `${CACHE_DIR}/notifications`;
const CACHE_FILE = NOTIFICATIONS_CACHE_PATH + '/notifications.json';
const NotificationIFace = loadInterfaceXML('org.freedesktop.Notifications');

/** A notification action with an identifier and display label. */
export interface Action {
    id: string;
    label: string;
}

/** Freedesktop notification hints dictionary. */
export interface Hints {
    'action-icons'?: GLib.Variant; // boolean
    category?: GLib.Variant; // string
    'desktop-entry'?: GLib.Variant; // string
    'image-data'?: GLib.Variant; // iiibiiay
    'image-path'?: GLib.Variant; // string
    resident?: GLib.Variant; // boolean
    'sound-file'?: GLib.Variant; // string
    'sound-name'?: GLib.Variant; // string
    'suppress-sound'?: GLib.Variant; // boolean
    transient?: GLib.Variant; // boolean
    urgency?: GLib.Variant; // 0 | 1 | 2
    x?: GLib.Variant; // number
    y?: GLib.Variant; // number
    [hint: string]: GLib.Variant | undefined;
}

interface NotifcationJson {
    id: number;
    appName: string;
    appIcon: string;
    summary: string;
    body: string;
    actions: Action[];
    urgency: Urgency;
    time: number;
    image?: string;
    appEntry?: string;
    actionIcons?: boolean;
    category?: string;
    resident?: boolean;
    soundFile?: string;
    soundName?: string;
    suppressSound?: boolean;
    transient?: boolean;
    x?: number;
    y?: number;
}

/** Notification urgency level. */
export type Urgency = 'low' | 'critical' | 'normal';

const _URGENCY = (urgency?: number): Urgency => {
    switch (urgency) {
        case 0:
            return 'low';
        case 2:
            return 'critical';
        default:
            return 'normal';
    }
};

/**
 * Notification
 *
 * Represents a single desktop notification with its metadata, actions, and lifecycle.
 *
 * Lifecycle:
 * 1. Construction - Parse notification data and hints
 * 2. Active - Handle dismiss, close, and action invocation
 * 3. Disposal - Cleanup resources
 *
 * @property {number} id - Unique notification ID
 * @property {string} app_name - Name of the sending application
 * @property {string} app_icon - Icon name or path
 * @property {string} summary - Notification title
 * @property {string} body - Notification body text
 * @property {Action[]} actions - Available actions
 * @property {boolean} popup - Whether shown as popup
 * @property {Urgency} urgency - Urgency level
 * @property {number} time - Unix timestamp when received
 * @property {number} timeout - Popup timeout in milliseconds
 *
 * @fires dismissed - Emitted when popup is dismissed
 * @fires closed - Emitted when notification is closed
 * @fires invoked - Emitted when action is invoked
 */
export class Notification extends Service implements Disposable {
    static {
        Service.register(
            this,
            {
                dismissed: [],
                closed: [],
                invoked: ['string'],
            },
            {
                'action-icons': ['boolean'],
                actions: ['jsobject'],
                'app-entry': ['string'],
                'app-icon': ['string'],
                'app-name': ['string'],
                body: ['string'],
                category: ['string'],
                id: ['int'],
                image: ['string'],
                popup: ['boolean'],
                resident: ['boolean'],
                'sound-file': ['string'],
                'sound-name': ['string'],
                summary: ['string'],
                'suppress-sound': ['boolean'],
                time: ['int'],
                timeout: ['int', 'rw'],
                transient: ['boolean'],
                urgency: ['string'],
                x: ['int'],
                y: ['int'],
                hints: ['jsobject'],
            },
        );
    }

    private _actionIcons?: boolean;
    private _actions: Action[] = [];
    private _appEntry?: string;
    private _appIcon: string;
    private _appName: string;
    private _body: string;
    private _category?: string;
    private _id: number;
    private _image?: string;
    private _popup: boolean;
    private _resident?: boolean;
    private _soundFile?: string;
    private _soundName?: string;
    private _summary: string;
    private _suppressSound?: boolean;
    private _time: number;
    private _timeout!: number;
    private _transient?: boolean;
    private _urgency: Urgency;
    private _x?: number;
    private _y?: number;
    private _hints: Hints = {};

    /** Whether action icons are supported. */
    get action_icons() {
        return this._actionIcons;
    }

    /** Available actions for this notification. */
    get actions() {
        return this._actions;
    }

    /** Desktop entry of the sending application. */
    get app_entry() {
        return this._appEntry;
    }

    /** Icon name or path from the sending application. */
    get app_icon() {
        return this._appIcon;
    }

    /** Name of the sending application. */
    get app_name() {
        return this._appName;
    }

    /** The notification body text. */
    get body() {
        return this._body;
    }

    /** Notification category hint. */
    get category() {
        return this._category;
    }

    /** Unique notification ID. */
    get id() {
        return this._id;
    }

    /** Path to the notification image (cached from image-data or image-path). */
    get image() {
        return this._image;
    }

    /** Whether this notification is currently shown as a popup. */
    get popup() {
        return this._popup;
    }

    /** Whether the notification persists after action invocation. */
    get resident() {
        return this._resident;
    }

    /** Path to a custom sound file. */
    get sound_file() {
        return this._soundFile;
    }

    /** Named sound from the sound theme. */
    get sound_name() {
        return this._soundName;
    }

    /** The notification summary (title). */
    get summary() {
        return this._summary;
    }

    /** Whether to suppress notification sounds. */
    get suppress_sound() {
        return this._suppressSound;
    }

    /** Unix timestamp of when the notification was received. */
    get time() {
        return this._time;
    }

    /** Popup timeout duration in milliseconds. */
    get timeout() {
        return this._timeout;
    }

    /** Whether this is a transient notification. */
    get transient() {
        return this._transient;
    }

    /** Urgency level: "low", "normal", or "critical". */
    get urgency() {
        return this._urgency;
    }

    /** Optional x-coordinate hint for positioning. */
    get x() {
        return this._x;
    }

    /** Optional y-coordinate hint for positioning. */
    get y() {
        return this._y;
    }

    /** Raw hints dictionary from the notification. */
    get hints() {
        return this._hints;
    }

    constructor(
        appName: string,
        id: number,
        appIcon: string,
        summary: string,
        body: string,
        acts: string[],
        hints: Hints,
        popup: boolean,
    ) {
        super();

        for (let i = 0; i < acts.length; i += 2) {
            acts[i + 1] !== '' &&
                this._actions.push({
                    label: acts[i + 1],
                    id: acts[i],
                });
        }

        this._id = id;
        this._appName = appName;
        this._appIcon = appIcon;
        this._summary = summary;
        this._body = body;
        this._time = GLib.DateTime.new_now_local().to_unix();
        this._image =
            this._appIconImage() ||
            this._parseImageData(hints['image-data']) ||
            (hints['image-path']?.unpack() as string | undefined);

        this._popup = popup;
        this._urgency = _URGENCY(hints['urgency']?.unpack() as number | undefined);

        this._appEntry = hints['desktop-entry']?.unpack() as string | undefined;
        this._actionIcons = hints['action-icons']?.unpack() as boolean | undefined;
        this._category = hints['category']?.unpack() as string | undefined;
        this._resident = hints['resident']?.unpack() as boolean | undefined;
        this._soundFile = hints['sound-file']?.unpack() as string | undefined;
        this._soundName = hints['sound-name']?.unpack() as string | undefined;
        this._suppressSound = hints['suppress-sound']?.unpack() as boolean | undefined;
        this._transient = hints['transient']?.unpack() as boolean | undefined;
        this._x = hints['x']?.unpack() as number | undefined;
        this._y = hints['y']?.unpack() as number | undefined;
        this._hints = hints;
    }

    /** Dismisses the popup without closing the notification. */
    readonly dismiss = () => {
        this._popup = false;
        this.changed('popup');
        this.emit('dismissed');
    };

    /** Closes and removes the notification entirely. */
    readonly close = () => {
        this.emit('closed');
    };

    /**
     * Invokes a notification action by ID. Closes the notification if not resident.
     *
     * @param id - The action identifier to invoke
     */
    readonly invoke = (id: string) => {
        this.emit('invoked', id);
        if (!this.resident) this.close();
    };

    /**
     * Serializes the notification to a JSON-compatible object for caching.
     *
     * @param cacheActions - Whether to include actions in the serialized output
     * @returns The serialized notification data
     */
    toJson(cacheActions = notifications.cacheActions): NotifcationJson {
        return {
            actionIcons: this._actionIcons,
            actions: cacheActions ? this._actions : [],
            appEntry: this._appEntry,
            appIcon: this._appIcon,
            appName: this._appName,
            body: this._body,
            category: this._category,
            id: this._id,
            image: this._image,
            resident: this._resident,
            soundFile: this._soundFile,
            soundName: this._soundName,
            summary: this._summary,
            suppressSound: this._suppressSound,
            time: this._time,
            transient: this._transient,
            urgency: this._urgency,
            x: this._x,
            y: this._y,
        };
    }

    /**
     * Reconstructs a Notification from cached JSON data.
     *
     * @param json - The serialized notification data
     * @returns A new Notification instance
     */
    static fromJson(json: NotifcationJson) {
        const { id, appName, appIcon, summary, body, ...j } = json;

        const n = new Notification(appName, id, appIcon, summary, body, [], {}, false);
        for (const key of Object.keys(j))
            // @ts-expect-error Dynamic property assignment from JSON, static typing not possible
            n[`_${key}`] = j[key];

        return n;
    }

    private _appIconImage() {
        if (
            GLib.file_test(this._appIcon, GLib.FileTest.EXISTS) ||
            GLib.file_test(this._appIcon.replace(/^(file\:\/\/)/, ''), GLib.FileTest.EXISTS)
        )
            return this._appIcon;
    }

    private _parseImageData(imageData?: InstanceType<typeof GLib.Variant>) {
        if (!imageData) return null;

        ensureDirectory(NOTIFICATIONS_CACHE_PATH);
        const fileName = NOTIFICATIONS_CACHE_PATH + `/${this._id}`;
        const [w, h, rs, alpha, bps, _, data] = imageData // iiibiiay
            .recursiveUnpack<[number, number, number, boolean, number, number, GLib.Bytes]>();

        if (bps !== 8) {
            console.warn(
                `Notification image error from ${this.app_name}: ` +
                    'Currently only RGB images with 8 bits per sample are supported.',
            );
            return null;
        }

        const pixbuf = GdkPixbuf.Pixbuf.new_from_bytes(
            data,
            GdkPixbuf.Colorspace.RGB,
            alpha,
            bps,
            w,
            h,
            rs,
        );

        if (!pixbuf) return null;

        const outputStream = Gio.File.new_for_path(fileName).replace(
            null,
            false,
            Gio.FileCreateFlags.NONE,
            null,
        );

        try {
            pixbuf.save_to_streamv(outputStream, 'png', null, null, null);
        } finally {
            outputStream.close(null);
        }

        return fileName;
    }
}

/**
 * Notifications Service
 *
 * Freedesktop Notifications daemon service that receives, stores, and manages desktop notifications.
 *
 * Lifecycle:
 * 1. Construction - Register D-Bus service, restore cached notifications
 * 2. Ready - Receive and manage notifications
 * 3. Disposal - Cleanup all notifications, timeouts, and D-Bus registration
 *
 * @property {Notification[]} notifications - All stored notifications
 * @property {Notification[]} popups - Notifications currently shown as popups
 * @property {boolean} dnd - Do Not Disturb mode (suppresses popups)
 * @property {number} popupTimeout - Default popup timeout in milliseconds (default: 3000)
 * @property {boolean} forceTimeout - Override application timeout (default: false)
 * @property {boolean} cacheActions - Persist actions in cache (default: false)
 * @property {number} clearDelay - Delay between closing notifications (default: 100ms)
 *
 * @fires notified - Emitted when new notification is received (id: number)
 * @fires dismissed - Emitted when notification popup is dismissed (id: number)
 * @fires closed - Emitted when notification is closed (id: number)
 * @fires changed - Emitted when notification state changes
 */
export class Notifications extends Service implements Disposable {
    static {
        Service.register(
            this,
            {
                dismissed: ['int'],
                notified: ['int'],
                closed: ['int'],
            },
            {
                notifications: ['jsobject'],
                popups: ['jsobject'],
                dnd: ['boolean'],
            },
        );
    }

    /** Default popup timeout in milliseconds. */
    public popupTimeout = 3000;
    /** When true, overrides the expiration timeout sent by the application. */
    public forceTimeout = false;
    /** Whether to persist notification actions in the cache. */
    public cacheActions = false;
    /** Delay in milliseconds between closing each notification during clear(). */
    public clearDelay = 100;

    private _dbus?: Gio.DBusExportedObject;
    private _notifications: Map<number, Notification>;
    private _notificationScopes = new Map<number, ChildScope>();
    private _popupTimeouts = new Map<Notification, ScopeHandle>();
    private _dnd = false;
    private _idCount = 1;
    private _cacheTimeout?: ScopeHandle;

    constructor() {
        super();

        this._notifications = new Map();
        try {
            this._readFromFile();
            this._register();
        } catch (error) {
            this.dispose();
            throw error;
        }
    }

    /** Whether Do Not Disturb mode is enabled (suppresses popups). */
    get dnd() {
        return this._dnd;
    }

    set dnd(value: boolean) {
        this._dnd = value;
        this.changed('dnd');
    }

    /** All stored notifications. */
    get notifications() {
        return Array.from(this._notifications.values());
    }

    /** Notifications currently shown as popups. */
    get popups() {
        const list = [];
        for (const [, notification] of this._notifications) {
            if (notification.popup) list.push(notification);
        }
        return list;
    }

    /**
     * Retrieves a notification by ID only if it is currently a popup.
     *
     * @param id - The notification ID
     * @returns The Notification if it is a popup, otherwise null
     */
    readonly getPopup = (id: number) => {
        const n = this._notifications.get(id);
        return n?.popup ? n : null;
    };

    /**
     * Retrieves a notification by its ID.
     *
     * @param id - The notification ID
     * @returns The Notification or undefined
     */
    readonly getNotification = (id: number) => {
        return this._notifications.get(id);
    };

    /** D-Bus Notify method handler: creates or replaces a notification. */
    Notify(
        appName: string,
        replacesId: number,
        appIcon: string,
        summary: string,
        body: string,
        acts: string[],
        hints: Hints,
        expiration: number,
    ) {
        if (this.isDisposed) return 0;

        const id = this._notifications.has(replacesId) ? replacesId : this._idCount++;
        const n = new Notification(appName, id, appIcon, summary, body, acts, hints, !this.dnd);

        const expirationTimeout = this.forceTimeout || expiration === -1
            ? this.popupTimeout
            : expiration;
        n.updateProperty('timeout', expirationTimeout);

        const child = this._addNotification(n);
        if (this.forceTimeout || expiration === -1 || expiration > 0) {
            const timer = child.scope.source(timeout(expirationTimeout, () => {
                timer.forget();
                this._popupTimeouts.delete(n);
                if (!this.isDisposed && this._notifications.get(id) === n) n.dismiss();
            }));
            this._popupTimeouts.set(n, timer);
        }
        this._publishNotification(n);
        return id;
    }

    private _publishNotification(n: Notification) {
        const current = () => !this.isDisposed && this._notifications.get(n.id) === n;
        if (!this._dnd) this.notify('popups');
        if (!current()) return;
        this.notify('notifications');
        if (!current()) return;
        this.emit('notified', n.id);
        if (!current()) return;
        this.emit('changed');
        if (current()) this._cache();
    }

    /** D-Bus Clear method: closes all notifications. */
    Clear() {
        this.clear();
    }

    /**
     * Dismisses a notification popup without removing it.
     *
     * @param id - The notification ID to dismiss
     */
    DismissNotification(id: number) {
        this._notifications.get(id)?.dismiss();
    }

    /**
     * Closes and removes a notification entirely.
     *
     * @param id - The notification ID to close
     */
    CloseNotification(id: number) {
        this._notifications.get(id)?.close();
    }

    /**
     * Invokes an action on a notification.
     *
     * @param id - The notification ID
     * @param actionId - The action identifier to invoke
     */
    InvokeAction(id: number, actionId: string) {
        this._notifications.get(id)?.invoke(actionId);
    }

    /** Returns the list of capabilities supported by this notification daemon. */
    GetCapabilities() {
        return [
            'action-icons',
            'actions',
            'body',
            'body-hyperlinks',
            'body-markup',
            'icon-static',
            'persistence',
            'sound',
        ];
    }

    /** Returns server name, vendor, version, and spec version as a D-Bus variant. */
    GetServerInformation() {
        return new GLib.Variant('(ssss)', [pkg.name, 'Aylur', pkg.version, '1.2']);
    }

    /** Closes all notifications with a staggered delay between each. */
    readonly clear = async () => {
        const close = (n: Notification, delay: number) =>
            new Promise(resolve => {
                const child = this._notificationScopes.get(n.id);
                if (this.isDisposed || this._notifications.get(n.id) !== n || !child) {
                    resolve(null);
                    return;
                }

                const settlement = child.scope.add(() => resolve(null));
                const timer = child.scope.source(timeout(delay, () => {
                    timer.forget();
                    settlement.forget();
                    resolve(!this.isDisposed && this._notifications.get(n.id) === n ? n.close() : null);
                }));
            });
        return Promise.all(this.notifications.map((n, i) => close(n, this.clearDelay * i)));
    };

    private _addNotification(n: Notification) {
        this._notificationScopes.get(n.id)?.release();
        this._notificationScopes.delete(n.id);

        const child = this.resources.child();
        this._notificationScopes.set(n.id, child);
        child.scope.add(() => {
            this._popupTimeouts.delete(n);
            n.dispose();
        });
        child.scope.connect(n, 'dismissed', () => this._onDismissed(n));
        child.scope.connect(n, 'closed', () => this._onClosed(n));
        child.scope.connect(n, 'invoked', (_notification, id) => this._onInvoked(n, id as string));

        this._notifications.set(n.id, n);
        return child;
    }

    private _onDismissed(n: Notification) {
        if (this.isDisposed || this._notifications.get(n.id) !== n) return;

        this._popupTimeouts.get(n)?.release();
        this._popupTimeouts.delete(n);

        this.emit('dismissed', n.id);
        if (this.isDisposed || this._notifications.get(n.id) !== n) return;
        this.notify('popups');
        if (!this.isDisposed) this.emit('changed');
    }

    private _onClosed(n: Notification) {
        if (this.isDisposed || this._notifications.get(n.id) !== n) return;

        this._dbus?.emit_signal('NotificationClosed', new GLib.Variant('(uu)', [n.id, 3]));

        this._notificationScopes.get(n.id)?.release();
        this._notificationScopes.delete(n.id);
        this._notifications.delete(n.id);
        this.notify('notifications');
        if (this.isDisposed) return;
        this.notify('popups');
        if (this.isDisposed) return;
        this.emit('closed', n.id);
        if (this.isDisposed) return;
        this.emit('changed');
        this._cache();
    }

    private _onInvoked(n: Notification, id: string) {
        if (this.isDisposed || this._notifications.get(n.id) !== n) return;

        this._dbus?.emit_signal('ActionInvoked', new GLib.Variant('(us)', [n.id, id]));
    }

    private _register() {
        let exported: ScopeHandle | undefined;
        let ownsName = false;
        const ownerId = Gio.bus_own_name(
            Gio.BusType.SESSION,
            'org.freedesktop.Notifications',
            Gio.BusNameOwnerFlags.NONE,
            (connection: Gio.DBusConnection) => {
                if (this.isDisposed) return;

                exported?.release();
                const dbus = Gio.DBusExportedObject.wrapJSObject(NotificationIFace as string, this);
                this._dbus = dbus;
                exported = this.resources.add(() => {
                    if (this._dbus === dbus) this._dbus = undefined;
                    dbus.unexport();
                });
                dbus.export(connection, '/org/freedesktop/Notifications');
            },
            () => {
                if (this.isDisposed) return;

                ownsName = true;
                daemon.running = true;
            },
            () => {
                if (ownsName) {
                    ownsName = false;
                    daemon.running = false;
                }
                if (this.isDisposed) return;

                const [name] = Gio.DBus.session
                    .call_sync(
                        'org.freedesktop.Notifications',
                        '/org/freedesktop/Notifications',
                        'org.freedesktop.Notifications',
                        'GetServerInformation',
                        null,
                        null,
                        Gio.DBusCallFlags.NONE,
                        -1,
                        null,
                    )
                    .deepUnpack() as string[];

                console.warn(`Another notification daemon is already running: ${name}`);
            },
        );
        this.resources.add(() => {
            if (ownsName) {
                ownsName = false;
                daemon.running = false;
            }
            Gio.bus_unown_name(ownerId);
        });
    }

    private async _readFromFile() {
        try {
            const file = await readFileAsync(CACHE_FILE);
            if (this.isDisposed) return;

            const notifications = JSON.parse(file).map((n: NotifcationJson) =>
                Notification.fromJson(n),
            );

            for (const n of notifications) {
                this._addNotification(n);
                if (n.id > this._idCount) this._idCount = n.id + 1;
            }

            this.changed('notifications');
        } catch (_) {
            // most likely there is no cache yet
        }
    }

    private _cache() {
        if (this.isDisposed) return;

        this._cacheTimeout?.release();
        const timer = this.resources.source(timeout(1000, () => {
            timer.forget();
            if (this._cacheTimeout === timer) this._cacheTimeout = undefined;
            if (this.isDisposed) return;

            ensureDirectory(NOTIFICATIONS_CACHE_PATH);
            const arr = Array.from(this._notifications.values()).map(n => n.toJson());
            writeFile(JSON.stringify(arr, null, 2), CACHE_FILE).catch(err => {
                if (!this.isDisposed) console.error(err);
            });
        }));
        this._cacheTimeout = timer;
    }

    dispose(): void {
        if (this.isDisposed) return;

        super.dispose();

        this._cacheTimeout = undefined;
        this._notificationScopes.clear();
        this._notifications.clear();
    }
}

export const notifications = new Notifications();
export default notifications;
