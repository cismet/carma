import {
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_AREA_PLANAR,
  ANNOTATION_TYPE_AREA_VERTICAL,
} from "@carma-mapping/annotations/core";
import { optionsLabelStyle } from "../../shared";
import { ToolOptionsSection } from "./ToolOptionsSection";
import { renderHelpContent } from "./shared";

type AreaToolOptionsProps = {
  activeToolType:
    | typeof ANNOTATION_TYPE_AREA_GROUND
    | typeof ANNOTATION_TYPE_AREA_VERTICAL
    | typeof ANNOTATION_TYPE_AREA_PLANAR;
  helpCollapsed: boolean;
  onHelpCollapsedChange: (collapsed: boolean) => void;
};

const AREA_HELP_CONTENT = {
  [ANNOTATION_TYPE_AREA_GROUND]: [
    "Grundriss: Jeder Klick setzt einen Bodenpunkt; die Vorschau folgt dem Cursor auf dem Gelände.",
    "Klick auf Startpunkt oder Doppelklick schließt die Fläche.",
  ],
  [ANNOTATION_TYPE_AREA_VERTICAL]: [
    "Fassade: Der 1. Punkt startet die Fläche, der 2. Punkt erzeugt eine rechteckige Fassade mit Auto-Ecken.",
    "Klick auf Startpunkt oder Doppelklick schließt die Fläche.",
  ],
  [ANNOTATION_TYPE_AREA_PLANAR]: [
    "Dach: 1.+2. Punkt definieren eine horizontale Kante, der 3. Punkt spannt die Dach-Ebene auf; weitere Punkte werden auf diese Ebene projiziert.",
    "Klick auf Startpunkt oder Doppelklick schließt die Fläche.",
  ],
} as const;

const AREA_LABEL = {
  [ANNOTATION_TYPE_AREA_GROUND]: "Grundriss",
  [ANNOTATION_TYPE_AREA_VERTICAL]: "Fassade",
  [ANNOTATION_TYPE_AREA_PLANAR]: "Dach",
} as const;

export function AreaToolOptions({
  activeToolType,
  helpCollapsed,
  onHelpCollapsedChange,
}: AreaToolOptionsProps) {
  return (
    <ToolOptionsSection
      dataTestId={`measurement-${activeToolType}-options`}
      helpDataTestId={`measurement-${activeToolType}-help`}
      helpCollapsed={helpCollapsed}
      onHelpCollapsedChange={onHelpCollapsedChange}
      helpContent={renderHelpContent(AREA_HELP_CONTENT[activeToolType])}
    >
      <span
        style={optionsLabelStyle}
        data-test-id="measurement-area-mode-label"
      >
        Aktiver Flächenmodus: {AREA_LABEL[activeToolType]}
      </span>
    </ToolOptionsSection>
  );
}
