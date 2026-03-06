import { v4 as uuidv4 } from "uuid";
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
import { ObservabilityService } from "../observability/observability-service";

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
  private obs: ObservabilityService;

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
    this.obs = ObservabilityService.getInstance();
    if (sessionServiceType === SessionServiceType.SQLITE) {
      this.sessionService = new SQLiteSessionService();
    } else {
      throw new Error("A session service is required to run the agent.");
    }
  }

  setToolRegistry(registry: ToolRegistry): void {
    this.toolRegistry = registry;
  }

  private async fetchAndParse(
    messages: Message[],
  ): Promise<{
    parsed: LoopResponse;
    content: string;
    inputTokens: number;
    outputTokens: number;
    hadFormatRetry: boolean;
  }> {
    const request: ModelRequest = { messages };
    const response = await this.modelRouter.route(request, this.generationMode);

    if (!response.content) throw new Error("Empty model response.");

    const inputTokens = response.usage?.inputTokens ?? 0;
    const outputTokens = response.usage?.outputTokens ?? 0;
    const content = response.content;

    try {
      const parsed = JSON.parse(extractJson(content)) as LoopResponse;
      return {
        parsed,
        content,
        inputTokens,
        outputTokens,
        hadFormatRetry: false,
      };
    } catch {
      const correctionMessages: Message[] = [
        ...messages,
        { role: Role.ASSISTANT, content },
        { role: Role.USER, content: FORMAT_CORRECTION_MESSAGE },
      ];

      const retryResponse = await this.modelRouter.route(
        { messages: correctionMessages },
        this.generationMode,
      );

      if (!retryResponse.content)
        throw new Error("Empty model response on retry.");

      const totalInputTokens =
        inputTokens + (retryResponse.usage?.inputTokens ?? 0);
      const totalOutputTokens =
        outputTokens + (retryResponse.usage?.outputTokens ?? 0);

      try {
        const parsed = JSON.parse(
          extractJson(retryResponse.content),
        ) as LoopResponse;
        return {
          parsed,
          content: retryResponse.content,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          hadFormatRetry: true,
        };
      } catch {
        throw new Error("Invalid JSON from model after retry. Aborting.");
      }
    }
  }

  async run(
    userQuery: string,
    verbose = false,
    sessionId?: string,
  ): Promise<AgentResponse> {
    const activeSessionId =
      sessionId ?? (await this.sessionService.createSession());
    const history = await this.sessionService.getMessages(activeSessionId);

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

    const runId = uuidv4();
    const runStart = Date.now();

    this.obs.emit(
      {
        type: "run_start",
        runId,
        payload: {
          sessionId: activeSessionId,
          agentName: this.name,
          userQuery,
        },
      },
      verbose,
    );

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const iterationThoughts: string[] = [];

    try {
      for (let iteration = 0; iteration < MAX_ITERS; iteration++) {
        const iterStart = Date.now();

        const { parsed, content, inputTokens, outputTokens, hadFormatRetry } =
          await this.fetchAndParse(messages);

        totalInputTokens += inputTokens;
        totalOutputTokens += outputTokens;

        messages.push({ role: Role.ASSISTANT, content });
        iterationThoughts.push(parsed.thought);

        this.obs.emit(
          {
            type: "iteration",
            runId,
            payload: {
              iteration,
              thought: parsed.thought,
              action: parsed.action,
              inputTokens,
              outputTokens,
              durationMs: Date.now() - iterStart,
              hadFormatRetry,
            },
          },
          verbose,
        );

        if (parsed.action === "tool") {
          const toolResults = await this.handleToolCalls(
            parsed.tools ?? [],
            verbose,
            runId,
            iteration,
          );
          messages.push({
            role: Role.USER,
            content: `[Tool Results] ${toolResults}`,
          });
          continue;
        }

        if (parsed.action === "final") {
          const answer = parsed.answer ?? "No final answer provided.";

          this.obs.emit(
            {
              type: "run_end",
              runId,
              payload: {
                status: "success",
                totalInputTokens,
                totalOutputTokens,
                iterationCount: iteration + 1,
                durationMs: Date.now() - runStart,
                finalAnswer: answer,
              },
            },
            verbose,
          );

          await this.sessionService.addMessage(
            activeSessionId,
            Role.USER,
            userQuery,
          );
          await this.sessionService.addMessage(
            activeSessionId,
            Role.ASSISTANT,
            answer,
          );

          return {
            sessionId: activeSessionId,
            answer,
            ...(verbose && { iterations: iterationThoughts }),
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
          };
        }
      }

      this.obs.emit(
        {
          type: "run_end",
          runId,
          payload: {
            status: "max_iters",
            totalInputTokens,
            totalOutputTokens,
            iterationCount: MAX_ITERS,
            durationMs: Date.now() - runStart,
          },
        },
        verbose,
      );

      throw new Error("Agent exceeded maximum iterations.");
    } catch (error) {
      const isExpected =
        error instanceof Error && error.message.includes("maximum iterations");

      if (!isExpected) {
        this.obs.emit(
          {
            type: "run_end",
            runId,
            payload: {
              status: "error",
              totalInputTokens,
              totalOutputTokens,
              iterationCount: 0,
              durationMs: Date.now() - runStart,
              errorMessage:
                error instanceof Error ? error.message : String(error),
            },
          },
          verbose,
        );
      }

      throw error;
    }
  }

  private async handleToolCalls(
    toolCalls: ToolCall[],
    verbose: boolean,
    runId: string,
    iteration: number,
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
        error: "No tools are available.",
      });
    }

    const results = await Promise.all(
      toolCalls.map(async (toolCall) => {
        const { name, input } = toolCall;
        const callStart = Date.now();

        try {
          const result = await this.toolRegistry!.execute(name, input ?? {});
          const durationMs = Date.now() - callStart;

          this.obs.emit(
            {
              type: "tool_call",
              runId,
              payload: {
                iteration,
                toolName: name,
                input: input ?? {},
                output: result.output,
                success: result.success,
                durationMs,
              },
            },
            verbose,
          );

          return { tool: name, ...result };
        } catch (error) {
          const durationMs = Date.now() - callStart;
          const errorPayload = this.formatToolError(name, error);
          const parsed = JSON.parse(errorPayload);

          this.obs.emit(
            {
              type: "tool_call",
              runId,
              payload: {
                iteration,
                toolName: name,
                input: input ?? {},
                output: null,
                success: false,
                durationMs,
                errorMessage: parsed.error,
              },
            },
            verbose,
          );

          return parsed;
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
        error: `Tool "${toolName}" not found. Available tools: ${
          this.toolRegistry
            ?.listDefinitions()
            .map((t) => t.name)
            .join(", ") ?? "none"
        }`,
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
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ tool: toolName, success: false, error: message });
  }
}
