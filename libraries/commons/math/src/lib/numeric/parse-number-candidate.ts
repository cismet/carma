export const parseNumberCandidate = (value: unknown): number | undefined => {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    return Number(value);
  }

  return undefined;
};
