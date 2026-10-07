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
import { reportPreviewSourceMissing } from "./utils/preview-thumbnail-cache";
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
    size="small"
    style={{ fontSize: 12 }}
    disabled={disabled}
    onClick={onClick}
    icon={<FontAwesomeIcon icon={icon} />}
  >
    {label}
  </Button>
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
    selectionStrategy,
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
          style={{ fontSize: 12 }}
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
      {selectedImageId && missingPreviewImageId === selectedImageId && (
        <div
          role="status"
          className="mt-1 flex items-center gap-1 text-xs text-amber-700"
        >
          <FontAwesomeIcon icon={faTriangleExclamation} aria-hidden="true" />
          <span>Vorschaubild derzeit nicht verfügbar.</span>
        </div>
      )}
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
          <Button
            size="small"
            style={{ fontSize: 12 }}
            onClick={() => downloadControllerRef.current?.abort()}
          >
            Abbrechen
          </Button>
        )}
        {ready && selectedImageId && (
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
    </div>
  );
};

/** what the host mounts for the row's interaction button */
export const ObliqueInteractionPanel = () => <ObliquePanel />;
