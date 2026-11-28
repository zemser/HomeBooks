import { createHash } from "node:crypto";
import type { ParsedBankTransaction, ParsedBankStatement } from "./types";
import { INFER_ORIGINAL_CURRENCY_CANDIDATES } from "@/features/currency/seed-boi-monthly-averages";

type IdentityInput = {
  workspaceId: string;
  sourceId: string;
  accountLabel: string;
  transaction: ParsedBankTransaction;
};

function buildTransactionDedupeHash(input: IdentityInput) {
  const { transaction } = input;

  return createHash("sha256")
    .update(
      JSON.stringify({
        workspaceId: input.workspaceId,
        sourceId: input.sourceId,
        accountLabel: input.accountLabel,
        transactionDate: transaction.transactionDate,
        bookingDate: transaction.bookingDate ?? null,
        merchantRaw: transaction.merchantRaw,
        description: transaction.description,
        originalAmount: transaction.originalAmount,
        originalCurrency: transaction.originalCurrency,
        settlementAmount: transaction.settlementAmount ?? null,
        settlementCurrency: transaction.settlementCurrency ?? null,
        statementSection: transaction.statementSection ?? null,
        direction: transaction.direction,
      }),
    )
    .digest("hex");
}

export function transactionIdentity(
  input: IdentityInput,
  template: ParsedBankStatement["templateId"],
) {
  const { transaction } = input;
  const isMax = template === "max_credit_statement";
  const fixed = {
    ...input,
    transaction: {
      ...transaction,
      originalCurrency: isMax ? null : transaction.originalCurrency,
    },
  };
  const stableHash = buildTransactionDedupeHash(fixed);
  const hash =
    "v2:" +
    createHash("sha256")
      .update(
        JSON.stringify([
          template,
          stableHash,
          transaction.cardLastFour ?? null,
        ]),
      )
      .digest("hex");
  // Old Max keys incorporated inferred currency. All historical inference outcomes
  // are valid aliases even when today's cache would choose a different outcome.
  const legacyCurrencies = isMax
    ? new Set([
        null,
        ...INFER_ORIGINAL_CURRENCY_CANDIDATES,
        transaction.settlementCurrency ?? null,
      ])
    : [transaction.originalCurrency];
  const aliases = Array.from(legacyCurrencies, (originalCurrency) =>
    buildTransactionDedupeHash({
      ...input,
      transaction: { ...transaction, originalCurrency },
    }),
  );
  // Previously a missing Cal currency or an unknown Max section was stored as
  // ILS. Match that original encoding as well when the current parser flags it.
  if (!transaction.settlementCurrency) {
    for (const originalCurrency of new Set([...legacyCurrencies, "ILS"])) {
      aliases.push(
        buildTransactionDedupeHash({
          ...input,
          transaction: {
            ...transaction,
            settlementCurrency: "ILS",
            originalCurrency,
          },
        }),
      );
    }
  }
  return { hash, aliases: [...new Set(aliases)] };
}
