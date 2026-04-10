export const FORMAT_LOCALE = {
  DE_DE: "de-DE",
  EN_US: "en-US",
} as const;

export type FormatLocale = (typeof FORMAT_LOCALE)[keyof typeof FORMAT_LOCALE];
