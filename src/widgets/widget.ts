import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk?version=3.0';
import GLib from 'gi://GLib?version=2.0';
import Gdk from 'gi://Gdk?version=3.0';
import Cairo from 'gi://cairo?version=1.0';
import { Props, BindableProps, Binding, Connectable } from '../service.js';
import { registerGObject, kebabify, type CtorProps } from '../utils/gobject.js';
import { interval, idle } from '../utils.js';

/** @internal Map of alignment string names to GTK Align enum values. */
const ALIGN = {
    fill: Gtk.Align.FILL,
    start: Gtk.Align.START,
    end: Gtk.Align.END,
    center: Gtk.Align.CENTER,
    baseline: Gtk.Align.BASELINE,
} as const;

const ALIGN_KEYS = new Set(Object.keys(ALIGN));

/** String alignment values: `'fill'`, `'start'`, `'end'`, `'center'`, `'baseline'`. */
type Align = keyof typeof ALIGN;

/** Map of GDK key names (without the `KEY_` prefix) to their keycodes. */
type Keys = {
    [K in keyof typeof Gdk as K extends `KEY_${infer U}` ? U : never]: number;
};

/** Map of GDK modifier key names (without the `_MASK` suffix). */
type ModifierKey = {
    [K in keyof typeof Gdk.ModifierType as K extends `${infer M}_MASK` ? M : never]: number;
};

/** CSS cursor name strings. */
type Cursor =
    | 'default'
    | 'help'
    | 'pointer'
    | 'context-menu'
    | 'progress'
    | 'wait'
    | 'cell'
    | 'crosshair'
    | 'text'
    | 'vertical-text'
    | 'alias'
    | 'copy'
    | 'no-drop'
    | 'move'
    | 'not-allowed'
    | 'grab'
    | 'grabbing'
    | 'all-scroll'
    | 'col-resize'
    | 'row-resize'
    | 'n-resize'
    | 'e-resize'
    | 's-resize'
    | 'w-resize'
    | 'ne-resize'
    | 'nw-resize'
    | 'sw-resize'
    | 'se-resize'
    | 'ew-resize'
    | 'ns-resize'
    | 'nesw-resize'
    | 'nwse-resize'
    | 'zoom-in'
    | 'zoom-out';

/**
 * Common properties available on all AGS widgets.
 *
 * @typeParam Attr - The type of the widget's custom `attribute` field
 */
interface CommonProps<Attr> {
    class_name?: string;
    class_names?: Array<string>;
    click_through?: boolean;
    css?: string;
    hpack?: Align;
    vpack?: Align;
    cursor?: Cursor;
    attribute?: Attr;
}

/**
 * The full props type for AGS widget constructors.
 *
 * Combines the widget-specific props with `CommonProps` and makes
 * all properties bindable via {@link Binding}.
 *
 * @typeParam Self - The widget instance type
 * @typeParam Props - The GTK constructor props
 * @typeParam Attr - The custom attribute type
 */
export type BaseProps<Self, Props, Attr = unknown> = {
    /** Callback invoked after the widget is constructed. */
    setup?: (self: Self) => void;
} & BindableProps<CtorProps<Props & CommonProps<Attr>>>;

type Required<T> = { [K in keyof T]-?: T[K] };

/**
 * Interface describing the AGS widget mixin methods and properties.
 *
 * All AGS widgets implement this interface, which provides reactive
 * binding, signal hooking, polling, and keybinding capabilities on
 * top of standard GTK widgets.
 *
 * @typeParam Attr - The custom attribute type
 */
export interface Widget<Attr> extends Required<CommonProps<Attr>> {
    /**
     * Connects to a GObject signal and automatically disconnects on widget destroy.
     *
     * The callback is also invoked once immediately (idle) with the current state.
     *
     * @param gobject - The GObject to observe
     * @param callback - Callback invoked on signal emission
     * @param signal - The signal name to connect to
     * @returns `this` for chaining
     */
    hook(
        gobject: Connectable,
        callback: (self: this, ...args: any[]) => void,
        signal?: string,
    ): this;

    /**
     * Binds a widget property to a GObject property.
     *
     * @param prop - The widget property to update
     * @param gobject - The source GObject
     * @param objProp - The source property (defaults to `'value'`)
     * @param transform - Optional transform function
     * @returns `this` for chaining
     */
    bind<
        Prop extends keyof Props<this>,
        GObj extends Connectable,
        ObjProp extends keyof Props<GObj>,
    >(
        prop: Prop,
        gobject: GObj,
        objProp?: ObjProp,
        transform?: (value: GObj[ObjProp]) => this[Prop],
    ): this;

