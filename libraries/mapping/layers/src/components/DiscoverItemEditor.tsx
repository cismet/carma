import { Fragment, useState } from "react";
import { Button, Input, message, Select, Tabs, Tooltip } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBan,
  faPlus,
  faRotateLeft,
  faSave,
  faSquareUpRight,
  faUpload,
  faX,
} from "@fortawesome/free-solid-svg-icons";
import isEqual from "lodash/isEqual";

import { serviceOptions } from "@carma-commons/resources";
import { FileUploader, uploadImage } from "@carma-commons/ui/components";
import { TagSelector } from "@carma-commons/ui/tag-selection";
import { LayerButton, LayerIcon } from "@carma-mapping/components";
import { useAuth } from "@carma-providers/auth";

import type {
  BackgroundLayer,
  Item,
  Layer,
  LayerStackEntry,
} from "../lib/contracts/carma-layers.d";
import { parseDescription } from "../helper/layerHelper";
import { isLayerGroup } from "../helper/layerStack";
import { saveDiscoverItem } from "../helper/discover";
import {
  useCatalogSelectionActions,
  useDiscoverRefetch,
} from "../context/LayerCatalogProvider";
import { useCatalogInteraction } from "../context/CatalogInteractionContext";
import { useLayerCatalogConfig } from "../config/LayerCatalogConfigContext";

/** Inhalt / Verwendungszweck, title and thumbnail must be set to publish */
export const checkForRequiredDiscoverFields = (config: Item): string => {
  const parsedDescription = parseDescription(config.description);
  const descriptionEmpty = parsedDescription.some(
    (section) =>
      (section.title === "Inhalt" || section.title === "Verwendungszweck") &&
      !section.description
  );
  if (!config.title || !config.thumbnail || descriptionEmpty) {
    return "Bitte alle Pflichtfelder ausfüllen.";
  }
  return "";
};

interface DiscoverItemEditorProps {
  layer: Item;
  /** leave the edit mode without saving */
  onCancel: () => void;
}

