import OpenAI from "openai";
import { BaseProvider } from "./base-provider";
import { ModelRequest, ModelResponse, Role } from "./types";

export class OpenAIProvider implements BaseProvider {
  name: string;
  endpoint: string;
  apiKey: string;
  client: OpenAI;

  constructor(name?: string) {
    this.endpoint = process.env.OPENAI_ENDPOINT || "https://api.openai.com/v1";
    this.name = name || "openai";
    this.apiKey = process.env.OPENAI_API_KEY || "";

    if (!this.apiKey) {
      throw new Error(
        "OpenAI API key not set. Provide via constructor or OPENAI_API_KEY env var.",
      );
    }

    this.client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.endpoint,
    });
  }

  async *stream(request: ModelRequest): AsyncGenerator<string, void, unknown> {
    const messages = request.messages.map((m) => ({
      role: m.role === Role.ASSISTANT ? "assistant" : (m.role as string),
      content: m.content,
    }));

    const response = await this.client.chat.completions.create({
      model: request.model,
      messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      stream: true,
    });

    for await (const chunk of response) {
      const text = chunk.choices?.[0]?.delta?.content;
      if (text) yield text;
    }
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    // Map messages — OpenAI chat completions expects role: system | user | assistant | tool
    const messages = request.messages.map((m) => ({
      role: m.role === Role.ASSISTANT ? "assistant" : (m.role as string),
      content: m.content,
    }));

    const response = await this.client.chat.completions.create({
      model: request.model,
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
  }
}
