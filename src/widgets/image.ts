import { register, type BaseProps, type Widget } from './widget.js';
import Gtk from 'gi://Gtk?version=3.0';

/** Props for the Image widget. */
export type ImageProps<Attr = unknown, Self = Image<Attr>> = BaseProps<
    Self,
    Gtk.Image.ConstructorProps,
    Attr
>;

/** Creates a new Image widget. */
export function newImage<Attr = unknown>(...props: ConstructorParameters<typeof Image<Attr>>) {
    return new Image(...props);
}

export interface Image<Attr> extends Widget<Attr> {}
/** Displays an image from a file path, icon name, or GIcon. */
export class Image<Attr> extends Gtk.Image {
    static {
        register(this);
    }

    constructor(props: ImageProps<Attr> = {} as ImageProps<Attr>) {
        const { setup, ...rest } = props as any;
        super(rest as Gtk.Image.ConstructorProps);
        if (typeof setup === 'function') setup(this);
    }
}

export default Image;
