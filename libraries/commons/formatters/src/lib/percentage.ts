export const formatUnitRangeToPercent = (value?: number, digits = 2) =>
  value ? `${parseFloat((value * 100).toFixed(digits))}%` : `k.A.`;
