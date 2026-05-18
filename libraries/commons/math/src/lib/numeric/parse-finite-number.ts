import { isFiniteNumber } from "./is-finite-number";
import { parseNumberCandidate } from "./parse-number-candidate";

export const parseFiniteNumber = (value: unknown): number | undefined => {
  const parsed = parseNumberCandidate(value);
  return isFiniteNumber(parsed) ? parsed : undefined;
};
