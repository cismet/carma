import {
  faCircle,
  faClock,
  faGlobe,
  faLayerGroup,
  faObjectGroup,
  faRuler,
  faSquare,
  faSun,
  faTableColumns,
} from "@fortawesome/free-solid-svg-icons";

export const iconMap = {
  measurement: faRuler,
  highlight: faObjectGroup,
  comparing: faTableColumns,
  timeSeries: faClock,
  "shadow-simulation": faSun,
  background: faLayerGroup,
  ortho: faGlobe,
};

export const iconColorMap = {
  bäume: "green",
  gärten: "purple",
  ortho: "black",
  "shadow-simulation": "#d97706",
};
