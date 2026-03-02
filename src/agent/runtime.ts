import { ModelRouter } from "../model/router";
import { SessionService } from "../sessions/session-service";
import { GenerationType, Message, Role, ModelRequest } from "../model/types";
import {
  AgentResponse,
  LoopResponse,
  ToolCall,
  FORMAT_CORRECTION_MESSAGE,
  buildLoopSystemPrompt,
  MAX_ITERS,
} from "./types";
import { SessionServiceType } from "../sessions/types";
import { SQLiteSessionService } from "../sessions/sqlite-sessions";
import { ToolRegistry } from "../tools/tool-registry";
import {
  ToolNotFoundError,
  ToolInputValidationError,
  ToolExecutionError,
  ToolTimeoutError,
} from "../tools/errors";

function extractJson(raw: string): string {
  const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) return fenceMatch[1].trim();

  const braceMatch = raw.match(/\{[\s\S]*\}/);
  if (braceMatch) return braceMatch[0];

  return raw.trim();
}

export class Agent {
  readonly name: string;
  readonly systemPrompt: string;
  readonly modelRouter: ModelRouter;
  readonly description?: string;
  readonly generationMode: GenerationType;
  private sessionService: SessionService;
  private toolRegistry?: ToolRegistry;

  constructor(
    name: string,
    systemPrompt: string,
    modelRouter: ModelRouter,
    description?: string,
    generationMode: GenerationType = GenerationType.GENERATE,
    sessionServiceType: SessionServiceType = SessionServiceType.SQLITE,
    toolRegistry?: ToolRegistry,
  ) {
    this.name = name;
    this.systemPrompt = systemPrompt;
    this.modelRouter = modelRouter;
    this.description = description;
    this.generationMode = generationMode;
    this.toolRegistry = toolRegistry;
    if (sessionServiceType === SessionServiceType.SQLITE) {
      this.sessionService = new SQLiteSessionService();
    } else {
      throw new Error("A session service is required to run the agent.");
    }
  }

  /**
   * Attach or replace the tool registry at runtime.
   */
  setToolRegistry(registry: ToolRegistry): void {
    this.toolRegistry = registry;
  }

  private async fetchAndParse(
    messages: Message[],
    model: string,
  ): Promise<{
    parsed: LoopResponse;
    content: string;
    inputTokens: number;
    outputTokens: number;
  }> {
    const request: ModelRequest = { model, messages };
    const response = await this.modelRouter.route(request, this.generationMode);

    if (!response.content) {
      throw new Error("Empty model response.");
    }

    const inputTokens = response.usage?.inputTokens ?? 0;
    const outputTokens = response.usage?.outputTokens ?? 0;
    const content = response.content;

    try {
      const parsed = JSON.parse(extractJson(content)) as LoopResponse;
      return { parsed, content, inputTokens, outputTokens };
    } catch {
      // Retry once with a correction message appended
      const correctionMessages: Message[] = [
        ...messages,
        { role: Role.ASSISTANT, content },
        { role: Role.USER, content: FORMAT_CORRECTION_MESSAGE },
      ];

      const retryResponse = await this.modelRouter.route(
        { model, messages: correctionMessages },
        this.generationMode,
      );

      if (!retryResponse.content) {
        throw new Error("Empty model response on retry.");
      }

      const totalInputTokens =
        inputTokens + (retryResponse.usage?.inputTokens ?? 0);
      const totalOutputTokens =
        outputTokens + (retryResponse.usage?.outputTokens ?? 0);

      try {
        const parsed = JSON.parse(extractJson(retryResponse.content)) as LoopResponse;
        return {
          parsed,
          content: retryResponse.content,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
        };
      } catch {
        console.error("[Agent] Failed to parse model response after retry.");
        console.error("[Agent] Original response:", content.slice(0, 500));
        console.error("[Agent] Retry response:", retryResponse.content.slice(0, 500));
        throw new Error("Invalid JSON from model after retry. Aborting.");
      }
    }
  }

