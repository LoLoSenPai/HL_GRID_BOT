import type { ExecutionPosition } from "@/features/execution/types";
import { getSetting, setSetting } from "@/features/bots/repository";
import { getDefaultBotOwnerUser } from "@/lib/auth/session";

const PROPR_WS_POSITIONS_KEY_PREFIX = "propr_ws_position_snapshots";

export interface ProprWsPositionSnapshot {
  asset: string;
  positionSide: string;
  quantity?: string;
  markPrice?: string;
  unrealizedPnl?: string;
  realizedPnl?: string;
  leverage?: string;
  marginUsed?: string;
  cumulativeFunding?: string;
  cumulativeTradingFees?: string;
  returnOnEquity?: string;
  updatedAt: string;
}

export function recordProprWsPositionEvent(
  eventType: string,
  data: unknown,
  receivedAt = new Date().toISOString(),
  ownerUser = getDefaultBotOwnerUser(),
) {
  if (!eventType.startsWith("position.") || !isRecord(data)) return;

  const asset = stringField(data, "base") ?? stringField(data, "asset");
  const positionSide = stringField(data, "positionSide");
  if (!asset || !positionSide) return;

  const snapshots = readPositionSnapshotMap(ownerUser);
  const key = snapshotKey(asset, positionSide);
  const quantity = stringField(data, "quantity");
  if (eventType === "position.closed" || quantity === "0") {
    delete snapshots[key];
  } else {
    snapshots[key] = {
      asset,
      positionSide,
      quantity,
      markPrice: stringField(data, "markPrice"),
      unrealizedPnl: stringField(data, "unrealizedPnl"),
      realizedPnl: stringField(data, "realizedPnl"),
      leverage: stringField(data, "leverage"),
      marginUsed: stringField(data, "marginUsed"),
      cumulativeFunding: stringField(data, "cumulativeFunding"),
      cumulativeTradingFees: stringField(data, "cumulativeTradingFees"),
      returnOnEquity: stringField(data, "returnOnEquity"),
      updatedAt: receivedAt,
    };
  }

  setSetting(positionSnapshotSettingKey(ownerUser), JSON.stringify(snapshots));
}

export function getProprWsPositionSnapshots(ownerUser = getDefaultBotOwnerUser()): ProprWsPositionSnapshot[] {
  return Object.values(readPositionSnapshotMap(ownerUser));
}

export function mergeProprWsPositionSnapshots(
  positions: ExecutionPosition[],
  ownerUser = getDefaultBotOwnerUser(),
): ExecutionPosition[] {
  const snapshots = readPositionSnapshotMap(ownerUser);
  return positions.map((position) => {
    const snapshot = snapshots[snapshotKey(position.asset, position.positionSide)];
    if (!snapshot) return position;

    return {
      ...position,
      quantity: snapshot.quantity ?? position.quantity,
      markPrice: snapshot.markPrice ?? position.markPrice,
      unrealizedPnl: snapshot.unrealizedPnl ?? position.unrealizedPnl,
      realizedPnl: snapshot.realizedPnl ?? position.realizedPnl,
      leverage: snapshot.leverage ?? position.leverage,
      marginUsed: snapshot.marginUsed ?? position.marginUsed,
      cumulativeFunding: snapshot.cumulativeFunding ?? position.cumulativeFunding,
      cumulativeTradingFees: snapshot.cumulativeTradingFees ?? position.cumulativeTradingFees,
      returnOnEquity: snapshot.returnOnEquity ?? position.returnOnEquity,
    };
  });
}

function readPositionSnapshotMap(ownerUser: string): Record<string, ProprWsPositionSnapshot> {
  const setting = getSetting(positionSnapshotSettingKey(ownerUser));
  if (!setting) return {};

  try {
    const parsed = JSON.parse(setting.value) as unknown;
    if (!isRecord(parsed)) return {};

    return Object.fromEntries(
      Object.entries(parsed).filter(([, value]) => isPositionSnapshot(value)),
    ) as Record<string, ProprWsPositionSnapshot>;
  } catch {
    return {};
  }
}

function isPositionSnapshot(value: unknown): value is ProprWsPositionSnapshot {
  return (
    isRecord(value) &&
    typeof value.asset === "string" &&
    typeof value.positionSide === "string" &&
    typeof value.updatedAt === "string"
  );
}

function snapshotKey(asset: string, positionSide: string) {
  return `${asset}:${positionSide}`;
}

function positionSnapshotSettingKey(ownerUser: string): string {
  return `${PROPR_WS_POSITIONS_KEY_PREFIX}:${ownerUser}`;
}

function stringField(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key];
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
