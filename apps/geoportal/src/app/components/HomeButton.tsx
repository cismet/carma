import { useEffect } from "react";
import { useSelector } from "react-redux";

import L from "leaflet";

import { getLeafletElement } from "../store/slices/topicmap";

import "leaflet/dist/leaflet.css";

const HomeButton = () => {
  const leafletElement = useSelector(getLeafletElement);

  useEffect(() => {
    if (leafletElement) {
      // @ts-expect-error figure out proper type here
      L.Control.Button = L.Control.extend({
        options: {
          position: "topleft",
        },
        onAdd: function () {
          const container = L.DomUtil.create(
            "div",
            "leaflet-bar leaflet-control",
          );
          const button = L.DomUtil.create(
            "a",
            "leaflet-control-button",
            container,
          );
          button.innerHTML = '<i class="fas fa-home fa-lg"></i>';
          L.DomEvent.disableClickPropagation(button);
          // TODO move home to config and sync with 3d
          L.DomEvent.on(button, "click", () => {
            leafletElement.setView([51.27203462681256, 7.199971675872803], 18, {
              animate: true,
            });
          });
          return container as unknown;
        },
        onRemove: () => {
          // @ts-expect-error figure out proper type here
          return this.div;
        },
      });

      // @ts-expect-error figure out proper type here
      const home = new L.Control.Button();
      home.addTo(leafletElement);
    }
  }, [leafletElement]);
  return <div></div>;
};

export default HomeButton;
