import { useCallback, useEffect, useMemo } from "react";
import type { CssPixels } from "@carma-units";
import { ObliqueObjectCoverage } from "../ObliqueObjectCoverage";
import { ObliqueOverlay } from "../ObliqueOverlay";
import { ObliqueObjectResultWindow } from "./ObliqueObjectResultWindow";
import { useObjectCoverage } from "../hooks/useObjectCoverage";
import type { ObliqueViewerExtensionProps } from "../oblique-viewer-extensions";

/** Optional object-view query runtime; the host viewer owns camera transitions. */
export default function ObliqueObjectViews({
  map,
  data,
  resetToken,
  heightOffset,
  suspended,
  surfacePicker,
  surfaceMode,
  readViewAnchor,
  onControllerChange,
  onReset,
  onCancel,
  onOpen,
}: ObliqueViewerExtensionProps) {
  const readAnchor = useCallback(
    (point: { x: number; y: number }) =>
      readViewAnchor({
        x: point.x as CssPixels,
        y: point.y as CssPixels,
      }),
    [readViewAnchor]
  );
  const coverage = useObjectCoverage({
    map,
    data,
    resetToken,
    heightOffset,
    suspended,
    enabled: true,
    readViewAnchor: readAnchor,
    onCancel,
  });
  const controller = useMemo(
    () => ({ reset: coverage.reset }),
    [coverage.reset]
  );
  useEffect(() => {
    onControllerChange(controller);
    return () => onControllerChange(null);
  }, [controller, onControllerChange]);
  return (
    <>
      {coverage.sphere && (
        <ObliqueObjectResultWindow onClose={onCancel}>
          <ObliqueObjectCoverage
            embedded
            map={map}
            surfacePicker={surfacePicker}
            surfaceMode={surfaceMode}
            sphere={coverage.sphere}
            groups={coverage.groups}
            loading={coverage.loading}
            onOpen={(imageId) => {
              window.focus();
              onOpen(imageId);
            }}
            onReset={onReset}
            onCancel={onCancel}
          />
        </ObliqueObjectResultWindow>
      )}
      <ObliqueOverlay map={map}>
        {(!coverage.sphere || coverage.error) && (
          <div
            data-oblique-coverage-ui="true"
            aria-live="polite"
            style={{
              position: "absolute",
              top: 12,
              left: "50%",
              transform: "translateX(-50%)",
              display: "flex",
              alignItems: "center",
              gap: 8,
              maxWidth: "90%",
              padding: "8px 12px",
              borderRadius: 6,
              background: "white",
              boxShadow: "0 2px 8px #0004",
              pointerEvents: "auto",
              zIndex: 5,
            }}
          >
            <span role="status">
              {coverage.error ??
                (coverage.center
                  ? "Zweiten Punkt für den Kugelradius wählen."
                  : "Objektmittelpunkt auf der Karte wählen.")}
            </span>
            {coverage.center && !coverage.sphere && (
              <button type="button" onClick={onReset}>
                Neu wählen
              </button>
            )}
            <button type="button" onClick={onCancel}>
              Schließen
            </button>
          </div>
        )}
      </ObliqueOverlay>
    </>
  );
}
