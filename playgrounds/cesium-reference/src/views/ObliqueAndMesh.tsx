import { useEffect, useRef, useState } from "react";
import {
  Color,
  GeoJsonDataSource,
  Viewer,
  Math as CesiumMath,
  PerspectiveFrustum,
  PointGraphics,
  JulianDate,
  ScreenSpaceEventHandler,
  defined,
  ScreenSpaceEventType,
} from "cesium";
import { WUPP_MESH_2024 } from "@carma-commons/resources";
import {
  cesiumConstructorOptions,
  FOOTPRINTS_SAMPLE_URI,
  POSITIONS_GEOJSON_URI,
} from "../config";
import useTileset from "../hooks/useTileset";
import { useZoomToTilesetOnReady } from "../hooks/useZoomToTilesetOnReady";
import UiBottom from "../components/UiBottom";
import { Slider, Select, Button, Divider } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleMinus,
  faCirclePlus,
  faMagnifyingGlassMinus,
  faMagnifyingGlassPlus,
} from "@fortawesome/free-solid-svg-icons";

const augmentPointProperties = (
  geoJsonData: any,
  availableCaptureLocations: { [key: string]: { [key: string]: any } }
) => {
  const lines: { [key: string]: { [key: string]: string } } = {};
  geoJsonData.features.forEach((feature: any) => {
    if (feature.geometry && feature.geometry.coordinates) {
      const coordinates = feature.geometry.coordinates;
      const zValue = coordinates[2] || 0; // Assuming the Z value is the third coordinate
      feature.properties.Height = zValue;
      feature.properties.LINE_WAYPOINT = `${feature.properties.LINE}:${feature.properties.WAYPOINT}`;

      if (availableCaptureLocations[feature.properties.LINE_WAYPOINT]) {
        feature.properties.HAS_FOOTPRINT = true;
        feature.properties.ORI_NORTH =
          availableCaptureLocations[feature.properties.LINE_WAYPOINT][
            "NORD"
          ]?.FILENAME;
        feature.properties.ORI_SOUTH =
          availableCaptureLocations[feature.properties.LINE_WAYPOINT][
            "SUED"
          ]?.FILENAME;
        feature.properties.ORI_EAST =
          availableCaptureLocations[feature.properties.LINE_WAYPOINT][
            "OST"
          ]?.FILENAME;
        feature.properties.ORI_WEST =
          availableCaptureLocations[feature.properties.LINE_WAYPOINT][
            "WEST"
          ]?.FILENAME;
      }

      if (lines[feature.properties.LINE] === undefined) {
        lines[feature.properties.LINE] = {
          [feature.properties.WAYPOINT]: feature.properties,
        };
      } else {
        lines[feature.properties.LINE][feature.properties.WAYPOINT] =
          feature.properties;
      }
    }
  });
  return lines;
};

const augmentFootprintProperties = (geoJsonData: any) => {
  const availableCaptureLocations: { [key: string]: { [key: string]: any } } =
    {};
  geoJsonData.features.forEach((feature: any) => {
    if (feature.geometry && feature.geometry.coordinates) {
      feature.properties.LINE_WAYPOINT = `${feature.properties.LINE}:${feature.properties.WAYPOINT}`;
      if (
        availableCaptureLocations[feature.properties.LINE_WAYPOINT] ===
        undefined
      ) {
        availableCaptureLocations[feature.properties.LINE_WAYPOINT] = {
          [feature.properties.ORI]: feature.properties,
        };
      } else {
        availableCaptureLocations[feature.properties.LINE_WAYPOINT][
          feature.properties.ORI
        ] = feature.properties;
      }
    }
  });
  return availableCaptureLocations;
};

