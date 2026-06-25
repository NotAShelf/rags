import Gdk from 'gi://Gdk?version=3.0';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Service from '../service.js';
import type { Disposable } from '../service.js';
import { globalSignalRegistry } from '../utils.js';

Gio._promisify(Gio.DataInputStream.prototype, 'read_upto_async');

const HIS = GLib.getenv('HYPRLAND_INSTANCE_SIGNATURE');
const XDG_RUNTIME_DIR = GLib.getenv('XDG_RUNTIME_DIR') || '/';

/*
 * Lua IPC (Hyprland 0.55+).
 *
 * Hyprland 0.55 moved its command socket from the legacy text protocol to a Lua
 * interpreter. The `dispatch <X>` request is now shorthand for
 * `eval 'hl.dispatch(<X>)'`, where `<X>` is a dispatcher table built from the
 * `hl.dsp.*` namespace (e.g. `hl.dsp.focus({ workspace = "3" })`). Plain info
 * reads (`j/monitors` etc.) are unaffected.
 */

/** A value encodable as a Lua literal. */
export type LuaValue =
    | string
    | number
    | boolean
    | null
    | undefined
    | LuaValue[]
    | { [key: string]: LuaValue };

/**
 * Encodes a JS value as a Lua literal string.
 *
 * Objects become Lua tables with bare identifier keys (`{ k = v }`), arrays
 * become positional tables (`{ v, v }`), and `undefined` entries are omitted.
 *
 * @param value - The value to encode
 * @returns A Lua literal expression
 */
function luaEncode(value: LuaValue): string {
    if (value === null || value === undefined) return 'nil';
    if (typeof value === 'string') {
        return '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"';
    }
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'nil';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (Array.isArray(value)) return '{ ' + value.map(luaEncode).join(', ') + ' }';

    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    return '{ ' + entries.map(([k, v]) => `${k} = ${luaEncode(v)}`).join(', ') + ' }';
}

/** Sends a `hl.dispatch(<expr>)` call and resolves with the socket response. */
type DispatchSender = (luaExpr: string) => Promise<string>;

type Selector = string;

interface FocusOpts {
    direction?: string;
    monitor?: string | number;
    workspace?: string;
    on_current_monitor?: boolean;
    window?: Selector;
    urgent_or_last?: boolean;
    last?: boolean;
}

interface WindowMoveOpts {
    direction?: string;
    workspace?: string;
    monitor?: string | number;
    x?: number;
    y?: number;
    relative?: boolean;
    follow?: boolean;
    group_aware?: boolean;
    into_group?: string;
    into_or_create_group?: string;
    out_of_group?: boolean | string;
    window?: Selector;
}

interface ActionOpts {
    action?: string;
    window?: Selector;
}

/**
 * Builds the typed Lua-native dispatch namespace mirroring Hyprland's
 * `hl.dsp.*` dispatchers. Each method forwards its argument table straight to
 * the matching dispatcher, so the shape follows the upstream wiki exactly.
 *
 * @param send - Callback that issues `hl.dispatch(<expr>)` over the socket
 * @returns The dispatch namespace object
 */
