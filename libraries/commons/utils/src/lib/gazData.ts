import { ENDPOINT } from "@carma-commons/resources";
import { md5FetchText } from "./fetching";

export type GazDataSourceConfig = {
  topic: ENDPOINT;
  url: string;
  crs: string;
};

export type GazDataConfig = {
  crs: string;
  sources: GazDataSourceConfig[];
  prefix?: string;
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

  setGazData && setGazData(gazData);
  return gazData;
};
