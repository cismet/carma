import {
  defaultAnnotationModeText,
  resolveAnnotationModeText,
} from "./annotation-mode-text";

describe("resolveAnnotationModeText", () => {
  it("uses action-oriented labels for adhoc model highlight toggles", () => {
    expect(
      defaultAnnotationModeText.layerbar.adhocModel.highlight.activate
    ).toBe("Akzentuiert darstellen");
    expect(
      defaultAnnotationModeText.layerbar.adhocModel.highlight.deactivate
    ).toBe("Realistisch darstellen");
  });

  it("deep-merges override text while preserving unspecified defaults", () => {
    const resolvedText = resolveAnnotationModeText({
      layerTitle: {
        empty: "Custom Measurement",
      },
      layerbar: {
        adhocModel: {
          highlight: {
            activate: "Enable custom highlight",
          },
        },
      },
      annotationTools: {
        actions: {
          delete: "Remove custom measurement",
        },
        distance: {
          helpText: ["Custom distance help"],
        },
      },
    });

    expect(resolvedText.layerTitle.empty).toBe("Custom Measurement");
    expect(resolvedText.layerTitle.plural).toBe(
      defaultAnnotationModeText.layerTitle.plural
    );
    expect(resolvedText.layerbar.adhocModel.highlight.activate).toBe(
      "Enable custom highlight"
    );
    expect(resolvedText.layerbar.adhocModel.highlight.deactivate).toBe(
      defaultAnnotationModeText.layerbar.adhocModel.highlight.deactivate
    );
    expect(resolvedText.annotationTools.actions.delete).toBe(
      "Remove custom measurement"
    );
    expect(resolvedText.annotationTools.distance.helpText).toEqual([
      "Custom distance help",
    ]);
    expect(resolvedText.annotationTools.distance.tooltip).toBe(
      defaultAnnotationModeText.annotationTools.distance.tooltip
    );
  });
});
