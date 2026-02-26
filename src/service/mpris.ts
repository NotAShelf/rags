import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Service from '../service.js';
import type { Disposable } from '../service.js';
import { ensureDirectory, idle, globalSignalRegistry } from '../utils.js';
import { CACHE_DIR } from '../utils.js';
import { loadInterfaceXML } from '../utils.js';
import { DBusProxy, PlayerProxy, MprisProxy, connectSignal } from '../dbus/types.js';

const DBusIFace = loadInterfaceXML('org.freedesktop.DBus')!;
const PlayerIFace = loadInterfaceXML('org.mpris.MediaPlayer2.Player')!;
const MprisIFace = loadInterfaceXML('org.mpris.MediaPlayer2')!;
const DBusProxy = Gio.DBusProxy.makeProxyWrapper(DBusIFace) as unknown as DBusProxy;
const PlayerProxy = Gio.DBusProxy.makeProxyWrapper(PlayerIFace) as unknown as PlayerProxy;
const MprisProxy = Gio.DBusProxy.makeProxyWrapper(MprisIFace) as unknown as MprisProxy;

const DBUS_PREFIX = 'org.mpris.MediaPlayer2.';
const MEDIA_CACHE_PATH = `${CACHE_DIR}/media`;

/** MPRIS playback status. */
type PlaybackStatus = 'Playing' | 'Paused' | 'Stopped';
/** MPRIS loop/repeat mode. */
type LoopStatus = 'None' | 'Track' | 'Playlist';
/** MPRIS metadata dictionary following the xesam/mpris ontology. */
type MprisMetadata = {
    'mpris:trackid'?: string;
    'mpris:length'?: number;
    'mpris:artUrl'?: string;
    'xesam:album'?: string;
    'xesam:albumArtist'?: string;
    'xesam:artist'?: string[];
    'xesam:asText'?: string;
    'xesam:audioBPM'?: number;
    'xesam:autoRating'?: number;
    'xesam:comment'?: string[];
    'xesam:composer'?: string[];
    'xesam:contentCreated'?: string;
    'xesam:discNumber'?: number;
    'xesam:firstUsed'?: string;
    'xesam:genre'?: string[];
    'xesam:lastUsed'?: string;
    'xesam:lyricist'?: string[];
    'xesam:title'?: string;
    'xesam:trackNumber'?: number;
    'xesam:url'?: string;
    'xesam:useCount'?: number;
    'xesam:userRating'?: number;
    [key: string]: unknown;
};

/**
 * MPRIS Player
 *
 * Represents a single MPRIS-compatible media player on the session bus.
 *
 * Lifecycle:
 * 1. Construction - Connect to D-Bus player proxies
 * 2. Ready - Monitor playback state and metadata changes
 * 3. Disposal - Disconnect proxies and cleanup cover art cache
 *
 * @property {string} bus_name - Full D-Bus bus name
 * @property {string} name - Short player name
 * @property {string} entry - Desktop entry identifier
 * @property {string} identity - Human-readable player identity
 * @property {MprisMetadata} metadata - Raw MPRIS metadata
 * @property {string} trackid - MPRIS track ID
 * @property {string[]} track_artists - List of artist names
 * @property {string} track_title - Track title
 * @property {string} track_album - Album name
 * @property {string} track_cover_url - Cover art URL
 * @property {string} cover_path - Local cached cover art path
 * @property {PlaybackStatus} play_back_status - Playback status
 * @property {boolean} can_go_next - Whether player can go to next track
 * @property {boolean} can_go_prev - Whether player can go to previous track
 * @property {boolean} can_play - Whether player can play
 * @property {boolean|null} shuffle_status - Shuffle status
 * @property {LoopStatus|null} loop_status - Loop/repeat status
 * @property {number} length - Track length in seconds
 * @property {number} volume - Volume level (0.0-1.0)
 * @property {number} position - Playback position in seconds
 *
 * @fires closed - Emitted when player disappears from bus
 * @fires position - Emitted when position is set
 * @fires changed - Emitted when player state changes
 */
export class MprisPlayer extends Service implements Disposable {
    static {
        Service.register(
            this,
            {
                closed: [],
                position: ['int'],
            },
            {
                'bus-name': ['string'],
                name: ['string'],
                entry: ['string'],
                identity: ['string'],
                metadata: ['string'],
                trackid: ['string'],
                'track-artists': ['jsobject'],
                'track-title': ['string'],
                'track-album': ['string'],
                'track-cover-url': ['string'],
                'cover-path': ['string'],
                'play-back-status': ['string'],
                'can-go-next': ['boolean'],
                'can-go-prev': ['boolean'],
                'can-play': ['boolean'],
                'shuffle-status': ['jsobject'],
                'loop-status': ['jsobject'],
                length: ['int'],
                position: ['float', 'rw'],
                volume: ['float', 'rw'],
            },
        );
    }

