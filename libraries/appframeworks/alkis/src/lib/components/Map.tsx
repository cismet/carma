import React from "react";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import "react-cismap/topicMaps.css";
import "leaflet/dist/leaflet.css";
import { useContext, useEffect, useRef, useState } from "react";
import { FeatureCollectionDisplay } from "react-cismap";
import { stylerGeometrienStyle } from "../utils/helper";
import { getBoundsForFeatureArray } from "../utils/mappingTools";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent.js";
import { LatLngBounds } from "leaflet";
import { MapProps } from "../..";

const mockExtractor = (input) => {
  return {
    homeCenter: [51.27225612927373, 7.199918031692506],
    homeZoom: 16,
    featureCollection: [],
    styler: stylerGeometrienStyle,
  };
};

export const Map = <T,>({
  dataIn,
  extractor = mockExtractor,
  selectedFeature,
}: MapProps<T>) => {
  const data = extractor(dataIn);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [mapWidth, setMapWidth] = useState<number>(0);
  const [mapHeight, setMapHeight] = useState<number>(0);
  const customStyler = (feature) => {
    if (feature.id === selectedFeature && selectedFeature) {
      return { color: "blue", weight: 2 };
    }
    return data.styler(feature);
  };

  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);

  useEffect(() => {
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setMapWidth(wrapperRef.current?.offsetWidth ?? 0);
        setMapHeight(wrapperRef.current?.offsetHeight ?? 0);
      }
    });

    if (wrapperRef.current) {
      resizeObserver.observe(wrapperRef.current);
    }
    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  function fitMapBounds() {
    const map = routedMapRef?.leafletMap?.leafletElement;
    if (map == undefined) {
      return;
    } else {
    }
    let bb: LatLngBounds | undefined = undefined;
    if (data?.featureCollection && data?.featureCollection.length > 0) {
      bb = getBoundsForFeatureArray(data?.featureCollection);
    } else if (data?.allFeatures && data?.allFeatures.length > 0) {
      bb = getBoundsForFeatureArray(data?.allFeatures);
    }

    if (map && bb) {
      map.fitBounds(bb);
    }
  }

  useEffect(() => {
    if (routedMapRef?.leafletMap?.leafletElement && !selectedFeature) {
      const map = routedMapRef.leafletMap.leafletElement;
      map.scrollWheelZoom.disable();
      map.dragging.disable();
      setTimeout(() => {
        fitMapBounds();
      }, 500);
    }
  }, [routedMapRef, data]);

  useEffect(() => {
    if (selectedFeature !== null) {
      const map = routedMapRef?.leafletMap?.leafletElement;
      if (map) {
        const feature = data.featureCollection.filter(
          (f) => f.id === selectedFeature
        );

        map.eachLayer((layer) => {
          if (layer.feature && layer.feature.id === selectedFeature) {
            layer.setStyle({
              color: "blue",
              weight: 2,
            });
          }
        });

        const bounds = getBoundsForFeatureArray(feature);

        map.fitBounds(bounds);
      }
    }
  }, [selectedFeature]);

  return (
    <div ref={wrapperRef} className="h-80">
      <TopicMapComponent
        mapStyle={{
          width: mapWidth,
          height: mapHeight + 10,
        }}
        homeZoom={data.homeZoom}
        homeCenter={data.homeCenter}
        gazData={[]}
        gazetteerSearchControl={false}
        hamburgerMenu={false}
        fullScreenControl={false}
        zoomControls={false}
        pushToHistory={() => {}}
      >
        <FeatureCollectionDisplay
          featureCollection={data.featureCollection}
          style={customStyler}
        />
      </TopicMapComponent>
    </div>
  );
};
