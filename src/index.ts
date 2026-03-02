import { config } from "dotenv";
config();

import { OpenAIProvider } from "./model/openai-provider";
import { ModelRouter } from "./model/router";
import { Agent } from "./agent/runtime";
import { GenerationType } from "./model/types";
import { SessionServiceType } from "./sessions/types";
import { ToolRegistry } from "./tools/tool-registry";
import { dateTimeTool } from "./tools/local/datetime-tool";
import { calculatorTool } from "./tools/local/calculator-tool";
import { createTool } from "./tools/types";
import { MCPClient } from "./tools";

async function main() {
  const openaiProvider = new OpenAIProvider(
    "opencode",
    process.env.OPENAI_ENDPOINT!,
    process.env.OPENAI_API_KEY!,
  );
  const router = new ModelRouter(openaiProvider);

  // ── Set up tool registry ──────────────────────────────────
  const toolRegistry = new ToolRegistry();

  // Register built-in local tools
  toolRegistry.register(dateTimeTool);
  toolRegistry.register(calculatorTool);

  // Register a custom inline tool using the createTool helper
  toolRegistry.register(
    createTool({
      name: "echo",
      description: "Echoes back the input message. Useful for testing.",
      inputSchema: {
        type: "object",
        properties: {
          message: { type: "string", description: "The message to echo back" },
        },
        required: ["message"],
      },
      async execute(input) {
        return { success: true, output: { echo: input.message } };
      },
    }),
  );

  // ── (Optional) Connect MCP server tools ───────────────────
  const mcpClient = new MCPClient({
    name: "spotify-mcp-server",
    transport: "url",
    url: "https://mcp-spotify.onrender.com/mcp",});
  const mcpTools = await mcpClient.discoverTools();
  toolRegistry.registerAll(mcpTools);

  // ── Create agent with tools ───────────────────────────────
  const agent = new Agent(
    "CoreAgent",
    "Be concise, helpful, and exact.",
    router,
    "Basic autonomous reasoning agent",
    GenerationType.STREAM,
    SessionServiceType.SQLITE,
    toolRegistry,
  );

  const firstResult = await agent.run(
    "What is the current date and time? Also, what is 42 * 17 + 3? Also log in to my spotify and give me the code",
    true,
  );

  console.log("\n=== FINAL ANSWER ===");
  console.log("Session:", firstResult.sessionId);
  console.log("Answer:", firstResult.answer);
}

main().catch(console.error);
