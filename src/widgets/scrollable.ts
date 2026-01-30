import { register, type BaseProps, type Widget } from './widget.js';
import Gtk from 'gi://Gtk?version=3.0';

const POLICY = {
    automatic: Gtk.PolicyType.AUTOMATIC,
    always: Gtk.PolicyType.ALWAYS,
    never: Gtk.PolicyType.NEVER,
    external: Gtk.PolicyType.EXTERNAL,
} as const;

type Policy = keyof typeof POLICY;

/** Props for the Scrollable widget. */
export type ScrollableProps<
    Child extends Gtk.Widget = Gtk.Widget,
    Attr = unknown,
    Self = Scrollable<Child, Attr>,
> = BaseProps<
    Self,
    Gtk.ScrolledWindow.ConstructorProps & {
        child?: Child;
        hscroll?: Policy;
        vscroll?: Policy;
    },
    Attr
>;

/**
 * Creates a new Scrollable widget that adds scrollbars to its child.
 *
 * @example
 * const scrollable = newScrollable({
 *     hscroll: 'never',
 *     vscroll: 'automatic',
 *     child: Widget.Box({ children: [...items] }),
 * });
 */
export function newScrollable<Child extends Gtk.Widget = Gtk.Widget, Attr = unknown>(
    ...props: ConstructorParameters<typeof Scrollable<Child, Attr>>
) {
    return new Scrollable(...props);
}

/** GTK ScrolledWindow wrapper providing scrollable content with configurable scroll policies. */
export interface Scrollable<Child, Attr> extends Widget<Attr> {}
export class Scrollable<Child extends Gtk.Widget, Attr> extends Gtk.ScrolledWindow {
    static {
        register(this, {
            properties: {
                hscroll: ['string', 'rw'],
                vscroll: ['string', 'rw'],
            },
        });
    }

    constructor(
        props: ScrollableProps<Child, Attr> = {} as ScrollableProps<Child, Attr>,
        child?: Child,
    ) {
        if (child) props.child = child;

        super({
            ...(props as Gtk.ScrolledWindow.ConstructorProps),
            hadjustment: new Gtk.Adjustment(),
            vadjustment: new Gtk.Adjustment(),
        });

        this.connect('destroy', () => {
            if (this.child instanceof Gtk.Viewport) this.child.child.destroy();
        });
    }

    /** The scrollable content child widget. */
    get child() {
        return super.child as Child;
    }

    set child(child: Child) {
        if (this.child instanceof Gtk.Viewport) this.child.child = child;
        else super.child = child;
    }

    setScroll(orientation: 'h' | 'v', scroll: Policy) {
        if (!scroll || this[`${orientation}scroll`] === scroll) return;

        if (!Object.keys(POLICY).includes(scroll)) {
            return console.error(
                Error(
                    `${orientation}scroll has to be one of ${Object.keys(POLICY)}, but it is ${scroll}`,
                ),
            );
        }

        this._set(`${orientation}scroll`, scroll);
        this._policy();
    }

    /** Horizontal scroll policy: 'automatic', 'always', 'never', or 'external'. */
    get hscroll() {
        return this._get('hscroll');
    }

    set hscroll(hscroll: Policy) {
        this.setScroll('h', hscroll);
    }

    /** Vertical scroll policy: 'automatic', 'always', 'never', or 'external'. */
    get vscroll() {
        return this._get('vscroll');
    }

    set vscroll(vscroll: Policy) {
        this.setScroll('v', vscroll);
    }

    private _policy() {
        const hscroll = POLICY[this.hscroll];
        const vscroll = POLICY[this.vscroll];
        this.set_policy(
            hscroll === -1 ? Gtk.PolicyType.AUTOMATIC : hscroll,
            vscroll === -1 ? Gtk.PolicyType.AUTOMATIC : vscroll,
        );
    }
}

export default Scrollable;
