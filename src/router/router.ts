import { ModelProvider } from "../model/provider";
import { ModelRoutingContext } from "./types";

export interface ModelRouter {
  route(context: ModelRoutingContext): ModelProvider | Promise<ModelProvider>
}
