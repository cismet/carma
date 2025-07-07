import { useEffect, useState } from "react";
import { faStar as regularFaStar } from "@fortawesome/free-regular-svg-icons";
import {
  faChevronDown,
  faChevronUp,
  faCircleMinus,
  faCirclePlus,
  faExternalLinkAlt,
  faMinus,
  faPlus,
  faSquareUpRight,
  faStar,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Button, Modal, Spin } from "antd";

import { Item } from "@carma-commons/types";
import { extractCarmaConfig } from "@carma-commons/utils";
import {
  extServiceText,
  extServiceBackgroundImage,
} from "@carma-collab/wuppertal/geoportal";

import InfoCard from "./InfoCard";
import { useAuth } from "@carma-apps/portals";

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
  setTriggerRefetch: (value: boolean) => void;
  loadingData: boolean;
  discoverProps?: {
    appKey: string;
    apiUrl: string;
    daqKey: string;
  };
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
  setTriggerRefetch,
  loadingData,
  discoverProps,
}: LayerItemProps) => {
  const [hovered, setHovered] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isActiveLayer, setIsActiveLayer] = useState(false);
  const isFavorite = favorites
    ? favorites.some(
        (favorite) =>
          favorite.id === `fav_${layer.id}` || favorite.id === layer.id
      )
    : false;
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
  const canFavoriteItem =
    layer.type !== "collection" ||
    (layer.type === "collection" && layer.serviceName.includes("discover"));
  const title = layer.title;
  const carmaConf = extractCarmaConfig(layer.keywords);

  const [isLoading, setIsLoading] = useState(true);

  const { jwt } = useAuth();

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
        url: carmaConf.opendata as string,
        text:
          layer.type === "link"
            ? "Beschreibung im Open-Data-Portal"
            : "Datenquelle im Open-Data-Portal Wuppertal",
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

  const deleteDiscoverItem = async () => {
    setLoading(true);
    const apiUrl = discoverProps?.apiUrl || "https://wunda-cloud-api.cismet.de";
    const taskParameters = {
      parameters: {
        className: discoverProps?.daqKey || "gp_entdecken",
        data: JSON.stringify({
          id: layer.id,
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
        "/actions/WUNDA_BLAU.DeleteObject/tasks?resultingInstanceType=result",
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
      };

      waitForLoadingToFinish();
    }
  };

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
          {layer.isDraft && (
            <div className="absolute bottom-5 -right-6 bg-red-500 text-white py-1 px-5 transform rotate-[-45deg] translate-x-[15%] translate-y-[30%] shadow-md z-50">
              Entwurf
            </div>
          )}
          {isLoading && !showWithoutThumbnail && (
            <div style={{ position: "absolute", left: "50%" }}>
              <Spin />
            </div>
          )}

          {showWithoutThumbnail || layer.id.includes("custom") ? (
            <div style={{ height: "100%", width: "100%" }}>
              <img
                src={extServiceBackgroundImage}
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
              <div className="absolute inset-0 flex items-start justify-center pt-[5%]">
                <span className="text-black/40 text-2xl font-bold">
                  {extServiceText}
                </span>
              </div>
            </div>
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

          {canFavoriteItem ? (
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
              target="_blank"
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
              {!layer.serviceName.includes("discover") && (
                <FontAwesomeIcon
                  onClick={() => setOpenDeleteModal(true)}
                  icon={faTrash}
                  className="absolute left-1 top-11 text-3xl cursor-pointer text-white drop-shadow-[0_1.2px_1.2px_rgba(0,0,0,1)] z-50"
                />
              )}
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
                  target="_blank"
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
                  {!layer.serviceName.includes("discover") && (
                    <button
                      className="w-36 bg-gray-100 hover:bg-gray-50 rounded-md py-2 flex text-center items-center px-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenDeleteModal(true);
                      }}
                    >
                      <FontAwesomeIcon
                        icon={faTrash}
                        className="text-lg mr-2"
                      />{" "}
                      Löschen
                    </button>
                  )}
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
              style={{ height: "3.4rem" }}
            >
              {title}
            </h3>
          </div>
          {canShowInfo && (
            <FontAwesomeIcon
              icon={selectedLayerId === layer.id ? faChevronUp : faChevronDown}
              className="text-xl pt-1 cursor-pointer text-gray-700 z-50"
            />
          )}
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
                loading={loading}
                onClick={() => {
                  setOpenDeleteModal(false);
                  if (layer.serviceName.includes("discover")) {
                    deleteDiscoverItem();
                  } else {
                    setAdditionalLayers(layer, true);
                  }
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
          setTriggerRefetch={setTriggerRefetch}
          loadingData={loadingData}
        />
      )}
    </>
  );
};

export default LayerItem;
