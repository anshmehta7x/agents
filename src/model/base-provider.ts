import { ModelRequest, ModelResponse } from "./types";

export interface BaseProvider {
  name: string;
  generate: (request: ModelRequest) => Promise<ModelResponse>;
  stream: (request: ModelRequest) => AsyncGenerator<string, void, unknown>;
}
