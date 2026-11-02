import { useEffect } from "react";

import { getHashParams } from "@carma-commons/utils";
import {
  isRelayWriter,
  subscribeRelay,
  writeRelayState,
  writerTarget,
  type RelayTarget,
} from "@carma-mapping/show-remote";

import { useAddonScope, useAddonState } from "../../lib/AddonStateContext";
import type { AddonComponentProps } from "../../lib/registry";
import {
  RELAY_PARAM,
  relayTagsOf,
  relayWritersOf,
  withConnected,
  withHeard,
} from "./map-relay";

const LOG_PREFIX = "[MAP RELAY]";

/**
 * Follows a show through the relay (`services/map-relay`) while the url names
 * one with `?relay=<CODE>`, and idles otherwise. Headless: it only moves
 * documents, so what a page makes of them is up to the addons reading the
 * `mapRelay` channel, the outlet on the projection window for one.
 *
 * Each writer has a session of its own (`RELAY_WRITERS`), so the page follows
 * one per configured writer and keeps what each said apart.
 */
export const MapRelay = ({ config }: AddonComponentProps<"mapRelay">) => {
  const [, setChannel] = useAddonState("mapRelay");
  const scope = useAddonScope();
  const code = getHashParams()[RELAY_PARAM];
  const baseUrl = config?.relayBaseUrl;
  const writeAs = config?.writeAs;
  const writersKey = relayWritersOf(config).join(",");
  const tagsKey = relayTagsOf(config, scope).join(",");

  useEffect(() => {
    if (!code) {
      return;
    }
    if (!baseUrl) {
      console.error(
        `${LOG_PREFIX} ?${RELAY_PARAM}=${code} was given but no relayBaseUrl is configured for this route; the page follows no show.`
      );
      return;
    }
    const target: RelayTarget = { baseUrl, code };
    const tags = tagsKey ? tagsKey.split(",") : [];
    const writers = writersKey.split(",").filter(isRelayWriter);
    const own = writeAs ? writerTarget(target, writeAs) : null;

    setChannel({
      target,
      tags,
      heard: {},
      connected: {},
      ...(own ? { send: (doc: unknown) => writeRelayState(own, doc) } : {}),
    });
    const subscriptions = writers.map((writer) =>
      subscribeRelay({
        target: writerTarget(target, writer),
        onState: (doc, meta) => {
          const heardAt = Date.now();
          setChannel(
            (previous) =>
              previous && withHeard(previous, writer, doc, meta, heardAt)
          );
        },
        onStatus: ({ connected }) => {
          setChannel(
            (previous) => previous && withConnected(previous, writer, connected)
          );
        },
      })
    );
    console.info(
      `${LOG_PREFIX} following ${code} via ${baseUrl}: writers ${writers.join(
        ", "
      )}, targets ${tags.join(", ") || "none"}${
        writeAs ? `, writing as ${writeAs}` : ""
      }`
    );

    return () => {
      subscriptions.forEach((subscription) => subscription.stop());
      setChannel(null);
    };
  }, [code, baseUrl, writersKey, tagsKey, writeAs, setChannel]);

  return null;
};
