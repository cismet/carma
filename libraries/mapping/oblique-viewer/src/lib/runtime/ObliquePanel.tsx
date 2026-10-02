import { useEffect, useRef, useState, type ReactNode } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronDown,
  faChevronUp,
  faExternalLink,
  faFileArrowDown,
  faRotateLeft,
  faImages,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { message, Select, Slider, Tooltip } from "antd";

import { ContactMailButton } from "@carma-mapping/components";
import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";

import { BACKDROP_LOOK_BOUNDS } from "../core/config";
import { useObliqueViewerActions } from "./oblique-actions";
import { strings } from "./strings.de";
import type { ObliqueBackdropLook } from "../core/types";
import { downloadAsBlobAsync } from "./utils/imageUrls";

const Section = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => (
  <section className="min-w-0">
    <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-500">
      {title}
    </h3>
    <div className="flex flex-col gap-1.5">{children}</div>
  </section>
);

/** one knob of the backdrop look: name, slider over its bounds, value */
const LookSlider = ({
  label,
  knob,
  value,
  onChange,
}: {
  label: string;
  knob: keyof ObliqueBackdropLook;
  value: number;
  onChange: (value: number) => void;
}) => {
  const [min, max] = BACKDROP_LOOK_BOUNDS[knob];
  return (
    <label className="m-0 grid grid-cols-[92px_minmax(0,1fr)_64px] items-center gap-3 text-sm text-gray-700">
      <span>{label}</span>
      <Slider
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={onChange}
        tooltip={{ open: false }}
        style={{ margin: 0 }}
      />
      <span className="text-right tabular-nums">{Math.round(value)} %</span>
    </label>
  );
};

/** a segmented pair, for the preview quality */
const Segmented = <T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) => (
  <div className="inline-flex gap-1 rounded-lg bg-gray-100 p-1">
    {options.map((option) => (
      <button
        key={option.value}
        type="button"
        onClick={() => onChange(option.value)}
        className={`cursor-pointer rounded-md border-0 px-2.5 py-0.5 text-sm ${
          option.value === value
            ? "bg-white text-gray-900 shadow-sm"
            : "bg-transparent text-gray-500 hover:text-gray-900"
        }`}
        aria-pressed={option.value === value}
      >
        {option.label}
      </button>
    ))}
  </div>
);

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
  <ControlButtonStyler
    type="button"
    disabled={disabled}
    onClick={onClick}
    width="160px"
  >
    <span className="flex items-center text-base">
      <FontAwesomeIcon icon={icon} className="mr-2" />
      {label}
    </span>
  </ControlButtonStyler>
);

/**
 * Series, image information and export actions belong in the secondary panel.
 * Navigation is mounted independently on the map by ObliqueNavigation.
 */
export const ObliquePanel = () => {
  const {
    isLoading,
    error,
    selectedImageId,
    viewMode,
    series,
    enabledSeriesIds,
    selectedSourceImageId,
    selectedSeriesId,
    selectedImageBearingDeg,
    setEnabledSeriesIds,
    isBusy,
    previewQuality,
    backdropLook,
    downloadUrl,
    downloadOptions,
    label,
    sendRequest,
    setPreviewQuality,
    setBackdropLook,
    resetLook,
  } = useObliqueViewerActions();

  const [expanded, setExpanded] = useState(false);
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
        <button
          type="button"
          aria-label="Object Coverage"
          aria-pressed={viewMode === "objectCoverage"}
          disabled={isBusy || isLoading || !hasEnabledSeries}
          className={`h-8 rounded-md border-0 px-2 text-xs font-semibold disabled:text-gray-300 ${
            viewMode === "objectCoverage"
              ? "bg-gray-100 text-blue-600"
              : "bg-transparent text-gray-500 hover:bg-gray-100"
          }`}
          onClick={() =>
            sendRequest({
              type: "setViewMode",
              mode:
                viewMode === "objectCoverage" ? "oblique" : "objectCoverage",
            })
          }
        >
          Object Coverage
        </button>
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
      <div className="mt-2 flex flex-wrap items-center gap-2">
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
          <button
            type="button"
            className="cursor-pointer rounded-md border border-solid border-gray-200 bg-white px-2 py-1 text-sm"
            onClick={() => downloadControllerRef.current?.abort()}
          >
            Abbrechen
          </button>
        )}
        {ready && selectedImageId && (
          <ContactMailButton
            width="160px"
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
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          aria-label={expanded ? strings.collapse : strings.expand}
          aria-expanded={expanded}
          onClick={() => setExpanded((open) => !open)}
          className="flex cursor-pointer items-center gap-2 border-0 bg-transparent text-sm text-gray-600 hover:text-gray-900"
        >
          {strings.sectionLook}
          <FontAwesomeIcon icon={expanded ? faChevronUp : faChevronDown} />
        </button>
      </div>

      {expanded && (
        <div className="mt-1 border-0 border-t border-solid border-gray-200 pt-1">
          <div className="mb-1 flex justify-end">
            <button
              type="button"
              className="flex cursor-pointer items-center gap-2 whitespace-nowrap border-0 bg-transparent text-sm text-gray-600 hover:text-gray-900"
              onClick={resetLook}
            >
              <FontAwesomeIcon icon={faRotateLeft} />
              {strings.reset}
            </button>
          </div>

          <div className="min-w-0">
            <Section title={strings.sectionLook}>
              <div className="grid grid-cols-[92px_minmax(0,1fr)] items-center gap-3 text-sm text-gray-700">
                <span>{strings.quality}</span>
                <Segmented
                  value={previewQuality}
                  options={[
                    { value: "standard", label: strings.qualityStandard },
                    { value: "hq", label: strings.qualityHq },
                  ]}
                  onChange={setPreviewQuality}
                />
              </div>
              <LookSlider
                label={strings.brightness}
                knob="brightness"
                value={backdropLook.brightness}
                onChange={(brightness) => setBackdropLook({ brightness })}
              />
              <LookSlider
                label={strings.contrast}
                knob="contrast"
                value={backdropLook.contrast}
                onChange={(contrast) => setBackdropLook({ contrast })}
              />
              <LookSlider
                label={strings.saturation}
                knob="saturation"
                value={backdropLook.saturation}
                onChange={(saturation) => setBackdropLook({ saturation })}
              />
            </Section>
          </div>
        </div>
      )}
    </div>
  );
};

/** what the host mounts for the row's interaction button */
export const ObliqueInteractionPanel = () => <ObliquePanel />;