function createDispatch(send: DispatchSender) {
    // call() takes unknown[] because the public methods below already constrain
    // caller input; luaEncode handles the option tables structurally.
    const call = (path: string, ...args: unknown[]) =>
        send(`hl.dsp.${path}(${args.map(a => luaEncode(a as LuaValue)).join(', ')})`);

    return {
        /** Execute a command via `sh -c`. Optional window rules table. */
        exec: (cmd: string, rules?: Record<string, LuaValue>) =>
            rules ? call('exec_cmd', cmd, rules) : call('exec_cmd', cmd),
        /** Execute a raw command without `sh -c`. */
        execRaw: (cmd: string) => call('exec_raw', cmd),
        /** Move focus (by direction, monitor, workspace, window, etc.). */
        focus: (opts: FocusOpts) => call('focus', opts),
        /** Quit Hyprland. Prefer `hyprshutdown`. */
        exit: () => call('exit'),
        /** Switch to a submap. */
        submap: (name: string) => call('submap', name),
        /** Send a layout message string to the active layout. */
        layout: (message: string) => call('layout', message),
        /** Toggle monitors on/off. */
        dpms: (opts: { action?: string; monitor?: string | number }) => call('dpms', opts),
        /** Activate a D-Bus global shortcut. */
        global: (name: string) => call('global', name),
        /** Send an event to socket2. */
        event: (str: string) => call('event', str),
        /** Set elapsed time for all idle timers. */
        forceIdle: (seconds: number) => call('force_idle', seconds),
        /** Does nothing; useful for conditional binds. */
        noOp: () => call('no_op'),

        window: {
            /** Gracefully request the window to close. */
            close: (window?: Selector) =>
                window !== undefined ? call('window.close', window) : call('window.close'),
            /** Kill the window's process with SIGKILL. */
            kill: (window?: Selector) =>
                window !== undefined ? call('window.kill', window) : call('window.kill'),
            /** Send a POSIX signal to the window's process. */
            signal: (opts: { signal: number | string; window?: Selector }) =>
                call('window.signal', opts),
            /** Set a window's floating state (`action`: toggle/true/false). */
            float: (opts: ActionOpts = {}) => call('window.float', opts),
            /** Set a window's fullscreen state. */
            fullscreen: (opts: { mode?: string; action?: string; window?: Selector } = {}) =>
                call('window.fullscreen', opts),
            /** Set a window's fullscreen state with internal/client precision. */
            fullscreenState: (opts: {
                internal?: string;
                client?: string;
                action?: string;
                window?: Selector;
            }) => call('window.fullscreen_state', opts),
            /** Set a window's pseudotiling state. */
            pseudo: (opts: ActionOpts = {}) => call('window.pseudo', opts),
            /** Move a window (direction/workspace/monitor/coords/group). */
            move: (opts: WindowMoveOpts) => call('window.move', opts),
            /** Swap the active window with another. */
            swap: (opts: {
                direction?: string;
                target?: Selector;
                next?: boolean;
                prev?: boolean;
            }) => call('window.swap', opts),
            /** Center the current window. */
            center: (opts: { window?: Selector } = {}) => call('window.center', opts),
            /** Resize a window, or begin an interactive resize with no args. */
            resize: (opts?: {
                x?: number;
                y?: number;
                relative?: boolean;
                keep_aspect_ratio?: boolean;
                window?: Selector;
            }) => (opts ? call('window.resize', opts) : call('window.resize')),
            /** Begin an interactive drag (mouse binds). */
            drag: () => call('window.drag'),
            /** Tag a window. */
            tag: (opts: { tag: string; window?: Selector }) => call('window.tag', opts),
            /** Clear all tags from a window. */
            clearTags: (opts: { window?: Selector } = {}) => call('window.clear_tags', opts),
            /** Toggle all swallowed windows visible. */
            toggleSwallow: () => call('window.toggle_swallow'),
            /** Pin a window across workspaces. */
            pin: (opts: ActionOpts = {}) => call('window.pin', opts),
            /** Alter a window's z-order (`mode`: "top" or "bottom"). */
            alterZorder: (opts: { mode: string; window?: Selector }) =>
                call('window.alter_zorder', opts),
            /** Set a window property. */
            setProp: (opts: { prop: string; value: LuaValue; window?: Selector }) =>
                call('window.set_prop', opts),
        },

        workspace: {
            /** Rename a workspace. */
            rename: (opts: { workspace: string; name?: string }) => call('workspace.rename', opts),
            /** Move a workspace to a monitor. */
            move: (opts: { workspace?: string; monitor: string | number }) =>
                call('workspace.move', opts),
            /** Swap the current workspaces of two monitors. */
            swapMonitors: (opts: { monitor1: string | number; monitor2: string | number }) =>
                call('workspace.swap_monitors', opts),
            /** Toggle a named special workspace. */
            toggleSpecial: (name = '') => call('workspace.toggle_special', name),
        },

        group: {
            /** Toggle a group. */
            toggle: (opts: { window?: Selector } = {}) => call('group.toggle', opts),
            /** Focus the next window in a group. */
            next: (opts: { window?: Selector } = {}) => call('group.next', opts),
            /** Focus the previous window in a group. */
            prev: (opts: { window?: Selector } = {}) => call('group.prev', opts),
            /** Focus a window in a group by index. */
            active: (opts: { index: number; window?: Selector }) => call('group.active', opts),
            /** Move a window within the group order. */
            moveWindow: (opts: { forward?: boolean; window?: Selector }) =>
                call('group.move_window', opts),
            /** Lock a group. */
            lock: (opts: ActionOpts = {}) => call('group.lock', opts),
            /** Lock the active group. */
            lockActive: (opts: { action?: string } = {}) => call('group.lock_active', opts),
        },

        cursor: {
            /** Move the cursor to a corner of the window (corner 0-3). */
            moveToCorner: (opts: { corner: number; window?: Selector }) =>
                call('cursor.move_to_corner', opts),
            /** Move the cursor to an absolute coordinate. */
            move: (opts: { x: number; y: number }) => call('cursor.move', opts),
        },

        /** Escape hatch: dispatch a raw `hl.dsp.*` expression string. */
        raw: (luaExpr: string) => send(luaExpr),
    };
}

/** The typed dispatch namespace returned by {@link createDispatch}. */
export type Dispatch = ReturnType<typeof createDispatch>;

const warnedLegacy = new Set<string>();

const luaNum = (s: string | undefined) => {
    const n = Number(s);
    return Number.isFinite(n) ? n : undefined;
};

