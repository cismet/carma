export const ANNOTATION_TYPOGRAPHY_SAMPLE_IDS = {
  HEADING: "heading",
  ROOT_MEDIUM: "root-medium",
  ROOT_REGULAR: "root-regular",
  SUPPORT_SEMIBOLD: "support-semibold",
  SUPPORT_SUBTITLE: "support-subtitle",
  SUPPORT_REGULAR: "support-regular",
} as const;

export type AnnotationTypographySampleId =
  (typeof ANNOTATION_TYPOGRAPHY_SAMPLE_IDS)[keyof typeof ANNOTATION_TYPOGRAPHY_SAMPLE_IDS];

export type AnnotationTypographySample = Readonly<{
  id: AnnotationTypographySampleId;
  className: string;
  role: string;
  example: string;
  badgeContent?: string;
}>;

export const ANNOTATION_TYPOGRAPHY_SAMPLES: readonly AnnotationTypographySample[] =
  Object.freeze([
    {
      id: ANNOTATION_TYPOGRAPHY_SAMPLE_IDS.HEADING,
      className: "Heading",
      role: "Infobox heading",
      example: "Punktmessung 3",
    },
    {
      id: ANNOTATION_TYPOGRAPHY_SAMPLE_IDS.ROOT_MEDIUM,
      className: "Root / Medium",
      role: "Line labels, badge text",
      example: "168,00 m · NHN 179,27 m",
      badgeContent: "8",
    },
    {
      id: ANNOTATION_TYPOGRAPHY_SAMPLE_IDS.ROOT_REGULAR,
      className: "Root / Regular",
      role: "Infobox content",
      example: "24,41 m relative Höhe über Bezugspunkt",
    },
    {
      id: ANNOTATION_TYPOGRAPHY_SAMPLE_IDS.SUPPORT_SEMIBOLD,
      className: "Support / Semibold",
      role: "Header, section title",
      example: "Punktmessung · Referenzhöhe",
    },
    {
      id: ANNOTATION_TYPOGRAPHY_SAMPLE_IDS.SUPPORT_SUBTITLE,
      className: "Support / Subtitle",
      role: "Weight/opacity tradeoff for metadata",
      example: "51,272102°N 7,200488°O • NHN 179,27 m",
    },
    {
      id: ANNOTATION_TYPOGRAPHY_SAMPLE_IDS.SUPPORT_REGULAR,
      className: "Support / Regular",
      role: "Navigation, secondary UI",
      example: "3 von 20 Messungen",
    },
  ]);

export const readAnnotationTypographySample = (
  id: AnnotationTypographySampleId
): AnnotationTypographySample => {
  const sample = ANNOTATION_TYPOGRAPHY_SAMPLES.find((entry) => entry.id === id);

  if (!sample) {
    throw new Error(`Unknown annotation typography sample: ${id}`);
  }

  return sample;
};
