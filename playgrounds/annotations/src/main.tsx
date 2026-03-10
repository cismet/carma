import * as ReactDOM from "react-dom/client";
import { ConfigProvider, theme } from "antd";
import { useRef, useState } from "react";
import { type Scene } from "@carma/cesium";

import { setupCesiumEnvironment } from "@carma-mapping/engines/cesium";
import { LabelOverlayProvider } from "@carma-providers/label-overlay";
import { type AnnotationEntry } from "@carma-mapping/annotations/core";
import {
  AnnotationInfoBox,
  AnnotationsProvider,
  AnnotationToolbar3D,
  useLocalAnnotationPersistence,
} from "@carma-mapping/annotations/provider";
import { Control, ControlLayout } from "@carma-mapping/map-controls-layout";

import { CesiumWidgetContainer } from "./components/CesiumWidgetContainer";
import { APP_BASE_PATH, CESIUM_PATHNAME } from "./config";

import "cesium/Build/Cesium/Widgets/widgets.css";
import "antd/dist/reset.css";
import "./styles.css";

const CESIUM_BASE_URL = `${APP_BASE_PATH}${CESIUM_PATHNAME}`;
setupCesiumEnvironment({ baseUrl: CESIUM_BASE_URL });

const INFOBOX_WIDTH_PX = 430;

const App = () => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [scene, setScene] = useState<Scene | null>(null);
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
                initialPersistenceState,
                onPersistenceStateChange,
              }}
            >
              <ControlLayout ifStorybook={false}>
                <Control position="topcenter" order={20}>
                  <div
                    style={{
                      width: "max-content",
                      maxWidth: "calc(100vw - 24px)",
                      pointerEvents: "auto",
                    }}
                  >
                    <AnnotationToolbar3D showSecondaryToolbar={false} />
                  </div>
                </Control>
                <Control position="bottomleft" order={20}>
                  <div style={{ pointerEvents: "auto" }}>
                    <AnnotationToolbar3D
                      showPrimaryToolbar={false}
                      enableMultiDeleteHotkey={false}
                      secondaryToolbarCollapsedByDefault={true}
                      secondaryToolbarDirection="right"
                      secondaryToolbarContainerStyle={{
                        display: "flex",
                        alignItems: "flex-end",
                        gap: 8,
                        maxWidth: "calc(100vw - 24px)",
                      }}
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