const loadAndPrepareGeoJson = async (
  viewer: Viewer,
  pointsUrl: string,
  footprintUrl: string
) => {
  try {
    const footprintResponse = await fetch(footprintUrl);
    const footprintJsonData = await footprintResponse.json();
    const availableCaptureLocations =
      augmentFootprintProperties(footprintJsonData);
    const footprints = await GeoJsonDataSource.load(footprintJsonData, {
      fill: Color.YELLOW.withAlpha(0.07),
      clampToGround: true, // Clamp footprints to the tileset
    });

    console.log(footprints.entities.values, footprintJsonData);
    viewer.dataSources.add(footprints);

    const pointsResponse = await fetch(pointsUrl);
    const pointsJsonData = await pointsResponse.json();

    // Add Z value to properties
    const lines = augmentPointProperties(
      pointsJsonData,
      availableCaptureLocations
    );

    const captureLocations = await GeoJsonDataSource.load(pointsJsonData, {
      stroke: Color.HOTPINK,
      fill: Color.PINK,
      strokeWidth: 3,
      markerSymbol: "ABC",
    });
    viewer.dataSources.add(captureLocations);

    const pointStyle = new PointGraphics({
      pixelSize: 5,
      color: Color.YELLOW,
    });

    const pointStyleEmpty = new PointGraphics({
      pixelSize: 4,
      color: Color.LIGHTGRAY,
    });

    // Change the style of the markers to circles and remove billboards
    captureLocations.entities.values.forEach((entity) => {
      if (entity.position) {
        entity.point = entity.properties.HAS_FOOTPRINT
          ? pointStyle
          : pointStyleEmpty;
        entity.billboard = undefined; // Remove the default billboard
      }
    });
    return { captureLocations, footprints, lines };
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
  const [meshQuality, setMeshQuality] = useState<number>(1);
  const [lineOptions, setLineOptions] = useState<
    { label: string; value: string }[]
  >([]);
  const [waypointOptions, setWaypointOptions] = useState<
    { label: string; value: string }[]
  >([]);
  const [selectedLine, setSelectedLine] = useState<string | null>(null);
  const [selectedWaypoint, setSelectedWaypoint] = useState<string | null>(null);
  const [captureLocationsDataSource, setCaptureLocationsDataSource] =
    useState<GeoJsonDataSource | null>(null);
  const [footprintsDataSource, setFootprintsDataSource] =
    useState<GeoJsonDataSource | null>(null);
  const [lines, setLines] = useState<Record<string, Record<string, any>> | {}>(
    {}
  );
  const [isFiltered, setIsFiltered] = useState(false);
  const [showFootprints, setShowFootprints] = useState<
    "ALL" | "NONE" | "SOUTH" | "NORTH" | "EAST" | "WEST"
  >("ALL");

  const handleCameraPOVChange = (value: number) => {
    setSliderValue(value);
    if (viewerRef.current) {
      const camera = viewerRef.current.scene.camera;
      if (camera.frustum instanceof PerspectiveFrustum) {
        camera.frustum.fov = CesiumMath.toRadians(value);
      }
    }
  };

  const handleMeshQualityChange = (value: number) => {
    setMeshQuality(value);
    if (tilesetRef.current) {
      tilesetRef.current.maximumScreenSpaceError = value;
      tilesetRef.current.dynamicScreenSpaceError = false;
    }
  };

  const goToEntity = (line: string, waypoint: string) => {
    const entity = captureLocationsDataSource?.entities.values.find(
      (e) => e.properties.LINE_WAYPOINT.getValue() === `${line}:${waypoint}`
    );
    if (entity && viewerRef.current) {
      const position = entity.position.getValue(JulianDate.now());
      viewerRef.current.scene.camera.flyTo({
        destination: position,
        duration: 2,
      });
    }
  };

  const handleLineChange = (line: string, waypoint: string) => {
    setSelectedLine(line);
    goToEntity(line, waypoint);
  };

  const handleLineIncrement = (
    selectedLine: string,
    waypoint: string,
    increment: -1 | 1 = 1,
    options: { value: string }[]
  ) => {
    if (!selectedLine || !options.length) return;
    const currentIndex = options.findIndex(
      (option) => option.value === selectedLine
    );
    const nextIndex = (currentIndex + increment) % options.length;
    const nextValue = options[nextIndex].value;
    handleLineChange(nextValue, waypoint);
  };
  const handleWaypointChange = (line: string, waypoint: string) => {
    setSelectedWaypoint(waypoint);
    goToEntity(line, waypoint);
  };

  const handleWaypointIncrement = (
    line: string,
    selectedWaypoint: string,
    increment: -1 | 1 = 1,
    options: { value: string }[]
  ) => {
    if (!selectedWaypoint || !options.length) return;
    const currentIndex = options.findIndex(
      (option) => option.value === selectedWaypoint
    );
    const nextIndex = (currentIndex + increment) % options.length;
    const nextValue = options[nextIndex].value;
    handleWaypointChange(line, nextValue);
  };

  const filterCaptureLocations = () => {
    if (captureLocationsDataSource) {
      setIsFiltered((prev) => !prev);
      captureLocationsDataSource.entities.values.forEach((entity) => {
        const hasFootprint = entity.properties.hasProperty("HAS_FOOTPRINT");
        entity.show = isFiltered || hasFootprint;
      });
      viewerRef.current?.scene.requestRender();
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
          const { captureLocations, footprints, lines } =
            await loadAndPrepareGeoJson(
              viewer,
              POSITIONS_GEOJSON_URI,
              FOOTPRINTS_SAMPLE_URI
            );
          setCaptureLocationsDataSource(captureLocations);
          setFootprintsDataSource(footprints);
          setLines(lines);
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

  useEffect(() => {
    if (
      viewerRef.current &&
      viewerRef.current.scene.camera.frustum instanceof PerspectiveFrustum
    ) {
      const initialFov = CesiumMath.toDegrees(
        viewerRef.current.scene.camera.frustum.fov
      );
      setSliderValue(initialFov);
    }
  }, []);

  useEffect(() => {
    if (lines && Object.keys(lines).length > 0) {
      const lineOpts = Object.keys(lines)
        .sort()
        .map((key) => ({
          label: key,
          value: key,
        }));
      setLineOptions(lineOpts);
    }
  }, [lines]);

  useEffect(() => {
    if (lines && selectedLine && Object.keys(lines[selectedLine]).length > 0) {
      const waypointOpts = Object.keys(lines[selectedLine])
        .sort()
        .map((key) => ({
          label: key,
          value: key,
        }));
      setWaypointOptions(waypointOpts);
    }
  }, [selectedLine, lines]);

  useEffect(() => {
    if (viewerRef.current) {
      const handler = new ScreenSpaceEventHandler(
        viewerRef.current.scene.canvas
      );

      handler.setInputAction((movement) => {
        const pickedObject = viewerRef.current.scene.pick(movement.position);
        if (defined(pickedObject) && pickedObject.id) {
          const entity = pickedObject.id;
          const line = entity.properties.LINE.getValue();
          const waypoint = entity.properties.WAYPOINT.getValue();
          setSelectedLine(line);
          setSelectedWaypoint(waypoint);
        }
      }, ScreenSpaceEventType.LEFT_CLICK);

      return () => {
        handler.destroy();
      };
    }
  }, [viewerRef]);

  useZoomToTilesetOnReady(viewerRef, tilesetRef, tilesetReady);
  return (
    <>
      <div ref={containerRef} style={{ width: "100%", height: "100vh" }} />
      <UiBottom>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <Button
            onClick={() =>
              handleLineIncrement(
                selectedLine,
                selectedWaypoint,
                -1,
                lineOptions
              )
            }
          >
            -
          </Button>
          <Select
            style={{ width: 200 }}
            options={lineOptions}
            onChange={(value) => handleLineChange(value, selectedWaypoint)}
            value={selectedLine}
            placeholder="Select Line"
          />
          <Button
            onClick={() =>
              handleLineIncrement(
                selectedLine,
                selectedWaypoint,
                1,
                lineOptions
              )
            }
          >
            +
          </Button>
          <Divider type="vertical" />
          <Button
            onClick={() =>
              handleWaypointIncrement(
                selectedLine,
                selectedWaypoint,
                -1,
                waypointOptions
              )
            }
          >
            -
          </Button>
          <Select
            style={{ width: 200 }}
            options={waypointOptions}
            onChange={(value) => handleWaypointChange(selectedLine, value)}
            value={selectedWaypoint}
            placeholder="Select Waypoint"
          />
          <Button
            onClick={() =>
              handleWaypointIncrement(
                selectedLine,
                selectedWaypoint,
                1,
                waypointOptions
              )
            }
          >
            +
          </Button>
          <Divider type="vertical" />
          <Button onClick={filterCaptureLocations}>
            {isFiltered ? "Show" : "Hide"} Locations without Footprint
          </Button>
        </div>
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
        <div
          style={{ display: "flex", alignItems: "center", marginTop: "10px" }}
        >
          <FontAwesomeIcon icon={faCirclePlus} />
          <Slider
            min={0.2}
            max={5}
            step={0.1}
            onChange={handleMeshQualityChange}
            value={meshQuality}
            tooltip={{ formatter: (value) => `Mesh maxError: ${value}` }}
            style={{ flex: 1 }}
          />
          <FontAwesomeIcon icon={faCircleMinus} />
        </div>
      </UiBottom>
    </>
  );
};

export default ObliqueAndMesh;
