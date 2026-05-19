import { register, type BaseProps, type Widget } from './widget.js';
import Gtk from 'gi://Gtk?version=3.0';

/** Props for the TextView widget. */
export type TextViewProps<Attr = unknown, Self = TextView<Attr>> = BaseProps<
    Self,
    Gtk.TextView.ConstructorProps,
    Attr
>;

/** Creates a new TextView widget. */
export function newTextView<Attr = unknown>(
    ...props: ConstructorParameters<typeof TextView<Attr>>
) {
    return new TextView(...props);
}

export interface TextView<Attr> extends Widget<Attr> {}
/** A multiline text editor widget. */
export class TextView<Attr> extends Gtk.TextView {
    static {
        register(this);
    }

    constructor(props: TextViewProps<Attr> = {} as TextViewProps<Attr>) {
        const { setup, ...rest } = props as any;
        super(rest as Gtk.TextView.ConstructorProps);
        if (typeof setup === 'function') setup(this);
    }
}

export default TextView;
