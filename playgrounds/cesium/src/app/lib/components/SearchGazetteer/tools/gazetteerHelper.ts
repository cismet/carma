// adapted from react-cismap/tools/gazetteerHelper

import * as L from 'leaflet';
import proj4, { Converter } from 'proj4';
import { PROJ4_CONVERTERS } from './geo';
import {
  BoundingSphere,
  Cartesian3,
  Cartographic,
  EasingFunction,
  Scene,
  Viewer,
} from 'cesium';
import {
  GazDataItem,
  ModelAsset,
  PayloadItem,
  SourceWithPayload,
} from '../types';
import {
  distanceFromZoomLevel,
  getHeadingPitchRangeFromZoom,
  getPositionWithElevationAsync,
} from './cesium';
import { addMarker, removeMarker } from './cesium3dMarker';

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
            console.log('done');
            const pos = await getPositionWithElevationAsync(
              scene,
              Cartographic.fromDegrees(lon, lat)
            );

            const targetWithElevation = Cartesian3.fromRadians(
              pos.longitude,
              pos.latitude,
              pos.height
            );

            const hprEnd = getHeadingPitchRangeFromZoom(zoom, 0, -45);

            scene.camera.flyToBoundingSphere(
              new BoundingSphere(targetWithElevation),
              {
                offset: hprEnd,
                duration: 3,
                //easingFunction: EasingFunction.SINUSOIDAL_OUT
              }
            );
          },
        }
      );
    }
  },
  setZoom: (scene: Scene, zoom: number) => scene && scene.camera.zoomIn(zoom),
  fitBoundingSphere: (scene: Scene, bounds: BoundingSphere) =>
    scene && scene.camera.flyToBoundingSphere(bounds),
};

const getPosInWGS84 = ({ x, y }, refSystem: Converter) => {
  const coords = PROJ4_CONVERTERS.CRS4326.forward(refSystem.inverse([x, y]));
  return {
    lat: coords[1],
    lon: coords[0],
  };
};

// TODO should be handeld by app state not here
const getUrlFromSearchParams = () => {
  let url: string | null = null;
  const logGazetteerHit = new URLSearchParams(window.location.href).get(
    'logGazetteerHits'
  );

  if (logGazetteerHit === '' || logGazetteerHit === 'true') {
    url = window.location.href.split('?')[0]; // console.log(url + '?gazHit=' + window.btoa(JSON.stringify(hit[0])));
  }
  return url;
};

export type GazetteerOptions = {
  setGazetteerHit?: (hit: any) => void;
  setOverlayFeature?: (feature: any) => void;
  furtherGazeteerHitTrigger?: (hit: any) => void;
  suppressMarker?: boolean;
  mapActions?: MapActions;
  marker3dStyle?: ModelAsset;
};

const defaultGazetteerOptions = {
  referenceSystem: undefined,
  referenceSystemDefinition: PROJ4_CONVERTERS.CRS25832,
  suppressMarker: false,
};

