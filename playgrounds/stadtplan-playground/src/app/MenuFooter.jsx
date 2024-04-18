import React, { useContext } from "react";
import { UIDispatchContext } from "react-cismap/contexts/UIContextProvider";
import { getApplicationVersion } from "./version";
import { version as reactCismapVersion } from "react-cismap//meta";
import { Link, scroller } from "react-scroll";

const Footer = () => {
  const { setAppMenuActiveMenuSection } = useContext(UIDispatchContext);

  return (
    <div style={{ fontSize: "11px" }}>
      <b>Hintergrundkarten</b>: Stadtkarte 2.0 © RVR | True Orthophoto 2022 © Stadt Wuppertal{" "}
      <a
        className='pleaseRenderAsLink'
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
          {document.title} v{getApplicationVersion()}
        </b>
        :{" "}
        <a href='https://cismet.de/' target='_cismet'>
          cismet GmbH
        </a>{" "}
        auf Basis von{" "}
        <a href='http://leafletjs.com/' target='_more'>
          Leaflet
        </a>{" "}
        und{" "}
        <a href='https://cismet.de/#refs' target='_cismet'>
          cids | react-cismap v{reactCismapVersion}
        </a>{" "}
        |{" "}
        <a
          target='_blank'
          rel='noopener noreferrer'
          href='https://cismet.de/datenschutzerklaerung.html'
        >
          Datenschutzerklärung (Privacy Policy)
        </a>
      </div>
    </div>
  );
};
export default Footer;
