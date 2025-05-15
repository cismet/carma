import { faShareNodes } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useCopyToClipboard } from "@uidotdev/usehooks";
import { Button, Checkbox, Radio, Tooltip, message } from "antd";
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

export const Share = ({ layerState, closePopover, selection }: ShareProps) => {
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

  const extendedSharing = flags.extendedSharing;

  return (
    <div className="p-2 flex flex-col gap-3">
      {contextHolder}
      <div className="flex items-center gap-2">
        <FontAwesomeIcon icon={faShareNodes} className="text-xl" />
        <h4 className="mb-0">Karte teilen</h4>
      </div>
      {extendedSharing ? (
        <>
          <Radio.Group value={mode} onChange={(e) => setMode(e.target.value)}>
            <div className="flex items-center gap-1">
              <Radio value={""}>Geoportal Konfiguration</Radio>
              <Radio value={"publish/"}>Map Publishing</Radio>
            </div>
          </Radio.Group>
          <hr className="my-0" />
          <h5 className="-mb-1 text-lg">Einstellungen:</h5>
          <h5 className="mb-0">Layer</h5>
          <div className="flex items-center gap-2">
            <Checkbox
              checked={settings.showLayerButtons}
              onChange={(e) =>
                setSettings({ ...settings, showLayerButtons: e.target.checked })
              }
              disabled={mode === ""}
            >
              Layer Buttons anzeigen
            </Checkbox>
          </div>
          <h5 className="mb-0">Karte</h5>
          <div className="flex items-center gap-2">
            <Checkbox
              checked={settings.showFullscreen}
              onChange={(e) =>
                setSettings({ ...settings, showFullscreen: e.target.checked })
              }
              disabled={mode === ""}
            >
              Fullscreen
            </Checkbox>
            <Checkbox
              checked={settings.showLocator}
              onChange={(e) =>
                setSettings({ ...settings, showLocator: e.target.checked })
              }
              disabled={mode === ""}
            >
              Navigator
            </Checkbox>
            <Checkbox
              checked={settings.showMeasurement}
              onChange={(e) =>
                setSettings({ ...settings, showMeasurement: e.target.checked })
              }
              disabled={mode === ""}
            >
              Messung
            </Checkbox>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              checked={settings.add3dMode}
              onChange={(e) =>
                setSettings({ ...settings, add3dMode: e.target.checked })
              }
              disabled={mode === ""}
            >
              3D Modus
            </Checkbox>
          </div>
        </>
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
