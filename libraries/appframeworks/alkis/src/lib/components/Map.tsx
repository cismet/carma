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

export const Map = <T,>({ dataIn, extractor = mockExtractor }: MapProps<T>) => {
  const data = extractor(dataIn);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [mapWidth, setMapWidth] = useState<number>(0);
  const [mapHeight, setMapHeight] = useState<number>(0);

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
      // console.log("xxx map is undefined");
      return;
    } else {
    }
    let bb: LatLngBounds | undefined = undefined;
    if (data?.featureCollection && data?.featureCollection.length > 0) {
      // console.log("xxx will use featureCollection", data?.featureCollection);

      bb = getBoundsForFeatureArray(data?.featureCollection);
    } else if (data?.allFeatures && data?.allFeatures.length > 0) {
      // console.log("xxx will use allFeatures", data?.allFeatures);
      bb = getBoundsForFeatureArray(data?.allFeatures);
    }

    if (map && bb) {
      map.fitBounds(bb);
      // console.log("xxx fitBounds");
    }
  }

  useEffect(() => {
    console.log("xxx routedMapRef");
    if (routedMapRef?.leafletMap?.leafletElement) {
      const map = routedMapRef.leafletMap.leafletElement;
      map.scrollWheelZoom.disable();
      map.dragging.disable();
      setTimeout(() => {
        fitMapBounds();
      }, 500);
    }
  }, [routedMapRef, data]);

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
      >
        <FeatureCollectionDisplay
          featureCollection={data.featureCollection}
          style={data.styler}
        />
      </TopicMapComponent>
    </div>
  );
};
