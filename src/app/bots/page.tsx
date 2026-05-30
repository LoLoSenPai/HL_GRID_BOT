import { Plus } from "lucide-react";

import { BotTable } from "@/components/bots/bot-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createBotAction } from "@/features/bots/actions";
import { listBots } from "@/features/bots/repository";

export const dynamic = "force-dynamic";

export default function BotsPage() {
  const bots = listBots();

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-4 lg:p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Bots</h1>
          <p className="text-sm text-muted-foreground">Create, edit, duplicate, pause, resume, stop and delete bots.</p>
        </div>
        <form action={createBotAction}>
          <Button type="submit">
            <Plus data-icon="inline-start" />
            Create
          </Button>
        </form>
      </div>
      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle className="text-sm">All bots</CardTitle>
        </CardHeader>
        <CardContent>
          <BotTable bots={bots} />
        </CardContent>
      </Card>
    </div>
  );
}
