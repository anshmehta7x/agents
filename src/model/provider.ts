import { ModelRequest, ModelResponse, StreamChunk } from "./types"

export interface ModelProvider {
  syncGenerate: (request: ModelRequest) => Promise<ModelResponse>
  asyncGenerate: (request: ModelRequest) => AsyncGenerator<StreamChunk, void, unknown>;
}

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
