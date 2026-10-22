export const POINT_EDITING_GIZMO_DEFAULTS = {
  referenceNodeInteractionReleaseGuardMs: 48,
  /** React readouts (area, length, counts) are paced to ~5 Hz; live geometry tracks the pointer every frame via liveAnchors. */
  draftPreviewFlushIntervalMs: 200,
  labels: {
    verticalAxis: "Punkt entlang der U-Achse verschieben",
    eastAxis: "Punkt entlang der E-Achse verschieben",
    northAxis: "Punkt entlang der N-Achse verschieben",
    genericAxis: "Punkt entlang der Achse verschieben",
    outerDisc: "Punkt auf Höhenebene verschieben",
    surfacePlane: "Punkt auf Oberfläche verschieben",
    freePlane: "Punkt in der Ebene verschieben",
  },
  referenceLineAxis: {
    primary: {
      id: "reference-line-parallel",
      color: "rgba(59, 130, 246, 0.98)",
      title: "Punkt parallel zur Referenzlinie verschieben",
    },
    secondary: {
      id: "reference-line-secondary",
      color: "rgba(34, 197, 94, 0.98)",
      title: "Punkt orthogonal zur Referenzlinie verschieben",
    },
    tertiary: {
      id: "reference-line-tertiary",
      color: "rgba(239, 68, 68, 0.98)",
      title: "Punkt entlang der aktiven Referenzebene verschieben",
    },
  },
} as const;
