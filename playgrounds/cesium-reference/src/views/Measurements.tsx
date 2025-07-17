import React, { useRef } from "react";
import { Flex, Collapse, theme, Switch, Typography } from "antd";

import { WUPP_MESH_2024 } from "@carma-commons/resources";
import { CesiumErrorToErrorBoundaryForwarder } from "@carma-mapping/cesium-engine";

import {
  CesiumViewerProvider,
  useCesiumViewer,
} from "../contexts/CesiumViewerContext";
import { CesiumMeasurementsProvider } from "../measurements/CesiumMeasurementsContext";
import ScreenLayout from "../components/ScreenLayout";
import { MeasurementPanel } from "../measurements/components/MeasurementPanel";

import { cesiumConstructorOptions } from "../config";
import { NivPointControls } from "../measurements/components/NivPointControls";
import { NivPointPanel } from "../measurements/components/NivPointPanel";

import HomeButton from "../components/HomeButton";
import { CesiumNivPointProvider } from "../measurements/CesiumNivPointContext";
import { CRSContextProvider } from "../measurements/CRSContext";

// check if we are in developer mode
const isDeveloperMode = process.env.NODE_ENV === "development";

const { Text } = Typography;

// Inner component that has access to contexts
const ContextAwareApp: React.FC<{}> = () => {
  const { zoomToTileset, setHQMode, hqMode } = useCesiumViewer();
  const { token } = theme.useToken();

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

  return (
    <>
      <CesiumErrorToErrorBoundaryForwarder />
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
              skipLevelOfDetail: isDeveloperMode ? true : undefined,
              immediatelyLoadDesiredLevelOfDetail: isDeveloperMode
                ? true
                : undefined,
              maximumScreenSpaceError: isDeveloperMode ? 0 : 2,
              show: true,
            },
            cameraPersistence: {
              autoSave: true,
              saveDelay: 1000,
              autoRestore: true,
            },
          }}
        >
          <CesiumMeasurementsProvider>
            <CesiumNivPointProvider>
              <ContextAwareApp />
            </CesiumNivPointProvider>
          </CesiumMeasurementsProvider>
        </CesiumViewerProvider>
      </CRSContextProvider>
    </>
  );
};

export default TestMeshElevations;
