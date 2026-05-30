import { runPaperRuntimeTick } from "@/server/workers/paper-runtime-worker";
import { logger } from "@/lib/logger";

const intervalMs = Number(process.env.PAPER_WORKER_INTERVAL_MS ?? 30_000);
let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    const summary = await runPaperRuntimeTick();
    logger.info("paper_runtime.tick", {
      scanned: summary.scanned,
      reconciled: summary.reconciled,
      filled: summary.filled,
      skipped: summary.skipped,
      errors: summary.errors,
    });
  } catch (error) {
    logger.error("paper_runtime.tick_unhandled", {
      error: error instanceof Error ? error.message : "Unknown paper worker error",
    });
  } finally {
    running = false;
  }
}

logger.info("paper_runtime.started", { intervalMs });
void tick();

const timer = setInterval(() => {
  void tick();
}, intervalMs);

function shutdown() {
  clearInterval(timer);
  logger.info("paper_runtime.stopped");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
