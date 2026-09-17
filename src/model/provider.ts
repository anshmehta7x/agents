import { ModelRequest, ModelResponse, StreamChunk } from "./types"

export interface ModelProvider {
  syncGenerate: (request: ModelRequest) => Promise<ModelResponse>
  asyncGenerate: (request: ModelRequest) => AsyncGenerator<StreamChunk, void, unknown>
  getModel(): string
}
