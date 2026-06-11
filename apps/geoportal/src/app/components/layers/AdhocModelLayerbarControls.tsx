import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useDispatch, useSelector } from "react-redux";

import centroid from "@turf/centroid";
import {
  faCropSimple,
  faPalette,
  faX,
} from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import L from "leaflet";
import { Radio, Slider, Tooltip, type SliderSingleProps } from "antd";
import Icon from "react-cismap/commons/Icon";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

import type { BackgroundLayer, Layer } from "@carma-mapping/layers";
import {
  DevelopmentOnlyPatternBackground,
  type DevelopmentOnlyPatternStyleOptions,
} from "@carma-commons/ui/components";
import {
  DEFAULT_ADHOC_FEATURE_LAYER_ID,
  ADHOC_UNSELECTED_RENDER_STYLES,
  DEFAULT_ADHOC_UNSELECTED_RENDER_TINT_MIX,
  MIN_ADHOC_UNSELECTED_RENDER_TINT_MIX,
  resolveAdhocSelectionTargetByCollectionId,
  resolveAdhocUnselectedRenderStyle,
  resolveAdhocUnselectedRenderTintColor,
  resolveAdhocUnselectedRenderTintMix,
  useDevelopmentUiEnabled,
  useAdhocFeatureDisplay,
  type AdhocFeature,
  type AdhocUnselectedRenderStyle,
  type AdhocUnselectedRenderStyleMetadata,
} from "@carma-appframeworks/portals";

import { geoportalAnnotationModeText } from "../../config/geoportalTextConfig";
import { cn } from "@carma-commons/utils";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";

import {
  getActiveInteractionButtonID,
  getActiveInteractionLayerID,
  setActiveInteractionButtonID,
  setActiveInteractionLayerID,
} from "../../store/slices/mapping";
import { setTriggerSelectionById } from "../../store/slices/features";
import { addAdhocFeatureFromLayer } from "../../helper/adhoc-layer-feature";
import { resolveAdhocStyleData } from "../../helper/adhoc-feature-utils";
import {
  EMPTY_ADHOC_MODEL_POSITION_INPUTS,
  formatAdhocModelPositionInputs,
  getAdhocFeatureClippingEnabled,
  getAdhocFeatureModelPosition,
  parseFiniteNumber,
  toggleFeatureClipping,
  updateMapLibreStyleFeatureModelPosition,
  type AdhocModelPositionField,
  type AdhocModelPositionInputs,
} from "../../helper/adhoc-model-style-utils";
import { zoomToStyleFeatures } from "../../helper/gisHelper";
import { CESIUM_CONFIG } from "../../config/app.config";
import {
  ColorSwatchGroup,
  type ColorSwatchGroupOption,
} from "./ColorSwatchGroup";
import { getGeoportalLayerToolActionButtonClassName } from "./layer-tool-action-button-style";

export const ADHOC_RENDER_STYLE_INTERACTION_ID = "adhoc-render-style";
export const ADHOC_MODEL_CONTROL_INTERACTION_ID = "adhoc-model-controls";

type AdhocCesiumObjectControlTarget = AdhocFeature & {
  collectionId: string;
  layerId: string;
};

type AdhocRenderStyleDraft = {
  targetKey: string;
  metadata: AdhocUnselectedRenderStyleMetadata;
};

const ADHOC_LAYERBAR_LONG_PRESS_DURATION_MS = 320;

const ADHOC_MODEL_HIGHLIGHT_STYLE = CESIUM_CONFIG.model?.highlight?.style;
const DEFAULT_ADHOC_MODEL_HIGHLIGHT_TINT_COLOR =
  resolveAdhocUnselectedRenderTintColor(
    ADHOC_MODEL_HIGHLIGHT_STYLE?.fill?.color
  );
const DEFAULT_ADHOC_MODEL_HIGHLIGHT_TINT_MIX = ADHOC_MODEL_HIGHLIGHT_STYLE?.fill
  ?.color
  ? 1
  : DEFAULT_ADHOC_UNSELECTED_RENDER_TINT_MIX;

