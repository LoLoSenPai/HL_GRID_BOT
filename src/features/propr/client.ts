import { ulid } from "ulid";

import { isBuilderMarket } from "@/domain/markets";
import { getProprEnvForUser } from "@/lib/env";
import type { MarketSymbol } from "@/domain/types";
import type { OrderIntent } from "@/features/execution/types";

export class ProprAPIError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: number | null,
    message: string,
  ) {
    super(`[${statusCode}] ${code ?? "unknown"}: ${message}`);
    this.name = "ProprAPIError";
  }
}

export interface ProprClientOptions {
  apiKey?: string;
  baseUrl?: string;
  ownerUser?: string;
  timeoutMs?: number;
}

export interface ProprOrder {
  orderId: string;
  intentId: string;
  positionId: string | null;
  asset: MarketSymbol;
  base: MarketSymbol;
  quote: string;
  type: string;
  side: string;
  positionSide: string;
  timeInForce: string;
  quantity: string;
  price: string | null;
  triggerPrice: string | null;
  reduceOnly: boolean;
  closePosition: boolean;
  cumulativeQuantity: string;
  averageFillPrice: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProprPosition {
  positionId: string;
  asset: MarketSymbol;
  base: MarketSymbol;
  quote: string;
  positionSide: string;
  quantity: string;
  entryPrice: string;
  markPrice: string;
  unrealizedPnl: string;
  realizedPnl: string;
  leverage: string;
  liquidationPrice?: string;
  marginUsed?: string;
  cumulativeFunding?: string;
  cumulativeTradingFees?: string;
  returnOnEquity?: string;
}

export interface ProprTrade {
  tradeId: string;
  orderId: string;
  asset: MarketSymbol;
  side: string;
  quantity: string;
  price: string;
  fee: string;
  realizedPnl: string;
  executedAt: string;
}

export interface ProprLeverageLimits {
  defaultMax?: number;
  defaults?: Record<string, number>;
  overrides: Record<string, number>;
}

export interface ProprChallengeAttempt {
  attemptId: string;
  challengeId: string;
  accountId: string;
  status: string;
  totalPnl?: string;
  totalProfitLoss?: string;
  pnl?: string;
  winRate?: string;
  maxDrawdown?: string;
  tradingDays?: number;
  currentPhase?: {
    order?: number;
    startingBalance?: string;
    endingBalance?: string | null;
    status?: string;
  };
  phases?: Array<{
    order?: number;
    startingBalance?: string;
    endingBalance?: string | null;
    status?: string;
  }>;
}

export interface ProprAccount {
  accountId: string;
  balance?: string;
  equity?: string;
  availableBalance?: string;
  marginBalance?: string;
  totalUnrealizedPnl?: string;
  isolatedPositionMargin?: string;
  highWaterMark?: string;
  dayStartEquity?: string;
  dailyStartEquity?: string;
  startOfDayEquity?: string;
  dailyEquityStart?: string;
  dailyStartingEquity?: string;
  dailyLossUsed?: string;
  dailyLoss?: string;
  maxDailyLossUsed?: string;
  currentDailyLoss?: string;
  totalInitialMargin?: string;
  totalMaintenanceMargin?: string;
}

export class ProprClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly selectedAccountId?: string;
  private readonly selectedAccountIdName: string;
  accountId: string | null = null;

  constructor(options: ProprClientOptions = {}) {
    const env = getProprEnvForUser(options.ownerUser);
    this.apiKey = options.apiKey ?? env.PROPR_API_KEY ?? "";
    this.baseUrl = options.baseUrl ?? env.PROPR_API_URL;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.selectedAccountId = env.PROPR_SELECTED_ACCOUNT_ID;
    this.selectedAccountIdName = env.PROPR_SELECTED_ACCOUNT_ID_NAME;

    if (!this.apiKey) {
      throw new Error("PROPR_API_KEY is required for Propr execution.");
    }
  }

  async setup(accountId?: string): Promise<string> {
    const attempts = await this.getChallengeAttempts({ status: "active" });
    const selectedAccountId = accountId ?? this.selectedAccountId;

    if (selectedAccountId) {
      const selectedAttempt = attempts.find((attempt) => accountIdMatches(attempt.accountId, selectedAccountId));
      if (!selectedAttempt) {
        throw new Error(`${this.selectedAccountIdName} does not match an active Propr challenge account.`);
      }
      this.accountId = selectedAttempt.accountId;
      return selectedAttempt.accountId;
    }

    const attempt = attempts[0];
    if (!attempt?.accountId) {
      throw new Error("No active Propr challenge account found.");
    }
    if (attempts.length > 1) {
      throw new Error(
        `Multiple active Propr challenge accounts found (${attempts.length}). Set ${this.selectedAccountIdName} before live execution.`,
      );
    }
    this.accountId = attempt.accountId;
    return attempt.accountId;
  }

  async health(): Promise<{ status: string }> {
    return this.request("GET", "/health", { auth: false });
  }

  async healthServices(): Promise<Record<string, string>> {
    return this.request("GET", "/health/services", { auth: false });
  }

  async getUser(): Promise<Record<string, unknown>> {
    return this.request("GET", "/users/me");
  }

