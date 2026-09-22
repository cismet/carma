import type { MappingConfig } from "@carma-api";

import { isBounds3857, type Bounds3857 } from "./bounds";

/**
 * A show: the scenes a presenter steps through, prepared on the desktop in the
 * pm-show route and stepped through from a phone. Every scene carries its whole
 * map configuration, not the id of a stored one, so switching to it costs the
 * display no fetch: the remote hands over exactly what to draw.
 */

/** marks a stored document as a show, so a wrong key fails loudly */
export const SHOW_FORMAT = "carma-pm-show";
export const SHOW_VERSION = 1;

export type ShowScene = {
  /** stable within the show, so the remote can tell which scene is live */
  id: string;
  title: string;
  /** the map part of a share configuration: layers and base map */
  config: MappingConfig;
  /**
   * Where the display flies for this scene. Optional: a scene without one
   * leaves the display where the previous scene put it.
   */
  bounds?: Bounds3857;
};

export type Show = {
  format: typeof SHOW_FORMAT;
  version: typeof SHOW_VERSION;
  title: string;
  /** ISO timestamp of the publish */
  publishedAt: string;
  scenes: ShowScene[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const isMappingConfig = (value: unknown): value is MappingConfig =>
  isRecord(value) && Array.isArray(value["layers"]);

const isShowScene = (value: unknown): value is ShowScene =>
  isRecord(value) &&
  typeof value["id"] === "string" &&
  typeof value["title"] === "string" &&
  isMappingConfig(value["config"]) &&
  (value["bounds"] === undefined || isBounds3857(value["bounds"]));

export const isShow = (value: unknown): value is Show =>
  isRecord(value) &&
  value["format"] === SHOW_FORMAT &&
  value["version"] === SHOW_VERSION &&
  typeof value["title"] === "string" &&
  Array.isArray(value["scenes"]) &&
  value["scenes"].every(isShowScene);

/** a random scene id; `crypto.randomUUID` needs a secure context, which a LAN dev server is not */
export const newSceneId = (): string =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
