import { FORMAT_LOCALE } from "./locales";

export type SignificantNumberFormatOptions = {
  significantDigits?: number;
  locale?: Intl.LocalesArgument;
};

const DEFAULT_SIGNIFICANT_DIGITS = 3;
const DEFAULT_LOCALE = FORMAT_LOCALE.DE_DE;

const clampSignificantDigits = (value: number): number =>
  Math.max(1, Math.min(12, Math.floor(value)));

const readSignificantDigits = (
  options?: SignificantNumberFormatOptions
): number => {
  const candidate = options?.significantDigits;
  if (typeof candidate === "number" && Number.isFinite(candidate)) {
    return clampSignificantDigits(candidate);
  }

  return DEFAULT_SIGNIFICANT_DIGITS;
};

export const formatSignificantNumber = (
  value: number,
  options?: SignificantNumberFormatOptions
): string => {
  if (!Number.isFinite(value)) {
    return "0";
  }

  const absolute = Math.abs(value);
  if (absolute === 0) {
    return "0";
  }

  const significantDigits = readSignificantDigits(options);
  const digitsBeforeDecimal = Math.floor(Math.log10(absolute)) + 1;
  const fractionDigits = Math.max(0, significantDigits - digitsBeforeDecimal);

  return value.toLocaleString(options?.locale ?? DEFAULT_LOCALE, {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
    useGrouping: false,
  });
};
