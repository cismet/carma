import * as utils from "./lib/utils/utils";

export type {
  GeoportalCollection,
  LayerInfo,
  LayerMap,
  CSSFilter,
  StyleProperties,
  NamedStyles,
  VectorLayerOptions,
  WMSOptions,
  WMTSOptions,
  TilesOptions,
  NamedLayers,
  CismetDefaults,
  LayerConfig,
  DefaultLayerConfig,
  Settings,
  LayerState,
  MappingState,
  FeatureInfoState,
  SelectedObject,
} from "./lib/types";
export type {
  CismapSupportedLayerTypes,
  CismapLayerProps,
} from "./lib/contracts/cismap-layer-props.d";
export type {
  CarmaConf3DClippingPolygon,
  CarmaConf3DModel,
  CarmaConf3D,
  CarmaMapLibreStyleMetadata,
  CarmaMapLibreStyleData,
  CarmaMapLibreFeatureProperties,
} from "./lib/contracts/maplibre-style.d";
export type { AdhocMapLibreStyleData } from "./lib/contracts/adhoc-style.d";

export enum SELECTED_LAYER_INDEX {
  NO_SELECTION = -2,
  BACKGROUND_LAYER = -1,
}

export { utils };

export { Save } from "./lib/components/Save.tsx";
export { Share } from "./lib/components/Share.tsx";
export { CarmaIconLink } from "./lib/components/CarmaIconLink.tsx";
export { CarmaMapProviderWrapper } from "./lib/components/CarmaMapProviderWrapper.tsx";
export { InfoBox } from "./lib/components/InfoBox.tsx";
export { ResponsiveInfoBox } from "./lib/components/ResponsiveInfoBox.tsx";
export {
  CISMAP_ANNOTATION_INFO_BOX_GENERIC_VISUAL_OPTIONS,
  CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS,
  CismapAnnotationInfoBox,
  CismapAnnotationInstructionInfoBox,
  type CismapAnnotationInfoBoxProps,
  type CismapAnnotationInstructionInfoBoxProps,
} from "./lib/components/CismapAnnotationInfoBox.tsx";
export {
  CismapRuntimeAnnotationInfoBox,
  type CismapRuntimeAnnotationInfoBoxLayoutProps,
  type CismapRuntimeAnnotationInfoBoxProps,
} from "./lib/components/CismapRuntimeAnnotationInfoBox";
export { GenericInfoBoxFromFeature } from "./lib/components/GenericInfoBoxFromFeature.tsx";
export { PieChart } from "./lib/components/PieChart.tsx";
export { ContactMailButton } from "./lib/components/ContactMailButton.tsx";
export { FeatureInfobox } from "./lib/components/FeatureInfobox.tsx";
export { PanoramaLightBox } from "./lib/components/PanoramaLightBox.tsx";
export { PanoramaPreview } from "./lib/components/PanoramaPreview.tsx";
export { InfoBoxHeader } from "./lib/components/InfoBoxHeader.tsx";
// CarmaMap moved to @carma-mapping/core
// PreviewLibreMap moved to @carma-mapping/engines/maplibre
// LibreContext moved to @carma-mapping/engines/maplibre

export { GazDataProvider, useGazData } from "./lib/components/GazDataProvider";

export {
  MapStyleProvider,
  useMapStyle,
  type MapStyleConfig,
} from "./lib/contexts/MapStyleProvider";

export { MessageOverlay } from "./lib/components/MessageOverlay";

export {
  SelectionProvider,
  type SelectionMetaData,
  useSelection,
  type SelectionItem,
  SelectionMapMode,
} from "./lib/components/SelectionProvider";

