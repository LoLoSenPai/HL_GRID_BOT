import { createProprClient, ProprAPIError, type ProprLeverageLimits } from "@/features/propr/client";
import { getEnv, redactSecret } from "@/lib/env";

export interface ProprLiveReadiness {
  checkedAt: string;
  activeEnv: "beta" | "live";
  apiUrl: string;
  wsUrl: string;
  apiKey: string;
  apiKeyName: "PROPR_BETA_API_KEY" | "PROPR_LIVE_API_KEY";
  health: {
    services: Record<string, string> | null;
    coreOk: boolean;
  };
  authenticated: boolean;
  activeChallengeCount: number;
  activeAccountId?: string;
  selectedAccountId?: string;
  selectedAccountIdName: "PROPR_BETA_ACCOUNT_ID" | "PROPR_LIVE_ACCOUNT_ID" | "PROPR_ACCOUNT_ID";
  leverageLimits: ProprLeverageLimits | null;
  liveEnabled: boolean;
  blockers: string[];
  warnings: string[];
}

export async function checkProprLiveReadiness(): Promise<ProprLiveReadiness> {
  const env = getEnv();
  const readiness: ProprLiveReadiness = {
    checkedAt: new Date().toISOString(),
    activeEnv: env.PROPR_ACTIVE_ENV,
    apiUrl: env.PROPR_API_URL,
    wsUrl: env.PROPR_WS_URL,
    apiKey: redactSecret(env.PROPR_API_KEY),
    apiKeyName: env.PROPR_SELECTED_API_KEY_NAME,
    health: {
      services: null,
      coreOk: false,
    },
    authenticated: false,
    activeChallengeCount: 0,
    selectedAccountId: env.PROPR_SELECTED_ACCOUNT_ID ? redactIdentifier(env.PROPR_SELECTED_ACCOUNT_ID) : undefined,
    selectedAccountIdName: env.PROPR_SELECTED_ACCOUNT_ID_NAME,
    leverageLimits: null,
    liveEnabled: false,
    blockers: [],
    warnings: endpointWarnings(env.PROPR_ACTIVE_ENV, env.PROPR_API_URL, env.PROPR_API_KEY),
  };

  if (!env.PROPR_API_KEY) {
    readiness.blockers.push(`${env.PROPR_SELECTED_API_KEY_NAME} is missing for active Propr ${env.PROPR_ACTIVE_ENV} mode.`);
    return readiness;
  }

  const client = createProprClient();

  try {
    readiness.health.services = await client.healthServices();
    readiness.health.coreOk = readiness.health.services.core === "OK";
    if (!readiness.health.coreOk) {
      readiness.blockers.push("Propr core service is not OK.");
    }
  } catch (error) {
    readiness.blockers.push(`Propr health check failed: ${errorMessage(error)}`);
  }

  try {
    readiness.leverageLimits = await client.getLeverageLimits();
  } catch (error) {
    readiness.warnings.push(`Could not load leverage limits: ${errorMessage(error)}`);
  }

  try {
    await client.getUser();
    readiness.authenticated = true;
  } catch (error) {
    readiness.blockers.push(
      error instanceof ProprAPIError && error.statusCode === 401
        ? "Propr API key is invalid or unauthorized."
        : `Propr authentication failed: ${errorMessage(error)}`,
    );
    return readiness;
  }

  try {
    const attempts = await client.getChallengeAttempts({ status: "active" });
    readiness.activeChallengeCount = attempts.length;
    const selectedAttempt = env.PROPR_SELECTED_ACCOUNT_ID
      ? attempts.find((attempt) => attempt.accountId === env.PROPR_SELECTED_ACCOUNT_ID)
      : undefined;
    const activeAttempt = selectedAttempt ?? attempts[0];
    readiness.activeAccountId = activeAttempt?.accountId ? redactIdentifier(activeAttempt.accountId) : undefined;
    if (attempts.length === 0) {
      readiness.blockers.push("No active Propr challenge account found.");
    }
    if (env.PROPR_SELECTED_ACCOUNT_ID && !selectedAttempt) {
      readiness.blockers.push(`${env.PROPR_SELECTED_ACCOUNT_ID_NAME} does not match an active Propr challenge account.`);
    }
    if (!env.PROPR_SELECTED_ACCOUNT_ID && attempts.length > 1) {
      readiness.blockers.push(
        `Multiple active Propr challenge accounts found (${attempts.length}). Set ${env.PROPR_SELECTED_ACCOUNT_ID_NAME} before live execution.`,
      );
    }
  } catch (error) {
    readiness.blockers.push(`Could not load active challenge attempts: ${errorMessage(error)}`);
  }

  readiness.liveEnabled =
    readiness.blockers.length === 0 &&
    readiness.health.coreOk &&
    readiness.authenticated &&
    readiness.activeChallengeCount > 0;

  return readiness;
}

function endpointWarnings(activeEnv: "beta" | "live", apiUrl: string, apiKey?: string): string[] {
  const warnings: string[] = [];
  const usesBetaUrl = apiUrl.includes("beta");
  const isBetaKey = apiKey?.startsWith("pk_beta_") ?? false;
  const isLiveKey = apiKey?.startsWith("pk_live_") ?? false;

  if (activeEnv === "beta" && !usesBetaUrl) warnings.push("PROPR_ACTIVE_ENV is beta but the selected Propr URL does not look like beta.");
  if (activeEnv === "live" && usesBetaUrl) warnings.push("PROPR_ACTIVE_ENV is live but the selected Propr URL looks like beta.");
  if (usesBetaUrl && isLiveKey) warnings.push("Live key is configured against the beta Propr URL.");
  if (!usesBetaUrl && isBetaKey) warnings.push("Beta key is configured against the live Propr URL.");

  return warnings;
}

function redactIdentifier(value: string): string {
  if (value.length <= 16) return value;
  return `${value.slice(0, 14)}...${value.slice(-6)}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown Propr readiness error";
}
