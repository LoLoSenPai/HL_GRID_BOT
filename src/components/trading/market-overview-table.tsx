import type { MarketSnapshot } from "@/domain/types";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function MarketOverviewTable({ markets }: { markets: MarketSnapshot[] }) {
  if (!markets.length) {
    return <div className="rounded-lg border p-3 text-sm text-muted-foreground">No market data available.</div>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Market</TableHead>
          <TableHead className="text-right">Price</TableHead>
          <TableHead className="text-right">24h</TableHead>
          <TableHead className="hidden text-right sm:table-cell">Funding</TableHead>
          <TableHead className="hidden text-right sm:table-cell">Volume</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {markets.map((market) => (
          <TableRow key={market.asset}>
            <TableCell>
              <div className="font-medium">{market.asset}</div>
              <div className="text-xs text-muted-foreground">{market.asset}/USDC perp</div>
            </TableCell>
            <TableCell className="metric-mono text-right">{formatPrice(market.mid)}</TableCell>
            <TableCell className={cn("metric-mono text-right", changeTone(market.change24hPct))}>
              {formatChange(market.change24hPct)}
            </TableCell>
            <TableCell className="hidden metric-mono text-right sm:table-cell">{formatRate(market.funding)}</TableCell>
            <TableCell className="hidden metric-mono text-right sm:table-cell">{formatVolume(market.volume24h)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function changeTone(value?: string): string {
  if (!value) return "text-muted-foreground";
  return Number(value) >= 0 ? "text-primary" : "text-destructive";
}

function formatChange(value?: string): string {
  if (!value) return "n/a";
  const sign = Number(value) > 0 ? "+" : "";
  return `${sign}${value}%`;
}

function formatPrice(value: string): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return value;
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: parsed >= 100 ? 2 : 4,
  }).format(parsed);
}

function formatRate(value?: string): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "n/a";
  return `${(parsed * 100).toFixed(4)}%`;
}

function formatVolume(value?: string): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "n/a";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    notation: "compact",
  }).format(parsed);
}