    /**
     * Connects a callback to a signal on this widget.
     *
     * @param signal - The signal name
     * @param callback - The callback
     * @returns `this` for chaining
     */
    on(signal: string, callback: (self: this, ...args: any[]) => void): this;

    /**
     * Calls a callback at a regular interval, automatically stopping on widget destroy.
     *
     * @param timeout - Interval in milliseconds
     * @param callback - The callback to invoke
     * @returns `this` for chaining
     */
    poll(timeout: number, callback: (self: this) => void): this;

    /**
     * Registers a keyboard shortcut on this widget.
     *
     * Can be called with just a key, or with modifier keys + key.
     *
     * @example
     * ```typescript
     * widget
     *     .keybind('Escape', self => self.hide())
     *     .keybind(['CONTROL'], 'q', () => App.quit());
     * ```
     */
    keybind<Fn extends (self: this, event: Gdk.Event) => void, Key extends keyof Keys>(
        key: Key,
        callback: Fn,
    ): this;

    keybind<
        Fn extends (self: this, event: Gdk.Event) => void,
        Key extends keyof Keys,
        Mod extends Array<keyof ModifierKey>,
    >(
        mods: Mod,
        key: Key,
        callback: Fn,
    ): this;

    /** Whether this widget has been destroyed. */
    readonly is_destroyed: boolean;
    /** @internal */
    _handleParamProp(prop: keyof this, value: any): void;
    /** @internal */
    _get<T>(field: string): T;
    /** @internal */
    _set<T>(field: string, value: T, notify?: boolean): void;

    /**
     * Adds or removes a CSS class name.
     *
     * @param className - The CSS class name
     * @param condition - If `true` (default), adds the class; if `false`, removes it
     */
    toggleClassName(className: string, condition?: boolean): void;
    /**
     * Sets inline CSS on this widget, wrapping in `* { ... }` if needed.
     *
     * @param css - CSS string
     */
    setCss(css: string): void;
    /**
     * Checks whether the pointer is currently over this widget.
     *
     * @param event - Optional GDK event to use for coordinates
     * @returns `true` if the pointer is within the widget bounds
     */
    isHovered(event?: Gdk.Event): boolean;
}

/**
 * Base class that adds AGS widget features to `Gtk.Widget`.
 *
 * Provides reactive property binding, signal hooking, CSS management,
 * cursor handling, keyboard shortcuts, and other convenience methods.
 * Individual widget types (Box, Label, etc.) mix in this class's
 * prototype via {@link register}.
 *
 * @typeParam Attr - The type of the custom `attribute` field
 */
export class AgsWidget<Attr> extends Gtk.Widget implements Widget<Attr> {
    /** Custom user data attached to this widget. */
    set attribute(attr: Attr) {
        this._set('attribute', attr);
    }

    get attribute(): Attr {
        return this._get('attribute');
    }

    _onHandlerIds: number[] = [];
    _cursorHandlersConnected = false;

