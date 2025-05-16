// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import {
  MappingConstants,
  RoutedMap,
  FeatureCollectionDisplay,
  NewMarkerControl,
  NewPolyControl,
} from "react-cismap";
import { useDispatch, useSelector } from "react-redux";
import { useSearchParams } from "react-router-dom";
import {
  fitFeatureBounds,
  getMapping,
  mapBoundsChanged,
  setAutoFit,
  setSelectedFeatureIndexWithSelector,
} from "../../store/slices/mapping";
import "react-cismap/topicMaps.css";
import "leaflet/dist/leaflet.css";
import { getHeight, getUiState } from "../../store/slices/ui";
import {
  createFlaechenStyler,
  getMarkerStyleFromFeatureConsideringSelection,
} from "../../utils/kassenzeichenMappingTools";
import {
  addAnnotation,
  changeAnnotation,
  getKassenzeichen,
} from "../../store/slices/kassenzeichen";
import CyclingBackgroundButton from "./CyclingBackgroundButton";
import { ReactNode, useRef, useState } from "react";
import EditModeControlButton from "./EditModeControlButton";
import { Control, ControlLayout } from "@carma-mapping/map-controls-layout";
import { ZoomControl } from "./controls/ZoomControl";
import { CyclingControl } from "./controls/CyclingControl";
import { PolygonControl } from "./controls/PolygonControl";
import proj4 from "proj4";

const WGS84 = "EPSG:4326";
const CRS25832 = MappingConstants.proj4crs25832def;

function to25832([lon, lat]: [number, number]): [number, number] {
  return proj4(WGS84, CRS25832, [lon, lat]);
}

interface MapProps {
  children?: ReactNode;
  newHeight?: number;
}

