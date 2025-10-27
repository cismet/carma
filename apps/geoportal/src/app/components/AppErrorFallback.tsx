import { useEffect, useMemo, useState } from "react";
import StackTrace from "stacktrace-js";
import localforage from "localforage";
import { Button, Collapse, Typography, Divider, Space, Row, Col } from "antd";
import { isMobile, isTablet, isDesktop } from "react-device-detect";
import UAParser from "ua-parser-js";
import { getApplicationVersion } from "@carma-commons/utils";
import versionData from "../../version.json";
import store from "../store";

// Types
type ErrorWithCause = Error & { cause?: unknown };

type MailTemplateCtx = { br: string; appName: string };

export interface AppErrorMailConfig {
  to: string;
  subject: string;
  bodyTemplate?: (ctx: MailTemplateCtx) => string;
}

export interface BrandingOptions {
  appName?: string;
  logoSrc?: string;
  logoAlt?: string;
  logoWidth?: number;
  headerTextColor?: string;
  backgroundImage?: string;
  headerOverlayColor?: string;
  downloadButtonColor?: string;
  resetButtonColor?: string;
  attachmentFilename?: string;
}

export interface AppErrorFallbackExtra {
  // Diagnostics forwarded by CesiumErrorHandling or other sources
  cesiumTitle?: string;
  cesiumMessage?: string;
  forwarderAt?: string;
  forwarderStack?: string;
  carmaCesiumContext?: Record<string, unknown>;

  // Configurables
  appErrorMail?: AppErrorMailConfig;
  branding?: BrandingOptions;
}

export interface AppErrorFallbackProps {
  error: ErrorWithCause;
  resetErrorBoundary: () => void;
  extra?: AppErrorFallbackExtra;
}

const defaultMail: Required<Pick<AppErrorMailConfig, "to" | "subject">> & {
  bodyTemplate: NonNullable<AppErrorMailConfig["bodyTemplate"]>;
} = {
  to: "bugs@cismet.de",
  subject: "Fehler im Geoportal Wuppertal",
  bodyTemplate: ({ br, appName }) =>
    `Sehr geehrte Damen und Herren,${br}${br}` +
    `Während der Benutzung des ${appName} ist der untenstehende Fehler aufgetreten.${br}${br}` +
    `[Tragen Sie hier bitte ein, was Sie gemacht haben oder was Ihnen aufgefallen ist.]${br}${br}${br}` +
    `Mit freundlichen Grüßen${br}${br}${br}` +
    `[Bitte überschreiben Sie den nachfolgenden Block mit Ihren Kontaktinformationen, damit wir ggf mit Ihnen Kontakt aufnehmen können]${br}${br}` +
    `Vor- und Nachname${br}` +
    `ggf E-Mail-Adresse${br}` +
    `ggf. Telefonnummer${br}${br}` +
    `!! Mit Absenden dieser E-Mail erkläre ich mein Einverständnis mit der zweckgebundenen Verarbeitung meiner personenbezogenen Daten gemäß der Information nach Artikel 13 bzw. Art. 14 Datenschutz-Grundverordnung (DS-GVO).${br}${br}`,
};

const defaultBranding: Required<BrandingOptions> = {
  appName: "Geoportal Wuppertal",
  logoSrc: "/images/wuppertal-white.svg",
  logoAlt: "",
  logoWidth: 180,
  headerTextColor: "#ffffff",
  backgroundImage: "/geoportal/images/error.jpg",
  headerOverlayColor: "rgba(0,0,0,0.4)",
  downloadButtonColor: "orange",
  resetButtonColor: "yellow",
  attachmentFilename: "problemReport.geoportal-wuppertal.txt",
};

type ForwardedDiagnostics = Partial<
  Pick<
    AppErrorFallbackExtra,
    | "cesiumTitle"
    | "cesiumMessage"
    | "forwarderAt"
    | "forwarderStack"
    | "carmaCesiumContext"
  >
> & {
  originalStack?: string;
  carmaCesiumRuntime?: Record<string, unknown>;
};