    hook(
        gobject: Connectable,
        callback: (self: this, ...args: any[]) => void,
        signal?: string,
    ): this {
        const con = typeof gobject?.connect !== 'function';
        const discon = typeof gobject?.disconnect !== 'function';
        if (con || discon) {
            console.error(
                Error(
                    `${gobject} is not a Connectable, missing ` +
                        ` ${[con ? 'connect' : '', discon ? 'disconnect' : ''].join(', ')} function`,
                ),
            );
            return this;
        }

        const id = gobject.connect(signal!, (_, ...args: unknown[]) => {
            callback(this, ...args);
        });

        this.connect('destroy', () => {
            gobject.disconnect(id);
        });

        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            if (!this.is_destroyed) callback(this);

            return GLib.SOURCE_REMOVE;
        });

        return this;
    }

    bind<
        Prop extends keyof Props<this>,
        GObj extends Connectable,
        ObjProp extends keyof Props<GObj>,
    >(
        prop: Prop,
        gobject: GObj,
        objProp?: ObjProp,
        transform?: (value: GObj[ObjProp]) => this[Prop],
    ): this {
        const targetProp = objProp || 'value';
        const callback = transform
            ? () => {
                  // @ts-expect-error too lazy to type
                  this[prop] = transform(gobject[targetProp]);
              }
            : () => {
                  // @ts-expect-error too lazy to type
                  this[prop] = gobject[targetProp];
              };

        this.hook(gobject, callback, `notify::${kebabify(targetProp)}`);
        return this;
    }

    on(signal: string, callback: (self: this, ...args: any[]) => void): this {
        if (!this._onHandlerIds) this._onHandlerIds = [];
        const id = this.connect(signal, callback);
        this._onHandlerIds.push(id);
        return this;
    }

    poll(timeout: number, callback: (self: this) => void): this {
        interval(timeout, () => callback(this), this);
        return this;
    }

    keybind<
        Fn extends (self: this, event: Gdk.Event) => void,
        Key extends keyof Keys,
        Mod extends Array<keyof ModifierKey>,
    >(modsOrKey: Key | Mod, keyOrCallback: Key | Fn, callback?: Fn): this {
        const mods = callback ? (modsOrKey as Mod) : ([] as unknown as Mod);
        const key = callback ? (keyOrCallback as Key) : (modsOrKey as Key);
        const fn = callback ? callback : (keyOrCallback as Fn);

        this.connect('key-press-event', (_, event: Gdk.Event) => {
            const k = event.get_keyval()[1];
            const m = event.get_state()[1];
            const ms = mods.reduce((ms, m) => ms | Gdk.ModifierType[`${m}_MASK`], 0);

            if (mods.length > 0 && k === Gdk[`KEY_${key}`] && m === ms) return fn(this, event);

            if (mods.length === 0 && k === Gdk[`KEY_${key}`]) return fn(this, event);
        });

        return this;
    }

    _init(
        config: BaseProps<
            this,
            Gtk.Widget.ConstructorProps & { child?: Gtk.Widget },
            Attr
        > = {} as any,
        child?: Gtk.Widget,
    ) {
        this._onHandlerIds = [];
        const { setup, attribute, ...props } = config || {};

        const binds = (Object.keys(props) as Array<keyof typeof props>)
            .map(prop => {
                if (props[prop] instanceof Binding) {
                    const bind = [prop, props[prop]];
                    delete props[prop];
                    return bind;
                }
            })
            .filter(pair => pair);

        if (child) props.child = child;

        super._init(props as Gtk.Widget.ConstructorProps);

        if (attribute !== undefined) this._set('attribute', attribute);

        (binds as unknown as Array<[keyof Props<this>, Binding<any, any, any>]>).forEach(
            ([selfProp, { emitter, prop, transformFn }]) => {
                this.bind(selfProp, emitter, prop, transformFn);
            },
        );

        this.connect('destroy', () => {
            if (this._onHandlerIds) {
                for (const id of this._onHandlerIds) {
                    this.disconnect(id);
                }
                this._onHandlerIds = [];
            }
            this._set('is-destroyed', true);
        });

        idle(() => {
            if (this.click_through && !this.is_destroyed)
                this.input_shape_combine_region(new Cairo.Region());
        });

        if (setup) setup(this);
    }

    _handleParamProp<Props>(prop: keyof Props, value: any) {
        if (value === undefined) return;

        if (value instanceof Binding)
            // @ts-expect-error implementation in Connectable
            this.bind(prop, value.emitter, value.prop, value.transformFn);
        else this[prop as keyof this] = value;
    }

    get is_destroyed(): boolean {
        return this._get('is-destroyed') || false;
    }

    // defining private fields for typescript causes
    // gobject constructor field setters to be overridden
    // so we use this _get and _set to avoid @ts-expect-error everywhere
    _get<T>(field: string) {
        return (this as unknown as { [key: string]: unknown })[`__${field}`] as T;
    }

    _set<T>(field: string, value: T, notify = true) {
        if (this._get(field) === value) return;

        (this as unknown as { [key: string]: T })[`__${field}`] = value;

        if (notify) this.notify(field);
    }

    _setPack(orientation: 'h' | 'v', align: Align) {
        if (!align) return;

        if (!ALIGN_KEYS.has(align)) {
            return console.error(
                Error(
                    `${orientation}pack has to be on of ${Object.keys(ALIGN)}, but it is ${align}`,
                ),
            );
        }

        this[`${orientation}align`] = ALIGN[align];
    }

    _getPack(orientation: 'h' | 'v') {
        return Object.keys(ALIGN).find(align => {
            return ALIGN[align as Align] === this[`${orientation}align`];
        }) as Align;
    }

    /** Horizontal alignment: `'fill'`, `'start'`, `'end'`, `'center'`, or `'baseline'`. */
    get hpack() {
        return this._getPack('h');
    }

    set hpack(align: Align) {
        this._setPack('h', align);
    }

    /** Vertical alignment: `'fill'`, `'start'`, `'end'`, `'center'`, or `'baseline'`. */
    get vpack() {
        return this._getPack('v');
    }

    set vpack(align: Align) {
        this._setPack('v', align);
    }

    toggleClassName(className: string, condition = true, notify = true) {
        const c = this.get_style_context();
        condition ? c.add_class(className) : c.remove_class(className);

        if (notify) {
            this.notify('class-names');
            this.notify('class-name');
        }
    }

    /** Space-separated CSS class names. */
    get class_name() {
        return this.class_names.join(' ');
    }

    set class_name(names: string) {
        this.class_names = names.split(/\s+/);
    }

    /** Array of CSS class names. */
    get class_names() {
        return this.get_style_context().list_classes() || [];
    }

    set class_names(names: string[]) {
        this.class_names.forEach((cn: string) => this.toggleClassName(cn, false, false));
        names.forEach(cn => this.toggleClassName(cn, true, false));
        this.notify('class-names');
        this.notify('class-name');
    }

    _cssProvider!: Gtk.CssProvider;
    setCss(css: string) {
        if (!css.includes('{') || !css.includes('}')) css = `* { ${css} }`;

        if (this._cssProvider) this.get_style_context().remove_provider(this._cssProvider);

        this._cssProvider = new Gtk.CssProvider();
        this._cssProvider.load_from_data(new TextEncoder().encode(css));
        this.get_style_context().add_provider(this._cssProvider, Gtk.STYLE_PROVIDER_PRIORITY_USER);

        this.notify('css');
    }

    /** Inline CSS applied to this widget. */
    get css() {
        return this._cssProvider?.to_string() || '';
    }

    set css(css: string) {
        if (!css) return;

        this.setCss(css);
    }

    _updateCursor() {
        if (!this.cursor) return;

        const display = Gdk.Display.get_default();

        if (this.isHovered() && display) {
            const cursor = Gdk.Cursor.new_from_name(display, this.cursor);
            this.get_window()?.set_cursor(cursor);
        } else if (display) {
            const cursor = Gdk.Cursor.new_from_name(display, 'default');
            this.get_window()?.set_cursor(cursor);
        }
    }

    /** CSS cursor name displayed when the pointer hovers this widget. */
    get cursor() {
        return this._get('cursor');
    }

    set cursor(cursor: Cursor) {
        this._set('cursor', cursor);

        if (cursor && !this._cursorHandlersConnected) {
            this._cursorHandlersConnected = true;
            this.add_events(Gdk.EventMask.ENTER_NOTIFY_MASK);
            this.add_events(Gdk.EventMask.LEAVE_NOTIFY_MASK);
            this.connect('enter-notify-event', this._updateCursor.bind(this));
            this.connect('leave-notify-event', this._updateCursor.bind(this));
        }

        this._updateCursor();
    }

    isHovered(event?: Gdk.Event) {
        let [x, y] = this.get_pointer();
        const { width: w, height: h } = this.get_allocation();
        if (event) [, x, y] = event.get_coords();

        return x > 0 && x < w && y > 0 && y < h;
    }

    /** Whether input events pass through this widget to widgets below. */
    get click_through() {
        return !!this._get('click-through');
    }

    set click_through(clickThrough: boolean) {
        if (this.click_through === clickThrough) return;

        const value = clickThrough ? new Cairo.Region() : null;
        this.input_shape_combine_region(value);
        this._set('click-through', value);
        this.notify('click-through');
    }
}

