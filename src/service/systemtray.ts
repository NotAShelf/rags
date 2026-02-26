import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gdk from 'gi://Gdk?version=3.0';
import Gtk from 'gi://Gtk?version=3.0';
import GdkPixbuf from 'gi://GdkPixbuf';
import DbusmenuGtk3 from 'gi://DbusmenuGtk3';
import GObject from 'gi://GObject';
import Service from '../service.js';
import type { Disposable } from '../service.js';
import { StatusNotifierItemProxy, connectSignal } from '../dbus/types.js';
import { bulkConnect, loadInterfaceXML, globalSignalRegistry } from '../utils.js';
import Widget from '../widget.js';

const StatusNotifierWatcherIFace = loadInterfaceXML('org.kde.StatusNotifierWatcher')!;
const StatusNotifierItemIFace = loadInterfaceXML('org.kde.StatusNotifierItem')!;
const StatusNotifierItemProxy = Gio.DBusProxy.makeProxyWrapper(
    StatusNotifierItemIFace,
) as unknown as StatusNotifierItemProxy;

const DbusmenuGtk3Menu = Widget<typeof DbusmenuGtk3.Menu, DbusmenuGtk3.Menu.ConstructorProps>(
    DbusmenuGtk3.Menu,
);

/**
 * Tray Item
 *
 * Represents a single StatusNotifierItem (system tray icon) with its properties and actions.
 *
 * Lifecycle:
 * 1. Construction - Connect to StatusNotifierItem D-Bus proxy
 * 2. Ready - Monitor item properties and icon changes
 * 3. Disposal - Disconnect proxy and cleanup menu
 *
 * @property {DbusmenuGtk3.Menu} menu - DBusMenu if available
 * @property {string} category - Item category
 * @property {string} id - Application identifier
 * @property {string} title - Display title
 * @property {string} status - Status ("Passive", "Active", "NeedsAttention")
 * @property {number} window_id - X11 window ID or 0
 * @property {boolean} is_menu - Whether item only supports menu
 * @property {string} tooltip_markup - Tooltip markup string
 * @property {string|GdkPixbuf.Pixbuf} icon - Icon name, pixbuf, or "image-missing"
 *
 * @fires removed - Emitted when item disappears from bus (busName: string)
 * @fires ready - Emitted when item proxy is ready
 * @fires changed - Emitted when item properties change
 */
export class TrayItem extends Service implements Disposable {
    static {
        Service.register(
            this,
            {
                removed: ['string'],
                ready: [],
            },
            {
                menu: ['jsobject'],
                category: ['string'],
                id: ['string'],
                title: ['string'],
                status: ['string'],
                'window-id': ['int'],
                'is-menu': ['boolean'],
                'tooltip-markup': ['string'],
                icon: ['jsobject'],
            },
        );
    }

    private _proxy: StatusNotifierItemProxy;
    private _busName: string;

    private _iconTheme?: Gtk.IconTheme;
    menu?: DbusmenuGtk3.Menu;
    private _proxySignalIds: number[] = [];

    constructor(busName: string, objectPath: string) {
        super();

        this._busName = busName;

        this._proxy = new StatusNotifierItemProxy(
            Gio.DBus.session,
            busName,
            objectPath,
            this._itemProxyAcquired.bind(this),
            null,
            Gio.DBusProxyFlags.NONE,
        );
    }

    /**
     * Sends an Activate request to the tray item at the event's coordinates.
     *
     * @param event - The GDK event providing root coordinates
     */
    readonly activate = (event: Gdk.Event) => {
        this._proxy.ActivateAsync(event.get_root_coords()[1], event.get_root_coords()[2]);
    };

    /**
     * Sends a SecondaryActivate (middle-click) request to the tray item.
     *
     * @param event - The GDK event providing root coordinates
     */
    readonly secondaryActivate = (event: Gdk.Event) => {
        this._proxy.SecondaryActivateAsync(event.get_root_coords()[1], event.get_root_coords()[2]);
    };

    /**
     * Sends a Scroll event to the tray item.
     *
     * @param event - The GDK scroll event with direction and delta
     */
    readonly scroll = (event: Gdk.EventScroll) => {
        const direction = event.direction == 0 || event.direction == 1 ? 'vertical' : 'horizontal';

        const delta = event.direction == 0 || event.direction == 1 ? event.delta_y : event.delta_x;

        this._proxy.ScrollAsync(delta, direction);
    };

    /**
     * Opens the context menu for this tray item, using DbusmenuGtk3 if available.
     *
     * @param event - The GDK event for popup positioning
     */
    readonly openMenu = (event: Gdk.Event) => {
        this.menu
            ? this.menu.popup_at_pointer(event)
            : this._proxy.ContextMenuAsync(event.get_root_coords()[1], event.get_root_coords()[2]);
    };

    /** The tray item's category (e.g. "ApplicationStatus", "Communications"). */
    get category() {
        return this._proxy.Category;
    }

    /** The unique application identifier for this tray item. */
    get id() {
        return this._proxy.Id;
    }

