import { Fragment, useState } from "react";
import { Button, message } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleMinus,
  faCirclePlus,
  faEdit,
  faExternalLink,
  faLayerGroup,
  faMap,
  faSquareUpRight,
  faStar,
  faTrash,
  faUpload,
  faX,
} from "@fortawesome/free-solid-svg-icons";

import type { Item } from "../lib/contracts/carma-layers.d";
import {
  extractCarmaConfig,
  resolveLayerTitle,
  resolveLayerDescription,
} from "@carma-commons/utils";
import { useAuth } from "@carma-providers/auth";

import {
  isExternalUrl,
  navigateToInternalHashLink,
  parseDescription,
} from "../helper/layerHelper";
import { saveDiscoverItem } from "../helper/discover";
import {
  useCatalogSelectedItem,
  useCatalogSelectionActions,
  useDiscoverRefetch,
} from "../context/LayerCatalogProvider";
import { useCatalogInteraction } from "../context/CatalogInteractionContext";
import { useLayerCatalogConfig } from "../config/LayerCatalogConfigContext";
import DiscoverItemEditor, {
  checkForRequiredDiscoverFields,
} from "./DiscoverItemEditor";
import LegendDisplay from "./LegendDisplay";

interface InfoCardProps {
  isFavorite: boolean;
  isActiveLayer: boolean;
  /** set when the layer is on the map only as a member of this group */
  activeGroupTitle?: string;
  onAddClick: (
    e: React.MouseEvent<HTMLElement, MouseEvent>,
    preview?: boolean
  ) => void;
  onFavoriteClick: (
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>
  ) => void;
  links: { url: string; text: string }[];
  onDeleteCollection: () => void;
}

type LegendEntry = { OnlineResource: string };

