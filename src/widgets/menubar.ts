import { register, type BaseProps, type Widget } from './widget.js';
import Gtk from 'gi://Gtk?version=3.0';

/** Props for the MenuBar widget. */
export type MenuBarProps<Attr = unknown, Self = MenuBar<Attr>> = BaseProps<
    Self,
    Gtk.MenuBar.ConstructorProps,
    Attr
>;

/** Creates a new MenuBar widget for displaying a horizontal menu bar. */
export function newMenuBar<Attr = unknown>(...props: ConstructorParameters<typeof MenuBar<Attr>>) {
    return new MenuBar(...props);
}

/** GTK MenuBar wrapper for displaying a horizontal bar of menu items. */
export interface MenuBar<Attr> extends Widget<Attr> {}
export class MenuBar<Attr> extends Gtk.MenuBar {
    static {
        register(this);
    }

    constructor(props: MenuBarProps<Attr> = {} as MenuBarProps<Attr>) {
        const { setup, ...rest } = props as any;
        super(rest as Gtk.MenuBar.ConstructorProps);
        if (typeof setup === 'function') setup(this);
    }
}

export default MenuBar;
