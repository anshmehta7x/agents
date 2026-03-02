import { ModelRouter } from "../model/router";
import { SessionService } from "../sessions/session-service";
import { GenerationType, Message, Role, ModelRequest } from "../model/types";
import {
  AgentResponse,
  LoopResponse,
  FORMAT_CORRECTION_MESSAGE,
  LOOP_SYSTEM_PROMPT,
  MAX_ITERS,
} from "./types";
import { SessionServiceType } from "../sessions/types";
import { SQLiteSessionService } from "../sessions/sqlite-sessions";

export class Agent {
  readonly name: string;
  readonly systemPrompt: string;
  readonly modelRouter: ModelRouter;
  readonly description?: string;
  readonly generationMode: GenerationType;
  private sessionService: SessionService;

  constructor(
    name: string,
    systemPrompt: string,
    modelRouter: ModelRouter,
    description?: string,
    generationMode: GenerationType = GenerationType.GENERATE,
    sessionServiceType: SessionServiceType = SessionServiceType.SQLITE,
  ) {
    this.name = name;
    this.systemPrompt = systemPrompt;
    this.modelRouter = modelRouter;
    this.description = description;
    this.generationMode = generationMode;
    if (sessionServiceType === SessionServiceType.SQLITE) {
      this.sessionService = new SQLiteSessionService();
    } else {
      throw new Error("A session service is required to run the agent.");
    }
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
      const parsed = JSON.parse(content) as LoopResponse;
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
        const parsed = JSON.parse(retryResponse.content) as LoopResponse;
        return {
          parsed,
          content: retryResponse.content,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
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
    if (!process.env.OPENAI_MODEL) {
      throw new Error(
        "OPENAI_MODEL env var not set. Please set it to the name of the model you want to use.",
      );
    }

    const model = process.env.OPENAI_MODEL;
    const activeSessionId = sessionId ?? (await this.sessionService.createSession());
    const history = await this.sessionService.getMessages(activeSessionId);

    const messages: Message[] = [
      {
        role: Role.SYSTEM,
        content: `${LOOP_SYSTEM_PROMPT}\n${this.systemPrompt}`,
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
}
