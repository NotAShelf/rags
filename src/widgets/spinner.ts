import { register, type BaseProps, type Widget } from './widget.js';
import Gtk from 'gi://Gtk?version=3.0';

/** Props for the Spinner widget. */
export type SpinnerProps<Attr = unknown> = BaseProps<
    Spinner<Attr>,
    Gtk.Spinner.ConstructorProps,
    Attr
>;

/** Creates a new Spinner widget that displays a loading animation. */
export function newSpinner<Attr = unknown>(...props: ConstructorParameters<typeof Spinner<Attr>>) {
    return new Spinner(...props);
}

/** GTK Spinner wrapper that automatically starts and stops based on visibility. */
export interface Spinner<Attr> extends Widget<Attr> {}
export class Spinner<Attr> extends Gtk.Spinner {
    static {
        register(this);
    }

    constructor(
        props: BaseProps<Spinner<Attr>, Gtk.Spinner.ConstructorProps, Attr> = {} as BaseProps<
            Spinner<Attr>,
            Gtk.Spinner.ConstructorProps,
            Attr
        >,
    ) {
        const { setup, ...rest } = props as any;
        super(rest as Gtk.Widget.ConstructorProps);
        this.start();
        this.connect('notify::visible', ({ visible }) => {
            visible ? this.start() : this.stop();
        });
        if (typeof setup === 'function') setup(this);
    }
}

export default Spinner;
