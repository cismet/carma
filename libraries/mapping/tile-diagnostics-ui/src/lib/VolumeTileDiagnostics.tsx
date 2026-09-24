import { lazy, Suspense } from "react";
import { loadTileDiagnostics } from "@carma-mapping/engines/maplibre";
import type { VolumeTileDiagnosticsProps } from "./VolumeTileDiagnosticsContent";

// Nothing of the diagnostic implementation is loaded until this is mounted.
const Content = lazy(() =>
  Promise.all([
    import("./VolumeTileDiagnosticsContent"),
    loadTileDiagnostics(),
  ]).then(([{ createVolumeTileDiagnostics }, diagnostics]) => ({
    default: createVolumeTileDiagnostics(diagnostics),
  }))
);

export const VolumeTileDiagnostics = (props: VolumeTileDiagnosticsProps) => (
  <Suspense fallback={null}>
    <Content {...props} />
  </Suspense>
);

export type { VolumeTileDiagnosticsProps } from "./VolumeTileDiagnosticsContent";
