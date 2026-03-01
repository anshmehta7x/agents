import Anthropic from "@anthropic-ai/sdk";
import { BaseProvider } from "./base-provider";
import { ModelRequest, ModelResponse, Role } from "./types";

export class AnthropicProvider implements BaseProvider {
  name: string;
  apiKey: string;
  client: Anthropic;

  constructor(apiKey?: string, name?: string) {
    this.name = name || "anthropic";
    this.apiKey = apiKey || process.env.ANTHROPIC_API_KEY || "";

    if (!this.apiKey) {
      throw new Error(
        "Anthropic API key not set. Provide via constructor or ANTHROPIC_API_KEY env var.",
      );
    }

    this.client = new Anthropic({ apiKey: this.apiKey });
  }

  async *stream(request: ModelRequest): AsyncGenerator<string, void, unknown> {
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
      model: request.model,
      max_tokens: request.maxTokens ?? 1024,
      system,
      messages,
      stream: true,
    });

    for await (const event of response) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        yield event.delta.text;
      }
    }
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
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
      model: request.model,
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
  }
}
