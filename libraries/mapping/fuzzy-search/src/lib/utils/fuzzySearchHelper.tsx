import {
  SearchResultItem,
  SearchResult,
  Option,
  GruppedOptions,
  SourceConfig,
  GazDataItem,
  SourceWithPayload,
  PayloadItem,
  SearchConfig,
} from "../..";
import { md5FetchText } from "./fetching";
import L from "leaflet";
import proj4 from "proj4";
import { convertBBox2Bounds, PROJ4_CONVERTERS } from "./geo";
import {
  BoundingSphere,
  Cartesian3,
  Cartographic,
  ClassificationType,
  Color,
  ColorGeometryInstanceAttribute,
  Entity,
  GeometryInstance,
  GroundPrimitive,
  HeightReference,
  PolygonGeometry,
  Scene,
  Viewer,
} from "cesium";
import {
  polygonHierarchyFromPolygonCoords,
  getHeadingPitchRangeFromZoom,
  getPositionWithHeightAsync,
  distanceFromZoomLevel,
  invertedPolygonHierarchy,
  removeGroundPrimitiveById,
} from "./cesium";
import { DEFAULT_SRC_PROJ } from "../config";
import bbox from '@turf/bbox';
import { feature } from '@turf/helpers';
import { ModelAsset } from "@carma-mapping/cesium-engine";
import { RoutedMap } from 'react-cismap';

export const renderTitle = (category: string) => {
  let title = "???";
  switch (category) {
    case "pois":
      title = "POIS";
      break;
    case "bpklimastandorte":
      title = "Klimastandorte";
      break;
    case "kitas":
      title = "Kitas";
      break;
    case "bezirke":
      title = "Bezirke";
      break;
    case "quartiere":
      title = "Quartiere";
      break;
    case "adressen":
      title = "Adressen";
      break;
    default:
      title = category;
      break;
  }
  return <span>{title}</span>;
};
export const joinNumberLetter = (name: string) =>
  name.replace(/(\d+)\s([a-zA-Z])/g, "$1$2");
export const renderItem = (address: SearchResultItem) => {
  const addressLabel = buildAddressWithIconUI(address, false);
  return {
    key: address.sorter,
    value: address.string,
    label: addressLabel,
    sData: address,
  };
};
export function buildAddressWithIconUI(
  addresObj: SearchResultItem,
  showScore = false,
  score?: number,
) {
  let icon;
  if (addresObj.glyph === "pie-chart") {
    icon = "chart-pie";
  } else {
    icon = addresObj.glyph;
  }
  const streetLabel = (
    <div style={{ paddingLeft: "0.3rem" }}>
      <span style={{ marginRight: "0.4rem" }}>
        <i className={icon && "fas " + "fa-" + icon}></i>
        {"  "}
      </span>
      <span>
        {showScore ? (
          <span>
            <span>{joinNumberLetter(addresObj.string)}</span>
            <span style={{ color: "gray" }}> ({score})</span>
          </span>
        ) : (
          joinNumberLetter(addresObj.string)
        )}
      </span>
    </div>
  );

  return streetLabel;
}
export const generateOptions = (
  results: SearchResult<SearchResultItem>[],
  showScore = false,
) => {
  return results.map((result, idx) => {
    const streetLabel = buildAddressWithIconUI(
      result.item,
      showScore,
      result.score,
    );
    return {
      key: result.item.sorter,
      label: <div>{streetLabel}</div>,
      value: result.item?.string,
      sData: result.item,
    };
  });
};
export const mapDataToSearchResult = (
  data: SearchResult<SearchResultItem>[],
) => {
  const splittedCategories: { [key: string]: Option[] } = {};

  data.forEach((item) => {
    const address = item.item;
    const catName = address.type;

    if (splittedCategories.hasOwnProperty(catName)) {
      splittedCategories[catName].push(renderItem(address));
    } else {
      splittedCategories[catName] = [renderItem(address)];
    }
  });

  const prepareOptions: GruppedOptions[] = [];

  Object.keys(splittedCategories).forEach((item) => {
    let optionItem: GruppedOptions = {};

    if (!optionItem.hasOwnProperty(item)) {
      optionItem.label = renderTitle(item);
      optionItem.options = splittedCategories[item];
    }

    prepareOptions.push(optionItem);
  });

  return prepareOptions;
};
const preps = [
  "an",
  "auf",
  "hinter",
  "neben",
  "über",
  "unter",
  "vor",
  "zwischen",
  "durch",
  "für",
  "gegen",
  "ohne",
  "um",
  "mit",
  "bei",
  "nach",
  "in",
  "von",
  "zu",
  "aus",
  "bis",
  "seit",
  "anstatt",
  "außerhalb",
  "innerhalb",
];
const articles = ["der", "die", "das", "den", "dem", "des"];
export const stopwords = [...preps, ...articles];
export function removeStopwords(text, stopwords, prepoHandling) {
  if (prepoHandling) {
    const words = text.split(" ");
    const placeholderWords = words.map((word) => {
      if (stopwords.includes(word.toLowerCase())) {
        // Replace each character in the word with an underscore
        return "_".repeat(word.length);
      }
      return word;
    });
    return placeholderWords.join(" ");
  } else {
    return text;
  }
}
export function prepareGazData(data, prepoHandling) {
  const modifiedData = data.map((item) => {
    const searchData = item?.string;
    const stringWithoutStopWords = removeStopwords(
      searchData,
      stopwords,
      prepoHandling,
    );
    const address = {
      ...item,
      xSearchData: joinNumberLetter(stringWithoutStopWords),
    };
    return address;
  });

  return modifiedData;
}
export function customSort(a, b) {
  if (a.score !== b.score) {
    return a.score - b.score;
  }
  if (a.item.type !== b.item.type) {
    return a.item.type.localeCompare(b.item.type);
  }

  if (!a.item.sorter || !a.item.sorter) {
    return a.item.xSearchData.localeCompare(a.item.xSearchData);
  } else {
    return a.item.sorter - b.item.sorter;
  }
}
export function limitSearchResult(searchRes, limit, cut = 0.4) {
  let limitedScore = searchRes[0].score < cut ? searchRes[0].score : cut;
  let countOfCategories = 1;
  searchRes.forEach((r) => {
    if (r.score <= cut && r.score > limitedScore && countOfCategories < limit) {
      limitedScore = r.score;
      countOfCategories += 1;
    }
  });

  const limitedresults = searchRes.filter((r) => r.score <= limitedScore);

  return limitedresults;
}

