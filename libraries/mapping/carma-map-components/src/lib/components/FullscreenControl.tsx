import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";
import {
  faCompress,
  faExpand,
  faExternalLinkSquareAlt,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import UAParser from "ua-parser-js";

export const FullscreenControl = () => {
  const parser = new UAParser();
  const os = parser.getOS();
  const browser = parser.getBrowser();

  // Check if device is iOS based on OS name
  let iOS = os.name === "iOS";
  let inIframe = window.self !== window.top;
  let simulateInIframe = false;
  let simulateInIOS = false;
  //   let iosClass = "no-iOS-device"; //not needed anymore. came from reactcismap legacy and was used there as a indicator class for the wrapping div
  let fullscreenCapable =
    document.fullscreenEnabled === true ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (document as any).webkitFullscreenEnabled === true ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (document as any).mozFullScreenEnabled === true ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (document as any).msFullscreenEnabled === true;
  // Determine if we should use iOS class based on device detection
  const internetExplorerVersion =
    browser.name && browser.name.includes("IE")
      ? parseFloat(browser.version || "-1")
      : -1;
  const internetExplorer = internetExplorerVersion !== -1;

  if (simulateInIOS || iOS || internetExplorer || !fullscreenCapable) {
    // iosClass = "iOS-device";
    if (simulateInIframe || inIframe) {
      return <NewWindowControl />;
    } else {
      return null;
    }
  } else {
    return <SimpleFullscreenControl />;
  }
};

export const SimpleFullscreenControl = () => {
  return (
    <ControlButtonStyler
      title={
        document.fullscreenElement ? "Vollbildmodus beenden" : "Vollbildmodus"
      }
      onClick={() => {
        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else {
          document.documentElement.requestFullscreen();
        }
      }}
      dataTestId="full-screen-control"
    >
      <FontAwesomeIcon
        icon={document.fullscreenElement ? faCompress : faExpand}
      />
    </ControlButtonStyler>
  );
};

export const NewWindowControl = () => {
  return (
    <ControlButtonStyler
      title="In neuem Fenster öffnen"
      onClick={() => {
        window.open(window.location.href);
      }}
      dataTestId="new-window-control"
    >
      <FontAwesomeIcon icon={faExternalLinkSquareAlt} />
    </ControlButtonStyler>
  );
};
