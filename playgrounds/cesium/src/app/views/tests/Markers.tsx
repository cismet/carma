import { useEffect, useMemo, useRef } from "react";
import {
  BillboardCollection,
  Cartesian3,
  Cartographic,
  Color,
  Material,
  PolylineCollection,
  VerticalOrigin,
  type Scene,
} from "@carma-cesium";

import {
  IMAGE_ASSETS,
  MODEL_ASSETS as GLB,
} from "../../config/assets.config";
import {
  addCesiumMarker,
  removeCesiumMarker,
  useCesiumContext,
  type MarkerData,
  type MarkerPrimitiveData,
} from "@carma-mapping/engines/cesium/react/runtime";

type SvgMarkerPrimitiveData = {
  billboards: BillboardCollection;
  stemline: PolylineCollection;
};

const removePrimitive = (
  scene: Scene,
  primitive: BillboardCollection | PolylineCollection | null | undefined
) => {
  if (
    primitive &&
    !primitive.isDestroyed() &&
    !scene.primitives.isDestroyed() &&
    scene.primitives.contains(primitive)
  ) {
    scene.primitives.remove(primitive);
  }
};

const addSvgMarker = (
  scene: Scene,
  marker: MarkerData,
  id: string
): SvgMarkerPrimitiveData | undefined => {
  if (!marker.image) {
    return undefined;
  }

  const [longitude, latitude, height = 0] = marker.position;
  const position = Cartesian3.fromDegrees(longitude, latitude, height);
  const lineTopPosition = Cartesian3.fromDegrees(longitude, latitude, height - 10);
  const groundPosition = Cartesian3.fromDegrees(longitude, latitude, 0);

  const billboards = new BillboardCollection();
  billboards.add({
    id,
    position,
    image: marker.image,
    scale: marker.scale ?? 1,
    verticalOrigin: VerticalOrigin.BOTTOM,
  });
  scene.primitives.add(billboards);

  const stemline = new PolylineCollection();
  stemline.add({
    id: `${id}-stemline`,
    positions: [lineTopPosition, groundPosition],
    width: 4,
    material: Material.fromType("Color", { color: Color.YELLOW }),
  });
  scene.primitives.add(stemline);

  return { billboards, stemline };
};

function View() {
  const { getScene, isRuntimeReady, requestRender } = useCesiumContext();
  const markerDataRef = useRef<MarkerPrimitiveData[]>([]);
  const svgMarkerDataRef = useRef<SvgMarkerPrimitiveData[]>([]);

  const markers = useMemo<MarkerData[]>(
    () => [
      {
        position: [7.2, 51.273, 170],
        image: IMAGE_ASSETS.SvgMarker.uri,
        scale: IMAGE_ASSETS.SvgMarker.scale,
      },
      { position: [7.2, 51.2725, 170], model: GLB.Marker3dFromSvg },
      { position: [7.201, 51.274, 200], model: GLB.Marker },
      { position: [7.199, 51.273, 200], model: GLB.MarkerFacingFixed },
      { position: [7.202, 51.274, 200], model: GLB.MarkerRotating },
      { position: [7.202, 51.273, 200], model: GLB.MarkerRotatingFast },
      { position: [7.202, 51.272, 200], model: GLB.MarkerRotatingSlow },
      { position: [7.202, 51.271, 200], model: GLB.MarkerRotatingCounter },
      { position: [7.203, 51.274, 200], model: GLB.MarkerFacing },
    ],
    []
  );

  useEffect(() => {
    const scene = getScene();
    if (!isRuntimeReady || !scene) {
      return;
    }

    let cancelled = false;

    const addMarkers = async () => {
      const addedMarkers: MarkerPrimitiveData[] = [];
      const addedSvgMarkers: SvgMarkerPrimitiveData[] = [];

      for (const [index, marker] of markers.entries()) {
        if (marker.image) {
          const svgMarker = addSvgMarker(
            scene,
            marker,
            `playground-svg-marker-${index}`
          );

          if (cancelled) {
            removePrimitive(scene, svgMarker?.billboards);
            removePrimitive(scene, svgMarker?.stemline);
          } else if (svgMarker) {
            addedSvgMarkers.push(svgMarker);
          }
          continue;
        }

        if (!marker.model) {
          continue;
        }

        const [longitude, latitude, height = 0] = marker.position;
        const position = Cartographic.fromDegrees(longitude, latitude, height);
        const groundPosition = Cartographic.fromDegrees(longitude, latitude, 0);
        const markerData = await addCesiumMarker(
          scene,
          position,
          groundPosition,
          marker.model,
          { id: `playground-marker-${index}` }
        );

        if (cancelled) {
          removeCesiumMarker(scene, markerData);
        } else if (markerData) {
          addedMarkers.push(markerData);
        }
      }

      markerDataRef.current = addedMarkers;
      svgMarkerDataRef.current = addedSvgMarkers;
      requestRender();
    };

    void addMarkers();

    return () => {
      cancelled = true;
      markerDataRef.current.forEach((markerData) =>
        removeCesiumMarker(scene, markerData)
      );
      svgMarkerDataRef.current.forEach((svgMarkerData) => {
        removePrimitive(scene, svgMarkerData.billboards);
        removePrimitive(scene, svgMarkerData.stemline);
      });
      markerDataRef.current = [];
      svgMarkerDataRef.current = [];
    };
  }, [getScene, isRuntimeReady, markers, requestRender]);

  return null;
}

export default View;
