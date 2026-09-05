import {
  faCircle,
  faClock,
  faGlobe,
  faLayerGroup,
  faObjectGroup,
  faRuler,
  faSquare,
  faTableColumns,
  faWater,
} from "@fortawesome/free-solid-svg-icons";

export const iconMap = {
  measurement: faRuler,
  highlight: faObjectGroup,
  comparing: faTableColumns,
  timeSeries: faClock,
  flowField: faWater,
  background: faLayerGroup,
  ortho: faGlobe,
};

export const iconColorMap = {
  bäume: "green",
  gärten: "purple",
  ortho: "black",
};
