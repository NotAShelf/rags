import { register, type BaseProps, type Widget } from './widget.js';
import Gtk from 'gi://Gtk?version=3.0';

type Event<Self> = (self: Self) => void | boolean;

/** Props for the Switch widget. */
export type SwitchProps<Attr = unknown, Self = Switch<Attr>> = BaseProps<
    Self,
    Gtk.Switch.ConstructorProps & {
        on_activate?: Event<Self>;
    },
    Attr
>;

/** Creates a new Switch widget for toggling a boolean state. */
export function newSwitch<Attr = unknown>(...props: ConstructorParameters<typeof Switch<Attr>>) {
    return new Switch(...props);
}

/** GTK Switch wrapper for an on/off toggle control. */
export interface Switch<Attr> extends Widget<Attr> {}
export class Switch<Attr> extends Gtk.Switch {
    static {
        register(this, {
            properties: {
                'on-activate': ['jsobject', 'rw'],
            },
        });
    }

    constructor(props: SwitchProps<Attr> = {} as SwitchProps<Attr>) {
        const { setup, ...rest } = props as any;
        super(rest as Gtk.Switch.ConstructorProps);
        this.connect('notify::active', this.on_activate.bind(this));
        if (typeof setup === 'function') setup(this);
    }

    /** Callback invoked when the switch is toggled. */
    get on_activate() {
        return this._get('on-activate') || (() => false);
    }

    set on_activate(callback: Event<this>) {
        this._set('on-activate', callback);
    }
}

export default Switch;
