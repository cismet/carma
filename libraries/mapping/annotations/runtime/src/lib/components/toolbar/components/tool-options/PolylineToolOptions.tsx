import { useEffect, useRef, useState } from "react";
import { Switch } from "antd";
import {
  LINEAR_SEGMENT_LINE_MODE_COMPONENTS,
  LINEAR_SEGMENT_LINE_MODE_DIRECT,
} from "@carma-mapping/annotations/core";
import { EditableMetricValue } from "@carma-commons/ui/components";
import type { AnnotationToolbarPolylineProps } from "../../AnnotationModeToolbar.types";
import { optionsLabelStyle } from "../../shared";
import { ToolOptionsSection } from "./ToolOptionsSection";
import { renderHelpContent } from "./shared";

type PolylineToolOptionsProps = {
  polyline?: AnnotationToolbarPolylineProps;
  helpCollapsed: boolean;
  onHelpCollapsedChange: (collapsed: boolean) => void;
};

export function PolylineToolOptions({
  polyline,
  helpCollapsed,
  onHelpCollapsedChange,
}: PolylineToolOptionsProps) {
  const {
    verticalOffsetMeters = 0,
    onVerticalOffsetChange,
    segmentLineMode = LINEAR_SEGMENT_LINE_MODE_COMPONENTS,
    onSegmentLineModeChange,
  } = polyline ?? {};
  const [offsetForceCloseSignal, setOffsetForceCloseSignal] = useState(0);
  const lastVerticalOffsetRef = useRef(1);
  const verticalOffsetEnabled = Math.abs(verticalOffsetMeters) > 1e-9;

  useEffect(() => {
    if (!verticalOffsetEnabled) return;
    lastVerticalOffsetRef.current = verticalOffsetMeters;
  }, [verticalOffsetEnabled, verticalOffsetMeters]);

  return (
    <ToolOptionsSection
      dataTestId="measurement-polyline-options"
      helpDataTestId="measurement-polyline-help"
      helpCollapsed={helpCollapsed}
      onHelpCollapsedChange={onHelpCollapsedChange}
      helpContent={renderHelpContent([
        "Klicken setzt Stützpunkte des Polygonzugs.",
        "Doppelklick beendet den aktuellen Polygonzug.",
        "Vertikalversatz verschiebt die Darstellung entlang der lokalen Up-Achse.",
        "Segmentdarstellung wechselt zwischen Direktlinie und Komponenten.",
      ])}
    >
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          flexWrap: "wrap",
        }}
      >
        <span style={optionsLabelStyle}>Vertikalversatz</span>
        <Switch
          size="small"
          checked={verticalOffsetEnabled}
          onChange={(checked) => {
            if (!checked) {
              if (Math.abs(verticalOffsetMeters) > 1e-9) {
                lastVerticalOffsetRef.current = verticalOffsetMeters;
              }
              onVerticalOffsetChange?.(0);
              setOffsetForceCloseSignal((prev) => prev + 1);
              return;
            }

            const restoredOffset =
              Math.abs(lastVerticalOffsetRef.current) > 1e-9
                ? lastVerticalOffsetRef.current
                : 1;
            onVerticalOffsetChange?.(restoredOffset);
          }}
          data-test-id="measurement-polyline-vertical-offset-enabled-toggle"
          aria-label="Polyline-Vertikalversatz aktivieren"
        />
        {verticalOffsetEnabled && (
          <EditableMetricValue
            value={verticalOffsetMeters}
            onValueChange={(nextValue) => onVerticalOffsetChange?.(nextValue)}
            label="Polyline-Vertikalversatz"
            locale="de-DE"
            decimalSeparator=","
            min={-100}
            max={100}
            step={1}
            precision={2}
            inputWidth={88}
            inputClassName="measurement-elevation-input"
            dataTestIdPrefix="measurement-polyline-vertical-offset"
            forceCloseSignal={offsetForceCloseSignal}
          />
        )}
      </div>
      <div
        style={{
          display: "inline-flex",
          gap: 6,
          alignItems: "center",
        }}
      >
        <span style={optionsLabelStyle}>Segmentdarstellung</span>
        <span style={optionsLabelStyle}>Direkt</span>
        <Switch
          size="small"
          checked={segmentLineMode === LINEAR_SEGMENT_LINE_MODE_COMPONENTS}
          onChange={(checked) =>
            onSegmentLineModeChange?.(
              checked
                ? LINEAR_SEGMENT_LINE_MODE_COMPONENTS
                : LINEAR_SEGMENT_LINE_MODE_DIRECT
            )
          }
          aria-label="Polyline-Segmentdarstellung umschalten"
          data-test-id="measurement-polyline-line-mode-toggle"
        />
        <span style={optionsLabelStyle}>Komponenten</span>
      </div>
    </ToolOptionsSection>
  );
}
