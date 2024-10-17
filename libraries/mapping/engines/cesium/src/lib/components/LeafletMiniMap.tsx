import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import { Color, Entity, PolygonGraphics } from "cesium";
import camera_png from "./camera.png";
import { makeLeafletMarkerRotatable } from "./LeafletMiniMap.utils";

import { useCesiumContext } from "../CesiumContextProvider";
import { cameraToCartographicDegrees, getViewerViewportPolygonRing, rectangleToExtentDegrees } from "../utils/cesiumHelpers";
import { polygonHierarchyFromPolygonCoords } from "../utils/cesiumGroundPrimitives";

//TODO sync time externally if needed
const DEFAULT_MODE_2D_3D_CHANGE_FADE_DURATION = 1000;

const cameraIcon = new L.Icon({
  iconUrl: camera_png,
  iconSize: [128, 128],
  iconAnchor: [64, 64],
});

makeLeafletMarkerRotatable(L.Marker as unknown as never);

export const LeafletMiniMap = ({
  layerUrl,
  zoomOffset = 3,
  showRect = false,
  showCesiumPolygon = true,
  viewportLimitResolutionFactor = 4,
}: {
  layerUrl: string;
  zoomOffset?: number;
  showRect?: boolean;
  showCesiumPolygon?: boolean;
  viewportLimitResolutionFactor?: number;
}) => {
  const { viewer } = useCesiumContext();
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (mapContainerRef.current && !mapInstanceRef.current) {
      mapInstanceRef.current = L.map(mapContainerRef.current, {
        center: [51.4556432, 7.0115552], // Centered on Wuppertal
        zoom: 13,
        zoomControl: false,
        attributionControl: false,
      });

      L.tileLayer(layerUrl, {
        maxZoom: 25,
        minZoom: 9,
      }).addTo(mapInstanceRef.current);
      const resizeObserver = new ResizeObserver(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize();
        }
      });
      resizeObserver.observe(mapContainerRef.current);

      /*
      setTimeout(() => {
        mapInstanceRef.current && mapInstanceRef.current.invalidateSize();
      }, 100);

      */
      return () => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.remove();
          mapInstanceRef.current = null;
        }
        resizeObserver.disconnect();
      };
    }
    return;
  }, [layerUrl]);

  useEffect(() => {
    if (mapInstanceRef.current && viewer) {
      const lRect = new L.Rectangle([
        [0, 0],
        [0, 0],
      ]);
      const camMarker = new L.Marker([0, 0], { icon: cameraIcon });
      const viewPolygon = new L.Polygon(
        [
          [
            [0, 0],
            [0, 0],
            [0, 0],
            [0, 0],
          ],
        ],
        {
          color: "rgba(120, 120, 100, 1)",
          weight: 1,
          opacity: 1,
          fillColor: "white",
          fillOpacity: 0.2,
        },
      );

      const lMap = mapInstanceRef.current;

      showRect && lRect.addTo(lMap);
      camMarker.addTo(lMap);
      viewPolygon.addTo(lMap);

      const handleOnChanged = () => {
        const { camera } = viewer;
        const { longitude: lng, latitude: lat } =
          cameraToCartographicDegrees(camera);

        const heading = camera.heading;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (camMarker as any).setRotationAngle(heading);

        camMarker.setLatLng([lat, lng]);

        /*   
        const zoom = cesiumCenterPixelSizeToLeafletZoom(viewer).value;
        zoom &&
          lMap.setView({ lat, lng }, Math.round(zoom - zoomOffset), {
            animate: false,
          });
        */

        const geom = getViewerViewportPolygonRing(viewer, {
          resolutionRange: viewportLimitResolutionFactor,
        });

        if (geom) {
          viewPolygon.setLatLngs(geom as unknown as L.LatLng[]);

          if (showCesiumPolygon) {
            const cesiumPolygon = new PolygonGraphics({
              hierarchy: polygonHierarchyFromPolygonCoords([
                geom.map((coord) => coord.reverse()),
              ]),
              material: Color.YELLOW.withAlpha(0.45),
              //closeBottom: false,
              //closeTop: false,
              height: undefined,
              //extrudedHeight: 200,
              //heightReference: HeightReference.RELATIVE_TO_GROUND,
              //extrudedHeightReference: HeightReference.RELATIVE_TO_GROUND,

              //outline: true,
              //outlineColor: Color.RED.withAlpha(0.8),
              //outlineWidth: 20,
              //fill: false,
            });

            const viewEntity = new Entity({
              id: "viewEntity",
              polygon: cesiumPolygon,
            });

            viewer.entities.removeById("viewEntity");
            viewer.entities.add(viewEntity);
          }
        }
        const rect = camera.computeViewRectangle();
        if (rect) {
          const bounds = rectangleToExtentDegrees(rect).leafletBounds;
          const miniMapBounds = new L.Bounds([
            new L.Point(bounds.SW.lat, bounds.SW.lng),
            new L.Point(bounds.NE.lat, bounds.NE.lng),
            new L.Point(lat, lng),
          ]);
          lRect.setBounds(new L.LatLngBounds(bounds.SW, bounds.NE));
          const tl = miniMapBounds.getTopLeft();
          const br = miniMapBounds.getBottomRight();
          const newBounds = new L.LatLngBounds([tl.x, tl.y], [br.x, br.y]);
          lMap.fitBounds(newBounds, {
            animate: true,
            padding: [20, 20],
          });
        }
      };
      viewer.camera.moveEnd.addEventListener(handleOnChanged);
      viewer.camera.changed.addEventListener(handleOnChanged);

      return () => {
        viewer.camera.moveEnd.removeEventListener(handleOnChanged);
        viewer.camera.changed.removeEventListener(handleOnChanged);
        viewer.entities.removeById("viewEntity");
        viewPolygon.removeFrom(lMap);
        camMarker.removeFrom(lMap);
        lRect.removeFrom(lMap);
      };
    }
    return;
  }, [
    viewer,
    zoomOffset,
    showRect,
    showCesiumPolygon,
    viewportLimitResolutionFactor,
  ]);

  console.log("RENDER: MiniMap");

  return (
    <div
      //ref={mapContainerRef}
      style={{
        position: "absolute",
        zIndex: 100,
        right: 30,
        bottom: 30,
        opacity: 1,
        transition: `opacity ${DEFAULT_MODE_2D_3D_CHANGE_FADE_DURATION}ms ease-in-out`,
        pointerEvents: "none",
        width: "20vw",
        height: "15vw",
      }}
    >
      <div ref={mapContainerRef} style={{ height: "100%", width: "100%" }} />
    </div>
  );
};

export default LeafletMiniMap;
