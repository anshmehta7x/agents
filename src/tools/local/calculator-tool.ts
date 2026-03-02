import { Tool, ToolResult } from "../types";

/**
 * Safely evaluates basic arithmetic expressions.
 */
export const calculatorTool: Tool = {
  name: "calculator",
  description:
    "Evaluates a basic arithmetic expression. Supports +, -, *, /, %, parentheses, and decimal numbers. Example: '(2 + 3) * 4.5'",
  inputSchema: {
    type: "object",
    properties: {
      expression: {
        type: "string",
        description: "The arithmetic expression to evaluate.",
      },
    },
    required: ["expression"],
    additionalProperties: false,
  },
  metadata: { source: "local", version: "1.0.0" },

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const expression = input.expression as string;

    // Strict allowlist: digits, operators, parentheses, whitespace, decimal points
    if (!/^[\d\s+\-*/%().]+$/.test(expression)) {
      return {
        success: false,
        output: null,
        error: `Invalid characters in expression: "${expression}"`,
      };
    }

    try {
      // Safe evaluation via Function constructor with validated input
      const result = new Function(`"use strict"; return (${expression});`)();

      if (typeof result !== "number" || !isFinite(result)) {
        return {
          success: false,
          output: null,
          error: `Expression did not produce a finite number: "${expression}"`,
        };
      }

      return {
        success: true,
        output: { expression, result },
      };
    } catch (error) {
      return {
        success: false,
        output: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};
