import { useEffect, useRef, useState } from "react";
import {
  Cartesian3,
  Cartographic,
  Cesium3DTileset,
  Color,
  Viewer,
  Math as CesiumMath,
  Entity,
  HeadingPitchRange,
} from "cesium";
import { WUPP_MESH_2024 } from "@carma-commons/resources";
import { getTileset } from "../cesium.utils";
import { cesiumConstructorOptions } from "../config";
import SensorShadow from "../lib/SensorShadow/src/SensorShadow";
import { Button, Checkbox } from "antd";

const TOELLETURM = {
  longitude: 7.201578,
  latitude: 51.256565,
  height: 335,
};

const TOELLETURM_CAM = {
  longitude: 7.203,
  latitude: 51.257,
  height: 360,
};

const toCartographic = ({
  longitude,
  latitude,
  height,
}: {
  longitude: number;
  latitude: number;
  height: number;
}) => {
  return new Cartographic(
    CesiumMath.toRadians(longitude),
    CesiumMath.toRadians(latitude),
    height
  );
};

const sensorConfig = {
  positionCartographic: toCartographic(TOELLETURM),
  cameraPositionCartographic: toCartographic(TOELLETURM_CAM),
};

const ViewShed: React.FC = () => {
  const constainerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const tilesetRef = useRef<Cesium3DTileset | null>(null);

  const [showSensorShadow, setShowSensorShadow] = useState(false);

  useEffect(() => {
    const initialize = async () => {
      try {
        if (constainerRef.current) {
          const viewer = new Viewer(
            constainerRef.current,
            cesiumConstructorOptions
          );
          viewerRef.current = viewer;
          const tileset = await getTileset(WUPP_MESH_2024.url);
          if (tileset) {
            tilesetRef.current = tileset;
            viewer.scene.primitives.add(tileset);
            viewer.zoomTo(tileset);
          }
        }
      } catch (error) {
        console.error("Initialization error:", error);
      }
    };

    initialize();

    return () => {
      if (tilesetRef.current) {
        tilesetRef.current.destroy();
      }
      if (viewerRef.current) {
        viewerRef.current.destroy();
      }
    };
  }, []);

  useEffect(() => {
    if (viewerRef.current.scene && showSensorShadow) {
      console.log(viewerRef.current, SensorShadow);
      let sensorShadow = new SensorShadow(viewerRef.current, {
        cameraPosition: Cartographic.toCartesian(
          sensorConfig.positionCartographic
        ),
        viewPosition: Cartographic.toCartesian(
          sensorConfig.cameraPositionCartographic
        ),
        viewAreaColor: new Color(0, 1, 0),
        shadowAreaColor: new Color(1, 0, 0),
        alpha: 0.5,
        frustum: true,
        size: 1024,
      });
    }
  }, [showSensorShadow]);

  const handleClick = () => {
    if (viewerRef.current) {
      viewerRef.current.camera.flyTo({
        destination: Cartographic.toCartesian(
          sensorConfig.cameraPositionCartographic
        ),
      });
    }
  };

  return (
    <>
      <div ref={constainerRef} style={{ width: "100%", height: "100vh" }} />;
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
        <Checkbox
          checked={showSensorShadow}
          onChange={(e) => setShowSensorShadow(e.target.checked)}
        >
          Enable Sensor Shadow
        </Checkbox>
        <Button onClick={handleClick}>Got To Sensor</Button>
      </div>
    </>
  );
};

export default ViewShed;
