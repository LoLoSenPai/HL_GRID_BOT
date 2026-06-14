import { decimal } from "@/domain/decimal";
import type { GridConfig } from "@/domain/types";

export type BotExitTrigger = "stop_loss" | "take_profit";

export interface BotExitEvaluation {
  trigger: BotExitTrigger | null;
  markPrice: string;
  triggerPrice?: string;
}

export function evaluateBotExitTrigger(
  config: Pick<GridConfig, "positionSide" | "stopLoss" | "takeProfit">,
  markPrice?: string | null,
): BotExitEvaluation | null {
  if (!markPrice) return null;
  const mark = parsePositiveDecimal(markPrice);
  if (!mark) return null;

  const stopLoss = parsePositiveDecimal(config.stopLoss);
  if (stopLoss) {
    const triggered =
      config.positionSide === "long"
        ? mark.lte(stopLoss)
        : mark.gte(stopLoss);
    if (triggered) {
      return {
        trigger: "stop_loss",
        markPrice,
        triggerPrice: config.stopLoss,
      };
    }
  }

  const takeProfit = parsePositiveDecimal(config.takeProfit);
  if (takeProfit) {
    const triggered =
      config.positionSide === "long"
        ? mark.gte(takeProfit)
        : mark.lte(takeProfit);
    if (triggered) {
      return {
        trigger: "take_profit",
        markPrice,
        triggerPrice: config.takeProfit,
      };
    }
  }

  return {
    trigger: null,
    markPrice,
  };
}

function parsePositiveDecimal(value?: string | null) {
  if (!value) return null;
  try {
    const parsed = decimal(value);
    return parsed.gt(0) ? parsed : null;
  } catch {
    return null;
  }
}
