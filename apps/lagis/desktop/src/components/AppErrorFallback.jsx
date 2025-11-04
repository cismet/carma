import { useEffect, useState, useMemo } from "react";
import StackTrace from "stacktrace-js";
import localforage from "localforage";
import { Button, Collapse, Typography, Divider, Space, Row, Col } from "antd";
import { isMobile, isTablet, isDesktop } from "react-device-detect";
import UAParser from "ua-parser-js";
import { getApplicationVersion } from "@carma-commons/utils";
import store from "../store";
import wupperwurm from "../assets/wupperwurm.svg";
// Import version data - adjust path as needed
// import versionData from "../version.json";
const baseUrl = window.location.origin + window.location.pathname;

const AppErrorFallback = ({ error, resetErrorBoundary }) => {
  const br = "\n";
  const [errorStack, setErrorStack] = useState({
    errorStack: undefined,
    stringifiedStack: undefined,
  });

  const parser = useMemo(() => new UAParser(), []);
  const isMobileUA = parser.getDevice().type === "mobile";
  const isTabletUA = parser.getDevice().type === "tablet";
  const isDesktopUA = !isMobileUA && !isTabletUA;
  const isTouchDevice =
    typeof window !== "undefined" &&
    ("ontouchstart" in window || navigator.maxTouchPoints > 0);

  // Fallback version if version.json doesn't exist
  const version = "1.0.0"; // Replace with: getApplicationVersion(versionData);

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
    auth: state.auth,
    mapping: state.mapping,
    ui: state.ui,
    gazData: state.gazData,
    landParcels: state.landParcels,
  };

  let mailToHref =
    "mailto:bugs@cismet.de?subject=Fehler%20im%20LagIS%20Desktop" +
    "&body=" +
    encodeURI(
      `Sehr geehrte Damen und Herren,${br}${br}` +
        `während der Benutzung der LagIS Desktop App ist der untenstehende Fehler aufgetreten: ` +
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
      className="relative w-full min-h-screen bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: "url('/lagis/images/error.jpg')" }}
    >
      {/* Header */}
      <div className="w-full" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
        <div className="container mx-auto px-6 py-6">
          <Row align="middle" justify="space-between" gutter={[16, 16]}>
            <Col xs={24} md={12}>
              <h1 className="m-0">
                <img alt="" width={180} src={wupperwurm} />
              </h1>
              <h2 className="m-0 mt-2" style={{ color: "#ffffff" }}>
                LagIS Desktop
              </h2>
            </Col>
            <Col xs={24} md={12} className="md:text-right">
              <Typography.Paragraph className="!text-white m-0">
                <pre className="m-0 !text-white bg-transparent whitespace-pre-wrap break-words outline-none focus:outline-none ring-0">
                  {navigator.userAgent}
                </pre>
                {isMobile && <span title="mobile">📱 </span>}
                {isMobileUA && <span title="mobile">(📱) </span>}
                {isTablet && <span title="tablet">🧮 </span>}
                {isTabletUA && <span title="tablet">(🧮) </span>}
                {isDesktop && <span title="desktop">🖥️ </span>}
                {isDesktopUA && <span title="desktop">(🖥️) </span>}
                {isTouchDevice && <span title="touch">👇 </span>}
                <span title="cpu">CPU </span>
                {navigator.hardwareConcurrency}
                <span title="ram"> RAM </span>
                {navigator.deviceMemory || "n/a"}
              </Typography.Paragraph>
            </Col>
          </Row>
        </div>
      </div>

      {/* App Version (bottom right) */}
      <div className="absolute bottom-0 right-0 text-[9px] text-white/50 m-1">
        {version}
      </div>

      {/* Body */}
      <div className="container mx-auto px-6 mt-6">
        <Typography.Title level={2}>
          Es ist ein Fehler aufgetreten. Das tut uns leid. ¯\_(ツ)_/¯
        </Typography.Title>

        <Typography.Title level={4}>Fehlermeldung</Typography.Title>
        <Typography.Paragraph>
          <pre>{error.message}</pre>
        </Typography.Paragraph>

        <Collapse bordered={false} ghost={true} defaultActiveKey={[]}>
          <Collapse.Panel header="Error stack" key="errorStack">
            <pre>
              {errorStack?.stringifiedStack ||
                "weitere Informationen werden geladen ..."}
            </pre>
          </Collapse.Panel>
        </Collapse>
        <Divider />

        <Typography.Title level={4}>
          Bitte helfen Sie uns bei der Fehlerbehebung
        </Typography.Title>
        <Typography.Paragraph>
          Senden Sie uns bitte eine <a href={mailToHref}>E-Mail</a> und fügen
          Sie den mit dem orangenen Button erzeugten Report als Anhang hinzu.
        </Typography.Paragraph>

        <Space size="middle">
          <Button
            className="!text-black"
            style={{ backgroundColor: "orange" }}
            onClick={() => {
              const dataStr =
                "data:text/plain;charset=utf-8," +
                encodeURIComponent(attachmentText);
              const a = document.createElement("a");
              a.setAttribute("href", dataStr);
              a.setAttribute("download", "problemReport.lagis-desktop.txt");
              window.document.body.appendChild(a);
              a.click();
              a.remove();
            }}
          >
            Problemreport erzeugen (sehr groß)
          </Button>

          <Button
            className="!text-black"
            style={{ backgroundColor: "yellow" }}
            onClick={() => {
              const confirmation = window.confirm(
                "Mit dieser Aktion werden die gespeicherten Einstellungen wie ausgewählte Layer, Messungen, u.ä. gelöscht.\n\nSind Sie sicher, dass Sie Ihre Einstellungen zurücksetzen wollen?"
              );
              if (confirmation) {
                console.info("resetting settings");
                localforage.clear();
                if (resetErrorBoundary) {
                  resetErrorBoundary();
                }
              }
            }}
          >
            Gespeicherten Zustand zurücksetzen
          </Button>
        </Space>
      </div>
    </div>
  );
};

export default AppErrorFallback;
