/// <reference types="node" />
/// <reference types="@girs/gjs" />

// Import ambient types for GI modules
/// <reference types="@girs/gtk-3.0/gtk-3.0-ambient" />
/// <reference types="@girs/gdk-3.0/gdk-3.0-ambient" />
/// <reference types="@girs/gio-2.0/gio-2.0-ambient" />
/// <reference types="@girs/glib-2.0/glib-2.0-ambient" />
/// <reference types="@girs/gobject-2.0/gobject-2.0-ambient" />
/// <reference types="@girs/cairo-1.0/cairo-1.0-ambient" />
/// <reference types="@girs/gdkpixbuf-2.0/gdkpixbuf-2.0-ambient" />
/// <reference types="@girs/pango-1.0/pango-1.0-ambient" />
/// <reference types="@girs/atk-1.0/atk-1.0-ambient" />
/// <reference types="@girs/gvc-1.0/gvc-1.0-ambient" />
/// <reference types="@girs/nm-1.0/nm-1.0-ambient" />
/// <reference types="@girs/notify-0.7/notify-0.7-ambient" />
/// <reference types="@girs/soup-3.0/soup-3.0-ambient" />
/// <reference types="@girs/dbusmenugtk3-0.4/dbusmenugtk3-0.4-ambient" />

declare global {
    const pkg: {
        name: string;
        version: string;
    };
}