    /** The display title of the tray item. */
    get title() {
        return this._proxy.Title;
    }

    /** The current status: "Passive", "Active", or "NeedsAttention". */
    get status() {
        return this._proxy.Status;
    }

    /** The X11 window ID associated with this tray item, or 0. */
    get window_id() {
        return this._proxy.WindowId;
    }

    /** Whether the item only supports menu activation (no primary activate). */
    get is_menu() {
        return this._proxy.ItemIsMenu;
    }

    /** Markup string from the item's tooltip, combining title and description. */
    get tooltip_markup() {
        if (!this._proxy.ToolTip) return '';

        let tooltipMarkup = this._proxy.ToolTip[2];
        if (this._proxy.ToolTip[3] !== '') tooltipMarkup += '\n' + this._proxy.ToolTip[3];

        return tooltipMarkup;
    }

    /**
     * The icon as a name string, GdkPixbuf, or fallback
     * "image-missing". Uses attention icon when "NeedsAttention".
     */
    get icon() {
        const iconName =
            this.status === 'NeedsAttention' ? this._proxy.AttentionIconName : this._proxy.IconName;

        if (this._iconTheme && iconName) {
            const size = Math.max(...this._iconTheme.get_icon_sizes(iconName));
            const iconInfo = this._iconTheme.lookup_icon(
                iconName,
                size,
                Gtk.IconLookupFlags.FORCE_SIZE,
            );

            if (iconInfo) return iconInfo.load_icon();
        }
        const iconPixmap =
            this.status === 'NeedsAttention'
                ? this._proxy.AttentionIconPixmap
                : this._proxy.IconPixmap;

        return iconName || this._getPixbuf(iconPixmap) || 'image-missing';
    }

    private _itemProxyAcquired(proxy: StatusNotifierItemProxy) {
        if (proxy.Menu) {
            const menu = DbusmenuGtk3Menu({
                dbus_name: proxy.g_name_owner!,
                dbus_object: proxy.Menu,
            } as any);
            this.menu = menu;
        }

        if (this._proxy.IconThemePath) {
            this._iconTheme = Gtk.IconTheme.new();
            this._iconTheme?.set_search_path([this._proxy.IconThemePath]);
        }

        // Track bulkConnect signals
        const bulkIds = [
            proxy.connect('notify::g-name-owner', () => {
                if (!proxy.g_name_owner) this.emit('removed', this._busName);
            }),
            proxy.connect('g-signal', this._refreshAllProperties.bind(this)),
            proxy.connect('g-properties-changed', () => this.emit('changed')),
        ];

        bulkIds.forEach(id => {
            this._proxySignalIds.push(id);
            this.trackConnection(id);
            globalSignalRegistry.register(proxy as unknown as GObject.Object, id);
        });

        // Track connectSignal calls
        ['Title', 'Icon', 'AttentionIcon', 'OverlayIcon', 'ToolTip', 'Status'].forEach(prop => {
            const id = connectSignal(proxy, `New${prop}`, () => {
                this._notify();
            });
            this._proxySignalIds.push(id);
            this.trackConnection(id);
            globalSignalRegistry.register(proxy as unknown as GObject.Object, id);
        });

        this.emit('ready');
    }

    private _notify() {
        [
            'menu',
            'category',
            'id',
            'title',
            'status',
            'window-id',
            'is-menu',
            'tooltip-markup',
            'icon',
        ].forEach(prop => this.notify(prop));
        this.emit('changed');
    }

    private _refreshAllProperties() {
        this._proxy.g_connection.call(
            this._proxy.g_name,
            this._proxy.g_object_path!,
            'org.freedesktop.DBus.Properties',
            'GetAll',
            new GLib.Variant('(s)', [this._proxy.g_interface_name]),
            new GLib.VariantType('(a{sv})'),
            Gio.DBusCallFlags.NONE,
            -1,
            null,
            (proxy, result) => {
                const variant = proxy?.call_finish(result) as GLib.Variant;
                if (!variant) return;
                const [properties] = variant.deepUnpack<Record<string, GLib.Variant>[]>();
                Object.entries(properties).map(([propertyName, value]) => {
                    this._proxy.set_cached_property(propertyName, value);
                });

                if (this._proxy.IconThemePath) {
                    if (!this._iconTheme) this._iconTheme = Gtk.IconTheme.new();

                    this._iconTheme.set_search_path([this._proxy.IconThemePath]);
                }

                this._notify();
            },
        );
    }

    private _getPixbuf(pixMapArray: [number, number, Uint8Array][]) {
        if (!pixMapArray) return;

        const pixMap = pixMapArray.sort((a, b) => a[0] - b[0]).pop();
        if (!pixMap) return;

        const array = Uint8Array.from(pixMap[2]);
        for (let i = 0; i < 4 * pixMap[0] * pixMap[1]; i += 4) {
            const alpha = array[i];
            array[i] = array[i + 1];
            array[i + 1] = array[i + 2];
            array[i + 2] = array[i + 3];
            array[i + 3] = alpha;
        }
        return GdkPixbuf.Pixbuf.new_from_bytes(
            new GLib.Bytes(array),
            GdkPixbuf.Colorspace.RGB,
            true,
            8,
            pixMap[0],
            pixMap[1],
            pixMap[0] * 4,
        );
    }

