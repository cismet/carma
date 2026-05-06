/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
import {
  faChevronDown,
  faChevronLeft,
  faChevronRight,
  faChevronUp,
  faMagnifyingGlass,
  faPalette,
  faStar,
} from "@fortawesome/free-solid-svg-icons";
import { faStar as regularFaStar } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { forwardRef, useContext, useEffect, useRef, useState } from "react";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import { useDispatch, useSelector } from "react-redux";
import centroid from "@turf/centroid";
import L from "leaflet";

import {
  ADHOC_UNSELECTED_RENDER_STYLES,
  DEFAULT_ADHOC_FEATURE_LAYER_ID,
  SELECTED_LAYER_INDEX,
  resolveAdhocUnselectedRenderStyle,
  resolveAdhocUnselectedRenderTintColor,
  resolveAdhocUnselectedRenderTintMix,
  resolveAdhocSelectionTargetByCollectionId,
  useAdhocFeatureDisplay,
  type AdhocUnselectedRenderStyle,
  type AdhocUnselectedRenderStyleMetadata,
} from "@carma-appframeworks/portals";
import { cn } from "@carma-commons/utils";

import {
  getBackgroundLayer,
  getLayers,
  getSelectedLayerIndex,
  setClickFromInfoView,
  setNextSelectedLayerIndex,
  setPreviousSelectedLayerIndex,
  setSelectedLayerIndex,
  setSelectedLayerIndexNoSelection,
} from "../../store/slices/mapping";
import {
  getUIShowInfo,
  getUIShowInfoText,
  setUIShowInfo,
  setUIShowInfoText,
} from "../../store/slices/ui";
import {
  addFavorite,
  getFavorites,
  removeFavorite,
} from "../../store/slices/layers";
import type { Item } from "@carma-mapping/layers";
import AerialLayerSelection from "./AerialLayerSelection";
import BaseLayerInfo from "./BaseLayerInfo";
import BaseLayerSelection from "./BaseLayerSelection";
import LayerInfo from "./LayerInfo";
import OpacitySlider from "./OpacitySlider";
import VisibilityToggle from "./VisibilityToggle";
import {
  LayerIcon,
  useMapFrameworkSwitcherContext,
} from "@carma-mapping/components";
import { resolveAdhocStyleData } from "../../helper/adhoc-feature-utils";
import { zoomToStyleFeatures } from "../../helper/gisHelper";
import { setTriggerSelectionById } from "../../store/slices/features";
import { addAdhocFeatureFromLayer } from "../../helper/adhoc-layer-feature";

type Ref = HTMLDivElement;

interface SecondaryViewProps {}

const ADHOC_UNSELECTED_RENDER_STYLE_LABELS: Record<
  AdhocUnselectedRenderStyle,
  string
> = {
  default: "Original",
  tint: "Getönt",
};

const ADHOC_RENDER_TINT_SWATCHES = [
  { color: "#facc15", label: "Gelb" },
  { color: "#38bdf8", label: "Blau" },
  { color: "#22c55e", label: "Grün" },
  { color: "#f97316", label: "Orange" },
  { color: "#a855f7", label: "Violett" },
] as const;

const TRANSPARENT_SWATCH_BACKGROUND =
  "repeating-conic-gradient(#e5e7eb 0% 25%, #ffffff 0% 50%) 50% / 8px 8px";

