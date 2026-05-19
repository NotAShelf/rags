import { register, type BaseProps, type Widget } from './widget.js';
import Gtk from 'gi://Gtk?version=3.0';

/** Props for the Paned split-view widget. */
export type PanedProps<
    Start extends Gtk.Widget = Gtk.Widget,
    End extends Gtk.Widget = Gtk.Widget,
    Attr = unknown,
    Self = Paned<Start, End, Attr>,
> = BaseProps<
    Self,
    Gtk.Paned.ConstructorProps & {
        start_child?: Start;
        end_child?: End;
        vertical?: boolean;
    },
    Attr
>;

/** Creates a new Paned split-view widget. */
export function newPaned<
    Start extends Gtk.Widget = Gtk.Widget,
    End extends Gtk.Widget = Gtk.Widget,
    Attr = unknown,
>(...props: ConstructorParameters<typeof Paned<Start, End, Attr>>) {
    return new Paned(...props);
}

export interface Paned<Start, End, Attr> extends Widget<Attr> {}
/** A container with two panes separated by a draggable divider. */
export class Paned<Start extends Gtk.Widget, End extends Gtk.Widget, Attr> extends Gtk.Paned {
    static {
        register(this, {
            properties: {
                vertical: ['boolean', 'rw'],
                'start-child': ['jsobject', 'rw'],
                'end-child': ['jsobject', 'rw'],
            },
        });
    }

    constructor(props: PanedProps<Start, End, Attr> = {} as PanedProps<Start, End, Attr>) {
        const { setup, start_child, end_child, vertical, ...rest } = props as any;
        super(rest as Gtk.Paned.ConstructorProps);

        if (vertical !== undefined)
            this.orientation = Gtk.Orientation[vertical ? 'VERTICAL' : 'HORIZONTAL'];
        if (start_child) this.add1(start_child);
        if (end_child) this.add2(end_child);

        if (typeof setup === 'function') setup(this);
    }

    /** Whether the divider is oriented horizontally (panes stacked top/bottom). */
    get vertical() {
        return this.orientation === Gtk.Orientation.VERTICAL;
    }

    set vertical(v: boolean) {
        this.orientation = Gtk.Orientation[v ? 'VERTICAL' : 'HORIZONTAL'];
    }

    /** The first (top/left) child widget. */
    get start_child() {
        return this.get_child1() as Start | null;
    }

    set start_child(child: Start | null) {
        const current = this.get_child1();
        if (current) this.remove(current);
        if (child) this.add1(child);
    }

    /** The second (bottom/right) child widget. */
    get end_child() {
        return this.get_child2() as End | null;
    }

    set end_child(child: End | null) {
        const current = this.get_child2();
        if (current) this.remove(current);
        if (child) this.add2(child);
    }
}

export default Paned;
