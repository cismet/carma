import { memo, useMemo, useState } from "react";
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
import { Button, message, Spin } from "antd";

import type { Item } from "../lib/contracts/carma-layers.d";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";
import { DeleteConfirmationModal } from "@carma-commons/ui/components";
import { extractCarmaConfig, resolveLayerTitle } from "@carma-commons/utils";
import {
  extServiceText,
  extServiceBackgroundImage,
} from "@carma-collab/wuppertal/geoportal";
import { useAuth } from "@carma-providers/auth";

import InfoCard from "./InfoCard";
import ImageCollage from "./ImageCollage";
import ThumbnailDisplay from "./ThumbnailDisplay";
import {
  useCatalogSelectionActions,
  useDiscoverRefetch,
} from "../context/LayerCatalogProvider";
import { useCatalogInteraction } from "../context/CatalogInteractionContext";
import { useLayerCatalogConfig } from "../config/LayerCatalogConfigContext";
import { deleteDiscoverItem } from "../helper/discover";
import {
  isExternalUrl,
  navigateToInternalHashLink,
} from "../helper/layerHelper";

// Kept as local literals to avoid a circular dependency on
// @carma-appframeworks/portals (which already depends on this lib).
const MAP_MODE_2D = "2d";
const MAP_MODE_3D = "3d";

interface ItemCardProps {
  layer: Item;
  /** whether this card's info card is open below it */
  isSelected: boolean;
}

