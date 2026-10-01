import { useState, type ReactNode } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowDown,
  faArrowLeft,
  faArrowRight,
  faArrowUp,
  faChevronDown,
  faChevronUp,
  faExternalLink,
  faFileArrowDown,
  faRotateLeft,
  faRotateRight,
  faXmark,
  faPlane,
} from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { Select, Slider, Tooltip } from "antd";

import { ContactMailButton } from "@carma-mapping/components";

import { BACKDROP_LOOK_BOUNDS } from "../core/config";
import { useObliqueViewerActions } from "./oblique-actions";
import { strings } from "./strings.de";
import type { CardinalDirection, ObliqueBackdropLook } from "../core/types";
import { downloadAsBlobAsync } from "./utils/imageUrls";
import { CARDINALS_CLOCKWISE, cardinalLetter } from "../core/utils/orientation";

const IconButton = ({
  label,
  icon,
  disabled,
  active,
  onClick,
}: {
  label: string;
  icon: IconDefinition;
  disabled?: boolean;
  active?: boolean;
  onClick: () => void;
}) => (
  <Tooltip title={label} placement="top">
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent hover:bg-black/5 disabled:cursor-default disabled:text-gray-300 disabled:hover:bg-transparent ${
        active ? "text-blue-600" : "text-gray-600"
      }`}
    >
      <FontAwesomeIcon icon={icon} />
    </button>
  </Tooltip>
);

const Divider = () => <span className="h-7 w-px shrink-0 bg-gray-200" />;

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

/** the four sectors as a segmented control; the active one is lit */
const SectorSwitch = ({
  active,
  disabled,
  onSelect,
}: {
  active: CardinalDirection | null;
  disabled: boolean;
  onSelect: (direction: CardinalDirection) => void;
}) => (
  <div className="inline-flex shrink-0 gap-1 rounded-lg bg-gray-100 p-1">
    {CARDINALS_CLOCKWISE.map((direction) => (
      <button
        key={direction}
        type="button"
        disabled={disabled || direction === active}
        onClick={() => onSelect(direction)}
        className={`h-6 w-7 cursor-pointer rounded-md border-0 text-xs font-semibold disabled:cursor-default ${
          direction === active
            ? "bg-white text-gray-900 shadow-sm"
            : "bg-transparent text-gray-500 hover:text-gray-900"
        }`}
        aria-pressed={direction === active}
      >
        {cardinalLetter(direction)}
      </button>
    ))}
  </div>
);

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

const RibbonButton = ({
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
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-solid border-gray-200 bg-white px-2 py-1 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-default disabled:text-gray-300 disabled:hover:bg-white"
  >
    <FontAwesomeIcon icon={icon} />
    {label}
  </button>
);

/**
 * The compact ribbon under the layer bar keeps navigation, series and image
 * actions available; additional image styling stays in the expandable area.
 */
export const ObliquePanel = () => {
  const {
    isLoading,
    error,
    selectedImageId,
    activeDirection,
    viewMode,
    canPan,
    series,
    enabledSeriesIds,
    selectedSourceImageId,
    selectedSeriesId,
    setEnabledSeriesIds,
    previewVisible,
    isBusy,
    previewQuality,
    backdropLook,
    downloadUrl,
    label,
    sendRequest,
    setPreviewQuality,
    setBackdropLook,
    resetLook,
  } = useObliqueViewerActions();

  const [expanded, setExpanded] = useState(false);

  const hasEnabledSeries = series.some((entry) => entry.enabled);
  const hasNadir = series.some(
    (entry) => entry.enabled && entry.availableCameraViews?.includes("nadir")
  );
  const ready =
    selectedImageId !== null &&
    series.some((entry) => entry.enabled && entry.id === selectedSeriesId);
  const held = isBusy || !ready;
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

  const arrow = (
    horizontal: number,
    vertical: number,
    icon: IconDefinition,
    title: string
  ) => (
    <IconButton
      label={title}
      icon={icon}
      disabled={held || !canPan}
      onClick={() => sendRequest({ type: "pan", horizontal, vertical })}
    />
  );

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
      {/* No title here: the layer-bar row the ribbon hangs off already carries
          it, and repeating it costs the width the controls want. */}
      <div className="flex flex-wrap items-center gap-1 text-sm text-gray-700">
        <div className="flex shrink-0 items-center gap-0.5">
          <IconButton
            label={strings.rotateLeft}
            icon={faRotateLeft}
            disabled={held}
            onClick={() => sendRequest({ type: "rotate", clockwise: false })}
          />
          <SectorSwitch
            active={viewMode === "nadir" ? null : activeDirection}
            disabled={isBusy || isLoading || !hasEnabledSeries}
            onSelect={(direction) =>
              sendRequest({ type: "rotateTo", direction })
            }
          />
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
          <IconButton
            label={strings.rotateRight}
            icon={faRotateRight}
            disabled={held}
            onClick={() => sendRequest({ type: "rotate", clockwise: true })}
          />
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <Divider />
          {arrow(0, 1, faArrowUp, strings.siblingUp)}
          {arrow(-1, 0, faArrowLeft, strings.siblingLeft)}
          {arrow(0, -1, faArrowDown, strings.siblingDown)}
          {arrow(1, 0, faArrowRight, strings.siblingRight)}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <RibbonButton
            label={previewVisible ? strings.closePreview : strings.flyToImage}
            icon={previewVisible ? faXmark : faPlane}
            disabled={held && !previewVisible}
            onClick={() => sendRequest({ type: "flyToImage" })}
          />

          <IconButton
            label={expanded ? strings.collapse : strings.expand}
            icon={expanded ? faChevronUp : faChevronDown}
            onClick={() => setExpanded((open) => !open)}
          />
        </div>
      </div>

      <div className="mt-1 flex min-w-0 items-center gap-2">
        <label
          htmlFor="oblique-series-select"
          className="shrink-0 text-xs text-gray-500"
        >
          Bildserien
        </label>
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
          placeholder="Bildserien auswählen"
          value={
            enabledSeriesIds ??
            series.filter((entry) => entry.enabled).map((entry) => entry.id)
          }
          options={series.map((entry) => ({
            value: entry.id,
            label:
              entry.label +
              (entry.enabled && entry.isLoading
                ? " · lädt …"
                : entry.enabled && !entry.error
                ? ` · ${entry.imageCount} Bilder`
                : ""),
          }))}
          onChange={setEnabledSeriesIds}
        />
      </div>
      {series
        .filter((entry) => entry.enabled && entry.error)
        .map((entry) => (
          <div
            key={entry.id}
            className="mt-1 text-xs text-red-700"
            role="status"
          >
            {entry.label}: {entry.error}
          </div>
        ))}
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500">
        <span
          className="min-w-0 flex-1 truncate"
          role="status"
          aria-live="polite"
          title={status}
        >
          {status}
        </span>
        {acquisitionDate && acquisitionLabel && (
          <time
            dateTime={acquisitionDate}
            className="shrink-0 whitespace-nowrap"
            title={hasMonth ? "Aufnahmemonat" : "Aufnahmejahr"}
          >
            Aufnahme: {acquisitionLabel}
          </time>
        )}
        <div className="ml-auto flex shrink-0 items-center">
          <IconButton
            label={strings.openImage}
            icon={faExternalLink}
            disabled={!ready || !downloadUrl}
            onClick={() => {
              if (downloadUrl)
                window.open(downloadUrl, "_blank", "noopener,noreferrer");
            }}
          />
          <IconButton
            label={strings.downloadImage}
            icon={faFileArrowDown}
            disabled={!ready || !downloadUrl}
            onClick={() => {
              if (downloadUrl) void downloadAsBlobAsync(downloadUrl);
            }}
          />
        </div>
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

          <div className="grid grid-cols-1 gap-x-4 gap-y-2 lg:grid-cols-2">
            <Section title={strings.sectionImage}>
              <div className="flex flex-wrap items-center gap-2">
                {ready && selectedImageId && (
                  <ContactMailButton
                    width="auto"
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
            </Section>

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
