import {
  faCircle,
  faClock,
  faGlobe,
  faHouseFloodWater,
  faLayerGroup,
  faObjectGroup,
  faPencil,
  faRuler,
  faSquare,
  faSun,
  faTableColumns,
  faWater,
  faTrain,
} from "@fortawesome/free-solid-svg-icons";

export const iconMap = {
  measurement: faRuler,
  highlight: faObjectGroup,
  drawing: faPencil,
  comparing: faTableColumns,
  timeSeries: faClock,
  flowField: faWater,
  vehicleAnimation: faTrain,
  flood: faHouseFloodWater,
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