const ADHOC_RENDER_TINT_SWATCH_DEFINITIONS = [
  {
    color: "#facc15",
    key: "yellow",
  },
  {
    color: "#38bdf8",
    key: "blue",
  },
  {
    color: "#22c55e",
    key: "green",
  },
  {
    color: "#f97316",
    key: "orange",
  },
] as const;

const ADHOC_MODEL_POSITION_FIELD_DEFINITIONS: readonly {
  key: AdhocModelPositionField;
  min?: number;
  max?: number;
  step: string;
}[] = [
  {
    key: "lon",
    step: "0.000001",
  },
  {
    key: "lat",
    step: "0.000001",
  },
  {
    key: "height",
    step: "0.1",
  },
  {
    key: "heading",
    min: 0,
    max: 360,
    step: "0.01",
  },
];

const ADHOC_DEVELOPMENT_ONLY_PATTERN_OPTIONS = {
  repeatXPx: 384,
  stripeWidthPx: 16,
  tileHeightPx: 160,
  tileWidthPx: 1024,
} satisfies DevelopmentOnlyPatternStyleOptions;

const adhocRenderTintMixFormatter: NonNullable<
  SliderSingleProps["tooltip"]
>["formatter"] = (value) => `${Math.round((value ?? 0) * 100)}%`;

const isAdhocCesiumObjectLayer = (
  layer: Layer | BackgroundLayer,
  isCesium: boolean
) => isCesium && layer.type === "object" && !!layer.props?.style;

const getAdhocTargetKey = (
  target: AdhocCesiumObjectControlTarget | null | undefined
) => (target ? `${target.collectionId}:${target.layerId}:${target.id}` : null);