const ItemCard = memo(({ layer, isSelected }: ItemCardProps) => {
  const {
    setAdditionalLayers,
    activeLayers,
    favorites,
    addFavorite,
    removeFavorite,
    setPreview,
  } = useCatalogInteraction();
  const { selectItem } = useCatalogSelectionActions();
  const { requestDiscoverRefetch } = useDiscoverRefetch();
  const { isCesium, requestTransitionToCesium, requestTransitionToLeaflet } =
    useMapFrameworkSwitcherContext();
  const [messageApi, contextHolder] = message.useMessage();
  const { discoverProps } = useLayerCatalogConfig();
  const [hovered, setHovered] = useState(false);
  const [openDeleteModal, setOpenDeleteModal] = useState(false);
  // link items without thumbnail render a static placeholder, nothing loads
  const [isLoading, setIsLoading] = useState(
    layer.type !== "collection" && !(layer.type === "link" && !layer.thumbnail)
  );

  const { jwt } = useAuth();

  const isFavorite = favorites.some(
    (favorite) =>
      favorite.id === `fav_${layer.id}` || favorite.id === layer.id
  );
  const isActiveLayer = activeLayers.some(
    (activeLayer) =>
      activeLayer.id ===
      (layer.id.startsWith("fav_") ? layer.id.slice(4) : layer.id)
  );
  const canShowInfo =
    layer.type === "layer" ||
    layer.type === "object" ||
    (layer.type === "link" && layer.description) ||
    (layer.type === "collection" && layer.description);
  const canFavoriteItem =
    layer.type !== "collection" ||
    (layer.type === "collection" && layer.serviceName.includes("discover"));
  const carmaConf = useMemo(
    () => extractCarmaConfig(layer.keywords),
    [layer.keywords]
  );
  const title = resolveLayerTitle(layer);
  const isExternalLink = layer.type === "link" && isExternalUrl(layer.url);
  // internal links keep the current hash query (map position etc.)
  const handleInternalLinkClick = (
    e: React.MouseEvent<HTMLAnchorElement, MouseEvent>
  ) => {
    e.preventDefault();
    e.stopPropagation();
    if (layer.type === "link") {
      navigateToInternalHashLink(layer.url);
    }
  };

  const links = useMemo(() => {
    const result: { url: string; text: string }[] = [];
    if (layer.service?.url) {
      result.push({
        url:
          layer.service.url +
          "?service=WMS&request=GetCapabilities&version=1.1.1",
        text: "Inhaltsverzeichnis des Kartendienstes (WMS Capabilities)",
      });
    }
    if (carmaConf?.opendata) {
      result.push({
        url: carmaConf.opendata as string,
        text:
          layer.type === "link"
            ? "Beschreibung im Open-Data-Portal"
            : "Datenquelle im Open-Data-Portal Wuppertal",
      });
    }
    return result;
  }, [layer, carmaConf]);

  const layerMapMode = layer?.mapMode;
  const currentMapMode = isCesium ? MAP_MODE_3D : MAP_MODE_2D;
  const hasMapModeMismatch =
    layerMapMode !== undefined && layerMapMode !== currentMapMode;

  const handleLayerClick = (
    e: React.MouseEvent<HTMLElement, MouseEvent>,
    preview: boolean = false
  ) => {
    e.stopPropagation();
    // holding alt forces the WMS variant of a vector layer
    const forceWMS = e.altKey;
    const addLayer = () => {
      setAdditionalLayers(layer, false, forceWMS, preview);
    };

    if (!hasMapModeMismatch || isActiveLayer) {
      addLayer();
      return;
    }

    const targetIs3d = layerMapMode === MAP_MODE_3D;
    const targetModeLabel = targetIs3d ? "3D" : "2D";
    messageApi.open({
      type: "warning",
      duration: 6,
      content: (
        <span>
          Dieses Objekt ist nur in der {targetModeLabel}-Ansicht verfügbar.{" "}
          <Button
            type="link"
            size="small"
            className="!px-0"
            onClick={async () => {
              messageApi.destroy();
              if (targetIs3d) {
                await requestTransitionToCesium();
              } else {
                await requestTransitionToLeaflet();
              }
              addLayer();
            }}
          >
            zur {targetModeLabel}-Ansicht wechseln und hinzufügen
          </Button>
        </span>
      ),
    });
  };

  const handleDeleteDiscoverItem = async () => {
    if (!discoverProps) {
      return;
    }
    const deleted = await deleteDiscoverItem({
      discoverProps,
      jwt: jwt || undefined,
      id: layer.id,
    });
    if (deleted) {
      requestDiscoverRefetch();
    }
  };

  return (
    <>
      <div
        className={`flex flex-col cursor-pointer rounded-lg w-full shadow-sm h-fit hover:!shadow-lg ${
          isSelected ? "bg-blue-50" : "bg-white"
        }`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => {
          if (canShowInfo) {
            selectItem(isSelected ? null : layer);
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
          {isLoading && (
            <div style={{ position: "absolute", left: "50%" }}>
              <Spin />
            </div>
          )}

          {layer.id.includes("custom") && !layer.thumbnail ? (
            <div style={{ height: "100%", width: "100%" }}>
              <ThumbnailDisplay
                url={extServiceBackgroundImage}
                hovered={hovered}
                onLoad={() => {
                  setIsLoading(false);
                }}
                loading="lazy"
              />
              <div className="absolute inset-0 flex items-start justify-center pt-[5%]">
                <span className="text-black/40 text-2xl font-bold">
                  {extServiceText}
                </span>
              </div>
            </div>
          ) : layer.type === "link" && !layer.thumbnail ? (
            <div className="h-full w-full bg-gradient-to-br from-gray-100 to-gray-300 flex items-center justify-center">
              <FontAwesomeIcon
                icon={faSquareUpRight}
                className="text-5xl text-gray-400"
              />
            </div>
          ) : layer.type !== "collection" || layer.thumbnail ? (
            <ThumbnailDisplay
              url={layer.thumbnail}
              updateUrl
              hovered={hovered}
              onLoad={() => {
                setIsLoading(false);
              }}
              loading="lazy"
            />
          ) : layer.type === "collection" ? (
            <ImageCollage layer={layer} />
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
                  removeFavorite(layer);
                }}
                data-test-id="remove-layer-favorite"
              />
            ) : (
              <FontAwesomeIcon
                className="absolute right-1 top-1 text-3xl cursor-pointer z-50 text-white drop-shadow-[0_1.2px_1.2px_rgba(0,0,0,1)]"
                icon={regularFaStar}
                onClick={(e) => {
                  e.stopPropagation();
                  addFavorite(layer);
                }}
                data-test-id="add-layer-favorite"
              />
            )
          ) : null}
          {layer.type === "link" ? (
            <a
              className="absolute left-1 top-1 text-3xl cursor-pointer z-50 text-white drop-shadow-[0_1.2px_1.2px_rgba(0,0,0,1)]"
              href={layer.url}
              target={isExternalLink ? "_blank" : undefined}
              onClick={isExternalLink ? undefined : handleInternalLinkClick}
            >
              <FontAwesomeIcon
                icon={isExternalLink ? faExternalLinkAlt : faSquareUpRight}
              />
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
                  target={isExternalLink ? "_blank" : undefined}
                  onClick={isExternalLink ? undefined : handleInternalLinkClick}
                >
                  <>
                    <FontAwesomeIcon
                      icon={isExternalLink ? faExternalLinkAlt : faSquareUpRight}
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
              icon={isSelected ? faChevronUp : faChevronDown}
              className="text-xl pt-1 cursor-pointer text-gray-700 z-50"
            />
          )}
        </div>
        <DeleteConfirmationModal
          show={openDeleteModal}
          title={
            layer.type === "collection"
              ? `Zusammenstellung ${title} wirklich löschen?`
              : `${title} wirklich löschen?`
          }
          dialogTestId="confirm-delete-collection-dialog"
          confirmTestId="confirm-delete-collection-submit"
          onCancel={() => setOpenDeleteModal(false)}
          onConfirm={() => {
            setOpenDeleteModal(false);
            if (layer.serviceName.includes("discover")) {
              handleDeleteDiscoverItem();
            } else {
              setAdditionalLayers(layer, true);
            }
          }}
        >
          Diese Aktion kann nicht rückgängig gemacht werden.
        </DeleteConfirmationModal>
      </div>
      {contextHolder}
      {isSelected && (
        <InfoCard
          isFavorite={isFavorite}
          isActiveLayer={isActiveLayer}
          onAddClick={handleLayerClick}
          onFavoriteClick={() => {
            if (isFavorite) {
              removeFavorite(layer);
            } else {
              addFavorite(layer);
            }
          }}
          links={links}
          onDeleteCollection={() => {
            setOpenDeleteModal(true);
          }}
        />
      )}
    </>
  );
});
ItemCard.displayName = "ItemCard";

export default ItemCard;
