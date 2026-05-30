import { z } from "zod";

const DEFAULT_PROPR_API_URL = "https://api.propr.xyz/v1";
const DEFAULT_PROPR_WS_URL = "wss://api.propr.xyz/ws";

const envSchema = z.object({
  PROPR_ACTIVE_ENV: z.enum(["beta", "live"]).default("beta"),
  PROPR_BETA_API_KEY: z.string().optional(),
  PROPR_BETA_API_URL: z.string().url().optional(),
  PROPR_BETA_WS_URL: z.string().url().optional(),
  PROPR_LIVE_API_KEY: z.string().optional(),
  PROPR_LIVE_API_URL: z.string().url().optional(),
  PROPR_LIVE_WS_URL: z.string().url().optional(),
  PROPR_API_KEY: z.string().optional(),
  PROPR_API_URL: z.string().url().optional(),
  PROPR_WS_URL: z.string().url().optional(),
  DATABASE_URL: z.string().default("file:./data/hl_grid_bot.sqlite"),
  DWELLIR_API_KEY: z.string().optional(),
});

type ParsedEnv = z.infer<typeof envSchema>;

export type AppEnv = ParsedEnv & {
  PROPR_API_KEY?: string;
  PROPR_API_URL: string;
  PROPR_WS_URL: string;
  PROPR_SELECTED_API_KEY_NAME: "PROPR_BETA_API_KEY" | "PROPR_LIVE_API_KEY";
  PROPR_SELECTED_API_URL_NAME: "PROPR_BETA_API_URL" | "PROPR_LIVE_API_URL";
  PROPR_SELECTED_WS_URL_NAME: "PROPR_BETA_WS_URL" | "PROPR_LIVE_WS_URL";
};

export function getEnv(): AppEnv {
  const env = envSchema.parse(process.env);
  const useLive = env.PROPR_ACTIVE_ENV === "live";

  return {
    ...env,
    PROPR_API_KEY: (useLive ? env.PROPR_LIVE_API_KEY : env.PROPR_BETA_API_KEY) ?? env.PROPR_API_KEY,
    PROPR_API_URL:
      (useLive ? env.PROPR_LIVE_API_URL : env.PROPR_BETA_API_URL) ??
      env.PROPR_API_URL ??
      DEFAULT_PROPR_API_URL,
    PROPR_WS_URL:
      (useLive ? env.PROPR_LIVE_WS_URL : env.PROPR_BETA_WS_URL) ?? env.PROPR_WS_URL ?? DEFAULT_PROPR_WS_URL,
    PROPR_SELECTED_API_KEY_NAME: useLive ? "PROPR_LIVE_API_KEY" : "PROPR_BETA_API_KEY",
    PROPR_SELECTED_API_URL_NAME: useLive ? "PROPR_LIVE_API_URL" : "PROPR_BETA_API_URL",
    PROPR_SELECTED_WS_URL_NAME: useLive ? "PROPR_LIVE_WS_URL" : "PROPR_BETA_WS_URL",
  };
}

export function hasProprCredentials(): boolean {
  return Boolean(getEnv().PROPR_API_KEY);
}

export function redactSecret(value?: string): string {
  if (!value) return "missing";
  if (value.length <= 8) return "set";
  return `${value.slice(0, 8)}...`;
}
