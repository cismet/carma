import { useEffect, useRef, useState } from "react";
import { Switch } from "antd";
import { EditableMetricValue } from "@carma-commons/ui/components";
import type { AnnotationToolbarPointProps } from "../../AnnotationModeToolbar.types";
import { optionsLabelStyle } from "../../shared";
import { ToolOptionsSection } from "./ToolOptionsSection";
import { renderHelpContent } from "./shared";

type PointToolOptionsProps = {
  point?: AnnotationToolbarPointProps;
  helpCollapsed: boolean;
  onHelpCollapsedChange: (collapsed: boolean) => void;
};

export function PointToolOptions({
  point,
  helpCollapsed,
  onHelpCollapsedChange,
}: PointToolOptionsProps) {
  const {
    verticalOffsetMeters = 0,
    onVerticalOffsetChange,
    soloMode = false,
    onSoloModeChange,
  } = point ?? {};
  const [offsetForceCloseSignal, setOffsetForceCloseSignal] = useState(0);
  const lastVerticalOffsetRef = useRef(1);
  const verticalOffsetEnabled = Math.abs(verticalOffsetMeters) > 1e-9;

  useEffect(() => {
    if (!verticalOffsetEnabled) return;
    lastVerticalOffsetRef.current = verticalOffsetMeters;
  }, [verticalOffsetEnabled, verticalOffsetMeters]);

  return (
    <ToolOptionsSection
      dataTestId="measurement-point-options"
      helpDataTestId="measurement-point-help"
      helpCollapsed={helpCollapsed}
      onHelpCollapsedChange={onHelpCollapsedChange}
      helpContent={renderHelpContent([
        "Für Punktmessungen auf das Stadtmodell klicken. Die erste Messung definiert die Referenzhöhe.",
        "Klicken um Höhenmessung zu setzen.",
        "Doppelklick auf Punkt setzt Referenzhöhe.",
        "Langer Klick startet Editiermodus.",
        "Rückstelltaste löscht den letzten Punkt.",
      ])}
    >
      <div
        style={{
          display: "inline-flex",
          gap: 4,
          alignItems: "center",
        }}
      >
        <span style={optionsLabelStyle}>Temporär/Solo</span>
        <Switch
          size="small"
          checked={soloMode}
          onChange={(checked) => onSoloModeChange?.(checked)}
          aria-label="Temporär/Solo"
          data-test-id="measurement-point-solo-toggle"
        />
      </div>
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
          data-test-id="measurement-point-vertical-offset-enabled-toggle"
          aria-label="Vertikalversatz aktivieren"
        />
        {verticalOffsetEnabled && (
          <EditableMetricValue
            value={verticalOffsetMeters}
            onValueChange={(nextValue) => onVerticalOffsetChange?.(nextValue)}
            label="Vertikalversatz"
            locale="de-DE"
            decimalSeparator=","
            min={-100}
            max={100}
            step={1}
            precision={2}
            inputWidth={88}
            inputClassName="measurement-elevation-input"
            dataTestIdPrefix="measurement-point-vertical-offset"
            forceCloseSignal={offsetForceCloseSignal}
          />
        )}
      </div>
    </ToolOptionsSection>
  );
}
