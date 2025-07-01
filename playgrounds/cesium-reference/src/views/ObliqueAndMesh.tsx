import { useEffect, useRef, useState } from "react";
import { Slider, Button, Checkbox } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleMinus,
  faCirclePlus,
  faMagnifyingGlassMinus,
  faMagnifyingGlassPlus,
} from "@fortawesome/free-solid-svg-icons";

import {
  Color,
  GeoJsonDataSource,
  Viewer,
  Math as CesiumMath,
  ScreenSpaceEventHandler,
  defined,
  ScreenSpaceEventType,
  Entity,
  HeadingPitchRoll,
  BoundingSphere,
  PerspectiveFrustum,
} from "cesium";

import { WUPP_MESH_2024 } from "@carma-commons/resources";

import { CardinalDirections, getCardinalDirection } from "../lib/cesiumCompass";

import UiBottom from "../components/UiBottom";
import UiTopRight from "../components/UiTopRight";
import HeadingAndNorthOffset from "../components/HeadingAndNorthOffset";
import LineAndWaypointSelector from "../components/LineAndWaypointSelector";

import useTileset from "../hooks/useTileset";

import {
  linewayPointToId,
  loadAndPrepareGeoJson,
} from "./obliqueAndMesh.utils";

import {
  cesiumConstructorOptions,
  DEFAULT_PREVIEW_LEVEL,
  FOOTPRINTS_SAMPLE_URI,
  POSITIONS_GEOJSON_URI,
  PREVIEW_PATH,
  SELECTED_PIXEL_SIZE,
} from "../config";