  async run(
    userQuery: string,
    verbose = false,
    sessionId?: string,
  ): Promise<AgentResponse> {
    if (!process.env.OPENAI_MODEL) {
      throw new Error(
        "OPENAI_MODEL env var not set. Please set it to the name of the model you want to use.",
      );
    }

    const model = process.env.OPENAI_MODEL;
    const activeSessionId = sessionId ?? (await this.sessionService.createSession());
    const history = await this.sessionService.getMessages(activeSessionId);

    // Build system prompt — inject tool definitions when a registry is present
    const toolDefs = this.toolRegistry?.listDefinitions();
    const loopSystemPrompt = buildLoopSystemPrompt(toolDefs);

    const messages: Message[] = [
      {
        role: Role.SYSTEM,
        content: `${loopSystemPrompt}\n${this.systemPrompt}`,
      },
      ...history,
      { role: Role.USER, content: userQuery },
    ];

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const iterations: string[] = [];

    for (let iteration = 0; iteration < MAX_ITERS; iteration++) {
      const { parsed, content, inputTokens, outputTokens } =
        await this.fetchAndParse(messages, model);

      totalInputTokens += inputTokens;
      totalOutputTokens += outputTokens;

      messages.push({ role: Role.ASSISTANT, content });

      if (verbose) {
        iterations.push(parsed.thought);
        console.log(`[${this.name}] Iteration ${iteration + 1}: ${parsed.thought}`);
        console.log(
          `[${this.name}] Iteration ${iteration + 1} tokens: +in ${inputTokens}, +out ${outputTokens}, total in ${totalInputTokens}, total out ${totalOutputTokens}`,
        );
      }

      if (parsed.action === "tool") {
        const toolResults = await this.handleToolCalls(parsed.tools ?? [], verbose);
        messages.push({
          role: Role.USER,
          content: `[Tool Results] ${toolResults}`,
        });
        continue;
      }

      if (parsed.action === "final") {
        const answer = parsed.answer ?? "No final answer provided.";
        
        await this.sessionService.addMessage(activeSessionId, Role.USER, userQuery);
        await this.sessionService.addMessage(activeSessionId, Role.ASSISTANT, answer);
        return {
          sessionId: activeSessionId,
          answer,
          ...(verbose && { iterations }),
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
        };
      }
    }

    throw new Error("Agent exceeded maximum iterations.");
  }

  private async handleToolCalls(
    toolCalls: ToolCall[],
    verbose: boolean,
  ): Promise<string> {
    if (!toolCalls || toolCalls.length === 0) {
      return JSON.stringify({
        success: false,
        error: 'Model requested action "tool" but provided no tools array.',
      });
    }

    if (!this.toolRegistry) {
      return JSON.stringify({
        success: false,
        error:
          "No tools are available. Use action 'continue' or 'final' instead.",
      });
    }

    // Execute all tool calls in parallel
    const results = await Promise.all(
      toolCalls.map(async (toolCall) => {
        const { name, input } = toolCall;

        if (verbose) {
          console.log(
            `[${this.name}] Tool call: ${name}(${JSON.stringify(input)})`,
          );
        }

        try {
          const result = await this.toolRegistry!.execute(name, input ?? {});

          if (verbose) {
            console.log(
              `[${this.name}] Tool result: ${JSON.stringify(result).slice(0, 200)}`,
            );
          }

          return { tool: name, ...result };
        } catch (error) {
          const errorPayload = this.formatToolError(name, error);

          if (verbose) {
            console.log(`[${this.name}] Tool error: ${errorPayload}`);
          }

          return JSON.parse(errorPayload);
        }
      }),
    );

    return JSON.stringify(results);
  }

  private formatToolError(toolName: string, error: unknown): string {
    if (error instanceof ToolNotFoundError) {
      return JSON.stringify({
        tool: toolName,
        success: false,
        error: `Tool "${toolName}" not found. Available tools: ${this.toolRegistry?.listDefinitions().map((t) => t.name).join(", ") ?? "none"}`,
      });
    }
    if (error instanceof ToolInputValidationError) {
      return JSON.stringify({
        tool: toolName,
        success: false,
        error: `Invalid input: ${error.validationDetails}`,
      });
    }
    if (error instanceof ToolTimeoutError) {
      return JSON.stringify({
        tool: toolName,
        success: false,
        error: `Tool timed out after ${error.timeoutMs}ms`,
      });
    }
    if (error instanceof ToolExecutionError) {
      return JSON.stringify({
        tool: toolName,
        success: false,
        error: `Execution failed: ${error.message}`,
      });
    }

    const message =
      error instanceof Error ? error.message : String(error);
    return JSON.stringify({
      tool: toolName,
      success: false,
      error: message,
    });
  }
}
