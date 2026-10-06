import { lazy } from "react";
import type { ObliqueViewerExtension } from "../oblique-viewer-extensions";

/** Loaded only when its host addon supplies the mode and the user opens it. */
export const OBLIQUE_OBJECT_VIEWS_EXTENSION: ObliqueViewerExtension = {
  mode: "objectCoverage",
  label: "Objektansichtenabfrage",
  Component: lazy(() => import("./ObliqueObjectViews")),
};
