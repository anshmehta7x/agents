import { APIError as OpenAIAPIError } from "openai"
import { ModelProvider } from "./provider"

export class ModelProviderError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ModelProviderError"
  }
}

export class AuthenticationError extends ModelProviderError {
  constructor(message: string) {
    super(message)
    this.name = "AuthenticationError"
  }
}

export class ModelNotFoundError extends ModelProviderError {
  constructor(message: string) {
    super(message)
    this.name = "ModelNotFoundError"
  }
}

export function classifyError(error: unknown, provider: ModelProvider): Error {
  if (error instanceof OpenAIAPIError) {
    if (error.status === 401) {
      return new AuthenticationError("Invalid API key for OpenAI provider")
    }
    if (error.status === 404) {
      return new ModelNotFoundError(`Model not found: ${provider.getModel()}`)
    }
  }
  if (error instanceof Error) {
    return new ModelProviderError(error.message)
  }
  return new ModelProviderError("Unknown provider error")
}
