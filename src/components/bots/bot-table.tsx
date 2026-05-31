import Link from "next/link";
import { Copy, Pause, Pencil, Play, Rocket, Square, Trash2 } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/trading/status-badge";
import { formatMarketSymbol } from "@/domain/markets";
import type { Bot } from "@/domain/types";
import {
  createLiveCandidateAction,
  deleteBotAction,
  duplicateBotAction,
  pauseBotAction,
  resumeBotAction,
  stopBotAction,
} from "@/features/bots/actions";
import { cn } from "@/lib/utils";

export function BotTable({ bots }: { bots: Bot[] }) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Pair</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Range</TableHead>
            <TableHead>Capital</TableHead>
            <TableHead>Mode</TableHead>
            <TableHead className="w-[220px] text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {bots.map((bot) => (
            <TableRow key={bot.id}>
              <TableCell className="font-medium">{bot.name}</TableCell>
              <TableCell className="metric-mono">{formatMarketSymbol(bot.config.pair)}</TableCell>
              <TableCell>
                <StatusBadge status={bot.status} />
              </TableCell>
              <TableCell className="metric-mono">
                {bot.config.lowerPrice} - {bot.config.upperPrice}
              </TableCell>
              <TableCell className="metric-mono">{bot.config.capitalAllocation} USDC</TableCell>
              <TableCell>{bot.config.mode === "propr_live" ? "Challenge" : bot.config.mode === "paper" ? "Local Sim" : "Mock"}</TableCell>
              <TableCell>
                <div className="flex justify-end gap-1">
                  <Link
                    href={`/bots/${bot.id}`}
                    className={cn(buttonVariants({ size: "icon-sm", variant: "ghost" }))}
                    aria-label="Edit bot"
                  >
                    <Pencil />
                  </Link>
                  <BotAction action={duplicateBotAction} id={bot.id} label="Duplicate bot">
                    <Copy />
                  </BotAction>
                  {bot.config.mode !== "propr_live" ? (
                    <BotAction action={createLiveCandidateAction} id={bot.id} label="Create challenge candidate">
                      <Rocket />
                    </BotAction>
                  ) : null}
                  <BotAction action={resumeBotAction} id={bot.id} label="Resume bot">
                    <Play />
                  </BotAction>
                  <BotAction action={pauseBotAction} id={bot.id} label="Pause bot">
                    <Pause />
                  </BotAction>
                  <BotAction action={stopBotAction} id={bot.id} label="Stop bot">
                    <Square />
                  </BotAction>
                  <BotAction action={deleteBotAction} id={bot.id} label="Delete bot">
                    <Trash2 />
                  </BotAction>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function BotAction({
  action,
  id,
  label,
  children,
}: {
  action: (formData: FormData) => Promise<void>;
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <Button size="icon-sm" variant="ghost" aria-label={label} type="submit">
        {children}
      </Button>
    </form>
  );
}
