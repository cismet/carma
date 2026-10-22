import { useSelector } from "react-redux";

import {
  AnnotationToolShortcutBindings,
  useAnnotationsRuntime,
} from "@carma-mapping/annotations/runtime";

import { getUIMode, UIMode } from "../../store/slices/ui";
import { useGeoportalCesiumAnnotationToolPlugins } from "../../hooks/use-geoportal-cesium-annotation-tool-plugins";
import { useGeoportalAnnotationHost } from "./GeoportalAnnotationHostContext";

const AnnotationShortcutBindings = () => {
  const { is3dAnnotationHost } = useGeoportalAnnotationHost();
  const uiMode = useSelector(getUIMode);
  const { registry } = useAnnotationsRuntime();
  const visiblePlugins = useGeoportalCesiumAnnotationToolPlugins(
    registry.plugins
  );

  return (
    <AnnotationToolShortcutBindings
      plugins={visiblePlugins}
      enabled={is3dAnnotationHost && uiMode === UIMode.MEASUREMENT}
    />
  );
};

export default AnnotationShortcutBindings;