const AppErrorFallback = ({ error, extra }: AppErrorFallbackProps) => {
  const br = "\n";
  const [errorStack, setErrorStack] = useState<{
    errorStack?: StackTrace.StackFrame[];
    stringifiedStack?: string;
  }>({});

  const parser = useMemo(() => new UAParser(), []);
  const isMobileUA = parser.getDevice().type === "mobile";
  const isTabletUA = parser.getDevice().type === "tablet";
  const isDesktopUA = !isMobileUA && !isTabletUA;
  const isTouchDevice =
    typeof window !== "undefined" &&
    ("ontouchstart" in window || navigator.maxTouchPoints > 0);

  const version = getApplicationVersion(versionData);

  useEffect(() => {
    StackTrace.fromError(error).then((stack) => {
      const stringifiedStack = stack.map((sf) => sf.toString()).join("\n");
      setErrorStack({ errorStack: stack, stringifiedStack });
    });
  }, [error]);

  const state = store.getState();
  const stateToLog = {
    cesium: (state as Record<string, unknown>)["cesium"],
    features: (state as Record<string, unknown>)["features"],
    mapping: (state as Record<string, unknown>)["mapping"],
    measurements: (state as Record<string, unknown>)["measurements"],
    ui: (state as Record<string, unknown>)["ui"],
  } as const;

  const branding = { ...defaultBranding, ...(extra?.branding ?? {}) };
  const mailCfg: Required<AppErrorMailConfig> = {
    to: extra?.appErrorMail?.to ?? defaultMail.to,
    subject: extra?.appErrorMail?.subject ?? defaultMail.subject,
    bodyTemplate: extra?.appErrorMail?.bodyTemplate ?? defaultMail.bodyTemplate,
  };

  const mailBodyIntro = mailCfg.bodyTemplate({ br, appName: branding.appName });

  const causeStack =
    (error as ErrorWithCause)?.cause &&
    (error as ErrorWithCause).cause instanceof Error
      ? ((error as ErrorWithCause).cause as Error).stack
      : undefined;

  // Prefer diagnostics from props.extra, but also read fields attached to the error object
  const forwardedFromError = (error as unknown as ForwardedDiagnostics) || {};
  const diag: ForwardedDiagnostics = {
    cesiumTitle: extra?.cesiumTitle ?? forwardedFromError.cesiumTitle,
    cesiumMessage: extra?.cesiumMessage ?? forwardedFromError.cesiumMessage,
    forwarderAt: extra?.forwarderAt ?? forwardedFromError.forwarderAt,
    forwarderStack: extra?.forwarderStack ?? forwardedFromError.forwarderStack,
    carmaCesiumContext:
      extra?.carmaCesiumContext ?? forwardedFromError.carmaCesiumContext,
    originalStack: forwardedFromError.originalStack,
    carmaCesiumRuntime: forwardedFromError.carmaCesiumRuntime,
  };

  const mailBodyFull =
    `${mailBodyIntro}` +
    `----------------------${br}` +
    `${error?.message}${br}` +
    `----------------------${br}` +
    `${errorStack?.stringifiedStack ?? ""}${br}` +
    (diag.originalStack
      ? `${br}--- Cesium original stack ---${br}${diag.originalStack}${br}`
      : "") +
    (diag.cesiumTitle || diag.cesiumMessage
      ? `${br}--- Cesium error panel ---${br}` +
        `title: ${diag.cesiumTitle ?? "-"}${br}` +
        `message: ${diag.cesiumMessage ?? "-"}${br}`
      : "") +
    (diag.forwarderAt
      ? `${br}--- Forwarder ---${br}at: ${diag.forwarderAt}${br}`
      : "") +
    `----------------------${br}`;

  const mailToHref =
    `mailto:${encodeURIComponent(mailCfg.to)}` +
    `?subject=${encodeURIComponent(mailCfg.subject)}` +
    `&body=${encodeURIComponent(mailBodyFull)}`;

  const attachmentText =
    `----------------------${br}` +
    `${error?.message}${br}` +
    `----------------------${br}` +
    `${errorStack?.stringifiedStack ?? ""}${br}` +
    `----------------------${br}` +
    (diag.originalStack
      ? `Cesium original stack:${br}${diag.originalStack}${br}----------------------${br}`
      : "") +
    (diag.cesiumTitle || diag.cesiumMessage
      ? `Cesium error panel:${br}` +
        `title: ${diag.cesiumTitle ?? "-"}${br}` +
        `message: ${diag.cesiumMessage ?? "-"}${br}----------------------${br}`
      : "") +
    (diag.forwarderAt || diag.forwarderStack
      ? `Forwarder:${br}${diag.forwarderAt ?? ""}${br}${
          diag.forwarderStack ?? ""
        }${br}----------------------${br}`
      : "") +
    `${navigator.userAgent}${br}` +
    `${br}${br}` +
    `----------------------${br}` +
    `STATE${br}` +
    `----------------------${br}` +
    `${JSON.stringify(stateToLog, null, 2)}${br}` +
    `----------------------${br}` +
    (diag.carmaCesiumContext
      ? `CesiumContext:${br}${JSON.stringify(
          diag.carmaCesiumContext,
          null,
          2
        )}${br}----------------------${br}`
      : "") +
    (diag.carmaCesiumRuntime
      ? `CesiumRuntime:${br}${JSON.stringify(
          diag.carmaCesiumRuntime,
          null,
          2
        )}${br}----------------------${br}`
      : "");

  return (
    <div
      className="relative w-full min-h-screen bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: `url('${branding.backgroundImage}')` }}
    >
      {/* Header */}
      <div
        className="w-full"
        style={{ backgroundColor: branding.headerOverlayColor }}
      >
        <div className="container mx-auto px-6 py-6">
          <Row align="middle" justify="space-between" gutter={[16, 16]}>
            <Col xs={24} md={12}>
              <h1 className="m-0">
                <img
                  alt={branding.logoAlt}
                  width={branding.logoWidth}
                  src={branding.logoSrc}
                />
              </h1>
              <h2
                className="m-0 mt-2"
                style={{ color: branding.headerTextColor }}
              >
                {branding.appName}
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
                {(navigator as unknown as { deviceMemory?: number })
                  .deviceMemory || "n/a"}
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

          {(Object.keys(diag ?? {}).length > 0 || !!causeStack) && (
            <Collapse.Panel header="Technische Details" key="cesiumDiag">
              {(diag.cesiumTitle || diag.cesiumMessage) && (
                <Typography.Paragraph>
                  <Typography.Text strong>Titel:</Typography.Text>{" "}
                  <Typography.Text code>
                    {diag.cesiumTitle || "-"}
                  </Typography.Text>
                  <br />
                  <Typography.Text strong>Nachricht:</Typography.Text>{" "}
                  <Typography.Text code>
                    {diag.cesiumMessage || "-"}
                  </Typography.Text>
                </Typography.Paragraph>
              )}
              {(diag.forwarderAt || diag.forwarderStack) && (
                <Typography.Paragraph>
                  {diag?.forwarderAt && (
                    <>
                      <Typography.Text strong>Weitergeleitet:</Typography.Text>{" "}
                      <Typography.Text code>{diag.forwarderAt}</Typography.Text>
                      <br />
                    </>
                  )}
                  {diag?.forwarderStack && <pre>{diag.forwarderStack}</pre>}
                </Typography.Paragraph>
              )}
              {diag?.carmaCesiumContext && (
                <Typography.Paragraph>
                  <Typography.Text strong>Cesium-Kontext:</Typography.Text>
                  <pre>{JSON.stringify(diag.carmaCesiumContext, null, 2)}</pre>
                </Typography.Paragraph>
              )}
              {diag?.carmaCesiumRuntime && (
                <Typography.Paragraph>
                  <Typography.Text strong>Cesium-Runtime:</Typography.Text>
                  <pre>{JSON.stringify(diag.carmaCesiumRuntime, null, 2)}</pre>
                </Typography.Paragraph>
              )}
              {diag?.originalStack && (
                <Typography.Paragraph>
                  <Typography.Text strong>
                    Cesium original stack:
                  </Typography.Text>
                  <pre>{diag.originalStack}</pre>
                </Typography.Paragraph>
              )}
              {causeStack && (
                <Typography.Paragraph>
                  <Typography.Text strong>Cause Stack:</Typography.Text>
                  <pre>{causeStack}</pre>
                </Typography.Paragraph>
              )}
            </Collapse.Panel>
          )}
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
            style={{ backgroundColor: branding.downloadButtonColor }}
            onClick={() => {
              const dataStr =
                "data:text/plain;charset=utf-8," +
                encodeURIComponent(attachmentText);
              const a = document.createElement("a");
              a.setAttribute("href", dataStr);
              a.setAttribute("download", branding.attachmentFilename);
              window.document.body.appendChild(a);
              a.click();
              a.remove();
            }}
          >
            Problemreport erzeugen (sehr groß)
          </Button>

          <Button
            className="!text-black"
            style={{ backgroundColor: branding.resetButtonColor }}
            onClick={() => {
              const confirmation = window.confirm(
                "Mit dieser Aktion werden die gespeicherten Einstellungen wie ausgewählte Layer, Messungen, u.ä. gelöscht.\n\nSind Sie sicher, dass Sie Ihre Einstellungen zurücksetzen wollen?"
              );
              if (confirmation) {
                console.info("resetting settings");
                localforage.clear();
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
