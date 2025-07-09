import { TagSelector } from "@carma-commons/ui/tag-selection";
import { serviceOptions } from "@carma-mapping/layers";
import { faPlus, faShareNodes } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Button, Input, Select, Tabs } from "antd";
import { useState } from "react";
import type { LayerState } from "../types";
import { useFeatureFlags } from "./FeatureFlagProvider";
import { SelectionItem } from "./SelectionProvider";
import { useShareUrl } from "../hooks/useShareUrl";
import FileUploader from "./FileUploader";
import "./tabs.css";
import { uploadImage } from "../utils/fileUpload";

export type ShareProps = {
  layerState: LayerState;
  selection?: SelectionItem;
  closePopover?: () => void;
  showExtendedSharing?: boolean;
  jwt?: string;
};

export const Share = ({
  layerState,
  closePopover,
  selection,
  showExtendedSharing,
  jwt,
}: ShareProps) => {
  const [loading, setLoading] = useState(false);
  // form states
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [usage, setUsage] = useState("");
  const [service, setService] = useState("discoverPoi");
  const [thumbUrl, setThumbUrl] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [keywordInput, setKeywordInput] = useState("");

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
    setFile(null);
    setKeywords([]);
  };

  const addItemToDb = async (data, isDraft: boolean) => {
    setLoading(true);
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
    setLoading(false);
  };

  const createShare = async (e, isDraft: boolean) => {
    e.preventDefault();
    let fileUrl;
    if (file) {
      fileUrl = await uploadImage(file, jwt);
      if (!fileUrl) return;
    }

    const newConfig = {
      description: `Inhalt: ${content} Verwendungszweck: ${usage}`,
      title: title ? title : "Unbenannte Karte",
      type: "collection",
      thumbnail: fileUrl || thumbUrl,
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
          className="overflow-y-auto max-h-[500px] relative"
        >
          <div className="absolute top-1 right-3 text-red-500">
            * Pflichtfelder
          </div>
          <form
            style={{ width: "100%" }}
            onSubmit={(e) => createShare(e, false)}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
                width: "34rem",
                maxWidth: "34rem",
              }}
            >
              <label htmlFor="service" className="-mb-1 font-semibold">
                Kategorie
              </label>
              <Select
                options={serviceOptions}
                onChange={(value) => setService(value)}
                value={service}
                id="service"
              />
              <label htmlFor="title" className="-mb-1 font-semibold">
                Titel <span className="text-red-500">*</span>
              </label>
              <Input
                id="title"
                onChange={(e) => setTitle(e.target.value)}
                value={title}
                className="bg-white"
                placeholder="Unter welchem Namen soll die Karte angeboten werden?"
                required
              />
              <label htmlFor="thumbUrl" className="-mb-1 font-semibold">
                Vorschaubild <span className="text-red-500">*</span>
              </label>
              <Tabs
                items={[
                  {
                    key: "1",
                    label: "Datei",
                    children: <FileUploader file={file} setFile={setFile} />,
                  },
                  {
                    key: "2",
                    label: "URL",
                    children: (
                      <Input
                        id="thumbUrl"
                        onChange={(e) => setThumbUrl(e.target.value)}
                        value={thumbUrl}
                        className="bg-white"
                        placeholder="Unter welcher URL ist ein geeignetes Vorschaubild verfügbar?"
                      />
                    ),
                  },
                ]}
              />
              <label htmlFor="content" className="-mb-1 font-semibold">
                Inhalt <span className="text-red-500">*</span>
              </label>
              <Input.TextArea
                id="content"
                onChange={(e) => setContent(e.target.value)}
                value={content}
                className="bg-white"
                placeholder="Welche Kartenebenen und/oder Objektkategorien umfasst die Karte? Welche Hintergrundkarte wird verwendet?"
                required
              />
              <label htmlFor="usage" className="-mb-1 font-semibold">
                Verwendungszweck <span className="text-red-500">*</span>
              </label>
              <Input.TextArea
                id="usage"
                onChange={(e) => setUsage(e.target.value)}
                value={usage}
                className="bg-white"
                placeholder="Für welche Zielgruppe und/oder welchen spezifischen Informationsbedarf ist die Karte bestimmt?"
                required
              />
              <label htmlFor="keywords" className="-mb-1 font-semibold">
                Schlüsselwörter
              </label>
              <div className="flex items-center gap-2">
                <Input
                  onChange={(e) => setKeywordInput(e.target.value)}
                  value={keywordInput}
                  className="bg-white"
                  placeholder="Suchbegriffe zum Finden der Karte?"
                />
                <Button
                  onClick={() => {
                    setKeywords([...keywords, keywordInput]);
                    setKeywordInput("");
                  }}
                  icon={<FontAwesomeIcon icon={faPlus} />}
                >
                  Hinzufügen
                </Button>
              </div>
              <div className="flex flex-wrap gap-1 gap-y-2">
                <TagSelector
                  keywords={keywords}
                  setKeywords={setKeywords}
                  showAddButton={false}
                />
              </div>
              <Button
                onClick={(e) => createShare(e, true)}
                className="mt-2"
                disabled={loading}
                loading={loading}
              >
                Zwischenspeichern
              </Button>
              <Button
                type="primary"
                htmlType="submit"
                className="mt-2"
                disabled={loading}
                loading={loading}
              >
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