/**
 * Translation table from legacy text dispatchers to `hl.dsp.*` Lua expressions.
 * `rest` is the argument portion of the legacy command (everything after the
 * dispatcher name). Mappings are intentionally limited to the dispatchers
 * commonly used by bars; anything absent surfaces a deprecation notice so the
 * caller can migrate to the native {@link createDispatch} API.
 */
const LEGACY_DISPATCHERS: Record<string, (rest: string) => string | null> = {
    exec: r => `hl.dsp.exec_cmd(${luaEncode(r)})`,
    execr: r => `hl.dsp.exec_raw(${luaEncode(r)})`,
    killactive: () => 'hl.dsp.window.close()',
    forcekillactive: () => 'hl.dsp.window.kill()',
    closewindow: r => `hl.dsp.window.close(${luaEncode(r)})`,
    workspace: r => `hl.dsp.focus({ workspace = ${luaEncode(r)} })`,
    movetoworkspace: r => `hl.dsp.window.move({ workspace = ${luaEncode(r)}, follow = true })`,
    movetoworkspacesilent: r =>
        `hl.dsp.window.move({ workspace = ${luaEncode(r)}, follow = false })`,
    movefocus: r => `hl.dsp.focus({ direction = ${luaEncode(r)} })`,
    focuswindow: r => `hl.dsp.focus({ window = ${luaEncode(r)} })`,
    focusmonitor: r => `hl.dsp.focus({ monitor = ${luaEncode(r)} })`,
    focusurgentorlast: () => 'hl.dsp.focus({ urgent_or_last = true })',
    focuscurrentorlast: () => 'hl.dsp.focus({ last = true })',
    movewindow: r => `hl.dsp.window.move({ direction = ${luaEncode(r)} })`,
    togglefloating: r =>
        `hl.dsp.window.float({ action = "toggle"${r ? `, window = ${luaEncode(r)}` : ''} })`,
    fullscreen: r =>
        r === '1'
            ? 'hl.dsp.window.fullscreen({ mode = "maximized", action = "toggle" })'
            : 'hl.dsp.window.fullscreen({ action = "toggle" })',
    pseudo: () => 'hl.dsp.window.pseudo({ action = "toggle" })',
    pin: r => `hl.dsp.window.pin({ action = "toggle"${r ? `, window = ${luaEncode(r)}` : ''} })`,
    centerwindow: () => 'hl.dsp.window.center({})',
    togglespecialworkspace: r => `hl.dsp.workspace.toggle_special(${luaEncode(r || 'special')})`,
    togglegroup: () => 'hl.dsp.group.toggle({})',
    changegroupactive: r =>
        r === 'b' || r === 'prev' ? 'hl.dsp.group.prev({})' : 'hl.dsp.group.next({})',
    submap: r => `hl.dsp.submap(${luaEncode(r)})`,
    exit: () => 'hl.dsp.exit()',
    global: r => `hl.dsp.global(${luaEncode(r)})`,
    resizeactive: r => {
        const [x, y] = r.split(/\s+/);
        return `hl.dsp.window.resize({ x = ${luaNum(x) ?? 0}, y = ${luaNum(y) ?? 0}, relative = true })`;
    },
    moveactive: r => {
        const [x, y] = r.split(/\s+/);
        return `hl.dsp.window.move({ x = ${luaNum(x) ?? 0}, y = ${luaNum(y) ?? 0}, relative = true })`;
    },
    dpms: r => {
        const [action, monitor] = r.split(/\s+/);
        return `hl.dsp.dpms(${luaEncode({ action: action || undefined, monitor: monitor || undefined })})`;
    },
};

/**
 * Rewrites a legacy text IPC command into its Lua equivalent when applicable.
 *
 * Only commands beginning with `dispatch ` are considered, and only when they
 * are not already Lua (i.e. do not reference `hl.dsp`/`hl.dispatch`). All other
 * requests (`j/...`, `keyword`, `eval`, already-Lua dispatches) are returned
 * unchanged. Recognised legacy dispatchers emit a one-time deprecation warning.
 *
 * @param cmd - The raw IPC command
 * @returns The possibly-rewritten command
 */
function translateLegacyDispatch(cmd: string): string {
    if (!cmd.startsWith('dispatch ')) return cmd;

    const body = cmd.slice('dispatch '.length).trim();
    if (body.includes('hl.dsp') || body.includes('hl.dispatch')) return cmd;

    const sep = body.indexOf(' ');
    const name = (sep === -1 ? body : body.slice(0, sep)).toLowerCase();
    const rest = sep === -1 ? '' : body.slice(sep + 1).trim();

    const mapper = LEGACY_DISPATCHERS[name];
    if (!mapper) {
        if (!warnedLegacy.has(name)) {
            warnedLegacy.add(name);
            console.warn(
                `[hyprland] legacy dispatcher "${name}" has no Lua translation; ` +
                    'use hyprland.dispatch.* (Hyprland 0.55+ removed the text dispatch protocol)',
            );
        }
        return cmd;
    }

    const lua = mapper(rest);
    if (lua === null) return cmd;

    if (!warnedLegacy.has(name)) {
        warnedLegacy.add(name);
        console.warn(
            `[hyprland] legacy dispatcher "${name}" is deprecated; ` +
                'prefer the typed hyprland.dispatch.* API',
        );
    }

    return `dispatch ${lua}`;
}

