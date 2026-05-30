import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { ActivityEvent } from "@/domain/types";

const icons = {
  info: Info,
  warning: TriangleAlert,
  error: AlertCircle,
  success: CheckCircle2,
};

export function ActivityFeed({ events }: { events: ActivityEvent[] }) {
  return (
    <div className="overflow-hidden rounded-lg border">
      {events.map((event) => {
        const Icon = icons[event.severity];
        return (
          <div key={event.id} className="grid grid-cols-[160px_1fr_auto] gap-4 border-b p-3 last:border-b-0">
            <div className="metric-mono text-xs text-muted-foreground">
              {new Date(event.createdAt).toLocaleString()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Icon className="size-4 text-primary" />
                <span className="truncate text-sm font-medium">{event.message}</span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{event.type}</div>
            </div>
            <Badge variant={event.severity === "error" ? "destructive" : "outline"}>
              {event.severity}
            </Badge>
          </div>
        );
      })}
    </div>
  );
}