const useAdhocModelLayerbarControls = (layer: Layer | BackgroundLayer) => {
  const { isCesium } = useMapFrameworkSwitcherContext();
  const {
    featureCollections,
    selectedFeature,
    addFeature,
    updateFeatureMetadata,
    flashSelectedFeatureById,
  } = useAdhocFeatureDisplay();
  const [adhocRenderStyleDraft, setAdhocRenderStyleDraft] =
    useState<AdhocRenderStyleDraft | null>(null);
  const [
    adhocModelPositionInputTargetKey,
    setAdhocModelPositionInputTargetKey,
  ] = useState<string | null>(null);
  const [adhocModelPositionInputs, setAdhocModelPositionInputs] =
    useState<AdhocModelPositionInputs>(EMPTY_ADHOC_MODEL_POSITION_INPUTS);
  const [activeAdhocModelPositionField, setActiveAdhocModelPositionField] =
    useState<AdhocModelPositionField | null>(null);

  const isAdhocLayer = isAdhocCesiumObjectLayer(layer, isCesium);
  const adhocRenderStyleTarget = resolveAdhocSelectionTargetByCollectionId(
    featureCollections,
    layer.id,
    DEFAULT_ADHOC_FEATURE_LAYER_ID
  ) as AdhocCesiumObjectControlTarget | undefined;
  const adhocRenderStyleTargetKey = getAdhocTargetKey(adhocRenderStyleTarget);
  const isSelectedAdhocTarget = (
    target: AdhocCesiumObjectControlTarget | null | undefined
  ) =>
    !!target &&
    selectedFeature?.id === target.id &&
    selectedFeature.collectionId === target.collectionId &&
    selectedFeature.layerId === target.layerId;
  const adhocRenderStyleMetadata =
    adhocRenderStyleDraft?.targetKey === adhocRenderStyleTargetKey
      ? {
          ...(adhocRenderStyleTarget?.metadata ?? {}),
          ...adhocRenderStyleDraft.metadata,
        }
      : adhocRenderStyleTarget?.metadata;
  const unselectedRenderStyle = resolveAdhocUnselectedRenderStyle(
    adhocRenderStyleMetadata?.unselectedRenderStyle
  );
  const unselectedRenderTintColor = resolveAdhocUnselectedRenderTintColor(
    adhocRenderStyleMetadata?.unselectedRenderTintColor ??
      DEFAULT_ADHOC_MODEL_HIGHLIGHT_TINT_COLOR
  );
  const unselectedRenderTintMix = resolveAdhocUnselectedRenderTintMix(
    adhocRenderStyleMetadata?.unselectedRenderTintMix ??
      DEFAULT_ADHOC_MODEL_HIGHLIGHT_TINT_MIX
  );
  const adhocModelPosition = getAdhocFeatureModelPosition(
    adhocRenderStyleTarget
  );
  const adhocFeatureClippingEnabled = getAdhocFeatureClippingEnabled(
    adhocRenderStyleTarget
  );

  useEffect(() => {
    setAdhocRenderStyleDraft(null);
  }, [adhocRenderStyleTargetKey]);

  useEffect(() => {
    const targetChanged =
      adhocModelPositionInputTargetKey !== adhocRenderStyleTargetKey;
    if (!targetChanged && activeAdhocModelPositionField !== null) {
      return;
    }

    setAdhocModelPositionInputTargetKey(adhocRenderStyleTargetKey);
    setAdhocModelPositionInputs(
      formatAdhocModelPositionInputs(adhocModelPosition)
    );
    if (targetChanged) {
      setActiveAdhocModelPositionField(null);
    }
  }, [
    activeAdhocModelPositionField,
    adhocModelPosition?.heading,
    adhocModelPosition?.height,
    adhocModelPosition?.lat,
    adhocModelPosition?.lon,
    adhocModelPositionInputTargetKey,
    adhocRenderStyleTargetKey,
  ]);

  const ensureAdhocCesiumObjectFeature =
    async (): Promise<AdhocCesiumObjectControlTarget | null> => {
      if (!isAdhocLayer || adhocRenderStyleTarget) {
        return adhocRenderStyleTarget ?? null;
      }

      const addedFeature = await addAdhocFeatureFromLayer<AdhocFeature>({
        layer: layer as Layer,
        collectionId: layer.id,
        layerId: DEFAULT_ADHOC_FEATURE_LAYER_ID,
        addFeature,
      });
      if (!addedFeature) {
        return null;
      }

      return {
        ...addedFeature.feature,
        collectionId: addedFeature.collectionId,
        layerId: addedFeature.layerId,
      };
    };

  const updateAdhocRenderMetadataForTarget = (
    target: AdhocCesiumObjectControlTarget,
    metadata: AdhocUnselectedRenderStyleMetadata
  ) => {
    if (!isAdhocLayer) {
      return;
    }

    const targetKey = getAdhocTargetKey(target);
    if (!targetKey) {
      return;
    }
    setAdhocRenderStyleDraft((draft) => ({
      targetKey,
      metadata: {
        ...(draft?.targetKey === targetKey ? draft.metadata : {}),
        ...metadata,
      },
    }));

    updateFeatureMetadata({
      id: target.id,
      collectionId: target.collectionId,
      layerId: target.layerId,
      metadata,
    });
  };

  const setUnselectedRenderStyleEditing = useCallback(
    (editing: boolean) => {
      if (!adhocRenderStyleTarget) {
        return;
      }

      updateFeatureMetadata({
        id: adhocRenderStyleTarget.id,
        collectionId: adhocRenderStyleTarget.collectionId,
        layerId: adhocRenderStyleTarget.layerId,
        metadata: {
          unselectedRenderStyleEditing: editing,
        },
      });
    },
    [
      adhocRenderStyleTarget?.collectionId,
      adhocRenderStyleTarget?.id,
      adhocRenderStyleTarget?.layerId,
      updateFeatureMetadata,
    ]
  );

  const updateAdhocRenderMetadata = (
    metadata: AdhocUnselectedRenderStyleMetadata
  ) => {
    if (!adhocRenderStyleTarget) {
      return;
    }

    updateAdhocRenderMetadataForTarget(adhocRenderStyleTarget, metadata);
  };

  const updateAdhocFeatureTarget = (
    target: AdhocCesiumObjectControlTarget,
    updater: (feature: AdhocFeature) => AdhocFeature
  ) => {
    if (!isAdhocLayer) {
      return;
    }

    const updatedFeature = updater(target);
    if (updatedFeature === target) {
      return;
    }

    addFeature(updatedFeature, {
      collectionId: target.collectionId,
      layerId: target.layerId,
    });
  };

  const updateAdhocFeature = (
    updater: (feature: AdhocFeature) => AdhocFeature
  ) => {
    if (!adhocRenderStyleTarget) {
      return;
    }

    updateAdhocFeatureTarget(adhocRenderStyleTarget, updater);
  };

  const toggleAdhocRenderStyle = async () => {
    const target = await ensureAdhocCesiumObjectFeature();
    if (!target) {
      return;
    }

    updateAdhocRenderMetadataForTarget(target, {
      unselectedRenderStyle:
        unselectedRenderStyle === "highlight" ? "default" : "highlight",
    });

    if (isSelectedAdhocTarget(target)) {
      flashSelectedFeatureById(target.id, target.collectionId, target.layerId);
    }
  };

  const toggleAdhocModelClipping = async () => {
    const target = await ensureAdhocCesiumObjectFeature();
    if (!target) {
      return;
    }

    const clippingEnabled = getAdhocFeatureClippingEnabled(target);
    if (clippingEnabled === null) {
      return;
    }

    updateAdhocFeatureTarget(target, (feature) =>
      toggleFeatureClipping(feature, !clippingEnabled)
    );
  };

  const applyAdhocModelPositionInputs = (inputs: AdhocModelPositionInputs) => {
    const lon = parseFiniteNumber(inputs.lon);
    const lat = parseFiniteNumber(inputs.lat);
    const height = parseFiniteNumber(inputs.height);
    const heading = parseFiniteNumber(inputs.heading);
    if (lon === null || lat === null || height === null || heading === null) {
      return;
    }

    updateAdhocFeature((feature) =>
      updateMapLibreStyleFeatureModelPosition(feature, {
        lon,
        lat,
        height,
        heading,
      })
    );
  };

  const handleAdhocModelPositionInputChange = (
    field: AdhocModelPositionField,
    value: string
  ) => {
    const nextInputs = {
      ...adhocModelPositionInputs,
      [field]: value,
    };
    setAdhocModelPositionInputTargetKey(adhocRenderStyleTargetKey);
    setAdhocModelPositionInputs(nextInputs);
    applyAdhocModelPositionInputs(nextInputs);
  };

  const handleAdhocModelHeadingBlur = () => {
    setActiveAdhocModelPositionField(null);
    const heading = parseFiniteNumber(adhocModelPositionInputs.heading);
    if (heading === null) {
      return;
    }

    setAdhocModelPositionInputs((inputs) => ({
      ...inputs,
      heading: heading.toFixed(2),
    }));
  };

  return {
    adhocFeatureClippingEnabled,
    adhocModelPosition,
    adhocModelPositionInputs,
    ensureAdhocCesiumObjectFeature,
    handleAdhocModelHeadingBlur,
    handleAdhocModelPositionInputChange,
    isAdhocLayer,
    setUnselectedRenderStyleEditing,
    setActiveAdhocModelPositionField,
    toggleAdhocModelClipping,
    toggleAdhocRenderStyle,
    unselectedRenderStyle,
    unselectedRenderTintColor,
    unselectedRenderTintMix,
    updateAdhocFeature,
    updateAdhocRenderMetadata,
  };
};