/**
 * Active Client Tracker
 *
 * Tracks the currently focused Hyprland window's address, title, and class.
 *
 * @property {string} address - Hex address of the active window
 * @property {string} title - Window title
 * @property {string} class - Window WM class
 */
export class ActiveClient extends Service implements Disposable {
    static {
        Service.register(
            this,
            {},
            {
                address: ['string'],
                title: ['string'],
                class: ['string'],
            },
        );
    }

    private _address = '';
    private _title = '';
    private _class = '';

    /** The hex address of the active window. */
    get address() {
        return this._address;
    }

    /** The title of the active window. */
    get title() {
        return this._title;
    }

    /** The WM class of the active window. */
    get class() {
        return this._class;
    }

    dispose(): void {
        super.dispose();
        // No signal connections to clean up
    }
}

/**
 * Active ID Tracker
 *
 * Tracks an active monitor or workspace by numeric ID and name.
 *
 * @property {number} id - Numeric identifier
 * @property {string} name - String name
 */
export class ActiveID extends Service implements Disposable {
    static {
        Service.register(
            this,
            {},
            {
                id: ['int'],
                name: ['string'],
            },
        );
    }

    private _id = 1;
    private _name = '';

    /** Numeric identifier. */
    get id() {
        return this._id;
    }

    /** String name. */
    get name() {
        return this._name;
    }

    /**
     * Updates both the id and name properties.
     *
     * @param id - The new numeric ID
     * @param name - The new name
     */
    update(id: number, name: string) {
        super.updateProperty('id', id);
        super.updateProperty('name', name);
    }

    dispose(): void {
        super.dispose();
        // No signal connections to clean up
    }
}

/**
 * Actives Aggregator
 *
 * Aggregates the currently active client, monitor, and workspace.
 *
 * Lifecycle:
 * 1. Construction - Create sub-trackers and connect signals
 * 2. Ready - Track changes from sub-trackers
 * 3. Disposal - Cleanup sub-trackers and signals
 *
 * @property {ActiveClient} client - Currently focused client window
 * @property {ActiveID} monitor - Currently focused monitor
 * @property {ActiveID} workspace - Currently active workspace
 *
 * @fires changed - Emitted when any active entity changes
 */
export class Actives extends Service implements Disposable {
    static {
        Service.register(
            this,
            {},
            {
                client: ['jsobject'],
                monitor: ['jsobject'],
                workspace: ['jsobject'],
            },
        );
    }

    private _client = new ActiveClient();
    private _monitor = new ActiveID();
    private _workspace = new ActiveID();

    constructor() {
        super();

        (['client', 'workspace', 'monitor'] as const).forEach(obj => {
            const id = this[`_${obj}`].connect('changed', () => {
                this.notify(obj);
                this.emit('changed');
            });
            globalSignalRegistry.register(this[`_${obj}`] as unknown as GObject.Object, id);
        });
    }

    /** The currently focused client window. */
    get client() {
        return this._client;
    }

    /** The currently focused monitor. */
    get monitor() {
        return this._monitor;
    }

    /** The currently active workspace. */
    get workspace() {
        return this._workspace;
    }

    dispose(): void {
        super.dispose();

        // Cleanup sub-trackers
        if (this._client) {
            globalSignalRegistry.disconnect(this._client as unknown as GObject.Object);
            this._client.dispose();
        }
        if (this._monitor) {
            globalSignalRegistry.disconnect(this._monitor as unknown as GObject.Object);
            this._monitor.dispose();
        }
        if (this._workspace) {
            globalSignalRegistry.disconnect(this._workspace as unknown as GObject.Object);
            this._workspace.dispose();
        }
    }
}

