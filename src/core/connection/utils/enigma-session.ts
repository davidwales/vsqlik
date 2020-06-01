import WebSocket from "ws";
import { ConnectionHelper } from "./connection.helper";
import { ConnectionData } from "../api";

/**
 * Services to create, cache and handle enigma session
 *
 * ich müsste die gesammte klasse weg speichern
 * aber das ist auch nicht so übel sprach der dübel
 */
export class EnigmaSession {

    private static GLOBAL_SESSION_KEY = "engineData";

    /**
     * array of active session id's
     */
    private activeStack: Array<string>;

    /**
     * all sessions which exists
     */
    private sessionCache: Map<string, enigmaJS.IGeneratedAPI>;

    /**
     * max sessions we could open by default this is 5
     * set to value lte 0 for max sessions
     */
    private maxSessionCount = 5;

    /**
     * connection queue to handle action connections, we could not open same app / global context
     * twice. If an connection is allready runnig save it into connection queue and get it from here
     */
    private connectionQueue: Map<string, Promise<enigmaJS.IGeneratedAPI>>;

    private requestHooks: Array<() => WebSocket.ClientOptions> = [];

    /**
     * Creates an instance of EnigmaSession.
     */
    public constructor(
        private connection: ConnectionData
    ) {
        this.activeStack     = new Array();
        this.connectionQueue = new Map();
        this.sessionCache    = new Map();
    }

    public set maxSessions(max: number) {
        this.maxSessionCount = max;
    }

    public get maxSessions(): number {
        return this.maxSessionCount;
    }

    public beforeWebsocketCreate(hook: () => WebSocket.ClientOptions) {
        this.requestHooks.push(hook);
    }

    public destroy() {
        this.sessionCache.forEach((session) => session.session.close());
        this.sessionCache.clear();
        this.requestHooks = [];
    }

    /**
     * return an existing session object or create a new one
     */
    public async open(appId?: string): Promise<EngineAPI.IGlobal | undefined>
    {
        const id = appId || EnigmaSession.GLOBAL_SESSION_KEY;
        let session: enigmaJS.IGeneratedAPI;

        /** create new session */
        if (!this.isCached(id)) {
            session = await this.createSessionObject(id);
        } else {
            session = await this.activateSession(id);
        }

        return session as EngineAPI.IGlobal;
    }

    public async close(appId?: string): Promise<void> {
        const key = appId || EnigmaSession.GLOBAL_SESSION_KEY;
        if (this.isCached(key)) {
            await this.loadFromCache(key).session.close();
        }
    }

    public async isApp(appid: string): Promise<boolean> {
        const global = await this.open();

        if (global) {
            try {
                const doc = await global.openDoc(appid);
                doc.session.close();
                return true;
            } catch (errorr) {
                return false;
            }
        }
        return false;
    }

    /**
     * activate session if not allready in active stack
     */
    private async activateSession(id: string): Promise<enigmaJS.IGeneratedAPI>
    {
        const connection = this.loadFromCache(id);
        if (connection && !this.isActive(id)) {
            await this.suspendOldestSession();
            await connection.session.resume();
            this.activeStack.push(id);
        }
        return connection;
    }

    /**
     * create new session object, buffer current connections into map
     * so if same connection wants to open twice take existing Promise
     * and return this one.
     *
     * @todo refactor this one
     */
    private async createSessionObject(id: string): Promise<enigmaJS.IGeneratedAPI>
    {
        if (!this.connectionQueue.has(id)) {
            this.connectionQueue.set(id, this.resolveSession(id));
        }
        return this.connectionQueue.get(id) as Promise<enigmaJS.IGeneratedAPI>;
    }

    private async resolveSession(id: string): Promise<enigmaJS.IGeneratedAPI> {
        await this.suspendOldestSession();

        const session = await this.openSession(id);

        if (session) {
            session.on("closed", () => this.removeSessionFromCache(id));
            this.sessionCache.set(id, session);
            this.activeStack.push(id);
            this.connectionQueue.delete(id);
            return session;
        }

        throw new Error(`could not open session for: ${id}`);
    }

    private async openSession(id = EnigmaSession.GLOBAL_SESSION_KEY): Promise<enigmaJS.IGeneratedAPI | undefined> {
        const session = ConnectionHelper.createSession(this.connection, id);
        return session.open();
    }

    /**
     *
     */
    private removeSessionFromCache(id) {
        this.isCached(id) ? this.sessionCache.delete(id) : void 0;
        this.isActive(id) ? this.activeStack.splice(this.activeStack.indexOf(id), 1) : void 0;
    }

    /**
     * returns true if session is allready active
     */
    private isActive(id: string): boolean
    {
        return this.activeStack.indexOf(id) > -1;
    }

    /**
     * returns true if session is allready cached
     */
    private isCached(id: string): boolean
    {
        return this.sessionCache.has(id);
    }

    /**
     * load session object from cache
     */
    private loadFromCache(id = EnigmaSession.GLOBAL_SESSION_KEY): enigmaJS.IGeneratedAPI
    {
        const session = this.sessionCache.get(id);
        if (session) {
            return session;
        }
        throw "Session not found";
    }

    /**
     * suspend oldest session
     */
    private async suspendOldestSession(): Promise<void>
    {
        if (this.maxSessions <= 0 || this.activeStack.length < this.maxSessions) {
            return;
        }

        const oldestSessionId = this.activeStack.shift();
        const connection = this.loadFromCache(oldestSessionId);

        if (connection) {
            await connection.session.suspend();
        }
    }
}
