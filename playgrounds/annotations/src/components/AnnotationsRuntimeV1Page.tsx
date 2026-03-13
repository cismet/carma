import { useRef, useState } from "react";

import { type Scene } from "@carma/cesium";

import type { AnnotationEntry } from "@carma-mapping/annotations/core";
import {
  AnnotationInfoBox,
  AnnotationsProvider,
  AnnotationToolbar3D,
  useLocalAnnotationPersistence,
} from "@carma-mapping/annotations/runtime";
import { Control, ControlLayout } from "@carma-mapping/map-controls-layout";
import { LabelOverlayProvider } from "@carma-providers/label-overlay";

import { INFOBOX_WIDTH_PX, readInitialToolType } from "../playgroundConfig";
import { CesiumWidgetContainer } from "./CesiumWidgetContainer";
import { PersistActiveToolMode } from "./PersistActiveToolMode";

export const AnnotationsRuntimeV1Page = () => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [scene, setScene] = useState<Scene | null>(null);
  const [initialToolType] = useState(() => readInitialToolType());
  const { initialPersistenceState, onPersistenceStateChange } =
    useLocalAnnotationPersistence<AnnotationEntry>({
      enabled: true,
      storageKey: "annotations-playground-annotations",
    });

  return (
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
  );
};
