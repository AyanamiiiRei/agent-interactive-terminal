/**
 * App-only tools behind the ChatGPT/Codex conversation panel.
 *
 * The panel is an MCP App iframe: it cannot open a local WebSocket, so it talks
 * to the same terminal sessions through `tools/call`. Rendering uses an initial
 * ANSI snapshot plus raw output chunks streamed by long polling; keystrokes are
 * written as the person, which takes the lease exactly like typing in the
 * browser panel.
 *
 * @module agent-interactive-terminal/mcp/ui
 */
import { SessionError } from '../errors.js';
/** Resource URI of the terminal panel app. */
export const UI_URI = 'ui://terminal/panel-v11.html';
/** MIME type the host expects for an MCP App template. */
export const UI_MIME = 'text/html;profile=mcp-app';
const APP_ONLY_META = {
    ui: { visibility: ['app'] },
    'openai/visibility': 'private',
};
const PANEL_META = {
    ui: { resourceUri: UI_URI, visibility: ['app'] },
    'ui/resourceUri': UI_URI,
    'ui.resourceUri': UI_URI,
    'openai/outputTemplate': UI_URI,
    'openai/widgetAccessible': true,
    'openai/resultCanProduceWidget': true,
    'openai/ui': {
        entrypoints: [{ type: 'thread' }],
    },
};
const PANEL_RESULT_META = {
    ui: { resourceUri: UI_URI },
    'ui/resourceUri': UI_URI,
    'ui.resourceUri': UI_URI,
    'openai/outputTemplate': UI_URI,
    'openai/widgetAccessible': true,
    'openai/resultCanProduceWidget': true,
    'mcp_app_resource_uri': UI_URI,
};
const STATUS_SCHEMA = {
    type: 'object',
    additionalProperties: true,
};
const taps = new Map();
function tapFor(session) {
    const existing = taps.get(session.id);
    if (existing !== undefined)
        return existing;
    const tap = {
        seq: 0,
        chunks: [],
        waiters: new Set(),
        stop: () => { },
    };
    const notify = () => {
        for (const waiter of [...tap.waiters])
            waiter();
    };
    const offOutput = session.onOutput((data) => {
        tap.seq += 1;
        tap.chunks.push({ seq: tap.seq, data });
        if (tap.chunks.length > 4000)
            tap.chunks.splice(0, tap.chunks.length - 4000);
        notify();
    });
    const offStatus = session.subscribe(() => notify());
    tap.stop = () => {
        offOutput();
        offStatus();
        taps.delete(session.id);
    };
    taps.set(session.id, tap);
    return tap;
}
function stopTap(id) {
    taps.get(id)?.stop();
}
function statusOf(session) {
    const size = session.size;
    const lease = session.lease;
    return {
        id: session.id,
        name: session.name ?? null,
        phase: session.phase,
        holder: lease.holder,
        suspended: lease.suspended,
        access: session.agentAccess,
        cols: size.cols,
        rows: size.rows,
        pending: session.pending.length,
        pendingCommands: session.pending.map((item) => ({ id: item.id, command: item.command })),
        revision: session.revision,
        exited: session.phase === 'exited',
    };
}
function stringField(input, key, fallback = '') {
    const value = input[key];
    return typeof value === 'string' ? value : fallback;
}
function intField(input, key, fallback) {
    const value = input[key];
    return typeof value === 'number' && Number.isInteger(value) ? value : fallback;
}
function textResult(text, structuredContent) {
    return {
        content: [{ type: 'text', text }],
        ...(structuredContent === undefined ? {} : { structuredContent }),
    };
}
function statusResult(session) {
    const status = statusOf(session);
    return textResult(statusLine(status), status);
}
function statusLine(status) {
    return [
        `session ${String(status['id'])}`,
        `phase=${String(status['phase'])}`,
        `lease=${String(status['holder'])}${status['suspended'] === true ? ' (suspended)' : ''}`,
        `access=${String(status['access'])}`,
        `${String(status['cols'])}x${String(status['rows'])}`,
        `pending=${String(status['pending'])}`,
    ].join(' | ');
}
function waitForOutput(tap, cursor, timeoutMs) {
    if (tap.seq > cursor)
        return Promise.resolve();
    return new Promise((resolve) => {
        let settled = false;
        const finish = () => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            tap.waiters.delete(finish);
            resolve();
        };
        const timer = setTimeout(finish, timeoutMs);
        tap.waiters.add(finish);
        if (tap.seq > cursor)
            finish();
    });
}
/**
 * Build the app-only tools and the panel entry tool.
 *
 * @param registry - the same registry the agent-facing tools use.
 */