const dummyItem = {
  s: undefined,
  g: undefined,
  x: undefined,
  y: undefined,
  m: undefined,
  n: undefined,
  nr: undefined,
};

export const getGazDataFromSources = (
  sources: SourceWithPayload[],
): GazDataItem[] => {
  let sorter = 0;
  const gazData: GazDataItem[] = [];

  sources.forEach((source) => {
    const { topic, payload, crs, url } = source;
    if (typeof payload !== "string") {
      console.warn("payload is not a string", topic, url, payload);
      return;
    }

    const items = JSON.parse(payload);
    items.forEach(
      ({
        s: string = "",
        g: glyph = "",
        x,
        y,
        m: more = {},
        n = "",
        nr,
        z,
      }: PayloadItem = dummyItem) => {
        if (x === undefined || y === undefined) {
          console.info("missing coordinates", topic, url, payload);
          return;
        }

        const g: GazDataItem = {
          sorter: sorter++,
          crs,
          string,
          glyph,
          x,
          y,
          more,
          type: topic,
        };

        switch (topic) {
          case "aenderungsv":
            g.overlay = "F";
            break;
          case "adressen":
            if (nr !== "" && nr !== 0) {
              g.string += " " + nr;
            }
            if (z !== "") {
              g.string += " " + z;
            }
            break;
          case "bplaene":
            g.overlay = "B";
            break;
          case "ebikes":
            g.string = n;
            g.glyph = more.id?.startsWith("V") ? "bicycle" : "charging-station";
            break;
          case "emob":
            g.string = n;
            break;
          case "geps":
            g.glyph = "code-fork";
            break;
          case "geps_reverse":
            g.glyph = "code-fork";
            break;
          case "no2":
            g.glyphPrefix = "fab ";
            break;
          case "prbr":
            g.string = n;
            break;
          default:
            break;
        }

        gazData.push(g);
      },
    );
  });

  return gazData;
};

export const getGazData = async (
  sourcesConfig: SourceConfig[],
  prefix: string,
  setGazData: (gazData: GazDataItem[]) => void,
) => {
  await Promise.all(
    sourcesConfig.map(async (config) => {
      (config as SourceWithPayload).payload = await md5FetchText(
        prefix,
        config.url,
      );
    }),
  );

  const gazData = getGazDataFromSources(sourcesConfig as SourceWithPayload[]);

  setGazData(gazData);
};

