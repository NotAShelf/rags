import { register, type BaseProps, type Widget } from './widget.js';
import Gtk from 'gi://Gtk?version=3.0';

/** Props for the ListBox widget. */
export type ListBoxProps<Attr = unknown, Self = ListBox<Attr>> = BaseProps<
    Self,
    Gtk.ListBox.ConstructorProps,
    Attr
>;

/** Creates a new ListBox widget for displaying selectable rows. */
export function newListBox<Attr = unknown>(...props: ConstructorParameters<typeof ListBox<Attr>>) {
    return new ListBox(...props);
}

/** GTK ListBox wrapper for displaying a vertical list of selectable rows. */
export interface ListBox<Attr> extends Widget<Attr> {}
export class ListBox<Attr> extends Gtk.ListBox {
    static {
        register(this);
    }

    constructor(props: ListBoxProps<Attr> = {} as ListBoxProps<Attr>) {
        const { setup, ...rest } = props as any;
        super(rest as Gtk.ListBox.ConstructorProps);
        if (typeof setup === 'function') setup(this);
    }
}

export default ListBox;
