import Gtk from 'gi://Gtk?version=3.0';
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

/**
 * Loads a DBus interface XML definition from the bundled GResource.
 *
 * @param iface - The interface name (e.g., `'com.github.Aylur.ags'`)
 * @returns The XML string, or `null` on error
 */
export function loadInterfaceXML(iface: string) {
    const uri = `resource:///com/github/Aylur/ags/dbus/${iface}.xml`;
    const f = Gio.File.new_for_uri(uri);

    try {
        const [, bytes] = f.load_contents(null);
        return new TextDecoder().decode(bytes);
    } catch (e) {
        logError(e);
        return null;
    }
}

/**
 * Connects multiple signal handlers to a GObject at once.
 *
 * @param service - The GObject to connect signals on
 * @param list - Array of `[signalName, callback]` tuples
 * @returns Array of connection IDs
 */
export function bulkConnect(
    service: GObject.Object,
    list: Array<[event: string, callback: (...args: any[]) => void]>,
) {
    const ids = [];
    for (const [event, callback] of list) ids.push(service.connect(event, callback));

    return ids;
}

/**
 * Disconnects multiple signal handlers from a GObject.
 *
 * @param service - The GObject to disconnect signals from
 * @param ids - Array of connection IDs returned by {@link bulkConnect}
 */
export function bulkDisconnect(service: GObject.Object, ids: number[]) {
    for (const id of ids) service.disconnect(id);
}

/**
 * Looks up an icon by name in the default icon theme.
 *
 * @param name - The icon name
 * @param size - The desired icon size in pixels (defaults to 16)
 * @returns The icon info, or `null` if not found
 */
export function lookUpIcon(name?: string, size = 16) {
    if (!name) return null;

    return Gtk.IconTheme.get_default().lookup_icon(name, size, Gtk.IconLookupFlags.USE_BUILTIN);
}

/**
 * Creates a directory (and parent directories) if it does not already exist.
 *
 * @param path - The directory path to ensure
 */
export function ensureDirectory(path: string) {
    if (!GLib.file_test(path, GLib.FileTest.EXISTS))
        Gio.File.new_for_path(path).make_directory_with_parents(null);
}
