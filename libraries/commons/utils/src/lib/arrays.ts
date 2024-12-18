export const isNumberArrayEqual = (a: number[], b: number[]) => {
  return a.length === b.length && a.every((v, i) => v === b[i]);
};