const proj4ConverterLookup = {};
const DEFAULT_ZOOM_LEVEL = 16;
export const SELECTED_POLYGON_ID = "searchgaz-highlight-polygon";
export const INVERTED_SELECTED_POLYGON_ID = "searchgaz-inverted-polygon";

type Coord = { lat: number; lon: number };
// type MapType = 'leaflet' | 'cesium';
type LeafletMapActions = {
  panTo: (map: L.Map, { lat, lon }: Coord) => void;
  setZoom: (map: L.Map, zoom: number) => void;
  fitBounds: (map: L.Map, bounds: L.LatLngBoundsExpression) => void;
};
type CesiumMapActions = {
  lookAt: (scene: Scene, { lat, lon }: Coord, zoom: number) => void;
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
  lookAt: async (scene: Scene, { lat, lon }: Coord, zoom: number) => {
    if (scene) {
      const target = Cartesian3.fromDegrees(lon, lat, 150);
      const hpr = getHeadingPitchRangeFromZoom(zoom - 1, 0, -70);
      const range = distanceFromZoomLevel(zoom - 2);

      await scene.camera.flyToBoundingSphere(
        new BoundingSphere(target, range),
        {
          offset: hpr,
          duration: 5,
          //easingFunction: EasingFunction.SINUSOIDAL_IN,
          complete: async () => {
            //console.log('done');
            const pos = await getPositionWithHeightAsync(
              scene,
              Cartographic.fromDegrees(lon, lat),
            );

            const targetWithHeight = Cartesian3.fromRadians(
              pos.longitude,
              pos.latitude,
              pos.height,
            );

            const hprEnd = getHeadingPitchRangeFromZoom(zoom, 0, -45);

            scene.camera.flyToBoundingSphere(
              new BoundingSphere(targetWithHeight),
              {
                offset: hprEnd,
                duration: 3,
                //easingFunction: EasingFunction.SINUSOIDAL_OUT
              },
            );
          },
        },
      );
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
  marker3dStyle?: ModelAsset;
};

const defaultGazetteerOptions = {
  referenceSystem: undefined,
  referenceSystemDefinition: PROJ4_CONVERTERS.CRS25832,
  suppressMarker: false,
  //marker3dStyle?: ModelAsset

};

export const carmaGazetteerHitTrigger = (
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
  }: // marker3dStyle,
    GazetteerOptions = defaultGazetteerOptions,
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

    // TODO location evaluation should be handled by app state and forwareded not in this component
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

    // console.log(mapConsumers, mapActions, pos, zoom);

    mapConsumers.forEach(async (mapElement) => {
      console.log("mapElement", mapElement);
      if (mapElement instanceof Viewer) {
        const viewer = mapElement;
        //console.log('lookAt', mapElement, pos, zoom);
        // add marker entity to map
        // removeMarker(viewer);
        viewer.entities.removeById(SELECTED_POLYGON_ID);
        //viewer.entities.removeById(INVERTED_SELECTED_POLYGON_ID);
        removeGroundPrimitiveById(viewer, INVERTED_SELECTED_POLYGON_ID);
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
            //classificationType: ClassificationType.BOTH,
          });

          viewer.scene.groundPrimitives.add(invertedGroundPrimitive);

          viewer.entities.add(polygonEntity);
          //viewer.entities.add(invertedPolygonEntity);
          viewer.flyTo(polygonEntity);
        } else {
          // marker3dStyle && addMarker(viewer, posHeight, marker3dStyle);
          cAction.lookAt(mapElement.scene, pos, zoom);
        }
      } else if (mapElement instanceof RoutedMap) {
        console.log('xxx mapElement', mapElement, "not implemented");
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

export const getDefaultSearchConfig = (config: SearchConfig): SearchConfig => {
  let prepoHandling;
  let ifShowScore;
  let limit;
  let cut;
  let distance;
  let threshold;

  if (!config.prepoHandling) {
    prepoHandling = false;
  } else {
    prepoHandling = config.prepoHandling;
  }
  if (!config.ifShowScore) {
    ifShowScore = false;
  } else {
    ifShowScore = config.ifShowScore;
  }
  if (!config.limit) {
    limit = 3;
  } else {
    limit = config.limit;
  }
  if (!config.cut) {
    cut = 0.4;
  } else {
    cut = config.cut;
  }
  if (!config.distance) {
    distance = 100;
  } else {
    distance = config.distance;
  }
  if (!config.threshold) {
    threshold = 0.5;
  } else {
    threshold = config.threshold;
  }

  return {
    prepoHandling,
    ifShowScore,
    limit,
    cut,
    distance,
    threshold,
  };
};
