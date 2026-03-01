import { BaseProvider } from "./base-provider";
import { GenerationType, ModelRequest } from "./types";

export class ModelRouter {
  constructor(private provider: BaseProvider) {}

  async route(request: ModelRequest, generationType: GenerationType) {
    if (generationType === GenerationType.STREAM) {
      return this.provider.stream(request);
    }
    return this.provider.generate(request);
  }
}
