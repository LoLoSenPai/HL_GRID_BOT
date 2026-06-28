"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";

export function CloseBotActionButton({ botId, botName }: { botId: string; botName: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const closeBot = () => {
    const confirmed = window.confirm(
      `Close ${botName}? This cancels this bot's open orders and sends a reduce-only market order for the bot inventory.`,
    );
    if (!confirmed) return;

    startTransition(() => {
      void (async () => {
        const response = await fetch(`/api/bots/${encodeURIComponent(botId)}/close`, { method: "POST" });
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          window.alert(payload.error ?? "Unable to close bot.");
          return;
        }
        router.refresh();
      })().catch((error) => {
        window.alert(error instanceof Error ? error.message : "Unable to close bot.");
      });
    });
  };

  return (
    <Button
      size="icon-sm"
      variant="destructive"
      aria-label="Close bot position"
      disabled={pending}
      onClick={closeBot}
      type="button"
    >
      <X />
    </Button>
  );
}