const ObliqueAndMesh: React.FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const { tilesetRef, tilesetReady } = useTileset(
    WUPP_MESH_2024.url,
    viewerRef.current
  );

  const [meshQuality, setMeshQuality] = useState<number>(1);
  const [cameraHeading, setCameraHeading] = useState(0);
  const [cameraFOV, setCameraFOV] = useState(20.9);
  const [obliquePitch, setObliquePitch] = useState(-48.1);
  const [flightPatternHeadingOffset, setFlightPatternHeadingOffset] = useState(
    CesiumMath.toRadians(35.4)
  );
  const [previewImageUri, setPreviewImageUri] = useState<string | null>(null);
  const [selectedWaypointId, setSelectedWaypointId] = useState<string | null>(
    "037:163"
  );
  const [selectedWaypointEntity, setSelectedWaypointEntity] =
    useState<Entity | null>(null);
  const [waypoints, setWaypoints] = useState<GeoJsonDataSource | null>(null);
  const [footprints, setFootprints] = useState<GeoJsonDataSource | null>(null);

  const [isFiltered, setIsFiltered] = useState(false);

  const [cameraCardinalDirection, setCameraCardinalDirection] =
    useState<CardinalDirections | null>(null);

  const [flightPatternHeading, setFlightPatternHeading] = useState(0);
  const [flightPatternCardinalDirection, setFlightPatternCardinalDirection] =
    useState<CardinalDirections | null>(null);
  const [highlightedEntity, setHighlightedEntity] = useState<Entity | null>(
    null
  );
  const [showFootprints, setShowFootprints] = useState(false);

  const handleMeshQualityChange = (value: number) => {
    setMeshQuality(value);
    if (tilesetRef.current) {
      tilesetRef.current.maximumScreenSpaceError = value;
      tilesetRef.current.dynamicScreenSpaceError = false;
    }
  };

  const handleMapClick = (line: string, waypoint: string) => {
    const id = linewayPointToId(line, waypoint);

    if (selectedWaypointEntity) {
      // Remove the previously cloned entity
      waypoints?.entities.remove(selectedWaypointEntity);
      viewerRef.current?.scene.requestRender();
      setSelectedWaypointEntity(null);
    }

    const originalEntity = waypoints?.entities.values.find(
      (e) => e.properties.LINE_WAYPOINT.getValue() === id
    );

    if (originalEntity) {
      // Clone the entity and modify its appearance
      const clonedEntity = new Entity({
        position: originalEntity.position,
        point: {
          pixelSize: SELECTED_PIXEL_SIZE,
          color: originalEntity.point.color,
        },
        properties: originalEntity.properties,
      });

      // Add the cloned entity to the data source
      waypoints?.entities.add(clonedEntity);
      setSelectedWaypointEntity(clonedEntity);
      viewerRef.current?.scene.requestRender();
    }
  };

  const updateSelectedWaypoint = (id: string) => {
    if (selectedWaypointEntity) {
      // Remove the previously cloned entity
      waypoints?.entities.remove(selectedWaypointEntity);
      setSelectedWaypointEntity(null);
    }

    const originalEntity = waypoints?.entities.values.find(
      (e) => e.properties.LINE_WAYPOINT.getValue() === id
    );

    if (originalEntity) {
      // Clone the entity and modify its appearance
      const clonedEntity = new Entity({
        position: originalEntity.position,
        point: {
          pixelSize: SELECTED_PIXEL_SIZE,
          color: originalEntity.point.color,
        },
        properties: originalEntity.properties,
      });

      // Add the cloned entity to the data source
      waypoints?.entities.add(clonedEntity);
      setSelectedWaypointEntity(clonedEntity);
      viewerRef.current?.scene.requestRender();
    }
  };

  const filterWaypoints = (waypointsDataSource: GeoJsonDataSource) => {
    waypointsDataSource.entities.values.forEach((entity) => {
      const hasFootprint = entity.properties.hasProperty("HAS_FOOTPRINT");
      entity.show = isFiltered || hasFootprint;
    });
    viewerRef.current?.scene.requestRender();
  };

  useEffect(() => {
    if (viewerRef.current && waypoints) {
      filterWaypoints(waypoints);
    }
  }, [isFiltered, waypoints, viewerRef.current]);

  const drawLinesToWaypoint = (
    footprintEntity: Entity,
    waypointEntity: Entity
  ) => {
    const footprintPositions =
      footprintEntity.polygon.hierarchy.getValue().positions;
    const waypointPosition = waypointEntity.position.getValue();

    footprintPositions.forEach((vertex) => {
      const lineEntity = new Entity({
        polyline: {
          positions: [vertex, waypointPosition],
          width: 2,
          material: Color.RED.withAlpha(0.7),
        },
      });
      waypoints?.entities.add(lineEntity);
    });
  };

  const removeLines = () => {
    const lineEntities = waypoints?.entities.values.filter(
      (entity) => entity.polyline
    );
    lineEntities?.forEach((lineEntity) => {
      waypoints?.entities.remove(lineEntity);
    });
  };

  useEffect(() => {
    if (selectedWaypointEntity && viewerRef.current && footprints) {
      removeLines();
      const footprintEntity = footprints?.entities.values.find(
        (entity) =>
          entity.properties.LINE_WAYPOINT.getValue() === selectedWaypointId
      );
      if (footprintEntity) {
        drawLinesToWaypoint(footprintEntity, selectedWaypointEntity);
      }
    }
  }, [selectedWaypointEntity, footprints, viewerRef.current]);

  useEffect(() => {
    const updateHeading = () => {
      if (viewerRef.current) {
        const heading = viewerRef.current.camera.heading;
        const adjustedHeading =
          (CesiumMath.toDegrees(heading) +
            CesiumMath.toDegrees(flightPatternHeadingOffset)) %
          360;
        setCameraHeading(adjustedHeading);
        setCameraCardinalDirection(getCardinalDirection(adjustedHeading));
      }
    };

    const handler = new ScreenSpaceEventHandler(
      viewerRef.current?.scene.canvas
    );

    handler.setInputAction(updateHeading, ScreenSpaceEventType.MOUSE_MOVE);

    return () => {
      handler.destroy();
    };
  }, [flightPatternHeadingOffset]);

  useEffect(() => {
    updateSelectedWaypoint(selectedWaypointId || "");
  }, [selectedWaypointId]);

  useEffect(() => {
    const initialize = async () => {
      try {
        if (containerRef.current) {
          const viewer = new Viewer(containerRef.current, {
            ...cesiumConstructorOptions,
            //selectionIndicator: true,
            //infoBox: true,
          });
          viewerRef.current = viewer;
          const { waypoints, footprints } = await loadAndPrepareGeoJson(
            viewer,
            POSITIONS_GEOJSON_URI,
            FOOTPRINTS_SAMPLE_URI
          );
          setWaypoints(waypoints);
          setFootprints(footprints);
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
    if (viewerRef.current) {
      const handler = new ScreenSpaceEventHandler(
        viewerRef.current.scene.canvas
      );

      handler.setInputAction((movement) => {
        const pickedObject = viewerRef.current.scene.pick(movement.position);
        if (defined(pickedObject) && pickedObject.id) {
          const entity = pickedObject.id;
          setSelectedWaypointId(entity.properties.LINE_WAYPOINT.getValue());
        }
      }, ScreenSpaceEventType.LEFT_CLICK);

      return () => {
        handler.destroy();
      };
    }
  }, [viewerRef]);

  useEffect(() => {
    if (
      viewerRef.current &&
      viewerRef.current.camera.frustum instanceof PerspectiveFrustum
    ) {
      viewerRef.current.camera.frustum.fov = CesiumMath.toRadians(cameraFOV);
    }
  }, [cameraFOV]);

  useEffect(() => {
    if (footprints && viewerRef.current) {
      const positions = [];
      footprints.entities.values.forEach((entity) => {
        const hierarchy = entity.polygon.hierarchy.getValue();
        if (hierarchy) {
          positions.push(...hierarchy.positions);
        }
      });
      if (positions.length > 0) {
        const boundingSphere = BoundingSphere.fromPoints(positions);
        viewerRef.current.scene.camera.flyToBoundingSphere(boundingSphere, {
          duration: 0,
        });
      }
    }
  }, [footprints, viewerRef.current]);

  useEffect(() => {
    if (footprints) {
      footprints.show = showFootprints && previewImageUri === null;
      viewerRef.current?.scene.requestRender();
    }
  }, [showFootprints, footprints, previewImageUri]);

  // useZoomToTilesetOnReady(viewerRef, tilesetRef, tilesetReady);

  const obliqueKeys = ["ORI_NORTH", "ORI_SOUTH", "ORI_EAST", "ORI_WEST"];
  const ORI_KEYMAP = Object.freeze({
    ORI_NORTH: {
      de: "NORD",
      deFormatted: "Nord",
      valueRadians: CesiumMath.toRadians(0.0),
    },
    ORI_SOUTH: {
      de: "SUED",
      deFormatted: "Süd",
      valueRadians: CesiumMath.toRadians(180.0),
    },
    ORI_EAST: {
      de: "OST",
      deFormatted: "Ost",
      valueRadians: CesiumMath.toRadians(90.0),
    },
    ORI_WEST: {
      de: "WEST",
      deFormatted: "West",
      valueRadians: CesiumMath.toRadians(270.0),
    },
  });

  const alignObliqueView = (waypoint: Entity, orientation: string) => {
    const waypointId = waypoint.properties.LINE_WAYPOINT.getValue();
    const directionValue = ORI_KEYMAP[orientation].de;
    if (waypointId) {
      const footprintEntity = footprints.entities.values.find(
        (entity) =>
          entity.properties.LINE_WAYPOINT.getValue() === waypointId &&
          entity.properties.hasProperty("ORI") &&
          entity.properties.ORI.getValue() === directionValue
      );
      if (footprintEntity && waypoint) {
        setPreviewImageUri(null);
        const waypointPosition = waypoint.position.getValue();
        const viewHeading =
          ORI_KEYMAP[orientation].valueRadians - flightPatternHeadingOffset;
        viewerRef.current.camera.flyTo({
          destination: waypointPosition,
          orientation: new HeadingPitchRoll(
            viewHeading,
            CesiumMath.toRadians(obliquePitch),
            0.0
          ),
          complete: () => {
            setPreviewImageUri(
              `${PREVIEW_PATH}/${DEFAULT_PREVIEW_LEVEL}/${footprintEntity.name}.jpg`
            );
          },
        });
      }
    }
  };

  return (
    <>
      <div ref={containerRef} style={{ width: "100%", height: "100vh" }} />
      {previewImageUri && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <img
            alt="preview"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
            src={previewImageUri}
          />
          <Button
            style={{ position: "absolute", top: 30, right: 30, zIndex: 11 }}
            onClick={() => setPreviewImageUri(null)}
          >
            Close
          </Button>
        </div>
      )}
      <UiTopRight>
        <HeadingAndNorthOffset
          cameraCardinalDirection={cameraCardinalDirection}
          cameraHeading={cameraHeading}
          headingOffset={flightPatternHeadingOffset}
          setHeadingOffset={setFlightPatternHeadingOffset}
        />
      </UiTopRight>
      <UiBottom>
        <LineAndWaypointSelector
          id={selectedWaypointId}
          waypointsDataSource={waypoints}
          setId={setSelectedWaypointId}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <Checkbox
            checked={showFootprints}
            onChange={() => setShowFootprints(!showFootprints)}
          >
            show footprints
          </Checkbox>
          <Checkbox onClick={() => setIsFiltered(!isFiltered)}>
            show all waypoints
          </Checkbox>
          {selectedWaypointEntity && (
            <Button
              onClick={() => {
                const position = selectedWaypointEntity.position.getValue();
                viewerRef.current.scene.camera.flyTo({
                  destination: position,
                });
              }}
            >
              FlyTo Waypoint {selectedWaypointId}
            </Button>
          )}
          {obliqueKeys.map(
            (key) =>
              selectedWaypointEntity?.properties[key] && (
                <Button
                  key={key}
                  onClick={() => alignObliqueView(selectedWaypointEntity, key)}
                >
                  {ORI_KEYMAP[key].deFormatted}
                </Button>
              )
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <FontAwesomeIcon icon={faMagnifyingGlassPlus} />
          <Slider
            min={10}
            max={120}
            step={0.1}
            onChange={(v) => {
              setCameraFOV(v);
              if (
                viewerRef.current &&
                viewerRef.current.camera.frustum instanceof PerspectiveFrustum
              ) {
                viewerRef.current.camera.frustum.fov = CesiumMath.toRadians(v);
              }
              const imageElement = document.querySelector('img[alt="preview"]');
              if (imageElement && imageElement instanceof HTMLImageElement) {
                imageElement.style.opacity = "0.5";
              }
            }}
            onChangeComplete={() => {
              const imageElement = document.querySelector('img[alt="preview"]');
              if (imageElement && imageElement instanceof HTMLImageElement) {
                imageElement.style.opacity = "1";
              }
            }}
            value={cameraFOV}
            tooltip={{ formatter: (value) => `FOV: ${value}°` }}
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
        <div
          style={{ display: "flex", alignItems: "center", marginTop: "10px" }}
        >
          <FontAwesomeIcon icon={faCirclePlus} />
          <Slider
            min={-90}
            max={0}
            step={0.1}
            onChange={(v) => {
              if (viewerRef.current) {
                const currentHeading = viewerRef.current.camera.heading;
                try {
                  viewerRef.current.camera.setView({
                    orientation: {
                      heading: currentHeading,
                      pitch: CesiumMath.toRadians(v),
                      roll: 0.0,
                    },
                  });
                } catch (e) {
                  console.error(e);
                }
              }
              const imageElement = document.querySelector('img[alt="preview"]');
              if (imageElement && imageElement instanceof HTMLImageElement) {
                imageElement.style.opacity = "0.5";
              }
            }}
            onChangeComplete={() => {
              const imageElement = document.querySelector('img[alt="preview"]');
              if (imageElement && imageElement instanceof HTMLImageElement) {
                imageElement.style.opacity = "1";
              }
            }}
            value={
              viewerRef.current
                ? CesiumMath.toDegrees(viewerRef.current.camera.pitch)
                : obliquePitch
            }
            tooltip={{ formatter: (value) => `Pitch: ${value}°` }}
            style={{ flex: 1 }}
          />
          <FontAwesomeIcon icon={faCircleMinus} />
        </div>
      </UiBottom>
    </>
  );
};

export default ObliqueAndMesh;
