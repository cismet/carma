import {
  faCircle,
  faClock,
  faGlobe,
  faLayerGroup,
  faObjectGroup,
  faPencil,
  faRuler,
  faSquare,
  faTableColumns,
} from "@fortawesome/free-solid-svg-icons";

export const iconMap = {
  measurement: faRuler,
  highlight: faObjectGroup,
  drawing: faPencil,
  comparing: faTableColumns,
  timeSeries: faClock,
  background: faLayerGroup,
  ortho: faGlobe,
};

export const iconColorMap = {
  bäume: "green",
  gärten: "purple",
  ortho: "black",
};