    /** The full D-Bus bus name (e.g. "org.mpris.MediaPlayer2.spotify"). */
    get bus_name() {
        return this._busName;
    }

    /** Short player name extracted from the bus name. */
    get name() {
        return this._name;
    }

    /** Desktop entry identifier from the MPRIS interface. */
    get entry() {
        return this._entry;
    }

    /** Human-readable player identity string. */
    get identity() {
        return this._identity;
    }

    /** Raw MPRIS metadata dictionary. */
    get metadata() {
        return this._metadata;
    }

    /** The MPRIS track ID. */
    get trackid() {
        return this._trackid;
    }

    /** List of track artist names. */
    get track_artists() {
        return this._trackArtists;
    }

    /** Current track title. */
    get track_title() {
        return this._trackTitle;
    }

    /** Current track album name. */
    get track_album() {
        return this._trackAlbum;
    }

    /** URL of the track's cover art. */
    get track_cover_url() {
        return this._trackCoverUrl;
    }

    /** Local file path of the cached cover art image. */
    get cover_path() {
        return this._coverPath;
    }

    /** Current playback status: "Playing", "Paused", or "Stopped". */
    get play_back_status() {
        return this._playBackStatus;
    }

    /** Whether the player can advance to the next track. */
    get can_go_next() {
        return this._canGoNext;
    }

    /** Whether the player can go to the previous track. */
    get can_go_prev() {
        return this._canGoPrev;
    }

    /** Whether the player can start playback. */
    get can_play() {
        return this._canPlay;
    }

    /** Current shuffle status (true/false/null if unsupported). */
    get shuffle_status() {
        return this._shuffleStatus;
    }

    /** Current loop status: "None", "Track", "Playlist", or null if unsupported. */
    get loop_status() {
        return this._loopStatus;
    }

    /** Track length in seconds (-1 if unknown). */
    get length() {
        return this._length;
    }

    private _busName: string;
    private _name: string;
    private _entry!: string;
    private _identity!: string;
    private _metadata: MprisMetadata = {};

    private _trackid!: string;
    private _trackArtists!: string[];
    private _trackTitle!: string;
    private _trackAlbum!: string;
    private _trackCoverUrl!: string;
    private _coverPath!: string;
    private _playBackStatus!: PlaybackStatus;
    private _canGoNext!: boolean;
    private _canGoPrev!: boolean;
    private _canPlay!: boolean;
    private _shuffleStatus!: boolean | null;
    private _loopStatus!: LoopStatus | null;
    private _length!: number;

    private _binding = { mpris: [0, 0], player: 0 };
    private _mprisProxy: MprisProxy;
    private _playerProxy: PlayerProxy;
    private _rawPlayerProxy: Gio.DBusProxy;

    constructor(busName: string) {
        super();

        this._busName = busName;
        this._name = busName.substring(23).split('.')[0];

        this._mprisProxy = new MprisProxy(Gio.DBus.session, busName, '/org/mpris/MediaPlayer2');

        this._playerProxy = new PlayerProxy(Gio.DBus.session, busName, '/org/mpris/MediaPlayer2');

        this._rawPlayerProxy = Gio.DBusProxy.new_for_bus_sync(
            Gio.BusType.SESSION,
            Gio.DBusProxyFlags.NONE,
            null,
            busName,
            '/org/mpris/MediaPlayer2',
            'org.mpris.MediaPlayer2.Player',
            null,
        );

        this._onPlayerProxyReady();
        this._onMprisProxyReady();
        this._updateState();
        idle(this._updateState.bind(this));
    }

    close() {
        this.emit('closed');
    }

    private _onMprisProxyReady() {
        this._binding.mpris[0] = this._mprisProxy.connect('notify::g-name-owner', () => {
            if (!this._mprisProxy.g_name_owner) this.close();
        });
        globalSignalRegistry.register(
            this._mprisProxy as unknown as GObject.Object,
            this._binding.mpris[0],
        );

        this._binding.mpris[1] = this._mprisProxy.connect('g-properties-changed', () =>
            this._updateState(),
        );
        globalSignalRegistry.register(
            this._mprisProxy as unknown as GObject.Object,
            this._binding.mpris[1],
        );

        this._identity = this._mprisProxy.Identity;
        this._entry = this._mprisProxy.DesktopEntry;
        if (!this._mprisProxy.g_name_owner) this.close();
    }

    private _onPlayerProxyReady() {
        this._binding.player = this._playerProxy.connect('g-properties-changed', () =>
            this._updateState(),
        );
        globalSignalRegistry.register(
            this._playerProxy as unknown as GObject.Object,
            this._binding.player,
        );
    }

