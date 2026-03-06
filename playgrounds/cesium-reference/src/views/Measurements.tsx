import { useRef } from "react";
import { CesiumErrorHandling } from "@carma-mapping/engines/cesium";
import { LabelOverlayProvider } from "@carma-providers/label-overlay";
import { CesiumAnnotationsProvider } from "@carma-mapping/annotations/cesium";
import {
  AnnotationInfoBox,
  AnnotationToolbar3D,
} from "@carma-mapping/annotations/provider";
import { Control, ControlLayout } from "@carma-mapping/map-controls-layout";
import { CesiumWidgetContainer } from "../components/CesiumWidgetContainer";

const INFOBOX_WIDTH_PX = 430;

const Measurements = () => {
  const rootRef = useRef<HTMLDivElement | null>(null);

  return (
    <>
      <CesiumErrorHandling />
      <CesiumWidgetContainer rootRef={rootRef}>
        <LabelOverlayProvider containerRef={rootRef}>
          <CesiumAnnotationsProvider
            enabled={true}
            options={{
              persistenceEnabled: false,
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
          </CesiumAnnotationsProvider>
        </LabelOverlayProvider>
      </CesiumWidgetContainer>
    </>
  );
};

export default Measurements;
