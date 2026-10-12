export const toAlphabeticSequence = (zeroBasedIndex: number): string => {
  if (!Number.isFinite(zeroBasedIndex) || zeroBasedIndex < 0) return "A";
  let n = Math.floor(zeroBasedIndex);
  let out = "";
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
};
