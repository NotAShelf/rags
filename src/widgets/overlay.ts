import { register, type BaseProps, type Widget } from './widget.js';
import Gtk from 'gi://Gtk?version=3.0';

/** Props for the Overlay widget. */
export type OverlayProps<
    Child extends Gtk.Widget = Gtk.Widget,
    OverlayChild extends Gtk.Widget = Gtk.Widget,
    Attr = unknown,
    Self = Overlay<Child, OverlayChild, Attr>,
> = BaseProps<
    Self,
    Gtk.Overlay.ConstructorProps & {
        pass_through?: boolean;
        overlays?: OverlayChild[];
        overlay?: OverlayChild;
        child?: Child;
    },
    Attr
>;

/** Creates a new Overlay widget for stacking children on top of each other. */
export function newOverlay<
    Child extends Gtk.Widget = Gtk.Widget,
    OverlayChild extends Gtk.Widget = Gtk.Widget,
    Attr = unknown,
>(...props: ConstructorParameters<typeof Overlay<Child, OverlayChild, Attr>>) {
    return new Overlay(...props);
}

/** GTK Overlay wrapper for stacking widgets on top of a main child. */
export interface Overlay<Child, OverlayChild, Attr> extends Widget<Attr> {}
export class Overlay<Child extends Gtk.Widget, OverlayChild extends Gtk.Widget, Attr>
    extends Gtk.Overlay
{
    static {
        register(this, {
            properties: {
                'pass-through': ['boolean', 'rw'],
                overlays: ['jsobject', 'rw'],
                overlay: ['jsobject', 'rw'],
            },
        });
    }

    constructor(
        props: OverlayProps<Child, OverlayChild, Attr> = {} as OverlayProps<
            Child,
            OverlayChild,
            Attr
        >,
        child?: Child,
        ...overlays: Gtk.Widget[]
    ) {
        const { setup, ...rest } = props as any;
        if (child) rest.child = child;

        if (overlays.length > 0) rest.overlays = overlays as OverlayChild[];

        super(rest as Gtk.Overlay.ConstructorProps);

        if (typeof setup === 'function') setup(this);
    }

    private _updatePassThrough() {
        const passThrough = this._get<boolean>('pass-through') || false;
        this.overlays.forEach(ch => this.set_overlay_pass_through(ch, passThrough));
    }

    /** Whether input events pass through overlay children. */
    get pass_through(): boolean | undefined {
        return this._get('pass-through');
    }

    set pass_through(passthrough: boolean) {
        if (this.pass_through === passthrough) return;

        this._set('pass-through', passthrough);
        this._updatePassThrough();
        this.notify('pass-through');
    }

    /** The first overlay child widget. */
    get overlay() {
        return this.overlays[0] as Child;
    }

    set overlay(overlay: Child) {
        this.overlays = [overlay];
        this.notify('overlay');
    }

    /** All overlay children stacked on top of the main child. */
    get overlays() {
        return this.get_children().filter(ch => ch !== this.child) as Child[];
    }

    set overlays(overlays: Child[]) {
        this.get_children()
            .filter(ch => ch !== this.child && !overlays.includes(ch as Child))
            .forEach(ch => ch.destroy());

        this.get_children()
            .filter(ch => ch !== this.child)
            .forEach(ch => this.remove(ch));

        overlays.forEach(ch => this.add_overlay(ch));
        this._updatePassThrough();
        this.notify('overlays');
    }
}

export default Overlay;
