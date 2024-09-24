import {
  BoundingSphere,
  Cartesian3,
  Cartographic,
  ClassificationType,
  Color,
  ColorGeometryInstanceAttribute,
  EasingFunction,
  Entity,
  GeometryInstance,
  GroundPrimitive,
  HeightReference,
  PolygonGeometry,
  Scene,
  Viewer,
} from "cesium";
import L from "leaflet";
import proj4 from "proj4";

import { RoutedMap } from "react-cismap";

import { ModelAsset } from "@carma-mapping/cesium-engine";
import {
  INVERTED_SELECTED_POLYGON_ID,
  SELECTED_POLYGON_ID,
} from "@carma-mapping/fuzzy-search";

import {
  polygonHierarchyFromPolygonCoords,
  getHeadingPitchRangeFromZoom,
  getPositionWithHeightAsync,
  distanceFromZoomLevel,
  invertedPolygonHierarchy,
  removeGroundPrimitiveById,
} from "./cesium";

import { PROJ4_CONVERTERS } from "./geo";

import { DEFAULT_SRC_PROJ } from "../config";
import { addCesiumMarker, removeCesiumMarker } from "./cesium3dMarker";

const proj4ConverterLookup = {};
const DEFAULT_ZOOM_LEVEL = 16;

type Coord = { lat: number; lon: number };
// type MapType = 'leaflet' | 'cesium';
type LeafletMapActions = {
  panTo: (map: L.Map, { lat, lon }: Coord) => void;
  setZoom: (map: L.Map, zoom: number) => void;
  fitBounds: (map: L.Map, bounds: L.LatLngBoundsExpression) => void;
};
type CesiumMapActions = {
  lookAt: (scene: Scene, pos: Cartographic, zoom: number) => void;
  setZoom: (scene: Scene, zoom: number) => void;
  fitBoundingSphere: (scene: Scene, bounds: BoundingSphere) => void;
};
type MapActions = {
  leaflet: Partial<LeafletMapActions>;
  cesium: Partial<CesiumMapActions>;
};

export type MapConsumer = L.Map | Viewer;

const LeafletMapActions = {
  panTo: (map: L.Map, { lat, lon }: Coord) =>
    map.panTo([lat, lon], { animate: false }),
  setZoom: (map: L.Map, zoom: number) => map.setZoom(zoom, { animate: false }),
  fitBounds: (map: L.Map, bounds: L.LatLngBoundsExpression) =>
    map.fitBounds(bounds),
};

const CesiumMapActions = {
  lookAt: async (
    scene: Scene,
    { longitude, latitude, height }: Cartographic,
    zoom: number,
  ) => {
    if (scene) {
      const center = Cartesian3.fromRadians(longitude, latitude, height);
      const hpr = getHeadingPitchRangeFromZoom(zoom - 1, 0, -70);
      const range = distanceFromZoomLevel(zoom - 2);

      //TODO optional add responsive duration based on distance of target

      scene.camera.flyToBoundingSphere(new BoundingSphere(center, range), {
        offset: hpr,
        //duration: 5,
        easingFunction: EasingFunction.SINUSOIDAL_IN_OUT,
        complete: () => {
          console.info(
            "[CESIUM|ANIMATION] FlytoBoundingSphere Complete",
            center,
          );
        },
      });
    }
  },
  setZoom: (scene: Scene, zoom: number) => scene && scene.camera.zoomIn(zoom),
  fitBoundingSphere: (scene: Scene, bounds: BoundingSphere) =>
    scene && scene.camera.flyToBoundingSphere(bounds),
};

const getPosInWGS84 = ({ x, y }, refSystem: proj4.Converter) => {
  const coords = PROJ4_CONVERTERS.CRS4326.forward(refSystem.inverse([x, y]));
  return {
    lat: coords[1],
    lon: coords[0],
  };
};

const getRingInWGS84 = (
  coords: (string | number)[][],
  refSystem: proj4.Converter,
) =>
  coords
    .map((c) => c.map((v) => (typeof v === "string" ? parseFloat(v) : v)))
    .filter(
      (coords) =>
        !coords.some((c) => isNaN(c) || c === Infinity || c === -Infinity),
    )
    .map((coord) => PROJ4_CONVERTERS.CRS4326.forward(refSystem.inverse(coord)));

