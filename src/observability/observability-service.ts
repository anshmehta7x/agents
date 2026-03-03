import { db } from "../db/sqlite";
import { initObservabilitySchema } from "./schema";
import {
  ObservabilityEvent,
  EventPayload,
  LogLevel,
  RunEndPayload,
  IterationPayload,
  ToolCallPayload,
} from "./types";

export class ObservabilityService {
  private static instance: ObservabilityService;

  private constructor() {
    initObservabilitySchema();
  }

  static getInstance(): ObservabilityService {
    if (!ObservabilityService.instance) {
      ObservabilityService.instance = new ObservabilityService();
    }
    return ObservabilityService.instance;
  }

  emit(event: ObservabilityEvent, verbose = false): void {
    try {
      db.prepare(
        `
        INSERT INTO events (run_id, type, payload, created_at)
        VALUES (?, ?, ?, ?)
      `,
      ).run(event.runId, event.type, JSON.stringify(event.payload), Date.now());
    } catch (err) {
      console.error("[Observability] failed to write event:", err);
    }

    if (verbose) {
      this.print(event);
    }
  }

  private print(event: ObservabilityEvent): void {
    const p = event.payload;

    switch (event.type) {
      case "run_start": {
        const { agentName, userQuery } = p as Extract<
          EventPayload,
          { userQuery: string }
        > & { agentName: string };
        console.log(`\n[RUN START] agent=${agentName} run=${event.runId}`);
        console.log(`  query: ${userQuery}`);
        break;
      }
      case "run_end": {
        const ep = p as RunEndPayload;
        console.log(
          `\n[RUN END] status=${ep.status} iters=${ep.iterationCount} duration=${ep.durationMs}ms`,
        );
        console.log(
          `  tokens: in=${ep.totalInputTokens} out=${ep.totalOutputTokens}`,
        );
        if (ep.finalAnswer) console.log(`  answer: ${ep.finalAnswer}`);
        if (ep.errorMessage) console.log(`  error:  ${ep.errorMessage}`);
        break;
      }
      case "iteration": {
        const ip = p as IterationPayload;
        const retry = ip.hadFormatRetry ? " [format-retry]" : "";
        console.log(
          `\n[ITER ${ip.iteration + 1}] action=${ip.action}${retry} (${ip.durationMs}ms)`,
        );
        console.log(`  thought: ${ip.thought}`);
        console.log(`  tokens:  in=${ip.inputTokens} out=${ip.outputTokens}`);
        break;
      }
      case "tool_call": {
        const tp = p as ToolCallPayload;
        const status = tp.success ? "ok" : "fail";
        console.log(`\n[TOOL] ${tp.toolName} → ${status} (${tp.durationMs}ms)`);
        console.log(`  input:  ${JSON.stringify(tp.input)}`);
        if (tp.success) console.log(`  output: ${JSON.stringify(tp.output)}`);
        else console.log(`  error:  ${tp.errorMessage}`);
        break;
      }
      case "log": {
        const lp = p as {
          level: LogLevel;
          message: string;
          context?: Record<string, unknown>;
        };
        const ctx = lp.context ? ` ${JSON.stringify(lp.context)}` : "";
        console.log(`[${lp.level.toUpperCase()}] ${lp.message}${ctx}`);
        break;
      }
    }
  }

  // ── Queries ──────────────────────────────────────────────────────────

  getEvents(
    runId: string,
  ): { id: number; type: string; payload: EventPayload; createdAt: number }[] {
    return (
      db
        .prepare(
          `
      SELECT id, type, payload, created_at AS createdAt
      FROM events WHERE run_id = ? ORDER BY id ASC
    `,
        )
        .all(runId) as {
        id: number;
        type: string;
        payload: string;
        createdAt: number;
      }[]
    ).map((row) => ({
      ...row,
      payload: JSON.parse(row.payload) as EventPayload,
    }));
  }

  getRunIds(agentName?: string): string[] {
    if (agentName) {
      return (
        db
          .prepare(
            `
        SELECT DISTINCT run_id FROM events
        WHERE type = 'run_start' AND json_extract(payload, '$.agentName') = ?
        ORDER BY id DESC
      `,
          )
          .all(agentName) as { run_id: string }[]
      ).map((r) => r.run_id);
    }
    return (
      db
        .prepare(
          `
      SELECT DISTINCT run_id FROM events WHERE type = 'run_start' ORDER BY id DESC
    `,
        )
        .all() as { run_id: string }[]
    ).map((r) => r.run_id);
  }
}
