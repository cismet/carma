import * as ReactDOM from "react-dom/client";
import { ConfigProvider, theme } from "antd";
import { useEffect, useRef, useState } from "react";
import { type Scene } from "@carma/cesium";

import { setupCesiumEnvironment } from "@carma-mapping/engines/cesium";
import { LabelOverlayProvider } from "@carma-providers/label-overlay";
import {
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_AREA_PLANAR,
  ANNOTATION_TYPE_AREA_VERTICAL,
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_LABEL,
  ANNOTATION_TYPE_POINT,
  ANNOTATION_TYPE_POLYLINE,
  SELECT_TOOL_TYPE,
  type AnnotationEntry,
  type AnnotationToolType,
} from "@carma-mapping/annotations/core";
import {
  AnnotationInfoBox,
  AnnotationsProvider,
  AnnotationToolbar3D,
  useLocalAnnotationPersistence,
  useTools,
} from "@carma-mapping/annotations/runtime";
import { Control, ControlLayout } from "@carma-mapping/map-controls-layout";

import { CesiumWidgetContainer } from "./components/CesiumWidgetContainer";
import { APP_BASE_PATH, CESIUM_PATHNAME } from "./config";

import "cesium/Build/Cesium/Widgets/widgets.css";
import "antd/dist/reset.css";
import "./styles.css";

const CESIUM_BASE_URL = `${APP_BASE_PATH}${CESIUM_PATHNAME}`;
setupCesiumEnvironment({ baseUrl: CESIUM_BASE_URL });

const INFOBOX_WIDTH_PX = 430;
const ACTIVE_TOOL_STORAGE_KEY = "annotations-playground-active-tool.v1";
const VALID_TOOL_TYPES = new Set<AnnotationToolType>([
  SELECT_TOOL_TYPE,
  ANNOTATION_TYPE_POINT,
  ANNOTATION_TYPE_LABEL,
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_POLYLINE,
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_AREA_PLANAR,
  ANNOTATION_TYPE_AREA_VERTICAL,
]);

const readInitialToolType = (): AnnotationToolType => {
  if (typeof window === "undefined") {
    return ANNOTATION_TYPE_POINT;
  }

  try {
    const storedToolType = window.localStorage.getItem(ACTIVE_TOOL_STORAGE_KEY);
    if (
      storedToolType &&
      VALID_TOOL_TYPES.has(storedToolType as AnnotationToolType)
    ) {
      return storedToolType as AnnotationToolType;
    }
  } catch {
    // ignore storage read errors
  }

  return ANNOTATION_TYPE_POINT;
};

const PersistActiveToolMode = () => {
  const tools = useTools();

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(
        ACTIVE_TOOL_STORAGE_KEY,
        tools.activeToolType
      );
    } catch {
      // ignore storage write errors
    }
  }, [tools.activeToolType]);

  return null;
};

const App = () => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [scene, setScene] = useState<Scene | null>(null);
  const [initialToolType] = useState<AnnotationToolType>(() =>
    readInitialToolType()
  );
  const { initialPersistenceState, onPersistenceStateChange } =
    useLocalAnnotationPersistence<AnnotationEntry>({
      enabled: true,
      storageKey: "annotations-playground-annotations",
    });

  return (
    <>
      <CesiumWidgetContainer rootRef={rootRef} onSceneChange={setScene}>
        <LabelOverlayProvider containerRef={rootRef}>
          {scene ? (
            <AnnotationsProvider
              enabled={true}
              cesiumScene={scene}
              options={{
                initialToolType,
                initialPersistenceState,
                onPersistenceStateChange,
              }}
            >
              <PersistActiveToolMode />
              <ControlLayout ifStorybook={false}>
                <Control position="topcenter" order={20}>
                  <div
                    style={{
                      width: "max-content",
                      maxWidth: "calc(100vw - 24px)",
                      pointerEvents: "auto",
                    }}
                  >
                    <AnnotationToolbar3D
                      secondaryToolbarCollapsedByDefault={true}
                      enableMultiDeleteHotkey={false}
                    />
                  </div>
                </Control>
                <AnnotationInfoBox pixelWidth={INFOBOX_WIDTH_PX} />
              </ControlLayout>
            </AnnotationsProvider>
          ) : null}
        </LabelOverlayProvider>
      </CesiumWidgetContainer>
    </>
  );
};

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);

root.render(
  <ConfigProvider
    theme={{
      algorithm: theme.compactAlgorithm,
      components: { Collapse: { contentPadding: 0 } },
    }}
  >
    <App />
  </ConfigProvider>
);
