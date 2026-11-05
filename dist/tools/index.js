const DEFAULT_MAX_BYTES = 16_384;
const MAX_ROWS = 200;
/** Build the eight tools bound to one registry. */
export function createTerminalTools(registry, options = {}) {
    const maxBytes = options.maxResultBytes ?? DEFAULT_MAX_BYTES;
    const render = (view, meta, revision) => {
        const body = view.text.length > 0 ? view.text : '(no visible output)';
        const changed = view.changedRows === undefined
            ? ''
            : view.changedRows.length === 0
                ? '\n(screen unchanged)'
                : `\n[changed rows: ${view.changedRows.join(',')}]`;
        return { text: bound(`${body}${changed}\n${meta}`, maxBytes) };
    };
    return [
        {
            name: 'terminal_open',
            description: 'Open a persistent terminal session and return its id, a status line, and the initial screen. Use a session when state must survive across calls or a program needs interactive input; use one-shot execution for bounded commands. In the DSH web interface the user can watch and type into every session from the right sidebar, so you share one screen with them.',
            parameters: {
                type: 'object',
                properties: {
                    name: {
                        type: 'string',
                        description: 'Optional display name, unique among open sessions, such as "build" or "psql".',
                    },
                    cwd: {
                        type: 'string',
                        description: 'Initial working directory. Defaults to the current directory.',
                    },
                    shell: {
                        type: 'string',
                        description: 'Shell executable. Defaults to the login shell from $SHELL.',
                    },
                    cols: { type: 'integer', description: 'Initial width in columns. Defaults to 100.', minimum: 2, maximum: 500 },
                    rows: { type: 'integer', description: 'Initial height in rows. Defaults to 30.', minimum: 2, maximum: 200 },
                    env: {
                        type: 'object',
                        description: 'Extra environment entries layered over the parent environment.',
                    },
                },
            },
            async execute(input) {
                const options = {};
                const name = optionalString(input, 'name');
                if (name !== undefined)
                    options.name = name;
                const cwd = optionalString(input, 'cwd');
                if (cwd !== undefined)
                    options.cwd = cwd;
                const shell = optionalString(input, 'shell');
                if (shell !== undefined)
                    options.shell = shell;
                const cols = optionalInteger(input, 'cols');
                if (cols !== undefined)
                    options.cols = cols;
                const rows = optionalInteger(input, 'rows');
                if (rows !== undefined)
                    options.rows = rows;
                if (isRecord(input.env))
                    options.env = stringRecord(input.env);
                const session = await registry.open(options);
                const snapshot = session.snapshot();
                const head = `[session: ${session.id}]`;
                return render(snapshot.view, `${head}\n${snapshot.status}`, snapshot.revision);
            },
        },
        {
            name: 'terminal_send',
            description: 'Write text to a terminal session and wait for it to settle. By default Enter is submitted. The call returns when a pattern matches, the program waits for input, the shell is idle, the screen goes quiet, or the timeout expires; check the wait outcome before assuming a command finished.',
            parameters: {
                type: 'object',
                properties: {
                    sessionId: { type: 'string', description: 'Session id returned by terminal_open or terminal_list.' },
                    text: { type: 'string', description: 'Text to write. Multi-line text is sent as a paste when the program enabled bracketed paste.' },
                    submit: { type: 'boolean', description: 'Submit Enter after the text. Defaults to true.', default: true },
                    paste: { type: 'boolean', description: 'Force bracketed-paste wrapping. Defaults to on for multi-line text when the program enabled it.' },
                    match: {
                        type: 'array',
                        description: 'Literal substrings; settling early when any appears on screen.',
                        items: { type: 'string' },
                    },
                    quietMs: { type: 'integer', description: 'Settle after this many milliseconds without output.', minimum: 50, maximum: 600_000 },
                    timeoutMs: { type: 'integer', description: 'Absolute wait bound. Defaults to 30000.', minimum: 100, maximum: 600_000 },
                    view: {
                        type: 'string',
                        description: 'Projection to return. auto picks the screen for full-screen programs and the output tail otherwise.',
                        enum: ['auto', 'screen', 'output'],
                        default: 'auto',
                    },
                },
                required: ['sessionId', 'text'],
            },
            async execute(input) {
                const session = registry.require(requiredString(input, 'sessionId'));
                const writeOptions = {
                    submit: optionalBoolean(input, 'submit') ?? true,
                };
                const paste = optionalBoolean(input, 'paste');
                if (paste !== undefined)
                    writeOptions.paste = paste;
                await session.write(requiredString(input, 'text'), writeOptions);
                const result = await session.wait(waitSpec(input));
                const meta = `[wait: ${result.outcome}] [phase: ${result.phase}] [elapsed: ${result.elapsedMs}ms]\n${result.status}`;
                return render(forceView(session, result.view, input, 'auto'), meta, result.revision);
            },
        },
        {
            name: 'terminal_wait',
            description: 'Wait without writing. Use it to observe a long-running command, watch for a log line, or pick up after a human interaction. Returns the same view and status as terminal_send.',
            parameters: {
                type: 'object',
                properties: {
                    sessionId: { type: 'string', description: 'Session id.' },
                    match: { type: 'array', description: 'Literal substrings that settle the wait.', items: { type: 'string' } },
                    quietMs: { type: 'integer', description: 'Settle after this many milliseconds without output.', minimum: 50, maximum: 600_000 },
                    timeoutMs: { type: 'integer', description: 'Absolute wait bound. Defaults to 30000.', minimum: 100, maximum: 600_000 },
                    view: {
                        type: 'string',
                        description: 'Projection to return.',
                        enum: ['auto', 'screen', 'output'],
                        default: 'auto',
                    },
                },
                required: ['sessionId'],
            },
            async execute(input) {
                const session = registry.require(requiredString(input, 'sessionId'));
                const result = await session.wait(waitSpec(input));
                const meta = `[wait: ${result.outcome}] [phase: ${result.phase}] [elapsed: ${result.elapsedMs}ms]\n${result.status}`;
                return render(forceView(session, result.view, input, 'auto'), meta, result.revision);
            },
        },
        {
            name: 'terminal_snapshot',
            description: 'Read the current screen or output tail without waiting. Pass the revision from the previous result to learn which rows changed.',
            parameters: {
                type: 'object',
                properties: {
                    sessionId: { type: 'string', description: 'Session id.' },
                    view: {
                        type: 'string',
                        description: 'Projection to return. auto picks the screen for full-screen programs.',
                        enum: ['auto', 'screen', 'output'],
                        default: 'auto',
                    },
                    sinceRevision: {
                        type: 'integer',
                        description: 'Revision from the previous result, to compute changed rows.',
                    },
                    maxRows: { type: 'integer', description: 'Maximum rows to return.', minimum: 1, maximum: MAX_ROWS },
                },
                required: ['sessionId'],
            },
            async execute(input) {
                const session = registry.require(requiredString(input, 'sessionId'));
                const snapshotOptions = {
                    mode: viewMode(input, 'auto'),
                };
                const sinceRevision = optionalInteger(input, 'sinceRevision');
                if (sinceRevision !== undefined)
                    snapshotOptions.sinceRevision = sinceRevision;
                const maxRows = optionalInteger(input, 'maxRows');
                if (maxRows !== undefined)
                    snapshotOptions.maxRows = maxRows;
                const snapshot = session.snapshot(snapshotOptions);
                return render(snapshot.view, snapshot.status, snapshot.revision);
            },
        },
        {
            name: 'terminal_key',
            description: 'Press one named key, as a person would. Use it for navigation, interrupting a command, or leaving a full-screen program.',
            parameters: {
                type: 'object',
                properties: {
                    sessionId: { type: 'string', description: 'Session id.' },
                    key: {
                        type: 'string',
                        description: 'Key to press.',
                        enum: [
                            'enter',
                            'tab',
                            'escape',
                            'backspace',
                            'delete',
                            'up',
                            'down',
                            'left',
                            'right',
                            'home',
                            'end',
                            'page-up',
                            'page-down',
                            'ctrl-a',
                            'ctrl-b',
                            'ctrl-c',
                            'ctrl-d',
                            'ctrl-e',
                            'ctrl-k',
                            'ctrl-l',
                            'ctrl-r',
                            'ctrl-u',
                            'ctrl-w',
                            'ctrl-z',
                        ],
                    },
                    repeat: { type: 'integer', description: 'Number of presses, from 1 to 50. Defaults to 1.', minimum: 1, maximum: 50 },
                },
                required: ['sessionId', 'key'],
            },
            async execute(input) {
                const session = registry.require(requiredString(input, 'sessionId'));
                const key = requiredString(input, 'key');
                await session.press(key, optionalInteger(input, 'repeat') ?? 1);
                const snapshot = session.snapshot();
                return render(snapshot.view, `[key: ${key}]\n${snapshot.status}`, snapshot.revision);
            },
        },
        {
            name: 'terminal_resize',
            description: 'Resize the terminal. Full-screen programs receive the new size immediately.',
            parameters: {
                type: 'object',
                properties: {
                    sessionId: { type: 'string', description: 'Session id.' },
                    cols: { type: 'integer', description: 'Width in columns.', minimum: 2, maximum: 500 },
                    rows: { type: 'integer', description: 'Height in rows.', minimum: 2, maximum: 200 },
                },
                required: ['sessionId', 'cols', 'rows'],
            },
            async execute(input) {
                const session = registry.require(requiredString(input, 'sessionId'));
                const cols = requiredInteger(input, 'cols');
                const rows = requiredInteger(input, 'rows');
                session.resize(cols, rows);
                return { text: `[resized: ${cols}x${rows}]` };
            },
        },
        {
            name: 'terminal_close',
            description: 'Close a session and wait for its process tree to stop.',
            parameters: {
                type: 'object',
                properties: {
                    sessionId: { type: 'string', description: 'Session id.' },
                },
                required: ['sessionId'],
            },
            async execute(input) {
                const id = requiredString(input, 'sessionId');
                const closed = await registry.close(id);
                return { text: closed ? `[closed: ${id}]` : `[already closed: ${id}]` };
            },
        },
        {
            name: 'terminal_list',
            description: 'List open sessions with their phase, size, directory, and name.',
            parameters: { type: 'object', properties: {} },
            async execute() {
                const sessions = registry.list();
                if (sessions.length === 0)
                    return { text: '(no terminal sessions)' };
                const lines = sessions.map((session) => {
                    const name = session.name ? ` (${session.name})` : '';
                    const size = session.size;
                    return `${session.id}${name} ${session.phase} ${size.cols}x${size.rows}`;
                });
                return { text: bound(lines.join('\n'), maxBytes) };
            },
        },
    ];
}
/** Build a name-to-tool map for dispatch. */
export function toolIndex(tools) {
    return new Map(tools.map((tool) => [tool.name, tool]));
}
function waitSpec(input) {
    const spec = {};
    const match = input.match;
    if (Array.isArray(match) && match.every((item) => typeof item === 'string')) {
        spec.match = match;
    }
    const quiet = optionalInteger(input, 'quietMs');
    if (quiet !== undefined)
        spec.quietMs = quiet;
    const timeout = optionalInteger(input, 'timeoutMs');
    if (timeout !== undefined)
        spec.timeoutMs = timeout;
    return spec;
}
function forceView(session, result, input, fallback) {
    const requested = viewMode(input, fallback);
    if (requested === 'auto' || requested === result.mode)
        return result;
    const snapshot = session.snapshot({ mode: requested });
    return snapshot.view;
}
function viewMode(input, fallback) {
    const value = input.view;
    if (value === 'auto' || value === 'screen' || value === 'output')
        return value;
    return fallback;
}
function requiredString(input, key) {
    const value = input[key];
    if (typeof value !== 'string' || value.length === 0) {
        throw new Error(`${key} must be a non-empty string`);
    }
    return value;
}
function optionalString(input, key) {
    const value = input[key];
    if (value === undefined && value !== null)
        return undefined;
    if (value === null)
        return undefined;
    if (typeof value !== 'string')
        throw new Error(`${key} must be a string`);
    return value;
}
function requiredInteger(input, key) {
    const value = optionalInteger(input, key);
    if (value === undefined)
        throw new Error(`${key} is required`);
    return value;
}
function optionalInteger(input, key) {
    const value = input[key];
    if (value === undefined || value === null)
        return undefined;
    if (typeof value !== 'number' || !Number.isInteger(value)) {
        throw new Error(`${key} must be an integer`);
    }
    return value;
}
function optionalBoolean(input, key) {
    const value = input[key];
    if (value === undefined || value === null)
        return undefined;
    if (typeof value !== 'boolean')
        throw new Error(`${key} must be a boolean`);
    return value;
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function stringRecord(value) {
    const out = {};
    for (const [key, entry] of Object.entries(value)) {
        if (typeof entry !== 'string')
            throw new Error(`env.${key} must be a string`);
        out[key] = entry;
    }
    return out;
}
function bound(text, maxBytes) {
    const bytes = Buffer.byteLength(text, 'utf8');
    if (bytes <= maxBytes)
        return text;
    const keep = Math.max(0, maxBytes - 64);
    let cut = text.length;
    while (cut > 0 && Buffer.byteLength(text.slice(0, cut), 'utf8') > keep)
        cut -= 1;
    return `${text.slice(0, cut)}\n[truncated: ${bytes - Buffer.byteLength(text.slice(0, cut), 'utf8')} bytes]`;
}
//# sourceMappingURL=index.js.map