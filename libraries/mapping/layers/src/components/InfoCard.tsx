import { Button, Input, message, Select, Tabs, Tooltip } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBan,
  faCircleMinus,
  faCirclePlus,
  faEdit,
  faExternalLink,
  faMap,
  faPlus,
  faRotateLeft,
  faSave,
  faSquareUpRight,
  faStar,
  faTrash,
  faUpload,
  faX,
} from "@fortawesome/free-solid-svg-icons";
import isEqual from "lodash/isEqual";

import { serviceOptions } from "@carma-commons/resources";
import { BackgroundLayer, Item, Layer } from "@carma/types";
import { extractCarmaConfig, updateUrl } from "@carma-commons/utils";

import { parseDescription } from "../helper/layerHelper";
import { Fragment, useState } from "react";
import { FileUploader, uploadImage } from "@carma-appframeworks/portals";
import { TagSelector } from "@carma-commons/ui/tag-selection";
import { useDispatch, useSelector } from "react-redux";
import { getSelectedLayer, setSelectedLayer } from "../slices/mapLayers";
import { setTriggerRefetch } from "../slices/ui";
import { LayerButton, LayerIcon } from "@carma-mapping/components";

import { useAuth } from "@carma-providers/auth";
import type { ActiveLayers } from "./NewLibModal";

interface InfoCardProps {
  isFavorite: boolean;
  isActiveLayer: boolean;
  activeLayers: ActiveLayers;
  handleAddClick: (
    e: React.MouseEvent<HTMLElement, MouseEvent>,
    preview?: boolean
  ) => void;
  handleFavoriteClick: (
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>
  ) => void;
  setPreview: (preview: boolean) => void;
  links: { url: string; text: string }[];
  deleteCollection: () => void;
  loadingData: boolean;
  discoverProps?: {
    appKey: string;
    apiUrl: string;
    daqKey: string;
  };
}

