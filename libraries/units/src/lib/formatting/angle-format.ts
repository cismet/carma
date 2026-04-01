import type { Degrees } from "../base/angles";

import {
  formatDecimalNumber,
  type FormatDecimalNumberOptions,
} from "./decimal-format";
export type FormatDegreesOptions = FormatDecimalNumberOptions & {
  unitSymbol?: string | false;
};

const DEFAULT_ANGLE_UNIT_SYMBOL = "°";

export const formatDegrees = (
  value: Degrees | number,
  options?: FormatDegreesOptions
): string => {
  const unitSymbol =
    options?.unitSymbol === undefined
      ? DEFAULT_ANGLE_UNIT_SYMBOL
      : options.unitSymbol;
  const numberText = formatDecimalNumber(value as number, options);

  if (unitSymbol === false) {
    return numberText;
  }

  return `${numberText}${unitSymbol}`;
};
