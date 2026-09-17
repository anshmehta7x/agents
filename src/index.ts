import dotenv from "dotenv"
dotenv.config()

import { OpenAIProvider } from "./model/providers/openai"
import { Role } from "./model/types"

async function main() {
  const endpoint = process.env.OPENAI_ENDPOINT
  const apiKey = process.env.OPENAI_API_KEY
  const model = process.env.OPENAI_MODEL

  if (!endpoint || !apiKey || !model) {
    console.error("Missing OPENAI_ENDPOINT, OPENAI_API_KEY, or OPENAI_MODEL in .env")
    process.exit(1)
  }

  const provider = new OpenAIProvider(model, endpoint, apiKey)

  const request = {
    messages: [
      { role: Role.SYSTEM, content: "Hi who are you?" },
    ],
    temperature: 0.7,
    maxTokens: 500,
  }

  console.log("--- syncGenerate ---")
  const response = await provider.syncGenerate(request)
  console.log("Content:", response.content)
  console.log("Usage:", response.usage)

  console.log("\n--- asyncGenerate ---")
  const stream = provider.asyncGenerate(request)
  let streamUsage = null
  for await (const chunk of stream) {
    if (chunk.content) {
      process.stdout.write(chunk.content)
    }
    if (chunk.usage) {
      streamUsage = chunk.usage
    }
  }
  process.stdout.write("\n")
  console.log("Stream usage:", streamUsage)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
