import { decimal, toDecimalString } from "@/domain/decimal";

export interface ChallengeSafetyEvaluation {
  breached: boolean;
  dailyLossBreached: boolean;
  dailyEquityFloorBreached: boolean;
  drawdownBreached: boolean;
  dailyStopAmount: string;
  dailyFloor: string;
}

export function evaluateChallengeSafety(input: {
  startingBalance: string;
  equity: string;
  dayStartEquity: string;
  dailyLossUsed: string;
  dailyStopPct: string;
  drawdownFloor: string;
}): ChallengeSafetyEvaluation {
  const equity = decimal(input.equity);
  const dailyStopAmount = decimal(input.startingBalance).mul(input.dailyStopPct).div(100);
  const dailyFloor = decimal(input.dayStartEquity).minus(dailyStopAmount);
  const dailyLossBreached = decimal(input.dailyLossUsed).gte(dailyStopAmount);
  const dailyEquityFloorBreached = equity.lte(dailyFloor);
  const drawdownBreached = equity.lte(input.drawdownFloor);

  return {
    breached: dailyLossBreached || dailyEquityFloorBreached || drawdownBreached,
    dailyLossBreached,
    dailyEquityFloorBreached,
    drawdownBreached,
    dailyStopAmount: toDecimalString(dailyStopAmount, 2),
    dailyFloor: toDecimalString(dailyFloor, 2),
  };
}
