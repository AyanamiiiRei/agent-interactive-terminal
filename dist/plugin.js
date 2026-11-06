/**
 * DeepSeek Harness plugin entry.
 *
 * The package doubles as a bundle: `cordis.patch.yml` inserts one loader row
 * named `agent-interactive-terminal`, and that row calls this module's
 * `apply(ctx, config)`. Tools are registered globally, but each agent gets its
 * own session registry so one agent cannot read or drive another agent's
 * terminal sessions.
 *
 * @module agent-interactive-terminal/plugin
 */
import z from '@deepseek-ai/schemastery';
import { accessSync, constants } from 'node:fs';
import { join } from 'node:path';
import { createAttachUpgrade } from './attach.js';
import { createBridgeHandler } from './bridge.js';
import { TerminalRegistry } from './session/registry.js';
import { createTerminalTools } from './tools/index.js';
export const name = 'agent-interactive-terminal';
export const inject = ['tools'];
/** Shell, capacity and agent tool policy exposed in the Plugins page. */
export const Config = z.object({
    shell: z.union([z.const('auto'), z.const('zsh'), z.const('bash')]).default('auto').volatile(),
    maxSessions: z.number().step(1).min(1).max(16).default(4).volatile(),
    /**
     * Which execution surface the agent should reach for. `exec` keeps the
     * one-shot bash tool as the default, `terminal` prefers the shared
     * interactive terminal and keeps bash as a fallback, and `force` hides bash
     * from every agent so all shell work must use the terminal tools. `auto` is
     * the legacy spelling of `exec` and is kept for existing profiles.
     */
    mode: z
        .union([z.const('auto'), z.const('exec'), z.const('terminal'), z.const('force')])
        .default('exec')
        .volatile(),
    /**
     * Add guidance that sends REPL-shaped work, such as Python sessions, into a
     * live terminal instead of one packed shell command.
     */
    proactive: z.boolean().default(false).volatile(),
});
/**
 * Locate an executable on `PATH` without spawning a process.
 *
 * @param file - bare program name such as `zsh`.
 * @returns the absolute path, or undefined when no entry is executable.
 */
function findOnPath(file) {
    if (typeof file !== 'string' || file.length === 0)
        return undefined;
    const path = process.env['PATH'] ?? '';
    for (const directory of path.split(':')) {
        if (directory.length === 0)
            continue;
        const candidate = join(directory, file);
        try {
            accessSync(candidate, constants.X_OK);
            return candidate;
        }
        catch {
            // Not here; keep looking.
        }
    }
    return undefined;
}
/**
 * Read a live configuration value. Fields marked `.volatile()` in the Config
 * schema arrive wrapped in a getter object so the Host can change them without
 * remounting the plugin; plain values are also accepted for test fixtures.
 *
 * @param value - wrapped or plain configured value.
 * @param fallback - value to use when the field is absent.
 * @returns the current primitive.
 */
function liveValue(value, fallback) {
    if (value === undefined)
        return fallback;
    if (typeof value === 'object' && value !== null && typeof value.get === 'function') {
        const next = value.get();
        return next === undefined ? fallback : next;
    }
    return value;
}
/**
 * Resolve the configured shell choice to a spawnable path.
 *
 * @param choice - configured shell selection.
 * @returns a path, or undefined so the session follows `$SHELL`.
 * @throws when a requested shell is not installed.
 */
function shellPath(choice) {
    if (choice === 'auto' || typeof choice !== 'string')
        return undefined;
    // On Windows the choice names a shell inside WSL; the session builder
    // resolves wsl.exe and reports a clear error when WSL is absent. Looking for
    // a native zsh/bash here would incorrectly reject a valid WSL setup.
    if (process.platform === 'win32')
        return choice;
    const found = findOnPath(choice);
    if (found === undefined) {
        throw new Error(`the configured shell "${choice}" is not on PATH`);
    }
    return found;
}
/**
 * Mount the terminal tools and manage their per-agent registries.
 *
 * @param ctx - plugin context with the tool registry.
 * @param config - validated row configuration.
 */
