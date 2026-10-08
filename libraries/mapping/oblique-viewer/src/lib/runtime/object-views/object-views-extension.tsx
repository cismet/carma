import { lazy } from "react";
import { faCrosshairs } from "@fortawesome/free-solid-svg-icons";
import type { ObliqueViewerExtension } from "../oblique-viewer-extensions";

/** Loaded only when its host addon supplies the mode and the user opens it. */
export const OBLIQUE_OBJECT_VIEWS_EXTENSION: ObliqueViewerExtension = {
  mode: "objectCoverage",
  label: "Objektansichtenabfrage",
  icon: faCrosshairs,
  Component: lazy(() => import("./ObliqueObjectViews")),
};
