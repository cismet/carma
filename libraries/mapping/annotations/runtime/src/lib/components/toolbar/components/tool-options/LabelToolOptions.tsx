import { optionsLabelStyle } from "../../shared";
import { ToolOptionsSection } from "./ToolOptionsSection";
import { renderHelpContent } from "./shared";

type LabelToolOptionsProps = {
  helpCollapsed: boolean;
  onHelpCollapsedChange: (collapsed: boolean) => void;
};

export function LabelToolOptions({
  helpCollapsed,
  onHelpCollapsedChange,
}: LabelToolOptionsProps) {
  return (
    <ToolOptionsSection
      dataTestId="measurement-label-options"
      helpDataTestId="measurement-label-help"
      helpCollapsed={helpCollapsed}
      onHelpCollapsedChange={onHelpCollapsedChange}
      helpContent={renderHelpContent([
        "Im Anmerkungsmodus setzt ein Klick eine Beschriftung am Punkt.",
        "Die Beschriftung kann danach in der Infobox bearbeitet werden.",
        "Über den Auswahlmodus lassen sich Anmerkungen gemeinsam ein-/ausblenden, sperren und löschen.",
      ])}
    >
      <span style={optionsLabelStyle}>Anmerkungsmodus aktiv</span>
    </ToolOptionsSection>
  );
}
