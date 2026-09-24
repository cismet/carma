import {
  faBicycle,
  faCar,
  faCircle,
  faClock,
  faGlobe,
  faHouseFloodWater,
  faLayerGroup,
  faObjectGroup,
  faPencil,
  faRoute,
  faRuler,
  faSquare,
  faSun,
  faTableColumns,
  faWalking,
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
  routing: faRoute,
  // how a route is travelled; the navigation row shows the one its route was computed with
  car: faCar,
  bike: faBicycle,
  walk: faWalking,
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
