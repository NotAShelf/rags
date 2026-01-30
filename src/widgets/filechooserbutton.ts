import { register, type BaseProps, type Widget } from './widget.js';
import Gtk from 'gi://Gtk?version=3.0';

type Event<Self> = (self: Self) => void | boolean;

/** Props for the FileChooserButton file selection widget. */
export type FileChooserButtonProps<
    Child extends Gtk.Widget = Gtk.Widget,
    Attr = unknown,
    Self = FileChooserButton<Child, Attr>,
> = BaseProps<
    Self,
    Gtk.FileChooserButton.ConstructorProps & {
        child?: Child;
        on_file_set?: Event<Self>;
    },
    Attr
>;

/** Create a new FileChooserButton for selecting files. */
export function newFileChooserButton<Child extends Gtk.Widget = Gtk.Widget, Attr = unknown>(
    ...props: ConstructorParameters<typeof FileChooserButton<Child, Attr>>
) {
    return new FileChooserButton(...props);
}

export interface FileChooserButton<Child, Attr> extends Widget<Attr> {}
/** A button that opens a file chooser dialog. */
export class FileChooserButton<Child extends Gtk.Widget, Attr> extends Gtk.FileChooserButton {
    static {
        register(this, {
            properties: {
                'on-file-set': ['jsobject', 'rw'],
            },
        });
    }

    constructor(
        props: FileChooserButtonProps<Child, Attr> = {} as FileChooserButtonProps<Child, Attr>,
        child?: Child,
    ) {
        if (child) props.child = child;

        super(props as Gtk.FileChooserButton.ConstructorProps);
        this.connect('file-set', this.on_file_set.bind(this));
    }

    /** The child widget inside the button. */
    get child() {
        return super.child as Child;
    }

    set child(child: Child) {
        super.child = child;
    }

    /** Callback invoked when a file is selected. */
    get on_file_set() {
        return this._get('on-file-set') || (() => false);
    }

    set on_file_set(callback: Event<this>) {
        this._set('on-file-set', callback);
    }

    /** The URI of the currently selected file. */
    get uri() {
        return this.get_uri();
    }

    /** The URIs of all currently selected files. */
    get uris() {
        return this.get_uris();
    }
}

export default FileChooserButton;