/**
 * Hyprland Compositor Service
 *
 * Service for interacting with the Hyprland compositor via its IPC socket.
 *
 * Lifecycle:
 * 1. Construction - Connect to Hyprland IPC sockets
 * 2. Initialization - Load initial state (monitors, workspaces, clients)
 * 3. Ready - Watch socket for events and update state
 * 4. Disposal - Close sockets and cleanup state
 *
 * @property {Actives} active - Currently active client, monitor, and workspace
 * @property {Monitor[]} monitors - All known monitors
 * @property {Workspace[]} workspaces - All known workspaces
 * @property {Client[]} clients - All known clients (windows)
 *
 * @fires event - Emitted for every Hyprland event (eventType: string, params: string)
 * @fires urgent-window - Emitted when window becomes urgent (address: string)
 * @fires submap - Emitted on submap change (submapName: string)
 * @fires keyboard-layout - Emitted on layout change (deviceName: string, layoutName: string)
 * @fires monitor-added - Emitted when monitor is added (monitorName: string)
 * @fires monitor-removed - Emitted when monitor is removed (monitorName: string)
 * @fires workspace-added - Emitted when workspace is created (workspaceId: string)
 * @fires workspace-removed - Emitted when workspace is destroyed (workspaceId: string)
 * @fires client-added - Emitted when window is opened (address: string)
 * @fires client-removed - Emitted when window is closed (address: string)
 * @fires fullscreen - Emitted on fullscreen state change (isFullscreen: boolean)
 * @fires screencast - Emitted on screencast change (state: boolean, owner: number, target: string)
 * @fires activespecial - Emitted on special workspace change (workspaceName: string, monitorName: string)
 * @fires pin - Emitted on window pin change (address: string, pinned: boolean)
 * @fires minimized - Emitted on window minimize change (address: string, minimized: boolean)
 * @fires bell - Emitted on window bell (address: string)
 * @fires configreloaded - Emitted when config is reloaded
 * @fires empty - Emitted when workspace becomes empty (workspaceId: string)
 * @fires kill - Emitted when window is killed (address: string)
 * @fires changed - Emitted when any state changes
 */
export class Hyprland extends Service implements Disposable {
    static {
        Service.register(
            this,
            {
                event: ['string', 'string'],
                'urgent-window': ['string'],
                submap: ['string'],
                'keyboard-layout': ['string', 'string'],
                'monitor-added': ['string'],
                'monitor-removed': ['string'],
                'workspace-added': ['string'],
                'workspace-removed': ['string'],
                'client-added': ['string'],
                'client-removed': ['string'],
                fullscreen: ['boolean'],
                screencast: ['boolean', 'int', 'string'],
                activespecial: ['string', 'string'],
                pin: ['string', 'boolean'],
                minimized: ['string', 'boolean'],
                bell: ['string'],
                lockgroups: ['boolean'],
                configreloaded: [],
                empty: ['string'],
                kill: ['string'],
                custom: ['string'],
            },
            {
                active: ['jsobject'],
                monitors: ['jsobject'],
                workspaces: ['jsobject'],
                clients: ['jsobject'],
            },
        );
    }

    private _active: Actives = new Actives();
    private _monitors: Map<number, Monitor> = new Map();
    private _workspaces: Map<number, Workspace> = new Map();
    private _clients: Map<string, Client> = new Map();
    private _decoder = new TextDecoder();
    private _encoder = new TextEncoder();
    private _eventConnection: Gio.SocketConnection | null = null;
    private _eventStream: Gio.DataInputStream | null = null;
    private _messageQueue: Promise<unknown> = Promise.resolve();

    /**
     * Typed, Lua-native dispatch API mirroring Hyprland's `hl.dsp.*`
     * dispatchers (Hyprland 0.55+). Example: `hyprland.dispatch.focus({ workspace: '3' })`.
     */
    readonly dispatch: Dispatch = createDispatch(expr => this._sendDispatch(expr));

    /** The currently active client, monitor, and workspace. */
    get active() {
        return this._active;
    }

    /** All known Hyprland monitors. */
    get monitors() {
        return Array.from(this._monitors.values());
    }

    /** All known Hyprland workspaces. */
    get workspaces() {
        return Array.from(this._workspaces.values());
    }

    /** All known Hyprland clients (windows). */
    get clients() {
        return Array.from(this._clients.values());
    }

    /**
     * Retrieves a monitor by its numeric ID.
     *
     * @param id - The monitor ID
     * @returns The Monitor data or undefined
     */
    readonly getMonitor = (id: number) => this._monitors.get(id);
    /**
     * Retrieves a workspace by its numeric ID.
     *
     * @param id - The workspace ID
     * @returns The Workspace data or undefined
     */
    readonly getWorkspace = (id: number) => this._workspaces.get(id);
    /**
     * Retrieves a client by its hex address.
     *
     * @param address - The client address (e.g. "0x...")
     * @returns The Client data or undefined
     */
    readonly getClient = (address: string) => this._clients.get(address);

    /**
     * Returns the GDK monitor corresponding to a Hyprland monitor ID.
     *
     * @param id - The Hyprland monitor ID
     * @returns The Gdk.Monitor or null
     */
    readonly getGdkMonitor = (id: number) => {
        const monitor = this._monitors.get(id);
        if (!monitor) return null;

        return Gdk.Display.get_default()?.get_monitor_at_point(monitor.x, monitor.y) || null;
    };

