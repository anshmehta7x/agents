import { BaseProvider } from "./base-provider";
import { GenerationType, ModelRequest, ModelResponse } from "./types";

export class ModelRouter {
  constructor(private provider: BaseProvider) {}

  async route(
    request: ModelRequest,
    generationType: GenerationType,
  ): Promise<ModelResponse> {
    if (generationType === GenerationType.STREAM && this.provider.stream) {
      let content = "";

      for await (const chunk of this.provider.stream(request)) {
        content += chunk;
      }

      return {
        content,
        usage: this.provider.getLastStreamUsage?.(),
      };
    }

    return this.provider.generate(request);
  }
}
