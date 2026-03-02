import { config } from "dotenv";
config();

import { OpenAIProvider } from "./model/openai-provider";
import { ModelRouter } from "./model/router";
import { Agent } from "./agent/runtime";
import { GenerationType } from "./model/types";
import { SessionServiceType } from "./sessions/types";

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
    SessionServiceType.SQLITE,
  );

  const firstResult = await agent.run(
    "What was my initial question?",
    true,
    "00d06cce-1022-4c7e-a153-08e73755ae93"
  );

  // const secondResult = await agent.run(
  //   "Summarize your previous answer in one sentence.",
  //   true,
  //   firstResult.sessionId,
  // );

  console.log("\n=== FINAL ANSWER ===");
  // console.log("Session:", secondResult.sessionId);
  console.log("First:", firstResult.answer);
  // console.log("Second:", secondResult.answer);
}

main().catch(console.error);
