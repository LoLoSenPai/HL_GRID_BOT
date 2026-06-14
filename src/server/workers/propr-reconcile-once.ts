import { pathToFileURL } from "node:url";

import { recordProprWorkerHeartbeat, runProprReconciliation } from "@/server/workers/propr-reconciliation-worker";

async function main() {
  const botId = process.argv[2];
  const summary = await runProprReconciliation({ botId: botId?.length ? botId : undefined });
  recordProprWorkerHeartbeat(summary, "interval");
  console.log(JSON.stringify(summary, null, 2));

  if (summary.errors.length > 0) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
