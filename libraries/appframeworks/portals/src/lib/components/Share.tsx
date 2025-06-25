import { faShareNodes } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useCopyToClipboard } from "@uidotdev/usehooks";
import { Button, Checkbox, Input, Radio, Select, Tooltip, message } from "antd";
import { useEffect, useState } from "react";
import type { LayerState, Settings } from "../types";
import { faCopy } from "@fortawesome/free-regular-svg-icons";
import { useFeatureFlags } from "./FeatureFlagProvider";
import { SelectionItem } from "./SelectionProvider";
import { getHashParams } from "@carma-commons/utils";

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
    mode = "",
    settings,
  }: {
    layerState: LayerState;
    closePopover?: () => void;
    selection?: SelectionItem;
    mode?: string;
    settings?: Settings;
  }) => {
    const { layers, backgroundLayer, selectedLuftbildLayer, selectedMapLayer } =
      layerState;
    const currentParams = getHashParams();
    const lat = currentParams.lat || 51.27256992259917;
    const lng = currentParams.lng || 7.199920713901521;
    const zoom = currentParams.zoom || 18;

    const newSearchParams = new URLSearchParams(currentParams);
    const combinedHash = newSearchParams.toString();

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
      settings:
        mode === "publish/"
          ? settings
          : {
              showLayerButtons: true,
              showFullscreen: true,
              showLocator: true,
              showMeasurement: true,
              add3dMode: true,
            },
      view,
      selection,
    };
    const jsonString = JSON.stringify(newConfig);
    try {
      const baseUrl = window.location.origin + window.location.pathname;

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

  return { copyShareUrl, contextHolder };
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

  const serviceOptions = [
    { value: "discoverPoi", label: "POI" },
    { value: "discoverPlanung", label: "Planung" },
    { value: "discoverVerkehr", label: "Verkehr" },
    { value: "discoverUmwelt", label: "Umwelt" },
    { value: "discoverInfra", label: "Infrastruktur" },
    { value: "discoverImmo", label: "Immobilien" },
  ];

  const { layers, backgroundLayer } = layerState;
  const { copyShareUrl, contextHolder } = useShareUrl();
  const [, copyToClipboard] = useCopyToClipboard();
  const [messageApi] = message.useMessage();
  const [mode, setMode] = useState("");
  const [settings, setSettings] = useState<Settings>({
    showLayerButtons: true,
    showFullscreen: true,
    showLocator: true,
    showMeasurement: true,
    add3dMode: true,
  });

  const flags = useFeatureFlags();

  const extendedSharing = flags.extendedSharing || showExtendedSharing;

  const addItemToDb = async (data) => {
    const apiUrl = "https://wunda-cloud-api.cismet.de";
    const taskParameters = {
      parameters: {
        className: "gp_entdecken",
        data: JSON.stringify({
          id: -1,
          name: title,
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
        content: `Karte wurde publiziert.`,
        duration: 0.8,
      });
      closePopover?.();
    }
  };

  const createShare = (e) => {
    e.preventDefault();
    const newConfig = {
      description: `Inhalt: ${content} Verwendungszweck: ${usage}`,
      title,
      type: "collection",
      thumbnail: "",
      path: serviceOptions.find((option) => option.value === service)?.label,
      serviceName: service,
      backgroundLayer,
      layers,
    };

    addItemToDb(newConfig);
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
          <form style={{ width: "100%" }} onSubmit={createShare}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
                minWidth: "24rem",
              }}
            >
              <Select
                options={serviceOptions}
                onChange={(value) => setService(value)}
                value={service}
              />
              <label htmlFor="title">Titel</label>
              <Input
                id="title"
                onChange={(e) => setTitle(e.target.value)}
                value={title}
              />
              <label htmlFor="content">Inhalt</label>
              <Input.TextArea
                id="content"
                onChange={(e) => setContent(e.target.value)}
                value={content}
              />
              <label htmlFor="usage">Verwendungszweck</label>
              <Input.TextArea
                id="usage"
                onChange={(e) => setUsage(e.target.value)}
                value={usage}
              />
              <Button type="primary" htmlType="submit">
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
              mode,
              settings,
            });
          }}
        >
          Link kopieren
        </Button>
        {extendedSharing && (
          <Tooltip title="Konfiguration in Zwischenablage speichern">
            <Button
              onClick={() => {
                const newConfig = {
                  backgroundLayer,
                  layers,
                  settings:
                    mode === "publish/"
                      ? settings
                      : {
                          showLayerButtons: true,
                          showLayerHideButtons: false,
                          showFullscreen: true,
                          showLocator: true,
                          showMeasurement: true,
                          showHamburgerMenu: false,
                        },
                };
                try {
                  copyToClipboard(JSON.stringify(newConfig));
                  addItemToDb(newConfig);
                  messageApi.open({
                    type: "success",
                    content: `Konfiguration wurde in die Zwischenablage gespeichert.`,
                  });
                } catch {
                  messageApi.open({
                    type: "error",
                    content: `Es gab einen Fehler beim speichern der Konfiguration.`,
                  });
                }
              }}
              icon={<FontAwesomeIcon icon={faCopy} />}
            />
          </Tooltip>
        )}
      </div>
    </div>
  );
};

export default Share;