type LayerbarActionButtonProps = {
  active: boolean;
  hidden?: boolean;
  icon: IconDefinition;
  onClick: () => void | Promise<void>;
  onLongPress?: () => void | Promise<void>;
  title: string;
};

const LayerbarActionButton = ({
  active,
  hidden = false,
  icon,
  onClick,
  onLongPress,
  title,
}: LayerbarActionButtonProps) => {
  const longPressTimerRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current === null) {
      return;
    }

    window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  };

  useEffect(() => clearLongPressTimer, []);

  if (hidden) {
    return null;
  }

  const startLongPress = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (event.button !== 0 || !onLongPress) {
      return;
    }

    clearLongPressTimer();
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 600);
      void onLongPress();
    }, ADHOC_LAYERBAR_LONG_PRESS_DURATION_MS);
  };

  const finishLongPress = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    clearLongPressTimer();
  };

  const handleClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }

    void onClick();
  };

  return (
    <Tooltip title={title} placement="top">
      <button
        aria-label={title}
        className={getGeoportalLayerToolActionButtonClassName(active)}
        onClick={handleClick}
        onContextMenu={(event) => event.preventDefault()}
        onPointerCancel={finishLongPress}
        onPointerDown={startLongPress}
        onPointerLeave={finishLongPress}
        onPointerUp={finishLongPress}
        type="button"
      >
        <FontAwesomeIcon icon={icon} />
      </button>
    </Tooltip>
  );
};

