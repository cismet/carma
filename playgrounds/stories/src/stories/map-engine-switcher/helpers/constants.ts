const RESOLUTION_SCALE_OPTIONS = [
  [1 / 8, "1/8"],
  [1 / 4, "1/4"],
  [1 / 3, "1/3"],
  [1 / 2, "1/2"],
  [2 / 3, "2/3"],
  // workaround to match lexical order with zero-width space
  [1, "\u200B1"],
  [1.5, "1.5"],
  [2, "\u200B2"],
  [3, "\u200B3"],
  [4, "\u200B4"],
];

// convenience object for easy access to values and labels for storybook
export const RESOLUTION_SCALE = {
  options: RESOLUTION_SCALE_OPTIONS.map(([value]) => value),
  labels: RESOLUTION_SCALE_OPTIONS.reduce((acc, [value, label]) => {
    acc[value] = label;
    return acc;
  }, {} as Record<number, string>),
} as const;
