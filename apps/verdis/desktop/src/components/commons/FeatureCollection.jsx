import { FeatureCollectionDisplay } from "react-cismap";
import { useDispatch, useSelector } from "react-redux";
import {
  getLeafletElement,
  getLockMap,
  setFlaechenSelected,
  setFrontenSelected,
  setGeneralGeometrySelected,
  setToolbarProperties,
} from "../../store/slices/mapping";
import {
  getBoundsForFeatureArray,
  getCenterAndZoomForBounds,
} from "../../tools/mappingTools";
import { useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { isEqual } from "lodash";
import {
  getIsLoading,
  getKassenzeichen,
  storeFlaechenId,
  storeFrontenId,
} from "../../store/slices/search";

const FeatureCollection = ({
  featureCollection,
  styler,
  markerStyle,
  showMarkerCollection,
  featureClickHandler,
}) => {
  const dispatch = useDispatch();
  const map = useSelector(getLeafletElement);
  const [urlParams, setUrlParams] = useSearchParams();
  const kassenzeichen = useSelector(getKassenzeichen);
  const kassenzeichenNummer = kassenzeichen?.kassenzeichennummer8;
  const [comparisonFeatureCollection, setComparisonFeatureCollection] =
    useState();
  const isLoading = useSelector(getIsLoading);
  const lockMap = useSelector(getLockMap);

  const myVirtHoverer = () => {
    const mouseoverHov = (feature) => {
      dispatch(setToolbarProperties(feature.properties));
    };

    const mouseoutHov = () => {
      dispatch(setToolbarProperties({}));
    };

    return { mouseoverHov, mouseoutHov };
  };
  myVirtHoverer.virtual = true;

  const setMap = () => {
    if (!lockMap) {
      const bb = getBoundsForFeatureArray(featureCollection);
      const { center, zoom } = getCenterAndZoomForBounds(map, bb);
      if (
        kassenzeichenNummer.toString() !== urlParams.get("kassenzeichen") ||
        (kassenzeichenNummer.toString() === urlParams.get("kassenzeichen") &&
          !urlParams.get("zoom"))
      ) {
        setUrlParams((prev) => {
          prev.set("lat", center.lat);
          prev.set("lng", center.lng);
          prev.set("zoom", zoom);
          prev.set("kassenzeichen", kassenzeichenNummer);
          return prev;
        });
      }
    }
  };

  useEffect(() => {
    if (
      !isEqual(featureCollection, comparisonFeatureCollection) &&
      !isLoading
    ) {
      setComparisonFeatureCollection(featureCollection);
      if (!urlParams.get("zoom")) {
        setTimeout(() => {
          setMap();
        }, 1000);
      } else {
        setMap();
      }
    }
  }, [featureCollection]);

  return (
    <FeatureCollectionDisplay
      featureCollection={featureCollection}
      style={styler}
      markerStyle={markerStyle}
      showMarkerCollection={showMarkerCollection || false}
      hoverer={myVirtHoverer}
      featureClickHandler={
        featureClickHandler ||
        ((e) => {
          const feature = e.target.feature;
          if (feature.selected) {
            const bb = getBoundsForFeatureArray([feature]);
            const { center, zoom } = getCenterAndZoomForBounds(map, bb);
            setUrlParams((prev) => {
              prev.set("zoom", zoom);
              prev.set("lat", center.lat);
              prev.set("lng", center.lng);
              return prev;
            });
          } else {
            switch (feature.featureType) {
              case "flaeche": {
                dispatch(storeFlaechenId(feature.id));
                dispatch(setFlaechenSelected({ id: feature.id }));

                break;
              }
              case "front": {
                dispatch(storeFrontenId(feature.properties.id));
                dispatch(setFrontenSelected({ id: feature.properties.id }));
                break;
              }
              case "general": {
                dispatch(
                  setGeneralGeometrySelected({
                    id: feature.properties.id,
                  })
                );
                break;
              }
              default: {
                console.log("no featureClickHandler set", e.target.feature);
              }
            }
          }
        })
      }
    />
  );
};

export default FeatureCollection;
