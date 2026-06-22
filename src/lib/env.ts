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
  PROPR_SELECTED_ACCOUNT_ID_NAME: string;
};

export function getEnv(): AppEnv {
  return getProprEnvForUser();
}

export function getProprEnvForUser(ownerUser?: string): AppEnv {
  const env = envSchema.parse(process.env);
  const suffix = ownerUser ? envSuffixForUser(ownerUser) : undefined;
  const scopedAccountId = readUserScopedEnv("PROPR_ACCOUNT_ID", suffix);
  const apiKey = readUserScopedEnv("PROPR_API_KEY", suffix) ?? env.PROPR_API_KEY;
  const apiUrl = readUserScopedEnv("PROPR_API_URL", suffix) ?? env.PROPR_API_URL ?? DEFAULT_PROPR_API_URL;
  const wsUrl = readUserScopedEnv("PROPR_WS_URL", suffix) ?? env.PROPR_WS_URL ?? DEFAULT_PROPR_WS_URL;
  const selectedAccountId = scopedAccountId ?? env.PROPR_ACCOUNT_ID;

  return {
    ...env,
    PROPR_API_KEY: apiKey,
    PROPR_API_URL: apiUrl,
    PROPR_WS_URL: wsUrl,
    PROPR_SELECTED_ACCOUNT_ID: selectedAccountId,
    PROPR_SELECTED_ACCOUNT_ID_NAME: suffix && scopedAccountId ? `PROPR_ACCOUNT_ID_${suffix}` : "PROPR_ACCOUNT_ID",
  };
}

export function hasProprCredentials(ownerUser?: string): boolean {
  return Boolean(getProprEnvForUser(ownerUser).PROPR_API_KEY);
}

export function redactSecret(value?: string): string {
  if (!value) return "missing";
  if (value.length <= 8) return "set";
  return `${value.slice(0, 8)}...`;
}

export function envSuffixForUser(ownerUser: string): string {
  return ownerUser.trim().toUpperCase().replace(/[^A-Z0-9]+/gu, "_");
}

function readUserScopedEnv(key: string, suffix?: string): string | undefined {
  if (!suffix) return undefined;
  const value = process.env[`${key}_${suffix}`]?.trim();
  return value || undefined;
}
