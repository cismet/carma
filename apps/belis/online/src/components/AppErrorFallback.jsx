import localforage from "localforage";
import React, { useEffect } from "react";
import { Col, Container, Row } from "react-bootstrap";
import { useDispatch } from "react-redux";
import StackTrace from "stacktrace-js";

import { getBelisVersion } from "../constants/versions";
import store from "../core/store";
import { CONNECTIONMODE, setConnectionMode } from "../core/store/slices/app";
import { deleteCacheDB } from "../core/store/slices/cacheControl";
import {
  downloadTasks,
  truncateActionTables,
} from "../core/store/slices/offlineActionDb";

const FallbackComponent = ({ error, resetErrorBoundary }) => {
  const br = "\n";
  const [errorStack, setErrorStack] = React.useState({});
  const dispatch = useDispatch();

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
    app: state.app,
    auth: state.auth,
    background: state.background,
    cacheControl: state.cacheControl,
    featureCollection: state.featureCollection,
    gazetteerData: state.gazetteerData,
    mapInfo: state.mapInfo,
    paleMode: state.paleMode,
    search: state.search,
    team: state.team,
    zoom: state.zoom,
  };

  let mailToHref =
    "mailto:th@cismet.de?subject=Fehler%20in%20BelIS-Online" +
    "&body=" +
    encodeURI(
      `Sehr geehrte Damen und Herren,${br}${br}` +
        `während der benutzung von BelIS-Online ist der untenstehende Fehler passiert: ` +
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
        `----------------------${br}`
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
        background: "url('/images/error.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        backgroundOpacity: 0.5,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "0px",
          left: "0px",
          width: "100%",
          height: "200px",
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
          {getBelisVersion()}
        </div>
      </div>
      <Container>
        <Row className="show-grid">
          <Col style={{ marginTop: 30 }} xs={12} md={12}>
            <h1 style={{ color: "white" }}>
              <img alt="" width={180} src="/images/wuppertal-white.svg" />
            </h1>
            <h2 style={{ color: "white" }}>BelIS - online</h2>
            <h3 style={{ color: "white" }}>Beleuchtungsinformation</h3>
          </Col>
        </Row>
        <Row>
          <Col style={{ marginTop: 30 }} xs={5} md={5}>
            <div
              style={{
                position: "fixed",
                top: "2%",
                right: "8%",
              }}
            >
              <h4 style={{ color: "white" }}>Stadt Wuppertal</h4>
              <h4 style={{ color: "white" }}>Straßen und Verkehr</h4>
              <h4 style={{ color: "white" }}>104.25 Öffentliche Beleuchtung</h4>
              <h4 style={{ color: "white" }}>
                {/* <a style={{ color: "white" }} href='mailto:th@cismet.de'>
                  regengeld@stadt.wuppertal.de
                </a> */}
              </h4>
            </div>
          </Col>
        </Row>
      </Container>
      <div style={{ margin: 25, overflow: "auto" }}>
        <h2>Es ist ein Fehler aufgetreten. Das tut uns leid. ¯\_(ツ)_/¯</h2>

        <div
          style={{ overflow: "auto", height: "20%", backgroundColor: "#fff9" }}
        >
          <h3>
            <pre style={{ backgroundColor: "#fff9" }}>{error.message}</pre>
          </h3>
          {/* <pre style={{ backgroundColor: '#fff4', color: 'white' }}>
							{this.state.error.stack}
						</pre>
						<pre style={{ backgroundColor: '#fff4', color: 'white' }}>
							{this.state.errorInfo.componentStack}
						</pre> */}
          <pre style={{ height: "80%", backgroundColor: "#fff9" }}>
            {errorStack?.stringifiedStack ||
              "weiter Informationen werden geladen ..."}
          </pre>
          {/* <button style={{ marginTop: 25 }} onClick={resetErrorBoundary}>
							Einfach nochmal probieren (hilf eigentlich nie)
						</button> */}
          <br />
        </div>
        {/* <button style={{ marginTop: 25 }} onClick={resetErrorBoundary}>
					Einfach nochmal probieren (hilf eigentlich nie)
				</button> */}

        <h4 style={{ marginTop: 50 }}>
          Sie können die Entwickler unterstützen, indem Sie den Fehler an uns
          melden.
        </h4>

        <h4>
          Bitte schicken Sie uns dazu eine <a href={mailToHref}>Mail</a> und
          fügen sie bitte den Report, den Sie mit dem orangenen Button erzeugen
          können, als Anhang hinzu.
          <br />
          <br />
          <button
            style={{ marginLeft: 20, backgroundColor: "orange" }}
            onClick={() => {
              var dataStr =
                "data:text/plain;charset=utf-8," +
                encodeURIComponent(attachmentText);
              var downloadAnchorNode = document.createElement("a");
              downloadAnchorNode.setAttribute("href", dataStr);
              downloadAnchorNode.setAttribute(
                "download",
                "problemReport.belis-online.txt"
              );
              window.document.body.appendChild(downloadAnchorNode); // required for firefox
              downloadAnchorNode.click();
              downloadAnchorNode.remove();
            }}
          >
            Problemreport erzeugen (sehr groß)
          </button>
          <button
            style={{ marginLeft: 20, backgroundColor: "green" }}
            onClick={() => {
              dispatch(downloadTasks());
            }}
          >
            Taskliste speichern
          </button>
        </h4>
        <br />
        <h4>
          Mit den folgenden Buttons können Sie den Zustand der Applikation
          verändern:
          <br /> <br />
          <button
            style={{ marginLeft: 20, backgroundColor: "yellow" }}
            onClick={() => {
              let confirmation = window.confirm(
                "Mit dieser Aktion werden die gespeicherten Einstellungen wie Anmeldetoken, Modus " +
                  " ausgewähltes Team, Hintergrund, u.ä. gelöscht.\n\n" +
                  "Sind Sie sicher, dass Sie Ihre Einstellungen zurücksetzen wollen?"
              );
              // console.log("confirmation: " + confirmation);
              if (confirmation) {
                console.log("resetting settings");
                localforage.clear();
              }
            }}
          >
            Zurücksetzen des gespeicherten Zustandes
          </button>
          <button
            style={{ marginLeft: 20, backgroundColor: "yellow" }}
            onClick={() => {
              let confirmation = window.confirm(
                "Mit dieser Aktion werden die im Cache gespeicherten " +
                  "Fachdaten gelöscht und der Modus der Applikation auf Live-Daten gesetzt.\n\n" +
                  "Sind Sie sicher, dass Sie die gespeicherten Fachdaten löschen wollen?"
              );
              if (confirmation) {
                console.log("deleting cache");
                dispatch(setConnectionMode(CONNECTIONMODE.LIVE));
                dispatch(deleteCacheDB());
                window.location.reload();
              }
            }}
          >
            Löschen der lokalen Daten
          </button>
          <button
            style={{ marginLeft: 20, backgroundColor: "yellow" }}
            onClick={() => {
              let confirmation = window.confirm(
                "Mit dieser Aktion werden die in der Taskliste gespeicherten Aktion" +
                  " gelöscht. Bitte speichern Sie ggf. vorher die Aktionen über den grünen Button *Taskliste speichern* \n\n" +
                  "(Schon auf dem Server gespeicherte Aktionen erscheinen, bei vorhandener Internetverbindung, wieder in Ihrem Browser)\n\n" +
                  "Sind Sie sicher, dass Sie die gespeicherten Aktionen löschen wollen?"
              );
              if (confirmation) {
                console.log("deleting action tables");
                dispatch(truncateActionTables());
              }
            }}
          >
            Zurücksetzen der Taskliste (bitte vorher speichern)
          </button>
        </h4>
      </div>
    </div>
  );
};
export default FallbackComponent;
