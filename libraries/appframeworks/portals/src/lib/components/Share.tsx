import { TagSelector } from "@carma-commons/ui/tag-selection";
import { getHashParams } from "@carma-commons/utils";
import { serviceOptions } from "@carma-mapping/layers";
import { faShareNodes } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useCopyToClipboard } from "@uidotdev/usehooks";
import { Button, Input, Select, message } from "antd";
import { useState } from "react";
import type { LayerState } from "../types";
import { useFeatureFlags } from "./FeatureFlagProvider";
import { SelectionItem } from "./SelectionProvider";

export type ShareProps = {
  layerState: LayerState;
  selection?: SelectionItem;
  closePopover?: () => void;
  showExtendedSharing?: boolean;
  jwt?: string;
};

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

export const Share = ({
  layerState,
  closePopover,
  selection,
  showExtendedSharing,
  jwt,
}: ShareProps) => {
  // form states
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [usage, setUsage] = useState("");
  const [service, setService] = useState("discoverPoi");
  const [thumbUrl, setThumbUrl] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);

  const { layers, backgroundLayer } = layerState;
  const { copyShareUrl, contextHolder, messageApi } = useShareUrl();

  const flags = useFeatureFlags();

  const extendedSharing = flags.extendedSharing || showExtendedSharing;

  const clearStates = () => {
    setTitle("");
    setContent("");
    setUsage("");
    setService("discoverPoi");
    setThumbUrl("");
  };

  const addItemToDb = async (data, isDraft: boolean) => {
    const apiUrl = "https://wunda-cloud-api.cismet.de";
    const taskParameters = {
      parameters: {
        className: "gp_entdecken",
        data: JSON.stringify({
          id: -1,
          name: title,
          draft: isDraft,
          config: JSON.stringify(data),
        }),
      },
    };

    const fd = new FormData();
    fd.append(
      "taskparams",
      new Blob([JSON.stringify(taskParameters)], {
        type: "application/json",
      })
    );
    const response = await fetch(
      apiUrl +
        "/actions/WUNDA_BLAU.SaveObject/tasks?resultingInstanceType=result",
      {
        method: "POST",
        // method: "GET",
        headers: {
          Authorization: "Bearer " + jwt, // "Content-Type": "application/json",
          // Accept: "application/json",
        },
        body: fd,
      }
    );
    if (response.status === 200) {
      messageApi.open({
        type: "success",
        content: `Karte wurde ${isDraft ? "gespeichert" : "publiziert"}.`,
        duration: 0.8,
      });
      closePopover?.();
      clearStates();
    }
  };

  const createShare = (e, isDraft: boolean) => {
    e.preventDefault();
    const newConfig = {
      description: `Inhalt: ${content} Verwendungszweck: ${usage}`,
      title: title ? title : "Unbenannte Karte",
      type: "collection",
      thumbnail: thumbUrl,
      path: serviceOptions.find((option) => option.value === service)?.label,
      serviceName: service,
      tags: keywords,
      backgroundLayer,
      layers,
    };

    addItemToDb(newConfig, isDraft);
  };

  return (
    <div className="p-2 flex flex-col gap-3">
      {contextHolder}
      <div className="flex items-center gap-2">
        <FontAwesomeIcon icon={faShareNodes} className="text-xl" />
        <h4 className="mb-0">Karte teilen</h4>
      </div>
      {extendedSharing ? (
        <div
          style={{
            background: "#155A5F20",
            padding: "1rem",
            borderRadius: "0.5rem",
          }}
        >
          <form
            style={{ width: "100%" }}
            onSubmit={(e) => createShare(e, false)}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
                width: "24rem",
                maxWidth: "24rem",
              }}
            >
              <label htmlFor="service">Kategorie</label>
              <Select
                options={serviceOptions}
                onChange={(value) => setService(value)}
                value={service}
                id="service"
              />
              <label htmlFor="title">
                Titel <span className="text-red-500">*</span>
              </label>
              <Input
                id="title"
                onChange={(e) => setTitle(e.target.value)}
                value={title}
                className="bg-white"
                required
              />
              <label htmlFor="thumbUrl">
                Vorschaubild <span className="text-red-500">*</span>
              </label>
              <Input
                id="thumbUrl"
                onChange={(e) => setThumbUrl(e.target.value)}
                value={thumbUrl}
                className="bg-white"
                required
              />
              <label htmlFor="content">
                Inhalt <span className="text-red-500">*</span>
              </label>
              <Input.TextArea
                id="content"
                onChange={(e) => setContent(e.target.value)}
                value={content}
                className="bg-white"
                required
              />
              <label htmlFor="usage">
                Verwendungszweck <span className="text-red-500">*</span>
              </label>
              <Input.TextArea
                id="usage"
                onChange={(e) => setUsage(e.target.value)}
                value={usage}
                className="bg-white"
                required
              />
              <label htmlFor="keywords">Schlüsselwörter</label>
              <div className="flex flex-wrap gap-1 gap-y-2">
                <TagSelector keywords={keywords} setKeywords={setKeywords} />
              </div>
              <Button onClick={(e) => createShare(e, true)} className="mt-2">
                Zwischenspeichern
              </Button>
              <Button type="primary" htmlType="submit" className="mt-2">
                Publizieren
              </Button>
            </div>
          </form>
        </div>
      ) : (
        <hr className="my-0" />
      )}

      <div className="flex items-center gap-1">
        <Button
          className="w-full"
          onClick={() => {
            copyShareUrl({
              layerState,
              closePopover,
              selection,
            });
          }}
        >
          Link kopieren
        </Button>
      </div>
    </div>
  );
};

export default Share;
