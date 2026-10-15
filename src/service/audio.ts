import Service from '../service.js';
import type { Disposable } from '../service.js';
import type { ChildScope } from '../internal/resource-scope.js';
import GObject from 'gi://GObject';
import Gvc from 'gi://Gvc';
import { AgsServiceError } from '../utils/errors.js';

const _MIXER_CONTROL_STATE = {
    [Gvc.MixerControlState.CLOSED]: 'closed',
    [Gvc.MixerControlState.READY]: 'ready',
    [Gvc.MixerControlState.CONNECTING]: 'connecting',
    [Gvc.MixerControlState.FAILED]: 'failed',
};

/**
 * Audio Stream
 *
 * Represents a single audio stream (sink, source, application, or recorder).
 *
 * @property {string} application_id - PulseAudio/PipeWire application ID
 * @property {string} description - Human-readable stream description
 * @property {boolean} is_muted - Whether stream is muted
 * @property {number} volume - Volume level (0.0-1.0+)
 * @property {string} icon_name - Icon name for the stream
 */
export class Stream extends Service implements Disposable {
    static {
        Service.register(
            this,
            {
                closed: [],
            },
            {
                'application-id': ['string'],
                description: ['string'],
                'is-muted': ['boolean'],
                volume: ['float', 'rw'],
                'icon-name': ['string'],
                id: ['int'],
                state: ['string'],
                stream: ['jsobject'],
            },
        );
    }

    private _stream?: Gvc.MixerStream;
    private _streamScope?: ChildScope;
    private _oldVolume = 0;

    /**
     * Binds this wrapper to a Gvc.MixerStream, forwarding property change signals.
     *
     * @param stream - The mixer stream to bind, or null to unbind
     */
    readonly setStream = (stream: Gvc.MixerStream | null) => {
        this._streamScope?.release();
        this._streamScope = undefined;
        if (!stream || this.isDisposed) return;

        this._stream = stream;
        const child = this.resources.child();
        this._streamScope = child;
        for (const prop of [
            'application-id',
            'description',
            'is-muted',
            'volume',
            'icon-name',
            'id',
            'state',
        ]) {
            this.notify(prop);
            child.scope.connect(stream, `notify::${prop}`, () => {
                this.changed(prop);
            });
        }

        this.changed('stream');
    };

    dispose(): void {
        super.dispose();
        this._streamScope = undefined;
        this._stream = undefined;
    }

    constructor(stream?: Gvc.MixerStream) {
        super();
        this.setStream(stream || null);
    }

    /** The PulseAudio/PipeWire application ID. */
    get application_id() {
        return this._stream?.application_id ?? null;
    }

    /** The underlying Gvc.MixerStream instance. */
    get stream() {
        return this._stream ?? null;
    }

    /** Human-readable description of the stream. */
    get description() {
        return this._stream?.description ?? null;
    }

    /** Icon name representing this stream. */
    get icon_name() {
        return this._stream?.icon_name ?? null;
    }

    /** Numeric stream identifier. */
    get id() {
        return this._stream?.id ?? null;
    }

    /** Internal stream name. */
    get name() {
        return this._stream?.name ?? null;
    }

    /** Current stream state: "closed", "ready", "connecting", or "failed". */
    get state() {
        return _MIXER_CONTROL_STATE[this._stream?.state || Gvc.MixerControlState.CLOSED];
    }

    /** Whether the stream is currently muted. */
    get is_muted(): boolean | null {
        return this._stream?.is_muted ?? null;
    }

    set is_muted(mute: boolean) {
        if (this._stream) {
            this._stream.is_muted = mute;
            this._stream.change_is_muted(mute);
        }
    }

    /** Volume level as a float from 0.0 to maxStreamVolume (default 1.5). */
    get volume() {
        const max = audio.control.get_vol_max_norm();
        return this._stream ? this._stream.volume / max : 0;
    }

    /** Sets the volume level, clamped between 0 and maxStreamVolume. */
    set volume(value) {
        // 0..100
        if (value > audio.maxStreamVolume) value = audio.maxStreamVolume;

        if (value < 0) value = 0;

        const max = audio.control.get_vol_max_norm();
        this._stream?.set_volume(value * max);
        this._stream?.push_volume();
    }

    /** Unbinds the underlying stream and emits the "closed" signal. */
    readonly close = () => {
        this.setStream(null);
        this.emit('closed');
    };
}

/**
 * Audio Service
 *
 * Manages PulseAudio/PipeWire audio streams, speakers, and microphones via Gvc.
 *
 * Lifecycle:
 * 1. Construction - Connect to GvcMixerControl
 * 2. Initialization - Enumerate streams, devices
 * 3. Ready - Emit signals on stream/device changes
 * 4. Disposal - Cleanup all stream connections
 *
 * @property {Stream} speaker - Default output device
 * @property {Stream} microphone - Default input device
 * @property {Stream[]} speakers - All output devices
 * @property {Stream[]} microphones - All input devices
 * @property {Stream[]} apps - Application playback streams
 * @property {Stream[]} recorders - Recording streams
 *
 * @fires speaker-changed - Default speaker changed
 * @fires microphone-changed - Default microphone changed
 * @fires stream-added - New stream added
 * @fires stream-removed - Stream removed
 */
