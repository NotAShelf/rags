import { register, type BaseProps, type Widget } from './widget.js';
import Gtk from 'gi://Gtk?version=3.0';

/** Props for the Grid layout widget. */
export type GridProps<Attr = unknown, Self = Grid<Attr>> = BaseProps<
    Self,
    Gtk.Grid.ConstructorProps,
    Attr
>;

/** Creates a new Grid layout widget. */
export function newGrid<Attr = unknown>(...props: ConstructorParameters<typeof Grid<Attr>>) {
    return new Grid(...props);
}

export interface Grid<Attr> extends Widget<Attr> {}
/** A container that arranges children in rows and columns. */
export class Grid<Attr> extends Gtk.Grid {
    static {
        register(this);
    }

    constructor(props: GridProps<Attr> = {} as GridProps<Attr>) {
        const { setup, ...rest } = props as any;
        super(rest as Gtk.Grid.ConstructorProps);
        if (typeof setup === 'function') setup(this);
    }
}

export default Grid;