    constructor() {
        if (!HIS) console.error('Hyprland is not running');

        super();

        // init monitor
        for (const m of JSON.parse(this.message('j/monitors')) as Monitor[]) {
            this._monitors.set(m.id, m);
            if (m.focused) {
                this._active.monitor.update(m.id, m.name);
                this._active.workspace.update(m.activeWorkspace.id, m.activeWorkspace.name);
            }
        }

        // init workspaces
        for (const ws of JSON.parse(this.message('j/workspaces')) as Workspace[])
            this._workspaces.set(ws.id, ws);

        // init clients
        for (const c of JSON.parse(this.message('j/clients')) as Client[])
            this._clients.set(c.address, c);

        // Setup socket watching
        this._eventConnection = this._connection('socket2');
        this._eventStream = new Gio.DataInputStream({
            close_base_stream: false, // Let _eventConnection.close() handle stream cleanup
            base_stream: this._eventConnection.get_input_stream(),
        });
        this._watchSocket(this._eventStream);

        // Track active changes
        const activeId = this._active.connect('changed', () => this.changed('active'));
        globalSignalRegistry.register(this._active as unknown as GObject.Object, activeId);
    }

    private _connection(socket: 'socket' | 'socket2') {
        const sock = (pre: string) => `${pre}/hypr/${HIS}/.${socket}.sock`;

        const path = GLib.file_test(sock(XDG_RUNTIME_DIR), GLib.FileTest.EXISTS)
            ? sock(XDG_RUNTIME_DIR)
            : sock('/tmp');

        return new Gio.SocketClient().connect(new Gio.UnixSocketAddress({ path }), null);
    }

    private _watchSocket(stream: Gio.DataInputStream) {
        stream.read_line_async(0, null, (stream, result) => {
            if (!stream) return console.error('Error reading Hyprland socket');

            try {
                const [line] = stream.read_line_finish(result);
                this._onEvent(this._decoder.decode(line || new Uint8Array()));
            } catch (error) {
                logError(error);
            }

            this._watchSocket(stream);
        });
    }

    private _socketStream(cmd: string) {
        const connection = this._connection('socket');

        connection.get_output_stream().write(this._encoder.encode(cmd), null);

        const stream = new Gio.DataInputStream({
            close_base_stream: true,
            base_stream: connection.get_input_stream(),
        });

        return [connection, stream] as const;
    }

    /**
     * Sends a synchronous IPC command to Hyprland.
     *
     * @param cmd - The Hyprland IPC command string (e.g. "j/monitors")
     * @returns The response string
     */
    readonly message = (cmd: string) => {
        cmd = translateLegacyDispatch(cmd);

        let connection: Gio.SocketConnection | null = null;
        try {
            const [conn, stream] = this._socketStream(cmd);
            connection = conn;

            const [response] = stream.read_upto('\x04', -1, null);
            return response || '';
        } catch (error) {
            logError(error);
        } finally {
            connection?.close(null);
        }
        return '';
    };

    /**
     * Sends an asynchronous IPC command to Hyprland.
     *
     * @param cmd - The Hyprland IPC command string
     * @returns The response string
     */
    private _messageAsync = async (cmd: string) => {
        cmd = translateLegacyDispatch(cmd);

        let connection: Gio.SocketConnection | null = null;
        try {
            const [conn, stream] = this._socketStream(cmd);
            connection = conn;

            const result = await stream.read_upto_async('\x04', -1, 0, null);
            const [response] = result as unknown as [string, number];
            return response;
        } catch (error) {
            logError(error);
        } finally {
            connection?.close(null);
        }
        return '';
    };

    readonly messageAsync = (cmd: string) => {
        const run = () => this._messageAsync(cmd);
        const next = this._messageQueue.then(run, run);

        this._messageQueue = next.catch(() => undefined);

        return next;
    };

    /**
     * Sends a `hl.dispatch(<expr>)` call over the command socket and surfaces
     * Lua errors instead of swallowing them (the socket replies with an
     * `error: ...` string on failure rather than `ok`).
     */
    private async _sendDispatch(expr: string) {
        const response = await this.messageAsync(`dispatch ${expr}`);
        if (response.startsWith('error:')) {
            const error = new Error(`Hyprland dispatch failed: ${response}`);
            logError(error);
            throw error;
        }
        return response;
    }

    /**
     * Evaluates a raw Lua string via the command socket's `eval` request.
     * Returns `ok` or the raised error.
     *
     * @param lua - The Lua source to execute
     */
    readonly eval = (lua: string) => this.messageAsync(`eval ${lua}`);

    /**
     * Runs a legacy text-protocol dispatch command (e.g. `workspace 1`),
     * translating it to the Lua dispatcher API.
     *
     * @deprecated Hyprland 0.55 removed the text dispatch protocol. Use the
     * typed {@link Hyprland.dispatch} API instead.
     * @param command - A legacy dispatcher invocation without the `dispatch` prefix
     */
    readonly dispatchLegacy = (command: string) => this.messageAsync(`dispatch ${command}`);

