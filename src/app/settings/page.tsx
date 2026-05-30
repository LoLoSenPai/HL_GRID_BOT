import { AlertTriangle, CheckCircle2, KeyRound, Server, Shield } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { checkProprLiveReadiness } from "@/features/propr/readiness";
import { getEnv, redactSecret } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const env = getEnv();
  const readiness = await checkProprLiveReadiness();
  const readinessMessage = readiness.liveEnabled
    ? "Propr auth, active challenge and service health are ready for guarded live mode."
    : readiness.blockers.join(" ");

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">Settings</h1>
        <p className="text-sm text-muted-foreground">Environment, risk defaults, API access and live safeguards.</p>
      </div>

      <Alert variant={readiness.liveEnabled ? "default" : "destructive"}>
        {readiness.liveEnabled ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />}
        <AlertTitle>{readiness.liveEnabled ? "Guarded live mode ready" : "Live mode blocked"}</AlertTitle>
        <AlertDescription>{readinessMessage}</AlertDescription>
      </Alert>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="rounded-lg xl:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Server className="size-4 text-primary" />
              Environment
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <SettingRow label="PROPR_ACTIVE_ENV" value={env.PROPR_ACTIVE_ENV} />
            <SettingRow label="Selected Propr API URL" value={env.PROPR_API_URL} />
            <SettingRow label="Selected Propr WS URL" value={env.PROPR_WS_URL} />
            <SettingRow label={env.PROPR_SELECTED_API_KEY_NAME} value={redactSecret(env.PROPR_API_KEY)} />
            <SettingRow label="PROPR_BETA_API_URL" value={env.PROPR_BETA_API_URL ?? "unset"} />
            <SettingRow label="PROPR_LIVE_API_URL" value={env.PROPR_LIVE_API_URL ?? "unset"} />
            <SettingRow label="DATABASE_URL" value={env.DATABASE_URL} />
          </CardContent>
        </Card>

        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Shield className="size-4 text-primary" />
              Risk defaults
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Guard label="Max drawdown per bot" value="12%" checked />
            <Guard label="Minimum order validation" value="10 USDC" checked />
            <Guard label="Reconciliation after restart" value="Required" checked />
            <Guard label="Auto recenter in live" value="Disabled" checked={false} />
          </CardContent>
        </Card>

        <Card className="rounded-lg xl:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <KeyRound className="size-4 text-primary" />
              Propr live readiness
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <Policy label="Write path" value="Propr only" />
            <Policy label="Active Propr env" value={readiness.activeEnv} />
            <Policy label="Authenticated" value={readiness.authenticated ? "Yes" : "No"} />
            <Policy label="Active challenges" value={String(readiness.activeChallengeCount)} />
            <Policy label="Active account" value={readiness.activeAccountId ?? "none"} />
            <Policy label="Core service" value={readiness.health.coreOk ? "OK" : "Blocked"} />
            <Policy
              label="Leverage caps"
              value={formatLeverageLimits(readiness.leverageLimits)}
            />
          </CardContent>
        </Card>

        <Card className="rounded-lg xl:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <KeyRound className="size-4 text-primary" />
              Live execution policy
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <Policy label="Hyperliquid direct orders" value="Disabled in V1" />
            <Policy label="Volume farming" value="Risk gated" />
            <Policy label="Last readiness check" value={new Date(readiness.checkedAt).toLocaleString("en-US")} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="metric-mono mt-1 truncate text-sm">{value}</div>
    </div>
  );
}

function Guard({ label, value, checked }: { label: string; value: string; checked: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{value}</div>
      </div>
      <Switch checked={checked} disabled />
    </div>
  );
}

function Policy({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}

function formatLeverageLimits(limits: { defaultMax?: number; overrides: Record<string, number> } | null): string {
  if (!limits) return "unknown";
  const overrides = Object.entries(limits.overrides)
    .slice(0, 2)
    .map(([asset, max]) => `${asset} ${max}x`)
    .join(", ");
  return overrides || (limits.defaultMax ? `default ${limits.defaultMax}x` : "available");
}
