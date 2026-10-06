import { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faComment,
  faExternalLink,
  faFileArrowDown,
  faImages,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { Button, message, Select, Tooltip } from "antd";

import { ContactMailButton } from "@carma-mapping/components";

import { useObliqueViewerActions } from "./oblique-actions";
import { strings } from "./strings.de";
import { downloadAsBlobAsync } from "./utils/imageUrls";
import type { ObliqueViewerExtension } from "./oblique-viewer-extensions";

const EMPTY_EXTENSIONS: readonly ObliqueViewerExtension[] = [];

const ImageAction = ({
  label,
  icon,
  disabled,
  onClick,
}: {
  label: string;
  icon: IconDefinition;
  disabled?: boolean;
  onClick: () => void;
}) => (
  <Button
    disabled={disabled}
    onClick={onClick}
    icon={<FontAwesomeIcon icon={icon} />}
  >
    {label}
  </Button>
);

/**
 * Series, image information and export actions belong in the secondary panel.
 * Navigation is mounted independently on the map by ObliqueNavigation.
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
    viewMode,
    series,
    enabledSeriesIds,
    selectionStrategy,
    publish,
    selectedSourceImageId,
    selectedSeriesId,
    selectedImageBearingDeg,
    setEnabledSeriesIds,
    isBusy,
    downloadUrl,
    downloadOptions,
    label,
    sendRequest,
  } = useObliqueViewerActions();

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
  const hasNadir = series.some(
    (entry) => entry.enabled && entry.availableCameraViews?.includes("nadir")
  );
  const ready =
    selectedImageId !== null &&
    series.some((entry) => entry.enabled && entry.id === selectedSeriesId);
  const activeSeries = ready
    ? series.find((entry) => entry.id === selectedSeriesId)
    : undefined;
  const year = activeSeries?.acquisitionYear ?? Number.NaN;
  const month = activeSeries?.acquisitionMonth ?? Number.NaN;
  const hasYear = Number.isInteger(year) && year >= 1000 && year <= 9999;
  const hasMonth = Number.isInteger(month) && month >= 1 && month <= 12;
  const acquisitionDate = hasYear
    ? hasMonth
      ? String(year) + "-" + String(month).padStart(2, "0")
      : String(year)
    : null;
  const acquisitionLabel = hasYear
    ? hasMonth
      ? new Intl.DateTimeFormat("de-DE", {
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        }).format(new Date(Date.UTC(year, month - 1, 1)))
      : String(year)
    : null;

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
        if (!controller.signal.aborted)
          void message.error(
            failure instanceof Error
              ? failure.message
              : "Das Bild konnte nicht heruntergeladen werden."
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
      className="relative w-fit max-w-[min(640px,calc(100vw-1rem))] shrink-0 rounded-[10px] bg-white px-2 py-1.5 shadow-lg"
      data-test-id="oblique-viewer"
    >
      <div className="flex flex-wrap items-center gap-1 text-sm text-gray-700">
        {nextInterface && (
          <>
            {extensions.map((extension) => (
              <button
                key={extension.mode}
                type="button"
                aria-label={extension.label}
                aria-pressed={viewMode === extension.mode}
                disabled={isBusy || isLoading || !hasEnabledSeries}
                className={`h-8 rounded-md border-0 px-2 text-xs font-semibold disabled:text-gray-300 ${
                  viewMode === extension.mode
                    ? "bg-gray-100 text-blue-600"
                    : "bg-transparent text-gray-500 hover:bg-gray-100"
                }`}
                onClick={() =>
                  sendRequest({
                    type: "setViewMode",
                    mode:
                      viewMode === extension.mode ? "oblique" : extension.mode,
                  })
                }
              >
                {extension.label}
              </button>
            ))}
            {hasNadir && (
              <button
                type="button"
                aria-label="Nadiransicht"
                aria-pressed={viewMode === "nadir"}
                disabled={isBusy || isLoading}
                className={`h-8 rounded-md border-0 px-2 text-xs font-semibold disabled:text-gray-300 ${
                  viewMode === "nadir"
                    ? "bg-gray-100 text-blue-600"
                    : "bg-transparent text-gray-500 hover:bg-gray-100"
                }`}
                onClick={() =>
                  sendRequest({
                    type: "setViewMode",
                    mode: viewMode === "nadir" ? "oblique" : "nadir",
                  })
                }
              >
                Nadir
              </button>
            )}
          </>
        )}
        {nextInterface && (
          <Tooltip title="Bildauswahl nach der Nähe zur Bildachse oder der nativen Pixelauflösung am Bodenpunkt">
            <Select
              aria-label="Footprint-Auswahl"
              data-test-id="oblique-selection-strategy"
              size="small"
              showSearch={false}
              value={selectionStrategy}
              options={[
                { value: "nearest-axis", label: "Nächste Bildachse" },
                { value: "best-resolution", label: "Beste Pixelauflösung" },
              ]}
              onChange={(value) => publish({ selectionStrategy: value })}
            />
          </Tooltip>
        )}
      </div>

      <div className="mt-1 flex min-w-0 items-center gap-2">
        <Select
          id="oblique-series-select"
          aria-label="Bildserien"
          data-test-id="oblique-series-select"
          mode="multiple"
          size="small"
          allowClear
          showSearch={false}
          maxTagCount="responsive"
          className="min-w-0 flex-1"
          placeholder="Bildserien"
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
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
        {ready && selectedImageBearingDeg !== null && (
          <span className="shrink-0 tabular-nums" title="Bildrichtung">
            {Math.round(selectedImageBearingDeg)}°
          </span>
        )}
        {ready && selectedSourceImageId && (
          <span className="min-w-0 truncate" title={selectedSourceImageId}>
            {selectedSourceImageId}
          </span>
        )}
        {acquisitionDate && acquisitionLabel && (
          <time
            dateTime={acquisitionDate}
            className="shrink-0 whitespace-nowrap"
            title={hasMonth ? "Aufnahmemonat" : "Aufnahmejahr"}
          >
            {acquisitionLabel}
          </time>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <ImageAction
          label={strings.openImage}
          icon={faExternalLink}
          disabled={!ready || !downloadUrl}
          onClick={() => {
            if (downloadUrl)
              window.open(downloadUrl, "_blank", "noopener,noreferrer");
          }}
        />
        <ImageAction
          label={downloading ? "Wird heruntergeladen …" : strings.downloadImage}
          icon={faFileArrowDown}
          disabled={!ready || !downloadUrl || downloading}
          onClick={download}
        />
        {downloading && (
          <Button onClick={() => downloadControllerRef.current?.abort()}>
            Abbrechen
          </Button>
        )}
        {ready && selectedImageId && (
          <ContactMailButton
            renderTrigger={(onClick) => (
              <Button
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
    </div>
  );
};

/** what the host mounts for the row's interaction button */
export const ObliqueInteractionPanel = () => <ObliquePanel />;