    private async _syncMonitors(notify = true) {
        try {
            const msg = await this.messageAsync('j/monitors');
            this._monitors.clear();
            for (const m of JSON.parse(msg) as Array<Monitor>) {
                this._monitors.set(m.id, m);
                if (m.focused) {
                    this._active.monitor.update(m.id, m.name);
                    this._active.workspace.update(m.activeWorkspace.id, m.activeWorkspace.name);
                    this._active.monitor.emit('changed');
                    this._active.workspace.emit('changed');
                }
            }
            if (notify) this.notify('monitors');
        } catch (error) {
            logError(error);
        }
    }

    private async _syncWorkspaces(notify = true) {
        try {
            const msg = await this.messageAsync('j/workspaces');
            this._workspaces.clear();
            for (const ws of JSON.parse(msg) as Array<Workspace>) this._workspaces.set(ws.id, ws);

            if (notify) this.notify('workspaces');
        } catch (error) {
            logError(error);
        }
    }

    private async _syncClients(notify = true) {
        try {
            const msg = await this.messageAsync('j/clients');
            this._clients.clear();
            for (const c of JSON.parse(msg) as Array<Client>) this._clients.set(c.address, c);

            if (notify) this.notify('clients');
        } catch (error) {
            logError(error);
        }
    }

    private async _onEvent(event: string) {
        if (!event) return;

        const [e, params] = event.split('>>');
        const argv = params.split(',');

        try {
            switch (e) {
                case 'workspace':
                case 'workspacev2':
                case 'focusedmon':
                case 'focusedmonv2':
                    await this._syncMonitors();
                    break;

                case 'monitorremoved':
                    await this._syncMonitors();
                    this.emit('monitor-removed', argv[0]);
                    break;

                case 'monitorremovedv2':
                    await this._syncMonitors();
                    this.emit('monitor-removed', argv[1]);
                    break;

                case 'monitoradded':
                    await this._syncMonitors();
                    this.emit('monitor-added', argv[0]);
                    break;

                case 'monitoraddedv2':
                    await this._syncMonitors();
                    this.emit('monitor-added', argv[1]);
                    break;

                case 'createworkspace':
                    await this._syncWorkspaces();
                    this.emit('workspace-added', argv[0]);
                    break;

                case 'createworkspacev2':
                    await this._syncWorkspaces();
                    this.emit('workspace-added', argv[1]);
                    break;

                case 'destroyworkspace':
                    await this._syncWorkspaces();
                    this.emit('workspace-removed', argv[0]);
                    break;

                case 'destroyworkspacev2':
                    await this._syncWorkspaces();
                    this.emit('workspace-removed', argv[1]);
                    break;

                case 'moveworkspace':
                case 'moveworkspacev2':
                    await Promise.all([
                        this._syncClients(false),
                        this._syncWorkspaces(false),
                        this._syncMonitors(false),
                    ]);
                    ['clients', 'workspaces', 'monitors'].forEach(e => this.notify(e));
                    break;

                case 'renameworkspace':
                    await this._syncWorkspaces();
                    break;

                case 'activespecial':
                    this.emit('activespecial', argv[0], argv[1] || '');
                    break;

                case 'activespecialv2':
                    this.emit('activespecial', argv[1], argv[2] || '');
                    break;

                case 'openwindow':
                    await Promise.all([this._syncClients(false), this._syncWorkspaces(false)]);
                    ['clients', 'workspaces'].forEach(e => this.notify(e));
                    this.emit('client-added', '0x' + argv[0]);
                    break;

                case 'closewindow':
                    await Promise.all([this._syncWorkspaces(false), this._syncClients(false)]);
                    if (this._active.client.address === '0x' + argv[0]) {
                        this._active.client.updateProperty('class', '');
                        this._active.client.updateProperty('title', '');
                        this._active.client.updateProperty('address', '');
                        this._active.client.emit('changed');
                    }
                    ['clients', 'workspaces'].forEach(e => this.notify(e));
                    this.emit('client-removed', '0x' + argv[0]);
                    break;

                case 'kill':
                    await Promise.all([this._syncWorkspaces(false), this._syncClients(false)]);
                    ['clients', 'workspaces'].forEach(e => this.notify(e));
                    this.emit('kill', '0x' + argv[0]);
                    break;

                case 'movewindow':
                case 'movewindowv2':
                case 'windowtitle':
                case 'windowtitlev2':
                    await Promise.all([this._syncClients(false), this._syncWorkspaces(false)]);
                    ['clients', 'workspaces'].forEach(e => this.notify(e));
                    break;

                case 'fullscreen':
                    await Promise.all([this._syncClients(false), this._syncWorkspaces(false)]);
                    ['clients', 'workspaces'].forEach(e => this.notify(e));
                    this.emit('fullscreen', argv[0] === '1');
                    break;

                case 'activewindow':
                    this._active.client.updateProperty('class', argv[0]);
                    this._active.client.updateProperty('title', argv.slice(1).join(','));
                    this._active.client.emit('changed');
                    break;

                case 'activewindowv2':
                    this._active.client.updateProperty('address', argv[0] ? '0x' + argv[0] : '');
                    this._active.client.emit('changed');
                    break;

                case 'urgent':
                    this.emit('urgent-window', '0x' + argv[0]);
                    break;

                case 'activelayout':
                    this.emit('keyboard-layout', `${argv[0]}`, `${argv[1]}`);
                    break;

                case 'changefloatingmode':
                    await this._syncClients();
                    break;

                case 'submap':
                    this.emit('submap', argv[0]);
                    break;

                case 'screencast':
                case 'screencastv2':
                    this.emit('screencast', argv[0] === '1', parseInt(argv[1]), argv[2] || '');
                    break;

                case 'togglegroup':
                case 'moveintogroup':
                case 'moveoutofgroup':
                case 'ignoregrouplock':
                    await this._syncClients();
                    break;

                case 'lockgroups':
                    await this._syncClients();
                    this.emit('lockgroups', argv[0] === '1');
                    break;

                case 'configreloaded':
                    this.emit('configreloaded');
                    break;

                case 'pin':
                    await this._syncClients();
                    this.emit('pin', '0x' + argv[0], argv[1] === '1');
                    break;

                case 'minimized':
                    await this._syncClients();
                    this.emit('minimized', '0x' + argv[0], argv[1] === '1');
                    break;

                case 'bell':
                    this.emit('bell', argv[0] ? '0x' + argv[0] : '');
                    break;

                case 'empty':
                    this.emit('empty', argv[0]);
                    break;

                case 'custom':
                    this.emit('custom', params);
                    break;

                case 'openlayer':
                case 'closelayer':
                    break;

                default:
                    break;
            }
        } catch (error) {
            if (error instanceof Error) console.error(error.message);
        }

        this.emit('event', e, params);
        this.emit('changed');
    }

