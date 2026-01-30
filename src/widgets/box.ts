import { register, type BaseProps, type Widget } from './widget.js';
import Gtk from 'gi://Gtk?version=3.0';

/** Props for the Box container widget. */
export type BoxProps<
    Child extends Gtk.Widget = Gtk.Widget,
    Attr = unknown,
    Self = Box<Child, Attr>,
> = BaseProps<
    Self,
    Gtk.Box.ConstructorProps & {
        child?: Child;
        children?: Child[];
        vertical?: boolean;
    },
    Attr
>;

/**
 * Create a new Box container widget.
 * @example
 * const myBox = newBox({ vertical: true, children: [child1, child2] });
 * const hBox = newBox([child1, child2]);
 */
export function newBox<Child extends Gtk.Widget = Gtk.Widget, Attr = unknown>(
    ...props: ConstructorParameters<typeof Box<Child, Attr>>
) {
    return new Box(...props);
}

export interface Box<Child, Attr> extends Widget<Attr> {}
/** A container that arranges children in a single row or column. */
export class Box<Child extends Gtk.Widget, Attr> extends Gtk.Box {
    static {
        register(this, {
            properties: {
                vertical: ['boolean', 'rw'],
                children: ['jsobject', 'rw'],
            },
        });
    }

    constructor(
        propsOrChildren: BoxProps<Child, Attr> | Child[] = {} as BoxProps<Child, Attr>,
        ...children: Gtk.Widget[]
    ) {
        const props: any = Array.isArray(propsOrChildren) ? {} : propsOrChildren;

        if (Array.isArray(propsOrChildren)) props.children = propsOrChildren;
        else if (children.length > 0) props.children = children as Child[];

        super(props as Gtk.Box.ConstructorProps);
        this.connect('notify::orientation', () => this.notify('vertical'));
    }

    /** The first child widget. */
    get child() {
        return this.children[0] as Child;
    }

    set child(child: Child) {
        this.children = [child];
    }

    /** The list of child widgets in this box. */
    get children() {
        return this.get_children() as Child[];
    }

    set children(children: Child[]) {
        const newChildren = children || [];
        const newSet = new Set(newChildren);
        const oldChildren = this.get_children();

        for (const ch of oldChildren) {
            if (!newSet.has(ch as Child)) {
                ch.destroy();
            } else {
                this.remove(ch);
            }
        }

        if (!children) return;

        for (const w of newChildren) {
            if (w) this.add(w);
        }
        this.notify('children');
        this.show_all();
    }

    /** Whether the box lays out children vertically. */
    get vertical() {
        return this.orientation === Gtk.Orientation.VERTICAL;
    }

    set vertical(v: boolean) {
        this.orientation = Gtk.Orientation[v ? 'VERTICAL' : 'HORIZONTAL'];
    }
}

export default Box;
