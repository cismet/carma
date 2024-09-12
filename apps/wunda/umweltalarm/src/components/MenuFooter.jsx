import { useContext } from "react";
import { UIDispatchContext } from "react-cismap/contexts/UIContextProvider";
import { version as reactCismapVersion } from "react-cismap/meta";
import { scroller } from "react-scroll";
// import { getApplicationVersion } from "../version";
import versionData from "../version.json";
import { getApplicationVersion } from "@carma-commons/utils";

const Footer = () => {
  const { setAppMenuActiveMenuSection } = useContext(UIDispatchContext);
  /*eslint jsx-a11y/anchor-is-valid: "off"*/

  return (
    <div style={{ fontSize: "11px" }}>
      <b>Hintergrundkarten</b>: Stadtkarte 2.0 © RVR | True Orthophoto 2022 ©
      Stadt Wuppertal | Openmaptiles basierte Vectorkarte (hosted by cismet){" "}
      <a
        className="pleaseRenderAsLink"
        onClick={() => {
          setAppMenuActiveMenuSection("help");
          scroller.scrollTo("Datengrundlage", { containerId: "myMenu" });
        }}
      >
        (Details und Nutzungsbedingungen)
      </a>
      <br />
      <div>
        <b>
          {document.title} {getApplicationVersion(versionData)}
        </b>{" "}
        powered by{" "}
        <a href="https://cismet.de/" target="_cismet">
          cismet GmbH
        </a>{" "}
        auf Basis von{" "}
        <a href="http://leafletjs.com/" target="_cismet">
          Leaflet
        </a>{" "}
        und{" "}
        <a href="https://github.com/cismet/carma" target="_cismet">
          carma
        </a>{" "}
        |{" "}
        <a
          target="_blank"
          rel="noopener noreferrer"
          href="https://cismet.de/datenschutzerklaerung.html"
        >
          Datenschutzerklärung
        </a>{" "}
        |{" "}
        <a
          target="_blank"
          rel="noopener noreferrer"
          href="https://cismet.de/impressum.html"
        >
          Impressum
        </a>
      </div>
    </div>
  );
};
export default Footer;
