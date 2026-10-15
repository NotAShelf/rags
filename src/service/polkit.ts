// @ts-expect-error no types for locally-built GIR library
import GUtils from 'gi://GUtils';
import Service from '../service.js';
import type { Disposable } from '../service.js';
import type Gio from 'gi://Gio';
import type GObject from 'gi://GObject';

interface NativePolkitAgent extends GObject.Object {
    register(
        sessionId: string,
        objectPath: string,
        fallback: boolean,
        cancellable: Gio.Cancellable | null,
    ): boolean;
    unregister(): void;
    select_identity(index: number): boolean;
    response(response: string): boolean;
    cancel(): void;
}

export type PolkitIdentity = {
    id: string;
    kind: string;
    name?: string;
    uid?: number;
    gid?: number;
};

export type PolkitRequest = {
    actionId: string;
    message: string;
    iconName: string;
    details: Record<string, string>;
    identities: PolkitIdentity[];
};

export type PolkitPrompt = {
    message: string;
    echoOn: boolean;
};

export type RegisterOptions = {
    /** Register for this logind/ConsoleKit session id instead of this process' session. */
    sessionId?: string;
    /** D-Bus object path for the authentication agent. */
    objectPath?: string;
    /** Register as a fallback agent when another non-fallback agent exists. */
    fallback?: boolean;
};

const DEFAULT_OBJECT_PATH = '/com/github/Aylur/ags/PolkitAgent';

function unpackVariant<T>(variant: unknown): T {
    const maybeVariant = variant as { deepUnpack?: () => T };
    if (maybeVariant && typeof maybeVariant.deepUnpack === 'function')
        return maybeVariant.deepUnpack();
    return variant as T;
}

/**
 * Polkit authentication agent service.
 *
 * The privileged response path is handled by `PolkitAgent.Session` in the
 * native GUtils helper, which uses polkit's setuid helper. JavaScript code only
 * receives the request metadata and sends responses to the active session.
 *
 * @property registered      - Whether this process is registered as an agent
 * @property active          - Whether an authentication request is active
 * @property current_request - Current action and identity metadata
 * @property prompt          - Current PAM prompt
 */
export class Polkit extends Service implements Disposable {
    static {
        Service.register(
            this,
            {
                begin: ['jsobject'],
                request: ['jsobject'],
                'show-info': ['string'],
                'show-error': ['string'],
                completed: ['boolean'],
                cancelled: [],
            },
            {
                registered: ['boolean', 'r'],
                active: ['boolean', 'r'],
                'current-request': ['jsobject', 'r'],
                prompt: ['jsobject', 'r'],
            },
        );
    }

    private _agent: NativePolkitAgent = GUtils.PolkitAgent.new();
    private _registered = false;
    private _active = false;
    private _currentRequest: PolkitRequest | null = null;
    private _prompt: PolkitPrompt | null = null;

    /**
     * If true, the first offered identity is selected as soon as a request
     * starts. Set this to false if your UI lets users choose an identity.
     */
    autoSelectIdentity = true;

    get registered() {
        return this._registered;
    }

    get active() {
        return this._active;
    }

    get current_request() {
        return this._currentRequest;
    }

    get prompt() {
        return this._prompt;
    }

    private _isCurrentRequest(request: PolkitRequest | null, disposed = false) {
        return this.isDisposed === disposed && this._currentRequest === request;
    }

    private _isCurrentPrompt(prompt: PolkitPrompt | null) {
        return !this.isDisposed && this._prompt === prompt;
    }

