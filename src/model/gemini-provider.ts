import { GoogleGenerativeAI, Content } from "@google/generative-ai";
import { BaseProvider } from "./base-provider";
import { ModelRequest, ModelResponse, Role } from "./types";

export interface GeminiProviderOptions {
  name?: string;
  endpoint?: string;
  apiKey?: string;
  model?: string;
}

export class GeminiProvider implements BaseProvider {
  name: string;
  endpoint?: string;
  apiKey: string;
  model: string;
  client: GoogleGenerativeAI;
  private lastStreamUsage?: ModelResponse["usage"];

  constructor(apiKey?: string, name?: string, model?: string);
  constructor(options?: GeminiProviderOptions);
  constructor(
    apiKeyOrOptions?: string | GeminiProviderOptions,
    name?: string,
    model?: string,
  ) {
    const options: GeminiProviderOptions =
      typeof apiKeyOrOptions === "string"
        ? {
            apiKey: apiKeyOrOptions,
            name,
            model,
          }
        : apiKeyOrOptions ?? {};

    this.name = options.name ?? "gemini";
    this.endpoint =
      options.endpoint ??
      process.env.GEMINI_ENDPOINT ??
      process.env.GOOGLE_API_ENDPOINT;
    this.apiKey =
      options.apiKey ??
      process.env.GEMINI_API_KEY ??
      process.env.GOOGLE_API_KEY ??
      "";
    this.model =
      options.model ??
      process.env.GEMINI_MODEL ??
      process.env.GOOGLE_MODEL ??
      "";

    if (!this.apiKey) {
      throw new Error(
        "Gemini API key not set. Provide via constructor or GEMINI_API_KEY env var.",
      );
    }

    if (!this.model) {
      throw new Error(
        "Gemini model not set. Provide via constructor or GEMINI_MODEL env var.",
      );
    }

    this.client = new GoogleGenerativeAI(this.apiKey);
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
      const modelName = this.resolveModel(request.model);

      const systemMessages = request.messages.filter(
        (m) => m.role === Role.SYSTEM,
      );
      const nonSystemMessages = request.messages.filter(
        (m) => m.role !== Role.SYSTEM,
      );
      const systemInstruction =
        systemMessages.map((m) => m.content).join("\n") || undefined;

      const model = this.client.getGenerativeModel({
        model: modelName,
        systemInstruction,
      });

      const messagesToProcess = [...nonSystemMessages];
      const lastMessage = messagesToProcess.pop();
      if (!lastMessage) {
        throw new Error("Model request must include at least one non-system message.");
      }

      const history: Content[] = messagesToProcess.map((m) => ({
        role: m.role === Role.ASSISTANT ? "model" : "user",
        parts: [{ text: m.content }],
      }));

      const chat = model.startChat({ history });
      const result = await chat.sendMessageStream(lastMessage.content);

      for await (const chunk of result.stream) {
        const text = chunk.text();
        if (text) yield text;
      }

      const finalResponse = await result.response;
      this.lastStreamUsage = {
        inputTokens: finalResponse.usageMetadata?.promptTokenCount,
        outputTokens: finalResponse.usageMetadata?.candidatesTokenCount,
      };
    } catch (error) {
      throw this.toProviderError("stream", error);
    }
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    try {
      this.validateRequest(request);
      const modelName = this.resolveModel(request.model);

      // Gemini separates system instruction from chat history
      const systemMessages = request.messages.filter(
        (m) => m.role === Role.SYSTEM,
      );
      const nonSystemMessages = request.messages.filter(
        (m) => m.role !== Role.SYSTEM,
      );

      const systemInstruction =
        systemMessages.map((m) => m.content).join("\n") || undefined;

      const model = this.client.getGenerativeModel({
        model: modelName,
        systemInstruction,
      });

      // Build chat history (all messages except the last user message)
      const history: Content[] = [];
      const messagesToProcess = [...nonSystemMessages];
      const lastMessage = messagesToProcess.pop();

      if (!lastMessage) {
        throw new Error("Model request must include at least one non-system message.");
      }

      for (const msg of messagesToProcess) {
        history.push({
          role: msg.role === Role.ASSISTANT ? "model" : "user",
          parts: [{ text: msg.content }],
        });
      }

      const chat = model.startChat({ history });

      const result = await chat.sendMessage(lastMessage.content);
      const response = result.response;
      const content = response.text() ?? null;

      return {
        content,
        model: modelName,
        usage: {
          inputTokens: response.usageMetadata?.promptTokenCount,
          outputTokens: response.usageMetadata?.candidatesTokenCount,
        },
      };
    } catch (error) {
      throw this.toProviderError("generate", error);
    }
  }
}
