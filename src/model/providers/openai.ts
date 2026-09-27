import OpenAI from "openai"
import { ModelProvider } from "../provider"
import { ModelProviderError, classifyError } from "../errors"
import { ModelRequest, ModelResponse, StreamChunk } from "../types"
import { withRetries } from "../utils"

export class OpenAIProvider implements ModelProvider {
  private client: OpenAI
  private model: string

  getModel(): string {
    return this.model
  }

  constructor(model: string, endpoint: string, apiKey: string) {
    if (!apiKey || !endpoint || !model) {
      throw new ModelProviderError("OpenAI provider requires model, endpoint, and apiKey")
    }

    this.model = model
    this.client = new OpenAI({ apiKey, baseURL: endpoint })
  }

  async syncGenerate(request: ModelRequest): Promise<ModelResponse> {
    return withRetries(async () => {
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
    }, this)
  }

  async *asyncGenerate(request: ModelRequest): AsyncGenerator<StreamChunk, void, unknown> {
    const stream = await withRetries(() =>
      this.client.chat.completions.create({
        model: this.model,
        messages: request.messages as OpenAI.Chat.ChatCompletionMessageParam[],
        max_completion_tokens: request.maxTokens,
        temperature: request.temperature,
        stream: true,
        stream_options: { include_usage: true },
      }),
      this
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
      throw classifyError(error, this)
    }
  }
}
