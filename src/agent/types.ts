import { ToolDefinition } from "../tools/types";

export type AgentResponse = {
  sessionId: string;
  answer: string;
  iterations?: string[];
  inputTokens: number;
  outputTokens: number;
};

export type ToolCall = {
  name: string;
  input: Record<string, unknown>;
};

export type LoopResponse = {
  thought: string;
  action: "continue" | "final" | "tool";
  answer: string | null;
  tools?: ToolCall[];
};

export const FORMAT_CORRECTION_MESSAGE =
  'Your previous response was not valid JSON. You must respond ONLY with a valid JSON object matching this exact structure: { "thought": string, "action": "continue" | "final" | "tool", "answer": string | null, "tools": [{ "name": string, "input": object }] | null }. No markdown, no extra text, no commentary.';

export const CONTEXT_COMPACTION_THRESHOLD = 0.8;

export const CONTEXT_COMPACTION_SYSTEM_PROMPT = `
You are compressing a conversation for continued execution by another agent instance.
Produce a concise but complete summary that preserves only the information needed to continue the task correctly.

Include:
- the user's current goal
- important constraints and preferences
- key facts established so far
- important tool calls and their results
- partial work already completed
- any open questions or unresolved items

Exclude:
- filler language
- duplicated details
- chain-of-thought phrasing

Return plain text only.
`.trim();

export const CONTEXT_COMPACTION_USER_PROMPT =
  "Summarize the conversation so far so it can replace all non-system messages while preserving everything necessary to continue the task.";

/**
 * Base system prompt for the reasoning loop (no tools).
 */
const BASE_SYSTEM_PROMPT = `
You are an autonomous reasoning agent assistant. You must think step by step and decide at each step whether to provide a final answer.
Remember to cover all possible angles and be thorough in your reasoning. Make sure to use the iterative process to refine your thoughts and arrive at the best possible answer. Always think step by step and respond exactly as the user wants.
Respond ONLY in valid JSON with this exact structure:

{
  "thought": string,
  "action": "continue" | "final",
  "answer": string | null
}

No markdown. No extra text. No commentary. Only JSON.
`.trim();

/**
 * System prompt for the reasoning loop WITH tools available.
 */
const TOOL_SYSTEM_PROMPT_TEMPLATE = `
You are an autonomous reasoning agent assistant with access to tools. You must think step by step and decide at each step whether to:
1. Continue reasoning (action: "continue")
2. Use one or more tools to gather information or perform actions (action: "tool")
3. Provide a final answer (action: "final")

IMPORTANT RULES:
- ALWAYS use tools for information you don't have. NEVER assume or fabricate data — always call the appropriate tool.
- You may call MULTIPLE tools in a single step by providing an array in "tools".
- Use tools when they can help you answer more accurately.
- Think step by step and respond exactly as the user wants.

Available tools:
{{TOOL_DEFINITIONS}}

To use one or more tools, respond with action "tool" and include an array of tool calls:

{
  "thought": string,
  "action": "tool",
  "answer": null,
  "tools": [
    { "name": "<tool_name>", "input": { <parameters> } },
    { "name": "<another_tool>", "input": { <parameters> } }
  ]
}

To continue reasoning without a tool:
{
  "thought": string,
  "action": "continue",
  "answer": null,
  "tools": null
}

To provide a final answer:
{
  "thought": string,
  "action": "final",
  "answer": "<your final answer>",
  "tools": null
}

No markdown. No extra text. No commentary. Only JSON.
`.trim();

/**
 * Build the appropriate system prompt based on whether tools are available.
 */
export function buildLoopSystemPrompt(
  toolDefinitions?: ToolDefinition[],
): string {
  if (!toolDefinitions || toolDefinitions.length === 0) {
    return BASE_SYSTEM_PROMPT;
  }

  const defsJson = JSON.stringify(toolDefinitions, null, 2);
  return TOOL_SYSTEM_PROMPT_TEMPLATE.replace("{{TOOL_DEFINITIONS}}", defsJson);
}

export const MAX_ITERS = 10;
