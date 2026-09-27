import { classifyError } from "./errors"
import { ModelProvider } from "./provider"

const DEFAULT_MAX_ATTEMPTS = 3
const MAX_BACKOFF_MS = 5 * 1000

export async function withRetries<T>(
  operation: () => Promise<T>,
  provider: ModelProvider,
  maxAttempts = DEFAULT_MAX_ATTEMPTS
): Promise<T> {
  let lastError: unknown

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      if (!isRetryable(error)) {
        throw classifyError(error, provider)
      }
      await sleep(Math.min(1000 * 2 ** attempt, MAX_BACKOFF_MS))
    }
  }

  throw classifyError(lastError, provider)
}

export function isRetryable(error: unknown): boolean {
  const status = getErrorStatus(error)
  return status === 429 || status >= 500
}

function getErrorStatus(error: unknown): number {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status?: unknown }).status
    if (typeof status === "number") {
      return status
    }
  }
  return 0
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
