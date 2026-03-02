import Ajv from "ajv";
import { Tool, ToolDefinition, ToolResult } from "./types";
import {
  ToolNotFoundError,
  ToolInputValidationError,
  ToolExecutionError,
  ToolTimeoutError,
} from "./errors";

const DEFAULT_TIMEOUT_MS = 30_000;

export class ToolRegistry {
  private tools = new Map<string, Tool>();
  private ajv = new Ajv({ allErrors: true, strict: false });

  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered.`);
    }
    this.tools.set(tool.name, tool);
  }

  registerAll(tools: Tool[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }


  unregister(name: string): boolean {
    return this.tools.delete(name);
  }


  resolve(name: string): Tool {
    const tool = this.tools.get(name);
    if (!tool) throw new ToolNotFoundError(name);
    return tool;
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * List tool definitions in a format suitable for the model layer.
   * This is what gets injected into the system prompt so the model
   * knows which tools are available and their input schemas.
   */
  listDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    }));
  }


  listTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Validate input, execute the tool, and handle timeout.
   * Returns a ToolResult on success; throws typed errors on failure.
   */
  async execute(
    name: string,
    input: Record<string, unknown>,
  ): Promise<ToolResult> {
    const tool = this.resolve(name);

    const valid = this.ajv.validate(tool.inputSchema, input);
    if (!valid) {
      const details = this.ajv.errorsText(this.ajv.errors);
      throw new ToolInputValidationError(name, details);
    }

    const timeoutMs =
      (tool.metadata?.timeout as number | undefined) ?? DEFAULT_TIMEOUT_MS;

    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      const result = await Promise.race([
        tool.execute(input),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new ToolTimeoutError(name, timeoutMs)),
            timeoutMs,
          );
        }),
      ]);
      return result;
    } catch (error) {
      if (error instanceof ToolTimeoutError) throw error;
      if (error instanceof ToolInputValidationError) throw error;
      throw new ToolExecutionError(name, error);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * Number of registered tools.
   */
  get size(): number {
    return this.tools.size;
  }
}