/**
 * Registers a GTK widget class as an AGS widget.
 *
 * Mixes in all {@link AgsWidget} prototype methods and registers the class
 * as a GObject with AGS-specific properties (class-name, css, cursor, etc.).
 *
 * @param klass - The GTK widget class to register
 * @param config - Registration options including GObject signals, properties, and CSS name
 * @returns The registered class
 */
export function register<T extends { new (...args: any[]): Gtk.Widget }>(
    klass: T,
    config?: Parameters<typeof registerGObject>[1] & { cssName?: string },
) {
    Object.getOwnPropertyNames(AgsWidget.prototype).forEach(name => {
        Object.defineProperty(
            klass.prototype,
            name,
            Object.getOwnPropertyDescriptor(AgsWidget.prototype, name) || Object.create(null),
        );
    });

    return registerGObject(klass, {
        cssName: config?.cssName,
        typename: config?.typename || `Ags_${klass.name}`,
        signals: config?.signals,
        properties: {
            ...config?.properties,
            'class-name': ['string', 'rw'],
            'class-names': ['jsobject', 'rw'],
            css: ['string', 'rw'],
            hpack: ['string', 'rw'],
            vpack: ['string', 'rw'],
            cursor: ['string', 'rw'],
            'is-destroyed': ['boolean', 'r'],
            attribute: ['jsobject', 'rw'],
            'click-through': ['boolean', 'rw'],
        },
    });
}
