import { Search } from "lucide-react";

import { ActivityFeed } from "@/components/activity/activity-feed";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { listEvents } from "@/features/bots/repository";

export const dynamic = "force-dynamic";

export default function ActivityPage() {
  const events = listEvents(100);

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">Activity</h1>
        <p className="text-sm text-muted-foreground">Centralized event log for bot, order, fill and risk activity.</p>
      </div>
      <Card className="rounded-lg">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-sm">Event log</CardTitle>
            <div className="relative w-full max-w-sm">
              <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-8" placeholder="Search events" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ActivityFeed events={events} />
        </CardContent>
      </Card>
    </div>
  );
}