export function apply(ctx, config) {
    const shellChoice = () => liveValue(config.shell, 'auto');
    const maxSessions = () => liveValue(config.maxSessions, 4);
    const options = { maxSessions: maxSessions() };
    const rawMode = liveValue(config.mode, 'exec');
    const mode = rawMode === 'auto' ? 'exec' : rawMode;
    const proactive = liveValue(config.proactive, false) === true;
    const registries = [];
    const perAgent = new WeakMap();
    let shared;
    const create = () => {
        const registry = new TerminalRegistry(options);
        registries.push(registry);
        return {
            registry,
            tools: new Map(createTerminalTools(registry).map((tool) => [tool.name, tool])),
        };
    };
    const toolkitFor = (agent) => {
        if (typeof agent === 'object' && agent !== null) {
            let instance = perAgent.get(agent);
            if (instance === undefined) {
                instance = create();
                perAgent.set(agent, instance);
            }
            return instance;
        }
        shared ??= create();
        return shared;
    };
    // A plugin row mounted by a bundle is not automatically described by the
    // browser settings mirror when the browser connected first. Registering a
    // presentation for this instance makes the Host re-describe the settings
    // document and push the row's namespace to every open client.
    ctx.inject(['settings'], (settingsCtx) => {
        settingsCtx.effect(() => {
            try {
                return settingsCtx.settings.configure({ auto: false }, settingsCtx.fiber);
            }
            catch {
                // Another instance already owns the presentation; the row form still
                // works, so this optional registration must not break the plugin.
                return () => { };
            }
        });
    });
    const templates = createTerminalTools(new TerminalRegistry(options));
    for (const template of templates) {
        ctx.effect(() => ctx.tools.register({
            name: template.name,
            description: template.description,
            parameters: template.parameters,
            output: {
                schema: { type: 'string' },
                render: (_args, value) => [{ type: 'text', text: value }],
            },
            async execute(args, exec) {
                const toolkit = toolkitFor(exec.agent);
                const tool = toolkit.tools.get(template.name);
                if (tool === undefined)
                    throw new Error(`unknown tool ${template.name}`);
                const input = { ...args };
                if (template.name === 'terminal_open') {
                    toolkit.registry.setMaxSessions(maxSessions());
                }
                if (template.name === 'terminal_open' && input['shell'] === undefined) {
                    const configured = shellPath(shellChoice());
                    if (configured !== undefined)
                        input['shell'] = configured;
                }
                const result = await tool.execute(input);
                return result.text;
            },
        }));
    }
    if (mode === 'force') {
        // A global tool cannot be shadowed by another global registration. Hide
        // bash inside each agent's own scope instead, and lift the restriction when
        // the agent is disposed or this plugin unloads.
        ctx.inject(['agents'], (host) => {
            const restrictions = new Map();
            const restrict = (agent) => {
                if (restrictions.has(agent))
                    return;
                const tools = agent.ctx.tools;
                if (tools === undefined)
                    return;
                try {
                    restrictions.set(agent, tools.restrict({ deny: ['bash'] }));
                }
                catch (error) {
                    ctx.logger?.warn(`agent-interactive-terminal: could not hide bash for an agent: ${error instanceof Error ? error.message : String(error)}`);
                }
            };
            for (const agent of host.agents.list())
                restrict(agent);
            host.effect(() => {
                if (typeof ctx.on !== 'function') {
                    return () => {
                        for (const dispose of restrictions.values())
                            dispose();
                        restrictions.clear();
                    };
                }
                const stopCreated = ctx.on('agent/created', ({ agent }) => restrict(agent));
                const stopDisposed = ctx.on('agent/disposed', ({ agent }) => {
                    const dispose = restrictions.get(agent);
                    if (dispose !== undefined) {
                        dispose();
                        restrictions.delete(agent);
                    }
                });
                return () => {
                    stopCreated();
                    stopDisposed();
                    for (const dispose of restrictions.values())
                        dispose();
                    restrictions.clear();
                };
            });
        });
    }
    const openFromBridge = async (toolkit, options) => {
        const configured = shellPath(shellChoice());
        toolkit.registry.setMaxSessions(maxSessions());
        return toolkit.registry.open({
            ...(options.cols === undefined ? {} : { cols: options.cols }),
            ...(options.rows === undefined ? {} : { rows: options.rows }),
            ...(options.kind === undefined ? {} : { kind: options.kind }),
            ...(configured === undefined ? {} : { shell: configured }),
        });
    };
    ctx.inject(['webServer', 'agents'], (host) => {
        const resolve = (sessionId) => {
            const agent = host.agents.get(sessionId);
            if (agent === undefined)
                return undefined;
            const toolkit = toolkitFor(agent);
            return {
                registry: toolkit.registry,
                open: (options) => openFromBridge(toolkit, options),
            };
        };
        const handler = createBridgeHandler({ resolve });
        const attach = createAttachUpgrade({ resolve });
        host.effect(() => {
            const disposeBridge = host.webServer.register({
                kind: 'prefix',
                path: '/agent-terminal-bridge',
                handler,
            });
            const disposeAttach = host.webServer.registerUpgrade({
                path: '/agent-terminal-bridge/attach',
                handler: attach.handler,
            });
            return () => {
                disposeAttach();
                disposeBridge();
                attach.dispose();
            };
        });
    });
    const modeGuidance = mode === 'force'
        ? 'The bash tool is disabled by configuration for this deployment. Every shell command, including a single one-shot command, must go through terminal_open and the other terminal_* tools. Do not try to call bash; it is not available.'
        : mode === 'terminal'
            ? 'Prefer terminal_open and the other terminal_* tools when work is interactive, long-running, or benefits from shared state: REPLs, package managers, database clients, TUI programs, or anything that may prompt for input. Use bash only for a short one-shot command whose output you need once; the terminal is the default surface.'
            : 'Prefer bash for short one-shot commands whose output you only need once. Use terminal_open and the other terminal_* tools when a program is interactive, long-running, stateful, or should be visible to the user in the right sidebar.';
    const proactiveGuidance = proactive
        ? 'When a task fits a REPL or needs several dependent steps, open an interactive terminal and start the program there, for example run python and then type the code into the live session. Do not pack the whole program into one bash command or heredoc; the live session keeps the work visible and lets the user correct it.'
        : '';
    ctx.inject(['systemPrompt'], (host) => {
        host.effect(() => host.systemPrompt.section({
            name: 'agent-interactive-terminal',
            order: host.systemPrompt.getSectionOrder('TOOL_PTY'),
            text: [
                modeGuidance,
                ...(proactiveGuidance === '' ? [] : [proactiveGuidance]),
                'Terminal rules:',
                '- The user can watch and type into every session in the right sidebar, so treat it as a shared workspace and close sessions you no longer need.',
                '- Before each terminal_send or terminal_key that submits something, write one short sentence in the conversation saying what you are about to run; when a command asks Y or N, say which answer you are giving. Do not narrate every line of output.',
                '- For privileges in an interactive terminal use sudo, never pkexec. When a password prompt is visible the terminal suspends your control so the user can type the password; do not try to type it yourself.',
                '- The person can make a terminal read-only or seal it. READ_ONLY means you may look but not type; SEALED means you can neither look nor type. Say so in one sentence and wait for the person, do not retry or open a replacement to get around it.',
                '- Package-manager upgrades, builds and large downloads can take many minutes. Start them, then leave them alone and tell the user you will report back. Check at most once every five minutes, and never interrupt a slow or quiet command just because it is taking long.',
            ].join('\n'),
        }));
    });
    ctx.effect(() => () => {
        for (const registry of registries)
            void registry.closeAll();
    });
}
export * from './index.js';
//# sourceMappingURL=plugin.js.map