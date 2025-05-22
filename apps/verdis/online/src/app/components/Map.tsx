import {
  MappingConstants,
  RoutedMap,
  FeatureCollectionDisplay,
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
import {
  getHeight,
  getNavbarHeight,
  getUiState,
  setHintVisible,
} from "../../store/slices/ui";
import {
  createFlaechenStyler,
  getMarkerStyleFromFeatureConsideringSelection,
} from "../../utils/kassenzeichenMappingTools";
import {
  addAnnotation,
  changeAnnotation,
  getKassenzeichen,
} from "../../store/slices/kassenzeichen";
import { ReactNode, useRef, useState } from "react";
import { Control, ControlLayout } from "@carma-mapping/map-controls-layout";
import { ZoomControl } from "./controls/ZoomControl";
import { CyclingControl } from "./controls/CyclingControl";
import { PolygonControl } from "./controls/PolygonControl";
import proj4 from "proj4";
import { MarkerControl } from "./controls/MarkerControl";
import { EditControl } from "./controls/EditControl";
import type { Map as LeafletMap } from "leaflet";
import type { UnknownAction } from "redux";
import { Position } from "geojson";

const WGS84 = "EPSG:4326";
const CRS25832 = MappingConstants.proj4crs25832def;

function to25832(coord: Position): [number, number] {
  const [lon, lat] = coord;
  return proj4(WGS84, CRS25832, [lon, lat]);
}

interface MapProps {
  children?: ReactNode;
  newHeight?: number;
}

export type EditableMap = LeafletMap & {
  editTools: {
    startPolygon: (options?: any, config?: any) => void;
    startMarker: (options?: any) => void;
    stopDrawing: () => void;
  };
};

const Map = ({ children, newHeight }: MapProps) => {
  const [urlParams, setUrlParams] = useSearchParams();
  let refRoutedMap = useRef(null);
  const dispatch = useDispatch();
  const mapping = useSelector(getMapping);
  const uiState = useSelector(getUiState);
  const height = useSelector(getHeight);
  const navbarHeight = useSelector(getNavbarHeight);
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
    dispatch(setHintVisible(false));
    if (isFlaecheSelected(feature.properties)) {
      dispatch(
        fitFeatureBounds(
          mapping.featureCollection[mapping.selectedIndex],
          ""
        ) as unknown as UnknownAction
      );
    } else {
      dispatch(
        setSelectedFeatureIndexWithSelector((testFeature) => {
          return testFeature.properties.id === feature.properties.id;
        }) as unknown as UnknownAction
      );
    }
  };

  const handlePolygonCreation = (feature: GeoJSON.Feature) => {
    if (feature.geometry.type !== "Polygon") return;

    const poly = feature.geometry as GeoJSON.Polygon;
    const rings25832 = poly.coordinates.map((ring) => ring.map(to25832));

    const feature25832: GeoJSON.Feature = {
      ...feature,
      geometry: {
        type: "Polygon",
        coordinates: rings25832,
      },
      properties: {
        ...feature.properties,
      },
    };

    dispatch(addAnnotation(feature25832) as unknown as UnknownAction);
  };

  const handleMarkerCreation = (feature: GeoJSON.Feature) => {
    if (feature.geometry.type !== "Point") return;

    const [lon, lat] = (feature.geometry as GeoJSON.Point).coordinates;
    const [x, y] = to25832([lon, lat]);

    const feature25832: GeoJSON.Feature = {
      ...feature,
      geometry: {
        type: "Point",
        coordinates: [x, y],
      },
      properties: {
        ...feature.properties,
      },
    };

    dispatch(addAnnotation(feature25832) as unknown as UnknownAction);
  };

  const handleFeatureAfterEditing = (feature) => {
    dispatch(changeAnnotation(feature) as unknown as UnknownAction);
  };

  const handleFeatureCreation = (feature) => {
    dispatch(addAnnotation(feature) as unknown as UnknownAction);
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
          top: navbarHeight,
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
                onCreated={handlePolygonCreation}
              />
            </Control>
          )}
          {annotationEditable && (
            <Control position="topleft" order={20}>
              <MarkerControl
                routedMapRef={refRoutedMap}
                onCreated={handleMarkerCreation}
              />
            </Control>
          )}
          {annotationEditable && (
            <Control position="topleft" order={20}>
              <EditControl
                routedMapRef={refRoutedMap}
                featuresInEditMode={featuresInEditMode}
                setFeaturesInEditMode={setFeaturesInEditMode}
                selectedFeatureId={
                  mapping.featureCollection[mapping?.selectedIndex]
                }
              />
            </Control>
          )}
        </ControlLayout>
      </div>
      <RoutedMap
        key={"RoutedMapKey"}
        zoomControlEnabled={false}
        editable={true}
        onFeatureCreation={handleFeatureCreation}
        onFeatureChangeAfterEditing={handleFeatureAfterEditing}
        snappingEnabled={true}
        referenceSystem={MappingConstants.crs25832}
        referenceSystemDefinition={MappingConstants.proj4crs25832def}
        ref={refRoutedMap}
        layers=""
        style={mapStyle}
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
        autoFitProcessedHandler={() => dispatch(setAutoFit({ autofit: false }))}
        urlSearchParams={urlParams}
        boundingBoxChangedHandler={(bbox) =>
          dispatch(mapBoundsChanged({ bbox }))
        }
        backgroundlayers={
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
          }
          featureCollection={mapping.featureCollection.filter(
            (feature) =>
              annotationEditable || feature.properties.type !== "annotation"
          )}
          boundingBox={mapping.boundingBox}
          clusteringEnabled={false}
          style={createFlaechenStyler(false, kassenzeichen)}
          featureClickHandler={featureClick}
          showMarkerCollection={
            parseInt(urlParams.get("zoom") ?? "0", 10) >= 15
          }
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