const AdhocInteractionPanelCloseButton = () => {
  const dispatch = useDispatch();
  const {
    layerbar: { adhocModel },
  } = geoportalAnnotationModeText;
  const closeLabel = adhocModel.actions.close;

  return (
    <Tooltip title={closeLabel} placement="top">
      <button
        aria-label={closeLabel}
        className="ml-auto flex items-center justify-center px-1.5 text-gray-600 hover:text-gray-500"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          dispatch(setActiveInteractionLayerID(null));
        }}
        type="button"
      >
        <FontAwesomeIcon icon={faX} className="text-xs" />
      </button>
    </Tooltip>
  );
};

export const AdhocModelFlyToLayerbarAction = ({
  layer,
}: {
  layer: Layer | BackgroundLayer;
}) => {
  const dispatch = useDispatch();
  const {
    layerbar: { adhocModel },
  } = geoportalAnnotationModeText;
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);
  const focusObjectLabel = adhocModel.actions.focusObject;
  const {
    featureCollections,
    addFeature,
    setSelectedFeatureById,
    setShouldFocusSelected,
  } = useAdhocFeatureDisplay();
  const { isCesium, isLeaflet } = useMapFrameworkSwitcherContext();

  if (layer.type !== "object" || !layer.props?.style) {
    return null;
  }

  const handleFlyTo = async () => {
    if (isLeaflet) {
      const styleData = await resolveAdhocStyleData(layer.props?.style);
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
              (feature: GeoJSON.Feature) => feature.geometry
            );
            if (clickFeature) {
              break;
            }
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
              layerPoint: leafletMap.latLngToLayerPoint(latlngPoint),
              containerPoint: leafletMap.latLngToContainerPoint(latlngPoint),
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
          // Fallback: if fitBounds snaps without animation, moveend may already have fired.
          setTimeout(onMoveEnd, 500);
        }

        await zoomToStyleFeatures(styleData, routedMapRef);
        return;
      }

      await zoomToStyleFeatures(styleData, routedMapRef);
      dispatch(setTriggerSelectionById(layer.id));
      return;
    }

    if (!isCesium) {
      return;
    }

    let didSelectFeature = false;
    const selectionTarget = resolveAdhocSelectionTargetByCollectionId(
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
  };

  return (
    <Tooltip title={focusObjectLabel} placement="top">
      <button
        aria-label={focusObjectLabel}
        className={getGeoportalLayerToolActionButtonClassName(false)}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void handleFlyTo();
        }}
        type="button"
      >
        <Icon name="search-location" className="leading-none" />
      </button>
    </Tooltip>
  );
};

