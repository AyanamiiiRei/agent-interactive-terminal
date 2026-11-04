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
/** Shell selection exposed in the Plugins page and validated by the loader. */
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    shell: z<"auto" | "bash" | "zsh", "auto" | "bash" | "zsh", "defined">;
    maxSessions: z<number, number, "defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    shell: z<"auto" | "bash" | "zsh", "auto" | "bash" | "zsh", "defined">;
    maxSessions: z<number, number, "defined">;
}>>, "plain">;
/** Resolved configuration the loader passes to {@link apply}. */
export interface TerminalPluginConfig {
    /** `auto` follows `$SHELL`; `zsh` and `bash` search `PATH` for that shell. */
    shell: 'auto' | 'zsh' | 'bash';
    /** Concurrent sessions one agent may keep open. */
    maxSessions: number;
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