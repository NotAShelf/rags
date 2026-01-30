import { register, type BaseProps, type Widget } from './widget.js';
import Gtk from 'gi://Gtk?version=3.0';

// TODO:

/** Props for the FlowBox reflowing container widget. */
export type FlowBoxProps<Attr = unknown, Self = FlowBox<Attr>> = BaseProps<
    Self,
    Gtk.FlowBox.ConstructorProps,
    Attr
>;

/** Create a new FlowBox that dynamically reflows its children. */
export function newFlowBox<Attr = unknown>(...props: ConstructorParameters<typeof FlowBox<Attr>>) {
    return new FlowBox(...props);
}

export interface FlowBox<Attr> extends Widget<Attr> {}
/** A container that reflows its children based on available space. */
export class FlowBox<Attr> extends Gtk.FlowBox {
    static {
        register(this);
    }

    constructor(props: FlowBoxProps<Attr> = {} as FlowBoxProps<Attr>) {
        const { setup, ...rest } = props as any;
        super(rest as Gtk.FlowBox.ConstructorProps);
        if (typeof setup === 'function') setup(this);
    }
}

export default FlowBox;
