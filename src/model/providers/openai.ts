import OpenAI from "openai"
import {
  ModelProvider,
  ModelProviderError,
  AuthenticationError,
  ModelNotFoundError,
} from "../provider"
import { ModelRequest, ModelResponse, StreamChunk } from "../types"

export class OpenAIProvider implements ModelProvider {
  private client: OpenAI
  private model: string

  constructor(model: string, endpoint: string, apiKey: string) {
    if (!apiKey || !endpoint || !model) {
      throw new ModelProviderError("OpenAI provider requires model, endpoint, and apiKey")
    }

    this.model = model
    this.client = new OpenAI({ apiKey, baseURL: endpoint })
  }

  async syncGenerate(request: ModelRequest): Promise<ModelResponse> {
    return this.withRetries(async () => {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: request.messages as OpenAI.Chat.ChatCompletionMessageParam[],
        max_completion_tokens: request.maxTokens,
        temperature: request.temperature,
      })

      const choice = response.choices?.[0]
      const content = choice?.message?.content ?? ""

      return {
        content,
        usage: response.usage
          ? {
              inputTokens: response.usage.prompt_tokens,
              outputTokens: response.usage.completion_tokens,
            }
          : null,
      }
    })
  }

  async *asyncGenerate(request: ModelRequest): AsyncGenerator<StreamChunk, void, unknown> {
    const stream = await this.withRetries(() =>
      this.client.chat.completions.create({
        model: this.model,
        messages: request.messages as OpenAI.Chat.ChatCompletionMessageParam[],
        max_completion_tokens: request.maxTokens,
        temperature: request.temperature,
        stream: true,
        stream_options: { include_usage: true },
      })
    )

    try {
      for await (const chunk of stream) {
        const content = chunk.choices?.[0]?.delta?.content
        const usage = chunk.usage

        if (content) {
          yield { content }
        }

        if (usage) {
          yield {
            usage: {
              inputTokens: usage.prompt_tokens,
              outputTokens: usage.completion_tokens,
            },
          }
        }
      }
    } catch (error) {
      throw this.classifyError(error)
    }
  }

  private async withRetries<T>(
    operation: () => Promise<T>,
    maxAttempts = 3
  ): Promise<T> {
    let lastError: unknown

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await operation()
      } catch (error) {
        lastError = error
        if (!this.isRetryable(error)) {
          throw this.classifyError(error)
        }
        await this.sleep(1000 * 2 ** attempt)
      }
    }

    throw this.classifyError(lastError)
  }

  private isRetryable(error: unknown): boolean {
    if (error instanceof OpenAI.APIError) {
      const status = error.status ?? 0
      return status === 429 || status >= 500
    }
    return false
  }

  private classifyError(error: unknown): Error {
    if (error instanceof OpenAI.APIError) {
      if (error.status === 401) {
        return new AuthenticationError("Invalid API key for OpenAI provider")
      }
      if (error.status === 404) {
        return new ModelNotFoundError(`Model not found: ${this.model}`)
      }
    }
    if (error instanceof Error) {
      return new ModelProviderError(error.message)
    }
    return new ModelProviderError("Unknown provider error")
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
