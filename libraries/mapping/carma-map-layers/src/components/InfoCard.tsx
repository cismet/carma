import { Button, Input, Select, Tabs } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBan,
  faCircleMinus,
  faCirclePlus,
  faEdit,
  faExternalLink,
  faMap,
  faPlus,
  faSave,
  faSquareUpRight,
  faStar,
  faTrash,
  faUpload,
  faX,
} from "@fortawesome/free-solid-svg-icons";

import { Item } from "@carma-commons/types";
import { extractCarmaConfig } from "@carma-commons/utils";

import { parseDescription, serviceOptions } from "../helper/layerHelper";
import { Fragment, useState } from "react";
import { FileUploader, uploadImage, useAuth } from "@carma-apps/portals";
import { TagSelector } from "@carma-commons/ui/tag-selection";

interface InfoCardProps {
  layer: Item;
  isFavorite: boolean;
  isActiveLayer: boolean;
  handleAddClick: (
    e: React.MouseEvent<HTMLElement, MouseEvent>,
    preview?: boolean
  ) => void;
  handleFavoriteClick: (
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>
  ) => void;
  closeInfoCard: () => void;
  setPreview: (preview: boolean) => void;
  links: { url: string; text: string }[];
  deleteCollection: () => void;
  setTriggerRefetch: (value: boolean) => void;
  loadingData: boolean;
  discoverProps?: {
    appKey: string;
    apiUrl: string;
    daqKey: string;
  };
}

const InfoCard = ({
  layer,
  isFavorite,
  isActiveLayer,
  handleAddClick,
  handleFavoriteClick,
  closeInfoCard,
  setPreview,
  links,
  deleteCollection,
  setTriggerRefetch,
  loadingData,
  discoverProps,
}: InfoCardProps) => {
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

  const { jwt } = useAuth();

  const legends = (layer as unknown as any).props?.Style?.[0]?.LegendURL; // TODO: fix type
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
    if (updatedFile && updatedFile instanceof File) {
      fileUrl = await uploadImage(updatedFile, jwt);
      if (!fileUrl) return;
    }

    const config = {
      ...layer,
      description: reconstructDescription(),
      title: updatedTitle,
      thumbnail: fileUrl || updatedThumbnail,
      serviceName: updatedService,
      tags: updatedKeywords,
    };
    if (!(!publish && layer.isDraft)) {
      const error = checkForRequiredFields(config);
      if (error) {
        setErrorMessage(error);
        return;
      }
    }
    setLoading(true);
    const apiUrl = discoverProps?.apiUrl || "https://wunda-cloud-api.cismet.de";
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
      setTriggerRefetch(true);
      const waitForLoadingToFinish = async () => {
        while (loadingData) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        setLoading(false);
        setEditCollection(false);
        closeInfoCard();
      };

      waitForLoadingToFinish();
    }
  };

  return (
    <div
      className="w-full h-full sm:h-[400px] px-6 pt-6 pb-2 shadow-sm hover:!shadow-lg rounded-lg bg-blue-50 col-span-full max-w-full overflow-x-auto"
      style={{ maxWidth: "100vw" }}
    >
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
              {jwt && isDiscoverItem && (
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
            onClick={closeInfoCard}
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
              {parsedDescriptions.map((description, i) => {
                if (description.title === "Sichtbarkeit") {
                  return null;
                }
                return (
                  <Fragment key={`description_${i}`}>
                    <h5 className="font-semibold text-lg">
                      {description.title}
                      {editCollection && (
                        <span className="text-red-500"> *</span>
                      )}
                    </h5>
                    {editCollection ? (
                      <Input.TextArea
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
                  <label
                    htmlFor="service"
                    className="font-semibold text-lg pt-1"
                  >
                    Kategorie
                    {editCollection && <span className="text-red-500"> *</span>}
                  </label>
                  <br />
                  <Select
                    options={serviceOptions}
                    onChange={(value) => setUpdatedService(value)}
                    value={updatedService}
                    className="w-40"
                    id="service"
                  />
                  <br />
                  <label
                    htmlFor="thumbnail"
                    className="font-semibold text-lg pt-1"
                  >
                    Vorschaubild
                    <span className="text-red-500"> *</span>
                  </label>
                  <div className="w-1/3">
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
                  <label htmlFor="tags">Schlüsselwörter</label>
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
                      src={legend.OnlineResource}
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
                {i + 1 < tags.length && <span> · </span>}
              </span>
            ))}
            {isVectorLayer && (
              <span>
                {tags.length > 0 && <span> · </span>}
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