export const builtInGazetteerHitTrigger = (
  hit,
  mapConsumers: MapConsumer[],
  {
    setGazetteerHit,
    setOverlayFeature,
    furtherGazeteerHitTrigger,
    suppressMarker,
    mapActions = { leaflet: {}, cesium: {} },
    marker3dStyle,
  }: GazetteerOptions = defaultGazetteerOptions
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

    const { crs } = hitObject;

    console.log('hitObject', hitObject, hitObject.more.zl, crs, hitObject.crs);

    let refSystemConverter = proj4ConverterLookup[crs];
    if (!refSystemConverter) {
      console.log('create new proj4 converter for', crs);
      refSystemConverter = proj4(`EPSG:${crs}`);
      proj4ConverterLookup[crs] = refSystemConverter;
    }

    const pos = getPosInWGS84(hitObject, refSystemConverter); //console.log(pos)
    const zoom = hitObject.more.zl ?? DEFAULT_ZOOM_LEVEL;

    console.log(mapConsumers, mapActions, pos, zoom);

    mapConsumers.forEach(async (mapElement) => {
      console.log('mapElement', mapElement);
      if (mapElement instanceof Viewer) {
        //console.log('lookAt', mapElement, pos, zoom);
        // add marker entity to map
        removeMarker(mapElement);
        const posElevation = await getPositionWithElevationAsync(
          mapElement.scene,
          Cartographic.fromDegrees(pos.lon, pos.lat)
        );

        console.log('posElevation', posElevation);

        marker3dStyle && addMarker(mapElement, posElevation, marker3dStyle);
        cAction.lookAt(mapElement.scene, pos, zoom);
      } else if (mapElement instanceof L.Map) {
        lAction.panTo(mapElement, pos);
      } else {
        console.warn('Unsupported map type', mapElement);
      }
    });

    // TODO reimplementation of other map actions for leaflet and cesium
    /*

    if (zoom) {
      // todo  handle zoom with panTo as optional animation
      leafletElement.setZoom(hitObject.more.zl, {
        animate: false,
      });

      if (suppressMarker === false) {
        //show marker
        setGazetteerHit(hitObject);
        setOverlayFeature(null);
      }
    } else if (hitObject.more.g) {
      var feature = turfHelpers.feature(hitObject.more.g);

      if (!feature.crs) {
        console.log('xxx no crs therefore context based crs', referenceSystem);
        const refSys =
          referenceSystem !== undefined
            ? referenceSystem.code.split('EPSG:')[1]
            : '25832';
        feature.crs = {
          type: 'name',
          properties: {
            name: 'urn:ogc:def:crs:EPSG::' + refSys,
          },
        };
      }

      console.log('xxx no crs therefore context based crs. feature:', feature);
      var bb = bboxCreator(feature);

      if (suppressMarker === false) {
        setGazetteerHit(null);
        setOverlayFeature(feature);
      }

      leafletElement.fitBounds(
        convertBBox2Bounds(bb, referenceSystemDefinition)
      );
    }
    

    setTimeout(() => {
      if (furtherGazeteerHitTrigger !== undefined) {
        furtherGazeteerHitTrigger(hit);
      }
    }, 200);
    */
  } else {
    console.info('unhandled hit:', hit);
  }
};

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
  sources: SourceWithPayload[]
): GazDataItem[] => {
  let sorter = 0;
  const gazData: GazDataItem[] = [];

  sources.forEach((source) => {
    const { topic, payload, crs, url } = source;
    if (typeof payload !== 'string') {
      console.warn('payload is not a string', topic, url, payload);
      return;
    }

    const items = JSON.parse(payload);
    items.forEach(
      ({
        s: string = '',
        g: glyph = '',
        x,
        y,
        m: more = {},
        n = '',
        nr,
        z,
      }: PayloadItem = dummyItem) => {
        if (x === undefined || y === undefined) {
          console.info('missing coordinates', topic, url, payload);
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
          case 'aenderungsv':
            g.overlay = 'F';
            break;
          case 'adressen':
            if (nr !== '' && nr !== 0) {
              g.string += ' ' + nr;
            }
            if (z !== '') {
              g.string += ' ' + z;
            }
            break;
          case 'bplaene':
            g.overlay = 'B';
            break;
          case 'ebikes':
            g.string = n;
            g.glyph = more.id?.startsWith('V') ? 'bicycle' : 'charging-station';
            break;
          case 'emob':
            g.string = n;
            break;
          case 'geps':
            g.glyph = 'code-fork';
            break;
          case 'geps_reverse':
            g.glyph = 'code-fork';
            break;
          case 'no2':
            g.glyphPrefix = 'fab ';
            break;
          case 'prbr':
            g.string = n;
            break;
          default:
            break;
        }

        gazData.push(g);
      }
    );
  });

  return gazData;
};