/** the edit mode of the info card for publishable discover items */
const DiscoverItemEditor = ({ layer, onCancel }: DiscoverItemEditorProps) => {
  const { selectItem } = useCatalogSelectionActions();
  const { requestDiscoverRefetch } = useDiscoverRefetch();
  const { activeLayers } = useCatalogInteraction();
  const { discoverProps } = useLayerCatalogConfig();
  const { jwt } = useAuth();
  const [messageApi, contextHolder] = message.useMessage();

  const [updatedTitle, setUpdatedTitle] = useState(layer.title);
  const [editedDescriptions, setEditedDescriptions] = useState<{
    [key: string]: string;
  }>({});
  const [updatedService, setUpdatedService] = useState(
    layer.serviceName || "discoverPoi"
  );
  const [updatedThumbnail, setUpdatedThumbnail] = useState(layer.thumbnail);
  const [updatedKeywords, setUpdatedKeywords] = useState(layer.tags || []);
  const [updatedFile, setUpdatedFile] = useState<File | string | null>(
    layer.thumbnail || null
  );
  const [keywordInput, setKeywordInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [useNewLayers, setUseNewLayers] = useState(false);

  const parsedDescriptions = parseDescription(layer.description);

  // rebuild the stored description format from the edited sections
  const reconstructDescription = () => {
    if (Object.keys(editedDescriptions).length === 0) {
      return layer.description;
    }
    let newDescription = "";
    parsedDescriptions.forEach((section) => {
      const content =
        editedDescriptions[section.title] !== undefined
          ? editedDescriptions[section.title]
          : section.description;
      newDescription += `${section.title}: ${content}\n\n`;
    });
    return newDescription.trim();
  };

  const updateItem = async (publish?: boolean) => {
    if (!discoverProps) {
      return;
    }
    let fileUrl;
    if (updatedFile && updatedFile instanceof File) {
      fileUrl = await uploadImage({
        file: updatedFile,
        jwt,
        apiUrl: discoverProps.apiUrl,
        messageApi,
      });
      if (!fileUrl) return;
    }

    const config = {
      ...layer,
      description: reconstructDescription(),
      title: updatedTitle,
      thumbnail: fileUrl || updatedThumbnail,
      serviceName: updatedService,
      tags: updatedKeywords,
      backgroundLayer: activeLayers[0],
      layers: useNewLayers
        ? activeLayers.slice(1)
        : layer.type === "collection"
        ? layer.layers
        : [],
    } as Item;

    // drafts may be saved incomplete; publishing enforces the required fields
    if (!(!publish && layer.isDraft)) {
      const error = checkForRequiredDiscoverFields(config);
      if (error) {
        setErrorMessage(error);
        return;
      }
    }
    setErrorMessage("");
    setLoading(true);
    const saved = await saveDiscoverItem({
      discoverProps,
      jwt: jwt || undefined,
      id: layer.id,
      name: updatedTitle,
      draft: publish ? !publish : layer.isDraft,
      config,
    });
    setLoading(false);
    if (saved) {
      requestDiscoverRefetch();
      selectItem(null);
    } else {
      messageApi?.open({
        type: "error",
        content: `Es gab einen Fehler beim Speichern der Karte.`,
        duration: 2,
      });
    }
  };

  const savedLayersUnchanged =
    layer.type === "collection" &&
    isEqual(
      [layer.backgroundLayer, ...layer.layers]
        .filter((l): l is BackgroundLayer | Layer => l !== undefined)
        .map((l) => ({ title: l.title, opacity: l.opacity, id: l.id })),
      activeLayers.map((l) => ({
        title: l.title,
        opacity: l.opacity,
        id: l.id,
      }))
    );

  const renderLayerButton = (
    buttonLayer: BackgroundLayer | LayerStackEntry
  ) => {
    const opacity = buttonLayer.opacity ?? 1;
    return (
      <LayerButton key={buttonLayer.id} classNames={["px-3"]} useShadow={false}>
        {!isLayerGroup(buttonLayer) && (
          <LayerIcon layer={buttonLayer} fallbackIcon={buttonLayer.icon} />
        )}
        <span className="text-base ml-1">{buttonLayer.title}</span>
        {opacity !== 1 && (
          <span className="text-base ml-1 text-gray-500">
            ({opacity * 100}%)
          </span>
        )}
      </LayerButton>
    );
  };

  return (
    <div className="flex h-full flex-col justify-between">
      {contextHolder}
      <div className="relative pb-4">
        <div className="flex flex-wrap gap-4 items-center pr-8">
          <Input
            value={updatedTitle}
            onChange={(e) => {
              setUpdatedTitle(e.target.value);
            }}
            className="w-fit bg-white"
          />
          <div className="flex flex-wrap items-center gap-4">
            {layer.isDraft && (
              <Button
                icon={<FontAwesomeIcon icon={faUpload} />}
                onClick={() => updateItem(true)}
              >
                Publizieren
              </Button>
            )}
            <Button
              onClick={() => updateItem()}
              icon={<FontAwesomeIcon icon={faSave} />}
              loading={loading}
            >
              <span className="!hidden sm:!inline-block">Speichern</span>
            </Button>
            <Button icon={<FontAwesomeIcon icon={faBan} />} onClick={onCancel}>
              Abbrechen
            </Button>
          </div>
        </div>
        <button
          onClick={() => {
            selectItem(null);
          }}
          className="text-gray-600 hover:text-gray-500 flex items-center justify-center py-0.5 px-1 absolute top-2 right-0"
        >
          <FontAwesomeIcon icon={faX} />
        </button>
      </div>
      <div className="flex flex-col sm:flex-row gap-2 w-full h-full overflow-hidden">
        <div className="w-full flex flex-col justify-between overflow-auto">
          <div>
            {errorMessage && <div className="text-red-500">{errorMessage}</div>}

            <div>
              <label
                htmlFor="service"
                className="font-semibold text-lg pt-2 mb-1"
              >
                Kategorie
                <span className="text-red-500"> *</span>
              </label>
              <br />
              <Select
                options={serviceOptions}
                onChange={(value) => setUpdatedService(value)}
                value={updatedService}
                className="w-40"
                id="service"
              />
            </div>
            {parsedDescriptions.map((description, i) => {
              if (description.title === "Sichtbarkeit") {
                return null;
              }
              return (
                <Fragment key={`description_${i}`}>
                  <label
                    htmlFor={description.title}
                    className="font-semibold text-lg mb-1 pt-2"
                  >
                    {description.title}
                    <span className="text-red-500"> *</span>
                  </label>
                  <Input.TextArea
                    id={description.title}
                    value={
                      editedDescriptions[description.title] !== undefined
                        ? editedDescriptions[description.title]
                        : description.description
                    }
                    onChange={(e) => {
                      setEditedDescriptions((prev) => ({
                        ...prev,
                        [description.title]: e.target.value,
                      }));
                    }}
                    className="bg-white"
                  />
                </Fragment>
              );
            })}
            <div className="flex gap-6 items-center">
              <div>
                <h5 className="font-semibold text-lg pt-2 mb-1">
                  Kartenebenen
                  <Tooltip
                    title={
                      useNewLayers
                        ? "zurücksetzen auf gespeicherte Kartenebenen"
                        : "aktuelle Kartenebenen übernehmen"
                    }
                  >
                    <Button
                      className="ml-2"
                      disabled={savedLayersUnchanged}
                      icon={
                        <FontAwesomeIcon
                          className={useNewLayers ? "" : "fa-rotate-180"}
                          icon={useNewLayers ? faRotateLeft : faSquareUpRight}
                        />
                      }
                      onClick={() => {
                        setUseNewLayers(!useNewLayers);
                      }}
                    />
                  </Tooltip>
                </h5>

                <div className="flex gap-2">
                  {layer.type === "collection" &&
                    (!useNewLayers ? (
                      <>
                        {layer.backgroundLayer &&
                          renderLayerButton(layer.backgroundLayer)}
                        {layer.layers.map(renderLayerButton)}
                      </>
                    ) : (
                      activeLayers.map(renderLayerButton)
                    ))}
                </div>
              </div>
            </div>
            <br />
            <label
              htmlFor="thumbnail"
              className="font-semibold text-lg pt-2 mb-1"
            >
              Vorschaubild
              <span className="text-red-500"> *</span>
            </label>
            <div className="w-1/3 hide-tabs">
              <Tabs
                defaultActiveKey="1"
                items={[
                  {
                    key: "1",
                    label: "Datei",
                    children: (
                      <FileUploader
                        file={updatedFile}
                        setFile={setUpdatedFile}
                      />
                    ),
                  },
                  {
                    key: "2",
                    label: "URL",
                    children: (
                      <Input
                        className="bg-white"
                        value={updatedThumbnail}
                        onChange={(e) => setUpdatedThumbnail(e.target.value)}
                        id="thumbnail"
                      />
                    ),
                  },
                ]}
              />
            </div>
            <label htmlFor="tags" className="font-semibold text-lg pt-2 mb-1">
              Schlüsselwörter
            </label>
            <div className="flex items-center gap-2">
              <Input
                onChange={(e) => setKeywordInput(e.target.value)}
                value={keywordInput}
                className="bg-white"
                placeholder="Schlüsselwort hinzufügen"
              />
              <Button
                onClick={() => {
                  setUpdatedKeywords([...updatedKeywords, keywordInput]);
                  setKeywordInput("");
                }}
                icon={<FontAwesomeIcon icon={faPlus} />}
              >
                Hinzufügen
              </Button>
            </div>
          </div>
        </div>
      </div>
      <div className="pt-2">
        <TagSelector
          keywords={updatedKeywords}
          setKeywords={setUpdatedKeywords}
          showAddButton={false}
        />
      </div>
    </div>
  );
};

export default DiscoverItemEditor;
