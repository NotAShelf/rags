import { register, type BaseProps, type Widget } from './widget.js';
import Gtk from 'gi://Gtk?version=3.0';

// TODO:

/** Props for the Fixed position container widget. */
export type FixedProps<Attr = unknown, Self = Fixed<Attr>> = BaseProps<
    Self,
    Gtk.Fixed.ConstructorProps,
    Attr
>;

/** Create a new Fixed container for placing children at exact positions. */
export function newFixed<Attr = unknown>(...props: ConstructorParameters<typeof Fixed<Attr>>) {
    return new Fixed(...props);
}

export interface Fixed<Attr> extends Widget<Attr> {}
/** A container that places children at fixed pixel coordinates. */
export class Fixed<Attr> extends Gtk.Fixed {
    static {
        register(this);
    }

    constructor(props: FixedProps<Attr> = {} as FixedProps<Attr>) {
        const { setup, ...rest } = props as any;
        super(rest as Gtk.Fixed.ConstructorProps);
        if (typeof setup === 'function') setup(this);
    }
}

export default Fixed;
