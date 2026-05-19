import { register, type BaseProps, type Widget } from './widget.js';
import Gtk from 'gi://Gtk?version=3.0';

/** Props for the Frame container widget. */
export type FrameProps<Attr = unknown, Self = Frame<Attr>> = BaseProps<
    Self,
    Gtk.Frame.ConstructorProps,
    Attr
>;

/** Creates a new Frame container widget. */
export function newFrame<Attr = unknown>(...props: ConstructorParameters<typeof Frame<Attr>>) {
    return new Frame(...props);
}

export interface Frame<Attr> extends Widget<Attr> {}
/** A bin widget that draws a decorative frame and optional label around a child. */
export class Frame<Attr> extends Gtk.Frame {
    static {
        register(this);
    }

    constructor(props: FrameProps<Attr> = {} as FrameProps<Attr>) {
        const { setup, ...rest } = props as any;
        super(rest as Gtk.Frame.ConstructorProps);
        if (typeof setup === 'function') setup(this);
    }
}

export default Frame;
