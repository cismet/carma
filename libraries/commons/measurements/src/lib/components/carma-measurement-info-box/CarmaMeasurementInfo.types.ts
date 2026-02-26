import type { ReactNode } from "react";

export type CarmaMeasurementInfoBoxPayload = {
  pixelWidth: number;
  headingColor: string;
  headingTitle: string;
  collapsible: boolean;
  footer: ReactNode;
  subtitle: ReactNode;
  content: ReactNode;
};
