import OpenAI from "openai";
import { BaseProvider } from "./base-provider";
import { GenerationType, ModelRequest, ModelResponse, Role } from "./types";

export interface OpenAIProviderOptions {
  name?: string;
  endpoint?: string;
  apiKey?: string;
  defaultModel?: string;
}

export class OpenAIProvider implements BaseProvider {
  name: string;
  endpoint: string;
  apiKey: string;
  defaultModel?: string;
  client: OpenAI;
  private lastStreamUsage?: ModelResponse["usage"];

  constructor(name: string, endpoint: string, apiKey: string, defaultModel?: string);
  constructor(options?: OpenAIProviderOptions);
  constructor(
    nameOrOptions?: string | OpenAIProviderOptions,
    endpoint?: string,
    apiKey?: string,
    defaultModel?: string,
  ) {
    const options: OpenAIProviderOptions =
      typeof nameOrOptions === "string"
        ? {
            name: nameOrOptions,
            endpoint,
            apiKey,
            defaultModel,
          }
        : nameOrOptions ?? {};

    this.name = options.name ?? "openai";
    this.endpoint =
      options.endpoint ??
      process.env.OPENAI_ENDPOINT ??
      process.env.OPENAI_BASE_URL ??
      "https://api.openai.com/v1";
    this.apiKey = options.apiKey ?? process.env.OPENAI_API_KEY ?? "";
    this.defaultModel = options.defaultModel ?? process.env.OPENAI_MODEL;

    if (!this.apiKey) {
      throw new Error(
        "OpenAI API key not set. Provide via constructor options or OPENAI_API_KEY env var.",
      );
    }

    this.client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.endpoint,
    });
  }

  private resolveModel(requestModel?: string): string {
    const model = requestModel || this.defaultModel;
    if (!model) {
      throw new Error(
        "Model not provided. Set request.model or configure defaultModel/OPENAI_MODEL.",
      );
    }

    return model;
  }

  private validateRequest(request: ModelRequest): void {
    if (!request.messages || request.messages.length === 0) {
      throw new Error("Model request must include at least one message.");
    }
  }

  private toProviderError(operation: GenerationType, error: unknown): Error {
    const message = error instanceof Error ? error.message : String(error);
    return new Error(
      `[${this.name}] ${operation} failed (endpoint: ${this.endpoint}): ${message}`,
    );
  }

  getLastStreamUsage(): ModelResponse["usage"] | undefined {
    return this.lastStreamUsage;
  }

  async *stream(request: ModelRequest): AsyncGenerator<string, void, unknown> {
    try {
      this.lastStreamUsage = undefined;
      this.validateRequest(request);
      const model = this.resolveModel(request.model);

      const messages = request.messages.map((m) => ({
        role: m.role === Role.ASSISTANT ? "assistant" : (m.role as string),
        content: m.content,
      }));

      const response = await this.client.chat.completions.create({
        model,
        messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
        max_tokens: request.maxTokens,
        temperature: request.temperature,
        stream: true,
        stream_options: { include_usage: true },
      });

      for await (const chunk of response) {
        if (chunk.usage) {
          this.lastStreamUsage = {
            inputTokens: chunk.usage.prompt_tokens,
            outputTokens: chunk.usage.completion_tokens,
          };
        }

        const text = chunk.choices?.[0]?.delta?.content;
        if (text) yield text;
      }
    } catch (error) {
      throw this.toProviderError(GenerationType.STREAM, error);
    }
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    try {
      this.validateRequest(request);
      const model = this.resolveModel(request.model);

      // Map messages — OpenAI chat completions expects role: system | user | assistant | tool
      const messages = request.messages.map((m) => ({
        role: m.role === Role.ASSISTANT ? "assistant" : (m.role as string),
        content: m.content,
      }));

      const response = await this.client.chat.completions.create({
        model,
        messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
        max_tokens: request.maxTokens,
        temperature: request.temperature,
      });

      const choice = response.choices?.[0];
      const content = choice?.message?.content ?? null;

      return {
        content,
        model: response.model,
        usage: {
          inputTokens: response.usage?.prompt_tokens,
          outputTokens: response.usage?.completion_tokens,
        },
      };
    } catch (error) {
      throw this.toProviderError(GenerationType.GENERATE, error);
    }
  }
}
