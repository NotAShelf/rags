import { register, type BaseProps, type Widget } from './widget.js';
import Gtk from 'gi://Gtk?version=3.0';

type Event<Self> = (self: Self) => void | boolean;

/** Props for the FontButton font chooser widget. */
export type FontButtonProps<
    Child extends Gtk.Widget = Gtk.Widget,
    Attr = unknown,
    Self = FontButton<Child, Attr>,
> = BaseProps<
    Self,
    Gtk.FontButton.ConstructorProps & {
        child?: Child;
        on_font_set?: Event<Self>;
    },
    Attr
>;

/** Create a new FontButton for selecting fonts. */
export function newFontButton<Child extends Gtk.Widget = Gtk.Widget, Attr = unknown>(
    ...props: ConstructorParameters<typeof FontButton<Child, Attr>>
) {
    return new FontButton(...props);
}

export interface FontButton<Child, Attr> extends Widget<Attr> {}
/** A button that opens a font chooser dialog. */
export class FontButton<Child extends Gtk.Widget, Attr> extends Gtk.FontButton {
    static {
        register(this, {
            properties: {
                'on-font-set': ['jsobject', 'rw'],
            },
        });
    }

    constructor(
        props: FontButtonProps<Child, Attr> = {} as FontButtonProps<Child, Attr>,
        child?: Child,
    ) {
        if (child) props.child = child;

        super(props as Gtk.FontButton.ConstructorProps);
        this.connect('font-set', this.on_font_set.bind(this));
    }

    /** The child widget inside the button. */
    get child() {
        return super.child as Child;
    }

    set child(child: Child) {
        super.child = child;
    }

    /** Callback invoked when a font is selected. */
    get on_font_set() {
        return this._get('on-font-set') || (() => false);
    }

    set on_font_set(callback: Event<this>) {
        this._set('on-font-set', callback);
    }
}

export default FontButton;