    dispose(): void {
        super.dispose();

        // Close socket stream and connection
        if (this._eventStream) {
            try {
                this._eventStream.close(null);
            } catch (error) {
                console.error('Error closing Hyprland socket stream:', error);
            }
            this._eventStream = null;
        }

        if (this._eventConnection) {
            try {
                this._eventConnection.close(null);
            } catch (error) {
                console.error('Error closing Hyprland socket connection:', error);
            }
            this._eventConnection = null;
        }

        // Cleanup active tracker
        if (this._active) {
            globalSignalRegistry.disconnect(this._active as unknown as GObject.Object);
            this._active.dispose();
        }

        // Clear state maps
        this._monitors.clear();
        this._workspaces.clear();
        this._clients.clear();
    }
}

/** Hyprland monitor state as returned by the IPC. */
export interface Monitor {
    id: number;
    name: string;
    description: string;
    make: string;
    model: string;
    serial: string;
    width: number;
    height: number;
    refreshRate: number;
    x: number;
    y: number;
    activeWorkspace: {
        id: number;
        name: string;
    };
    specialWorkspace: {
        id: number;
        name: string;
    };
    reserved: [number, number, number, number];
    scale: number;
    transform: number;
    focused: boolean;
    dpmsStatus: boolean;
    vrr: boolean;
    activelyTearing: boolean;
    physicalWidth: number;
    physicalHeight: number;
    solitary: boolean;
    solitaryBlockedBy: string[];
    tearingBlockedBy: string[];
    directScanoutTo: string;
    directScanoutBlockedBy: string[];
    disabled: boolean;
    currentFormat: string;
    mirrorOf: string;
    availableModes: string[];
    colorManagementPreset: number;
    sdrBrightness: number;
    sdrSaturation: number;
    sdrMinLuminance: number;
    sdrMaxLuminance: number;
    hardwareCursorsInUse: boolean;
}

/** Hyprland workspace state as returned by the IPC. */
export interface Workspace {
    id: number;
    name: string;
    monitor: string;
    monitorID: number;
    windows: number;
    hasfullscreen: boolean;
    lastwindow: string;
    lastwindowtitle: string;
    ispersistent: boolean;
    tiledLayout: string;
}

/** Hyprland client (window) state as returned by the IPC. */
export interface Client {
    address: string;
    mapped: boolean;
    hidden: boolean;
    at: [number, number];
    size: [number, number];
    workspace: {
        id: number;
        name: string;
    };
    floating: boolean;
    monitor: number;
    class: string;
    title: string;
    initialClass: string;
    initialTitle: string;
    pid: number;
    xwayland: boolean;
    pinned: boolean;
    fullscreen: number;
    fullscreenClient: number;
    fullscreenMode: number;
    fakeFullscreen: boolean;
    grouped: string[];
    tags: string[];
    swallowing: string;
    focusHistoryID: number;
    visible: boolean;
    acceptsInput: boolean;
    overFullscreen: boolean;
    inhibitingIdle: boolean;
    xdgTag: string;
    xdgDescription: string;
    contentType: string;
    stableId: string;
}

export const hyprland = new Hyprland();
export default hyprland;
