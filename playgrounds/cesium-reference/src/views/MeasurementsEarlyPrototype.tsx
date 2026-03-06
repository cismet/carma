import React, { useRef, useCallback, useEffect } from "react";
import { Flex, Collapse, theme, Switch, Typography } from "antd";

import { WUPP_MESH_2024 } from "@carma-commons/resources";
import { CesiumErrorHandling } from "@carma-mapping/engines/cesium";

import {
  CesiumViewerProvider,
  useCesiumViewer,
} from "../contexts/CesiumViewerContext";
import { CesiumMeasurementsProvider } from "../measurements/CesiumMeasurementsContext";
import { OverlayProvider } from "../overlay";
import ScreenLayout from "../components/ScreenLayout";
import { MeasurementPanel } from "../measurements/components/MeasurementPanel";

import { cesiumConstructorOptions } from "../config";
import { NivPointControls } from "../measurements/components/NivPointControls";
import { NivPointPanel } from "../measurements/components/NivPointPanel";

import HomeButton from "../components/HomeButton";
import { CesiumNivPointProvider } from "../measurements/CesiumNivPointContext";
import { CRSContextProvider } from "../measurements/CRSContext";

const { Text } = Typography;

// Inner component that has access to contexts
const ContextAwareApp: React.FC<{
  overlayUpdateRef: React.MutableRefObject<(() => void) | null>;
}> = ({ overlayUpdateRef }) => {
  const { zoomToTileset, setHQMode, hqMode, viewer } = useCesiumViewer();
  const { token } = theme.useToken();

  // Connect overlay updates to Cesium render events
  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;

    const onPreRender = () => {
      if (overlayUpdateRef.current) {
        overlayUpdateRef.current();
      }
    };

    const removeListener = viewer.scene.preRender.addEventListener(onPreRender);

    return () => {
      if (removeListener) {
        removeListener();
      }
    };
  }, [viewer, overlayUpdateRef]);

  const handleHQModeChange = (checked: boolean) => {
    setHQMode?.(checked);
  };

  const collapseItems = [
    {
      key: "settings",
      label: "Einstellungen",
      children: (
        <>
          <Switch
            checked={hqMode}
            onChange={handleHQModeChange}
            checkedChildren="HQ"
            unCheckedChildren="LQ"
          />
          <Text type="secondary" style={{ marginLeft: 8, fontSize: "12px" }}>
            {hqMode
              ? "Native Auflösung"
              : `Auflösung 1/${window.devicePixelRatio}`}
          </Text>
        </>
      ),
    },
    {
      key: "nivpoint",
      label: "Höhenfestpunkte",
      children: (
        <Flex vertical gap={2}>
          <NivPointControls />
          <NivPointPanel />
        </Flex>
      ),
    },
  ];

  return (
    <ScreenLayout
      topLeft={
        <Collapse
          style={{ backgroundColor: token.colorBgContainer }}
          items={collapseItems}
          size="small"
          defaultActiveKey={[]}
        />
      }
      topRight={<MeasurementPanel />}
      bottomCenter={<HomeButton onHomeClick={zoomToTileset} />}
    />
  );
};

const TestMeshElevations: React.FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const overlayUpdateRef = useRef<(() => void) | null>(null);

  // Debounced overlay update function
  const requestOverlayUpdate = useCallback((updateFn: () => void) => {
    overlayUpdateRef.current = updateFn;
  }, []);

  return (
    <>
      <CesiumErrorHandling />
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "100vh",
        }}
      />
      <CRSContextProvider>
        <CesiumViewerProvider
          containerRef={containerRef}
          options={{
            cesiumOptions: cesiumConstructorOptions,
            tilesetUrl: WUPP_MESH_2024.url,
            tilesetOptions: {
              maximumScreenSpaceError: 4,
              cacheBytes: 4 * 1024 * 1024 * 1024, // 4GB
              maximumCacheOverflowBytes: 2 * 1024 * 1024 * 1024, // 2GB overflow
              show: true,
            },
            cameraPersistence: {
              autoSave: true,
              saveDelay: 1000,
              autoRestore: true,
            },
          }}
        >
          <OverlayProvider
            containerRef={containerRef}
            requestUpdateCallback={requestOverlayUpdate}
          >
            <CesiumMeasurementsProvider>
              <CesiumNivPointProvider>
                <ContextAwareApp overlayUpdateRef={overlayUpdateRef} />
              </CesiumNivPointProvider>
            </CesiumMeasurementsProvider>
          </OverlayProvider>
        </CesiumViewerProvider>
      </CRSContextProvider>
    </>
  );
};

export default TestMeshElevations;
