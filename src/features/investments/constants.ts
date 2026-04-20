export const EXCELLENCE_PROVIDER_ID = "excellence" as const;

export const EXCELLENCE_HOLDINGS_HEADER = [
  "שם נייר",
  "מספר נייר",
  "שער אחרון",
  "כמות בתיק",
  "שווי אחזקה (₪)",
  "שווי במטבע",
  "שינוי יומי %",
  "שינוי יומי במטבע",
  "שער עלות",
  "שינוי מעלות %",
  "שינוי מעלות במטבע",
  "שינוי מעלות (₪)",
  "נתח מהתיק",
  "כמות מושאלת",
  "המלצת AI",
  "דרוג AI",
  "הערה אישית",
] as const;

export const EXCELLENCE_HOLDING_COLUMN = {
  assetName: 0,
  securityId: 1,
  lastPrice: 2,
  quantity: 3,
  marketValueIls: 4,
  marketValueNative: 5,
  dailyChangePct: 6,
  dailyChangeNative: 7,
  costBasisPrice: 8,
  gainLossPct: 9,
  gainLossNative: 10,
  gainLossIls: 11,
  portfolioWeightPct: 12,
  loanedQuantity: 13,
  aiRecommendation: 14,
  aiScore: 15,
  personalNote: 16,
} as const;

export const EXCELLENCE_ACTIVITY_HEADER = [
  "שם נייר",
  "מספר נייר",
  "פעולה",
  "תאריך הזנה",
  "תאריך נכונות",
  "כמות",
  "שער",
  "שער המרה",
  'סכום מס בחו"ל',
  "סכום מס ישראל",
  "אחוז מס",
  "שווי כולל",
  "שווי כולל בשקלים",
  "עמלה",
] as const;

export const EXCELLENCE_ACTIVITY_COLUMN = {
  assetName: 0,
  securityId: 1,
  action: 2,
  entryDate: 3,
  effectiveDate: 4,
  quantity: 5,
  unitPrice: 6,
  conversionRate: 7,
  foreignTaxAmount: 8,
  localTaxAmount: 9,
  taxPercent: 10,
  totalAmount: 11,
  totalAmountIls: 12,
  commission: 13,
} as const;

export const EXCELLENCE_ACCOUNT_PREFIX = "חשבון:";
export const EXCELLENCE_FILE_DATE_PREFIX = "תאריך הפקת הקובץ:";
export const EXCELLENCE_DATA_DATE_PREFIX = "תאריך נכונות הנתונים:";
export const EXCELLENCE_PERIOD_PREFIX = "תאריכים הנכללים בתקופה:";
