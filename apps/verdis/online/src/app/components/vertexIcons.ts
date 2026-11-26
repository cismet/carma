import L from "leaflet";
import "leaflet-editable";

// leaflet-editable ships no typings; it sets the icon size inline, so CSS alone can't change it
type IconClass = { mergeOptions: (options: L.DivIconOptions) => void };
const { VertexIcon, TouchVertexIcon } = (
  L as unknown as {
    Editable: { VertexIcon: IconClass; TouchVertexIcon: IconClass };
  }
).Editable;

VertexIcon.mergeOptions({ iconSize: L.point(10, 10) });
// used on phones and tablets, where vertices must be easy to grab with a finger
TouchVertexIcon.mergeOptions({ iconSize: L.point(18, 18) });
