import { clamp, isFiniteNumber } from "@carma/math";
import { degToRadNumeric, radToDegNumeric } from "@carma/units/helpers";

export { clamp, isFiniteNumber, isZeroish } from "@carma/math";
export {
  degToRadNumeric,
  negativeOneEightyToOneEighty,
  negativePiToPi,
  radToDegNumeric,
  zeroToThreeSixty,
  zeroToTwoPi,
} from "@carma/units/helpers";

export const formatNumber = (
  value: number | undefined,
  fixedDigits: number
): string | undefined => {
  if (!isFiniteNumber(value)) {
    return undefined;
  }

  return parseFloat(value.toFixed(fixedDigits)).toString();
};

export const toDelimitedField = (
  value: number | undefined,
  fixedDigits: number
): string => formatNumber(value, fixedDigits) ?? "";

export const decodeField = (value: string | undefined): number | undefined => {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export const encodeAngleDeg = (
  rad: number | undefined,
  fixedDigits: number
): string => {
  if (!isFiniteNumber(rad)) {
    return "";
  }

  return formatNumber(radToDegNumeric(rad)!, fixedDigits) ?? "";
};

export const decodeAngleRad = (
  field: string | undefined
): number | undefined => {
  const deg = decodeField(field);
  return isFiniteNumber(deg) ? degToRadNumeric(deg)! : undefined;
};
