import { GoogleGenerativeAI, Content } from "@google/generative-ai";
import { BaseProvider } from "./base-provider";
import { ModelRequest, ModelResponse, Role } from "./types";

export class GeminiProvider implements BaseProvider {
  name: string;
  apiKey: string;
  client: GoogleGenerativeAI;

  constructor(apiKey?: string, name?: string) {
    this.name = name || "gemini";
    this.apiKey =
      apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";

    if (!this.apiKey) {
      throw new Error(
        "Gemini API key not set. Provide via constructor or GEMINI_API_KEY env var.",
      );
    }

    this.client = new GoogleGenerativeAI(this.apiKey);
  }

  async *stream(request: ModelRequest): AsyncGenerator<string, void, unknown> {
    const systemMessages = request.messages.filter(
      (m) => m.role === Role.SYSTEM,
    );
    const nonSystemMessages = request.messages.filter(
      (m) => m.role !== Role.SYSTEM,
    );
    const systemInstruction =
      systemMessages.map((m) => m.content).join("\n") || undefined;

    const model = this.client.getGenerativeModel({
      model: request.model,
      systemInstruction,
    });

    const messagesToProcess = [...nonSystemMessages];
    const lastMessage = messagesToProcess.pop();
    if (!lastMessage) return;

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
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
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
      model: request.model,
      systemInstruction,
    });

    // Build chat history (all messages except the last user message)
    const history: Content[] = [];
    const messagesToProcess = [...nonSystemMessages];
    const lastMessage = messagesToProcess.pop(); // last message becomes the prompt

    for (const msg of messagesToProcess) {
      history.push({
        role: msg.role === Role.ASSISTANT ? "model" : "user",
        parts: [{ text: msg.content }],
      });
    }

    const chat = model.startChat({ history });

    if (!lastMessage) {
      return { content: null };
    }

    const result = await chat.sendMessage(lastMessage.content);
    const response = result.response;
    const content = response.text() ?? null;

    return {
      content,
      model: request.model,
      usage: {
        inputTokens: response.usageMetadata?.promptTokenCount,
        outputTokens: response.usageMetadata?.candidatesTokenCount,
      },
    };
  }
}
