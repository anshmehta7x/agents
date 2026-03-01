export type AgentResponse = {
  answer: string;
  iterations?: string[];
  inputTokens: number;
  outputTokens: number;
};

export type LoopResponse = {
  thought: string;
  action: "continue" | "final";
  answer: string | null;
};

export const FORMAT_CORRECTION_MESSAGE =
  'Your previous response was not valid JSON. You must respond ONLY with a valid JSON object matching this exact structure: { "thought": string, "action": "continue" | "final", "answer": string | null }. No markdown, no extra text, no commentary.';

export const LOOP_SYSTEM_PROMPT = `
You are an autonomous reasoning agent. You must think step by step and decide at each step whether to provide a final answer.
Remember to cover all possible angles and be thorough in your reasoning.
Respond ONLY in valid JSON with this exact structure:

{
"thought": string,
"action": "continue" | "final",
"answer": string | null
}

No markdown. No extra text. No commentary. Only JSON.
`.trim();

export const MAX_ITERS = 10;
