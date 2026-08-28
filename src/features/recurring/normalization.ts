import type { NormalizationMode } from "@/features/recurring/constants";

export function getEffectiveNormalizationMode(input: {
  mode: NormalizationMode;
  currency: string;
  workspaceCurrency: string;
}): NormalizationMode {
  return input.currency.trim().toUpperCase() === input.workspaceCurrency.trim().toUpperCase()
    ? "none"
    : input.mode;
}
