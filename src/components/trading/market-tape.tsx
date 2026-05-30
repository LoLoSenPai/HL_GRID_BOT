import { Card, CardContent } from "@/components/ui/card";
import type { MarketSnapshot } from "@/domain/types";

export function MarketTape({ markets }: { markets: MarketSnapshot[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {markets.map((market) => (
        <Card key={market.asset} className="rounded-lg">
          <CardContent className="flex items-center justify-between p-3">
            <div>
              <div className="text-xs text-muted-foreground">{market.asset}/USDC</div>
              <div className="metric-mono text-lg font-semibold">{market.mid}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Funding</div>
              <div className="metric-mono text-xs text-primary">{market.funding ?? "0"}</div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
