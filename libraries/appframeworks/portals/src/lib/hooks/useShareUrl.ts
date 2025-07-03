import { useCopyToClipboard } from "@uidotdev/usehooks";
import { message } from "antd";
import type { LayerState } from "../types";
import { SelectionItem } from "../components/SelectionProvider";
import { getHashParams } from "@carma-commons/utils";

export const SHORTENER_URL =
  "https://ceepr.cismet.de/store/wuppertal/_dev_geoportal";

export const useShareUrl = () => {
  const [, copyToClipboard] = useCopyToClipboard();
  const [messageApi, contextHolder] = message.useMessage();

  const copyShareUrl = async ({
    layerState,
    closePopover = () => {},
    selection,
  }: {
    layerState: LayerState;
    closePopover?: () => void;
    selection?: SelectionItem;
  }) => {
    const { layers, backgroundLayer, selectedLuftbildLayer, selectedMapLayer } =
      layerState;
    const currentParams = getHashParams();
    const lat = currentParams.lat || 51.27256992259917;
    const lng = currentParams.lng || 7.199920713901521;
    const zoom = currentParams.zoom || 18;

    const newSearchParams = new URLSearchParams(currentParams);

    const view = {
      center: [lat, lng],
      zoom: zoom,
    };
    const newConfig = {
      backgroundLayer: {
        ...backgroundLayer,
        selectedLayerId:
          backgroundLayer.id === "luftbild"
            ? selectedLuftbildLayer.id
            : selectedMapLayer.id,
      },
      layers,
      view,
      selection,
    };
    const jsonString = JSON.stringify(newConfig);
    try {
      const baseUrl = window.location.origin + window.location.pathname;
      let combinedHash = "";
      newSearchParams.forEach((value, key) => {
        if (key !== "config" && key !== "appKey") {
          combinedHash += `${key}=${value}&`;
        }
      });

      const response = await fetch(SHORTENER_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: jsonString,
      });
      const data = await response.json();
      const key = data.key;
      const url = `${baseUrl}#/?${combinedHash}&config=${key}&appKey=sharedurl`;
      copyToClipboard(url);
      messageApi.open({
        type: "success",
        content: `Link wurde in die Zwischenablage kopiert.`,
        duration: 0.8,
      });
    } catch {
      messageApi.open({
        type: "error",
        content: `Es gab einen Fehler beim erstellen des Links`,
        duration: 0.8,
      });
    }
    closePopover?.();
  };

  return { copyShareUrl, contextHolder, messageApi };
};
