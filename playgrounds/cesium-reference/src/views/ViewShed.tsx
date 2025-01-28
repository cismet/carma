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

const TOELLETURM_CAMERA = {
  longitude: 7.201578,
  latitude: 51.256565,
  height: 363,
};

const TOELLETURM_TARGET = {
  longitude: 7.2,
  latitude: 51.256,
  height: 340,
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
  cameraPositionCartographic: toCartographic(TOELLETURM_CAMERA),
  targetPositionCartographic: toCartographic(TOELLETURM_TARGET),
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

          const targetPoint = viewer.entities.add({
            position: Cartographic.toCartesian(
              toCartographic(TOELLETURM_TARGET)
            ),
            point: {
              pixelSize: 10,
              color: Color.LIME,
            },
          });
          const cameraPoint = viewer.entities.add({
            position: Cartographic.toCartesian(
              toCartographic(TOELLETURM_CAMERA)
            ),
            point: {
              pixelSize: 10,
              color: Color.YELLOW,
            },
          });

          viewer.zoomTo([cameraPoint, targetPoint]);
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
      let sensorShadow = new SensorShadow(viewerRef.current, {
        cameraPosition: Cartographic.toCartesian(
          sensorConfig.cameraPositionCartographic
        ),
        viewPosition: Cartographic.toCartesian(
          sensorConfig.targetPositionCartographic
        ),
        viewAreaColor: new Color(0.5, 1, 0.5),
        shadowAreaColor: new Color(0.2, 0.2, 0.2),
        alpha: 0.5,
        frustum: true,
        size: 1024,
      });
      viewerRef.current.scene.requestRender();
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
          Add Sensor Shadow
        </Checkbox>
        <Button onClick={handleClick}>Got To Sensor</Button>
      </div>
    </>
  );
};

export default ViewShed;
