/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
import {
  faChevronDown,
  faChevronLeft,
  faChevronRight,
  faChevronUp,
  faCrosshairs,
  faMagnifyingGlass,
  faPalette,
  faStar,
} from "@fortawesome/free-solid-svg-icons";
import { faStar as regularFaStar } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Radio, Slider, type SliderSingleProps } from "antd";
import {
  forwardRef,
  useContext,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import { useDispatch, useSelector } from "react-redux";
import centroid from "@turf/centroid";
import L from "leaflet";

import {
  ADHOC_UNSELECTED_RENDER_STYLES,
  DEFAULT_ADHOC_FEATURE_LAYER_ID,
  MIN_ADHOC_UNSELECTED_RENDER_TINT_MIX,
  SELECTED_LAYER_INDEX,
  resolveAdhocUnselectedRenderStyle,
  resolveAdhocUnselectedRenderTintColor,
  resolveAdhocUnselectedRenderTintMix,
  resolveAdhocSelectionTargetByCollectionId,
  useAdhocFeatureDisplay,
  type AdhocFeature,
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
import {
  ColorSwatchGroup,
  type ColorSwatchGroupOption,
} from "./ColorSwatchGroup";
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

type Ref = HTMLDivElement;

interface SecondaryViewProps {}

type SecondaryViewContentMode = "info" | "model-controls" | "render-style";
type AdhocRenderStyleDraft = {
  targetKey: string;
  metadata: AdhocUnselectedRenderStyleMetadata;
};
type AdhocCesiumObjectControlTarget = AdhocFeature & {
  collectionId: string;
  layerId: string;
};

const ADHOC_UNSELECTED_RENDER_STYLE_LABELS: Record<
  AdhocUnselectedRenderStyle,
  string
> = {
  default: "Normal",
  tint: "Getönt",
};

const ADHOC_RENDER_TINT_SWATCHES = [
  { color: "#facc15", label: "Gelb" },
  { color: "#38bdf8", label: "Blau" },
  { color: "#22c55e", label: "Grün" },
  { color: "#f97316", label: "Orange" },
] as const satisfies readonly ColorSwatchGroupOption[];

const ADHOC_MODEL_POSITION_FIELDS: readonly {
  key: AdhocModelPositionField;
  label: string;
  min?: number;
  max?: number;
  step: string;
}[] = [
  { key: "lon", label: "Lon", step: "0.000001" },
  { key: "lat", label: "Lat", step: "0.000001" },
  { key: "height", label: "Höhe", step: "0.1" },
  { key: "heading", label: "Drehung", min: 0, max: 360, step: "0.01" },
];

const adhocRenderTintMixFormatter: NonNullable<
  SliderSingleProps["tooltip"]
>["formatter"] = (value) => `${Math.round((value ?? 0) * 100)}%`;
const ADHOC_LAYERBAR_LONG_PRESS_DURATION_MS = 320;

const SecondaryView = forwardRef<Ref, SecondaryViewProps>(({}, _ref) => {
  void _ref;
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);
  const infoRef = useRef<HTMLDivElement>(null);
  const [secondaryViewContentMode, setSecondaryViewContentMode] =
    useState<SecondaryViewContentMode>("info");
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
  const layerbarLongPressTimerRef = useRef<number | null>(null);
  const suppressLayerbarIconClickRef = useRef(false);
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
    addFeature,
    updateFeatureMetadata,
    setSelectedFeatureById,
    setShouldFocusSelected,
  } = useAdhocFeatureDisplay();
  const { isLeaflet, isCesium } = useMapFrameworkSwitcherContext();
  const isAdhocCesiumObjectLayer =
    isCesium && layer.type === "object" && !!layer.props?.style;
  const adhocRenderStyleTarget = resolveAdhocSelectionTargetByCollectionId(
    featureCollections,
    layer.id,
    DEFAULT_ADHOC_FEATURE_LAYER_ID
  );
  const adhocRenderStyleTargetId = adhocRenderStyleTarget?.id;
  const adhocRenderStyleTargetCollectionId =
    adhocRenderStyleTarget?.collectionId;
  const adhocRenderStyleTargetLayerId = adhocRenderStyleTarget?.layerId;
  const adhocCesiumObjectControlTarget = adhocRenderStyleTarget as
    | AdhocCesiumObjectControlTarget
    | undefined;
  const adhocRenderStyleTargetKey =
    adhocRenderStyleTargetId &&
    adhocRenderStyleTargetCollectionId &&
    adhocRenderStyleTargetLayerId
      ? `${adhocRenderStyleTargetCollectionId}:${adhocRenderStyleTargetLayerId}:${adhocRenderStyleTargetId}`
      : null;
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
    adhocRenderStyleMetadata?.unselectedRenderTintColor
  );
  const unselectedRenderTintMix = resolveAdhocUnselectedRenderTintMix(
    adhocRenderStyleMetadata?.unselectedRenderTintMix
  );
  const adhocModelPosition = getAdhocFeatureModelPosition(
    adhocRenderStyleTarget
  );
  const adhocFeatureClippingEnabled = getAdhocFeatureClippingEnabled(
    adhocRenderStyleTarget
  );

  const updateAdhocRenderMetadataForTarget = (
    target: AdhocCesiumObjectControlTarget,
    metadata: AdhocUnselectedRenderStyleMetadata
  ) => {
    if (!isAdhocCesiumObjectLayer) {
      return;
    }

    const targetKey = `${target.collectionId}:${target.layerId}:${target.id}`;
    if (targetKey) {
      setAdhocRenderStyleDraft((draft) => ({
        targetKey,
        metadata: {
          ...(draft?.targetKey === targetKey ? draft.metadata : {}),
          ...metadata,
        },
      }));
    }

    updateFeatureMetadata({
      id: target.id,
      collectionId: target.collectionId,
      layerId: target.layerId,
      metadata,
    });
  };

  const updateAdhocRenderMetadata = (
    metadata: AdhocUnselectedRenderStyleMetadata
  ) => {
    if (!adhocCesiumObjectControlTarget) {
      return;
    }

    updateAdhocRenderMetadataForTarget(
      adhocCesiumObjectControlTarget,
      metadata
    );
  };

  const updateAdhocFeatureTarget = (
    target: AdhocCesiumObjectControlTarget,
    updater: (feature: AdhocFeature) => AdhocFeature
  ) => {
    if (!isAdhocCesiumObjectLayer) {
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
    if (!adhocCesiumObjectControlTarget) {
      return;
    }

    updateAdhocFeatureTarget(adhocCesiumObjectControlTarget, updater);
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

  const clearLayerbarLongPressTimer = () => {
    if (layerbarLongPressTimerRef.current === null) {
      return;
    }

    window.clearTimeout(layerbarLongPressTimerRef.current);
    layerbarLongPressTimerRef.current = null;
  };

  const startLayerbarIconLongPress = (
    event: ReactPointerEvent<HTMLButtonElement>,
    onLongPress: () => void | Promise<void>
  ) => {
    if (event.button !== 0) {
      return;
    }

    event.stopPropagation();
    clearLayerbarLongPressTimer();
    layerbarLongPressTimerRef.current = window.setTimeout(() => {
      layerbarLongPressTimerRef.current = null;
      suppressLayerbarIconClickRef.current = true;
      window.setTimeout(() => {
        suppressLayerbarIconClickRef.current = false;
      }, 600);
      void onLongPress();
    }, ADHOC_LAYERBAR_LONG_PRESS_DURATION_MS);
  };

  const finishLayerbarIconLongPress = (
    event: ReactPointerEvent<HTMLButtonElement>
  ) => {
    event.stopPropagation();
    clearLayerbarLongPressTimer();
  };

  const handleLayerbarIconClick = (
    event: ReactMouseEvent<HTMLButtonElement>,
    onClick: () => void | Promise<void>
  ) => {
    event.stopPropagation();
    if (suppressLayerbarIconClickRef.current) {
      suppressLayerbarIconClickRef.current = false;
      return;
    }

    void onClick();
  };

  const isAdhocRenderStylePanelActive =
    showInfo &&
    secondaryViewContentMode === "render-style" &&
    isAdhocCesiumObjectLayer;
  const isAdhocRenderStylePanelOpen =
    isAdhocRenderStylePanelActive && showInfoText;
  const isAdhocModelControlPanelActive =
    showInfo &&
    secondaryViewContentMode === "model-controls" &&
    isAdhocCesiumObjectLayer;
  const isAdhocModelControlPanelOpen =
    isAdhocModelControlPanelActive && showInfoText;
  const isAdhocInlinePanelActive =
    isAdhocRenderStylePanelActive || isAdhocModelControlPanelActive;

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
    setSecondaryViewContentMode("info");
  }, [isCesium, layer.id]);

  useEffect(() => clearLayerbarLongPressTimer, []);

  useEffect(() => {
    if (
      !isAdhocCesiumObjectLayer ||
      !adhocRenderStyleTargetId ||
      !adhocRenderStyleTargetCollectionId ||
      !adhocRenderStyleTargetLayerId
    ) {
      return;
    }

    updateFeatureMetadata({
      id: adhocRenderStyleTargetId,
      collectionId: adhocRenderStyleTargetCollectionId,
      layerId: adhocRenderStyleTargetLayerId,
      metadata: {
        unselectedRenderStyleEditing: isAdhocRenderStylePanelOpen,
      },
    });

    return () => {
      if (!isAdhocRenderStylePanelOpen) {
        return;
      }
      updateFeatureMetadata({
        id: adhocRenderStyleTargetId,
        collectionId: adhocRenderStyleTargetCollectionId,
        layerId: adhocRenderStyleTargetLayerId,
        metadata: {
          unselectedRenderStyleEditing: false,
        },
      });
    };
  }, [
    adhocRenderStyleTargetCollectionId,
    adhocRenderStyleTargetId,
    adhocRenderStyleTargetLayerId,
    isAdhocCesiumObjectLayer,
    isAdhocRenderStylePanelOpen,
    updateFeatureMetadata,
  ]);

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
  const ensureAdhocCesiumObjectFeature =
    async (): Promise<AdhocCesiumObjectControlTarget | null> => {
      if (!isAdhocCesiumObjectLayer || adhocRenderStyleTarget) {
        return adhocCesiumObjectControlTarget ?? null;
      }

      const addedFeature = await addAdhocFeatureFromLayer<AdhocFeature>({
        layer,
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

  const openAdhocRenderStylePanel = async () => {
    await ensureAdhocCesiumObjectFeature();
    setSecondaryViewContentMode("render-style");
    if (!showInfo) {
      dispatch(setUIShowInfo(true));
    }
    setTimeout(() => dispatch(setUIShowInfoText(true)), showInfoText ? 0 : 80);
  };

  const openAdhocModelControlPanel = async () => {
    await ensureAdhocCesiumObjectFeature();
    setSecondaryViewContentMode("model-controls");
    if (!showInfo) {
      dispatch(setUIShowInfo(true));
    }
    setTimeout(() => dispatch(setUIShowInfoText(true)), showInfoText ? 0 : 80);
  };

  const toggleAdhocRenderStyle = async () => {
    const target = await ensureAdhocCesiumObjectFeature();
    if (!target) {
      return;
    }

    updateAdhocRenderMetadataForTarget(target, {
      unselectedRenderStyle:
        unselectedRenderStyle === "tint" ? "default" : "tint",
    });
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

  const adhocRenderStylePanel = (
    <div className="flex flex-col gap-3 px-4 pb-4">
      <Radio.Group
        className="flex w-full [&_.ant-radio-button-wrapper]:flex-1 [&_.ant-radio-button-wrapper]:text-center"
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
            {ADHOC_UNSELECTED_RENDER_STYLE_LABELS[style]}
          </Radio.Button>
        ))}
      </Radio.Group>
      {unselectedRenderStyle === "tint" && (
        <div className="flex flex-wrap items-center gap-4">
          <ColorSwatchGroup
            swatches={ADHOC_RENDER_TINT_SWATCHES}
            value={unselectedRenderTintColor}
            showColorPicker
            tintMix={unselectedRenderTintMix}
            onChange={(color) =>
              updateAdhocRenderMetadata({
                unselectedRenderStyle: "tint",
                unselectedRenderTintColor: color,
              })
            }
          />
          <div className="flex min-w-48 flex-1 items-center gap-3">
            <span className="text-sm">Tönung</span>
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
        </div>
      )}
    </div>
  );
  const adhocModelControlPanel = (
    <div className="flex flex-col gap-3 px-4 pb-4">
      {adhocFeatureClippingEnabled !== null && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="w-20 text-sm">Clipping</span>
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
              Aus
            </Radio.Button>
            <Radio.Button className="select-none" value="on">
              An
            </Radio.Button>
          </Radio.Group>
        </div>
      )}
      {adhocModelPosition && (
        <div className="grid grid-cols-2 gap-2">
          {ADHOC_MODEL_POSITION_FIELDS.map((field) => (
            <label
              key={field.key}
              className="mb-0 flex flex-col gap-1 text-xs text-gray-600"
            >
              <span>{field.label}</span>
              <input
                className="h-8 rounded border border-gray-300 px-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
                type="number"
                min={field.min}
                max={field.max}
                step={field.step}
                value={adhocModelPositionInputs[field.key]}
                onFocus={() => setActiveAdhocModelPositionField(field.key)}
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
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="pt-3 w-full pointer-events-none">
      <div className="flex items-center justify-center w-full">
        <div
          ref={infoRef}
          className={cn(
            "pointer-events-auto",
            "min-w-[280px] sm:max-w-[560px] md:max-w-[720px] lg:w-full w-full sm:w-3/4 sm:mx-0",
            "h-fit bg-white button-shadow rounded-[10px] flex flex-col relative secondary-view gap-2 py-2 transition-all duration-300",
            isAdhocInlinePanelActive
              ? "h-fit"
              : showInfo
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
            {isAdhocCesiumObjectLayer && (
              <button
                className={cn(
                  "hover:text-gray-500 flex items-center justify-center",
                  isAdhocRenderStylePanelOpen
                    ? "text-yellow-500"
                    : unselectedRenderStyle === "default"
                    ? "text-gray-600"
                    : "text-yellow-500"
                )}
                onClick={(event) =>
                  handleLayerbarIconClick(event, toggleAdhocRenderStyle)
                }
                onContextMenu={(event) => event.preventDefault()}
                onPointerCancel={finishLayerbarIconLongPress}
                onPointerDown={(event) =>
                  startLayerbarIconLongPress(event, openAdhocRenderStylePanel)
                }
                onPointerLeave={finishLayerbarIconLongPress}
                onPointerUp={finishLayerbarIconLongPress}
                title="Darstellung umschalten"
                type="button"
              >
                <FontAwesomeIcon icon={faPalette} />
              </button>
            )}
            {isAdhocCesiumObjectLayer && (
              <button
                className={cn(
                  "hover:text-gray-500 flex items-center justify-center",
                  isAdhocModelControlPanelOpen || adhocFeatureClippingEnabled
                    ? "text-yellow-500"
                    : "text-gray-600"
                )}
                onClick={(event) =>
                  handleLayerbarIconClick(event, toggleAdhocModelClipping)
                }
                onContextMenu={(event) => event.preventDefault()}
                onPointerCancel={finishLayerbarIconLongPress}
                onPointerDown={(event) =>
                  startLayerbarIconLongPress(event, openAdhocModelControlPanel)
                }
                onPointerLeave={finishLayerbarIconLongPress}
                onPointerUp={finishLayerbarIconLongPress}
                title="Clipping umschalten"
                type="button"
              >
                <FontAwesomeIcon icon={faCrosshairs} />
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
                setSecondaryViewContentMode("info");
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
            ) : secondaryViewContentMode === "render-style" &&
              isAdhocCesiumObjectLayer ? (
              adhocRenderStylePanel
            ) : secondaryViewContentMode === "model-controls" &&
              isAdhocCesiumObjectLayer ? (
              adhocModelControlPanel
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
