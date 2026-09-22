import { useCallback } from "react";
import { useCopyToClipboard } from "@uidotdev/usehooks";
import { message } from "antd";
import {
  encodeHashParams,
  SCENE_VIEW_STATE_HASH_PARAM_NAME_ORDER,
} from "@carma-providers/hash-state";
import type { LayerStackEntry } from "@carma-mapping/layers";
import type { LayerState, SelectedObject } from "../types";
import { SelectionItem } from "../components/SelectionProvider";
import { getHashParams } from "@carma-commons/utils";
import { normalizeShareHashParams } from "./shareHash";

export const SHORTENER_URL =
  "https://ceepr.cismet.de/store/wuppertal/_dev_geoportal";

/**
 * How a stored configuration is applied when its `config=` key is opened.
 * Absent means `replace`: the stored snapshot becomes the whole map.
 * `additive` only appends the stored layers to what the visitor already has,
 * which is how a single layer or workflow is passed around without a snapshot
 * of the sender's map coming along.
 */
export type ShareConfigMode = "replace" | "additive";

interface ShareStateArgs {
  layerState: LayerState;
  closePopover?: () => void;
  gazetteerSelection?: SelectionItem;
  selectedFeature?: SelectedObject;
}

interface AdditiveShareArgs {
  entries: LayerStackEntry[];
  closePopover?: () => void;
}

const storeShareConfig = async (config: object): Promise<string> => {
  const response = await fetch(SHORTENER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(config),
  });
  const data = await response.json();
  return data.key;
};

const createShareKey = async ({
  layerState,
  gazetteerSelection,
  selectedFeature,
}: ShareStateArgs): Promise<string> => {
  const { layers, backgroundLayer, selectedByCategory } = layerState;
  const currentParams = getHashParams();
  const lat = currentParams.lat || 51.27256992259917;
  const lng = currentParams.lng || 7.199920713901521;
  const zoom = currentParams.zoom || 18;

  const view = {
    center: [lat, lng],
    zoom: zoom,
  };
  const newConfig = {
    backgroundLayer: {
      ...backgroundLayer,
      selectedLayerId: selectedByCategory[backgroundLayer.id]?.id,
    },
    layers,
    view,
    gazetteerSelection,
    selectedFeature,
  };

  return storeShareConfig(newConfig);
};

/**
 * Store the given stack entries as an additive configuration. A layer group
 * (a workflow) is one entry, so the receiver gets one row and one "Entfernen".
 */
const createAdditiveShareKey = (entries: LayerStackEntry[]): Promise<string> =>
  storeShareConfig({
    mode: "additive" satisfies ShareConfigMode,
    layers: entries,
  });

/**
 * The camera as it is in the hash right now, and only the camera: position,
 * zoom and the angles, in their written form. Nothing else the hash holds
 * (map style, config, route) says anything about the entries a link adds.
 */
const currentViewHash = (): string => {
  const written = normalizeShareHashParams(getHashParams());
  const view = Object.fromEntries(
    SCENE_VIEW_STATE_HASH_PARAM_NAME_ORDER.filter((key) => key in written).map(
      (key) => [key, written[key]]
    )
  );
  return encodeHashParams(view);
};

export const useShareUrl = () => {
  const [, copyToClipboard] = useCopyToClipboard();
  const [messageApi, contextHolder] = message.useMessage();

  const copyShareUrl = useCallback(
    async ({
      layerState,
      closePopover = () => {},
      gazetteerSelection,
      selectedFeature,
    }: ShareStateArgs) => {
      try {
        const currentParams = getHashParams();
        const newSearchParams = new URLSearchParams(currentParams);
        const baseUrl = window.location.origin + window.location.pathname;
        const hashRoute =
          window.location.hash.split("?")[0].replace(/^#/, "") || "/";
        const combinedHash = encodeHashParams(
          normalizeShareHashParams(Object.fromEntries(newSearchParams))
        );

        const key = await createShareKey({
          layerState,
          gazetteerSelection,
          selectedFeature,
        });
        const prefixedHash = combinedHash.length > 0 ? `${combinedHash}&` : "";
        const url = `${baseUrl}#${hashRoute}?${prefixedHash}config=${key}&appKey=sharedurl`;
        copyToClipboard(url);
        messageApi.open({
          type: "success",
          content: `Link wurde in die Zwischenablage kopiert.`,
          duration: 0.8,
        });
      } catch (error) {
        console.error("[SHARE] creating the share url failed", error);
        messageApi.open({
          type: "error",
          content: `Es gab einen Fehler beim erstellen des Links`,
          duration: 0.8,
        });
      }
      closePopover?.();
    },
    [copyToClipboard, messageApi]
  );

  const copyShareId = useCallback(
    async ({
      layerState,
      closePopover = () => {},
      gazetteerSelection,
      selectedFeature,
    }: ShareStateArgs) => {
      try {
        const key = await createShareKey({
          layerState,
          gazetteerSelection,
          selectedFeature,
        });
        copyToClipboard(key);
        messageApi.open({
          type: "success",
          content: `Share-ID wurde in die Zwischenablage kopiert.`,
          duration: 0.8,
        });
      } catch (error) {
        console.error("[SHARE] creating the share id failed", error);
        messageApi.open({
          type: "error",
          content: `Es gab einen Fehler beim Erstellen der Share-ID`,
          duration: 0.8,
        });
      }
      closePopover?.();
    },
    [copyToClipboard, messageApi]
  );

  /**
   * A link that adds the given entries to whoever opens it. It carries the
   * sender's camera in the hash, so the receiver looks at the place the
   * entries were meant for (a comparison is about a spot on the map), but no
   * base map and no `appKey`: the entries land in the receiver's own map and
   * their own persisted state, next to what is already there.
   *
   * It carries no route either: the link opens the app's root, whatever route
   * it was made on. The entries do not depend on the route (a workflow row
   * brings its definition, the engines are mounted everywhere), and a link
   * made on a development route must not send the receiver there.
   */
  const copyAdditiveShareUrl = useCallback(
    async ({ entries, closePopover = () => {} }: AdditiveShareArgs) => {
      try {
        const baseUrl = window.location.origin + window.location.pathname;
        const view = currentViewHash();
        console.info("[SHARE] additive entries", { entries });
        const key = await createAdditiveShareKey(entries);
        const url = `${baseUrl}#/?${view ? `${view}&` : ""}config=${key}`;
        copyToClipboard(url);
        messageApi.open({
          type: "success",
          content: `Link wurde in die Zwischenablage kopiert.`,
          duration: 0.8,
        });
      } catch (error) {
        console.error("[SHARE] creating the additive share url failed", error);
        messageApi.open({
          type: "error",
          content: `Es gab einen Fehler beim erstellen des Links`,
          duration: 0.8,
        });
      }
      closePopover?.();
    },
    [copyToClipboard, messageApi]
  );

  return {
    copyShareUrl,
    copyShareId,
    copyAdditiveShareUrl,
    contextHolder,
    messageApi,
  };
};
