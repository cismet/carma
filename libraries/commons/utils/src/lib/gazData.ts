import proj4 from "proj4";
import objectAssign from "object-assign";
import bboxCreator from "@turf/bbox";
import * as turfHelpers from "@turf/helpers";
import { ENDPOINT } from "@carma-commons/resources";
import { proj4crs25832def } from "@carma-commons/geo/proj";
import { md5FetchText } from "./fetching/fetching";
import { convertBBox2Bounds } from "./proj4helpers";

export type GazDataSourceConfig = {
  topic: ENDPOINT;
  url: string;
  crs: string;
};

export type GazDataConfig = {
  crs: string;
  sources: GazDataSourceConfig[];
  prefix?: string;
  landParcelUrl?: string;
};

type SourceWithPayload = GazDataSourceConfig & {
  payload?: unknown;
};

type PayloadItem = {
  s?: string;
  g?: string;
  x?: number;
  y?: number;
  z?: string; // to do checke type of Z
  m?: { id?: string };
  n?: string;
  nr?: string | number;
};

export type GazDataItem = {
  sorter: number;
  string: string;
  glyph: string;
  glyphPrefix?: string;
  overlay?: string;
  x: number;
  y: number;
  more?: { zl?: number; id?: string | number };
  type: string;
  crs: string;
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
    if (typeof payload !== "string") {
      console.warn("payload is not a string", topic, url, payload);
      return;
    }

    console.debug("gazdata payload crs", crs, topic, url);

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
          case "bplaene.v2":
            g.overlay = "B";
            break;
          case "ebikes":
            g.string = n;
            g.glyph = more.id?.startsWith("V") ? "bicycle" : "charging-station";
            break;
          case "vorhabenkarte":
            g.string = n;
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
      }
    );
  });

  return gazData;
};

export const getGazData = async (
  config: GazDataConfig,
  setGazData?: (gazData: GazDataItem[]) => void
) => {
  await Promise.all(
    config.sources.map(async (source) => {
      (source as SourceWithPayload).payload = await md5FetchText(
        config.prefix ?? "",
        source.url
      );
    })
  );

  const gazData = getGazDataFromSources(config.sources as SourceWithPayload[]);

  setGazData?.(gazData);
  return gazData;
};

export const builtInGazetteerHitTrigger = ({
  hit,
  leafletElement,
  referenceSystem,
  referenceSystemDefinition = proj4crs25832def,
  setGazetteerHit,
  setOverlayFeature,
  furtherGazeteerHitTrigger,
  suppressMarker = false,
  padding,
}: {
  hit;
  leafletElement;
  referenceSystem;
  referenceSystemDefinition?: string;
  setGazetteerHit;
  setOverlayFeature;
  furtherGazeteerHitTrigger?;
  suppressMarker?: boolean;
  padding?: [number, number];
}) => {
  if (
    hit !== undefined &&
    hit.length !== undefined &&
    hit.length > 0 &&
    hit[0].x !== undefined &&
    hit[0].y !== undefined
  ) {
    let logGazetteerHit = new URLSearchParams(window.location.href).get(
      "logGazetteerHits"
    );
    if (logGazetteerHit !== null) {
      let url = window.location.href.split("?")[0];

      // console.log(url + '?gazHit=' + window.btoa(JSON.stringify(hit[0])));
    }

    const pos = proj4(
      referenceSystemDefinition || proj4crs25832def,
      "EPSG:4326",
      [hit[0].x, hit[0].y]
    );
    //console.log(pos)
    leafletElement.panTo([pos[1], pos[0]], {
      animate: false,
    });

    let hitObject = objectAssign({}, hit[0]);

    //Change the Zoomlevel of the map
    if (hitObject.more.zl) {
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
        console.log("xxx no crs therefore context based crs", referenceSystem);

        const refSys =
          referenceSystem !== undefined
            ? referenceSystem.code.split("EPSG:")[1]
            : "25832";

        feature.crs = {
          type: "name",
          properties: {
            name: "urn:ogc:def:crs:EPSG::" + refSys,
          },
        };
      }
      console.log("xxx no crs therefore context based crs. feature:", feature);

      var bb = bboxCreator(feature);
      if (suppressMarker === false) {
        setGazetteerHit(null);
        setOverlayFeature(feature);
      }

      leafletElement.fitBounds(
        convertBBox2Bounds(
          bb,
          proj4(referenceSystemDefinition || proj4crs25832def)
        ),
        padding ? { padding } : undefined
      );
    }
    setTimeout(() => {
      if (furtherGazeteerHitTrigger !== undefined) {
        furtherGazeteerHitTrigger(hit);
      }
    }, 200);
  } else {
    //console.log(hit);
  }
};
