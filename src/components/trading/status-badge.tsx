import { Badge } from "@/components/ui/badge";
import type { BotStatus } from "@/domain/types";

const labels: Record<BotStatus, string> = {
  draft: "Draft",
  paper: "Local",
  running: "Running",
  live: "Active",
  paused: "Paused",
  out_of_range: "Out of range",
  closing: "Closing",
  error: "Error",
  stopped: "Stopped",
};

const classes: Record<BotStatus, string> = {
  draft: "border-border bg-muted text-muted-foreground",
  paper: "border-sky-400/30 bg-sky-400/10 text-sky-200",
  running: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  live: "border-amber-300/40 bg-amber-300/10 text-amber-100",
  paused: "border-zinc-400/30 bg-zinc-400/10 text-zinc-200",
  out_of_range: "border-orange-400/30 bg-orange-400/10 text-orange-100",
  closing: "border-amber-300/40 bg-amber-300/10 text-amber-100",
  error: "border-red-400/30 bg-red-400/10 text-red-100",
  stopped: "border-border bg-background text-muted-foreground",
};

export function StatusBadge({ status }: { status: BotStatus }) {
  return (
    <Badge variant="outline" className={classes[status]}>
      {labels[status]}
    </Badge>
  );
}
