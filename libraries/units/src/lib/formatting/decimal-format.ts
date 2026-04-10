import { FORMAT_LOCALE } from "./locales";

export type FormatDecimalNumberOptions = {
  fractionDigits?: number;
  locale?: Intl.LocalesArgument;
  useGrouping?: boolean;
};

const DEFAULT_DECIMAL_LOCALE = FORMAT_LOCALE.DE_DE;
const DEFAULT_DECIMAL_FRACTION_DIGITS = 2;

const clampFractionDigits = (value: number): number =>
  Math.max(0, Math.min(12, Math.floor(value)));

const readFractionDigits = (options?: FormatDecimalNumberOptions): number => {
  const candidate = options?.fractionDigits;
  if (typeof candidate === "number" && Number.isFinite(candidate)) {
    return clampFractionDigits(candidate);
  }

  return DEFAULT_DECIMAL_FRACTION_DIGITS;
};

export const formatDecimalNumber = (
  value: number,
  options?: FormatDecimalNumberOptions
): string => {
  if (!Number.isFinite(value)) {
    return String(value);
  }

  const fractionDigits = readFractionDigits(options);

  return new Intl.NumberFormat(options?.locale ?? DEFAULT_DECIMAL_LOCALE, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
    useGrouping: options?.useGrouping ?? false,
  }).format(value);
};
