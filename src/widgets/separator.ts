import { register, type BaseProps, type Widget } from './widget.js';
import Gtk from 'gi://Gtk?version=3.0';

export type SeparatorProps<Attr = unknown, Self = Separator<Attr>> = BaseProps<
    Self,
    Gtk.Separator.ConstructorProps & {
        vertical?: boolean;
    },
    Attr
>;

export function newSeparator<Attr = unknown>(
    ...props: ConstructorParameters<typeof Separator<Attr>>
) {
    return new Separator(...props);
}

export interface Separator<Attr> extends Widget<Attr> {}
export class Separator<Attr> extends Gtk.Separator {
    static {
        register(this, {
            properties: {
                vertical: ['boolean', 'rw'],
            },
        });
    }

    constructor(props: SeparatorProps<Attr> = {} as SeparatorProps<Attr>) {
        super(props as Gtk.Separator.ConstructorProps);
        this.connect('notify::orientation', () => this.notify('vertical'));
    }

    get vertical() {
        return this.orientation === Gtk.Orientation.VERTICAL;
    }
    set vertical(v: boolean) {
        this.orientation = Gtk.Orientation[v ? 'VERTICAL' : 'HORIZONTAL'];
    }
}

export default Separator;