export function createUiTools(registry) {
    const requireSession = (input) => {
        const id = stringField(input, 'sessionId');
        if (id === '')
            throw new SessionError('sessionId is required', 'NO_SESSION');
        return registry.require(id);
    };
    return [
        {
            name: 'interactive_terminal',
            title: 'Interactive Terminal',
            description: 'Open the interactive terminal panel beside the conversation.',
            inputSchema: { type: 'object', properties: {} },
            annotations: { title: 'Interactive Terminal' },
            meta: PANEL_META,
            async execute() {
                return {
                    content: [{ type: 'text', text: 'Interactive terminal panel opened.' }],
                    structuredContent: { resourceUri: UI_URI },
                    meta: PANEL_RESULT_META,
                };
            },
        },
        {
            name: 'terminal_ui_list',
            description: 'List terminal sessions for the panel. App-only.',
            inputSchema: { type: 'object', properties: {} },
            outputSchema: STATUS_SCHEMA,
            meta: APP_ONLY_META,
            async execute() {
                const sessions = registry.list().map(statusOf);
                return textResult(sessions.length === 0 ? 'No terminal sessions.' : `${sessions.length} session(s).`, {
                    sessions,
                });
            },
        },
        {
            name: 'terminal_ui_attach',
            description: 'Return the initial ANSI snapshot and output cursor for a session. App-only.',
            inputSchema: {
                type: 'object',
                properties: { sessionId: { type: 'string' } },
                required: ['sessionId'],
            },
            outputSchema: STATUS_SCHEMA,
            meta: APP_ONLY_META,
            async execute(input) {
                const session = requireSession(input);
                const tap = tapFor(session);
                const ansi = session.serialize();
                const cursor = tap.seq;
                return textResult('Attached.', { ansi, cursor, status: statusOf(session) });
            },
        },
        {
            name: 'terminal_ui_stream',
            description: 'Long-poll raw output chunks after a cursor. App-only.',
            inputSchema: {
                type: 'object',
                properties: {
                    sessionId: { type: 'string' },
                    cursor: { type: 'integer' },
                    timeoutMs: { type: 'integer', minimum: 100, maximum: 30_000 },
                },
                required: ['sessionId'],
            },
            outputSchema: STATUS_SCHEMA,
            meta: APP_ONLY_META,
            async execute(input) {
                const session = requireSession(input);
                const tap = tapFor(session);
                const cursor = Math.max(0, intField(input, 'cursor', 0));
                const timeoutMs = Math.max(100, Math.min(30_000, intField(input, 'timeoutMs', 8_000)));
                await waitForOutput(tap, cursor, timeoutMs);
                const chunks = tap.chunks.filter((chunk) => chunk.seq > cursor).slice(0, 200);
                const next = chunks.length > 0 ? chunks[chunks.length - 1].seq : cursor;
                const status = statusOf(session);
                return textResult(chunks.length === 0 ? 'No output.' : `${chunks.length} output chunk(s).`, {
                    chunks: chunks.map((chunk) => chunk.data),
                    cursor: next,
                    status,
                });
            },
        },
        {
            name: 'terminal_ui_open',
            description: 'Open a person-owned terminal session from the panel. App-only.',
            inputSchema: {
                type: 'object',
                properties: {
                    cols: { type: 'integer', minimum: 20, maximum: 400 },
                    rows: { type: 'integer', minimum: 5, maximum: 200 },
                },
            },
            outputSchema: STATUS_SCHEMA,
            meta: APP_ONLY_META,
            async execute(input) {
                const session = await registry.open({
                    cols: intField(input, 'cols', 100),
                    rows: intField(input, 'rows', 30),
                    kind: 'user',
                });
                return statusResult(session);
            },
        },
        {
            name: 'terminal_ui_write',
            description: 'Write person keystrokes into a session. App-only.',
            inputSchema: {
                type: 'object',
                properties: {
                    sessionId: { type: 'string' },
                    data: { type: 'string' },
                },
                required: ['sessionId', 'data'],
            },
            outputSchema: STATUS_SCHEMA,
            meta: APP_ONLY_META,
            async execute(input) {
                const session = requireSession(input);
                const data = stringField(input, 'data');
                if (data.length > 8192)
                    throw new Error('data is limited to 8192 bytes');
                if (session.lease.holder !== 'human')
                    session.takeOver();
                await session.write(data, { origin: 'human', submit: false });
                return statusResult(session);
            },
        },
        {
            name: 'terminal_ui_resize',
            description: 'Resize the panel terminal. App-only.',
            inputSchema: {
                type: 'object',
                properties: {
                    sessionId: { type: 'string' },
                    cols: { type: 'integer', minimum: 2, maximum: 500 },
                    rows: { type: 'integer', minimum: 2, maximum: 200 },
                },
                required: ['sessionId', 'cols', 'rows'],
            },
            outputSchema: STATUS_SCHEMA,
            meta: APP_ONLY_META,
            async execute(input) {
                const session = requireSession(input);
                session.resize(intField(input, 'cols', 100), intField(input, 'rows', 30));
                return statusResult(session);
            },
        },
        {
            name: 'terminal_ui_action',
            description: 'Take over, hand back, change access, or close a session. App-only.',
            inputSchema: {
                type: 'object',
                properties: {
                    sessionId: { type: 'string' },
                    action: {
                        type: 'string',
                        enum: ['takeover', 'handback', 'observe', 'collaborate', 'sealed', 'cancel-pending', 'close'],
                    },
                    id: { type: 'integer' },
                },
                required: ['sessionId', 'action'],
            },
            outputSchema: STATUS_SCHEMA,
            meta: APP_ONLY_META,
            async execute(input) {
                const session = requireSession(input);
                const action = stringField(input, 'action');
                switch (action) {
                    case 'takeover':
                        session.takeOver();
                        return statusResult(session);
                    case 'handback':
                        session.handBack();
                        return statusResult(session);
                    case 'observe':
                    case 'collaborate':
                    case 'sealed': {
                        session.setAgentAccess(action);
                        return statusResult(session);
                    }
                    case 'close': {
                        const closed = await registry.close(session.id);
                        stopTap(session.id);
                        return textResult(closed ? `[closed: ${session.id}]` : `[already closed: ${session.id}]`);
                    }
                    case 'cancel-pending': {
                        const id = typeof input['id'] === 'number' ? input['id'] : undefined;
                        session.cancelPending(id);
                        return statusResult(session);
                    }
                    default:
                        throw new Error(`unknown action: ${action}`);
                }
            },
        },
    ];
}
/** Stop every output tap, for MCP server shutdown. */
export function disposeUiTaps() {
    for (const tap of [...taps.values()])
        tap.stop();
}
//# sourceMappingURL=ui.js.map