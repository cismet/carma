import {
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_AREA_PLANAR,
  ANNOTATION_TYPE_AREA_VERTICAL,
} from "@carma-mapping/annotations/core";
import { optionsLabelStyle } from "../../shared";
import { ToolOptionsSection } from "./ToolOptionsSection";

type AreaToolOptionsProps = {
  activeToolType:
    | typeof ANNOTATION_TYPE_AREA_GROUND
    | typeof ANNOTATION_TYPE_AREA_VERTICAL
    | typeof ANNOTATION_TYPE_AREA_PLANAR;
};

const AREA_LABEL = {
  [ANNOTATION_TYPE_AREA_GROUND]: "Grundriss",
  [ANNOTATION_TYPE_AREA_VERTICAL]: "Fassade",
  [ANNOTATION_TYPE_AREA_PLANAR]: "Dach",
} as const;

export function AreaToolOptions({ activeToolType }: AreaToolOptionsProps) {
  return (
    <ToolOptionsSection dataTestId={`measurement-${activeToolType}-options`}>
      <span
        style={optionsLabelStyle}
        data-test-id="measurement-area-mode-label"
      >
        Aktiver Flächenmodus: {AREA_LABEL[activeToolType]}
      </span>
    </ToolOptionsSection>
  );
}