    private _updateState() {
        const metadata = {} as MprisMetadata;
        for (const prop in this._playerProxy.Metadata)
            metadata[prop] = this._playerProxy.Metadata[prop].deepUnpack();

        let trackArtists = metadata['xesam:artist'];
        if (
            !Array.isArray(trackArtists) ||
            !trackArtists.every(artist => typeof artist === 'string')
        )
            trackArtists = ['Unknown artist'];

        let trackTitle = metadata['xesam:title'];
        if (typeof trackTitle !== 'string') trackTitle = 'Unknown title';

        let trackAlbum = metadata['xesam:album'];
        if (typeof trackAlbum !== 'string') trackAlbum = 'Unknown album';

        let trackCoverUrl = metadata['mpris:artUrl'];
        if (typeof trackCoverUrl !== 'string') trackCoverUrl = '';

        let length = metadata['mpris:length'];
        length = typeof length === 'number' ? length / 1_000_000 : -1;

        this.updateProperty('metadata', metadata);
        this.updateProperty('shuffle-status', this._playerProxy.Shuffle);
        this.updateProperty('loop-status', this._playerProxy.LoopStatus);
        this.updateProperty('can-go-next', this._playerProxy.CanGoNext);
        this.updateProperty('can-go-prev', this._playerProxy.CanGoPrevious);
        this.updateProperty('can-play', this._playerProxy.CanPlay);
        this.updateProperty('play-back-status', this._playerProxy.PlaybackStatus);
        this.updateProperty('trackid', metadata['mpris:trackid']);
        this.updateProperty('track-artists', trackArtists);
        this.updateProperty('track-title', trackTitle);
        this.updateProperty('track-album', trackAlbum);
        this.updateProperty('track-cover-url', trackCoverUrl);
        this.updateProperty('length', length);
        this.updateProperty('identity', this._mprisProxy.Identity);
        this.updateProperty('entry', this._mprisProxy.DesktopEntry);
        this._cacheCoverArt();
        this.emit('changed');
    }

    private _cacheCoverArt() {
        if (!mpris.cacheCoverArt || this._trackCoverUrl === '') return;

        this._coverPath =
            MEDIA_CACHE_PATH +
            '/' +
            GLib.compute_checksum_for_string(GLib.ChecksumType.SHA1, this._trackCoverUrl, -1);

        if (GLib.file_test(this._coverPath, GLib.FileTest.EXISTS))
            return this.changed('cover-path');

        ensureDirectory(MEDIA_CACHE_PATH);
        Gio.File.new_for_uri(this._trackCoverUrl).copy_async(
            Gio.File.new_for_path(this._coverPath),
            Gio.FileCopyFlags.OVERWRITE,
            GLib.PRIORITY_DEFAULT,
            null,
            null,
            (source: Gio.File, result: Gio.AsyncResult) => {
                try {
                    source.copy_finish(result);
                    this.changed('cover-path');
                } catch (err) {
                    logError(err);
                    console.error(
                        `failed to cache ${this._coverPath},` + ' do you have gvfs installed?',
                    );
                }
            },
        );
    }

    /** Player volume level (0.0-1.0, or -1 if unavailable). */
    get volume() {
        let volume = this._playerProxy.Volume;
        if (typeof volume !== 'number') volume = -1;

        return volume;
    }

    set volume(value) {
        this._playerProxy.Volume = value;
    }

    /** Current playback position in seconds (-1 if unavailable). */
    get position() {
        const pos = this._rawPlayerProxy.get_cached_property('Position')?.unpack() as number;
        return pos ? pos / 1_000_000 : -1;
    }

    /** Sets the playback position in seconds. */
    set position(time: number) {
        const micro = Math.floor(time * 1_000_000);
        this._playerProxy.SetPositionAsync(this.trackid, micro);
        this.notify('position');
        this.emit('position', time);
    }

    /** Toggles between play and pause. */
    readonly playPause = () => this._playerProxy.PlayPauseAsync().catch(console.error);
    /** Starts playback. */
    readonly play = () => this._playerProxy.PlayAsync().catch(console.error);
    /** Stops playback. */
    readonly stop = () => this._playerProxy.StopAsync().catch(console.error);

    /** Advances to the next track. */
    readonly next = () => this._playerProxy.NextAsync().catch(console.error);
    /** Returns to the previous track. */
    readonly previous = () => this._playerProxy.PreviousAsync().catch(console.error);