export class Audio extends Service implements Disposable {
    static {
        Service.register(
            this,
            {
                'speaker-changed': [],
                'microphone-changed': [],
                'stream-added': ['int'],
                'stream-removed': ['int'],
            },
            {
                apps: ['jsobject'],
                recorders: ['jsobject'],
                speakers: ['jsobject'],
                microphones: ['jsobject'],
                speaker: ['jsobject', 'rw'],
                microphone: ['jsobject', 'rw'],
            },
        );
    }

    /** Maximum allowed stream volume as a multiplier (default 1.5 = 150%). */
    public maxStreamVolume = 1.5;

    private _control: Gvc.MixerControl;
    private _streams: Map<number, Stream>;
    private _streamScopes: Map<number, ChildScope>;
    private _speaker!: Stream;
    private _microphone!: Stream;

    constructor() {
        super();

        this._control = new Gvc.MixerControl({
            name: `${pkg.name} mixer control`,
        });

        this.resources.add(() => this._control.close());
        this._streams = new Map();
        this._streamScopes = new Map();
        this.resources.add(() => {
            this._streams.clear();
            this._streamScopes.clear();
        });
        for (const s of ['speaker', 'microphone'] as const) {
            const stream = new Stream();
            this[`_${s}`] = stream;
            this.resources.add(() => stream.dispose());
            this.resources.connect(stream as unknown as GObject.Object, 'changed', () => {
                this.emit(`${s}-changed`);
                this.emit('changed');
            });
        }

        this.resources.connect(this._control, 'default-sink-changed', (_control, id) =>
            this._defaultChanged(id as number, 'speaker'),
        );
        this.resources.connect(this._control, 'default-source-changed', (_control, id) =>
            this._defaultChanged(id as number, 'microphone'),
        );
        this.resources.connect(this._control, 'stream-added', (_control, id) =>
            this._streamAdded(this._control, id as number),
        );
        this.resources.connect(this._control, 'stream-removed', (_control, id) =>
            this._streamRemoved(this._control, id as number),
        );

        this._control.open();
    }

    /** The underlying Gvc.MixerControl instance. */
    get control() {
        return this._control;
    }

    /** The default audio output (sink) stream. */
    get speaker() {
        return this._speaker;
    }

    /** Sets the default audio output device. */
    set speaker(stream: Stream) {
        if (!stream.stream) {
            throw new AgsServiceError('Stream has no underlying stream object', {
                streamId: stream.id,
            });
        }
        this._control.set_default_sink(stream.stream);
    }

    /** The default audio input (source) stream. */
    get microphone() {
        return this._microphone;
    }

    /** Sets the default audio input device. */
    set microphone(stream: Stream) {
        if (!stream.stream) {
            throw new AgsServiceError('Stream has no underlying stream object', {
                streamId: stream.id,
            });
        }
        this._control.set_default_source(stream.stream);
    }

    /** All available microphone (source) streams. */
    get microphones() {
        return this._getStreams(Gvc.MixerSource);
    }

    /** All available speaker (sink) streams. */
    get speakers() {
        return this._getStreams(Gvc.MixerSink);
    }

    /** All application audio output streams. */
    get apps() {
        return this._getStreams(Gvc.MixerSinkInput);
    }

    /** All application audio recording streams. */
    get recorders() {
        return this._getStreams(Gvc.MixerSourceOutput);
    }

    /**
     * Retrieves a stream wrapper by its numeric ID.
     *
     * @param id - The stream identifier
     * @returns The Stream instance or undefined
     */
    readonly getStream = (id: number) => {
        return this._streams.get(id);
    };

    private _defaultChanged(id: number, type: 'speaker' | 'microphone') {
        const stream = this._streams.get(id);
        if (!stream) return;

        this[`_${type}`].setStream(stream.stream);
        this.changed(type);
        this.emit(`${type}-changed`);
    }

    private _streamAdded(_c: Gvc.MixerControl, id: number) {
        if (this._streams.has(id)) return;

        const gvcstream = this._control.lookup_stream_id(id);
        const stream = new Stream(gvcstream);
        const child = this.resources.child();
        child.scope.add(() => stream.dispose());
        child.scope.connect(stream as unknown as GObject.Object, 'changed', () =>
            this.emit('changed'),
        );

        this._streams.set(id, stream);
        this._streamScopes.set(id, child);

        this._notifyStreams(stream.stream);
        this.emit('stream-added', id);
        this.emit('changed');
    }

    private _streamRemoved(_c: Gvc.MixerControl, id: number) {
        const stream = this._streams.get(id);
        if (!stream) return;

        const nativeStream = stream.stream;
        this._streamScopes.get(id)?.release();
        stream.close();

        this._streams.delete(id);
        this._streamScopes.delete(id);
        this.emit('stream-removed', id);

        this._notifyStreams(nativeStream);
        this.emit('changed');
    }

    private _getStreams(filter: { new (): Gvc.MixerStream }) {
        const list = [];
        for (const [, stream] of this._streams) {
            if (stream.stream instanceof filter) list.push(stream);
        }
        return list;
    }

    private _notifyStreams(stream: Gvc.MixerStream | null) {
        if (stream instanceof Gvc.MixerSource) this.notify('microphones');

        if (stream instanceof Gvc.MixerSink) this.notify('speakers');

        if (stream instanceof Gvc.MixerSinkInput) this.notify('apps');

        if (stream instanceof Gvc.MixerSourceOutput) this.notify('recorders');
    }
}

const audio = new Audio();
export default audio;