export const AdhocModelLayerbarActions = ({
  layer,
}: {
  layer: Layer | BackgroundLayer;
}) => {
  const dispatch = useDispatch();
  const {
    layerbar: { adhocModel },
  } = geoportalAnnotationModeText;
  const activeInteractionLayerID = useSelector(getActiveInteractionLayerID);
  const activeInteractionButtonID = useSelector(getActiveInteractionButtonID);
  const {
    adhocFeatureClippingEnabled,
    ensureAdhocCesiumObjectFeature,
    isAdhocLayer,
    toggleAdhocModelClipping,
    toggleAdhocRenderStyle,
    unselectedRenderStyle,
  } = useAdhocModelLayerbarControls(layer);
  const isDevMode = useDevelopmentUiEnabled();

  if (!isAdhocLayer) {
    return null;
  }

  const openInteractionPanel = async (interactionId: string) => {
    if (!isDevMode) {
      return;
    }

    const target = await ensureAdhocCesiumObjectFeature();
    if (!target) {
      return;
    }
    if (
      interactionId === ADHOC_MODEL_CONTROL_INTERACTION_ID &&
      getAdhocFeatureClippingEnabled(target) === null
    ) {
      return;
    }

    dispatch(setActiveInteractionLayerID(layer.id));
    dispatch(setActiveInteractionButtonID(interactionId));
  };

  const isRenderStylePanelOpen =
    isDevMode &&
    activeInteractionLayerID === layer.id &&
    activeInteractionButtonID === ADHOC_RENDER_STYLE_INTERACTION_ID;
  const isModelControlPanelOpen =
    isDevMode &&
    activeInteractionLayerID === layer.id &&
    activeInteractionButtonID === ADHOC_MODEL_CONTROL_INTERACTION_ID;
  const handleRenderStyleLongPress = isDevMode
    ? () => openInteractionPanel(ADHOC_RENDER_STYLE_INTERACTION_ID)
    : undefined;
  const handleModelControlLongPress = isDevMode
    ? () => openInteractionPanel(ADHOC_MODEL_CONTROL_INTERACTION_ID)
    : undefined;
  const isHighlightActive = unselectedRenderStyle === "highlight";
  const highlightTooltip = isHighlightActive
    ? adhocModel.highlight.deactivate
    : adhocModel.highlight.activate;

  return (
    <div className="flex items-center">
      <LayerbarActionButton
        active={isRenderStylePanelOpen || isHighlightActive}
        icon={faPalette}
        onClick={toggleAdhocRenderStyle}
        onLongPress={handleRenderStyleLongPress}
        title={highlightTooltip}
      />
      <LayerbarActionButton
        active={isModelControlPanelOpen || adhocFeatureClippingEnabled === true}
        hidden={adhocFeatureClippingEnabled === null}
        icon={faCropSimple}
        onClick={toggleAdhocModelClipping}
        onLongPress={handleModelControlLongPress}
        title={adhocModel.actions.toggleClipping}
      />
    </div>
  );
};

export const AdhocRenderStyleInteractionPanel = ({
  layer,
}: {
  layer: Layer;
}) => {
  const {
    layerbar: { adhocModel },
  } = geoportalAnnotationModeText;
  const {
    isAdhocLayer,
    unselectedRenderStyle,
    unselectedRenderTintColor,
    unselectedRenderTintMix,
    setUnselectedRenderStyleEditing,
    updateAdhocRenderMetadata,
  } = useAdhocModelLayerbarControls(layer);
  const isDevMode = useDevelopmentUiEnabled();
  const renderStyleLabels = useMemo<Record<AdhocUnselectedRenderStyle, string>>(
    () => ({
      default: adhocModel.renderStyleLabels.default,
      highlight: adhocModel.renderStyleLabels.highlight,
    }),
    [
      adhocModel.renderStyleLabels.default,
      adhocModel.renderStyleLabels.highlight,
    ]
  );
  const tintSwatches = useMemo<readonly ColorSwatchGroupOption[]>(
    () =>
      ADHOC_RENDER_TINT_SWATCH_DEFINITIONS.map(({ color, key }) => ({
        color,
        label: adhocModel.tintSwatches[key],
      })),
    [adhocModel.tintSwatches]
  );

  useEffect(() => {
    if (!isAdhocLayer || !isDevMode) {
      return;
    }

    setUnselectedRenderStyleEditing(true);
    return () => setUnselectedRenderStyleEditing(false);
  }, [isAdhocLayer, isDevMode, setUnselectedRenderStyleEditing]);

  if (!isAdhocLayer || !isDevMode) {
    return null;
  }

  return (
    <DevelopmentOnlyPatternBackground
      className="flex flex-wrap items-center gap-4 rounded-[10px] bg-white px-4 py-2 button-shadow"
      patternOptions={ADHOC_DEVELOPMENT_ONLY_PATTERN_OPTIONS}
    >
      <Radio.Group
        className="[&_.ant-radio-button-wrapper]:text-center"
        value={unselectedRenderStyle}
        onChange={(event) =>
          updateAdhocRenderMetadata({
            unselectedRenderStyle: event.target
              .value as AdhocUnselectedRenderStyle,
          })
        }
      >
        {ADHOC_UNSELECTED_RENDER_STYLES.map((style) => (
          <Radio.Button key={style} className="select-none" value={style}>
            {renderStyleLabels[style]}
          </Radio.Button>
        ))}
      </Radio.Group>
      {unselectedRenderStyle === "highlight" && (
        <>
          <ColorSwatchGroup
            swatches={tintSwatches}
            value={unselectedRenderTintColor}
            showColorPicker
            tintMix={unselectedRenderTintMix}
            onChange={(color) =>
              updateAdhocRenderMetadata({
                unselectedRenderStyle: "highlight",
                unselectedRenderTintColor: color,
              })
            }
          />
          <div className="flex min-w-48 items-center gap-3">
            <span className="text-sm">{adhocModel.tintLabel}</span>
            <Slider
              className="min-w-32 flex-1"
              min={MIN_ADHOC_UNSELECTED_RENDER_TINT_MIX}
              max={1}
              step={0.01}
              tooltip={{ formatter: adhocRenderTintMixFormatter }}
              value={unselectedRenderTintMix}
              onChange={(mix) => {
                updateAdhocRenderMetadata({
                  unselectedRenderTintMix: mix,
                });
              }}
            />
          </div>
        </>
      )}
      <AdhocInteractionPanelCloseButton />
    </DevelopmentOnlyPatternBackground>
  );
};

