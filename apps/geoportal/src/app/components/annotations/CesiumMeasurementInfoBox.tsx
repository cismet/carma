import { useMemo } from "react";
import { useSelector } from "react-redux";
import {
  AnnotationInfoBoxContainer,
  AnnotationInfoBoxTextContent,
  resolveAnnotationInfoBoxVisualOptions,
} from "@carma-mapping/annotations/ui";
import {
  RuntimeAnnotationInfoBox,
  useAnnotationsRuntime,
} from "@carma-mapping/annotations/runtime";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";
import { getLayers } from "../../store/slices/mapping";
import { getUIMode, UIMode } from "../../store/slices/ui";
import { CESIUM_ANNOTATION_LAYER_ID } from "./cesium-annotations.constants";

const CESIUM_MEASUREMENT_INFO_BOX_WIDTH_PX = 430;

const CesiumMeasurementInfoBox = () => {
  const { isCesium } = useMapFrameworkSwitcherContext();
  const uiMode = useSelector(getUIMode);
  const layers = useSelector(getLayers);
  const { registry, activeToolType, selectedAnnotationId } =
    useAnnotationsRuntime();
  const annotationsVisible =
    isCesium &&
    uiMode === UIMode.MEASUREMENT &&
    layers.some((layer) => layer.id === CESIUM_ANNOTATION_LAYER_ID);
  const resolvedVisualOptions = useMemo(
    () => resolveAnnotationInfoBoxVisualOptions(),
    []
  );

  const fallbackPlugin = useMemo(() => {
    if (activeToolType) {
      const activePlugin = registry.getPlugin(activeToolType);
      if (activePlugin) {
        return activePlugin;
      }
    }

    return (
      registry.getPlugin("select") ??
      [...registry.plugins].sort(
        (left, right) => left.descriptor.order - right.descriptor.order
      )[0] ??
      null
    );
  }, [activeToolType, registry]);

  if (!annotationsVisible) {
    return null;
  }

  if (!selectedAnnotationId && fallbackPlugin?.helpText?.length) {
    return (
      <AnnotationInfoBoxContainer
        pixelWidth={CESIUM_MEASUREMENT_INFO_BOX_WIDTH_PX}
        fitContentWidth={false}
        useControlLayout={true}
        controlPosition="bottomright"
        controlOrder={12}
        visualOptions={resolvedVisualOptions}
        slots={{
          headingTitle: fallbackPlugin.descriptor.label,
          content: (
            <AnnotationInfoBoxTextContent visualOptions={resolvedVisualOptions}>
              <div className="space-y-2 pt-2">
                {fallbackPlugin.helpText.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            </AnnotationInfoBoxTextContent>
          ),
          collapsible: true,
        }}
      />
    );
  }

  if (!selectedAnnotationId) {
    return null;
  }

  return (
    <RuntimeAnnotationInfoBox
      pixelWidth={CESIUM_MEASUREMENT_INFO_BOX_WIDTH_PX}
      fitContentWidth={false}
      useControlLayout={true}
      controlPosition="bottomright"
      controlOrder={12}
    />
  );
};

export default CesiumMeasurementInfoBox;
