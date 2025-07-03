import { FC, useEffect, useRef, useState } from "react";
import { Viewer, ShadowMode, JulianDate } from "cesium";
import { Slider, Checkbox } from "antd";

import { WUPP_MESH_2024 } from "@carma-commons/resources";
import { cesiumConstructorOptions } from "../config";
import useTileset from "../hooks/useTileset";
import { useZoomToTilesetOnReady } from "../hooks/useZoomToTilesetOnReady";
import UiBottom from "../components/UiBottom";

const ShadowMesh: FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const [timeOfDay, setTimeOfDay] = useState(720); // Default to noon
  const [dayOfYear, setDayOfYear] = useState(0);
  const [shadowsEnabled, setShadowsEnabled] = useState(true);
  const { tilesetRef, tilesetReady } = useTileset(
    WUPP_MESH_2024.url,
    viewerRef.current
  );

  useEffect(() => {
    const initialize = async () => {
      if (containerRef.current) {
        const viewer = new Viewer(containerRef.current, {
          ...cesiumConstructorOptions,
          shadows: true,
          terrainShadows: ShadowMode.ENABLED,
        });
        viewerRef.current = viewer;
        const shadowMap = viewer.shadowMap;
        shadowMap.fadingEnabled = false;
        shadowMap.maximumDistance = 50000.0;
      }
    };
    initialize();

    return () => {
      if (viewerRef.current) {
        viewerRef.current.destroy();
      }
    };
  }, []);

  useZoomToTilesetOnReady(viewerRef.current, tilesetRef, tilesetReady);

  useEffect(() => {
    if (viewerRef.current) {
      const currentTime = viewerRef.current.clock.currentTime;
      // set date by day of year and time of day
      const newDate = JulianDate.toDate(currentTime);
      newDate.setHours(Math.floor(timeOfDay / 60), timeOfDay % 60, 0);
      viewerRef.current.clock.currentTime = JulianDate.fromDate(newDate);
    }
  }, [timeOfDay]);

  useEffect(() => {
    if (viewerRef.current) {
      const currentTime = viewerRef.current.clock.currentTime;
      const newDate = JulianDate.toDate(currentTime);
      newDate.setMonth(0); // Reset to January
      newDate.setDate(dayOfYear + 1); // Set day of the year
      viewerRef.current.clock.currentTime = JulianDate.fromDate(newDate);
    }
  }, [dayOfYear]);

  useEffect(() => {
    if (viewerRef.current.scene) {
      viewerRef.current.shadowMap.enabled = shadowsEnabled;
      viewerRef.current.scene.requestRender();
    }
  }, [shadowsEnabled]);

  return (
    <>
      <div ref={containerRef} style={{ width: "100%", height: "100vh" }} />
      <UiBottom>
        <Slider
          min={0}
          max={1439}
          step={1}
          value={timeOfDay}
          onChange={setTimeOfDay}
          tooltip={{
            formatter: (value) =>
              `Time of Day: ${Math.floor(value / 60)}:${value % 60}`,
          }}
        />
        <Slider
          min={0}
          max={364}
          step={1}
          value={dayOfYear}
          onChange={setDayOfYear}
          tooltip={{
            formatter: (value) => `Day of Year: ${value + 1}`,
          }}
        />
        <Checkbox
          checked={shadowsEnabled}
          onChange={(e) => setShadowsEnabled(e.target.checked)}
        >
          Enable Shadows
        </Checkbox>
      </UiBottom>
    </>
  );
};

export default ShadowMesh;