const SecondaryView = forwardRef<Ref, SecondaryViewProps>(({}, _ref) => {
  void _ref;
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);
  const infoRef = useRef<HTMLDivElement>(null);
  const [showAdhocRenderStyleMenu, setShowAdhocRenderStyleMenu] =
    useState(false);
  const dispatch = useDispatch();
  const showInfo = useSelector(getUIShowInfo);
  const showInfoText = useSelector(getUIShowInfoText);
  const selectedLayerIndex = useSelector(getSelectedLayerIndex);
  const layers = useSelector(getLayers);
  const backgroundLayer = useSelector(getBackgroundLayer);
  const favorites = useSelector(getFavorites);
  const layer =
    selectedLayerIndex >= 0 ? layers[selectedLayerIndex] : backgroundLayer;
  const vectorLegend =
    (layer?.layerInfo?.vectorLegend as string) || layer?.other?.vectorLegend;
  const legend =
    vectorLegend && layer.layerType === "vector"
      ? [{ OnlineResource: vectorLegend }]
      : layer.props?.legend || [];

  const icon = layer.title.includes("Orthofoto")
    ? "ortho"
    : layer.title === "Bäume"
    ? "bäume"
    : layer.title.includes("gärten")
    ? "gärten"
    : undefined;
  const isBaseLayer = selectedLayerIndex === -1;

  const canFavorite =
    !isBaseLayer && (layer.type === "layer" || layer.type === "object");
  const isFavorite =
    canFavorite &&
    favorites.some(
      (favorite) =>
        favorite.id === `fav_${layer.id}` || favorite.id === layer.id
    );

  const buildFavoriteItem = (): Item => {
    const other = layer.other ?? {};
    const layerInfo = layer.layerInfo ?? {};
    return {
      title: layer.title,
      description: layer.description ?? "",
      id: layer.id,
      serviceName: other.serviceName ?? "custom",
      type: layer.type,
      tags: other.tags ?? layerInfo.tags,
      thumbnail: other.thumbnail ?? layerInfo.thumbnail,
      keywords: other.keywords ?? layerInfo.keywords,
      icon: other.icon ?? layer.icon,
      alternativeIcon: other.alternativeIcon,
      service: other.service,
      name: other.name,
      path: other.path,
      originalPath: other.originalPath,
      vectorLegend: other.vectorLegend ?? (layerInfo.vectorLegend as string),
      vectorStyle:
        (layerInfo.vectorStyle as string) ?? (layer.props?.style as string),
      props: {
        Style: layer.props?.legend
          ? [{ LegendURL: layer.props.legend }]
          : undefined,
        MetadataURL: layer.props?.metaData,
      },
    } as Item;
  };

  const toggleFavorite = () => {
    const item = buildFavoriteItem();
    if (isFavorite) {
      dispatch(removeFavorite(item));
    } else {
      dispatch(addFavorite(item));
    }
  };

  const {
    featureCollections,
    addFeatureCollection,
    addFeature,
    setSelectedFeatureById,
    setShouldFocusSelected,
  } = useAdhocFeatureDisplay();
  const { isLeaflet, isCesium } = useMapFrameworkSwitcherContext();
  const isAdhocCesiumObjectLayer =
    isCesium && layer.type === "object" && !!layer.props?.style;
  const adhocFeatureCollection = featureCollections.find(
    (collection) => collection.id === layer.id
  );
  const unselectedRenderStyle = resolveAdhocUnselectedRenderStyle(
    adhocFeatureCollection?.metadata?.unselectedRenderStyle
  );
  const unselectedRenderTintColor = resolveAdhocUnselectedRenderTintColor(
    adhocFeatureCollection?.metadata?.unselectedRenderTintColor
  );
  const unselectedRenderTintMix = resolveAdhocUnselectedRenderTintMix(
    adhocFeatureCollection?.metadata?.unselectedRenderTintMix
  );

  const updateAdhocRenderMetadata = (
    metadata: AdhocUnselectedRenderStyleMetadata
  ) => {
    if (!isAdhocCesiumObjectLayer) {
      return;
    }
    addFeatureCollection({
      id: layer.id,
      title: layer.title,
      metadata,
    });
  };

  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowAdhocRenderStyleMenu(false);
        dispatch(setSelectedLayerIndexNoSelection());
      }
    };

    document.addEventListener("keydown", handleEscapeKey);
    return () => {
      document.removeEventListener("keydown", handleEscapeKey);
    };
  }, [dispatch]);

  useEffect(() => {
    setShowAdhocRenderStyleMenu(false);
  }, [isCesium, layer.id]);

  useEffect(() => {
    const findElementByIdRecursive = (element: Element, id: string) => {
      if (element.id === id) {
        return element;
      }

      for (let i = 0; i < element.children.length; i++) {
        const found = findElementByIdRecursive(element.children[i], id);
        if (found) {
          return found;
        }
      }

      return null;
    };

    const handleOutsideClick = (event: MouseEvent) => {
      let newLayerIndex = -2;
      let removedOtherLayer = false;
      let returnFunction = false;
      const layerButtons = document.querySelectorAll('[id^="layer-"]');
      const removeLayerButtons = document.querySelectorAll(
        '[id^="removeLayerButton-"]'
      );
      const openBaseLayerViewButtons = document.querySelectorAll(
        '[id^="openBaseLayerView"]'
      );
      const filterLayerButtons = document.querySelectorAll(
        '[id^="filterLayerButton-"]'
      );

      openBaseLayerViewButtons.forEach((layerButton) => {
        if (layerButton.contains(event.target as Node)) {
          returnFunction = true;
          return;
        }
      });

      filterLayerButtons.forEach((filterButton) => {
        if (filterButton.contains(event.target as Node)) {
          returnFunction = true;
          return;
        }
      });

      const foundElement = findElementByIdRecursive(
        event.target as Element,
        "openBaseLayerView"
      );

      if (foundElement) {
        returnFunction = true;
      }

      if (returnFunction) {
        return;
      }

      removeLayerButtons.forEach((layerButton) => {
        if (layerButton.contains(event.target as Node)) {
          removedOtherLayer = true;
        }
      });

      layerButtons.forEach((layerButton, i) => {
        if (layerButton.contains(event.target as Node)) {
          const layerId = layerButton.id.replace("layer-", "");
          const clickedLayer = layers.find((l) => l.id === layerId);
          if (clickedLayer?.skipSelection) {
            returnFunction = true;
            return;
          }
          newLayerIndex = i - 1;
        }
      });

      if (removedOtherLayer) {
        if (newLayerIndex === selectedLayerIndex) {
          dispatch(setSelectedLayerIndexNoSelection());
        }
        return;
      }
      if (infoRef.current && !infoRef.current.contains(event.target as Node)) {
        const currentLayerIndex = selectedLayerIndex;
        console.debug(
          "handleOutsideClick newLayerIndex",
          newLayerIndex,
          currentLayerIndex
        );
        newLayerIndex === currentLayerIndex
          ? dispatch(setSelectedLayerIndexNoSelection())
          : dispatch(setSelectedLayerIndex(newLayerIndex));
        if (newLayerIndex !== SELECTED_LAYER_INDEX.NO_SELECTION) {
          dispatch(setClickFromInfoView(true));
        }
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [dispatch, selectedLayerIndex]);

  const iconId = `secview-icon-${layer.id}`;

  return (
    <div className="pt-3 w-full pointer-events-none">
      <div className="flex items-center justify-center w-full">
        <div
          ref={infoRef}
          className={cn(
            "pointer-events-auto",
            "min-w-[280px] sm:max-w-[560px] md:max-w-[720px] lg:w-full w-full sm:w-3/4 sm:mx-0",
            "h-fit bg-white button-shadow rounded-[10px] flex flex-col relative secondary-view gap-2 py-2 transition-all duration-300",
            showInfo
              ? "sm:max-h-[600px] sm:h-[70vh] h-[80vh]"
              : isBaseLayer
              ? "h-fit"
              : "h-12"
          )}
          onMouseEnter={() => {
            routedMapRef?.leafletMap?.leafletElement.dragging.disable();
            routedMapRef?.leafletMap?.leafletElement.scrollWheelZoom.disable();
          }}
          onMouseLeave={() => {
            routedMapRef?.leafletMap?.leafletElement.dragging.enable();
            routedMapRef?.leafletMap?.leafletElement.scrollWheelZoom.enable();
          }}
        >
          <button
            className="text-base rounded-full flex items-center justify-center p-2 hover:text-neutral-600 absolute top-2 left-1"
            onClick={() =>
              dispatch(setPreviousSelectedLayerIndex({ isLeaflet }))
            }
          >
            <FontAwesomeIcon icon={faChevronLeft} />
          </button>
          <button
            className="text-base rounded-full flex items-center justify-center p-2 hover:text-neutral-600 absolute top-2 right-1"
            onClick={() => dispatch(setNextSelectedLayerIndex({ isLeaflet }))}
          >
            <FontAwesomeIcon icon={faChevronRight} />
          </button>
          <div className="flex items-center w-full h-8 gap-2 px-6 sm:px-0 sm:gap-6">
            <div className="w-1/4 flex items-center gap-2">
              <LayerIcon
                layer={layer}
                fallbackIcon={icon}
                isBaseLayer={isBaseLayer}
                id={iconId}
              />
              <label
                className="mb-0 text-base w-full truncate"
                htmlFor={iconId}
              >
                {isBaseLayer ? "Hintergrund" : layer.title}
              </label>
            </div>
            <div className="w-full flex items-center gap-2">
              <label
                className="mb-0 text-[15px] hidden sm:block"
                htmlFor="opacity-slider"
              >
                Transparenz:
              </label>
              <div className="w-2/3 pt-1">
                <OpacitySlider
                  isBackgroundLayer={isBaseLayer}
                  opacity={layer.opacity}
                  id={layer.id}
                  isVisible={layer.visible}
                  disabled={isCesium}
                />
              </div>
            </div>
            {layer.type === "object" && (
              <button
                className="hover:text-gray-500 text-gray-600 flex items-center justify-center"
                onClick={async (e) => {
                  e.stopPropagation();
                  if (isLeaflet) {
                    const styleData = await resolveAdhocStyleData(
                      layer.props.style
                    );

                    const leafletMap = routedMapRef?.leafletMap?.leafletElement;
                    if (styleData && leafletMap) {
                      let clickFeature: GeoJSON.Feature | undefined;
                      for (const sourceKey in styleData.sources) {
                        const source = styleData.sources[sourceKey] as any;
                        if (
                          source?.data?.type === "FeatureCollection" &&
                          source.data.features
                        ) {
                          clickFeature = source.data.features.find(
                            (f: GeoJSON.Feature) => f.geometry
                          );
                          if (clickFeature) break;
                        }
                      }

                      if (clickFeature?.geometry) {
                        const center = centroid(
                          clickFeature as GeoJSON.Feature<GeoJSON.Geometry>
                        );
                        const [lng, lat] = center.geometry.coordinates;
                        const latlngPoint = L.latLng(lat, lng);

                        const fireClick = () => {
                          leafletMap.fireEvent("click", {
                            latlng: latlngPoint,
                            layerPoint:
                              leafletMap.latLngToLayerPoint(latlngPoint),
                            containerPoint:
                              leafletMap.latLngToContainerPoint(latlngPoint),
                          });
                        };

                        let fired = false;
                        const onMoveEnd = () => {
                          if (fired) return;
                          fired = true;
                          leafletMap.off("moveend", onMoveEnd);
                          setTimeout(fireClick, 300);
                        };

                        leafletMap.on("moveend", onMoveEnd);
                        // Fallback: if fitBounds snaps without animation, moveend may already have fired
                        setTimeout(onMoveEnd, 500);
                      }

                      await zoomToStyleFeatures(styleData, routedMapRef);
                    } else {
                      await zoomToStyleFeatures(styleData, routedMapRef);
                      dispatch(setTriggerSelectionById(layer.id));
                    }
                  } else if (isCesium) {
                    let didSelectFeature = false;
                    const selectionTarget =
                      resolveAdhocSelectionTargetByCollectionId(
                        featureCollections,
                        layer.id
                      );

                    if (selectionTarget) {
                      setSelectedFeatureById(
                        selectionTarget.id,
                        selectionTarget.collectionId,
                        selectionTarget.layerId
                      );
                      didSelectFeature = true;
                    } else {
                      const addedFeature = await addAdhocFeatureFromLayer({
                        layer,
                        collectionId: layer.id,
                        layerId: DEFAULT_ADHOC_FEATURE_LAYER_ID,
                        addFeature,
                      });
                      if (addedFeature) {
                        setSelectedFeatureById(
                          addedFeature.id,
                          addedFeature.collectionId,
                          addedFeature.layerId
                        );
                        didSelectFeature = true;
                      }
                    }
                    if (didSelectFeature) {
                      setShouldFocusSelected(true);
                    }
                  }
                }}
              >
                <FontAwesomeIcon icon={faMagnifyingGlass} />
              </button>
            )}
            {isAdhocCesiumObjectLayer && (
              <div
                className="relative flex items-center justify-center"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  className={cn(
                    "hover:text-gray-500 flex items-center justify-center",
                    unselectedRenderStyle === "default"
                      ? "text-gray-600"
                      : "text-yellow-500"
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowAdhocRenderStyleMenu((current) => !current);
                  }}
                  title="Darstellung"
                  type="button"
                >
                  <FontAwesomeIcon icon={faPalette} />
                </button>
                {showAdhocRenderStyleMenu && (
                  <div
                    className="absolute right-0 top-7 z-[1000] flex w-52 flex-col gap-1 rounded border border-gray-200 bg-white p-2 text-sm shadow-lg"
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    {ADHOC_UNSELECTED_RENDER_STYLES.map((style) => (
                      <button
                        key={style}
                        className={cn(
                          "flex h-8 w-full items-center rounded px-2 text-left hover:bg-gray-100",
                          unselectedRenderStyle === style
                            ? "bg-gray-100 font-semibold"
                            : ""
                        )}
                        onClick={() =>
                          updateAdhocRenderMetadata({
                            unselectedRenderStyle: style,
                          })
                        }
                        type="button"
                      >
                        {ADHOC_UNSELECTED_RENDER_STYLE_LABELS[style]}
                      </button>
                    ))}
                    <div className="mt-1 grid grid-cols-5 gap-1 border-t border-gray-200 pt-2">
                      {ADHOC_RENDER_TINT_SWATCHES.map((swatch) => {
                        const isActive =
                          unselectedRenderStyle === "tint" &&
                          unselectedRenderTintColor.toLowerCase() ===
                            swatch.color;
                        return (
                          <button
                            key={`solid-${swatch.color}`}
                            aria-label={`${swatch.label} 100%`}
                            className={cn(
                              "h-8 w-8 rounded border border-gray-300",
                              isActive && unselectedRenderTintMix > 0.95
                                ? "ring-2 ring-gray-800 ring-offset-1"
                                : ""
                            )}
                            onClick={() =>
                              updateAdhocRenderMetadata({
                                unselectedRenderStyle: "tint",
                                unselectedRenderTintColor: swatch.color,
                                unselectedRenderTintMix: 1,
                              })
                            }
                            style={{ backgroundColor: swatch.color }}
                            title={`${swatch.label} 100%`}
                            type="button"
                          />
                        );
                      })}
                      {ADHOC_RENDER_TINT_SWATCHES.map((swatch) => {
                        const isActive =
                          unselectedRenderStyle === "tint" &&
                          unselectedRenderTintColor.toLowerCase() ===
                            swatch.color;
                        return (
                          <button
                            key={`mixed-${swatch.color}`}
                            aria-label={`${swatch.label} 50%`}
                            className={cn(
                              "relative h-8 w-8 overflow-hidden rounded border border-gray-300 bg-white",
                              isActive &&
                                Math.abs(unselectedRenderTintMix - 0.5) < 0.01
                                ? "ring-2 ring-gray-800 ring-offset-1"
                                : ""
                            )}
                            onClick={() =>
                              updateAdhocRenderMetadata({
                                unselectedRenderStyle: "tint",
                                unselectedRenderTintColor: swatch.color,
                                unselectedRenderTintMix: 0.5,
                              })
                            }
                            title={`${swatch.label} 50%`}
                            type="button"
                          >
                            <span
                              className="absolute inset-0"
                              style={{
                                background: TRANSPARENT_SWATCH_BACKGROUND,
                              }}
                            />
                            <span
                              className="absolute inset-0 opacity-50"
                              style={{ backgroundColor: swatch.color }}
                            />
                            <span
                              className="absolute bottom-0 right-0 h-0 w-0 border-b-[15px] border-l-[15px] border-l-transparent"
                              style={{ borderBottomColor: swatch.color }}
                            />
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <span>Mischung</span>
                        <span>
                          {Math.round(unselectedRenderTintMix * 100)}%
                        </span>
                      </div>
                      <input
                        className="w-full"
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={Math.round(unselectedRenderTintMix * 100)}
                        onChange={(event) => {
                          const mix = Number(event.target.value) / 100;
                          updateAdhocRenderMetadata({
                            unselectedRenderTintMix: mix,
                            ...(unselectedRenderStyle === "default" && mix > 0
                              ? { unselectedRenderStyle: "tint" }
                              : {}),
                          });
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
            {canFavorite && (
              <button
                className="hover:text-gray-500 text-gray-600 flex items-center justify-center"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFavorite();
                }}
                title={isFavorite ? "Favorit entfernen" : "Favorisieren"}
                data-test-id={
                  isFavorite
                    ? "remove-layer-favorite-secondary-view"
                    : "add-layer-favorite-secondary-view"
                }
              >
                <FontAwesomeIcon
                  icon={isFavorite ? faStar : regularFaStar}
                  className={isFavorite ? "text-yellow-400" : ""}
                />
              </button>
            )}
            <VisibilityToggle
              visible={layer.visible}
              id={layer.id}
              isBackgroundLayer={isBaseLayer}
              disabled={isCesium}
            />
            <button
              onClick={() => {
                dispatch(setUIShowInfo(!showInfo));
                setTimeout(
                  () => dispatch(setUIShowInfoText(!showInfoText)),
                  showInfoText || isBaseLayer ? 0 : 80
                );
              }}
              className="relative fa-stack"
            >
              {showInfo ? (
                <FontAwesomeIcon
                  className="text-base pr-[5px]"
                  icon={faChevronUp}
                />
              ) : (
                <FontAwesomeIcon
                  className="text-base pr-[5px]"
                  icon={faChevronDown}
                />
              )}
            </button>
          </div>

          {isBaseLayer && (
            <div className="flex flex-col gap-2 pb-4">
              <div className="w-full flex last:rounded-s-md first:rounded-s-md">
                <BaseLayerSelection />
                <AerialLayerSelection />
              </div>
            </div>
          )}

          {showInfoText &&
            (isBaseLayer ? (
              <BaseLayerInfo />
            ) : (
              <LayerInfo
                description={layer.description}
                legend={legend}
                zoomLevels={{
                  maxZoom: layer.props.maxZoom,
                  minZoom: layer.props.minZoom,
                }}
              />
            ))}
        </div>
      </div>
    </div>
  );
});

export default SecondaryView;