    dispose(): void {
        super.dispose();

        // Disconnect proxy signals
        if (this._proxy && this._proxySignalIds.length > 0) {
            this._proxySignalIds.forEach(id => {
                try {
                    this._proxy.disconnect(id);
                } catch (error) {
                    // Signal may already be disconnected
                }
            });
            globalSignalRegistry.disconnect(this._proxy as unknown as GObject.Object);
        }

        // Cleanup menu
        if (this.menu) {
            this.menu.destroy();
            this.menu = undefined;
        }
    }
}

/**
 * System Tray Service
 *
 * Service that implements the StatusNotifierWatcher D-Bus interface,
 * managing all system tray items on the session bus.
 *
 * Lifecycle:
 * 1. Construction - Register StatusNotifierWatcher on D-Bus
 * 2. Ready - Accept StatusNotifierItem registrations
 * 3. Active - Monitor item additions, removals, property changes
 * 4. Disposal - Cleanup all items and unexport D-Bus service
 *
 * @property {TrayItem[]} items - All currently registered tray items
 * @property {boolean} IsStatusNotifierHostRegistered - Always true
 * @property {number} ProtocolVersion - Protocol version (0)
 * @property {string[]} RegisteredStatusNotifierItems - Bus names of registered items
 *
 * @fires added - Emitted when item is registered (busName: string)
 * @fires removed - Emitted when item is unregistered (busName: string)
 * @fires changed - Emitted when tray state changes
 */
export class SystemTray extends Service implements Disposable {
    static {
        Service.register(
            this,
            {
                added: ['string'],
                removed: ['string'],
            },
            {
                items: ['jsobject'],
            },
        );
    }

    private _dbus!: Gio.DBusExportedObject;
    private _items: Map<string, TrayItem>;

    /** Whether a StatusNotifierHost is registered (always `true`). */
    get IsStatusNotifierHostRegistered() {
        return true;
    }

    /** The StatusNotifierWatcher protocol version. */
    get ProtocolVersion() {
        return 0;
    }

    /** Bus names of all currently registered StatusNotifierItems. */
    get RegisteredStatusNotifierItems() {
        return Array.from(this._items.keys());
    }

    /** All currently registered tray items. */
    get items() {
        return Array.from(this._items.values());
    }

    /**
     * Retrieves a tray item by its bus name.
     *
     * @param name - The D-Bus bus name of the item
     */
    readonly getItem = (name: string) => this._items.get(name);

    constructor() {
        super();
        this._items = new Map();
        this._register();
    }

    private _register() {
        Gio.bus_own_name(
            Gio.BusType.SESSION,
            'org.kde.StatusNotifierWatcher',
            Gio.BusNameOwnerFlags.NONE,
            (connection: Gio.DBusConnection) => {
                this._dbus = Gio.DBusExportedObject.wrapJSObject(
                    StatusNotifierWatcherIFace as string,
                    this,
                );

                this._dbus.export(connection, '/StatusNotifierWatcher');
            },
            null,
            () => {
                print('Another system tray is already running');
            },
        );
    }

    RegisterStatusNotifierItemAsync(serviceName: string[], invocation: Gio.DBusMethodInvocation) {
        let busName: string, objectPath: string;
        const [service] = serviceName;
        if (service.startsWith('/')) {
            objectPath = service;
            busName = invocation.get_sender()!;
        } else {
            busName = service;
            objectPath = '/StatusNotifierItem';
        }

        invocation.return_value(null);

        const item = new TrayItem(busName, objectPath);

        const readyId = item.connect('ready', () => {
            this._items.set(busName, item);
            this.emit('added', busName);
            this.notify('items');
            this.emit('changed');
            this._dbus.emit_signal(
                'StatusNotifierItemRegistered',
                new GLib.Variant('(s)', [busName + objectPath]),
            );
        });
        globalSignalRegistry.register(item as unknown as GObject.Object, readyId);

        const removedId = item.connect('removed', () => {
            // Cleanup item
            globalSignalRegistry.disconnect(item as unknown as GObject.Object);
            item.dispose();
            this._items.delete(busName);
            this.emit('removed', busName);
            this.notify('items');
            this.emit('changed');
            this._dbus.emit_signal(
                'StatusNotifierItemUnregistered',
                new GLib.Variant('(s)', [busName]),
            );
        });
        globalSignalRegistry.register(item as unknown as GObject.Object, removedId);
    }

    dispose(): void {
        super.dispose();

        // Cleanup all tray items
        for (const item of this._items.values()) {
            globalSignalRegistry.disconnect(item as unknown as GObject.Object);
            item.dispose();
        }
        this._items.clear();

        // Unexport D-Bus object
        if (this._dbus) {
            this._dbus.unexport();
        }
    }
}

export const systemTray = new SystemTray();
export default systemTray;
