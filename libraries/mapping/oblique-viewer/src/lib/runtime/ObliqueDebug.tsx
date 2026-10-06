import { useEffect, useRef } from "react";
import { DiagnosticPanel } from "@carma-mapping/tile-diagnostics-ui";
import type { createPhotoAxisPicker } from "./utils/photo-axis-picker";

/** Live values use a DOM subscription, keeping pointer updates out of the viewer's React tree. */
export default function ObliqueDebug({
  picker,
}: {
  picker: ReturnType<typeof createPhotoAxisPicker>;
}) {
  const distance = useRef<HTMLOutputElement>(null);
  const image = useRef<HTMLOutputElement>(null);
  useEffect(
    () =>
      picker.subscribe((value) => {
        if (distance.current)
          distance.current.textContent = value
            ? value.distance.toLocaleString("de-DE", {
                maximumFractionDigits: 2,
              }) + " m"
            : "—";
        if (image.current)
          image.current.textContent = value
            ? value.seriesId +
              " · " +
              value.imageId +
              " (" +
              value.surface +
              ")"
            : "Kein Oberflächentreffer";
      }),
    [picker]
  );
  return (
    <div style={{ pointerEvents: "auto" }}>
      <DiagnosticPanel
        title="Schrägluftbilder · Debug"
        defaultPosition={{ left: 60, top: 300 }}
        testId="oblique-viewer-debug"
      >
        <div
          style={{
            padding: 8,
            font: "12px system-ui",
            display: "grid",
            gap: 4,
          }}
        >
          <span>Zeiger → Kameraachse auf Oberfläche</span>
          <output ref={distance} data-test-id="oblique-axis-distance">
            —
          </output>
          <output ref={image} />
        </div>
      </DiagnosticPanel>
    </div>
  );
}
