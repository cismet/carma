import { useMemo } from "react";
import { useSelector } from "react-redux";
import {
  AnnotationInfoBoxContainer,
  AnnotationInfoBoxTextContent,
  resolveAnnotationInfoBoxVisualOptions,
} from "@carma-mapping/annotations/ui";
import {
  resolveAnnotationToolFallbackPlugin,
  RuntimeAnnotationInfoBox,
  useAnnotationsRuntime,
} from "@carma-mapping/annotations/runtime";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";
import { getLayers } from "../../store/slices/mapping";
import { getUIMode } from "../../store/slices/ui";
import { shouldShowCesiumMeasurementInfoBox } from "../../helper/cesium-measurement-info-box";
import { CESIUM_ANNOTATION_CONFIG } from "../../config/app.config";

const CesiumMeasurementInfoBox = () => {
  const { isCesium } = useMapFrameworkSwitcherContext();
  const uiMode = useSelector(getUIMode);
  const layers = useSelector(getLayers);
  const { registry, activeToolType, selectedAnnotationId } =
    useAnnotationsRuntime();
  const annotationsVisible = shouldShowCesiumMeasurementInfoBox({
    isCesium,
    layers,
    uiMode,
  });
  const resolvedVisualOptions = useMemo(
    () => resolveAnnotationInfoBoxVisualOptions(),
    []
  );

  const fallbackPlugin = useMemo(() => {
    return resolveAnnotationToolFallbackPlugin({
      activeToolType,
      registry,
    });
  }, [activeToolType, registry]);

  if (!annotationsVisible) {
    return null;
  }

  if (!selectedAnnotationId && fallbackPlugin?.helpText?.length) {
    return (
      <AnnotationInfoBoxContainer
        {...CESIUM_ANNOTATION_CONFIG.infoBox}
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

  return <RuntimeAnnotationInfoBox {...CESIUM_ANNOTATION_CONFIG.infoBox} />;
};

export default CesiumMeasurementInfoBox;