const InfoCard = ({
  isFavorite,
  isActiveLayer,
  activeLayers,
  handleAddClick,
  handleFavoriteClick,
  setPreview,
  links,
  deleteCollection,
  loadingData,
  discoverProps,
}: InfoCardProps) => {
  const dispatch = useDispatch();
  const layer = useSelector(getSelectedLayer);
  const [messageApi, contextHolder] = message.useMessage();
  if (!layer) return null;
  const { title, description, tags } = layer;

  const [editCollection, setEditCollection] = useState(false);
  const [updatedTitle, setUpdatedTitle] = useState(title);
  const [editedDescriptions, setEditedDescriptions] = useState<{
    [key: string]: string;
  }>({});
  const [updatedService, setUpdatedService] = useState(
    layer.serviceName || "discoverPoi"
  );
  const [updatedThumbnail, setUpdatedThumbnail] = useState(layer.thumbnail);
  const [updatedKeywords, setUpdatedKeywords] = useState(tags || []);
  const [updatedFile, setUpdatedFile] = useState<File | string | null>(
    layer.thumbnail || null
  );
  const [keywordInput, setKeywordInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [useNewLayers, setUseNewLayers] = useState(false);

  // Function to reconstruct the original description format from edited descriptions
  const reconstructDescription = () => {
    if (Object.keys(editedDescriptions).length === 0) {
      return description; // Return original if no edits were made
    }

    let newDescription = "";

    // Use the parsed descriptions to maintain the original order
    parsedDescriptions.forEach((section) => {
      const content =
        editedDescriptions[section.title] !== undefined
          ? editedDescriptions[section.title]
          : section.description;

      newDescription += `${section.title}: ${content}\n\n`;
    });

    return newDescription.trim();
  };

  const { jwt, userGroups } = useAuth();

  const allowPublishing = userGroups.includes("_Geoportal_Publizieren");

  const legends =
    layer.vectorStyle && layer.vectorLegend
      ? [{ OnlineResource: layer.vectorLegend }]
      : (layer as unknown as any).props?.Style?.[0]?.LegendURL; // TODO: fix type
  const parsedDescriptions = parseDescription(description);
  const carmaConf = extractCarmaConfig(layer.keywords);
  const isVectorLayer = carmaConf?.vectorStyle;
  const canFavoriteItem =
    layer.type !== "collection" ||
    (layer.type === "collection" && layer.serviceName.includes("discover"));
  const isDiscoverItem = layer.serviceName.includes("discover");
  const isGenericTopicMap = layer?.name?.startsWith("wuppGenericTopicMaps_");
  const isTopicMap = layer?.name?.startsWith("wuppTopicMaps_");
  const isArcGisOnline = layer?.name?.startsWith("wuppArcGisOnline_");
  const copyright = layer.copyright;

  const checkForRequiredFields = (config: Item) => {
    setErrorMessage("");
    const updatedParsedDescription = parseDescription(config.description);
    let descriptionEmpty = false;
    updatedParsedDescription.forEach((section) => {
      if (
        (section.title === "Inhalt" || section.title === "Verwendungszweck") &&
        !section.description
      ) {
        descriptionEmpty = true;
      }
    });
    if (!config.title || !config.thumbnail || descriptionEmpty) {
      return "Bitte alle Pflichtfelder ausfüllen.";
    }
    return "";
  };

  const updateItem = async (publish?: boolean) => {
    let fileUrl;
    const apiUrl = discoverProps?.apiUrl || "https://wunda-cloud-api.cismet.de";
    if (updatedFile && updatedFile instanceof File) {
      fileUrl = await uploadImage({
        file: updatedFile,
        jwt,
        apiUrl,
        messageApi,
      });
      if (!fileUrl) return;
    }

    // Create base config without layers property
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
    };

    if (!(!publish && layer.isDraft)) {
      const error = checkForRequiredFields(config);
      if (error) {
        setErrorMessage(error);
        return;
      }
    }
    setLoading(true);
    const taskParameters = {
      parameters: {
        className: discoverProps?.daqKey || "gp_entdecken",
        data: JSON.stringify({
          id: layer.id,
          name: updatedTitle,
          draft: publish ? !publish : layer.isDraft,
          config: JSON.stringify(config),
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
      dispatch(setTriggerRefetch(true));
      const waitForLoadingToFinish = async () => {
        while (loadingData) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        setLoading(false);
        setEditCollection(false);
        dispatch(setSelectedLayer(null));
      };

      waitForLoadingToFinish();
    } else {
      setLoading(false);
      messageApi?.open({
        type: "error",
        content: `Es gab einen Fehler beim Speichern der Karte.`,
        duration: 2,
      });
    }
  };

  return (
    <div
      className="w-full h-full sm:h-[400px] px-6 pt-6 pb-2 shadow-sm hover:!shadow-lg rounded-lg bg-blue-50 col-span-full max-w-full overflow-x-auto"
      style={{ maxWidth: "100vw" }}
    >
      {contextHolder}
      <div className="flex h-full flex-col justify-between">
        <div className="relative pb-4">
          <div className="flex flex-wrap gap-4 items-center pr-8">
            {editCollection ? (
              <Input
                value={updatedTitle}
                onChange={(e) => {
                  setUpdatedTitle(e.target.value);
                }}
                className="w-fit bg-white"
              />
            ) : (
              <h3 className="mb-0 truncate leading-10 text-xl sm:text-2xl">
                {title}
              </h3>
            )}
            <div className="flex flex-wrap items-center gap-4">
              {layer.type === "layer" && (
                <Button
                  onClick={handleAddClick}
                  icon={
                    <FontAwesomeIcon
                      icon={isActiveLayer ? faCircleMinus : faCirclePlus}
                    />
                  }
                >
                  <span className="!hidden sm:!inline-block">
                    {isActiveLayer ? "Entfernen" : "Hinzufügen"}
                  </span>
                </Button>
              )}
              {layer.type === "collection" && (
                <>
                  <Button
                    onClick={handleAddClick}
                    icon={<FontAwesomeIcon icon={faSquareUpRight} />}
                  >
                    <span className="!hidden sm:!inline-block">Laden</span>
                  </Button>
                  {!layer.serviceName.includes("discover") && (
                    <Button
                      onClick={deleteCollection}
                      icon={<FontAwesomeIcon icon={faTrash} />}
                    >
                      <span className="!hidden sm:!inline-block">Löschen</span>
                    </Button>
                  )}
                </>
              )}
              {layer.type === "link" && (
                <Button
                  href={layer.url}
                  target="_topicMaps"
                  icon={<FontAwesomeIcon icon={faExternalLink} />}
                >
                  <span className="!hidden sm:!inline-block">Öffnen</span>
                </Button>
              )}
              {canFavoriteItem && (
                <Button
                  onClick={handleFavoriteClick}
                  icon={<FontAwesomeIcon icon={faStar} />}
                >
                  <span className="!hidden sm:!inline-block">
                    {isFavorite ? "Favorit entfernen" : "Favorisieren"}
                  </span>
                </Button>
              )}
              {allowPublishing && isDiscoverItem && (
                <>
                  {layer.isDraft && (
                    <Button
                      icon={<FontAwesomeIcon icon={faUpload} />}
                      onClick={() => updateItem(true)}
                    >
                      Publizieren
                    </Button>
                  )}
                  <Button
                    onClick={() => {
                      if (editCollection) {
                        updateItem();
                      } else {
                        setEditCollection(true);
                      }
                    }}
                    icon={
                      <FontAwesomeIcon
                        icon={editCollection ? faSave : faEdit}
                      />
                    }
                    loading={loading}
                  >
                    <span className="!hidden sm:!inline-block">
                      {editCollection ? "Speichern" : "Bearbeiten"}
                    </span>
                  </Button>
                  {editCollection ? (
                    <Button
                      icon={<FontAwesomeIcon icon={faBan} />}
                      onClick={() => {
                        setEditCollection(false);
                        setErrorMessage("");
                      }}
                    >
                      Abbrechen
                    </Button>
                  ) : (
                    <Button
                      type="primary"
                      danger
                      icon={<FontAwesomeIcon icon={faTrash} />}
                      onClick={() => deleteCollection()}
                    >
                      Löschen
                    </Button>
                  )}
                </>
              )}
              {layer.type === "layer" && (
                <Button
                  onClick={(e) => {
                    setPreview(true);
                    handleAddClick(e, true);
                  }}
                  icon={<FontAwesomeIcon icon={faMap} />}
                >
                  <span className="!hidden sm:!inline-block">Vorschau</span>
                </Button>
              )}
            </div>
          </div>
          <button
            onClick={() => {
              dispatch(setSelectedLayer(null));
            }}
            className="text-gray-600 hover:text-gray-500 flex items-center justify-center py-0.5 px-1 absolute top-2 right-0"
          >
            <FontAwesomeIcon icon={faX} />
          </button>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full h-full overflow-hidden">
          <div className="w-full flex flex-col justify-between overflow-auto">
            <div>
              {errorMessage && (
                <div className="text-red-500">{errorMessage}</div>
              )}

              {editCollection && (
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
              )}
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
                      {editCollection && (
                        <span className="text-red-500"> *</span>
                      )}
                    </label>
                    {editCollection ? (
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
                    ) : (
                      <p
                        className="text-base text-gray-600"
                        dangerouslySetInnerHTML={{
                          __html: description.description,
                        }}
                      />
                    )}
                  </Fragment>
                );
              })}
              {editCollection && (
                <>
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
                            disabled={
                              layer?.type === "collection" &&
                              isEqual(
                                [layer.backgroundLayer, ...layer.layers]
                                  .filter(
                                    (l): l is BackgroundLayer | Layer =>
                                      l !== undefined
                                  )
                                  .map((l) => {
                                    return {
                                      title: l.title,
                                      opacity: l.opacity,
                                    };
                                  }),
                                activeLayers.map((l) => {
                                  return { title: l.title, opacity: l.opacity };
                                })
                              )
                            }
                            icon={
                              <FontAwesomeIcon
                                className={useNewLayers ? "" : "fa-rotate-180"}
                                icon={
                                  useNewLayers ? faRotateLeft : faSquareUpRight
                                }
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
                              {layer.backgroundLayer && (
                                <LayerButton
                                  key={layer.id}
                                  classNames={["px-3"]}
                                  useShadow={false}
                                >
                                  <LayerIcon layer={layer.backgroundLayer} />
                                  <span className="text-base ml-1">
                                    {layer.backgroundLayer?.title}
                                  </span>
                                  {layer.backgroundLayer?.opacity !== 1 && (
                                    <span className="text-base ml-1 text-gray-500">
                                      ({layer.backgroundLayer?.opacity * 100}%)
                                    </span>
                                  )}
                                </LayerButton>
                              )}
                              {layer.layers.map((layer) => (
                                <LayerButton
                                  key={layer.id}
                                  classNames={["px-3"]}
                                  useShadow={false}
                                >
                                  <LayerIcon
                                    layer={layer}
                                    fallbackIcon={layer.icon}
                                  />
                                  <span className="text-base ml-1">
                                    {layer.title}
                                  </span>
                                  {layer.opacity !== 1 && (
                                    <span className="text-base ml-1 text-gray-500">
                                      ({layer.opacity * 100}%)
                                    </span>
                                  )}
                                </LayerButton>
                              ))}
                            </>
                          ) : (
                            activeLayers.map((layer) => (
                              <LayerButton
                                key={layer.id}
                                classNames={["px-3"]}
                                useShadow={false}
                              >
                                <LayerIcon
                                  layer={layer}
                                  fallbackIcon={layer.icon}
                                />
                                <span className="text-base ml-1">
                                  {layer.title}
                                </span>
                                {layer.opacity !== 1 && (
                                  <span className="text-base ml-1 text-gray-500">
                                    ({layer.opacity * 100}%)
                                  </span>
                                )}
                              </LayerButton>
                            ))
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
                              onChange={(e) =>
                                setUpdatedThumbnail(e.target.value)
                              }
                              id="thumbnail"
                            />
                          ),
                        },
                      ]}
                    />
                  </div>
                  <label
                    htmlFor="tags"
                    className="font-semibold text-lg pt-2 mb-1"
                  >
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
                </>
              )}
              {isGenericTopicMap && (
                <>
                  <h5 className="font-semibold text-lg">Implementierung</h5>
                  <p className="text-base text-gray-600">
                    Themenspezifische Kartenanwendung im Framework{" "}
                    <a href="https://github.com/cismet/carma">carma</a>, durch
                    Anpassen von Konfigurationsdateien aus den Daten und
                    Methoden des DigiTal Zwillings abgeleitet ("Generic
                    TopicMap").
                  </p>
                </>
              )}
              {isTopicMap && (
                <>
                  <h5 className="font-semibold text-lg">Implementierung</h5>
                  <p className="text-base text-gray-600">
                    Themenspezifische Kartenanwendung im Framework{" "}
                    <a href="https://github.com/cismet/carma">carma</a>, durch
                    spezifische Programmierung aus den Daten und Methoden des
                    DigiTal Zwillings abgeleitet.
                  </p>
                </>
              )}
              {isArcGisOnline && (
                <>
                  <h5 className="font-semibold text-lg">Implementierung</h5>
                  <p className="text-base text-gray-600">
                    Interaktive 3D-Szene realisiert mit ArcGIS Online auf Basis
                    von Daten des DigiTal Zwillings.
                  </p>
                </>
              )}
            </div>
          </div>
          {(links.length > 0 || copyright) && (
            <>
              <div className="h-full w-0 border-r border-gray-300 my-0 hidden sm:block" />
              <div className="flex flex-col gap-0 sm:w-1/4 w-full">
                {links.length > 0 && (
                  <h5 className="font-semibold text-lg">Links</h5>
                )}
                {links.map((link, i) => (
                  <a
                    key={`link_${i}`}
                    href={link.url}
                    target="_blank"
                    className="pb-2"
                  >
                    {link.text}
                  </a>
                ))}
                {copyright && (
                  <>
                    <h5 className="font-semibold text-lg">Bildnachweis</h5>
                    <p className="text-base text-gray-600">{copyright}</p>
                  </>
                )}
              </div>
            </>
          )}
          {legends && (
            <>
              <div className="h-full w-0 border-r border-gray-300 my-0 hidden sm:block" />
              <div className="flex flex-col gap-0 sm:w-1/4 w-full">
                <h5 className="font-semibold text-lg">Legende</h5>
                <div className="h-full overflow-auto">
                  {legends?.map((legend, i) => (
                    <img
                      key={`legend_${i}`}
                      src={updateUrl(legend.OnlineResource)}
                      alt="Legende"
                      className="h-fit"
                    />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
        {editCollection ? (
          <div className="pt-2">
            <TagSelector
              keywords={updatedKeywords}
              setKeywords={setUpdatedKeywords}
              showAddButton={false}
            />
          </div>
        ) : (
          <p
            style={{ color: "rgba(0,0,0,0.5)", fontSize: "0.875rem" }}
            className="mb-0"
          >
            {tags?.map((tag, i) => (
              <span key={"tag_" + tag + "_" + i}>
                <span>{tag}</span>
                {i + 1 < tags?.length && <span> · </span>}
              </span>
            ))}
            {isVectorLayer && (
              <span>
                {tags && tags.length > 0 && <span> · </span>}
                <span>Vektorlayer</span>
              </span>
            )}
          </p>
        )}
      </div>
    </div>
  );
};

export default InfoCard;
