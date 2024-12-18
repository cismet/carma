import { faStar as regularFaStar } from "@fortawesome/free-regular-svg-icons";
import {
  faChevronDown,
  faChevronUp,
  faCircleMinus,
  faCirclePlus,
  faExternalLinkAlt,
  faMinus,
  faPlus,
  faRocket,
  faSquareUpRight,
  faStar,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Button, Modal, Spin } from "antd";
import { useEffect, useState } from "react";
import { extractVectorStyles } from "../helper/layerHelper";
import type { Item } from "../helper/types";
import InfoCard from "./InfoCard";
import tmpThumbnail from "./tmpService.jpg";
import { extractCarmaConfig } from "@carma-commons/utils";

interface LayerItemProps {
  setAdditionalLayers: any;
  layer: Item;
  activeLayers: Item[];
  favorites?: Item[];
  addFavorite: (layer: Item) => void;
  removeFavorite: (layer: Item) => void;
  selectedLayerId: string | null;
  setSelectedLayerId: (id: string | null) => void;
  setPreview: (preview: boolean) => void;
  showWithoutThumbnail?: boolean;
}

const LayerItem = ({
  setAdditionalLayers,
  layer,
  activeLayers,
  favorites,
  addFavorite,
  removeFavorite,
  selectedLayerId,
  setSelectedLayerId,
  setPreview,
  showWithoutThumbnail,
}: LayerItemProps) => {
  const [hovered, setHovered] = useState(false);
  const [isActiveLayer, setIsActiveLayer] = useState(false);
  const isFavorite = favorites
    ? favorites.some(
        (favorite) =>
          favorite.id === `fav_${layer.id}` || favorite.id === layer.id
      )
    : false;
  const [collectionImages, setCollectionImages] = useState<string[]>([]);
  const [openDeleteModal, setOpenDeleteModal] = useState(false);
  const [links, setLinks] = useState<
    {
      url: string;
      text: string;
    }[]
  >([]);
  const [forceWMS, setForceWMS] = useState(false);
  const showInfo = selectedLayerId === layer.id;
  const canShowInfo =
    layer.type === "layer" ||
    (layer.type === "link" && layer.description) ||
    (layer.type === "collection" && layer.description);
  const title = layer.title;
  const description = layer.description;
  const keywords = layer.keywords;
  const carmaConf = extractCarmaConfig(layer.keywords);

  const regex = /Inhalt:(.*?)Sichtbarkeit:/s;

  const match = description?.match(regex);

  const [isLoading, setIsLoading] = useState(true);

  const hightlightTextIndexes = undefined;

  const handleLayerClick = (
    e: React.MouseEvent<HTMLElement, MouseEvent>,
    preview: boolean = false
  ) => {
    e.stopPropagation();
    setAdditionalLayers(layer, false, forceWMS, preview);
  };

  useEffect(() => {
    let setActive = false;
    if (
      activeLayers.find(
        (activeLayer) =>
          activeLayer.id ===
          (layer?.id?.startsWith("fav_") ? layer.id.slice(4) : layer.id)
      )
    ) {
      setActive = true;
    }
    setIsActiveLayer(setActive);
  }, [activeLayers]);

  useEffect(() => {
    const tmpLinks: { url: string; text: string }[] = [];

    if (layer.service?.url) {
      tmpLinks.push({
        url:
          layer.service.url +
          "?service=WMS&request=GetCapabilities&version=1.1.1",
        text: "Inhaltsverzeichnis des Kartendienstes (WMS Capabilities)",
      });
    }

    if (carmaConf?.opendata) {
      tmpLinks.push({
        url: carmaConf.opendata,
        text: "Datenquelle im Open-Data-Portal Wuppertal",
      });
    }

    setLinks(tmpLinks);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey) {
        setForceWMS(true);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      setForceWMS(false);
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);

    return () => {
      document.removeEventListener("keydown", onKeyDown);

      document.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  return (
    <>
      <div
        className={`flex flex-col cursor-pointer rounded-lg w-full shadow-sm h-fit hover:!shadow-lg ${
          showInfo ? "bg-blue-50" : "bg-white"
        }`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => {
          console.log("xxx", layer);
          if (canShowInfo) {
            setSelectedLayerId(showInfo ? null : layer.id);
          }
        }}
        data-test-id="card-layer-prev"
      >
        <div className="relative overflow-hidden bg-white isolate rounded-md flex justify-center items-center w-full aspect-[1.7777/1]">
          {isLoading && !showWithoutThumbnail && (
            <div style={{ position: "absolute", left: "50%" }}>
              <Spin />
            </div>
          )}

          {showWithoutThumbnail || layer.id.includes("custom") ? (
            <img
              src={tmpThumbnail}
              alt={title}
              loading="lazy"
              style={{ objectPosition: "50% 35%" }}
              className={`object-cover relative h-full overflow-clip w-[calc(130%+7.2px)] ${
                hovered && "scale-110"
              } transition-all duration-200`}
              onLoad={(e) => {
                setIsLoading(false);
              }}
            />
          ) : layer.type !== "collection" || layer.thumbnail ? (
            <img
              src={layer.thumbnail}
              alt={title}
              loading="lazy"
              className={`object-cover relative h-full overflow-clip w-[calc(130%+7.2px)] ${
                hovered && "scale-110"
              } transition-all duration-200`}
              onLoad={(e) => {
                setIsLoading(false);
              }}
            />
          ) : layer.type === "collection" ? (
            <div
              className={`overflow-clip ${
                layer.layers.length > 3
                  ? "grid grid-cols-2"
                  : "flex flex-col h-full"
              }`}
            >
              {layer.layers.map((item, i) => {
                if (i > 3) {
                  return <></>;
                }
                return (
                  <img
                    key={`collection_img_${i}`}
                    src={item.other?.thumbnail}
                    alt={title}
                    loading="lazy"
                    onLoad={(e) => {
                      setIsLoading(false);
                    }}
                    className={`object-cover relative overflow-clip w-[calc(130%+7.2px)] ${
                      hovered && "scale-110"
                    } transition-all duration-200`}
                  />
                );
              })}
            </div>
          ) : (
            <div className="object-cover relative h-full overflow-clip w-[calc(130%+7.2px)]" />
          )}

          {layer.type !== "collection" ? (
            isFavorite ? (
              <FontAwesomeIcon
                className="absolute right-1 top-1 text-3xl text-yellow-200 cursor-pointer z-50"
                icon={faStar}
                onClick={(e) => {
                  e.stopPropagation();
                  if (removeFavorite) {
                    removeFavorite(layer);
                  }
                }}
                data-test-id="remove-layer-favorite"
              />
            ) : (
              <FontAwesomeIcon
                className="absolute right-1 top-1 text-3xl cursor-pointer z-50 text-white drop-shadow-[0_1.2px_1.2px_rgba(0,0,0,1)]"
                icon={regularFaStar}
                onClick={(e) => {
                  e.stopPropagation();
                  if (addFavorite) {
                    addFavorite(layer);
                  }
                }}
                data-test-id="add-layer-favorite"
              />
            )
          ) : null}
          {layer.type === "link" ? (
            <a
              className="absolute left-1 top-1 text-3xl cursor-pointer z-50 text-white drop-shadow-[0_1.2px_1.2px_rgba(0,0,0,1)]"
              href={layer.url}
              target="topicMaps"
            >
              <FontAwesomeIcon icon={faExternalLinkAlt} />
            </a>
          ) : layer.type === "collection" ? (
            <>
              <button
                onClick={handleLayerClick}
                className="absolute left-1 top-1 z-50"
              >
                <FontAwesomeIcon
                  icon={faSquareUpRight}
                  className="text-3xl text-white drop-shadow-[0_1.2px_1.2px_rgba(0,0,0,1)]"
                />
              </button>
              <FontAwesomeIcon
                onClick={() => setOpenDeleteModal(true)}
                icon={faTrash}
                className="absolute left-1 top-11 text-3xl cursor-pointer text-white drop-shadow-[0_1.2px_1.2px_rgba(0,0,0,1)] z-50"
              />
            </>
          ) : (
            <button
              onClick={handleLayerClick}
              className="absolute left-1 top-1 z-50"
              data-test-id="apply-layer-to-map"
            >
              <FontAwesomeIcon
                icon={isActiveLayer ? faMinus : faPlus}
                className="text-3xl text-white drop-shadow-[0_1.2px_1.2px_rgba(0,0,0,1)]"
              />
            </button>
          )}
          {hovered && (
            <div className="flex flex-col items-center gap-2 absolute top-0 w-full h-full justify-center p-8 px-10">
              {layer.type === "link" ? (
                <a
                  className="w-36 bg-gray-100 hover:no-underline text-black hover:text-neutral-600 hover:bg-gray-50 rounded-md py-2 flex text-center items-center px-2"
                  href={layer.url}
                  target="_topicMaps"
                >
                  <>
                    <FontAwesomeIcon
                      icon={faExternalLinkAlt}
                      className="text-lg mr-2"
                    />
                    Öffnen
                  </>
                </a>
              ) : layer.type === "collection" ? (
                <>
                  <button
                    className="w-36 bg-gray-100 hover:bg-gray-50 rounded-md py-2 flex text-center items-center px-2"
                    onClick={handleLayerClick}
                  >
                    <FontAwesomeIcon
                      icon={faSquareUpRight}
                      className="text-lg mr-2"
                    />{" "}
                    Laden
                  </button>
                  <button
                    className="w-36 bg-gray-100 hover:bg-gray-50 rounded-md py-2 flex text-center items-center px-2"
                    onClick={() => setOpenDeleteModal(true)}
                  >
                    <FontAwesomeIcon icon={faTrash} className="text-lg mr-2" />{" "}
                    Löschen
                  </button>
                </>
              ) : (
                <button
                  className="w-36 bg-gray-100 hover:bg-gray-50 rounded-md py-2 flex text-center items-center px-2"
                  onClick={handleLayerClick}
                >
                  {isActiveLayer ? (
                    <>
                      <FontAwesomeIcon
                        icon={faCircleMinus}
                        className="text-lg mr-2"
                      />{" "}
                      Entfernen
                    </>
                  ) : (
                    <>
                      <FontAwesomeIcon
                        icon={faCirclePlus}
                        className="text-lg mr-2"
                      />{" "}
                      Hinzufügen
                    </>
                  )}
                </button>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2 p-4">
          <div className="w-full flex gap-2">
            <h3
              className="text-base w-full mb-0 line-clamp-2"
              style={{ height: "3.5rem" }}
            >
              {title}
            </h3>
            {canShowInfo && (
              <div className="flex flex-col gap-2">
                <FontAwesomeIcon
                  icon={
                    selectedLayerId === layer.id ? faChevronUp : faChevronDown
                  }
                  className="text-xl pt-1 cursor-pointer text-gray-700 z-50"
                />
                {keywords &&
                  extractVectorStyles(keywords)?.vectorStyle &&
                  !forceWMS && (
                    <FontAwesomeIcon
                      icon={faRocket}
                      className="text-xl pt-1 cursor-pointer text-gray-700 z-50"
                    />
                  )}
              </div>
            )}
          </div>
        </div>
        <Modal
          footer={null}
          open={openDeleteModal}
          onCancel={() => setOpenDeleteModal(false)}
        >
          <div className="flex flex-col gap-2 p-4">
            <h3 className="text-lg">
              Zusammenstellung {title} wirklich löschen?
            </h3>
            <p className="text-base line-clamp-3 h-[66px]">
              Diese Aktion kann nicht rückgängig gemacht werden.
            </p>
            <div className="flex gap-2 w-full justify-end items-center">
              <Button onClick={() => setOpenDeleteModal(false)}>
                Abbrechen
              </Button>
              <Button
                danger
                onClick={() => {
                  setOpenDeleteModal(false);
                  setAdditionalLayers(layer, true);
                }}
              >
                Löschen
              </Button>
            </div>
          </div>
        </Modal>
      </div>
      {showInfo && (
        <InfoCard
          isFavorite={isFavorite}
          isActiveLayer={isActiveLayer}
          layer={layer}
          handleAddClick={handleLayerClick}
          handleFavoriteClick={() => {
            if (isFavorite) {
              removeFavorite(layer);
            } else {
              addFavorite(layer);
            }
          }}
          closeInfoCard={() => setSelectedLayerId(null)}
          setPreview={setPreview}
          links={links}
          deleteCollection={() => {
            setOpenDeleteModal(true);
          }}
        />
      )}
    </>
  );
};

export default LayerItem;
