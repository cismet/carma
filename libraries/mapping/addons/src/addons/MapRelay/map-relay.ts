import {
  isRelayWriter,
  isTargetTag,
  resolveTargets,
  type RelayMeta,
  type RelayTarget,
  type RelayWriteResult,
  type RelayWriter,
} from "@carma-mapping/show-remote";

import { conditionRouteOf } from "../ConditionalLayer";

/** the hash parameter carrying the show's session code */
export const RELAY_PARAM = "relay";

/** the tag a page applies when its route has no name of its own */
const ROOT_ROUTE_TARGET = "geoportal";

const DEFAULT_WRITERS: readonly RelayWriter[] = ["presenter"];

export type MapRelayConfig = {
  /** map-relay base url; the session code comes from `?relay=` */
  relayBaseUrl?: string;
  /** whose sessions the page follows (default the presenter's) */
  writers?: readonly RelayWriter[];
  /**
   * The target tags the page applies on top of `"*"`, left to right. Default
   * the route's name, `outlet` on `/outlet`, and `geoportal` on `/`.
   */
  targets?: readonly string[];
  /** the writer session the page itself writes through `send`, if any */
  writeAs?: RelayWriter;
};

/** what the page last heard from one writer */
export type MapRelayHeard = {
  /** the writer's document resolved for this page, null while it holds none */
  state: Record<string, unknown> | null;
  v: number;
  /** how old the state was when it arrived, on the relay's clock */
  ageMs: number;
  /** the first version heard since the page started following */
  first: boolean;
  /** this device's clock when it arrived */
  heardAt: number;
};

/**
 * The `mapRelay` channel: absent or null while the page follows no show.
 * Consumers read what each writer says and, through `send`, write the page's
 * own writer session.
 */
export type MapRelayState = {
  /** the relay and the show's code, for the sessions next to the writers' */
  target: RelayTarget;
  /** the target tags the page applies */
  tags: readonly string[];
  heard: Partial<Record<RelayWriter, MapRelayHeard>>;
  connected: Partial<Record<RelayWriter, boolean>>;
  /** replaces the page's own writer session; absent without `writeAs` */
  send?: (doc: unknown) => Promise<RelayWriteResult>;
};

export const relayWritersOf = (
  config: MapRelayConfig | undefined
): RelayWriter[] => [
  ...new Set((config?.writers ?? DEFAULT_WRITERS).filter(isRelayWriter)),
];

/** the configured tags, else the route's name from the addon scope (`/outlet`) */
export const relayTagsOf = (
  config: MapRelayConfig | undefined,
  scope: string | undefined
): string[] => {
  if (config?.targets) {
    return config.targets.filter(isTargetTag);
  }
  const route = conditionRouteOf(scope ?? "/") || ROOT_ROUTE_TARGET;
  return isTargetTag(route) ? [route] : [];
};

/** the channel after `writer` delivered `doc` */
export const withHeard = (
  previous: MapRelayState,
  writer: RelayWriter,
  doc: unknown,
  meta: RelayMeta,
  heardAt: number
): MapRelayState => ({
  ...previous,
  heard: {
    ...previous.heard,
    [writer]: {
      state: resolveTargets(doc, previous.tags),
      v: meta.v,
      ageMs: meta.ageMs,
      first: meta.first,
      heardAt,
    },
  },
});

/** the channel with `writer`'s connection, unchanged when it already said so */
export const withConnected = (
  previous: MapRelayState,
  writer: RelayWriter,
  connected: boolean
): MapRelayState =>
  previous.connected[writer] === connected
    ? previous
    : {
        ...previous,
        connected: { ...previous.connected, [writer]: connected },
      };
