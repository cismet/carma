import { Card, Radio } from "antd";
import { useEffect, useState, useMemo, useRef } from "react";
import { getPixelResolutionFromZoomAtLatitudeRad } from "@carma/geo/utils";
import { radToDegNumeric, degToRadNumeric } from "@carma/units/helpers";
import { Cartographic } from "@carma/cesium";
import { guardSampleTerrainMostDetailedAsync } from "@carma-mapping/engines/cesium/legacy";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";

export const ElevationDisplay = () => {
  const { activeFramework, isCesium, refs } = useMapFrameworkSwitcherContext();

  // Get refs from context
  const cesiumScene = refs.getCesiumScene();
  const leafletMap = refs.getLeafletMap();
  const terrainProviders = refs.getCesiumTerrainProviders();
  const devicePixelRatio = refs.getResolutionScale() ?? window.devicePixelRatio;
  const [terrainElevation, setTerrainElevation] = useState<number | null>(null);
  const [surfaceElevation, setSurfaceElevation] = useState<number | null>(null);
  const [cameraElevation, setCameraElevation] = useState<number | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(0);
  const [latitude, setLatitude] = useState<number>(0);
  const [equivalentDistance, setEquivalentDistance] = useState<number | null>(
    null
  );
  const [terrainType, setTerrainType] = useState<"TERRAIN" | "MESH">("TERRAIN");
  const isUpdatingRef = useRef(false);

  // Sample terrain elevations when camera moves OR leaflet map moves
  useEffect(() => {
    if (!leafletMap) return;

    const updateElevations = async () => {
      if (isUpdatingRef.current) return;
      isUpdatingRef.current = true;

      try {
        // Get position from Leaflet (works for both 2D and 3D modes)
        const center = leafletMap.getCenter();
        const zoom = leafletMap.getZoom();

        setLatitude(center.lat);
        setZoomLevel(zoom);

        // Update camera elevation if in Cesium mode
        if (cesiumScene && isCesium) {
          const camera = cesiumScene.camera;
          const cartographic = camera.positionCartographic;
          setCameraElevation(cartographic.height);
        } else {
          setCameraElevation(null);
        }

        // Calculate equivalent distance from zoom level
        const earthCircumference = 40075016.686;
        const latRad = degToRadNumeric(center.lat);
        const distance =
          (earthCircumference * Math.cos(latRad)) /
          Math.pow(2, zoom + 8) /
          devicePixelRatio;
        setEquivalentDistance(distance);

        // Sample terrain elevation at map center
        const position = Cartographic.fromDegrees(center.lng, center.lat);

        if (terrainProviders.TERRAIN) {
          const terrainPos = Cartographic.clone(position);
          const terrainSamples = await guardSampleTerrainMostDetailedAsync(
            terrainProviders.TERRAIN,
            [terrainPos]
          );
          if (terrainSamples && terrainSamples.length > 0) {
            setTerrainElevation(terrainSamples[0].height);
          }
        }

        if (terrainProviders.SURFACE) {
          const surfacePos = Cartographic.clone(position);
          const surfaceSamples = await guardSampleTerrainMostDetailedAsync(
            terrainProviders.SURFACE,
            [surfacePos]
          );
          if (surfaceSamples && surfaceSamples.length > 0) {
            setSurfaceElevation(surfaceSamples[0].height);
          }
        }
      } finally {
        isUpdatingRef.current = false;
      }
    };

    // Listen to Leaflet map changes (works in both 2D and 3D modes)
    leafletMap.on("moveend", updateElevations);

    // Also listen to camera changes if in Cesium mode
    let cameraChangedHandler: (() => void) | null = null;
    if (cesiumScene && isCesium) {
      cameraChangedHandler = () => {
        updateElevations();
      };
      cesiumScene.camera.changed.addEventListener(cameraChangedHandler);
    }

    // Initial update
    updateElevations();

    return () => {
      leafletMap.off("moveend", updateElevations);
      if (cesiumScene && cameraChangedHandler) {
        cesiumScene.camera.changed.removeEventListener(cameraChangedHandler);
      }
    };
  }, [
    cesiumScene,
    leafletMap,
    terrainProviders,
    activeFramework,
    devicePixelRatio,
  ]);

  const computed = useMemo(() => {
    // Get FOV from cesium scene (in radians)
    let fovRad = degToRadNumeric(60); // default fallback
    let fovy = fovRad; // vertical FOV

    if (cesiumScene?.camera?.frustum && "fov" in cesiumScene.camera.frustum) {
      const frustum = cesiumScene.camera.frustum as any;
      fovRad = frustum.fov;

      // Calculate fovy based on aspect ratio (same as Cesium does)
      const canvas = cesiumScene.canvas;
      const aspectRatio = canvas.clientWidth / canvas.clientHeight;
      fovy =
        aspectRatio <= 1
          ? fovRad
          : Math.atan(Math.tan(fovRad * 0.5) / aspectRatio) * 2.0;
    }

    // Calculate pixel resolution for Leaflet at current zoom
    const latRad = degToRadNumeric(latitude);
    const leafletPixelResolution = getPixelResolutionFromZoomAtLatitudeRad(
      zoomLevel,
      latRad as any // getPixelResolutionFromZoomAtLatitudeRad expects branded Radians type
    );

    // Calculate equivalent camera height from pixel resolution and FOV
    // Using the pixel resolution formula: pixel_res = (2 * h * tan(fovy/2)) / viewport_height
    // Solving for h: h = (pixel_res * viewport_height) / (2 * tan(fovy/2))
    // This is the camera height above terrain needed to achieve the current pixel resolution
    const tanHalfFovy = Math.tan(fovy / 2);
    const viewportHeight = cesiumScene?.canvas.clientHeight || 768;

    const cameraHeightFromPixelRes =
      (leafletPixelResolution * viewportHeight) / (2 * tanHalfFovy);

    return {
      leafletPixelResolution,
      cameraHeightFromPixelRes, // Equivalent camera height for current pixel resolution
      fovRad,
      fovy,
      tanHalfFovy,
      viewportHeight,
    };
  }, [zoomLevel, latitude, devicePixelRatio, cesiumScene, activeFramework]);

  // Calculate max value for scaling
  const maxValue = Math.max(
    terrainElevation ?? 0,
    surfaceElevation ?? 0,
    cameraElevation ?? 0,
    computed.cameraHeightFromPixelRes,
    100 // minimum scale
  );

  const getBarHeight = (value: number | null) => {
    if (value === null) return 0;
    return Math.max(0, (value / maxValue) * 100);
  };

  const formatElevation = (value: number | null) => {
    if (value === null) return "—";
    return `${Math.round(value)}m`;
  };

  const formatPixelRes = (value: number) => {
    return `${value.toFixed(3)}m/px`;
  };

  return (
    <div
      style={{
        position: "absolute",
        bottom: 16,
        right: 16,
        zIndex: 1000,
      }}
    >
      <Card
        size="small"
        title="Elevation / Zoom Sync"
        style={{
          width: "auto",
        }}
      >
        {/* Current Map Statistics */}
        <div
          style={{
            marginBottom: "12px",
            paddingBottom: "12px",
            borderBottom: "1px solid #f0f0f0",
          }}
        >
          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: "12px", color: "#666" }}>Zoom</div>
              <div style={{ fontSize: "16px", fontWeight: "bold" }}>
                {zoomLevel.toFixed(1)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "12px", color: "#666" }}>Latitude</div>
              <div style={{ fontSize: "16px", fontWeight: "bold" }}>
                {latitude.toFixed(4)}°
              </div>
            </div>
            <div>
              <div style={{ fontSize: "12px", color: "#666" }}>Distance</div>
              <div style={{ fontSize: "16px", fontWeight: "bold" }}>
                ≈{equivalentDistance ? Math.round(equivalentDistance) : 0}m
              </div>
            </div>
          </div>
        </div>

        {/* DEM/DSM Switch */}
        <div style={{ marginBottom: "12px" }}>
          <Radio.Group
            value={terrainType}
            onChange={(e) => setTerrainType(e.target.value)}
            size="small"
          >
            <Radio.Button value="TERRAIN">DEM</Radio.Button>
            <Radio.Button value="MESH">DSM</Radio.Button>
          </Radio.Group>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0px" }}>
          {/* Top Row - Zoom and Camera growing downward to meet the line */}
          <div
            style={{
              display: "flex",
              gap: "8px",
              height: "100px",
              alignItems: "flex-start",
            }}
          >
            {/* Zoom Distance Column */}
            <div
              style={{
                width: "32px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                height: "100%",
              }}
            >
              <div
                style={{
                  fontSize: "10px",
                  color: "#666",
                  marginBottom: "2px",
                  writingMode: "vertical-rl",
                  transform: "rotate(180deg)",
                }}
              >
                Zoom
              </div>
              <div
                style={{
                  fontWeight: "bold",
                  fontSize: "11px",
                  marginBottom: "4px",
                }}
              >
                {formatElevation(computed.cameraHeightFromPixelRes)}
              </div>
              <div
                style={{
                  flex: 1,
                  width: "100%",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "flex-end",
                  position: "relative",
                }}
              >
                <div
                  style={{
                    height: `${getBarHeight(
                      computed.cameraHeightFromPixelRes
                    )}%`,
                    width: "100%",
                    backgroundColor: "#52c41a",
                    transition: "height 0.3s",
                    minHeight: "2px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <div
                    style={{
                      fontSize: "9px",
                      color: "white",
                      fontWeight: "bold",
                      writingMode: "vertical-rl",
                      transform: "rotate(180deg)",
                      textShadow: "0 0 2px rgba(0,0,0,0.5)",
                    }}
                  >
                    Z{zoomLevel.toFixed(1)}
                  </div>
                </div>
              </div>
            </div>

            {/* Camera Column - only show in Cesium mode - split bar showing AGL + selected ground elevation */}
            {isCesium && (
              <div
                style={{
                  width: "32px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  height: "100%",
                }}
              >
                <div
                  style={{
                    fontSize: "10px",
                    color: "#666",
                    marginBottom: "2px",
                    writingMode: "vertical-rl",
                    transform: "rotate(180deg)",
                  }}
                >
                  Camera
                </div>
                <div
                  style={{
                    fontWeight: "bold",
                    fontSize: "11px",
                    marginBottom: "4px",
                  }}
                >
                  {formatElevation(cameraElevation)}
                </div>
                <div
                  style={{
                    flex: 1,
                    width: "100%",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "flex-end",
                  }}
                >
                  {/* AGL (Above Ground Level) - top part */}
                  <div
                    style={{
                      height: `${getBarHeight(
                        (cameraElevation ?? 0) -
                          (terrainType === "TERRAIN"
                            ? terrainElevation ?? 0
                            : surfaceElevation ?? 0)
                      )}%`,
                      width: "100%",
                      backgroundColor: "#1677ff",
                      transition: "height 0.3s",
                      minHeight: "2px",
                    }}
                  />
                  {/* Ground elevation - bottom part (matches selected terrain/surface) */}
                  <div
                    style={{
                      height: `${getBarHeight(
                        terrainType === "TERRAIN"
                          ? terrainElevation
                          : surfaceElevation
                      )}%`,
                      width: "100%",
                      backgroundColor:
                        terrainType === "TERRAIN" ? "#8c8c8c" : "#d946ef",
                      transition: "height 0.3s",
                      minHeight: "2px",
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Dividing Line */}
          <div
            style={{
              height: "2px",
              backgroundColor: "#d9d9d9",
              margin: "0 4px",
            }}
          />

          {/* Bottom Row - Terrain and Surface growing downward from the line */}
          <div
            style={{
              display: "flex",
              gap: "8px",
              height: "100px",
              alignItems: "flex-start",
            }}
          >
            {/* Terrain Column */}
            <div
              style={{
                width: "32px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                height: "100%",
              }}
            >
              <div
                style={{
                  flex: 1,
                  width: "100%",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "flex-start",
                }}
              >
                <div
                  style={{
                    height: `${getBarHeight(terrainElevation)}%`,
                    width: "100%",
                    backgroundColor: "#8c8c8c",
                    transition: "height 0.3s",
                    minHeight: "2px",
                  }}
                />
              </div>
              <div
                style={{
                  fontWeight: "bold",
                  fontSize: "11px",
                  marginTop: "4px",
                }}
              >
                {formatElevation(terrainElevation)}
              </div>
              <div
                style={{
                  fontSize: "10px",
                  color: "#666",
                  marginTop: "2px",
                  writingMode: "vertical-rl",
                }}
              >
                Terrain
              </div>
            </div>

            {/* Surface Column */}
            <div
              style={{
                width: "32px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                height: "100%",
              }}
            >
              <div
                style={{
                  flex: 1,
                  width: "100%",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "flex-start",
                }}
              >
                <div
                  style={{
                    height: `${getBarHeight(surfaceElevation)}%`,
                    width: "100%",
                    backgroundColor: "#d946ef",
                    transition: "height 0.3s",
                    minHeight: "2px",
                  }}
                />
              </div>
              <div
                style={{
                  fontWeight: "bold",
                  fontSize: "11px",
                  marginTop: "4px",
                }}
              >
                {formatElevation(surfaceElevation)}
              </div>
              <div
                style={{
                  fontSize: "10px",
                  color: "#666",
                  marginTop: "2px",
                  writingMode: "vertical-rl",
                }}
              >
                Surface
              </div>
            </div>
          </div>
        </div>

        {/* Scale indicator */}
        <div
          style={{
            marginTop: "8px",
            textAlign: "center",
            fontSize: "12px",
            color: "#999",
          }}
        >
          Max scale: {formatElevation(maxValue)}
        </div>
      </Card>
    </div>
  );
};
