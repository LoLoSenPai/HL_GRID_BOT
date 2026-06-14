"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  Bot,
  FlaskConical,
  Gauge,
  LayoutDashboard,
  LogOut,
  Settings,
  ShieldAlert,
  SquareTerminal,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useTerminalStore } from "@/store/use-terminal-store";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/bots", label: "Bots", icon: Bot },
  { href: "/grid-terminal", label: "Grid Terminal", icon: SquareTerminal },
  { href: "/lab", label: "Lab", icon: FlaskConical },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [killPending, setKillPending] = useState(false);
  const [killError, setKillError] = useState(false);
  const killSwitchActive = useTerminalStore((state) => state.killSwitchActive);
  const setKillSwitch = useTerminalStore((state) => state.setKillSwitch);
  const killSwitchLabel = killPending
    ? "Stopping..."
    : killError
      ? "Kill failed"
      : killSwitchActive
        ? "Emergency sent"
        : "Kill switch";

  if (pathname === "/login") {
    return <>{children}</>;
  }

  const activateKillSwitch = async () => {
    if (killPending) return;
    const confirmed = window.confirm(
      "Emergency stop: cancel all Propr orders and close open positions on the active challenge account?",
    );
    if (!confirmed) return;

    setKillPending(true);
    setKillError(false);
    try {
      const response = await fetch("/api/bots/kill-switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Manual kill switch from app shell" }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Propr emergency stop failed.");
      }
      setKillSwitch(true);
      router.refresh();
    } catch {
      setKillError(true);
    } finally {
      setKillPending(false);
    }
  };

  return (
    <div className="flex h-screen min-h-screen overflow-hidden bg-background text-foreground">
      <aside className="hidden w-64 shrink-0 border-r bg-sidebar lg:flex lg:flex-col">
        <div className="flex h-16 items-center gap-3 px-5">
          <div className="flex size-9 items-center justify-center rounded-lg border bg-sidebar-accent">
            <Gauge className="size-4 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">HL Grid Bot</div>
            <div className="truncate text-xs text-muted-foreground">Propr execution terminal</div>
          </div>
        </div>
        <Separator />
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {navItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                className={cn(
                  buttonVariants({ variant: active ? "secondary" : "ghost" }),
                  "h-9 justify-start gap-2 rounded-md px-3 text-sm",
                  active && "bg-sidebar-accent text-sidebar-accent-foreground",
                )}
                href={item.href}
              >
                <Icon data-icon="inline-start" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex flex-col gap-2 border-t p-3">
          <form action="/api/auth/logout" method="post">
            <Button variant="ghost" className="h-9 w-full justify-start gap-2" type="submit">
              <LogOut data-icon="inline-start" />
              Logout
            </Button>
          </form>
          <Button
            variant={killSwitchActive || killError ? "destructive" : "outline"}
            className="h-9 w-full justify-start gap-2"
            disabled={killPending}
            onClick={activateKillSwitch}
          >
            <ShieldAlert data-icon="inline-start" />
            {killSwitchLabel}
          </Button>
        </div>
      </aside>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b px-4 lg:hidden">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Gauge className="size-4 text-primary" />
            HL Grid Bot
          </div>
          <Button
            size="sm"
            variant={killSwitchActive || killError ? "destructive" : "outline"}
            disabled={killPending}
            onClick={activateKillSwitch}
          >
            <ShieldAlert data-icon="inline-start" />
            {killPending ? "Stopping" : killError ? "Failed" : "Risk"}
          </Button>
        </header>
        <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
