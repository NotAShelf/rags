import { register, type BaseProps, type Widget } from './widget.js';
import Gtk from 'gi://Gtk?version=3.0';

/** Props for the Notebook tabbed-container widget. */
export type NotebookProps<Attr = unknown, Self = Notebook<Attr>> = BaseProps<
    Self,
    Gtk.Notebook.ConstructorProps,
    Attr
>;

/** Creates a new Notebook widget. */
export function newNotebook<Attr = unknown>(
    ...props: ConstructorParameters<typeof Notebook<Attr>>
) {
    return new Notebook(...props);
}

export interface Notebook<Attr> extends Widget<Attr> {}
/** A container that shows one page at a time, selected by a row of tabs. */
export class Notebook<Attr> extends Gtk.Notebook {
    static {
        register(this);
    }

    constructor(props: NotebookProps<Attr> = {} as NotebookProps<Attr>) {
        const { setup, ...rest } = props as any;
        super(rest as Gtk.Notebook.ConstructorProps);
        if (typeof setup === 'function') setup(this);
    }
}

export default Notebook;