export const AdhocModelControlInteractionPanel = ({
  layer,
}: {
  layer: Layer;
}) => {
  const {
    layerbar: { adhocModel },
  } = geoportalAnnotationModeText;
  const {
    adhocFeatureClippingEnabled,
    adhocModelPosition,
    adhocModelPositionInputs,
    handleAdhocModelHeadingBlur,
    handleAdhocModelPositionInputChange,
    isAdhocLayer,
    setActiveAdhocModelPositionField,
    updateAdhocFeature,
  } = useAdhocModelLayerbarControls(layer);
  const isDevMode = useDevelopmentUiEnabled();
  const modelPositionFields = useMemo(
    () =>
      ADHOC_MODEL_POSITION_FIELD_DEFINITIONS.map((field) => ({
        ...field,
        label: adhocModel.modelPositionFields[field.key],
      })),
    [adhocModel.modelPositionFields]
  );

  if (!isAdhocLayer || !isDevMode) {
    return null;
  }

  return (
    <DevelopmentOnlyPatternBackground
      className="flex flex-wrap items-end gap-3 rounded-[10px] bg-white px-4 py-2 button-shadow"
      patternOptions={ADHOC_DEVELOPMENT_ONLY_PATTERN_OPTIONS}
    >
      {adhocFeatureClippingEnabled !== null && (
        <div className="flex items-center gap-3">
          <span className="text-sm">{adhocModel.clipping.label}</span>
          <Radio.Group
            className="[&_.ant-radio-button-wrapper]:text-center"
            value={adhocFeatureClippingEnabled ? "on" : "off"}
            onChange={(event) => {
              updateAdhocFeature((feature) =>
                toggleFeatureClipping(feature, event.target.value === "on")
              );
            }}
          >
            <Radio.Button className="select-none" value="off">
              {adhocModel.clipping.off}
            </Radio.Button>
            <Radio.Button className="select-none" value="on">
              {adhocModel.clipping.on}
            </Radio.Button>
          </Radio.Group>
        </div>
      )}
      {adhocModelPosition &&
        modelPositionFields.map((field) => (
          <label
            key={field.key}
            className="mb-0 flex flex-col gap-1 text-xs text-gray-600"
          >
            <span>{field.label}</span>
            <input
              className="h-8 w-24 rounded border border-gray-300 px-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
              max={field.max}
              min={field.min}
              onBlur={
                field.key === "heading"
                  ? handleAdhocModelHeadingBlur
                  : () => setActiveAdhocModelPositionField(null)
              }
              onChange={(event) =>
                handleAdhocModelPositionInputChange(
                  field.key,
                  event.target.value
                )
              }
              onFocus={() => setActiveAdhocModelPositionField(field.key)}
              step={field.step}
              type="number"
              value={adhocModelPositionInputs[field.key]}
            />
          </label>
        ))}
      <AdhocInteractionPanelCloseButton />
    </DevelopmentOnlyPatternBackground>
  );
};