// TODO should be handeld by app state not here
const getUrlFromSearchParams = () => {
  let url: string | null = null;
  const logGazetteerHit = new URLSearchParams(window.location.href).get(
    "logGazetteerHits",
  );

  if (logGazetteerHit === "" || logGazetteerHit === "true") {
    url = window.location.href.split("?")[0]; // console.log(url + '?gazHit=' + window.btoa(JSON.stringify(hit[0])));
  }
  return url;
};

export type GazetteerOptions = {
  setGazetteerHit?: (hit: any) => void;
  setOverlayFeature?: (feature: any) => void;
  furtherGazeteerHitTrigger?: (hit: any) => void;
  referenceSystem?: any;
  referenceSystemDefinition?: any;
  suppressMarker?: boolean;
  mapActions?: MapActions;
  cesiumConfig?: {
    markerAsset?: ModelAsset;
    isPrimaryStyle: boolean;
  };
};

const defaultGazetteerOptions = {
  referenceSystem: undefined,
  referenceSystemDefinition: PROJ4_CONVERTERS.CRS25832,
  suppressMarker: false,
};

export const carmaHitTrigger = (
  hit,
  mapConsumers: MapConsumer[],
  {
    setGazetteerHit,
    setOverlayFeature,
    furtherGazeteerHitTrigger,
    referenceSystem,
    referenceSystemDefinition,
    suppressMarker,
    mapActions = { leaflet: {}, cesium: {} },
    cesiumConfig = { isPrimaryStyle: false },
  }: GazetteerOptions = defaultGazetteerOptions,
) => {
  if (hit !== undefined && hit.length !== undefined && hit.length > 0) {
    const lAction = (mapActions.leaflet = {
      ...LeafletMapActions,
      ...mapActions.leaflet,
    } as LeafletMapActions);

    const cAction = (mapActions.cesium = {
      ...CesiumMapActions,
      ...mapActions.cesium,
    } as CesiumMapActions);

    // TODO location evaluation should be handled by app state and forwarded not in this component
    // const url = getUrlFromSearchParams();

    // TODO extend hitobject with parsed and derived data
    const hitObject = Object.assign({}, hit[0]); //Change the Zoomlevel of the map

    const crs = hitObject.crs ?? DEFAULT_SRC_PROJ;
    console.log("xxx crs", hitObject);

    let refSystemConverter = proj4ConverterLookup[crs];
    if (!refSystemConverter && crs !== undefined) {
      console.log("create new proj4 converter for", crs);
      refSystemConverter = proj4(`EPSG:${crs}`);
      proj4ConverterLookup[crs] = refSystemConverter;
    }

    const hasPolygon =
      hitObject.more?.g?.type === "Polygon" &&
      hitObject.more?.g?.coordinates?.length > 0;

    const pos = getPosInWGS84(hitObject, refSystemConverter); //console.log(pos)
    const zoom = hitObject.more.zl ?? DEFAULT_ZOOM_LEVEL;
    const polygon = hasPolygon
      ? hitObject.more.g.coordinates.map((ring) =>
          getRingInWGS84(ring, refSystemConverter),
        )
      : null;
    console.log(
      "hitObject",
      hitObject,
      hitObject.more.zl,
      crs,
      hitObject.crs,
      pos,
      zoom,
      polygon,
    );

    mapConsumers.forEach(async (mapElement) => {
      console.log("mapElement", mapElement);
      if (mapElement instanceof Viewer) {
        const viewer = mapElement;
        // add marker entity to map
        removeCesiumMarker(viewer);
        viewer.entities.removeById(SELECTED_POLYGON_ID);
        //viewer.entities.removeById(INVERTED_SELECTED_POLYGON_ID);
        removeGroundPrimitiveById(viewer, INVERTED_SELECTED_POLYGON_ID);
        viewer.scene.render(); // explicit render for requestRenderMode;
        const posHeight = await getPositionWithHeightAsync(
          viewer.scene,
          Cartographic.fromDegrees(pos.lon, pos.lat),
        );

        if (polygon) {
          const polygonEntity = new Entity({
            id: SELECTED_POLYGON_ID,
            polygon: {
              hierarchy: polygonHierarchyFromPolygonCoords(polygon),
              material: Color.WHITE.withAlpha(0.01),
              outline: false,
              closeBottom: false,
              closeTop: false,
              // needs some Geometry for proper fly to and centering in correct elevation
              extrudedHeight: 1, // falls jemand die Absicht hat eine Mauer zu errichten, kann dies hier getan werden.
              extrudedHeightReference: HeightReference.RELATIVE_TO_GROUND,
              height: 0, // height reference needs top compensate for some terrain variation minus the mount point of the polygon to ground
              heightReference: HeightReference.RELATIVE_TO_GROUND,
            },
          });
          // For the inverted polygon
          const invertedPolygonGeometry = new PolygonGeometry({
            polygonHierarchy: invertedPolygonHierarchy(polygon),
            //height: 0,
          });

          const invertedGeometryInstance = new GeometryInstance({
            geometry: invertedPolygonGeometry,
            id: INVERTED_SELECTED_POLYGON_ID,
            attributes: {
              color: ColorGeometryInstanceAttribute.fromColor(
                Color.GRAY.withAlpha(0.66),
              ),
            },
          });

          const invertedGroundPrimitive = new GroundPrimitive({
            geometryInstances: invertedGeometryInstance,
            allowPicking: false,
            releaseGeometryInstances: false, // needed to get ID
            classificationType: cesiumConfig.isPrimaryStyle
              ? ClassificationType.CESIUM_3D_TILE
              : ClassificationType.BOTH,
          });

          viewer.scene.groundPrimitives.add(invertedGroundPrimitive);

          viewer.entities.add(polygonEntity);
          //viewer.entities.add(invertedPolygonEntity);
          viewer.flyTo(polygonEntity);
        } else {
          cesiumConfig?.markerAsset &&
            addCesiumMarker(viewer, posHeight, cesiumConfig.markerAsset);
          console.log("GAZETTEER: [2D3D|CESIUM|CAMERA] look at Marker");
          cAction.lookAt(mapElement.scene, posHeight, zoom);
        }
      } else if (mapElement instanceof RoutedMap) {
        console.log("xxx mapElement", mapElement, "not implemented");
        /*
          lAction.panTo((mapElement as unknown as {leafletMap: {leafletElement: L.Map}}).leafletMap.leafletElement, pos);
          if (zoom) {
            // todo  handle zoom with panTo as optional animation
            mapElement.setZoom(hitObject.more.zl, {
              animate: false,
            });
  
            if (suppressMarker === false) {
              //show marker
              setGazetteerHit && setGazetteerHit(hitObject);
              setOverlayFeature && setOverlayFeature(null);
            }
          } else if (hitObject.more.g) {
            let hitFeature = feature(hitObject.more.g);
  
            if (!hitFeature.crs) {
              console.log('xxx no crs therefore context based crs', referenceSystem);
              const refSys =
                referenceSystem !== undefined
                  ? referenceSystem.code.split('EPSG:')[1]
                  : '25832';
              hitFeature.crs = {
                type: 'name',
                properties: {
                  name: 'urn:ogc:def:crs:EPSG::' + refSys,
                },
              };
            }
  
            console.log('xxx no crs therefore context based crs. feature:', hitFeature);
            var bb = bbox(hitFeature);
  
            if (suppressMarker === false) {
              setGazetteerHit && setGazetteerHit(null);
              setOverlayFeature && setOverlayFeature(hitFeature);
            }
  
            mapElement.fitBounds(
              convertBBox2Bounds(bb, referenceSystemDefinition) as L.LatLngBoundsExpression
            );
          }
  
          setTimeout(() => {
            if (furtherGazeteerHitTrigger !== undefined) {
              furtherGazeteerHitTrigger(hit);
            }
          }, 200);
          */
      } else {
        console.warn("Unsupported map type", mapElement);
      }
    });
  } else {
    console.info("unhandled hit:", hit);
  }
};

export default carmaHitTrigger;