const Map = ({ children, newHeight }: MapProps) => {
  const [urlParams, setUrlParams] = useSearchParams();
  let refRoutedMap = useRef(null);
  const dispatch = useDispatch();
  const mapping = useSelector(getMapping);
  const uiState = useSelector(getUiState);
  const height = useSelector(getHeight);
  const kassenzeichen = useSelector(getKassenzeichen);
  const annotationEditable = uiState.changeRequestsEditMode;
  const [featuresInEditMode, setFeaturesInEditMode] = useState(false);

  function paramsToObject(entries) {
    const result = {};
    for (const [key, value] of entries) {
      // each 'entry' is a [key, value] tupple
      result[key] = value;
    }
    return result;
  }

  const isFlaecheSelected = (flaeche) => {
    return (
      mapping.featureCollection !== "undefined" &&
      mapping.featureCollection.length > 0 &&
      mapping.selectedIndex !== "undefined" &&
      mapping.featureCollection.length > mapping.selectedIndex &&
      mapping.featureCollection[mapping.selectedIndex] &&
      mapping.featureCollection[mapping.selectedIndex]?.properties.id ===
        flaeche.id
    );
  };

  const featureClick = (event, feature) => {
    if (isFlaecheSelected(feature.properties)) {
      dispatch(
        fitFeatureBounds(mapping.featureCollection[mapping.selectedIndex], "")
      );
    } else {
      dispatch(
        setSelectedFeatureIndexWithSelector((testFeature) => {
          return testFeature.properties.id === feature.properties.id;
        })
      );
    }
  };

  const handleFeatureCreation = (feature: GeoJSON.Feature) => {
    const reprojectedCoords = (
      feature.geometry as GeoJSON.Polygon
    ).coordinates.map((ring) => ring.map(to25832));

    const feature25832: GeoJSON.Feature = {
      ...feature,
      geometry: {
        ...feature.geometry,
        coordinates: reprojectedCoords,
      },
    };

    dispatch(addAnnotation(feature25832));
  };

  const handleFeatureAfterEditing = (feature) => {
    console.log("xxx change annotation", feature.id);
    dispatch(changeAnnotation(feature));
  };

  const mapStyle = {
    height: newHeight ? newHeight : height - 55,
    cursor: "grab",
  };

  return (
    <>
      <div
        className="controls-container"
        style={{
          position: "absolute",
          top: "70px",
          left: "0px",
          bottom: "0px",
          zIndex: 600,
        }}
      >
        <ControlLayout ifStorybook={false}>
          <Control position="topleft" order={10}>
            <ZoomControl routedMapRef={refRoutedMap} />
          </Control>
          <Control position="topleft" order={20}>
            <CyclingControl />
          </Control>
          {annotationEditable && (
            <Control position="topleft" order={20}>
              <PolygonControl
                routedMapRef={refRoutedMap}
                onCreated={handleFeatureCreation}
              />
            </Control>
          )}
        </ControlLayout>
      </div>
      <RoutedMap
        key={
          "RoutedMap" +
          JSON.stringify(kassenzeichen) +
          JSON.stringify(annotationEditable)
        }
        zoomControlEnabled={false}
        editable={true}
        onFeatureCreation={handleFeatureCreation}
        onFeatureChangeAfterEditing={handleFeatureAfterEditing}
        snappingEnabled={true}
        key={"leafletRoutedMap0 + "}
        referenceSystem={MappingConstants.crs25832}
        referenceSystemDefinition={MappingConstants.proj4crs25832def}
        ref={refRoutedMap}
        layers=""
        style={mapStyle}
        // ondblclick={this.mapDblClick}
        doubleClickZoom={false}
        locationChangedHandler={(location) => {
          const newParams = { ...paramsToObject(urlParams), ...location };
          setUrlParams(newParams);
        }}
        autoFitConfiguration={{
          autoFitBounds: mapping.autoFitBounds,
          autoFitMode: mapping.autoFitMode,
          autoFitBoundsTarget: mapping.autoFitBoundsTarget,
        }}
        autoFitProcessedHandler={
          () => dispatch(setAutoFit({ autofit: false }))
          // this.props.mappingActions.setAutoFit(false)
        }
        urlSearchParams={urlParams}
        boundingBoxChangedHandler={
          (bbox) => dispatch(mapBoundsChanged({ bbox }))
          // this.props.mappingActions.mappingBoundsChanged(bbox)
        }
        backgroundlayers={
          // this.props.backgroundlayers ||
          mapping.backgrounds[mapping.selectedBackgroundIndex].layerkey
        }
      >
        <FeatureCollectionDisplay
          key={
            "fc" +
            JSON.stringify(mapping.featureCollection) +
            "+" +
            mapping.selectedIndex +
            "+editEnabled:"
            // this.props.uiState.changeRequestsEditMode
          }
          featureCollection={mapping.featureCollection.filter(
            (feature) =>
              annotationEditable || feature.properties.type !== "annotation"
          )}
          boundingBox={mapping.boundingBox}
          clusteringEnabled={false}
          style={createFlaechenStyler(false, kassenzeichen)}
          // hoverer={this.props.hoverer}
          featureClickHandler={featureClick}
          // mapRef={this.leafletRoutedMap}
          showMarkerCollection={urlParams.get("zoom") >= 15}
          markerStyle={getMarkerStyleFromFeatureConsideringSelection}
          snappingGuides={true}
        />
        {/* <CyclingBackgroundButton
          key={"CyclingBackgroundButton."}
          mapRef={refRoutedMap}
        />
        {annotationEditable && (
          <NewPolyControl
            key={
              "NewPolyControl + update when CyclingBackgroundButton."
              // this.state.featuresInEditmode +
              // this.props.mapping.selectedBackgroundIndex
            }
            // onSelect={() => {
            //     this.setState({ featuresInEditmode: false });
            // }}
            tooltip="Fläche anlegen"
          />
        )}
        {annotationEditable && (
          <NewMarkerControl
            key={
              "NewMarkerControl+ update when CyclingBackgroundButton."
              // this.state.featuresInEditmode +
              // this.props.mapping.selectedBackgroundIndex
            }
            onSelect={() => {}}
            tooltip="Punkt anlegen"
          />
        )}
        {annotationEditable && (
          <EditModeControlButton
            mapRef={refRoutedMap}
            featuresInEditMode={featuresInEditMode}
            onFeatureChange={setFeaturesInEditMode}
            selectedFeatureId={
              mapping.featureCollection[mapping?.selectedIndex]
            }
          />
        )} */}
        {children}
      </RoutedMap>
    </>
  );
};

export default Map;
