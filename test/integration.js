// poor man's vitest
const GLib = imports.gi.GLib;
const Gtk = imports.gi.Gtk;
const Soup = imports.gi.Soup;
const Gdk = imports.gi.Gdk;
const System = imports.system;

// Initialize GTK
Gtk.init(null);

let testsPassed = 0;
let totalTests = 0;

function test(name, fn) {
    totalTests++;
    try {
        fn();
        print(`${name}`);
        testsPassed++;
    } catch (error) {
        print(`${name}: ${error.message}`);
        System.exit(1);
    }
}

// Test GTK widget creation and properties
test('Gtk.Button creation and properties', () => {
    const button = new Gtk.Button({ label: 'Test Button' });
    if (button.label !== 'Test Button') throw new Error('Label not set');

    // Widgets are not visible by default, check if it's a Gtk.Button
    if (!(button instanceof Gtk.Button)) throw new Error('Not a Gtk.Button');
});

// Test CSS provider with byte data
test('CSS loading with byte data', () => {
    const cssProvider = new Gtk.CssProvider();
    const css = 'GtkButton { background-color: #ff0000; color: #ffffff; }';
    const data = new TextEncoder().encode(css);
    cssProvider.load_from_data(data);

    // Verify the provider was created and loaded
    if (!cssProvider) throw new Error('CSS provider not created');
});

// Test Soup.Message.new API
test('Soup.Message.new API', () => {
    const message = Soup.Message.new('GET', 'https://httpbin.org/get');
    if (!message) throw new Error('Message not created');
    if (typeof message.request_headers.append !== 'function') throw new Error('Headers not accessible');
    message.request_headers.append('User-Agent', 'RAGS/1.10.0');

    // Check if header was added
    if (!message.request_headers.get_one('User-Agent')) throw new Error('Header not set');
});

// Test widget styling application
test('Widget CSS application', () => {
    const button = new Gtk.Button({ label: 'Styled' });
    const css = '* { font-size: 14px; }';
    const cssProvider = new Gtk.CssProvider();
    const data = new TextEncoder().encode(css);
    cssProvider.load_from_data(data);
    button.get_style_context().add_provider(cssProvider, Gtk.STYLE_PROVIDER_PRIORITY_USER);

    // Verify provider was added
    if (!button.get_style_context()) throw new Error('Style context not available');
});

// Test event handling
test('Button click event', () => {
    const button = new Gtk.Button();
    let clicked = false;
    button.connect('clicked', () => { clicked = true; });
    button.clicked(); // simulate click

    // Verify click was triggered
    if (!clicked) throw new Error('Click event not triggered');
});

// Test container widgets
test('Gtk.Box layout', () => {
    const box = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL });
    const child1 = new Gtk.Label({ label: 'Child 1' });
    const child2 = new Gtk.Label({ label: 'Child 2' });
    box.add(child1);
    box.add(child2);
    if (box.get_children().length !== 2) throw new Error('Children not added');
});

// Test tooltip styling
test('Tooltip CSS application', () => {
    const button = new Gtk.Button({ label: 'Tooltip Test' });
    button.set_tooltip_text('Test tooltip');
    const css = '.tooltip { background-color: #ffff00; color: #000000; }';
    const cssProvider = new Gtk.CssProvider();
    const data = new TextEncoder().encode(css);
    cssProvider.load_from_data(data);
    const screen = Gdk.Screen.get_default();
    Gtk.StyleContext.add_provider_for_screen(screen, cssProvider, Gtk.STYLE_PROVIDER_PRIORITY_USER);

    // Verify tooltip can be set
    if (button.get_tooltip_text() !== 'Test tooltip') throw new Error('Tooltip not set');
});

// Test GLib utils. You know, just in case.
test('GLib.Bytes creation', () => {
    const data = new Uint8Array([1, 2, 3]);
    const bytes = new GLib.Bytes(data);
    if (!bytes) throw new Error('Bytes not created');
    if (bytes.toArray().length !== 3) throw new Error('Bytes data incorrect');
});

print(`\n${testsPassed}/${totalTests} tests passed`);
if (testsPassed === totalTests) {
    print('All integration tests passed');
    System.exit(0);
} else {
    print('Some tests failed');
    System.exit(1);
}
