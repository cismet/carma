const LINEAR_SEGMENT_LINE_MODES = {
  DIRECT: "direct",
  COMPONENTS: "components",
} as const;

export type LinearSegmentLineMode =
  (typeof LINEAR_SEGMENT_LINE_MODES)[keyof typeof LINEAR_SEGMENT_LINE_MODES];
