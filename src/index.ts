import { config } from "dotenv";
config();

import { OpenAIProvider } from "./model/openai-provider";
import { ModelRouter } from "./model/router";
import { Agent } from "./agent/runtime";
import { GenerationType } from "./model/types";
import { SessionServiceType } from "./sessions/types";
import { ToolRegistry } from "./tools";
import { MCPClient } from "./tools";
import { GeminiProvider } from "./model/gemini-provider";

async function main() {
  const openaiProvider = new OpenAIProvider(
    "openrouter",
    process.env.OPENAI_ENDPOINT!,
    process.env.OPENAI_API_KEY!,
    process.env.OPENAI_MODEL!
  );

  const geminiProvider = new GeminiProvider(
    process.env.GEMINI_API_KEY!,
    process.env.GEMINI_MODEL!
  );
  const router = new ModelRouter(geminiProvider);

  // ── Set up tool registry ──────────────────────────────────
  const toolRegistry = new ToolRegistry();

  // const mcpClient = new MCPClient({
  //   name: "spotify-mcp-server",
  //   transport: "url",
  //   url: "https://mcp-spotify.onrender.com/mcp",
  // });
  // const mcpTools = await mcpClient.discoverTools();
  // toolRegistry.registerAll(mcpTools);

  // ── Create agent with tools ───────────────────────────────
  const agent = new Agent(
    "CoreAgent",
    "Be concise, helpful, and exact.",
    router,
    "Basic autonomous reasoning agent",
    GenerationType.STREAM,
    SessionServiceType.SQLITE,
    toolRegistry,
      true
  );

  const firstResult = await agent.run(
"Hey, can you perform an audit of the current folder, add timestamps.",
    true,
  );

  console.log("\n=== FINAL ANSWER ===");
  console.log("Session:", firstResult.sessionId);
  console.log("Answer:", firstResult.answer);
}

main().catch(console.error);
