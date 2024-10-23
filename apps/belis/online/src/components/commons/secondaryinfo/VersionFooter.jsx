import { getBelisVersion } from "../../../constants/versions";
import { version as reactCismapVersion } from "react-cismap/meta";

const VersionFooter = ({ linkStyling }) => (
  <>
    <b>
      {document.title} v{getBelisVersion()}
    </b>
    :{" "}
    <a style={linkStyling} href='https://cismet.de/' target='_cismet'>
      cismet GmbH
    </a>{" "}
    auf Basis von{" "}
    <a style={linkStyling} href='http://leafletjs.com/' target='_more'>
      Leaflet
    </a>{" "}
    und{" "}
    <a style={linkStyling} href='https://cismet.de/#refs' target='_cismet'>
      cids | react-cismap v{reactCismapVersion}
    </a>{" "}
    |{" "}
    <a
      style={linkStyling}
      target='_blank'
      rel='noopener noreferrer'
      href='https://cismet.de/datenschutzerklaerung.html'
    >
      Datenschutzerklärung (Privacy Policy)
    </a>
  </>
);

export default VersionFooter;
