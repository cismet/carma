import {
  faCircle,
  faClock,
  faGlobe,
  faHouseFloodWater,
  faLayerGroup,
  faObjectGroup,
  faRuler,
  faSquare,
  faTableColumns,
  faWater,
  faTrain,
} from "@fortawesome/free-solid-svg-icons";

export const iconMap = {
  measurement: faRuler,
  highlight: faObjectGroup,
  comparing: faTableColumns,
  timeSeries: faClock,
  flowField: faWater,
  vehicleAnimation: faTrain,
  flood: faHouseFloodWater,
  background: faLayerGroup,
  ortho: faGlobe,
};

export const iconColorMap = {
  bäume: "green",
  gärten: "purple",
  ortho: "black",
};