    /** Toggles shuffle mode. */
    readonly shuffle = () => (this._playerProxy.Shuffle = !this._playerProxy.Shuffle);
    /** Cycles loop status through None -> Track -> Playlist -> None. */
    readonly loop = () => {
        switch (this._playerProxy.LoopStatus) {
            case 'None':
                this._playerProxy.LoopStatus = 'Track';
                break;
            case 'Track':
                this._playerProxy.LoopStatus = 'Playlist';
                break;
            case 'Playlist':
                this._playerProxy.LoopStatus = 'None';
                break;
            default:
                break;
        }
    };

    dispose(): void {
        // Disconnect proxies via registry only
        if (this._mprisProxy) {
            globalSignalRegistry.disconnect(this._mprisProxy as unknown as GObject.Object);
        }

        if (this._playerProxy) {
            globalSignalRegistry.disconnect(this._playerProxy as unknown as GObject.Object);
        }

        super.dispose();
    }
}

/**
 * MPRIS Service
 *
 * Service that discovers and manages MPRIS media players on the D-Bus session bus.
 *
 * Lifecycle:
 * 1. Construction - Connect to D-Bus daemon
 * 2. Ready - Discover and monitor MPRIS players
 * 3. Active - Track player additions, removals, state changes
 * 4. Disposal - Cleanup all players and D-Bus connections
 *
 * @property {MprisPlayer[]} players - All currently active MPRIS players
 * @property {boolean} cacheCoverArt - Whether to cache cover art locally (default: true)
 *
 * @fires player-added - Emitted when player appears (busName: string)
 * @fires player-closed - Emitted when player disappears (busName: string)
 * @fires player-changed - Emitted when player state changes (busName: string)
 * @fires changed - Emitted when any player state changes
 */
export class Mpris extends Service implements Disposable {
    static {
        Service.register(
            this,
            {
                'player-changed': ['string'],
                'player-closed': ['string'],
                'player-added': ['string'],
            },
            {
                players: ['jsobject'],
            },
        );
    }

    /** Whether to cache cover art images locally (default true). */
    public cacheCoverArt = true;

    private _proxy: DBusProxy;
    private _players: Map<string, MprisPlayer> = new Map();

    /** All currently active MPRIS players. */
    get players() {
        return Array.from(this._players.values());
    }

    constructor() {
        super();

        this._proxy = new DBusProxy(
            Gio.DBus.session,
            'org.freedesktop.DBus',
            '/org/freedesktop/DBus',
            this._onProxyReady.bind(this),
            null,
            Gio.DBusProxyFlags.NONE,
        );
    }

    private _addPlayer(busName: string) {
        if (this._players.has(busName)) return;

        const player = new MprisPlayer(busName);

        const closedId = player.connect('closed', () => {
            // Cleanup player
            globalSignalRegistry.disconnect(player as unknown as GObject.Object);
            player.dispose();
            this._players.delete(busName);
            this.emit('player-closed', busName);
            this.changed('players');
        });
        globalSignalRegistry.register(player as unknown as GObject.Object, closedId);

        const changedId = player.connect('changed', () => {
            this.emit('player-changed', busName);
            this.emit('changed');
        });
        globalSignalRegistry.register(player as unknown as GObject.Object, changedId);

        this._players.set(busName, player);
        this.emit('player-added', busName);
        this.changed('players');
    }

    private async _onProxyReady(_: DBusProxy, error: GLib.Error) {
        if (error) return logError(error);

        const [names] = await this._proxy.ListNamesAsync();
        for (const name of names) {
            if (name.startsWith(DBUS_PREFIX)) this._addPlayer(name);
        }

        const signalId = connectSignal(
            this._proxy,
            'NameOwnerChanged',
            this._onNameOwnerChanged.bind(this),
        );
        globalSignalRegistry.register(this._proxy as unknown as GObject.Object, signalId);
    }

    private _onNameOwnerChanged(
        _proxy: Gio.DBusProxy,
        _sender: string,
        [name, oldOwner, newOwner]: string[],
    ) {
        if (!name.startsWith(DBUS_PREFIX)) return;

        if (newOwner && !oldOwner) this._addPlayer(name);
    }

    /**
     * Finds the first player whose bus name contains the given string.
     *
     * @param name - Substring to match against bus names (empty matches any)
     * @returns The matching MprisPlayer or null
     */
    readonly getPlayer = (name = '') => {
        for (const [busName, player] of this._players) {
            if (busName.includes(name)) return player;
        }
        return null;
    };

    dispose(): void {
        // Cleanup all players (use snapshot to avoid mutation during iteration)
        for (const player of Array.from(this._players.values())) {
            globalSignalRegistry.disconnect(player as unknown as GObject.Object);
            player.dispose();
        }
        this._players.clear();

        // Cleanup D-Bus proxy
        if (this._proxy) {
            globalSignalRegistry.disconnect(this._proxy as unknown as GObject.Object);
        }

        super.dispose();
    }
}

export const mpris = new Mpris();
export default mpris;
