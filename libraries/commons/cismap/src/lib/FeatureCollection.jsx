import Color from "color";
import { useContext } from "react";
import {
  FeatureCollectionContext,
  FeatureCollectionDispatchContext,
} from "react-cismap/contexts/FeatureCollectionContextProvider";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import { TopicMapStylingContext } from "react-cismap/contexts/TopicMapStylingContextProvider";
import FeatureCollectionDisplayWithTooltipLabels from "react-cismap/FeatureCollectionDisplayWithTooltipLabels";
import FeatureCollectionDisplay from "./FeatureCollectionDisplay";

export const getDefaultFeatureStyler = (
  size = 24,
  colorizer = () => "#2664D8"
) => {
  return (feature) => {
    let color;
    if (feature.selected === true) {
      color = new Color("#2664D8");
    } else {
      color = new Color(colorizer(feature.properties));
    }
    return {
      radius: size / 2.4,
      fillColor: color,
      color: color.darken(0.1),
      opacity: 1,
      fillOpacity: 0.8,
    };
  };
};

export const defaultClusteringOptions = {
  spiderfyOnMaxZoom: false,
  showCoverageOnHover: false,
  zoomToBoundsOnClick: false,
  maxClusterRadius: 40,
  disableClusteringAtZoom: 19,
  animate: false,
  cismapZoomTillSpiderfy: 12,
  selectionSpiderfyMinZoom: 12,
  colorizer: (props) => props.color,
  clusterIconSize: 30,
};

const FeatureCollection = (props) => {
  const {
    styler,
    featureHoverer,
    featureClickHandler = () => {},
    mapRef,
    clusteringOptions,
    clusteringEnabled,
    showMarkerCollection = false,
    markerStyle,
    featureLabeler,
    featureKeySuffixGenerator = () => {},
    featureCollectionKeyPostfix,
    handleSelectionInternaly = true,
    defaultContextValues = {},
  } = props;
  const { routedMapRef, boundingBox, appMode } =
    useContext(TopicMapContext) || defaultContextValues;
  const { markerSymbolSize, additionalStylingInfo } =
    useContext(TopicMapStylingContext) || defaultContextValues;
  const {
    shownFeatures,
    clusteringOptions: clusteringOptionsFromContext,
    clusteringEnabled: clusteringEnabledFromContext,
    getFeatureStyler,
    getColorFromProperties,
    featureTooltipFunction,
    secondarySelection,
  } = useContext(FeatureCollectionContext) || defaultContextValues;

  const { setSelectedFeatureIndex } =
    useContext(FeatureCollectionDispatchContext) || defaultContextValues;

  const _mapRef = mapRef || routedMapRef;

  let _style;
  if (styler !== undefined) {
    _style = styler(
      markerSymbolSize,
      getColorFromProperties || ((props) => props.color),
      appMode
    );
  } else if (getFeatureStyler !== undefined) {
    _style = getFeatureStyler(
      markerSymbolSize,
      getColorFromProperties || ((props) => props.color),
      appMode,
      secondarySelection,
      additionalStylingInfo
    );
  } else {
    _style = getDefaultFeatureStyler(
      markerSymbolSize,
      getColorFromProperties || ((props) => props.color),
      appMode,
      secondarySelection,
      additionalStylingInfo
    );
  }

  const _clusterOptions = {
    ...defaultClusteringOptions,
    ...clusteringOptionsFromContext,
    ...clusteringOptions,
  };

  const _clusteringEnabled = clusteringEnabled || clusteringEnabledFromContext;

  const internalFeatureClickHandler = (event) => {
    const feature = event.sourceTarget.feature;

    if (
      handleSelectionInternaly === true &&
      feature.preventSelection !== true
    ) {
      setSelectedFeatureIndex(feature.index);
    }
    featureClickHandler(event);
  };

  const featureCollection = shownFeatures;

  if (featureLabeler) {
    return (
      <FeatureCollectionDisplayWithTooltipLabels
        key={
          JSON.stringify(featureCollection) +
          featureKeySuffixGenerator() +
          "clustered:" +
          _clusteringEnabled +
          ".customPostfix:" +
          featureCollectionKeyPostfix
        }
        featureCollection={featureCollection}
        boundingBox={boundingBox}
        clusterOptions={_clusterOptions}
        clusteringEnabled={_clusteringEnabled}
        style={_style}
        labeler={featureLabeler}
        hoverer={featureHoverer || featureTooltipFunction}
        featureClickHandler={internalFeatureClickHandler}
        mapRef={(_mapRef || {}).leafletMap}
        appMode={appMode}
        secondarySelection={secondarySelection}
      />
    );
  } else {
    return (
      <FeatureCollectionDisplay
        key={
          JSON.stringify(featureCollection) +
          featureKeySuffixGenerator() +
          "clustered:" +
          _clusteringEnabled +
          markerSymbolSize +
          ".customPostfix:" +
          featureCollectionKeyPostfix
        }
        featureCollection={featureCollection}
        boundingBox={boundingBox}
        clusteringEnabled={_clusteringEnabled}
        clusterOptions={_clusterOptions}
        style={_style}
        hoverer={featureHoverer || featureTooltipFunction}
        labeler={featureLabeler}
        featureStylerScalableImageSize={markerSymbolSize}
        featureClickHandler={internalFeatureClickHandler}
        mapRef={(_mapRef || {}).leafletMap}
        showMarkerCollection={showMarkerCollection}
        markerStyle={markerStyle}
        appMode={appMode}
        secondarySelection={secondarySelection}
      />
    );
  }
};

export default FeatureCollection;
