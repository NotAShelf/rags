import { register, type BaseProps, type Widget } from './widget.js';
import Gtk from 'gi://Gtk?version=3.0';

/** Props for the ProgressBar widget. */
export type ProgressBarProps<Attr = unknown, Self = ProgressBar<Attr>> = BaseProps<
    Self,
    Gtk.ProgressBar.ConstructorProps & {
        vertical?: boolean;
        value?: number;
    },
    Attr
>;

/** Creates a new ProgressBar widget for displaying progress as a filled bar. */
export function newProgressBar<Attr = unknown>(
    ...props: ConstructorParameters<typeof ProgressBar<Attr>>
) {
    return new ProgressBar(...props);
}

/** GTK ProgressBar wrapper for displaying a progress indicator. */
export interface ProgressBar<Attr> extends Widget<Attr> {}
export class ProgressBar<Attr> extends Gtk.ProgressBar {
    static {
        register(this, {
            properties: {
                vertical: ['boolean', 'rw'],
                value: ['float', 'rw'],
            },
        });
    }

    constructor(props: ProgressBarProps<Attr> = {} as ProgressBarProps<Attr>) {
        const { setup, ...rest } = props as any;
        super(rest as Gtk.ProgressBar.ConstructorProps);
        this.connect('notify::fraction', () => this.notify('value'));
        this.connect('notify::orientation', () => this.notify('vertical'));

        if (typeof setup === 'function') setup(this);
    }

    /** The progress value, an alias for the underlying `fraction` property. */
    get value() {
        return this.fraction;
    }

    set value(value: number) {
        this.fraction = value;
    }

    /** Whether the progress bar is oriented vertically. */
    get vertical() {
        return this.orientation === Gtk.Orientation.VERTICAL;
    }

    set vertical(v: boolean) {
        this.orientation = Gtk.Orientation[v ? 'VERTICAL' : 'HORIZONTAL'];
    }
}

export default ProgressBar;
