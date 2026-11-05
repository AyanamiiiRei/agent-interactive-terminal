import type { TerminalRegistry } from '../session/registry.js';
import type { SessionPhase, WaitOutcome } from '../types.js';
export interface JsonSchemaProperty {
    type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
    description?: string;
    enum?: readonly string[];
    items?: JsonSchemaProperty;
    minimum?: number;
    maximum?: number;
    default?: unknown;
}
export interface JsonSchema {
    type: 'object';
    properties: Record<string, JsonSchemaProperty>;
    required?: readonly string[];
}
export interface ToolResult {
    text: string;
}
export interface TerminalTool {
    name: string;
    description: string;
    parameters: JsonSchema;
    execute(input: Record<string, unknown>): Promise<ToolResult>;
}
export interface ToolkitOptions {
    /** UTF-8 byte cap for one rendered result. */
    maxResultBytes?: number;
}
/** Build the eight tools bound to one registry. */
export declare function createTerminalTools(registry: TerminalRegistry, options?: ToolkitOptions): TerminalTool[];
/** Build a name-to-tool map for dispatch. */
export declare function toolIndex(tools: TerminalTool[]): Map<string, TerminalTool>;
export type { SessionPhase, WaitOutcome };
//# sourceMappingURL=index.d.ts.map