export {
  AdhocFeatureDisplayProvider,
  useAdhocFeatureDisplay,
  type AdhocFeature,
  type AdhocFeatureCollection,
  type AdhocFeatureCollectionSeed,
  type AddAdhocFeatureOptions,
  type RemoveAdhocFeatureOptions,
  type ClearAdhocFeaturesOptions,
  type ClearAdhocFeaturesTarget,
  type AdhocFeatureCollectionMetadata,
  type AdhocFeatureMetadata,
  type AdhocFeatureMetadataUpdate,
  type AdhocMapLibreStyleFeature,
  type AdhocFeatureSelectionChange,
  type AdhocFeatureSelectionChangeListener,
} from "./lib/components/AdhocFeatureDisplayProvider";
export {
  ADHOC_LAYER_SOURCES,
  ADHOC_LAYER_VISIBILITIES,
  DEFAULT_ADHOC_FEATURE_COLLECTION_ID,
  DEFAULT_ADHOC_FEATURE_LAYER_ID,
  type AdhocLayerSource,
  type AdhocLayerVisibility,
} from "./lib/constants/adhoc";
export {
  resolveAdhocFeatureLayerId,
  resolveAdhocSelectionTargetByCollectionId,
  pickPreferredAdhocFeature,
  type AdhocCollectionLike,
  type AdhocSelectionTarget,
} from "./lib/utils/adhoc-selection-utils";
export {
  getCarmaConf3DClippingPolygonRing,
  type CarmaConf3DClippingPolygonRing,
} from "./lib/utils/carma-conf3d-clipping";
export {
  ADHOC_UNSELECTED_RENDER_STYLES,
  DEFAULT_ADHOC_UNSELECTED_RENDER_STYLE,
  DEFAULT_ADHOC_UNSELECTED_RENDER_TINT_COLOR,
  DEFAULT_ADHOC_UNSELECTED_RENDER_TINT_MIX,
  MIN_ADHOC_UNSELECTED_RENDER_TINT_MIX,
  isAdhocUnselectedRenderStyle,
  resolveAdhocUnselectedRenderStyle,
  resolveAdhocUnselectedRenderTintColor,
  resolveAdhocUnselectedRenderTintMix,
  type AdhocUnselectedRenderStyle,
  type AdhocUnselectedRenderStyleMetadata,
} from "./lib/utils/adhoc-render-style";
export {
  isDevelopmentUiEnabled,
  useDevelopmentUiEnabled,
  type DevelopmentUiEnabledOptions,
  type DevelopmentUiFeatureFlags,
} from "./lib/utils/development-ui";

export { LibreMapSelectionContent } from "./lib/components/LibreMapSelectionContent";
export { TopicMapSelectionContent } from "./lib/components/TopicMapSelectionContent";
export { ProgressIndicator } from "./lib/components/ProgressIndicator";

export { useSelectionTopicMap } from "./lib/hooks/useSelectionTopicMap";
export { useSelectionCesium } from "./lib/hooks/useSelectionCesium";
export { useSelectionLibreMap } from "./lib/hooks/useSelectionLibreMap";
export { useShareUrl, SHORTENER_URL } from "./lib/hooks/useShareUrl";
export { useProgress } from "./lib/hooks/useProgress";
export {
  useAdhocCesiumFeatureDisplay,
  type AdhocCesiumModelShaderOptions,
} from "./lib/hooks/useAdhocCesiumFeatureDisplay";
export { useUrlFeatureSelection } from "./lib/hooks/useUrlFeatureSelection";
export { useHashLaunchMode } from "./lib/hooks/useHashLaunchMode";
export {
  useAppSearchParams,
  type AppSearchParamsCustomStateSnapshot,
  type AppSearchParamsDefaultHashOptions,
  type AppSearchParamsStateSource,
  type UseAppSearchParamsOptions,
  type UseAppSearchParamsResult,
} from "./lib/hooks/useAppSearchParams";
export { useRegisterDefaultMapHashClearStateKeySets } from "./lib/hooks/useRegisterDefaultMapHashClearStateKeySets";
export {
  useMapHashRouting,
  type LatLngZoom,
} from "./lib/hooks/useMapHashRouting";
export {
  defaultBackgroundConfigurations,
  backgroundConfWithFastOrtho2024,
} from "./lib/utils/topicmapConfigs";
export {
  buildInfoBoxStylingProps,
  getCarmaConf3D,
} from "./lib/utils/adhoc-feature-utils";
// Feature functions moved to @carma-mapping/utils
// createUrl, functionToFeature, objectToFeature, createVectorFeature, getInfoBoxControlObjectFromMappingAndVectorFeature

export { getActionLinksForFeature } from "./lib/components/helper";

export {
  motisClient,
  planRoute,
  geocodeAddress,
  reverseGeocode,
  getStopsInArea,
  formatPlace,
  type MotisPlace,
  type MotisRouteParams,
} from "./lib/services/motisService";

// fetchRouteOptions, displaySelectedRouteOnMap, RouteOption moved to @carma-mapping/routing
// RouteOptionsDrawer moved to @carma-mapping/routing

export { defaultLayerConf } from "./lib/components/react-cismap/tools/layerFactory";
export { default as getLayers } from "./lib/components/react-cismap/tools/layerFactory";
