import { useEffect, useRef, useState } from "react";
import { Switch, Tooltip } from "antd";
import { EditableMetricValue } from "@carma-commons/ui/components";
import { LINEAR_SEGMENT_LINE_MODES } from "@carma-mapping/annotations/core";
import type { AnnotationToolbarPolylineProps } from "../../annotation-mode-toolbar.types";
import { optionsLabelStyle } from "../../shared";
import { annotationTooltipProps } from "../../../shared/annotation-tooltip";
import {
  SEGMENT_LINE_MODE_OPTIONS,
  segmentLineModeOptionButtonStyle,
} from "./segment-line-mode-options";
import { ToolOptionsSection } from "./ToolOptionsSection";
const {
  COMPONENTS: LINEAR_SEGMENT_LINE_MODE_COMPONENTS,
  DIRECT: LINEAR_SEGMENT_LINE_MODE_DIRECT,
} = LINEAR_SEGMENT_LINE_MODES;

type PolylineToolOptionsProps = {
  polyline?: AnnotationToolbarPolylineProps;
};

export function PolylineToolOptions({ polyline }: PolylineToolOptionsProps) {
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
    <ToolOptionsSection dataTestId="measurement-polyline-options">
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
      <span
        style={{
          width: 1,
          height: 22,
          backgroundColor: "rgba(0, 0, 0, 0.12)",
          margin: "0 2px",
        }}
        aria-hidden="true"
      />
      <div
        role="radiogroup"
        aria-label="Polyline-Segmentdarstellung auswählen"
        data-test-id="measurement-polyline-line-mode-toggle"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        {SEGMENT_LINE_MODE_OPTIONS.map(({ mode, label, tooltip, icon }) => {
          const isActive = segmentLineMode === mode;
          return (
            <Tooltip {...annotationTooltipProps} key={mode} title={tooltip}>
              <button
                type="button"
                role="radio"
                aria-checked={isActive}
                aria-label={`${label} ${isActive ? "aktiv" : "aktivieren"}`}
                onClick={() => onSegmentLineModeChange?.(mode)}
                data-test-id={`measurement-polyline-line-mode-${mode}`}
                style={segmentLineModeOptionButtonStyle(isActive)}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 14,
                    height: 14,
                  }}
                  aria-hidden="true"
                >
                  {icon}
                </span>
              </button>
            </Tooltip>
          );
        })}
      </div>
    </ToolOptionsSection>
  );
}
