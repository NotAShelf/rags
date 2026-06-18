// @ts-expect-error no types for locally-built GIR library
import GUtils from 'gi://GUtils';
import Service from '../service.js';
import type { Disposable } from '../service.js';

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

    private _agent: any = GUtils.PolkitAgent.new();
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

    constructor() {
        super();

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
                    this._active = true;
                    this._prompt = null;
                    this._currentRequest = {
                        actionId,
                        message,
                        iconName,
                        details: unpackVariant<Record<string, string>>(details),
                        identities: unpackVariant<PolkitIdentity[]>(identities),
                    };
                    this.notify('active');
                    this.notify('prompt');
                    this.notify('current-request');
                    this.emit('begin', this._currentRequest);
                    this.emit('changed');

                    if (this.autoSelectIdentity && this._currentRequest.identities.length > 0) {
                        this.selectIdentity(0);
                    }
                },
            ),
        );

        this.trackConnection(
            this._agent,
            this._agent.connect('request', (_agent: unknown, message: string, echoOn: boolean) => {
                this._prompt = { message, echoOn };
                this.notify('prompt');
                this.emit('request', this._prompt);
                this.emit('changed');
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
                this._clearActive();
                this.emit('completed', authorized);
            }),
        );

        this.trackConnection(
            this._agent,
            this._agent.connect('cancelled', () => {
                this._clearActive();
                this.emit('cancelled');
            }),
        );
    }

    /** Registers this process as the polkit authentication agent. */
    readonly registerAgent = (options: RegisterOptions = {}) => {
        if (this._registered) return;

        this._agent.register(
            options.sessionId ?? '',
            options.objectPath ?? DEFAULT_OBJECT_PATH,
            options.fallback ?? false,
            null,
        );
        this._registered = true;
        this.notify('registered');
        this.emit('changed');
    };

    /** Unregisters this process as the polkit authentication agent. */
    readonly unregisterAgent = () => {
        if (!this._registered) return;
        this._agent.unregister();
        this._registered = false;
        this._clearActive();
        this.notify('registered');
        this.emit('changed');
    };

    /** Selects which offered identity to authenticate as. */
    readonly selectIdentity = (index: number) => {
        if (!Number.isInteger(index) || index < 0) {
            throw new RangeError('Identity index must be a non-negative integer');
        }

        this._agent.select_identity(index);
    };

    /** Sends a response to the current PAM prompt. */
    readonly respond = (response: string) => {
        this._agent.response(response);
        this._prompt = null;
        this.notify('prompt');
        this.emit('changed');
    };

    /** Cancels the current authentication request. */
    readonly cancel = () => {
        this._agent.cancel();
    };

    private _clearActive() {
        this._active = false;
        this._currentRequest = null;
        this._prompt = null;
        this.notify('active');
        this.notify('current-request');
        this.notify('prompt');
        this.emit('changed');
    }

    dispose(): void {
        this.unregisterAgent();
        super.dispose();
    }
}

export const polkit = new Polkit();
export default polkit;
