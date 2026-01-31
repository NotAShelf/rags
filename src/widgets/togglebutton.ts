import { register, type BaseProps, type Widget } from './widget.js';
import Gtk from 'gi://Gtk?version=3.0';

type Event<Self> = (self: Self) => void | boolean;

/** Props for the ToggleButton widget. */
export type ToggleButtonProps<
    Child extends Gtk.Widget = Gtk.Widget,
    Attr = unknown,
    Self = ToggleButton<Child, Attr>,
> = BaseProps<
    Self,
    Gtk.ToggleButton.ConstructorProps & {
        child?: Child;
        on_toggled?: Event<Self>;
    },
    Attr
>;

/** Creates a new ToggleButton widget that retains its pressed state. */
export function newToggleButton<Child extends Gtk.Widget = Gtk.Widget, Attr = unknown>(
    ...props: ConstructorParameters<typeof ToggleButton<Child, Attr>>
) {
    return new ToggleButton(...props);
}

/** GTK ToggleButton wrapper for a button that toggles between active and inactive states. */
export interface ToggleButton<Child, Attr> extends Widget<Attr> {}
export class ToggleButton<Child extends Gtk.Widget, Attr> extends Gtk.ToggleButton {
    static {
        register(this, {
            properties: {
                'on-toggled': ['jsobject', 'rw'],
            },
        });
    }

    constructor(
        props: ToggleButtonProps<Child, Attr> = {} as ToggleButtonProps<Child, Attr>,
        child?: Child,
    ) {
        if (child) props.child = child;

        const { setup, ...rest } = props as any;
        super(rest as Gtk.ToggleButton.ConstructorProps);
        this.connect('toggled', this.on_toggled.bind(this));
        if (typeof setup === 'function') setup(this);
    }

    /** The child widget of this toggle button. */
    get child() {
        return super.child as Child;
    }

    set child(child: Child) {
        super.child = child;
    }

    /** Callback invoked when the button is toggled. */
    get on_toggled() {
        return this._get('on-toggled') || (() => false);
    }

    set on_toggled(callback: Event<this>) {
        this._set('on-toggled', callback);
    }
}
