import { evaluateRuntimeRisk } from "@/domain/risk";
import type { Bot, RuntimeMetrics } from "@/domain/types";
import { createExecutionAdapter } from "@/server/services/execution-service";

export interface GridWorkerTickInput {
  bot: Bot;
  markPrice: string;
  metrics: RuntimeMetrics;
  globalExposureUsd: string;
  killSwitchActive: boolean;
}

export async function runGridWorkerTick(input: GridWorkerTickInput) {
  const adapter = createExecutionAdapter(input.bot.config.mode);
  const health = await adapter.health();
  const riskIssues = evaluateRuntimeRisk({
    config: input.bot.config,
    markPrice: input.markPrice,
    metrics: input.metrics,
    globalExposureUsd: input.globalExposureUsd,
    killSwitchActive: input.killSwitchActive,
  });

  return {
    health,
    riskIssues,
    shouldPause: !health.ok || riskIssues.some((issue) => issue.severity === "error"),
  };
}
