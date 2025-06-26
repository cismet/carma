import { Button, Input, Select } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleMinus,
  faCirclePlus,
  faEdit,
  faExternalLink,
  faMap,
  faSave,
  faSquareUpRight,
  faStar,
  faTrash,
  faX,
} from "@fortawesome/free-solid-svg-icons";

import { Item } from "@carma-commons/types";
import { extractCarmaConfig } from "@carma-commons/utils";

import { parseDescription, serviceOptions } from "../helper/layerHelper";
import { useState } from "react";
import { useAuth } from "@carma-apps/portals";

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
}: InfoCardProps) => {
  const { title, description, tags } = layer;

  const [editCollection, setEditCollection] = useState(false);
  const [updatedTitle, setUpdatedTitle] = useState(title);
  const [editedDescriptions, setEditedDescriptions] = useState<{
    [key: string]: string;
  }>({});
  const [updatedService, setUpdatedService] = useState("discoverPoi");
  const [updatedThumbnail, setUpdatedThumbnail] = useState(layer.thumbnail);
  const [loading, setLoading] = useState(false);

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

  const updateItem = async () => {
    setLoading(true);
    const apiUrl = "https://wunda-cloud-api.cismet.de";
    const taskParameters = {
      parameters: {
        className: "gp_entdecken",
        data: JSON.stringify({
          id: layer.id,
          name: updatedTitle,
          config: JSON.stringify({
            ...layer,
            description: reconstructDescription(),
            title: updatedTitle,
            thumbnail: updatedThumbnail,
            serviceName: updatedService,
          }),
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
                  <Button
                    type="primary"
                    danger
                    icon={<FontAwesomeIcon icon={faTrash} />}
                  >
                    Löschen
                  </Button>
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
              {parsedDescriptions.map((description, i) => {
                if (description.title === "Sichtbarkeit") {
                  return null;
                }
                return (
                  <>
                    <h5 className="font-semibold text-lg">
                      {description.title}
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
                  </>
                );
              })}
              {editCollection && (
                <>
                  <label
                    htmlFor="service"
                    className="font-semibold text-lg pt-1"
                  >
                    Kategorie
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
                  </label>
                  <Input
                    className="bg-white"
                    value={updatedThumbnail}
                    onChange={(e) => setUpdatedThumbnail(e.target.value)}
                    id="thumbnail"
                  />
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
      </div>
    </div>
  );
};

export default InfoCard;
