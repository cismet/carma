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

export const fromAlphabeticSequence = (token: string): number | null => {
  const normalized = token.trim().toUpperCase();
  if (!/^[A-Z]+$/.test(normalized)) return null;

  let value = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    const charCode = normalized.charCodeAt(index);
    if (charCode < 65 || charCode > 90) return null;
    value = value * 26 + (charCode - 64);
  }
  return value - 1;
};
