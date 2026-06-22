import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { BotHistoryTable } from "@/components/bots/bot-history-table";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Bot } from "@/domain/types";
import { listBots } from "@/features/bots/repository";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function BotHistoryPage() {
  const user = await requireCurrentUser();
  const bots = listBots(user).filter(isHistoricalBot);

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-4 lg:p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Bot History</h1>
          <p className="text-sm text-muted-foreground">Stopped challenge grids, total PnL, volume and replay actions.</p>
        </div>
        <Link href="/bots" className={cn(buttonVariants({ variant: "outline" }))}>
          <ArrowLeft data-icon="inline-start" />
          Active bots
        </Link>
      </div>
      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle className="text-sm">Closed and stopped bots</CardTitle>
        </CardHeader>
        <CardContent>
          <BotHistoryTable bots={bots} />
        </CardContent>
      </Card>
    </div>
  );
}

function isHistoricalBot(bot: Bot): boolean {
  return ["stopped", "error"].includes(bot.status);
}