/** the expanded detail view below a selected card */
const InfoCard = ({
  isFavorite,
  isActiveLayer,
  activeGroupTitle,
  onAddClick,
  onFavoriteClick,
  links,
  onDeleteCollection,
}: InfoCardProps) => {
  const layer = useCatalogSelectedItem();
  const { selectItem } = useCatalogSelectionActions();
  const { requestDiscoverRefetch } = useDiscoverRefetch();
  const { activeLayers, setPreview } = useCatalogInteraction();
  const { discoverProps } = useLayerCatalogConfig();
  const { jwt, userGroups } = useAuth();
  const [messageApi, contextHolder] = message.useMessage();

  const [editing, setEditing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  if (!layer) {
    return null;
  }
  const { description, tags } = layer;
  const displayTitle = resolveLayerTitle(layer);

  const allowPublishing =
    userGroups.includes("_Geoportal_Publizieren") && !!jwt;

  const carmaConf = extractCarmaConfig(layer.keywords);
  const vectorLegend = layer.vectorLegend || carmaConf?.vectorLegend;
  const vectorStyle = layer.vectorStyle || carmaConf?.vectorStyle;
  const vectorLegendTitle =
    layer.vectorLegendTitle || (carmaConf?.vectorLegendTitle as string);
  const legendTitle = vectorLegendTitle || "Legende";

  const legends: LegendEntry[] | undefined =
    vectorStyle && typeof vectorLegend === "string"
      ? [{ OnlineResource: vectorLegend }]
      : (
          layer as {
            props?: { Style?: Array<{ LegendURL?: LegendEntry[] }> };
          }
        ).props?.Style?.[0]?.LegendURL;
  const displayDescription = resolveLayerDescription(layer);
  const parsedDescriptions = parseDescription(
    displayDescription ?? description
  );
  const isVectorLayer = carmaConf?.vectorStyle;
  const canFavoriteItem =
    layer.type !== "workflow" &&
    (layer.type !== "collection" ||
      (layer.type === "collection" && layer.serviceName.includes("discover")));
  const isDiscoverItem = layer.serviceName.includes("discover");
  const isGenericTopicMap = layer?.name?.startsWith("wuppGenericTopicMaps_");
  const isTopicMap = layer?.name?.startsWith("wuppTopicMaps_");
  const isArcGisOnline = layer?.name?.startsWith("wuppArcGisOnline_");
  const copyright = layer.copyright;

  // publish the item as it is stored, without entering the edit mode
  const publishItem = async () => {
    if (!discoverProps) {
      return;
    }
    const config = {
      ...layer,
      backgroundLayer: activeLayers[0],
      layers: layer.type === "collection" ? layer.layers : [],
    } as Item;
    const error = checkForRequiredDiscoverFields(config);
    if (error) {
      setErrorMessage(error);
      return;
    }
    setErrorMessage("");
    setPublishing(true);
    const saved = await saveDiscoverItem({
      discoverProps,
      jwt: jwt || undefined,
      id: layer.id,
      name: layer.title,
      draft: false,
      config,
    });
    setPublishing(false);
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

  return (
    <div
      className="w-full h-full sm:h-[400px] px-6 pt-6 pb-2 shadow-sm hover:!shadow-lg rounded-lg bg-blue-50 col-span-full max-w-full overflow-x-auto"
      style={{ maxWidth: "100vw" }}
      data-test-id="card-layer-detailed-info"
    >
      {contextHolder}
      {editing && isDiscoverItem ? (
        <DiscoverItemEditor layer={layer} onCancel={() => setEditing(false)} />
      ) : (
        <div className="flex h-full flex-col justify-between">
          <div className="relative pb-4">
            <div className="flex flex-wrap gap-4 items-center pr-8">
              <h3 className="mb-0 truncate leading-10 text-xl sm:text-2xl">
                {displayTitle}
              </h3>
              <div className="flex flex-wrap items-center gap-4">
                {(layer.type === "layer" ||
                  layer.type === "object" ||
                  (layer.type === "workflow" &&
                    !!layer.workflowLayers?.length)) &&
                  (activeGroupTitle ? (
                    <span className="flex items-center gap-2 text-gray-600">
                      <FontAwesomeIcon icon={faLayerGroup} />
                      In der Karte als Teil der Gruppe „{activeGroupTitle}“
                    </span>
                  ) : (
                    <Button
                      onClick={onAddClick}
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
                  ))}
                {layer.type === "collection" && (
                  <>
                    <Button
                      onClick={onAddClick}
                      icon={<FontAwesomeIcon icon={faSquareUpRight} />}
                    >
                      <span className="!hidden sm:!inline-block">Laden</span>
                    </Button>
                    {!layer.serviceName.includes("discover") && (
                      <Button
                        onClick={onDeleteCollection}
                        icon={<FontAwesomeIcon icon={faTrash} />}
                      >
                        <span className="!hidden sm:!inline-block">
                          Löschen
                        </span>
                      </Button>
                    )}
                  </>
                )}
                {layer.serviceName === "measurements" && (
                  <Button
                    onClick={onDeleteCollection}
                    icon={<FontAwesomeIcon icon={faTrash} />}
                  >
                    <span className="!hidden sm:!inline-block">Löschen</span>
                  </Button>
                )}
                {layer.type === "link" && (
                  <Button
                    href={layer.url}
                    target={isExternalUrl(layer.url) ? "_topicMaps" : "_self"}
                    onClick={
                      isExternalUrl(layer.url)
                        ? undefined
                        : (e) => {
                            // keep the current hash query (map position etc.)
                            e.preventDefault();
                            navigateToInternalHashLink(layer.url);
                          }
                    }
                    icon={
                      <FontAwesomeIcon
                        icon={
                          isExternalUrl(layer.url)
                            ? faExternalLink
                            : faSquareUpRight
                        }
                      />
                    }
                  >
                    <span className="!hidden sm:!inline-block">Öffnen</span>
                  </Button>
                )}
                {canFavoriteItem && (
                  <Button
                    onClick={onFavoriteClick}
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
                        onClick={publishItem}
                        loading={publishing}
                      >
                        Publizieren
                      </Button>
                    )}
                    <Button
                      onClick={() => setEditing(true)}
                      icon={<FontAwesomeIcon icon={faEdit} />}
                    >
                      <span className="!hidden sm:!inline-block">
                        Bearbeiten
                      </span>
                    </Button>
                    <Button
                      type="primary"
                      danger
                      icon={<FontAwesomeIcon icon={faTrash} />}
                      onClick={onDeleteCollection}
                    >
                      Löschen
                    </Button>
                  </>
                )}
                {layer.type === "layer" && !activeGroupTitle && (
                  <Button
                    onClick={(e) => {
                      setPreview(true);
                      onAddClick(e, true);
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
                {errorMessage && (
                  <div className="text-red-500">{errorMessage}</div>
                )}

                {parsedDescriptions.map((section, i) => {
                  if (section.title === "Sichtbarkeit") {
                    return null;
                  }
                  return (
                    <Fragment key={`description_${i}`}>
                      <label
                        htmlFor={section.title}
                        className="font-semibold text-lg mb-1 pt-2"
                      >
                        {section.title}
                      </label>
                      <p
                        className="text-base text-gray-600"
                        dangerouslySetInnerHTML={{
                          __html: section.description,
                        }}
                      />
                    </Fragment>
                  );
                })}
                {isGenericTopicMap && (
                  <>
                    <h5 className="font-semibold text-lg">Implementierung</h5>
                    <p className="text-base text-gray-600">
                      Themenspezifische Kartenanwendung im Framework{" "}
                      <a href="https://github.com/cismet/carma">carma</a>,
                      durch Anpassen von Konfigurationsdateien aus den Daten
                      und Methoden des DigiTal Zwillings abgeleitet ("Generic
                      TopicMap").
                    </p>
                  </>
                )}
                {isTopicMap && (
                  <>
                    <h5 className="font-semibold text-lg">Implementierung</h5>
                    <p className="text-base text-gray-600">
                      Themenspezifische Kartenanwendung im Framework{" "}
                      <a href="https://github.com/cismet/carma">carma</a>,
                      durch spezifische Programmierung aus den Daten und
                      Methoden des DigiTal Zwillings abgeleitet.
                    </p>
                  </>
                )}
                {isArcGisOnline && (
                  <>
                    <h5 className="font-semibold text-lg">Implementierung</h5>
                    <p className="text-base text-gray-600">
                      Interaktive 3D-Szene realisiert mit ArcGIS Online auf
                      Basis von Daten des DigiTal Zwillings.
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
                  <h5 className="font-semibold text-lg">{legendTitle}</h5>
                  <div className="h-full overflow-auto">
                    {legends?.map((legend, i) => (
                      <LegendDisplay
                        key={`legend_${i}`}
                        url={legend.OnlineResource}
                        updateUrl
                      />
                    ))}
                  </div>
                </div>
              </>
            )}
            {(layer.createdAt || layer.createdBy || layer.updatedAt) && (
              <>
                <div className="h-full w-0 border-r border-gray-300 my-0 hidden sm:block" />
                <div className="flex flex-col gap-0 sm:w-1/4 w-full">
                  <h5 className="font-semibold text-lg">Bearbeitungsvermerk</h5>
                  {layer.createdBy && (
                    <p className="text-base text-gray-600 mb-1">
                      Erstellt von: {layer.createdBy}
                    </p>
                  )}
                  {layer.createdAt && (
                    <p className="text-base text-gray-600 mb-1">
                      Erstellt am:{" "}
                      {new Date(layer.createdAt).toLocaleDateString("de-DE")}
                    </p>
                  )}
                  {layer.updatedAt && (
                    <p className="text-base text-gray-600 mb-1">
                      Aktualisiert am:{" "}
                      {new Date(layer.updatedAt).toLocaleDateString("de-DE")}
                    </p>
                  )}
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
        </div>
      )}
    </div>
  );
};

export default InfoCard;
