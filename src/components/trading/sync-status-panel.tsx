"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, Clock, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ProprWorkerStatus {
  checkedAt: string;
  running: boolean;
  heartbeatAt?: string;
  heartbeatAgeMs?: number;
  lastSummary?: {
    scanned: number;
    reconciled: number;
    safetyStops: number;
    errors: Array<{ botId: string; message: string }>;
  };
  lastSyncEvent?: {
    type: string;
    message: string;
    severity: string;
    createdAt: string;
  };
  recentErrors: Array<{
    type: string;
    message: string;
    createdAt: string;
  }>;
}

export function SyncStatusPanel({
  variant = "card",
}: {
  variant?: "card" | "embedded";
} = {}) {
  const [status, setStatus] = useState<ProprWorkerStatus | null>(null);
  const [loading, setLoading] = useState(false);

  const loadStatus = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const response = await fetch("/api/workers/propr-status", { cache: "no-store" });
      const payload = (await response.json()) as { data?: ProprWorkerStatus };
      setStatus(payload.data ?? null);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadStatus(false), 0);
    const interval = window.setInterval(() => void loadStatus(false), 5000);
    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, [loadStatus]);

  const scanErrors = status?.lastSummary?.errors ?? [];
  const errorCount = (status?.recentErrors.length ?? 0) + scanErrors.length;
  const latestError = status?.recentErrors[0]?.message ?? scanErrors[0]?.message;
  const hasErrors = errorCount > 0;

  const refreshButton = (
    <Button
      type="button"
      size="icon-sm"
      variant="outline"
      onClick={() => void loadStatus()}
      disabled={loading}
      aria-label="Refresh worker status"
    >
      <RefreshCw className={loading ? "animate-spin" : undefined} />
    </Button>
  );

  const content = (
    <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={status?.running ? "default" : "destructive"}>
            {status?.running ? "Worker running" : "Worker stale"}
          </Badge>
          <Badge variant={hasErrors ? "destructive" : "outline"}>
            {hasErrors ? `${errorCount} errors` : "No recent errors"}
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <SyncMetric label="Worker heartbeat" value={status?.heartbeatAt ? relativeTime(status.heartbeatAt) : "none"} />
          <SyncMetric label="Bots checked" value={status?.lastSummary ? `${status.lastSummary.scanned}` : "none"} />
          <SyncMetric label="Synced bots" value={status?.lastSummary ? String(status.lastSummary.reconciled) : "0"} />
          <SyncMetric label="Safety stops" value={status?.lastSummary ? String(status.lastSummary.safetyStops) : "0"} />
        </div>

        {status?.lastSyncEvent ? (
          <div className="rounded-md border bg-muted/20 p-2 text-xs text-muted-foreground">
            <div className="mb-1 flex items-center gap-1.5 text-foreground">
              <Clock className="size-3.5" />
              Last sync
            </div>
            <div>{status.lastSyncEvent.message}</div>
            <div className="mt-1 metric-mono">{relativeTime(status.lastSyncEvent.createdAt)}</div>
          </div>
        ) : null}

        {latestError ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
            <div className="mb-1 flex items-center gap-1.5 font-medium">
              <AlertTriangle className="size-3.5" />
              Latest error
            </div>
            {latestError}
          </div>
        ) : null}
      </div>
  );

  if (variant === "embedded") {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Activity className="size-4 text-primary" />
            Automation health
          </div>
          {refreshButton}
        </div>
        {content}
      </div>
    );
  }

  return (
    <Card className="rounded-lg">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Activity className="size-4 text-primary" />
            Automation health
          </CardTitle>
          {refreshButton}
        </div>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
}

function SyncMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background/50 p-2">
      <div className="text-muted-foreground">{label}</div>
      <div className="metric-mono mt-1 font-semibold text-foreground">{value}</div>
    </div>
  );
}

function relativeTime(value: string): string {
  const diffMs = Date.now() - Date.parse(value);
  if (!Number.isFinite(diffMs)) return "unknown";
  const seconds = Math.max(0, Math.round(diffMs / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}
