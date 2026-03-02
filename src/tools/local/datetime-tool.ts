import { Tool, ToolResult } from "../types";

/**
 * Returns the current date and time, optionally in a specific timezone.
 */
export const dateTimeTool: Tool = {
  name: "get_datetime",
  description:
    "Returns the current date, time, and UNIX timestamp. Optionally accepts a timezone (IANA format, e.g. 'America/New_York').",
  inputSchema: {
    type: "object",
    properties: {
      timezone: {
        type: "string",
        description:
          "IANA timezone string (e.g. 'UTC', 'America/New_York'). Defaults to UTC.",
      },
    },
    required: [],
    additionalProperties: false,
  },
  metadata: { source: "local", version: "1.0.0" },

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    try {
      const tz = (input.timezone as string) || "UTC";
      const now = new Date();

      const formatted = now.toLocaleString("en-US", {
        timeZone: tz,
        dateStyle: "full",
        timeStyle: "long",
      });

      return {
        success: true,
        output: {
          iso: now.toISOString(),
          unix: Math.floor(now.getTime() / 1000),
          formatted,
          timezone: tz,
        },
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
