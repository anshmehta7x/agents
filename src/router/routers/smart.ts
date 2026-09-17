import { ModelProvider } from "../../model/provider"
import { Message, Role } from "../../model/types"
import { SMART_MODEL_ROUTER_PROMPT } from "../../prompts"
import { InvalidRouterConfigError } from "../errors"
import { ModelRouter } from "../router"
import {
  SmartModelRoutingContext,
  SmartModelRoutingProvider,
  SmartModelRouterProps,
} from "../types"

const DEFAULT_CONSIDERED_MESSAGES = 1
const ROUTING_MAX_TOKENS = 64

export class SmartModelRouter implements ModelRouter {
  routingProvider: ModelProvider
  targetProviders: SmartModelRoutingProvider[]
  consideredMessages: number
  basePrompt: string

  constructor(props: SmartModelRouterProps) {
    this.validate(props)

    this.routingProvider = props.routingProvider
    this.targetProviders = props.targetProviders
    this.consideredMessages = props.consideredMessages ?? DEFAULT_CONSIDERED_MESSAGES
    this.basePrompt = this.buildSmartProviderPrompt()
  }

  async route(context: SmartModelRoutingContext): Promise<ModelProvider> {
    const verbose = context.verbosity ?? false
    const consideredMessages = this.getConsideredMessages(context.messages)
    const selectedIndex = await this.selectTargetIndex(consideredMessages)
    const { provider, index } = this.resolveTargetProvider(selectedIndex, verbose)

    this.log(
      verbose,
      `[SmartModelRouter] picked index ${index}: ${this.targetProviders[index].selectionCondition}`
    )

    return provider
  }

  private async selectTargetIndex(messages: Message[]): Promise<number> {
    const response = await this.routingProvider.syncGenerate({
      messages: [
        { role: Role.SYSTEM, content: this.basePrompt },
        ...messages,
      ],
      temperature: 0,
      maxTokens: ROUTING_MAX_TOKENS,
    })

    const raw = response.content?.trim() ?? ""
    const index = this.parseRouterIndex(raw)

    return index
  }

  private log(verbose: boolean, message: string): void {
    if (verbose) {
      console.log(message)
    }
  }

  private parseRouterIndex(raw: string): number {
    const match = raw.match(/\d+/)
    return match ? parseInt(match[0], 10) : NaN
  }

  private buildSmartProviderPrompt(): string {
    let basePrompt = SMART_MODEL_ROUTER_PROMPT;
    for (let i = 0; i < this.targetProviders.length; i++) {
      basePrompt += `\n${i}: ${this.targetProviders[i].selectionCondition}`
    }
    return basePrompt;
  }

  private resolveTargetProvider(
    index: number,
    verbose: boolean
  ): { provider: ModelProvider; index: number } {
    if (!Number.isInteger(index) || index < 0 || index >= this.targetProviders.length) {
      this.log(verbose, `[SmartModelRouter] invalid index ${index}, falling back to 0`)
      return { provider: this.targetProviders[0].provider, index: 0 }
    }

    return { provider: this.targetProviders[index].provider, index }
  }

  private getConsideredMessages(messages: Message[]): Message[] {
    return messages.slice(-this.consideredMessages)
  }

  private validate(props: SmartModelRouterProps): void {
    if (props.targetProviders.length < 1) {
      throw new InvalidRouterConfigError("At least one target provider is required")
    }

    for (const target of props.targetProviders) {
      if (!target.selectionCondition.trim()) {
        throw new InvalidRouterConfigError("Each target provider must not be blank")
      }
    }

    if (props.consideredMessages !== undefined && props.consideredMessages < 1) {
      throw new InvalidRouterConfigError("consideredMessages must be at least 1")
    }
  }
}
