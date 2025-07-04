import { useContext, useEffect, useRef, useState } from "react";
import { TopicMapStylingContext } from "react-cismap/contexts/TopicMapStylingContextProvider";
import { TopicMapDispatchContext } from "react-cismap/contexts/TopicMapContextProvider";
import { useNavigate, useLocation } from "react-router-dom";

interface BelisMapProps {
  refRoutedMap: any;
  width: number;
  height: number;
  jwt: string;
}

export function BelisMap({ refRoutedMap, width, height, jwt }: BelisMapProps) {
  const mapRef = refRoutedMap?.current?.leafletMap?.leafletElement;
  const blockingTime = 1000;
  const [blockLoading, setBlockLoading] = useState<boolean>(false);
  const [indexInitialized, setIndexInitialized] = useState<boolean>(false);
  const [mapBoundsAndSize, setMapBoundsAndSize] = useState();

  const [indexInitializationRequested, setIndexInitializationRequested] =
    useState<boolean>(false);
  const { selectedBackground, backgroundConfigurations } = useContext<
    typeof TopicMapStylingContext
  >(TopicMapStylingContext);
  const { setRoutedMapRef } = useContext<typeof TopicMapDispatchContext>(
    TopicMapDispatchContext
  );
  const timeoutHandlerRef = useRef(null);
  const navigate = useNavigate();
  const browserlocation = useLocation();

  const boundsFromMapRef = mapRef?.getBounds() || null;
  const sizeFromMapRef = mapRef?.getSize() || null;

  useEffect(() => {
    // setMapBoundsAndSize((old) => {
    //   const mapBounds = mapRef?.getBounds();
    //   const mapSize = mapRef?.getSize();
    //   if (
    //     old === undefined ||
    //     JSON.stringify(old.mapBounds) !== JSON.stringify(mapBounds) ||
    //     JSON.stringify(old.mapSize) !== JSON.stringify(mapSize)
    //   ) {
    //     old = {
    //       mapBounds,
    //       mapSize,
    //     };
    //     dispatch(setBounds(mapBounds));
    //   }
    //   return old;
    // });
    if (!mapRef) return;

    setMapBoundsAndSize((old) => {
      let next = old;

      try {
        const pane = mapRef.getPane && mapRef.getPane("mapPane");
        if (!pane || !pane._leaflet_pos) {
          return old;
        }

        const mapBounds = mapRef.getBounds();
        const mapSize = mapRef.getSize();

        if (
          old === undefined ||
          JSON.stringify(old.mapBounds) !== JSON.stringify(mapBounds) ||
          JSON.stringify(old.mapSize) !== JSON.stringify(mapSize)
        ) {
          next = { mapBounds, mapSize };
          // dispatch(setBounds(mapBounds));
        }
      } catch (_e) {
        return old;
      }

      return next;
    });
  }, [mapRef, sizeFromMapRef, boundsFromMapRef]);

  useEffect(() => {
    if (refRoutedMap?.current !== null) {
      setRoutedMapRef(refRoutedMap.current);
    }
  }, [refRoutedMap]);

  const mapStyle = {
    height,
    width,
    cursor: "pointer",
    clear: "both",
    display: "flex",
  };

  console.log("BelisMap");
  return <div>Belis library</div>;
}
