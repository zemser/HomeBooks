import type {
  InvestmentAssetType,
  InvestmentAssetTypeSource,
} from "@/features/investments/types";

const CASH_PATTERNS = [
  /\bcash\b/i,
  /\bmoney market\b/i,
  /כספ/u,
  /מזומן/u,
  /פיקדון/u,
  /\bdeposit\b/i,
];

const BOND_PATTERNS = [
  /\bbond\b/i,
  /\btreasury\b/i,
  /אג["׳']?ח/u,
  /גוב/u,
  /\bcorp(?:orate)? bond\b/i,
];

const INDEX_PATTERNS = [
  /\betf\b/i,
  /\bucits\b/i,
  /\bindex\b/i,
  /\bs&p\b/i,
  /\bnasdaq\b/i,
  /\bmsci\b/i,
  /\bacwi\b/i,
  /\bstoxx\b/i,
  /\bftse\b/i,
  /מחקה/u,
  /מדד/u,
  /\btracker\b/i,
  /\bselect\b/i,
  /סל/u,
];

const FUND_PATTERNS = [
  /\bfund\b/i,
  /\btrust\b/i,
  /קרן/u,
  /אקטיב/u,
  /\bactive\b/i,
];

const STOCK_PATTERNS = [
  /\binc\b/i,
  /\bcorp\b/i,
  /\bco\b/i,
  /\bplc\b/i,
  /\bltd\b/i,
  /\bnv\b/i,
  /\bclass\b/i,
  /\bcl\b/i,
  /\bgroup\b/i,
  /\bholdings?\b/i,
  /\breg shs\b/i,
];

function matchesAny(value: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(value));
}

function normalizeClassifierInput(assetName: string, assetSymbol: string | null) {
  return [assetName, assetSymbol ?? ""]
    .join(" ")
    .normalize("NFKC")
    .trim();
}

export function inferInvestmentAssetType(
  assetName: string,
  assetSymbol: string | null,
): InvestmentAssetType {
  const normalized = normalizeClassifierInput(assetName, assetSymbol);

  if (!normalized) {
    return "other";
  }

  if (matchesAny(normalized, CASH_PATTERNS)) {
    return "cash";
  }

  if (matchesAny(normalized, BOND_PATTERNS)) {
    return "bond";
  }

  if (matchesAny(normalized, INDEX_PATTERNS)) {
    return "index";
  }

  if (matchesAny(normalized, FUND_PATTERNS)) {
    return "fund";
  }

  if (matchesAny(normalized, STOCK_PATTERNS)) {
    return "stock";
  }

  return "other";
}

export function resolveInvestmentAssetType(input: {
  assetName: string;
  assetSymbol: string | null;
  storedAssetType: InvestmentAssetType;
}): {
  assetType: InvestmentAssetType;
  assetTypeSource: InvestmentAssetTypeSource;
} {
  if (input.storedAssetType !== "other") {
    return {
      assetType: input.storedAssetType,
      assetTypeSource: "saved",
    };
  }

  const inferredAssetType = inferInvestmentAssetType(
    input.assetName,
    input.assetSymbol,
  );

  if (inferredAssetType === "other") {
    return {
      assetType: "other",
      assetTypeSource: "saved",
    };
  }

  return {
    assetType: inferredAssetType,
    assetTypeSource: "estimated",
  };
}

export function getInvestmentAssetTypeLabel(assetType: InvestmentAssetType) {
  switch (assetType) {
    case "cash":
      return "Cash";
    case "index":
      return "Index";
    case "stock":
      return "Stock";
    case "fund":
      return "Fund";
    case "bond":
      return "Bond";
    case "other":
      return "Other";
    default:
      return assetType;
  }
}
