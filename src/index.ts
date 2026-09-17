import dotenv from "dotenv"
dotenv.config()

import { OpenAIProvider } from "./model/providers/openai"
import { Role } from "./model/types"
import { SmartModelRouter } from "./router"

async function main() {
  const endpoint = process.env.OPENAI_ENDPOINT
  const apiKey = process.env.OPENAI_API_KEY
  const modelA = process.env.OPENAI_MODEL_A
  const modelB = process.env.OPENAI_MODEL_B

  if (!endpoint || !apiKey || !modelA || !modelB) {
    console.error("Missing OPENAI_ENDPOINT, OPENAI_API_KEY, OPENAI_MODEL_A, or OPENAI_MODEL_B in .env")
    process.exit(1)
  }

  const providerA = new OpenAIProvider(modelA, endpoint, apiKey)
  const providerB = new OpenAIProvider(modelB, endpoint, apiKey)

  const router = new SmartModelRouter({
    routingProvider: providerA,
    targetProviders: [
      {
        provider: providerA,
        selectionCondition: "Trivial tasks: greetings, basic facts, simple arithmetic, one-line answers",
      },
      {
        provider: providerB,
        selectionCondition: "Reasoning-heavy tasks: proofs, derivations, multi-step problems, in-depth explanations",
      },
    ],
  })

  const testCases = [
    {
      label: "simple question",
      messages: [{ role: Role.USER, content: "What is 2 + 2?" }],
    },
    {
      label: "complex question",
      messages: [
        {
          role: Role.USER,
          content: "In short, try to prove that there are infinitely many prime numbers and explain the intuition behind the proof.",
        },
      ],
    },
  ]

  for (const testCase of testCases) {
    console.log(`\n--- ${testCase.label} ---`)

    const selectedProvider = await router.route({ messages: testCase.messages, verbosity: true })

    console.log(`Using model: ${selectedProvider.getModel()}`)

    const response = await selectedProvider.syncGenerate({
      messages: testCase.messages,
      temperature: 0.7,
      maxTokens: 2000,
    })

    console.log("Response:", response.content)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
