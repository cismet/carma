/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
import {
  faChevronDown,
  faChevronLeft,
  faChevronRight,
  faChevronUp,
  faCrosshairs,
  faMagnifyingGlass,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { forwardRef, useContext, useEffect, useRef, useState } from "react";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import { useDispatch, useSelector } from "react-redux";
import type {
  CarmaMapLibreFeatureProperties,
  CarmaMapLibreStyleData,
} from "@carma/types";
import type { GeoJSONSourceSpecification } from "maplibre-gl";

import {
  type AdhocFeature,
  DEFAULT_ADHOC_FEATURE_LAYER_ID,
  SELECTED_LAYER_INDEX,
  resolveAdhocSelectionTargetByCollectionId,
  useAdhocFeatureDisplay,
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
import { AdhocModelAnchorEditorModal } from "../feature-info/AdhocModelAnchorEditorModal";

type Ref = HTMLDivElement;

interface SecondaryViewProps {}

const isGeoJsonSource = (
  source: unknown
): source is GeoJSONSourceSpecification =>
  typeof source === "object" &&
  source !== null &&
  (source as { type?: unknown }).type === "geojson";

const toggleFeatureClipping = (
  feature: AdhocFeature,
  enabled: boolean
): AdhocFeature => {
  if (feature.kind !== "maplibre-style") {
    return feature;
  }

  const baseProperties =
    (feature.properties as CarmaMapLibreFeatureProperties | undefined) ?? {};
  const topLevelCarmaConf3D = baseProperties.carmaConf3D;
  const topLevelClipping = topLevelCarmaConf3D?.clippingPolygon;
  const nextProperties = topLevelClipping
    ? {
        ...baseProperties,
        carmaConf3D: {
          ...topLevelCarmaConf3D,
          clippingPolygon: {
            ...topLevelClipping,
            enabled,
          },
        },
      }
    : baseProperties;

  const styleData = feature.data as CarmaMapLibreStyleData;
  const nextSources = Object.fromEntries(
    Object.entries(styleData.sources ?? {}).map(([sourceId, source]) => {
      if (!isGeoJsonSource(source) || !source.data) {
        return [sourceId, source];
      }
      const geojson = source.data as
        | { type: "Feature"; properties?: Record<string, unknown> }
        | {
            type: "FeatureCollection";
            features: Array<{ properties?: Record<string, unknown> }>;
          };
      if (geojson.type === "FeatureCollection" && geojson.features.length > 0) {
        const first = geojson.features[0];
        const firstProps = (first.properties ??
          {}) as CarmaMapLibreFeatureProperties;
        const firstClipping = firstProps.carmaConf3D?.clippingPolygon;
        if (!firstClipping) {
          return [sourceId, source];
        }
        return [
          sourceId,
          {
            ...source,
            data: {
              ...geojson,
              features: [
                {
                  ...first,
                  properties: {
                    ...firstProps,
                    carmaConf3D: {
                      ...firstProps.carmaConf3D,
                      clippingPolygon: {
                        ...firstClipping,
                        enabled,
                      },
                    },
                  },
                },
                ...geojson.features.slice(1),
              ],
            },
          },
        ];
      }
      if (geojson.type === "Feature") {
        const firstProps = (geojson.properties ??
          {}) as CarmaMapLibreFeatureProperties;
        const firstClipping = firstProps.carmaConf3D?.clippingPolygon;
        if (!firstClipping) {
          return [sourceId, source];
        }
        return [
          sourceId,
          {
            ...source,
            data: {
              ...geojson,
              properties: {
                ...firstProps,
                carmaConf3D: {
                  ...firstProps.carmaConf3D,
                  clippingPolygon: {
                    ...firstClipping,
                    enabled,
                  },
                },
              },
            },
          },
        ];
      }
      return [sourceId, source];
    })
  );

  return {
    ...feature,
    properties: nextProperties as AdhocFeature["properties"],
    data: {
      ...styleData,
      sources: nextSources as CarmaMapLibreStyleData["sources"],
    },
  };
};

const SecondaryView = forwardRef<Ref, SecondaryViewProps>(({}, _ref) => {
  void _ref;
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);
  const infoRef = useRef<HTMLDivElement>(null);
  const dispatch = useDispatch();
  const showInfo = useSelector(getUIShowInfo);
  const showInfoText = useSelector(getUIShowInfoText);
  const selectedLayerIndex = useSelector(getSelectedLayerIndex);
  const layers = useSelector(getLayers);
  const backgroundLayer = useSelector(getBackgroundLayer);
  const layer =
    selectedLayerIndex >= 0 ? layers[selectedLayerIndex] : backgroundLayer;
  const legend =
    layer?.other?.vectorLegend && layer.layerType === "vector"
      ? [{ OnlineResource: layer.other.vectorLegend }]
      : layer.props?.legend || [];

  const icon = layer.title.includes("Orthofoto")
    ? "ortho"
    : layer.title === "Bäume"
    ? "bäume"
    : layer.title.includes("gärten")
    ? "gärten"
    : undefined;
  const isBaseLayer = selectedLayerIndex === -1;

  const {
    featureCollections,
    addFeature,
    setSelectedFeatureById,
    setShouldFocusSelected,
    updateFeatureMetadata,
  } = useAdhocFeatureDisplay();
  const { isLeaflet, isCesium } = useMapFrameworkSwitcherContext();
  const [isAnchorEditorOpen, setIsAnchorEditorOpen] = useState(false);
  const [anchorEditorTarget, setAnchorEditorTarget] = useState<{
    id: string;
    collectionId: string;
    layerId: string;
  } | null>(null);

  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        dispatch(setSelectedLayerIndexNoSelection());
      }
    };

    document.addEventListener("keydown", handleEscapeKey);
    return () => {
      document.removeEventListener("keydown", handleEscapeKey);
    };
  }, [dispatch]);

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
      const targetElement = event.target as HTMLElement | null;
      if (targetElement?.closest('[data-anchor-editor-modal="true"]')) {
        return;
      }

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

      openBaseLayerViewButtons.forEach((layerButton) => {
        if (layerButton.contains(event.target as Node)) {
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
  const hasAdhocModelInCollection = featureCollections.some(
    (collection) =>
      collection.id === layer.id &&
      collection.features.some((feature) => {
        const props = feature.properties as
          | {
              carmaConf3D?: { model?: unknown };
            }
          | undefined;
        return Boolean(props?.carmaConf3D?.model);
      })
  );
  const isCesiumObjectLayer = isCesium && layer.type === "object";
  const clippingStateInCollection = (() => {
    const selectionTarget = resolveAdhocSelectionTargetByCollectionId(
      featureCollections,
      layer.id
    );
    if (!selectionTarget) return null;
    const collection = featureCollections.find(
      (candidate) => candidate.id === selectionTarget.collectionId
    );
    const feature = collection?.features.find(
      (candidate) =>
        candidate.id === selectionTarget.id &&
        (candidate.layerId ?? DEFAULT_ADHOC_FEATURE_LAYER_ID) ===
          selectionTarget.layerId
    );
    if (!feature) return null;
    const props = feature.properties as
      | CarmaMapLibreFeatureProperties
      | undefined;
    const clipping = props?.carmaConf3D?.clippingPolygon;
    if (!clipping) return null;
    return clipping.enabled !== false;
  })();

  useEffect(() => {
    if (layer.type !== "object") {
      setIsAnchorEditorOpen(false);
      setAnchorEditorTarget(null);
    }
  }, [layer.type]);

  return (
    <div
      onClick={(event) => {
        const targetElement = event.target as HTMLElement | null;
        if (targetElement?.closest('[data-anchor-editor-modal="true"]')) {
          return;
        }
        dispatch(setSelectedLayerIndexNoSelection());
      }}
      className="pt-4 w-full"
    >
      <div className="flex items-center justify-center w-full">
        <div
          ref={infoRef}
          onClick={(e) => {
            e.stopPropagation();
          }}
          className={cn(
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
            onClick={() => dispatch(setPreviousSelectedLayerIndex())}
          >
            <FontAwesomeIcon icon={faChevronLeft} />
          </button>
          <button
            className="text-base rounded-full flex items-center justify-center p-2 hover:text-neutral-600 absolute top-2 right-1"
            onClick={() => dispatch(setNextSelectedLayerIndex())}
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
                  disabled={isCesium && layer.type !== "object"}
                  onOpacityChange={(value) => {
                    if (!isCesiumObjectLayer) return;
                    const selectionTarget =
                      resolveAdhocSelectionTargetByCollectionId(
                        featureCollections,
                        layer.id
                      );
                    if (!selectionTarget) return;
                    updateFeatureMetadata({
                      id: selectionTarget.id,
                      collectionId: selectionTarget.collectionId,
                      layerId: selectionTarget.layerId,
                      metadata: {
                        modelOpacity: value,
                      },
                    });
                  }}
                />
              </div>
            </div>
            {layer.type === "object" && (
              <button
                className={cn(
                  "hover:text-gray-500 text-gray-600 flex items-center justify-center",
                  !hasAdhocModelInCollection && "opacity-40"
                )}
                title="Modell-Anker bearbeiten"
                onClick={async (e) => {
                  e.stopPropagation();

                  if (isAnchorEditorOpen) {
                    setIsAnchorEditorOpen(false);
                    return;
                  }

                  const selectionTarget =
                    resolveAdhocSelectionTargetByCollectionId(
                      featureCollections,
                      layer.id
                    );
                  let selectedId = selectionTarget?.id ?? null;
                  let selectedCollectionId =
                    selectionTarget?.collectionId ?? null;
                  let selectedLayerId = selectionTarget?.layerId ?? null;

                  if (!selectionTarget) {
                    const addedFeature = await addAdhocFeatureFromLayer({
                      layer,
                      collectionId: layer.id,
                      layerId: DEFAULT_ADHOC_FEATURE_LAYER_ID,
                      addFeature,
                    });
                    if (addedFeature) {
                      selectedId = addedFeature.id;
                      selectedCollectionId = addedFeature.collectionId;
                      selectedLayerId = addedFeature.layerId;
                    }
                  }

                  if (selectedId && selectedCollectionId && selectedLayerId) {
                    setAnchorEditorTarget({
                      id: selectedId,
                      collectionId: selectedCollectionId,
                      layerId: selectedLayerId,
                    });
                    setIsAnchorEditorOpen(true);
                  }
                }}
              >
                <FontAwesomeIcon icon={faCrosshairs} />
              </button>
            )}
            {layer.type === "object" && (
              <button
                className={cn(
                  "hover:text-gray-500 text-gray-600 flex items-center justify-center text-xs px-1",
                  clippingStateInCollection === null && "opacity-40"
                )}
                title="Clipping ein/aus"
                onClick={async (e) => {
                  e.stopPropagation();
                  const selectionTarget =
                    resolveAdhocSelectionTargetByCollectionId(
                      featureCollections,
                      layer.id
                    );
                  if (!selectionTarget) {
                    return;
                  }
                  const collection = featureCollections.find(
                    (candidate) => candidate.id === selectionTarget.collectionId
                  );
                  const currentFeature = collection?.features.find(
                    (candidate) =>
                      candidate.id === selectionTarget.id &&
                      (candidate.layerId ?? DEFAULT_ADHOC_FEATURE_LAYER_ID) ===
                        selectionTarget.layerId
                  );
                  if (!currentFeature) {
                    return;
                  }
                  const props = currentFeature.properties as
                    | CarmaMapLibreFeatureProperties
                    | undefined;
                  const clipping = props?.carmaConf3D?.clippingPolygon;
                  if (!clipping) {
                    return;
                  }
                  const nextEnabled = clipping.enabled === false;
                  const updatedFeature = toggleFeatureClipping(
                    currentFeature,
                    nextEnabled
                  );
                  addFeature(updatedFeature, {
                    collectionId: selectionTarget.collectionId,
                    layerId: selectionTarget.layerId,
                  });
                }}
              >
                Clip
              </button>
            )}
            {layer.type === "object" && (
              <button
                className="hover:text-gray-500 text-gray-600 flex items-center justify-center"
                onClick={async (e) => {
                  e.stopPropagation();
                  if (isLeaflet) {
                    const styleData = await resolveAdhocStyleData(
                      layer.props.style
                    );
                    await zoomToStyleFeatures(styleData, routedMapRef);
                    dispatch(setTriggerSelectionById(layer.id));
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
            <VisibilityToggle
              visible={layer.visible}
              id={layer.id}
              isBackgroundLayer={isBaseLayer}
              disabled={isCesium && layer.type !== "object"}
              onToggleVisible={(visible) => {
                if (!isCesiumObjectLayer) return;
                const selectionTarget =
                  resolveAdhocSelectionTargetByCollectionId(
                    featureCollections,
                    layer.id
                  );
                if (!selectionTarget) return;
                updateFeatureMetadata({
                  id: selectionTarget.id,
                  collectionId: selectionTarget.collectionId,
                  layerId: selectionTarget.layerId,
                  metadata: {
                    modelVisible: visible,
                  },
                });
              }}
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
      <AdhocModelAnchorEditorModal
        isOpen={isAnchorEditorOpen}
        target={anchorEditorTarget}
      />
    </div>
  );
});

export default SecondaryView;
