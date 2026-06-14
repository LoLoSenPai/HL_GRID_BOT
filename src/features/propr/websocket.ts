import WebSocket from "ws";

import { getEnv } from "@/lib/env";

export type ProprEventHandler = (event: ProprWebSocketEvent) => void;

export interface ProprWebSocketEvent {
  type: string;
  userId?: string;
  timestamp?: number;
  data?: Record<string, unknown>;
}

export interface ProprWebSocketClient {
  close(): void;
}

export function connectProprWebSocket(handler: ProprEventHandler): ProprWebSocketClient {
  const env = getEnv();
  if (!env.PROPR_API_KEY) {
    throw new Error("PROPR_API_KEY is required for Propr WebSocket.");
  }

  const ws = new WebSocket(env.PROPR_WS_URL, {
    headers: { "X-API-Key": env.PROPR_API_KEY },
  });

  ws.on("message", (raw) => {
    try {
      handler(JSON.parse(raw.toString()) as ProprWebSocketEvent);
    } catch {
      handler({ type: "unhandled.invalid_json" });
    }
  });

  return {
    close() {
      ws.close();
    },
  };
}
