export const ANNOTATION_THEME_STYLE = {
  DARK_ON_BRIGHT: "dark-on-bright",
  BRIGHT_ON_DARK: "bright-on-dark",
} as const;

export type AnnotationThemeStyle =
  (typeof ANNOTATION_THEME_STYLE)[keyof typeof ANNOTATION_THEME_STYLE];
