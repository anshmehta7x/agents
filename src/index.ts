import { config } from "dotenv";
config();

import { Role, Message } from "./model/types";
import { OpenAIProvider } from "./model/openai-provider";

// --- OpenAI-compatible (also works for opencode, together, etc.) ---
const openaiProvider = new OpenAIProvider("opencode");

async function main() {
  const messages = [
    { role: Role.SYSTEM, content: "Be concise and helpful and exact" },
    { role: Role.USER, content: "Tell me a random statement" },
  ];

  const model = process.env.OPENAI_MODEL || "gpt-3.5-turbo";

  console.log("=== generate() ===");
  const response = await openaiProvider.generate({ model, messages });
  console.log(response);

  const nextMessage: Message[] = [
    ...messages,
    ...(response.content !== null
      ? [{ role: Role.ASSISTANT, content: response.content }]
      : []),
    { role: Role.USER, content: "Now tell me the exact opposite" },
  ];

  const secondResponse = await openaiProvider.generate({
    model,
    messages: nextMessage,
  });
  console.log(secondResponse); // newline after stream
}

main().catch(console.error);
