import { PositionOverlayHelper } from "../..";

export function getContainerPosition(alignment: PositionOverlayHelper) {
  let styleElement: { [key: string]: string } = {};
  switch (alignment) {
    case "center":
      styleElement.transform = "translate(0, 0)";
      break;
    case "top":
      styleElement.transform = "translate(0, -100%)";
      break;
    case "left":
      styleElement.transform = "translate(-100%, 0)";
      break;
    case "right":
      styleElement.transform = "translate(100%, 0)";
      break;
    case "bottom":
      styleElement.transform = "translate(0, 100%)";
      break;
    default:
      console.log("yyy element position");
  }

  return styleElement;
}

export function getElementPosition(alignment: PositionOverlayHelper) {
  let styleElement: { [key: string]: string | number } = {};
  switch (alignment) {
    case "center":
      styleElement.top = "50%";
      styleElement.left = "50%";
      styleElement.transform = "translate(-50%, -50%)";
      break;
    case "top":
      styleElement.top = "0";
      styleElement.transform = "translate(50%, 0)";
      break;
    case "left":
      styleElement.top = "50%";
      styleElement.transform = "translate(0, -50%)";
      styleElement.left = 0;
      break;
    case "right":
      styleElement.top = "50%";
      styleElement.transform = "translate(0, -50%)";
      styleElement.right = 0;
      break;
    case "bottom":
      styleElement.bottom = 0;
      styleElement.transform = "translate(50%, 0)";
      break;
    default:
      console.log("yyy content position");
  }

  return styleElement;
}
