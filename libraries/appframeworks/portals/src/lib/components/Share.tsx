import { TagSelector } from "@carma-commons/ui/tag-selection";
import { serviceOptions } from "@carma-mapping/layers";
import { faShareNodes } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Button, Input, Select, Tabs } from "antd";
import { useState } from "react";
import type { LayerState } from "../types";
import { useFeatureFlags } from "./FeatureFlagProvider";
import { SelectionItem } from "./SelectionProvider";
import { useShareUrl } from "../hooks/useShareUrl";
import FileUploader from "./FileUploader";
import "./tabs.css";

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
  // form states
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [usage, setUsage] = useState("");
  const [service, setService] = useState("discoverPoi");
  const [thumbUrl, setThumbUrl] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);

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

  const uploadFile = async () => {
    if (!file) return;
    fetch(
      "https://wunda-cloud-api.cismet.de/configattributes/geoportal.files",
      {
        method: "GET",
        headers: {
          Authorization: "Bearer " + jwt,
        },
      }
    )
      .then((response) => {
        return response.text();
      })
      .then((data) => {
        const geoportalFiles = JSON.parse(data)["geoportal.files"];
        const uploadData = JSON.parse(geoportalFiles);
        console.log("xxx", uploadData);

        const form = new FormData();
        form.append("dateifeld", file);

        fetch(uploadData.url + `/${file.name}`, {
          method: "PUT",
          headers: {
            Authorization:
              "Basic " + btoa(uploadData.user + ":" + uploadData.password),
          },
          body: file,
        })
          .then((response) => {
            console.log("xxx", response);
          })
          .catch((error) => {
            console.log("xxx", error);
          });
      });
  };

  const createShare = (e, isDraft: boolean) => {
    e.preventDefault();
    if (file) {
      uploadFile();
    }

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
              <Tabs
                items={[
                  {
                    key: "1",
                    label: "URL",
                    children: (
                      <Input
                        id="thumbUrl"
                        onChange={(e) => setThumbUrl(e.target.value)}
                        value={thumbUrl}
                        className="bg-white"
                      />
                    ),
                  },
                  {
                    key: "2",
                    label: "Datei",
                    children: <FileUploader file={file} setFile={setFile} />,
                  },
                ]}
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
