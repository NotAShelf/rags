import { register, type BaseProps, type Widget } from './widget.js';
import Gtk from 'gi://Gtk?version=3.0';

/** Props for the HeaderBar widget. */
export type HeaderBarProps<Attr = unknown, Self = HeaderBar<Attr>> = BaseProps<
    Self,
    Gtk.HeaderBar.ConstructorProps,
    Attr
>;

/** Creates a new HeaderBar widget. */
export function newHeaderBar<Attr = unknown>(
    ...props: ConstructorParameters<typeof HeaderBar<Attr>>
) {
    return new HeaderBar(...props);
}

export interface HeaderBar<Attr> extends Widget<Attr> {}
/** A box with a centred title, left/right packing areas, and optional window controls. */
export class HeaderBar<Attr> extends Gtk.HeaderBar {
    static {
        register(this);
    }

    constructor(props: HeaderBarProps<Attr> = {} as HeaderBarProps<Attr>) {
        const { setup, ...rest } = props as any;
        super(rest as Gtk.HeaderBar.ConstructorProps);
        if (typeof setup === 'function') setup(this);
    }
}

export default HeaderBar;