    constructor() {
        super();
        this.resources.add(() => {
            try {
                this._agent.cancel();
            } finally {
                if (this._registered) this.unregisterAgent();
                else {
                    this._agent.unregister();
                    if (this._active || this._currentRequest || this._prompt) this._clearActive();
                }
            }
        });

        this.trackConnection(
            this._agent,
            this._agent.connect(
                'begin',
                (
                    _agent: unknown,
                    actionId: string,
                    message: string,
                    iconName: string,
                    details: unknown,
                    identities: unknown,
                ) => {
                    if (this.isDisposed) return;
                    this._active = true;
                    this._prompt = null;
                    const request: PolkitRequest = {
                        actionId,
                        message,
                        iconName,
                        details: unpackVariant<Record<string, string>>(details),
                        identities: unpackVariant<PolkitIdentity[]>(identities),
                    };
                    this._currentRequest = request;
                    this.notify('active');
                    if (!this._isCurrentRequest(request)) return;
                    this.notify('prompt');
                    if (!this._isCurrentRequest(request)) return;
                    this.notify('current-request');
                    if (!this._isCurrentRequest(request)) return;
                    this.emit('begin', request);
                    if (!this._isCurrentRequest(request)) return;
                    this.emit('changed');

                    if (
                        this._isCurrentRequest(request) &&
                        this.autoSelectIdentity &&
                        request.identities.length > 0
                    ) {
                        this.selectIdentity(0);
                    }
                },
            ),
        );

        this.trackConnection(
            this._agent,
            this._agent.connect('request', (_agent: unknown, message: string, echoOn: boolean) => {
                if (this.isDisposed) return;
                const prompt = { message, echoOn };
                this._prompt = prompt;
                this.notify('prompt');
                if (!this._isCurrentPrompt(prompt)) return;
                this.emit('request', prompt);
                if (this._isCurrentPrompt(prompt)) this.emit('changed');
            }),
        );

        this.trackConnection(
            this._agent,
            this._agent.connect('show-info', (_agent: unknown, text: string) => {
                this.emit('show-info', text);
            }),
        );

        this.trackConnection(
            this._agent,
            this._agent.connect('show-error', (_agent: unknown, text: string) => {
                this.emit('show-error', text);
            }),
        );

        this.trackConnection(
            this._agent,
            this._agent.connect('completed', (_agent: unknown, authorized: boolean) => {
                if (this._clearActive()) this.emit('completed', authorized);
            }),
        );

        this.trackConnection(
            this._agent,
            this._agent.connect('cancelled', () => {
                if (this._clearActive()) this.emit('cancelled');
            }),
        );
    }

    /** Registers this process as the polkit authentication agent. */
    readonly registerAgent = (options: RegisterOptions = {}) => {
        if (this.isDisposed || this._registered) return;

        const registered = this._agent.register(
            options.sessionId ?? '',
            options.objectPath ?? DEFAULT_OBJECT_PATH,
            options.fallback ?? false,
            null,
        );
        if (this.isDisposed) {
            this._agent.unregister();
            return;
        }
        if (!registered) return;
        this._registered = true;
        this.notify('registered');
        if (this.isDisposed || !this._registered) return;
        this.emit('changed');
    };

    /** Unregisters this process as the polkit authentication agent. */
    readonly unregisterAgent = () => {
        if (!this._registered) return;
        const disposed = this.isDisposed;
        this._registered = false;
        this._agent.unregister();
        if (!this._clearActive()) return;
        this.notify('registered');
        if (this.isDisposed === disposed) this.emit('changed');
    };

    /** Selects which offered identity to authenticate as. */
    readonly selectIdentity = (index: number) => {
        if (this.isDisposed) return;
        if (!Number.isInteger(index) || index < 0) {
            throw new RangeError('Identity index must be a non-negative integer');
        }

        this._agent.select_identity(index);
    };

    /** Sends a response to the current PAM prompt. */
    readonly respond = (response: string) => {
        if (this.isDisposed) return;
        const prompt = this._prompt;
        this._agent.response(response);
        if (!this._isCurrentPrompt(prompt)) return;
        this._prompt = null;
        this.notify('prompt');
        if (!this._isCurrentPrompt(null)) return;
        this.emit('changed');
    };

    /** Cancels the current authentication request. */
    readonly cancel = () => {
        if (this.isDisposed || !this._active) return;
        this._active = false;
        this._agent.cancel();
    };

    private _clearActive(): boolean {
        const disposed = this.isDisposed;
        this._active = false;
        this._currentRequest = null;
        this._prompt = null;
        this.notify('active');
        if (!this._isCurrentRequest(null, disposed)) return false;
        this.notify('current-request');
        if (!this._isCurrentRequest(null, disposed)) return false;
        this.notify('prompt');
        if (!this._isCurrentRequest(null, disposed)) return false;
        this.emit('changed');
        return this._isCurrentRequest(null, disposed);
    }

    dispose(): void {
        if (this.isDisposed) return;
        super.dispose();
    }
}

export const polkit = new Polkit();
export default polkit;
