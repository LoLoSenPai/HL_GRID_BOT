import { z } from "zod";

const DEFAULT_PROPR_API_URL = "https://api.propr.xyz/v1";
const DEFAULT_PROPR_WS_URL = "wss://api.propr.xyz/ws";

const envSchema = z.object({
  PROPR_API_KEY: z.string().optional(),
  PROPR_API_URL: z.string().url().optional(),
  PROPR_WS_URL: z.string().url().optional(),
  PROPR_ACCOUNT_ID: z.string().optional(),
  DATABASE_URL: z.string().default("file:./data/hl_grid_bot.sqlite"),
  DWELLIR_API_KEY: z.string().optional(),
});

type ParsedEnv = z.infer<typeof envSchema>;

export type AppEnv = ParsedEnv & {
  PROPR_API_KEY?: string;
  PROPR_API_URL: string;
  PROPR_WS_URL: string;
  PROPR_SELECTED_ACCOUNT_ID?: string;
  PROPR_SELECTED_ACCOUNT_ID_NAME: "PROPR_ACCOUNT_ID";
};

export function getEnv(): AppEnv {
  const env = envSchema.parse(process.env);

  return {
    ...env,
    PROPR_API_URL: env.PROPR_API_URL ?? DEFAULT_PROPR_API_URL,
    PROPR_WS_URL: env.PROPR_WS_URL ?? DEFAULT_PROPR_WS_URL,
    PROPR_SELECTED_ACCOUNT_ID: env.PROPR_ACCOUNT_ID,
    PROPR_SELECTED_ACCOUNT_ID_NAME: "PROPR_ACCOUNT_ID",
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
