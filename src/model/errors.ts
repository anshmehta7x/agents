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
