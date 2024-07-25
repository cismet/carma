import { MapControl } from "react-leaflet";
import L from "leaflet";
import "leaflet.locatecontrol/dist/L.Control.Locate.min.css";
// import "leaflet.locatecontrol";
import "./L.Control.Locate.cjs";

export default class Control extends MapControl {
  createLeafletElement(props) {
    const { options, startDirectly } = props;
    const { map } = this.context;

    const _options = {
      strings: {
        title: "Mein Standort",
        metersUnit: "Meter",
        feetUnit: "feet",
        popup: "Ihre reale Position kann bis zu {distance} {unit} von diesem Punkt abweichen.",
        outsideMapBoundsMsg: "Sie befinden sich außerhalb der Kartengrenzen.",
      },
      locateOptions: {
        enableHighAccuracy: true,
      },
      showCompass: true,
      setView: "untilPan",
      keepCurrentZoomLevel: "true",
      flyTo: true,
      ...options,
    };

    const lc = L.control.locate(_options).addTo(map);

    if (startDirectly)
      setTimeout(() => {
        lc.start();
      }, 1000);

    return lc;
  }

  componentDidMount() {
    const { map } = this.context;
    this.leafletElement.addTo(map);
  }
}
