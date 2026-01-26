import {
  faCar,
  faWalking,
  faBicycle,
  type IconDefinition,
} from "@fortawesome/free-solid-svg-icons";

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours} Std ${minutes} Min`;
  }
  return `${minutes} Min`;
}

export function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }
  return `${Math.round(meters)} m`;
}

export function getModeIcon(mode: string): IconDefinition {
  switch (mode?.toLowerCase()) {
    case "car":
      return faCar;
    case "walk":
    case "walking":
      return faWalking;
    case "bike":
    case "bicycle":
      return faBicycle;
    default:
      return faCar;
  }
}

export function getModeLabel(mode: string): string {
  switch (mode?.toLowerCase()) {
    case "car":
      return "Auto";
    case "walk":
    case "walking":
      return "Zu Fuß";
    case "bike":
    case "bicycle":
      return "Fahrrad";
    default:
      return mode || "Route";
  }
}