  async getChallengeAttempts(params: Record<string, string | number> = {}) {
    const response = await this.request<{ data: ProprChallengeAttempt[] }>(
      "GET",
      "/challenge-attempts",
      { params: { limit: 20, offset: 0, ...params } },
    );
    return response.data ?? [];
  }

  async getChallengeAttempt(attemptId: string): Promise<ProprChallengeAttempt> {
    const response = await this.request<ProprChallengeAttempt | { data: ProprChallengeAttempt }>(
      "GET",
      `/challenge-attempts/${attemptId}`,
    );
    return "data" in response ? response.data : response;
  }

  async getAccount(): Promise<ProprAccount> {
    const response = await this.request<ProprAccount | { data: ProprAccount }>("GET", this.accountPath(""));
    return "data" in response ? response.data : response;
  }

  async getLeverageLimits(): Promise<ProprLeverageLimits> {
    return this.request("GET", "/leverage-limits/effective", { auth: false });
  }

  async getOrders(params: Record<string, string | number> = {}): Promise<ProprOrder[]> {
    const response = await this.request<{ data: ProprOrder[] }>(
      "GET",
      this.accountPath("/orders"),
      { params: { limit: 100, offset: 0, ...params } },
    );
    return response.data ?? [];
  }

  async createOrder(intent: OrderIntent): Promise<ProprOrder[]> {
    const order: Record<string, unknown> = {
      accountId: this.accountId,
      intentId: intent.clientOrderId ?? ulid(),
      exchange: "hyperliquid",
      type: intent.type,
      side: intent.side,
      positionSide: proprPositionSideForIntent(intent),
      productType: "perp",
      timeInForce: intent.timeInForce ?? (intent.type === "market" ? "IOC" : "GTC"),
      asset: intent.asset,
      base: intent.asset,
      quote: "USDC",
      quantity: intent.quantity,
      reduceOnly: intent.reduceOnly ?? false,
      closePosition: intent.closePosition ?? false,
    };

    if (intent.price) order.price = intent.price;
    if (intent.triggerPrice) order.triggerPrice = intent.triggerPrice;

    const response = await this.request<{ data: ProprOrder[] }>(
      "POST",
      this.accountPath("/orders"),
      { body: { orders: [order] } },
    );
    return response.data ?? [];
  }

  async cancelOrder(orderId: string): Promise<ProprOrder | null> {
    try {
      return await this.request("POST", this.accountPath(`/orders/${orderId}/cancel`));
    } catch (error) {
      if (error instanceof ProprAPIError && error.statusCode === 400) return null;
      throw error;
    }
  }

  async getPositions(params: Record<string, string | number> = {}): Promise<ProprPosition[]> {
    const response = await this.request<{ data: ProprPosition[] }>(
      "GET",
      this.accountPath("/positions"),
      { params: { status: "open", limit: 100, offset: 0, ...params } },
    );
    return (response.data ?? []).filter((position) => position.quantity !== "0");
  }

  async getTrades(params: Record<string, string | number> = {}): Promise<ProprTrade[]> {
    const response = await this.request<{ data: ProprTrade[] }>(
      "GET",
      this.accountPath("/trades"),
      { params: { limit: 100, offset: 0, ...params } },
    );
    return response.data ?? [];
  }

  async setLeverage(asset: MarketSymbol, leverage: number, marginMode = isBuilderMarket(asset) ? "isolated" : "cross") {
    const config = await this.request<{ configId: string }>(
      "GET",
      this.accountPath(`/margin-config/${asset}`),
    );
    return this.request("PUT", this.accountPath(`/margin-config/${config.configId}`), {
      body: {
        exchange: "hyperliquid",
        asset,
        marginMode,
        leverage,
      },
    });
  }

  private accountPath(path: string): string {
    if (!this.accountId) {
      throw new Error("Propr accountId is not set. Call setup() first.");
    }
    return `/accounts/${this.accountId}${path}`;
  }

  private async request<T>(
    method: string,
    path: string,
    options: {
      auth?: boolean;
      params?: Record<string, string | number | boolean | undefined>;
      body?: unknown;
    } = {},
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(options.params ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (options.auth !== false) headers["X-API-Key"] = this.apiKey;

      const response = await fetch(url, {
        method,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
        cache: "no-store",
      });

      if (!response.ok) {
        let code: number | null = null;
        let message = response.statusText;
        try {
          const body = (await response.json()) as { code?: number; message?: string };
          code = body.code ?? null;
          message = body.message ?? message;
        } catch {
          // Keep status text when the response is not JSON.
        }
        throw new ProprAPIError(response.status, code, message);
      }

      return response.json() as Promise<T>;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createProprClient(options?: ProprClientOptions) {
  return new ProprClient(options);
}

export function accountIdMatches(accountId: string | undefined, selectedAccountId: string): boolean {
  if (!accountId) return false;
  if (accountId === selectedAccountId) return true;
  return accountId.endsWith(`:${selectedAccountId}`) || selectedAccountId.endsWith(`:${accountId}`);
}

export function proprPositionSideForIntent(intent: OrderIntent): string {
  if (!intent.reduceOnly) return intent.positionSide;
  return intent.side === "buy" ? "long" : "short";
}
