import Link from "next/link";
import { Archive, Plus } from "lucide-react";

import { BotTable } from "@/components/bots/bot-table";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { createBotAction } from "@/features/bots/actions";
import { listBots } from "@/features/bots/repository";
import type { Bot } from "@/domain/types";

export const dynamic = "force-dynamic";

export default function BotsPage() {
  const bots = listBots();
  const activeBots = bots.filter(isOperationalBot);
  const historyCount = bots.length - activeBots.length;

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-4 lg:p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Bots</h1>
          <p className="text-sm text-muted-foreground">Track active challenge bots, PnL, exposure, fills and operational actions.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/bots/history" className={cn(buttonVariants({ variant: "outline" }))}>
            <Archive data-icon="inline-start" />
            History{historyCount > 0 ? ` (${historyCount})` : ""}
          </Link>
          <form action={createBotAction}>
            <Button type="submit">
              <Plus data-icon="inline-start" />
              New bot
            </Button>
          </form>
        </div>
      </div>
      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle className="text-sm">Active bot performance</CardTitle>
        </CardHeader>
        <CardContent>
          {activeBots.length ? (
            <BotTable bots={activeBots} />
          ) : (
            <div className="flex min-h-[180px] flex-col items-center justify-center rounded-md border border-dashed text-center">
              <div className="text-sm font-medium">No operational bots</div>
              <div className="mt-1 max-w-sm text-xs text-muted-foreground">
                Deploy a challenge grid from the terminal or inspect stopped bots in history.
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function isOperationalBot(bot: Bot): boolean {
  return !["stopped", "error"].includes(bot.status);
}
