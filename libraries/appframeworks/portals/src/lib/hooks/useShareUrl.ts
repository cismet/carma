import { useCallback } from "react";
import { useCopyToClipboard } from "@uidotdev/usehooks";
import { message } from "antd";
import { encodeHashParams } from "@carma-providers/hash-state";
import type { LayerState, SelectedObject } from "../types";
import { SelectionItem } from "../components/SelectionProvider";
import { getHashParams } from "@carma-commons/utils";
import { normalizeShareHashParams } from "./shareHash";

export const SHORTENER_URL =
  "https://ceepr.cismet.de/store/wuppertal/_dev_geoportal";

interface ShareStateArgs {
  layerState: LayerState;
  closePopover?: () => void;
  gazetteerSelection?: SelectionItem;
  selectedFeature?: SelectedObject;
  /** Further sections of the stored configuration, by key, as the host wants them restored. */
  extraConfig?: Record<string, unknown>;
}

const createShareKey = async ({
  layerState,
  gazetteerSelection,
  selectedFeature,
  extraConfig,
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
  return storeMappingConfig({
    backgroundLayer: {
      ...backgroundLayer,
      selectedLayerId: selectedByCategory[backgroundLayer.id]?.id,
    },
    layers,
    view,
    gazetteerSelection,
    selectedFeature,
    ...extraConfig,
  });
};

/**
 * Stores a geoportal configuration (`{ layers, backgroundLayer?, view?, ... }`)
 * and returns the key a geoportal url loads it by (`config=<key>`).
 */
export const storeMappingConfig = async (config: object): Promise<string> => {
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

export const useShareUrl = () => {
  const [, copyToClipboard] = useCopyToClipboard();
  const [messageApi, contextHolder] = message.useMessage();

  const copyShareUrl = useCallback(
    async ({
      layerState,
      closePopover = () => {},
      gazetteerSelection,
      selectedFeature,
      extraConfig,
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
          extraConfig,
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
      extraConfig,
    }: ShareStateArgs) => {
      try {
        const key = await createShareKey({
          layerState,
          gazetteerSelection,
          selectedFeature,
          extraConfig,
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

  return { copyShareUrl, copyShareId, contextHolder, messageApi };
};
