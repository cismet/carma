import { optionsLabelStyle } from "../../shared";
import { ToolOptionsSection } from "./ToolOptionsSection";

export function LabelToolOptions() {
  return (
    <ToolOptionsSection dataTestId="measurement-label-options">
      <span style={optionsLabelStyle}>Anmerkungsmodus aktiv</span>
    </ToolOptionsSection>
  );
}
