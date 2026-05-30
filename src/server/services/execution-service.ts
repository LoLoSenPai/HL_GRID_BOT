import type { TradingMode } from "@/domain/types";
import type { ExecutionAdapter } from "@/features/execution/types";
import { MockExecutionAdapter } from "@/features/execution/mock-adapter";
import { PaperExecutionAdapter } from "@/features/execution/paper-adapter";
import { ProprExecutionAdapter } from "@/features/execution/propr-adapter";

export function createExecutionAdapter(mode: TradingMode): ExecutionAdapter {
  if (mode === "mock") return new MockExecutionAdapter();
  if (mode === "paper") return new PaperExecutionAdapter();
  return new ProprExecutionAdapter();
}
