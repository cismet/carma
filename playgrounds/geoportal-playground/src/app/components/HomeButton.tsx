import { useContext, useEffect } from "react";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import L, { Control, Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";

type HomeButtonProps = {
  home?: {
    position: [number, number];
    zoom: number;
  };
};

const HomeButton = ({
  home = { position: [51.272034, 7.19997], zoom: 18 },
}: HomeButtonProps) => {
  const ctx = useContext(TopicMapContext) as typeof TopicMapContext;
  const { realRoutedMapRef: routedMapRef } = ctx;

  useEffect(() => {
    if (routedMapRef?.current?.leafletMap?.leafletElement) {
      const leafletElement = routedMapRef.current.leafletMap.leafletElement;
      // Create custom control instance
      const homeControl = new Control({ position: "topleft" });

      homeControl.onAdd = function (map: LeafletMap) {
        const container = L.DomUtil.create(
          "div",
          "leaflet-bar leaflet-control"
        );
        const button = L.DomUtil.create(
          "a",
          "leaflet-control-button",
          container
        );
        button.innerHTML = '<i class="fas fa-home fa-lg"></i>';
        L.DomEvent.disableClickPropagation(button);
        L.DomEvent.on(button, "click", () => {
          map.setView(home.position, home.zoom, {
            animate: true,
          });
        });

        return container;
      };

      console.debug("HOOK: adding home button to leaflet map");
      homeControl.addTo(leafletElement);
      return () => {
        console.debug("HOOK: removing home button");
        homeControl.remove();
      };
    }
  }, [routedMapRef, home]);

  return null;
};

export default HomeButton;
