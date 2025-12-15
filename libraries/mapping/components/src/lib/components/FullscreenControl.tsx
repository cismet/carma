import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";
import {
  faCompress,
  faExpand,
  faExternalLinkSquareAlt,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tooltip } from "antd";
import { RefCallback, RefObject } from "react";
import UAParser from "ua-parser-js";

interface FullscreenControlProps {
  tourRef?: RefObject<HTMLButtonElement> | RefCallback<HTMLButtonElement>;
}

export const FullscreenControl = ({ tourRef }: FullscreenControlProps) => {
  const parser = new UAParser();
  const os = parser.getOS();
  const browser = parser.getBrowser();

  // Check if device is iOS based on OS name, device type, or user agent string
  let iOS =
    os.name === "iOS" ||
    (os.name === "Mac OS" && navigator.maxTouchPoints > 0) ||
    /iPad|iPhone|iPod/.test(navigator.userAgent);
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
      return <NewWindowControl tourRef={tourRef} />;
    } else {
      return null;
    }
  } else {
    return <SimpleFullscreenControl tourRef={tourRef} />;
  }
};

export const SimpleFullscreenControl = ({
  tourRef,
}: FullscreenControlProps) => {
  return (
    <Tooltip
      title={
        document.fullscreenElement ? "Vollbildmodus beenden" : "Vollbildmodus"
      }
      placement="right"
    >
      <ControlButtonStyler
        onClick={() => {
          if (document.fullscreenElement) {
            document.exitFullscreen();
          } else {
            document.documentElement.requestFullscreen();
          }
        }}
        ref={tourRef}
        dataTestId="full-screen-control"
      >
        <FontAwesomeIcon
          icon={document.fullscreenElement ? faCompress : faExpand}
        />
      </ControlButtonStyler>
    </Tooltip>
  );
};

export const NewWindowControl = ({ tourRef }: FullscreenControlProps) => {
  return (
    <Tooltip title="In neuem Fenster öffnen" placement="right">
      <ControlButtonStyler
        onClick={() => {
          window.open(window.location.href);
        }}
        dataTestId="new-window-control"
        ref={tourRef}
      >
        <FontAwesomeIcon icon={faExternalLinkSquareAlt} />
      </ControlButtonStyler>
    </Tooltip>
  );
};
