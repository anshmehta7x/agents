import { ModelRequest, ModelResponse } from "./types";

export interface BaseProvider {
  name: string;
  endpoint?: string;
  apiKey: string;
  defaultModel?: string;

  generate: (request: ModelRequest) => Promise<ModelResponse>;
  stream: (request: ModelRequest) => AsyncGenerator<string, void, unknown>;
  getLastStreamUsage?: () => ModelResponse["usage"] | undefined;
}
