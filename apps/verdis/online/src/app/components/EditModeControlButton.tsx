import React, { useEffect } from "react";
import L from "leaflet";
import "leaflet-editable";

interface EditModeControlButtonProps {
  mapRef: React.RefObject<any>;
  featuresInEditmode: boolean;
  onFeatureChange: (editing: boolean) => void;
  position?: L.ControlPosition;
  html?: string;
  kind?: string;
  selectedFeatureId: string | undefined;
}

const EditModeControlButton: React.FC<EditModeControlButtonProps> = ({
  mapRef,
  featuresInEditmode,
  onFeatureChange,
  position = "topleft",
  html = '<i class="fas fa-edit"></i>',
  kind = "xxx",
  selectedFeatureId,
}) => {
  useEffect(() => {
    const map = mapRef.current.leafletMap.leafletElement;

    if (!map) return;

    if (!map.editTools) {
      map.editTools = new L.Editable(map);
    }

    const ControlClass = L.Control.extend({
      options: { position, kind, html },
      onAdd() {
        const div = L.DomUtil.create("div", "leaflet-control leaflet-bar");
        const link = L.DomUtil.create("a", "", div);
        link.href = "#";
        link.title = "Verändern der selektierten Anmerkung";
        link.innerHTML = featuresInEditmode
          ? `<span style="padding:2px 4px; border-radius:4px; border:3px solid #008AFA;">
               ${html}
             </span>`
          : html;

        L.DomEvent.on(link, "click", L.DomEvent.stop).on(link, "click", () =>
          onFeatureChange(!featuresInEditmode)
        );
        L.DomEvent.disableClickPropagation(div);
        return div;
      },
    });

    const control = new ControlClass();
    map.addControl(control);

    console.log("xxx selectedFeatureId", selectedFeatureId);

    map.eachLayer((layer) => {
      if (
        layer.feature?.properties?.type === "annotation" &&
        layer.feature !== undefined
      ) {
        if (layer.feature?.id === selectedFeatureId) {
          layer.enableEdit();
        } else {
          layer.disableEdit();
        }
      }
    });

    return () => {
      map.removeControl(control);
    };
  }, [mapRef, featuresInEditmode, onFeatureChange, selectedFeatureId]);

  return null;
};

export default EditModeControlButton;
