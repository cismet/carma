import { useEffect, useRef, useState } from "react";
import {
  Color,
  GeoJsonDataSource,
  Viewer,
  Math as CesiumMath,
  PerspectiveFrustum,
  ConstantProperty,
  ColorMaterialProperty,
  PointGraphics,
} from "cesium";
import { WUPP_MESH_2024 } from "@carma-commons/resources";
import { cesiumConstructorOptions } from "../config";
import useTileset from "../hooks/useTileset";
import { useZoomToTilesetOnReady } from "../hooks/useZoomToTilesetOnReady";
import UiBottom from "../components/UiBottom";
import { Slider } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faMagnifyingGlassMinus,
  faMagnifyingGlassPlus,
} from "@fortawesome/free-solid-svg-icons";

const addZToProperties = (geoJsonData: any) => {
  geoJsonData.features.forEach((feature: any) => {
    if (feature.geometry && feature.geometry.coordinates) {
      const coordinates = feature.geometry.coordinates;
      const zValue = coordinates[2] || 0; // Assuming the Z value is the third coordinate
      feature.properties.Height = zValue;
    }
  });
};

const loadGeoJson = async (viewer: Viewer, url: string) => {
  try {
    const response = await fetch(url);
    const geoJsonData = await response.json();

    // Add Z value to properties
    addZToProperties(geoJsonData);

    const dataSource = await GeoJsonDataSource.load(geoJsonData, {
      stroke: Color.HOTPINK,
      fill: Color.PINK,
      strokeWidth: 3,
      markerSymbol: "ABC",
    });
    viewer.dataSources.add(dataSource);

    const pointStyle = new PointGraphics({
      pixelSize: 5,
      color: Color.YELLOW,
    });

    // Change the style of the markers to circles and remove billboards
    dataSource.entities.values.forEach((entity) => {
      if (entity.position) {
        entity.point = pointStyle;
        entity.billboard = undefined; // Remove the default billboard
      }
    });
  } catch (error) {
    console.error("Error loading GeoJSON:", error);
  }
};

const ObliqueAndMesh: React.FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const { tilesetRef, tilesetReady } = useTileset(
    WUPP_MESH_2024.url,
    viewerRef
  );

  const [sliderValue, setSliderValue] = useState<number>(0);

  useEffect(() => {
    if (viewerRef.current) {
      if (
        viewerRef.current.scene.camera.frustum instanceof PerspectiveFrustum
      ) {
        const initialFov = CesiumMath.toDegrees(
          viewerRef.current.scene.camera.frustum.fov
        );
        setSliderValue(initialFov);
      }
    }
  }, [viewerRef.current]);

  const handleCameraPOVChange = (value: number) => {
    setSliderValue(value);
    if (viewerRef.current) {
      const camera = viewerRef.current.scene.camera;
      if (camera.frustum instanceof PerspectiveFrustum) {
        camera.frustum.fov = CesiumMath.toRadians(value);
      }
    }
  };

  useEffect(() => {
    const initialize = async () => {
      try {
        if (containerRef.current) {
          const viewer = new Viewer(containerRef.current, {
            ...cesiumConstructorOptions,
            selectionIndicator: true,
            infoBox: true,
          });
          viewerRef.current = viewer;
          loadGeoJson(viewer, "/data/Aufnahmeorte.2024.wgs84.geojson");
        }
      } catch (error) {
        console.error("Initialization error:", error);
      }
    };

    initialize();

    return () => {
      if (viewerRef.current) {
        viewerRef.current.destroy();
      }
    };
  }, []);
  useZoomToTilesetOnReady(viewerRef, tilesetRef, tilesetReady);
  return (
    <>
      <div ref={containerRef} style={{ width: "100%", height: "100vh" }} />
      <UiBottom>
        <div style={{ display: "flex", alignItems: "center" }}>
          <FontAwesomeIcon icon={faMagnifyingGlassPlus} />
          <Slider
            min={1}
            max={179}
            onChange={handleCameraPOVChange}
            value={sliderValue}
            tooltip={{ formatter: (value) => `${value}°` }}
            style={{ flex: 1 }}
          />
          <FontAwesomeIcon icon={faMagnifyingGlassMinus} />
        </div>
      </UiBottom>
    </>
  );
};

export default ObliqueAndMesh;
