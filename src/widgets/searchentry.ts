import { register, type BaseProps, type Widget } from './widget.js';
import Gtk from 'gi://Gtk?version=3.0';

/** Props for the SearchEntry widget. */
export type SearchEntryProps<Attr = unknown, Self = SearchEntry<Attr>> = BaseProps<
    Self,
    Gtk.SearchEntry.ConstructorProps,
    Attr
>;

/** Creates a new SearchEntry widget. */
export function newSearchEntry<Attr = unknown>(
    ...props: ConstructorParameters<typeof SearchEntry<Attr>>
) {
    return new SearchEntry(...props);
}

export interface SearchEntry<Attr> extends Widget<Attr> {}
/** A text entry with a built-in search icon and clear button. */
export class SearchEntry<Attr> extends Gtk.SearchEntry {
    static {
        register(this);
    }

    constructor(props: SearchEntryProps<Attr> = {} as SearchEntryProps<Attr>) {
        const { setup, ...rest } = props as any;
        super(rest as Gtk.SearchEntry.ConstructorProps);
        if (typeof setup === 'function') setup(this);
    }
}

export default SearchEntry;
