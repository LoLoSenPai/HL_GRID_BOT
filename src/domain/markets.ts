import { SUPPORTED_MARKETS, type MarketSymbol } from "@/domain/types";

export type MarketCategory = "crypto" | "equity" | "pre_ipo" | "commodity" | "index" | "fx";

export interface MarketDefinition {
  symbol: MarketSymbol;
  label: string;
  name: string;
  category: MarketCategory;
  quote: "USDC";
  priceDecimals: number;
  quantityDecimals: number;
}

const MARKET_METADATA: Record<MarketSymbol, Omit<MarketDefinition, "symbol" | "quote">> = {
  BTC: {
    label: "BTC",
    name: "Bitcoin",
    category: "crypto",
    priceDecimals: 1,
    quantityDecimals: 6,
  },
  ETH: {
    label: "ETH",
    name: "Ethereum",
    category: "crypto",
    priceDecimals: 2,
    quantityDecimals: 5,
  },
  SOL: {
    label: "SOL",
    name: "Solana",
    category: "crypto",
    priceDecimals: 3,
    quantityDecimals: 4,
  },
  HYPE: {
    label: "HYPE",
    name: "Hyperliquid",
    category: "crypto",
    priceDecimals: 3,
    quantityDecimals: 4,
  },
  "xyz:CRCL": {
    label: "CRCL",
    name: "Circle",
    category: "equity",
    priceDecimals: 2,
    quantityDecimals: 4,
  },
  "xyz:TSLA": {
    label: "TSLA",
    name: "Tesla",
    category: "equity",
    priceDecimals: 2,
    quantityDecimals: 4,
  },
  "xyz:GOLD": {
    label: "GOLD",
    name: "Gold",
    category: "commodity",
    priceDecimals: 2,
    quantityDecimals: 4,
  },
  "xyz:CL": {
    label: "CL",
    name: "Crude Oil",
    category: "commodity",
    priceDecimals: 2,
    quantityDecimals: 4,
  },
  "xyz:NVDA": {
    label: "NVDA",
    name: "NVIDIA",
    category: "equity",
    priceDecimals: 2,
    quantityDecimals: 4,
  },
  "xyz:MU": {
    label: "MU",
    name: "Micron",
    category: "equity",
    priceDecimals: 2,
    quantityDecimals: 4,
  },
};

const FALLBACK_BUILDER_MARKET: Omit<MarketDefinition, "symbol" | "quote"> = {
  label: "UNKNOWN",
  name: "Builder perp",
  category: "equity",
  priceDecimals: 2,
  quantityDecimals: 4,
};

export const MARKET_DEFINITIONS: MarketDefinition[] = SUPPORTED_MARKETS.map((symbol) =>
  defineMarket(symbol),
);

export function defineMarket(symbol: MarketSymbol): MarketDefinition {
  const metadata = MARKET_METADATA[symbol];
  return { symbol, quote: "USDC", ...metadata };
}

export function getMarketDefinition(symbol: string): MarketDefinition {
  if (isSupportedMarket(symbol)) return defineMarket(symbol);

  if (symbol.startsWith("xyz:")) {
    const label = symbol.slice(4);
    return {
      symbol: symbol as MarketSymbol,
      quote: "USDC",
      ...FALLBACK_BUILDER_MARKET,
      label,
      name: label,
    };
  }

  return {
    symbol: symbol as MarketSymbol,
    quote: "USDC",
    label: symbol,
    name: symbol,
    category: "crypto",
    priceDecimals: 4,
    quantityDecimals: 4,
  };
}

export function isSupportedMarket(symbol: string): symbol is MarketSymbol {
  return (SUPPORTED_MARKETS as readonly string[]).includes(symbol);
}

export function formatMarketSymbol(symbol: string): string {
  return getMarketDefinition(symbol).label;
}

export function formatMarketPair(symbol: string): string {
  const definition = getMarketDefinition(symbol);
  return `${definition.label}/${definition.quote}`;
}

export function formatMarketDescription(symbol: string): string {
  const definition = getMarketDefinition(symbol);
  return `${categoryLabel(definition.category)} perp`;
}

export function getMarketPriceDecimals(symbol: string): number {
  return getMarketDefinition(symbol).priceDecimals;
}

export function getMarketQuantityDecimals(symbol: string): number {
  return getMarketDefinition(symbol).quantityDecimals;
}

export function isBuilderMarket(symbol: string): boolean {
  return symbol.startsWith("xyz:");
}

export function categoryLabel(category: MarketCategory): string {
  switch (category) {
    case "crypto":
      return "Crypto";
    case "equity":
      return "Equity";
    case "pre_ipo":
      return "Pre-IPO";
    case "commodity":
      return "Commodity";
    case "index":
      return "Index";
    case "fx":
      return "FX";
  }
}
