import { register, type BaseProps, type Widget } from './widget.js';
import Gtk from 'gi://Gtk?version=3.0';

/** Props for the Expander widget. */
export type ExpanderProps<Attr = unknown, Self = Expander<Attr>> = BaseProps<
    Self,
    Gtk.Expander.ConstructorProps,
    Attr
>;

/** Creates a new Expander widget. */
export function newExpander<Attr = unknown>(
    ...props: ConstructorParameters<typeof Expander<Attr>>
) {
    return new Expander(...props);
}

export interface Expander<Attr> extends Widget<Attr> {}
/** A container with a clickable label that can show or hide its child. */
export class Expander<Attr> extends Gtk.Expander {
    static {
        register(this);
    }

    constructor(props: ExpanderProps<Attr> = {} as ExpanderProps<Attr>) {
        const { setup, ...rest } = props as any;
        super(rest as Gtk.Expander.ConstructorProps);
        if (typeof setup === 'function') setup(this);
    }
}

export default Expander;
