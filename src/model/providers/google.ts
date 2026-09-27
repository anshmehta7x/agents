import { Content, GenerateContentResponseUsageMetadata, GoogleGenAI } from "@google/genai"
import { ModelProvider } from "../provider"
import { classifyError, ModelProviderError } from "../errors"
import { Message, ModelRequest, ModelResponse, Role, StreamChunk, TokenUsage } from "../types"
import { withRetries } from "../utils"

export class GoogleProvider implements ModelProvider {
  private client: GoogleGenAI
  private model: string

  getModel(): string {
    return this.model
  }

  constructor(model: string, apiKey: string) {
    if (!apiKey || !model) {
      throw new ModelProviderError("Google provider requires model and apiKey")
    }
    this.model = model
    this.client = new GoogleGenAI({ apiKey })
  }

  async syncGenerate(request: ModelRequest): Promise<ModelResponse> {
    return withRetries(async () => {
      const { systemInstruction, contents } = this.toGoogleContents(request.messages)

      const response = await this.client.models.generateContent({
        model: this.model,
        contents,
        config: {
          temperature: request.temperature,
          maxOutputTokens: request.maxTokens,
          systemInstruction,
        },
      })

      return {
        content: response.text ?? null,
        usage: this.toTokenUsage(response.usageMetadata),
      }
    }, this)
  }

  async *asyncGenerate(request: ModelRequest): AsyncGenerator<StreamChunk, void, unknown> {
    const { systemInstruction, contents } = this.toGoogleContents(request.messages)

    const stream = await withRetries(
      () =>
        this.client.models.generateContentStream({
          model: this.model,
          contents,
          config: {
            temperature: request.temperature,
            maxOutputTokens: request.maxTokens,
            systemInstruction,
          },
        }),
      this
    )

    try {
      for await (const chunk of stream) {
        yield {
          content: chunk.text,
          usage: this.toTokenUsage(chunk.usageMetadata) ?? undefined,
        }
      }
    } catch (error) {
      throw classifyError(error, this)
    }
  }

  private toGoogleContents(messages: Message[]): {
    systemInstruction: string | undefined
    contents: Content[]
  } {
    const systemParts: string[] = []
    const contents: Content[] = []

    for (const message of messages) {
      if (message.role === Role.SYSTEM) {
        systemParts.push(message.content)
        continue
      }

      contents.push({
        role: this.toGoogleRole(message.role),
        parts: [{ text: message.content }],
      })
    }

    return {
      systemInstruction: systemParts.length > 0 ? systemParts.join("\n") : undefined,
      contents,
    }
  }

  private toGoogleRole(role: Role): "user" | "model" {
    switch (role) {
      case Role.ASSISTANT:
        return "model"
      case Role.USER:
      case Role.TOOL:
        return "user"
      default:
        throw new ModelProviderError(`Google provider does not support role: ${role}`)
    }
  }

  private toTokenUsage(usage: GenerateContentResponseUsageMetadata | undefined): TokenUsage | null {
    if (!usage) {
      return null
    }

    const inputTokens = usage.promptTokenCount
    const candidateTokens = usage.candidatesTokenCount
    const thoughtTokens = usage.thoughtsTokenCount
    const outputTokens =
      candidateTokens === undefined && thoughtTokens === undefined
        ? undefined
        : (candidateTokens ?? 0) + (thoughtTokens ?? 0)

    return {
      inputTokens,
      outputTokens,
    }
  }
}
