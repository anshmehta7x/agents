import { config } from "dotenv";
config();

import { OpenAIProvider } from "./model/openai-provider";
import { ModelRouter } from "./model/router";
import { Agent } from "./agent/runtime";
import { GenerationType } from "./model/types";

async function main() {
  const openaiProvider = new OpenAIProvider(
    "opencode",
    process.env.OPENAI_ENDPOINT!,
    process.env.OPENAI_API_KEY!,
  );
  const router = new ModelRouter(openaiProvider);

  const agent = new Agent(
    "CoreAgent",
    "Be concise, helpful, and exact.",
    router,
    "Basic autonomous reasoning agent",
    GenerationType.STREAM,
  );

  const result = await agent.run(
    "THINK 2 TIMES ABOUT A RANDOM STATEMENT AND TELL ME ",
    true,
  );

  console.log("\n=== FINAL ANSWER ===");
  console.log(result);
}

main().catch(console.error);
