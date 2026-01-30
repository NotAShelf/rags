import { register, type BaseProps, type Widget } from './widget.js';
import Gtk from 'gi://Gtk?version=3.0';

type BarMode = 'continuous' | 'discrete';

/** Props for the LevelBar progress indicator widget. */
export type LevelBarProps<Attr = unknown, Self = LevelBar<Attr>> = BaseProps<
    Self,
    Gtk.LevelBar.ConstructorProps & {
        bar_mode?: BarMode;
        vertical?: boolean;
    },
    Attr
>;

/** Create a new LevelBar for displaying a value within a range. */
export function newLevelBar<Attr = unknown>(
    ...props: ConstructorParameters<typeof LevelBar<Attr>>
) {
    return new LevelBar(...props);
}

export interface LevelBar<Attr> extends Widget<Attr> {}
/** A bar widget that displays a value as a filled level indicator. */
export class LevelBar<Attr> extends Gtk.LevelBar {
    static {
        register(this, {
            properties: {
                'bar-mode': ['string', 'rw'],
                vertical: ['boolean', 'rw'],
            },
        });
    }

    constructor(props: LevelBarProps<Attr> = {} as LevelBarProps<Attr>) {
        super(props as Gtk.LevelBar.ConstructorProps);
        this.connect('notify::mode', () => this.notify('bar-mode'));
        this.connect('notify::orientation', () => this.notify('vertical'));
    }

    /** The bar display mode: 'continuous' or 'discrete'. */
    get bar_mode() {
        return this.mode === Gtk.LevelBarMode.CONTINUOUS ? 'continuous' : 'discrete';
    }

    set bar_mode(mode: BarMode) {
        this.mode = Gtk.LevelBarMode[mode === 'continuous' ? 'CONTINUOUS' : 'DISCRETE'];
    }

    /** Whether the level bar is oriented vertically. */
    get vertical() {
        return this.orientation === Gtk.Orientation.VERTICAL;
    }

    set vertical(v: boolean) {
        this.orientation = Gtk.Orientation[v ? 'VERTICAL' : 'HORIZONTAL'];
    }
}

export default LevelBar;
