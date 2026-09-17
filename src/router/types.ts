import { ModelProvider } from "../model/provider";
import { Message } from "../model/types";

export interface ModelRoutingContext {
  verbosity?: boolean
}

export interface SmartModelRoutingContext extends ModelRoutingContext {
  messages: Message[]
}

export interface SmartModelRoutingProvider {
  provider: ModelProvider
  selectionCondition: string // when to use this provider
}

export interface SmartModelRouterProps {
  routingProvider: ModelProvider
  targetProviders: SmartModelRoutingProvider[]
  consideredMessages?: number // how many of the most recent messages to consider for routing
}
