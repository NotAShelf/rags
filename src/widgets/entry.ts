import { register, type BaseProps, type Widget } from './widget.js';
import Gtk from 'gi://Gtk?version=3.0';

type EventHandler<Self> = (self: Self) => void | unknown;

/** Props for the Entry text input widget. */
export type EntryProps<Attr = unknown, Self = Entry<Attr>> = BaseProps<
    Self,
    Gtk.Entry.ConstructorProps & {
        on_accept?: EventHandler<Self>;
        on_change?: EventHandler<Self>;
    },
    Attr
>;

/**
 * Create a new Entry text input widget.
 * @example
 * const input = newEntry({
 *   placeholder_text: 'Type here...',
 *   on_accept: (self) => print(self.text),
 * });
 */
export function newEntry<Attr = unknown>(...props: ConstructorParameters<typeof Entry<Attr>>) {
    return new Entry(...props);
}

export interface Entry<Attr> extends Widget<Attr> {}
/** A single-line text input field. */
export class Entry<Attr> extends Gtk.Entry {
    static {
        register(this, {
            properties: {
                'on-accept': ['jsobject', 'rw'],
                'on-change': ['jsobject', 'rw'],
            },
        });
    }

    constructor(props: EntryProps<Attr> = {} as EntryProps<Attr>) {
        const { setup, ...rest } = props as any;
        super(rest as Gtk.Entry.ConstructorProps);

        this.connect('activate', () => this.on_accept?.(this));
        this.connect('notify::text', () => this.on_change?.(this));

        if (typeof setup === 'function') setup(this);
    }

    /** Callback invoked when Enter is pressed. */
    get on_accept() {
        return this._get('on-accept');
    }

    set on_accept(callback: EventHandler<this>) {
        this._set('on-accept', callback);
    }

    /** Callback invoked when the text content changes. */
    get on_change() {
        return this._get('on-change');
    }

    set on_change(callback: EventHandler<this>) {
        this._set('on-change', callback);
    }
}

export default Entry;
