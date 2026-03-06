import Anthropic from "@anthropic-ai/sdk";
import { BaseProvider } from "./base-provider";
import { ModelRequest, ModelResponse, Role } from "./types";

export interface AnthropicProviderOptions {
  name?: string;
  endpoint?: string;
  apiKey?: string;
  model?: string;
}

export class AnthropicProvider implements BaseProvider {
  name: string;
  endpoint?: string;
  apiKey: string;
  model: string;
  client: Anthropic;
  private lastStreamUsage?: ModelResponse["usage"];

  constructor(apiKey?: string, name?: string, endpoint?: string, model?: string);
  constructor(options?: AnthropicProviderOptions);
  constructor(
    apiKeyOrOptions?: string | AnthropicProviderOptions,
    name?: string,
    endpoint?: string,
    model?: string,
  ) {
    const options: AnthropicProviderOptions =
      typeof apiKeyOrOptions === "string"
        ? {
            apiKey: apiKeyOrOptions,
            name,
            endpoint,
            model,
          }
        : apiKeyOrOptions ?? {};

    this.name = options.name ?? "anthropic";
    this.endpoint = options.endpoint ?? process.env.ANTHROPIC_ENDPOINT;
    this.apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY ?? "";
    this.model = options.model ?? process.env.ANTHROPIC_MODEL ?? "";

    if (!this.apiKey) {
      throw new Error(
        "Anthropic API key not set. Provide via constructor or ANTHROPIC_API_KEY env var.",
      );
    }

    if (!this.model) {
      throw new Error(
        "Anthropic model not set. Provide via constructor or ANTHROPIC_MODEL env var.",
      );
    }

    this.client = new Anthropic({
      apiKey: this.apiKey,
      ...(this.endpoint ? { baseURL: this.endpoint } : {}),
    });
  }

  private resolveModel(requestModel?: string): string {
    return requestModel || this.model;
  }

  private validateRequest(request: ModelRequest): void {
    if (!request.messages || request.messages.length === 0) {
      throw new Error("Model request must include at least one message.");
    }
  }

  private toProviderError(operation: "generate" | "stream", error: unknown): Error {
    const message = error instanceof Error ? error.message : String(error);
    const endpointDetails = this.endpoint ? ` (endpoint: ${this.endpoint})` : "";
    return new Error(`[${this.name}] ${operation} failed${endpointDetails}: ${message}`);
  }

  getLastStreamUsage(): ModelResponse["usage"] | undefined {
    return this.lastStreamUsage;
  }

  async *stream(request: ModelRequest): AsyncGenerator<string, void, unknown> {
    try {
      this.lastStreamUsage = undefined;
      this.validateRequest(request);
      const model = this.resolveModel(request.model);

      const systemMessages = request.messages.filter(
        (m) => m.role === Role.SYSTEM,
      );
      const nonSystemMessages = request.messages.filter(
        (m) => m.role !== Role.SYSTEM,
      );
      const system = systemMessages.map((m) => m.content).join("\n") || undefined;

      const messages: Anthropic.MessageParam[] = nonSystemMessages.map((m) => ({
        role: m.role === Role.ASSISTANT ? "assistant" : "user",
        content: m.content,
      }));

      const response = await this.client.messages.create({
        model,
        max_tokens: request.maxTokens ?? 1024,
        system,
        messages,
        stream: true,
      });

      for await (const event of response) {
        if (event.type === "message_start") {
          this.lastStreamUsage = {
            inputTokens: event.message.usage.input_tokens,
            outputTokens: event.message.usage.output_tokens,
          };
        }

        if (event.type === "message_delta") {
          this.lastStreamUsage = {
            inputTokens: this.lastStreamUsage?.inputTokens,
            outputTokens: event.usage.output_tokens,
          };
        }

        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          yield event.delta.text;
        }
      }
    } catch (error) {
      throw this.toProviderError("stream", error);
    }
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    try {
      this.validateRequest(request);
      const model = this.resolveModel(request.model);

      // Anthropic separates system prompt from messages
      const systemMessages = request.messages.filter(
        (m) => m.role === Role.SYSTEM,
      );
      const nonSystemMessages = request.messages.filter(
        (m) => m.role !== Role.SYSTEM,
      );

      const system = systemMessages.map((m) => m.content).join("\n") || undefined;

      // Map roles: ASSISTANT -> assistant, USER -> user
      const messages: Anthropic.MessageParam[] = nonSystemMessages.map((m) => ({
        role: m.role === Role.ASSISTANT ? "assistant" : "user",
        content: m.content,
      }));

      const response = await this.client.messages.create({
        model,
        max_tokens: request.maxTokens ?? 1024,
        system,
        messages,
      });

      const content =
        response.content
          .filter((block) => block.type === "text")
          .map((block) => (block as Anthropic.TextBlock).text)
          .join("") || null;

      return {
        content,
        model: response.model,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
      };
    } catch (error) {
      throw this.toProviderError("generate", error);
    }
  }
}
