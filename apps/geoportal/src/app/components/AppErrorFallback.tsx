import { useEffect, useState } from "react";
import StackTrace from "stacktrace-js";
import localforage from "localforage";
import { Col, Container, Row } from "react-bootstrap";
import versionData from "../../version.json";
import { getApplicationVersion } from "@carma-commons/utils";
import store from "../store";
import { Button } from "antd";

const AppErrorFallback = ({ error, resetErrorBoundary }) => {
  const br = "\n";
  const [errorStack, setErrorStack] = useState<{
    errorStack?: StackTrace.StackFrame[];
    stringifiedStack?: string;
  }>({});
  const version = getApplicationVersion(versionData);

  useEffect(() => {
    StackTrace.fromError(error).then((errorStack) => {
      const stringifiedStack = errorStack
        .map(function (sf) {
          return sf.toString();
        })
        .join("\n");
      setErrorStack({ errorStack, stringifiedStack });
    });
  }, [error]);

  const state = store.getState();
  const stateToLog = {
    cesium: state.cesium,
    features: state.features,
    mapping: state.mapping,
    measurements: state.measurements,
    ui: state.ui,
  };

  let mailToHref =
    "mailto:david.glogaza@cismet.de?subject=Fehler%20im%20Geoportal%20Wuppertal" +
    "&body=" +
    encodeURI(
      `Sehr geehrte Damen und Herren,${br}${br}` +
        `während der benutzung vom Geoportal Wuppertal ist der untenstehende Fehler passiert: ` +
        `${br}${br}` +
        `[Tragen Sie hier bitte ein, was Sie gemacht haben oder was Ihnen aufgefallen ist.]${br}` +
        `${br}${br}` +
        `Mit freundlichen Grüßen${br}` +
        `${br}${br}${br}` +
        `[Bitte überschreiben Sie den nachfolgenden Block mit Ihren Kontaktinformationen, damit wir ggf mit Ihnen Kontakt aufnehmen können]` +
        `${br}${br}` +
        `Vor- und Nachname${br}` +
        `ggf E-Mail-Adresse${br}` +
        `ggf. Telefonnummer${br}${br}` +
        `!! Mit Absenden dieser E-Mail erkläre ich mein Einverständnis mit der zweckgebundenen Verarbeitung meiner personenbezogenen Daten gemäß der Information nach Artikel 13 bzw. Art. 14 Datenschutz-Grundverordnung (DS-GVO).` +
        `${br}${br}` +
        `----------------------${br}` +
        `${error.message}${br}` +
        `----------------------${br}` +
        `${errorStack?.stringifiedStack}${br}` +
        `----------------------${br}`,
    );

  let attachmentText =
    `----------------------${br}` +
    `${error?.message}${br}` +
    `----------------------${br}` +
    `${errorStack?.stringifiedStack}${br}` +
    `----------------------${br}` +
    `${navigator.userAgent}${br}` +
    `${br}${br}` +
    `----------------------${br}` +
    `STATE${br}` +
    `----------------------${br}` +
    `${JSON.stringify(stateToLog, null, 2)}${br}` +
    `----------------------${br}`;

  return (
    <div
      style={{
        backgroundColor: "white",
        width: "100%",
        height: "100%",
        minHeight: "100vh",
        background: "url('/geoportal/images/error.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "0px",
          left: "0px",
          width: "100%",
          height: "140px",
          backgroundColor: "rgba(0,0,0,0.4)",
        }}
      />

      <div
        style={{
          position: "absolute",
          bottom: "0px",
          left: "0px",
          width: "100%",
        }}
      >
        <div
          style={{
            fontSize: "9px",
            textAlign: "right",
            color: "rgba(256,256,256,0.5)",
            margin: 4,
          }}
        >
          {version}
        </div>
      </div>
      {/* <Container> */}
      <div style={{ marginRight: 25, marginLeft: 25 }}>
        <Row className="show-grid">
          <Col style={{ marginTop: 30 }} xs={12} md={12}>
            <h1 style={{ color: "white" }}>
              <img alt="" width={180} src="/images/wuppertal-white.svg" />
            </h1>
            <h2 style={{ color: "white" }}>Geoportal Wuppertal</h2>
          </Col>
        </Row>
      </div>
      {/* </Container> */}
      <div style={{ margin: 25, overflow: "auto" }}>
        <h2>Es ist ein Fehler aufgetreten. Das tut uns leid. ¯\_(ツ)_/¯</h2>

        <div
          style={{ overflow: "auto", height: "20%", backgroundColor: "#fff9" }}
        >
          <h3>
            <pre style={{ backgroundColor: "#fff9" }}>{error.message}</pre>
          </h3>
          <pre style={{ height: "80%", backgroundColor: "#fff9" }}>
            {errorStack?.stringifiedStack ||
              "weiter Informationen werden geladen ..."}
          </pre>

          <br />
        </div>

        <h4 style={{ marginTop: 50 }}>
          Sie können die Entwickler unterstützen, indem Sie den Fehler an uns
          melden.
        </h4>

        <h4>
          Bitte schicken Sie uns dazu eine <a href={mailToHref}>Mail</a> und
          fügen Sie bitte den Report, den Sie mit dem orangenen Button erzeugen
          können, als Anhang hinzu.
          <br />
          <br />
          <Button
            style={{ marginLeft: 20, backgroundColor: "orange" }}
            onClick={() => {
              var dataStr =
                "data:text/plain;charset=utf-8," +
                encodeURIComponent(attachmentText);
              var downloadAnchorNode = document.createElement("a");
              downloadAnchorNode.setAttribute("href", dataStr);
              downloadAnchorNode.setAttribute(
                "download",
                "problemReport.geoportal-wuppertal.txt",
              );
              window.document.body.appendChild(downloadAnchorNode); // required for firefox
              downloadAnchorNode.click();
              downloadAnchorNode.remove();
            }}
          >
            Problemreport erzeugen (sehr groß)
          </Button>
        </h4>
        <br />
        <h4>
          Mit dem folgenden Button können Sie den Zustand der Applikation
          verändern:
          <br /> <br />
          <Button
            style={{ marginLeft: 20, backgroundColor: "yellow" }}
            onClick={() => {
              let confirmation = window.confirm(
                "Mit dieser Aktion werden die gespeicherten Einstellungen wie ausgewählte Layer," +
                  " Messungen, u.ä. gelöscht.\n\n" +
                  "Sind Sie sicher, dass Sie Ihre Einstellungen zurücksetzen wollen?",
              );
              // console.log("confirmation: " + confirmation);
              if (confirmation) {
                console.info("resetting settings");
                localforage.clear();
              }
            }}
          >
            Zurücksetzen des gespeicherten Zustandes
          </Button>
        </h4>
      </div>
    </div>
  );
};

export default AppErrorFallback;
