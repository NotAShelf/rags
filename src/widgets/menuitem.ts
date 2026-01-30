import { register, type BaseProps, type Widget } from './widget.js';
import Gtk from 'gi://Gtk?version=3.0';

type Event<Self> = (self: Self) => boolean | unknown;

/** Props for the MenuItem widget. */
export type MenuItemProps<
    Child extends Gtk.Widget = Gtk.Widget,
    Attr = unknown,
    Self = MenuItem<Child, Attr>,
> = BaseProps<
    Self,
    Gtk.MenuItem.ConstructorProps & {
        child?: Child;
        on_activate?: Event<Self>;
        on_select?: Event<Self>;
        on_deselect?: Event<Self>;
    },
    Attr
>;

/** Creates a new MenuItem widget for use inside a Menu. */
export function newMenuItem<Child extends Gtk.Widget = Gtk.Widget, Attr = unknown>(
    ...props: ConstructorParameters<typeof MenuItem<Child, Attr>>
) {
    return new MenuItem(...props);
}

/** GTK MenuItem wrapper for a single entry in a menu. */
export interface MenuItem<Child, Attr> extends Widget<Attr> {}
export class MenuItem<Child extends Gtk.Widget, Attr> extends Gtk.MenuItem {
    static {
        register(this, {
            properties: {
                'on-activate': ['jsobject', 'rw'],
                'on-select': ['jsobject', 'rw'],
                'on-deselect': ['jsobject', 'rw'],
            },
        });
    }

    constructor(
        props: MenuItemProps<Child, Attr> = {} as MenuItemProps<Child, Attr>,
        child?: Child,
    ) {
        if (child) props.child = child;

        super(props as Gtk.MenuItem.ConstructorProps);

        this.connect('activate', () => this.on_activate?.(this));
        this.connect('select', () => this.on_select?.(this));
        this.connect('deselect', () => this.on_deselect?.(this));
    }

    /** The child widget of this menu item. */
    get child() {
        return super.child as Child;
    }

    set child(child: Child) {
        super.child = child;
    }

    /** Callback invoked when the menu item is activated. */
    get on_activate() {
        return this._get('on-activate');
    }

    set on_activate(callback: Event<this>) {
        this._set('on-activate', callback);
    }

    /** Callback invoked when the menu item is selected (hovered). */
    get on_select() {
        return this._get('on-select');
    }

    set on_select(callback: Event<this>) {
        this._set('on-select', callback);
    }

    /** Callback invoked when the menu item is deselected. */
    get on_deselect() {
        return this._get('on-deselect');
    }

    set on_deselect(callback: Event<this>) {
        this._set('on-deselect', callback);
    }
}

export default MenuItem;
