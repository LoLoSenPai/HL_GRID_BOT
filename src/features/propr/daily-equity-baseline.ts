import { Decimal, decimal, toDecimalString } from "@/domain/decimal";
import { getSettingValue, setSettingValue } from "@/db/settings-store";

interface DailyEquityBaseline {
  dayStartEquity: string;
  dailyLossUsed: string;
  source: "propr" | "local_daily_baseline";
}

interface StoredDailyEquityBaseline {
  date: string;
  equity: string;
}

export function resolveDailyEquityBaseline(input: {
  accountId: string;
  equity: string;
  providedDayStartEquity?: string;
}): DailyEquityBaseline {
  if (input.providedDayStartEquity && input.providedDayStartEquity.trim() !== "") {
    return {
      dayStartEquity: input.providedDayStartEquity,
      dailyLossUsed: positiveLoss(input.providedDayStartEquity, input.equity),
      source: "propr",
    };
  }

  const today = new Date().toISOString().slice(0, 10);
  const key = `propr_daily_equity_baseline:${input.accountId}`;
  const stored = readStoredBaseline(key);
  const dayStartEquity = stored?.date === today ? stored.equity : input.equity;

  if (stored?.date !== today || stored.equity !== dayStartEquity) {
    setSettingValue(key, JSON.stringify({ date: today, equity: dayStartEquity }));
  }

  return {
    dayStartEquity,
    dailyLossUsed: positiveLoss(dayStartEquity, input.equity),
    source: "local_daily_baseline",
  };
}

function readStoredBaseline(key: string): StoredDailyEquityBaseline | null {
  const setting = getSettingValue(key);
  if (!setting) return null;

  try {
    const parsed = JSON.parse(setting.value) as Partial<StoredDailyEquityBaseline>;
    if (!parsed.date || !parsed.equity || !decimal(parsed.equity).gt(0)) return null;
    return { date: parsed.date, equity: parsed.equity };
  } catch {
    return null;
  }
}

function positiveLoss(reference: string, current: string): string {
  const loss = decimal(reference).minus(current);
  return toDecimalString(Decimal.max(0, loss), 2);
}
