import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk?version=3.0';

export type ScopeHandle = { release(): void; forget(): void };
export type ChildScope = { scope: ResourceScope; release(): void };

type Emitter = {
    connect(signal: string, callback: (...args: unknown[]) => unknown): number;
    disconnect(id: number): void;
};

const released: ScopeHandle = { release() {}, forget() {} };

class Entry implements ScopeHandle {
    previous: Entry | null = null;
    next: Entry | null = null;

    constructor(
        private owner: ResourceScope | null,
        private cleanup: (() => void) | null,
    ) {}

    release(): void {
        const cleanup = this.cleanup;
        this.forget();
        cleanup?.();
    }

    forget(): void {
        this.owner?._remove(this);
        this.owner = null;
        this.cleanup = null;
    }
}

export class ResourceScope {
    private first: Entry | null = null;
    private last: Entry | null = null;
    private disposed = false;

    add(cleanup: () => void): ScopeHandle {
        if (this.disposed) {
            cleanup();
            return released;
        }
        const entry = new Entry(this, cleanup);
        entry.previous = this.last;
        if (this.last) this.last.next = entry;
        else this.first = entry;
        this.last = entry;
        return entry;
    }

    _remove(entry: Entry): void {
        if (entry.previous) entry.previous.next = entry.next;
        else this.first = entry.next;
        if (entry.next) entry.next.previous = entry.previous;
        else this.last = entry.previous;
        entry.previous = null;
        entry.next = null;
    }

    connect(emitter: Emitter, signal: string, callback: (...args: unknown[]) => unknown): ScopeHandle {
        if (this.disposed) return released;
        const id = emitter.connect(signal, callback);
        return this.add(() => {
            if (emitter instanceof GObject.Object && !GObject.signal_handler_is_connected(emitter, id))
                return;
            emitter.disconnect(id);
        });
    }

    source(id: number): ScopeHandle {
        return this.add(() => {
            if (GLib.MainContext.default().find_source_by_id(id)) GLib.source_remove(id);
        });
    }

    child(): ChildScope {
        const scope = new ResourceScope();
        const handle = this.add(() => scope.dispose());
        return { scope, release: () => handle.release() };
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        while (this.last) {
            try {
                this.last.release();
            } catch (error) {
                console.error('Failed to release resource:', error);
            }
        }
    }
}

const widgetScopes = new WeakMap<Gtk.Widget, ResourceScope>();
const initializedWidgets = new WeakSet<Gtk.Widget>();

export function initWidget(widget: Gtk.Widget): void {
    if (initializedWidgets.has(widget)) return;
    initializedWidgets.add(widget);
    const ags = widget as Gtk.Widget & {
        is_destroyed?: boolean;
        _set?: (field: string, value: boolean) => void;
    };
    if (ags.is_destroyed === true || (ags.is_destroyed === undefined && widget.in_destruction()))
        widgetScopes.get(widget)?.dispose();
    else widget.connect('destroy', () => {
        ags._set?.('is-destroyed', true);
        widgetScopes.get(widget)?.dispose();
    });
}

export function ensureWidgetScope(widget: Gtk.Widget): ResourceScope {
    const existing = widgetScopes.get(widget);
    if (existing) return existing;
    const scope = new ResourceScope();
    widgetScopes.set(widget, scope);
    initWidget(widget);
    const destroyed = (widget as Gtk.Widget & { is_destroyed?: boolean }).is_destroyed;
    if (destroyed === true || (destroyed === undefined && widget.in_destruction())) scope.dispose();
    return scope;
}
