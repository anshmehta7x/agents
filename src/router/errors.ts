export class RouterError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "RouterError"
  }
}

export class InvalidRouterConfigError extends RouterError {
  constructor(message: string) {
    super(message)
    this.name = "InvalidRouterConfigError"
  }
}

export class RoutingError extends RouterError {
  constructor(message: string) {
    super(message)
    this.name = "RoutingError"
  }
}