/*
export const getGazDataFromSourcesVerbatim = (sources: SourceWithPayload[]) => {
  let sorter = 0;
  const gazData: GazDataItem[] = [];

  for (const source of sources) {
    const { topic, payload, crs, url } = source;
    if (typeof payload !== 'string') {
      console.warn('payload is not a string', topic, url, payload);
      continue;
    }
    if (topic === 'pois') {
      const pois = JSON.parse(payload);
      for (let i = 0; i < pois.length; ++i) {
        const topicItem = pois[i];
        let g = {
          sorter: sorter++,
          string: topicItem.s,
          glyph: topicItem.g,
          x: topicItem.x,
          y: topicItem.y,
          more: topicItem.m,
          type: 'pois',
          crs, //  TODO: maybe skip for default one
        };
        gazData.push(g);
      }
    }

    if (topic === 'bpklimastandorte') {
      const bpklimastandorte = JSON.parse(payload);

      for (let i = 0; i < bpklimastandorte.length; ++i) {
        const topicItem = bpklimastandorte[i];
        let g = {
          sorter: sorter++,
          string: topicItem.s,
          glyph: topicItem.g,
          x: topicItem.x,
          y: topicItem.y,
          more: topicItem.m,
          type: 'bpklimastandorte',
        };
        gazData.push(g);
      }
    }

    if (topic === 'quartiere') {
      const quartiere = JSON.parse(payload);

      for (let i = 0; i < quartiere.length; ++i) {
        const topicItem = quartiere[i];
        let g = {
          sorter: sorter++,
          string: topicItem.s,
          glyph: topicItem.g,
          x: topicItem.x,
          y: topicItem.y,
          more: topicItem.m,
          type: 'quartiere',
        };
        gazData.push(g);
      }
    }

    if (topic === 'bezirke') {
      const bezirke = JSON.parse(payload);

      for (let i = 0; i < bezirke.length; ++i) {
        const topicItem = bezirke[i];
        let g = {
          sorter: sorter++,
          string: topicItem.s,
          glyph: topicItem.g,
          x: topicItem.x,
          y: topicItem.y,
          more: topicItem.m,
          type: 'bezirke',
        };
        gazData.push(g);
      }
    }

    if (topic === 'kitas') {
      const kitas = JSON.parse(payload);

      for (let i = 0; i < kitas.length; ++i) {
        const topicItem = kitas[i];
        let g = {
          sorter: sorter++,
          string: topicItem.s,
          glyph: topicItem.g,
          x: topicItem.x,
          y: topicItem.y,
          more: topicItem.m,
          type: 'kitas',
        };
        gazData.push(g);
      }
    }

    if (topic === 'no2') {
      const no2 = JSON.parse(payload);

      for (let i = 0; i < no2.length; ++i) {
        const topicItem = no2[i];
        let g = {
          sorter: sorter++,
          string: topicItem.s,
          glyph: topicItem.g,
          glyphPrefix: 'fab ',
          x: topicItem.x,
          y: topicItem.y,
          more: topicItem.m,
          type: 'no2',
        };
        gazData.push(g);
      }
    }

    if (topic === 'adressen') {
      const adressen = JSON.parse(payload);

      for (let i = 0; i < adressen.length; ++i) {
        const topicItem = adressen[i];
        let string = topicItem.s;

        if (topicItem.nr !== '' && topicItem.nr !== 0) {
          string = string + ' ' + topicItem.nr;
        }

        if (topicItem.z !== '') {
          string = string + ' ' + topicItem.z;
        }

        let g = {
          sorter: sorter++,
          string: string,
          glyph: topicItem.g,
          x: topicItem.x,
          y: topicItem.y,
          more: topicItem.m,
          type: 'adressen',
        };
        gazData.push(g);
      }
    }

    if (topic === 'bplaene') {
      const bplaene = JSON.parse(payload);

      for (let i = 0; i < bplaene.length; ++i) {
        const topicItem = bplaene[i];
        let g = {
          sorter: sorter++,
          string: topicItem.s,
          glyph: topicItem.g,
          overlay: 'B',
          x: topicItem.x,
          y: topicItem.y,
          more: topicItem.m,
          type: 'bplaene',
        };
        gazData.push(g);
      }
    }

    if (topic === 'aenderungsv') {
      const aev = JSON.parse(payload);

      for (let i = 0; i < aev.length; ++i) {
        const topicItem = aev[i];
        let g = {
          sorter: sorter++,
          string: topicItem.s,
          glyph: topicItem.g,
          overlay: 'F',
          x: topicItem.x,
          y: topicItem.y,
          more: topicItem.m,
          type: 'aenderungsv',
        };
        gazData.push(g);
      }
    }

    if (topic === 'prbr') {
      const anlagen = JSON.parse(payload);

      for (let i = 0; i < anlagen.length; ++i) {
        const topicItem = anlagen[i];
        const g = {
          sorter: sorter++,
          string: topicItem.n,
          glyph: topicItem.g,
          x: topicItem.x,
          y: topicItem.y,
          more: topicItem.m,
          type: 'prbr',
        };
        gazData.push(g);
      }
    }

    if (topic === 'emob') {
      const tankstellen = JSON.parse(payload);

      for (let i = 0; i < tankstellen.length; ++i) {
        const topicItem = tankstellen[i];
        const g = {
          sorter: sorter++,
          string: topicItem.n,
          glyph: topicItem.g,
          x: topicItem.x,
          y: topicItem.y,
          more: topicItem.m,
          type: 'emob',
        };
        gazData.push(g);
      }
    }

    if (topic === 'ebikes') {
      const stationen = JSON.parse(payload);

      for (let i = 0; i < stationen.length; ++i) {
        const topicItem = stationen[i];
        const verleihstation = topicItem.m.id.startsWith('V');
        const g = {
          sorter: sorter++,
          string: topicItem.n,
          glyph: verleihstation ? 'bicycle' : 'charging-station',
          x: topicItem.x,
          y: topicItem.y,
          more: topicItem.m,
          type: 'ebikes',
        };
        gazData.push(g);
      }
    }

    if (topic === 'geps') {
      const geps = JSON.parse(payload);

      for (let i = 0; i < geps.length; ++i) {
        const topicItem = geps[i];
        const g = {
          sorter: sorter++,
          string: topicItem.s,
          glyph: 'code-fork',
          //topicItem.g,
          x: topicItem.x,
          y: topicItem.y,
          more: topicItem.m,
          type: 'geps',
        };
        gazData.push(g);
      }
    }

    if (topic === 'geps_reverse') {
      const geps_reverse = JSON.parse(payload);

      for (let i = 0; i < geps_reverse.length; ++i) {
        const topicItem = geps_reverse[i];
        const g = {
          sorter: sorter++,
          string: topicItem.s,
          glyph: 'code-fork',
          //topicItem.g,
          x: topicItem.x,
          y: topicItem.y,
          more: topicItem.m,
          type: 'geps_reverse',
        };
        gazData.push(g);
      }
    }
  }

  return gazData;
};
*/
