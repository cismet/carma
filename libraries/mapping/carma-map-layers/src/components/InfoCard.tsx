import { Button } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleMinus,
  faCirclePlus,
  faExternalLink,
  faImage,
  faMap,
  faSquareUpRight,
  faStar,
  faTrash,
  faX,
} from "@fortawesome/free-solid-svg-icons";

import { extractCarmaConfig } from "@carma-commons/utils";

import { parseDescription } from "../helper/layerHelper";
import { Item } from "../helper/types";
import { useEffect, useState } from "react";

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
}: InfoCardProps) => {
  const { title, description, tags } = layer;
  // @ts-expect-error fix typing
  const legends = layer?.props?.Style?.[0]?.LegendURL;
  const parsedDescriptions = parseDescription(description);
  const carmaConf = extractCarmaConfig(layer.keywords);
  const isVectorLayer = carmaConf?.vectorStyle;
  const canFavoriteItem =
    layer.type !== "collection" ||
    (layer.type === "collection" && layer.serviceName.includes("discover"));
  const isGenericTopicMap = layer?.name?.startsWith("wuppGenericTopicMaps_");
  const isTopicMap = layer?.name?.startsWith("wuppTopicMaps_");
  const copyright = layer.copyright;

  return (
    <div
      className="w-full h-full sm:h-[400px] px-6 pt-6 pb-2 shadow-sm hover:!shadow-lg rounded-lg bg-blue-50 col-span-full max-w-full overflow-x-auto"
      style={{ maxWidth: "100vw" }}
    >
      <div className="flex h-full flex-col justify-between">
        <div className="relative pb-4">
          <div className="flex flex-wrap gap-4 items-center pr-8">
            <h3 className="mb-0 truncate leading-10 text-xl sm:text-2xl">
              {title}
            </h3>
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
                    <p
                      className="text-base text-gray-600"
                      dangerouslySetInnerHTML={{
                        __html: description.description,
                      }}
                    />
                  </>
                );
              })}
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
