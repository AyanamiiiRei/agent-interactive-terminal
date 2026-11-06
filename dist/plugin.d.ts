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
export declare const name = "agent-interactive-terminal";
export declare const inject: string[];
/** Shell, capacity and agent tool policy exposed in the Plugins page. */
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    shell: z<"auto" | "bash" | "zsh", "auto" | "bash" | "zsh", "volatile-defined">;
    maxSessions: z<number, number, "volatile-defined">;
    /**
     * Which execution surface the agent should reach for. `exec` keeps the
     * one-shot bash tool as the default, `terminal` prefers the shared
     * interactive terminal and keeps bash as a fallback, and `force` hides bash
     * from every agent so all shell work must use the terminal tools. `auto` is
     * the legacy spelling of `exec` and is kept for existing profiles.
     */
    mode: z<"auto" | "force" | "exec" | "terminal", "auto" | "force" | "exec" | "terminal", "volatile-defined">;
    /**
     * Add guidance that sends REPL-shaped work, such as Python sessions, into a
     * live terminal instead of one packed shell command.
     */
    proactive: z<boolean, boolean, "volatile-defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    shell: z<"auto" | "bash" | "zsh", "auto" | "bash" | "zsh", "volatile-defined">;
    maxSessions: z<number, number, "volatile-defined">;
    /**
     * Which execution surface the agent should reach for. `exec` keeps the
     * one-shot bash tool as the default, `terminal` prefers the shared
     * interactive terminal and keeps bash as a fallback, and `force` hides bash
     * from every agent so all shell work must use the terminal tools. `auto` is
     * the legacy spelling of `exec` and is kept for existing profiles.
     */
    mode: z<"auto" | "force" | "exec" | "terminal", "auto" | "force" | "exec" | "terminal", "volatile-defined">;
    /**
     * Add guidance that sends REPL-shaped work, such as Python sessions, into a
     * live terminal instead of one packed shell command.
     */
    proactive: z<boolean, boolean, "volatile-defined">;
}>>, "plain">;
/** Resolved configuration the loader passes to {@link apply}. */
export interface TerminalPluginConfig {
    /** `auto` follows `$SHELL` on POSIX and prefers WSL on Windows; `zsh`/`bash` use WSL there. */
    shell: 'auto' | 'zsh' | 'bash';
    /** Concurrent sessions one agent may keep open. */
    maxSessions: number;
    /**
     * Which execution surface the agent should reach for first. `auto` is a
     * legacy alias for `exec`, `terminal` prefers the interactive terminal, and
     * `force` removes the bash tool from each agent.
     */
    mode: 'auto' | 'exec' | 'terminal' | 'force';
    /** Whether to explicitly steer REPL work into an interactive session. */
    proactive: boolean;
}
interface TextBlock {
    type: 'text';
    text: string;
}
interface ToolDefinition {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    output: {
        schema: Record<string, unknown>;
        render(args: unknown, value: string): TextBlock[];
    };
    execute(args: unknown, exec: {
        agent?: unknown;
    }): Promise<string>;
}
interface PluginContext {
    tools: {
        register(definition: ToolDefinition): () => void;
    };
    effect(effect: () => (() => void) | void): void;
    /**
     * Mount an optional feature only when every named service is present.
     * @param services - service names to wait for.
     * @param setup - receives the context carrying those services.
     */
    inject<Host extends object>(services: string[], setup: (scoped: Host & {
        effect(effect: () => (() => void) | void): void;
        fiber: object;
        settings: {
            configure(presentation: {
                auto?: boolean;
            }, owner?: object): () => void;
        };
    }) => void): void;
    /** Listen to the agent lifecycle, used to scope the force-interactive policy. */
    on(event: 'agent/created' | 'agent/disposed', listener: (payload: {
        agent: AgentScope;
    }) => void): () => void;
    logger?: {
        warn(message: string): void;
    };
}
/** One live agent's scoped context, only the parts the tool policy needs. */
interface AgentScope {
    ctx: {
        tools?: {
            restrict(filter: {
                deny?: readonly string[];
            }): () => void;
        };
    };
}
/**
 * Mount the terminal tools and manage their per-agent registries.
 *
 * @param ctx - plugin context with the tool registry.
 * @param config - validated row configuration.
 */
export declare function apply(ctx: PluginContext, config: TerminalPluginConfig): void;
export * from './index.js';
//# sourceMappingURL=plugin.d.ts.map