/**
 * DBus proxy type definitions for system services.
 *
 * These interfaces describe the DBus properties and methods exposed by
 * various system daemons (UPower, MPRIS, StatusNotifierItem, etc.) and
 * are used to create typed proxy wrappers via `Gio.DBusProxy.makeProxyWrapper`.
 *
 * @module
 */
/* eslint-disable @typescript-eslint/no-misused-new */
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

/** Generic DBus proxy with name listing capability. */
export interface DBusProxy extends Gio.DBusProxy {
    new (...args: unknown[]): DBusProxy;
    ListNamesAsync: () => Promise<string[][]>;
}

/**
 * Connects to a DBus signal on a proxy.
 *
 * @param proxy - The DBus proxy
 * @param signalName - The signal name
 * @param callback - Callback invoked when the signal fires
 * @returns The signal connection ID
 */
export function connectSignal<T extends Gio.DBusProxy>(
    proxy: T,
    signalName: string,
    callback: (...args: any[]) => void,
): any {
    return (proxy as any).connectSignal(signalName, callback);
}

/** DBus proxy for MPRIS Player interface (`org.mpris.MediaPlayer2.Player`). */
export interface PlayerProxy extends Gio.DBusProxy {
    new (...args: unknown[]): PlayerProxy;
    CanControl: boolean;
    CanGoNext: boolean;
    CanGoPrevious: boolean;
    CanPlay: boolean;
    CanPause: boolean;
    Metadata: { [key: string]: GLib.Variant };
    PlaybackStatus: string;
    Shuffle: boolean | null;
    LoopStatus: string | null;
    Volume: number;
    Position: number;
    SetPositionAsync: (trackid: string, position: number) => void;
    PlayPauseAsync: () => Promise<void>;
    NextAsync: () => Promise<void>;
    PreviousAsync: () => Promise<void>;
    StopAsync: () => Promise<void>;
    PlayAsync: () => Promise<void>;
}

/** DBus proxy for MPRIS root interface (`org.mpris.MediaPlayer2`). */
export interface MprisProxy extends Gio.DBusProxy {
    new (...args: unknown[]): MprisProxy;
    Raise: () => void;
    Quit: () => void;
    CanQuit: boolean;
    CanRaise: boolean;
    Identity: string;
    DesktopEntry: string;
}

/** DBus proxy for UPower battery device properties. */
export interface BatteryProxy extends Gio.DBusProxy {
    new (...args: unknown[]): BatteryProxy;
    State: number;
    Percentage: number;
    IsPresent: boolean;
    TimeToEmpty: number;
    TimeToFull: number;
    Energy: number;
    EnergyFull: number;
    EnergyRate: number;
}

/** DBus proxy for StatusNotifierItem (system tray items). */
export interface StatusNotifierItemProxy extends Gio.DBusProxy {
    new (...args: unknown[]): StatusNotifierItemProxy;
    Category: string;
    Id: string;
    Title: string;
    Status: string;
    WindowId: number;
    IconThemePath: string;
    ItemIsMenu: boolean;
    Menu: string;
    IconName: string;
    IconPixmap: [number, number, Uint8Array][];
    AttentionIconName: string;
    AttentionIconPixmap: [number, number, Uint8Array][];
    ToolTip: [string, [number, number, Uint8Array], string, string];
    ContextMenuAsync: (x: number, y: number) => Promise<void>;
    ActivateAsync: (x: number, y: number) => Promise<void>;
    SecondaryActivateAsync: (x: number, y: number) => Promise<void>;
    ScrollAsync: (delta: number, orientation: string) => Promise<void>;
}

/** DBus proxy for the AGS application interface. */
export interface AgsProxy extends Gio.DBusProxy {
    new (...args: unknown[]): AgsProxy;
    InspectorRemote: () => void;
    QuitRemote: () => void;
    ToggleWindowSync: (name: string) => boolean;
    RunFileRemote: (js: string, busName?: string, objPath?: string) => void;
    RunJsRemote: (js: string, busName?: string, objPath?: string) => void;

    /** @deprecated Use `RunJsRemote` instead. */
    RunPromiseRemote: (js: string, busName?: string, objPath?: string) => void;
}

export interface StatusNotifierItemProxy extends Gio.DBusProxy {
    new (...args: unknown[]): StatusNotifierItemProxy;
    Category: string;
    Id: string;
    Title: string;
    Status: string;
    WindowId: number;
    IconThemePath: string;
    ItemIsMenu: boolean;
    Menu: string;
    IconName: string;
    IconPixmap: [number, number, Uint8Array][];
    AttentionIconName: string;
    AttentionIconPixmap: [number, number, Uint8Array][];
    ToolTip: [string, [number, number, Uint8Array], string, string];
    ContextMenuAsync: (x: number, y: number) => Promise<void>;
    ActivateAsync: (x: number, y: number) => Promise<void>;
    SecondaryActivateAsync: (x: number, y: number) => Promise<void>;
    ScrollAsync: (delta: number, orientation: string) => Promise<void>;
}

/** DBus proxy for power-profiles-daemon (`net.hadess.PowerProfiles`). */
export interface PowerProfilesProxy extends Gio.DBusProxy {
    new (...args: unknown[]): PowerProfilesProxy;
    ActiveProfile: string;
    PerformanceInhibited: string;
    PerformanceDegraded: string;
    Profiles: Array<{ [key: string]: GLib.Variant }>;
    Actions: string[];
    ActiveProfileHolds: Array<{ [key: string]: GLib.Variant }>;
    HoldProfile(profile: string, reason: string, application_id: string): number;
    ReleaseProfile(cookie: number): void;
}
