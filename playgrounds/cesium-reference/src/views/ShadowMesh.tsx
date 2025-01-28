import { FC, useEffect, useRef, useState } from "react";
import { Viewer, ShadowMode, Cesium3DTileset, JulianDate } from "cesium";
import { Slider, Checkbox } from "antd";

import { WUPP_MESH_2024 } from "@carma-commons/resources";
import { cesiumConstructorOptions } from "../config";
import { getTileset } from "../cesium.utils";

const ShadowMesh: FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const [timeOfDay, setTimeOfDay] = useState(720); // Default to noon
  const [dayOfYear, setDayOfYear] = useState(0);
  const [shadowsEnabled, setShadowsEnabled] = useState(true);

  useEffect(() => {
    let tileset: Cesium3DTileset | null = null;

    const initialize = async () => {
      if (containerRef.current) {
        const viewer = new Viewer(containerRef.current, {
          ...cesiumConstructorOptions,
          shadows: shadowsEnabled,
          terrainShadows: ShadowMode.ENABLED,
        });

        viewerRef.current = viewer;

        tileset = await getTileset(WUPP_MESH_2024.url);
        if (tileset) {
          viewer.scene.primitives.add(tileset);
          viewer.zoomTo(tileset);
        }

        const shadowMap = viewer.shadowMap;
        shadowMap.fadingEnabled = false;
        shadowMap.maximumDistance = 50000.0;
      }
    };

    initialize();

    return () => {
      if (tileset) {
        tileset.destroy();
      }
      if (viewerRef.current) {
        viewerRef.current.destroy();
      }
    };
  }, []);

  useEffect(() => {
    if (viewerRef.current) {
      const currentTime = viewerRef.current.clock.currentTime;
      // set date by day of year and time of day
      const newDate = new Date(currentTime);
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
    if (viewerRef.current) {
      viewerRef.current.shadowMap.enabled = shadowsEnabled;
      viewerRef.current.scene.requestRender();
    }
  }, [shadowsEnabled]);

  return (
    <div>
      <div ref={containerRef} style={{ width: "100%", height: "100vh" }} />
      <div
        style={{
          position: "absolute",
          bottom: 10,
          right: 10,
          left: 10,
          padding: "10px",
          background: "rgba(255, 255, 255, 0.85)",
        }}
      >
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
      </div>
    </div>
  );
};

export default ShadowMesh;
