import { sql, type SQLWrapper } from "drizzle-orm";
import { transactions } from "@/db/schema";

// Imports store magnitudes and direction separately. A confirmed refund booked
// against spending reduces that category; income retains the credited amount.
export function reportedTransactionAmount(classification: SQLWrapper) {
  return sql<string>`case when ${transactions.refundOfTransactionId} is not null
    and ${classification} in ('shared','personal') then -${transactions.normalizedAmount}
    else ${transactions.normalizedAmount} end`;
}
