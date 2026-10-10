import { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBug,
  faComment,
  faCube,
  faExternalLink,
  faFileArrowDown,
  faFilter,
  faFont,
  faImages,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { Button, Checkbox, message, Select, Tooltip } from "antd";

import { ContactMailButton } from "@carma-mapping/components";

import {
  OBLIQUE_ROTATION_SURFACES,
  useObliqueViewerActions,
} from "./oblique-actions";
import { strings } from "./strings.de";
import { downloadAsBlobAsync } from "./utils/imageUrls";
import { reportPreviewSourceMissing } from "./utils/preview-thumbnail-cache";
import type { ObliqueViewerExtension } from "./oblique-viewer-extensions";

const EMPTY_EXTENSIONS: readonly ObliqueViewerExtension[] = [];
const PITCH_FORMAT = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const PITCH_DELTA_FORMAT = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  signDisplay: "exceptZero",
});

const ImageAction = ({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: IconDefinition;
  onClick: () => void;
}) => (
  <Button
    size="small"
    style={{ fontSize: 12 }}
    onClick={onClick}
    icon={<FontAwesomeIcon icon={icon} />}
  >
    {label}
  </Button>
);

const ChoiceButtons = <T extends string>({
  label,
  testId,
  value,
  choices,
  onChange,
  disabled = false,
}: {
  label: string;
  testId: string;
  value: T;
  choices: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) => (
  <span
    role="group"
    aria-label={label}
    data-test-id={testId}
    className="inline-flex"
  >
    {choices.map((choice) => (
      <Button
        key={choice.value}
        size="small"
        disabled={disabled}
        type={value === choice.value ? "primary" : "default"}
        aria-pressed={value === choice.value}
        onClick={() => onChange(choice.value)}
        style={{ borderRadius: 0, fontSize: 12 }}
      >
        {choice.label}
      </Button>
    ))}
  </span>
);

/**
 * Series selection and export actions belong in the secondary panel.
 * Image metadata stays in the layer row; navigation stays on the map.
 */
export const ObliquePanel = ({
  nextInterface = false,
  extensions = EMPTY_EXTENSIONS,
}: {
  nextInterface?: boolean;
  extensions?: readonly ObliqueViewerExtension[];
}) => {
  const {
    isLoading,
    error,
    selectedImageId,
    missingPreviewImageId,
    viewMode,
    series,
    enabledSeriesIds,
    rotationSurface,
    mapStyle3dEnabled,
    previewBasemapLabels,
    previewRotationDrape,
    previewNavigationMode,
    previewHoverDrape,
    previewCenterDebug,
    previewOpticalCenterDebug,
    previewScreenCenterDebug,
    previewPoolDebug,
    previewSeamless,
    previewSeamlessMode,
    previewUprightOnlyWhenCovered,
    previewSeamlessCenterY,
    referenceRayPitch,
    publish,
    selectedSourceImageId,
    selectedSeriesId,
    setEnabledSeriesIds,
    isBusy,
    downloadUrl,
    downloadOptions,
    label,
    sendRequest,
  } = useObliqueViewerActions();

  // Never display the preceding photo's angles while selection or slider
  // changes are still being published by the viewer.
  const currentRayPitch =
    referenceRayPitch?.imageId === selectedImageId &&
    referenceRayPitch?.centerY === previewSeamlessCenterY &&
    Number.isFinite(referenceRayPitch?.centerPitchDeg) &&
    Number.isFinite(referenceRayPitch?.pitchDeg)
      ? referenceRayPitch
      : null;
  const [downloading, setDownloading] = useState(false);
  const downloadControllerRef = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      downloadControllerRef.current?.abort();
      downloadControllerRef.current = null;
    },
    []
  );

  const hasEnabledSeries = series.some((entry) => entry.enabled);
  const ready =
    selectedImageId !== null &&
    series.some((entry) => entry.enabled && entry.id === selectedSeriesId);
  const canOpenOrDownload = ready && Boolean(downloadUrl);
  const canRequestFeedback = ready && selectedImageId !== null;
  const showImageActions =
    canOpenOrDownload || canRequestFeedback || downloading;
  const download = () => {
    if (!ready || !downloadUrl || downloadControllerRef.current) return;
    const controller = new AbortController();
    downloadControllerRef.current = controller;
    setDownloading(true);
    void downloadAsBlobAsync(downloadUrl, {
      ...downloadOptions,
      signal: controller.signal,
    })
      .catch((failure: unknown) => {
        if (
          controller.signal.aborted ||
          (failure instanceof Error && failure.name === "AbortError")
        )
          return;
        const failureMessage =
          failure instanceof Error
            ? failure.message
            : typeof failure === "string"
            ? failure
            : "Das Bild konnte nicht heruntergeladen werden.";
        const status =
          failure && typeof failure === "object" && "status" in failure
            ? failure.status
            : undefined;
        // Only actual transport-status evidence can mark the captured source.
        const missing =
          status === 404 ||
          status === 410 ||
          /^AVIF requires HTTP 206; refusing (?:404|410) full-file response$/.test(
            failureMessage
          ) ||
          /^Das Bild konnte nicht geladen werden \((?:404|410)\)\.$/.test(
            failureMessage
          );
        if (missing && downloadOptions?.avif)
          reportPreviewSourceMissing({
            previewPath: "",
            imageId: selectedSourceImageId ?? selectedImageId ?? "",
            avifPyramidUrl: downloadUrl,
            avifOnly: true,
          });
        void message.error(
          missing ? "Das Bild ist derzeit nicht verfügbar." : failureMessage
        );
      })
      .finally(() => {
        if (downloadControllerRef.current === controller) {
          downloadControllerRef.current = null;
          setDownloading(false);
        }
      });
  };

  const status = error
    ? error
    : isLoading
    ? strings.loadingData
    : series.length > 0 && !hasEnabledSeries
    ? "Keine Bildserie aktiviert"
    : selectedImageId
    ? label
    : strings.noImage;

  return (
    <div
      className={`relative ${
        nextInterface
          ? "w-[min(520px,calc(100vw-1rem))]"
          : "w-fit min-w-[min(320px,calc(100vw-1rem))]"
      } max-w-[min(640px,calc(100vw-1rem))] shrink-0 rounded-[10px] bg-white px-2 py-1.5 shadow-lg`}
      data-test-id="oblique-viewer"
    >
      {nextInterface && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-700">
          <fieldset
            aria-label="Navigation"
            className="m-0 min-w-0 border-0 p-0"
          >
            <legend className="sr-only">Navigation</legend>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {nextInterface && (
                <Tooltip title="Bildzentriert: das Nachbarfoto zentrieren. Objektzentriert: den aktuellen Mittelpunkt auf der Oberfläche behalten, zur nächsten Bildkamera wechseln und die Fotos überblenden. Pfeile ohne Abdeckung dieses Punktes sind deaktiviert.">
                  <span>
                    <ChoiceButtons
                      label="Navigationsmodus"
                      testId="oblique-preview-navigation-mode"
                      value={previewNavigationMode}
                      disabled={isBusy}
                      choices={[
                        { value: "image-center", label: "Bildzentriert" },
                        { value: "view-center", label: "Objektzentriert" },
                      ]}
                      onChange={(value) =>
                        publish({
                          previewNavigationMode: value,
                          ...(value === "view-center"
                            ? { previewSeamless: false }
                            : {}),
                        })
                      }
                    />
                  </span>
                </Tooltip>
              )}
              {nextInterface && (
                <>
                  {extensions.map((extension) => (
                    <Tooltip key={extension.mode} title={extension.label}>
                      <Button
                        aria-label={extension.label}
                        aria-pressed={viewMode === extension.mode}
                        disabled={isBusy || isLoading || !hasEnabledSeries}
                        type={
                          viewMode === extension.mode ? "primary" : "default"
                        }
                        size="small"
                        icon={
                          extension.icon && (
                            <FontAwesomeIcon icon={extension.icon} />
                          )
                        }
                        onClick={() =>
                          sendRequest({
                            type: "setViewMode",
                            mode:
                              viewMode === extension.mode
                                ? "oblique"
                                : extension.mode,
                          })
                        }
                      >
                        {extension.icon ? null : extension.label}
                      </Button>
                    </Tooltip>
                  ))}
                </>
              )}
              {nextInterface && (
                <Tooltip title="Bezugsfläche für das fixierte Objekt: sichtbare 3D-Oberfläche oder Gelände. Diese Auswahl ändert nicht die Karten- oder Luftbildgrundlage.">
                  <span>
                    <ChoiceButtons
                      label="Bezugsfläche"
                      testId="oblique-rotation-surface"
                      value={rotationSurface}
                      choices={[
                        {
                          value: OBLIQUE_ROTATION_SURFACES.Surface,
                          label: "Oberfläche",
                        },
                        {
                          value: OBLIQUE_ROTATION_SURFACES.Terrain,
                          label: "Gelände",
                        },
                      ]}
                      onChange={(value) =>
                        publish({
                          rotationSurface: value as typeof rotationSurface,
                        })
                      }
                    />
                  </span>
                </Tooltip>
              )}
            </div>
          </fieldset>
          <fieldset className="m-0 min-w-0 border-0 p-0">
            <legend className="sr-only">Darstellung</legend>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Tooltip title="3D-Kartenstil">
                <Button
                  size="small"
                  aria-label="3D-Kartenstil"
                  aria-pressed={mapStyle3dEnabled}
                  type={mapStyle3dEnabled ? "primary" : "default"}
                  data-test-id="oblique-map-style-3d"
                  onClick={() =>
                    publish({ mapStyle3dEnabled: !mapStyle3dEnabled })
                  }
                  icon={<FontAwesomeIcon icon={faCube} />}
                />
              </Tooltip>
              <span>
                {nextInterface && (
                  <Tooltip title="Straßen- und Gewässernamen über dem Vorschaubild anzeigen; das sichtbare Mesh verdeckt sie hinter Gebäuden">
                    <Button
                      size="small"
                      aria-label="Beschriftung"
                      aria-pressed={previewBasemapLabels}
                      type={
                        previewBasemapLabels && mapStyle3dEnabled
                          ? "primary"
                          : "default"
                      }
                      data-test-id="oblique-preview-basemap-labels"
                      disabled={!mapStyle3dEnabled}
                      onClick={() =>
                        publish({ previewBasemapLabels: !previewBasemapLabels })
                      }
                      icon={<FontAwesomeIcon icon={faFont} />}
                    />
                  </Tooltip>
                )}
              </span>
            </div>
          </fieldset>
          <fieldset className="order-last m-0 min-w-0 basis-full border-0 p-0">
            <legend className="sr-only">Fotomodus</legend>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {nextInterface && (
                <Tooltip title="Beim Zeigen auf einen Footprint ein L3/L4-Foto aus der Aufnahmekamera auf die sichtbare Oberfläche projizieren; blendet mit dem Footprint aus">
                  <Checkbox
                    data-test-id="oblique-preview-hover-drape"
                    checked={previewHoverDrape}
                    onChange={(event) =>
                      publish({
                        previewHoverDrape: event.target.checked,
                        ...(event.target.checked
                          ? { previewSeamless: false }
                          : {}),
                      })
                    }
                  >
                    Hover-Foto
                  </Checkbox>
                </Tooltip>
              )}
              {nextInterface && (
                <Tooltip title="Ausgangs- und Zielfoto aus ihrer Aufnahmepose auf die sichtbare Oberfläche projizieren; beim Drehen nach Blickwinkel überblenden">
                  <Checkbox
                    data-test-id="oblique-preview-rotation-drape"
                    checked={previewRotationDrape}
                    onChange={(event) =>
                      publish({
                        previewRotationDrape: event.target.checked,
                        ...(event.target.checked
                          ? { previewSeamless: false }
                          : {}),
                      })
                    }
                  >
                    Foto bei Navigation drapieren
                  </Checkbox>
                </Tooltip>
              )}
              {nextInterface && (
                <Tooltip title="Automatisch zum überlappenden Foto derselben Blickrichtung wechseln, dessen Bildzentrum näher liegt">
                  <Checkbox
                    data-test-id="oblique-preview-seamless"
                    checked={previewSeamless}
                    onChange={(event) =>
                      publish({
                        previewSeamless: event.target.checked,
                        ...(event.target.checked
                          ? {
                              previewHoverDrape: false,
                              previewRotationDrape: false,
                              previewNavigationMode: "image-center",
                            }
                          : {}),
                      })
                    }
                  >
                    Nahtlos
                  </Checkbox>
                </Tooltip>
              )}
              {nextInterface && previewSeamless && (
                <Tooltip title="Bildwechsel folgt einzelnen Fotos; Flächig projizieren verwendet Fotos der aktiven Serie und Blickrichtung. Auswahl oder Hover eines Fotos aus einer anderen Serie wechselt die Serie. Das zentrumsnächste Bild liegt oben.">
                  <span>
                    <ChoiceButtons
                      label="Nahtlos-Modus"
                      testId="oblique-preview-seamless-mode"
                      value={previewSeamlessMode}
                      onChange={(value: "handover" | "mosaic") =>
                        publish({ previewSeamlessMode: value })
                      }
                      choices={[
                        { value: "handover", label: "Bildwechsel" },
                        { value: "mosaic", label: "Flächig projizieren" },
                      ]}
                    />
                  </span>
                </Tooltip>
              )}
              {nextInterface &&
                previewSeamless &&
                previewSeamlessMode === "handover" && (
                  <Tooltip title="Die Hochachse nur korrigieren, wenn das Foto den gesamten Viewport auch nach der Korrektur abdeckt. Bei sichtbaren Bildrändern bleibt die ursprüngliche Ausrichtung erhalten.">
                    <Checkbox
                      data-test-id="oblique-preview-upright-only-when-covered"
                      checked={previewUprightOnlyWhenCovered}
                      onChange={(event) =>
                        publish({
                          previewUprightOnlyWhenCovered: event.target.checked,
                        })
                      }
                    >
                      Aufrichten nur bildfüllend
                    </Checkbox>
                  </Tooltip>
                )}
            </div>
          </fieldset>
          <details
            className="relative ml-auto shrink-0"
            data-test-id="oblique-debug-section"
          >
            <summary
              aria-label="Debugoptionen"
              title="Debugoptionen"
              className="flex h-6 w-6 cursor-pointer list-none items-center justify-center rounded border border-gray-300 text-gray-700 hover:bg-gray-100 [&::-webkit-details-marker]:hidden"
            >
              <FontAwesomeIcon icon={faBug} />
            </summary>
            <div className="absolute right-0 top-full z-10 mt-1 flex w-[min(480px,calc(100vw-2rem))] flex-wrap items-center gap-2 rounded border border-gray-200 bg-white p-2 shadow-lg">
              {nextInterface && (
                <fieldset
                  data-test-id="oblique-debug-centers"
                  className="w-full border-0 p-0"
                >
                  <legend className="mb-1 text-xs text-gray-500">
                    Bildzentren
                  </legend>
                  <div className="flex flex-wrap items-center gap-2">
                    <Tooltip title="Schnittpunkt der optischen Achse mit der Bildebene gemäß Kamerakalibrierung; als grünes, waagerechtes Fadenkreuz in die Szene projiziert">
                      <Checkbox
                        data-test-id="oblique-debug-optical-center"
                        checked={
                          previewCenterDebug && previewOpticalCenterDebug
                        }
                        onChange={(event) =>
                          publish({
                            previewCenterDebug:
                              event.target.checked ||
                              (previewCenterDebug && previewScreenCenterDebug),
                            previewOpticalCenterDebug: event.target.checked,
                            previewScreenCenterDebug:
                              previewCenterDebug && previewScreenCenterDebug,
                          })
                        }
                      >
                        <svg
                          aria-hidden="true"
                          width="14"
                          height="14"
                          viewBox="0 0 14 14"
                          style={{
                            display: "inline-block",
                            verticalAlign: "middle",
                            marginRight: 4,
                          }}
                        >
                          <path
                            d="M2 7h10M7 2v10"
                            stroke="#61ff9a"
                            strokeWidth="2"
                          />
                        </svg>
                        Bildhauptpunkt
                      </Checkbox>
                    </Tooltip>
                    <Tooltip title="Geometrischer Mittelpunkt des Bildrechtecks; als violettes, diagonales Fadenkreuz entlang der projizierten Bildachse dargestellt">
                      <Checkbox
                        data-test-id="oblique-debug-screen-center"
                        checked={previewCenterDebug && previewScreenCenterDebug}
                        onChange={(event) =>
                          publish({
                            previewCenterDebug:
                              event.target.checked ||
                              (previewCenterDebug && previewOpticalCenterDebug),
                            previewScreenCenterDebug: event.target.checked,
                            previewOpticalCenterDebug:
                              previewCenterDebug && previewOpticalCenterDebug,
                          })
                        }
                      >
                        <svg
                          aria-hidden="true"
                          width="14"
                          height="14"
                          viewBox="0 0 14 14"
                          style={{
                            display: "inline-block",
                            verticalAlign: "middle",
                            marginRight: 4,
                          }}
                        >
                          <path
                            d="m3 3 8 8m-8 0 8-8"
                            stroke="#ae94ff"
                            strokeWidth="2"
                          />
                        </svg>
                        Bildmitte
                      </Checkbox>
                    </Tooltip>
                  </div>
                  {nextInterface && (
                    <Tooltip title="Vertikaler Referenzstrahl: 50 % entspricht dem kalibrierten Bildhauptpunkt. Δ Pitch ist die Abweichung vom Mittelstrahl, Pitch der tatsächliche Winkel im ausgewählten Foto: 0° senkrecht nach unten, 90° horizontal. Der Winkelbereich hält 10 % Abstand zum Bildrand. Der Bodenschnitt dient den Nahtlos-Übergängen.">
                      <label
                        style={{
                          display: "inline-flex",
                          flexWrap: "wrap",
                          alignItems: "center",
                          gap: 6,
                          fontSize: 12,
                        }}
                      >
                        Referenzstrahl
                        <input
                          type="range"
                          aria-label="Referenzstrahl vertikal"
                          min={0.1}
                          max={0.9}
                          step={0.01}
                          value={previewSeamlessCenterY}
                          onChange={(event) =>
                            publish({
                              previewSeamlessCenterY: Number(
                                event.target.value
                              ),
                            })
                          }
                          style={{ width: 96, margin: 0 }}
                        />
                        <span style={{ minWidth: 28 }}>
                          {Math.round(previewSeamlessCenterY * 100)} %
                        </span>
                        <output
                          aria-label="Referenzstrahl Pitch"
                          data-test-id="oblique-reference-ray-pitch"
                          title={
                            currentRayPitch
                              ? `${
                                  selectedSourceImageId ?? selectedImageId
                                }: Mittelstrahl ${PITCH_FORMAT.format(
                                  currentRayPitch.centerPitchDeg
                                )}°`
                              : "Winkel verfügbar, sobald ein kalibriertes Bild ausgewählt ist"
                          }
                          style={{
                            fontVariantNumeric: "tabular-nums",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {currentRayPitch
                            ? `Δ Pitch ${PITCH_DELTA_FORMAT.format(
                                currentRayPitch.pitchDeg -
                                  currentRayPitch.centerPitchDeg
                              )}° · Pitch ${PITCH_FORMAT.format(
                                currentRayPitch.pitchDeg
                              )}°`
                            : "Δ Pitch — · Pitch —"}
                        </output>
                      </label>
                    </Tooltip>
                  )}
                </fieldset>
              )}
              {nextInterface && previewCenterDebug && (
                <Tooltip title="Verschiebbares Fenster mit Ladezustand und Pyramidendiagrammen der Bilder im Vorschau-Pool">
                  <Checkbox
                    data-test-id="oblique-preview-pool-debug"
                    checked={previewPoolDebug}
                    onChange={(event) =>
                      publish({ previewPoolDebug: event.target.checked })
                    }
                  >
                    Bildpool
                  </Checkbox>
                </Tooltip>
              )}
            </div>
          </details>
        </div>
      )}

      <div className="mt-1 flex min-w-0 items-center gap-2">
        <Select
          id="oblique-series-select"
          aria-label="Bildserien"
          data-test-id="oblique-series-select"
          mode="multiple"
          size="small"
          allowClear
          showSearch={false}
          className="w-full min-w-0 max-w-full"
          style={{ fontSize: 12, maxWidth: "100%" }}
          placeholder="Bildserie auswählen"
          value={
            enabledSeriesIds ??
            series.filter((entry) => entry.enabled).map((entry) => entry.id)
          }
          options={series.map((entry) => {
            const warning =
              entry.error ??
              (entry.id === selectedSeriesId &&
              !series.some(
                (candidate) =>
                  candidate.error && error?.endsWith(candidate.error)
              )
                ? error
                : null);
            return {
              value: entry.id,
              label: (
                <span className="inline-flex items-baseline gap-1.5">
                  <span>{entry.label}</span>
                  {entry.enabled && warning && (
                    <Tooltip
                      title={`${entry.label}: ${warning}`}
                      trigger={["hover", "focus", "click"]}
                    >
                      <button
                        type="button"
                        className="border-0 bg-transparent p-0 text-xs text-amber-600"
                        aria-label={`${entry.label}: ${warning}`}
                        onMouseDown={(event) => event.stopPropagation()}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <FontAwesomeIcon icon={faTriangleExclamation} />
                      </button>
                    </Tooltip>
                  )}
                  {entry.enabled && entry.isLoading ? (
                    <span className="text-xs">lädt …</span>
                  ) : entry.enabled && !entry.error ? (
                    <span
                      className="inline-flex items-center gap-1 text-xs tabular-nums"
                      aria-label={`${entry.imageCount.toLocaleString(
                        "de-DE"
                      )} Bilder`}
                    >
                      <FontAwesomeIcon icon={faImages} />
                      {entry.imageCount.toLocaleString("de-DE")}
                    </span>
                  ) : null}
                  {nextInterface && entry.enabled && (
                    <Tooltip title={`${entry.label} durchsuchen und filtern`}>
                      <button
                        type="button"
                        className="border-0 bg-transparent p-0 text-xs text-gray-600 hover:text-blue-600"
                        aria-label={`${entry.label} durchsuchen und filtern`}
                        data-test-id="oblique-browse-catalog"
                        data-series-id={entry.id}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        onKeyDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.stopPropagation();
                          sendRequest({
                            type: "browseCatalog",
                            seriesId: entry.id,
                          });
                        }}
                      >
                        <FontAwesomeIcon icon={faFilter} />
                      </button>
                    </Tooltip>
                  )}
                </span>
              ),
            };
          })}
          onChange={setEnabledSeriesIds}
        />
      </div>
      <span className="sr-only" role="status" aria-live="polite">
        {status}
      </span>
      {selectedImageId && missingPreviewImageId === selectedImageId && (
        <div
          role="status"
          className="mt-1 flex items-center gap-1 text-xs text-amber-700"
        >
          <FontAwesomeIcon icon={faTriangleExclamation} aria-hidden="true" />
          <span>Vorschaubild derzeit nicht verfügbar.</span>
        </div>
      )}
      {showImageActions && (
        <div
          className="mt-2 flex flex-wrap items-center gap-1.5"
          data-test-id="oblique-image-actions"
        >
          {canOpenOrDownload && (
            <ImageAction
              label={strings.openImage}
              icon={faExternalLink}
              onClick={() => {
                if (downloadUrl)
                  window.open(downloadUrl, "_blank", "noopener,noreferrer");
              }}
            />
          )}
          {canOpenOrDownload && !downloading && (
            <ImageAction
              label={strings.downloadImage}
              icon={faFileArrowDown}
              onClick={download}
            />
          )}
          {downloading && (
            <>
              <span role="status" aria-live="polite" className="text-xs">
                Wird heruntergeladen …
              </span>
              <Button
                size="small"
                style={{ fontSize: 12 }}
                onClick={() => downloadControllerRef.current?.abort()}
              >
                Abbrechen
              </Button>
            </>
          )}
          {canRequestFeedback && selectedImageId && (
            <ContactMailButton
              renderTrigger={(onClick) => (
                <Button
                  size="small"
                  style={{ fontSize: 12 }}
                  onClick={onClick}
                  icon={<FontAwesomeIcon icon={faComment} />}
                >
                  Rückmeldung
                </Button>
              )}
              emailAddress="geodatenzentrum@stadt.wuppertal.de"
              subjectPrefix="Datenschutzprüfung Luftbildschrägaufnahme"
              productName="Luftbildschrägaufnahmen"
              portalName="Wuppertaler Geodatenportal"
              imageId={selectedSourceImageId ?? selectedImageId}
              imageUri={downloadUrl ?? undefined}
              tooltip={{ title: strings.requestReview, placement: "top" }}
            />
          )}
        </div>
      )}
    </div>
  );
};

/** what the host mounts for the row's interaction button */
export const ObliqueInteractionPanel = () => <ObliquePanel />;
