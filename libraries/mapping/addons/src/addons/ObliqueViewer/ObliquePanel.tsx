import { useMemo, useState, type ReactNode } from "react";
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
import { Slider, Tooltip } from "antd";

import { ContactMailButton } from "@carma-mapping/components";

import { BACKDROP_LOOK_BOUNDS } from "./config";
import { useObliqueViewerActions } from "./oblique-actions";
import { strings } from "./strings.de";
import type { CardinalDirection, ObliqueBackdropLook } from "./types";
import { downloadAsBlobAsync } from "./utils/imageUrls";
import {
  CARDINALS_CLOCKWISE,
  CardinalDirectionEnum,
  cardinalLetter,
  headingRelativeSlots,
} from "./utils/orientation";

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
      className={`flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent hover:bg-black/5 disabled:cursor-default disabled:text-gray-300 disabled:hover:bg-transparent ${
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
    className="flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-md border border-solid border-gray-200 bg-white px-3 py-1 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-default disabled:text-gray-300 disabled:hover:bg-white"
  >
    <FontAwesomeIcon icon={icon} />
    {label}
  </button>
);

/**
 * The ribbon under the layer bar: the turns, the sibling steps and the
 * flight to the image while collapsed; the image's links and the look of
 * the backdrop under it while open.
 */
export const ObliquePanel = () => {
  const {
    isLoading,
    isAllDataReady,
    error,
    selectedImageId,
    activeDirection,
    siblingIds,
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

  const ready = isAllDataReady && selectedImageId !== null;
  const held = isBusy || !ready;

  // the arrows are heading-relative: the sector ahead sits on top
  const slots = useMemo(
    () => headingRelativeSlots(activeDirection ?? CardinalDirectionEnum.North),
    [activeDirection]
  );
  const arrow = (direction: CardinalDirection, icon: IconDefinition, title: string) => (
    <IconButton
      label={title}
      icon={icon}
      disabled={held || !siblingIds[direction]}
      onClick={() => sendRequest({ type: "sibling", direction })}
    />
  );

  const status = error
    ? error
    : isLoading
    ? strings.loadingData
    : selectedImageId
    ? label
    : strings.noImage;

  return (
    <div
      className="relative w-[100vw] sm:w-[86vw] sm:max-w-[680px] md:max-w-[760px] shrink-0 bg-white rounded-[10px] px-4 py-2 shadow-lg"
      data-test-id="oblique-viewer"
    >
      {/* No title here: the layer-bar row the ribbon hangs off already carries
          it, and repeating it costs the width the controls want. */}
      <div className="flex items-center gap-1.5 text-sm text-gray-700">
        <IconButton
          label={strings.rotateLeft}
          icon={faRotateLeft}
          disabled={held}
          onClick={() => sendRequest({ type: "rotate", clockwise: false })}
        />
        <SectorSwitch
          active={activeDirection}
          disabled={held}
          onSelect={(direction) => sendRequest({ type: "rotateTo", direction })}
        />
        <IconButton
          label={strings.rotateRight}
          icon={faRotateRight}
          disabled={held}
          onClick={() => sendRequest({ type: "rotate", clockwise: true })}
        />

        <Divider />

        {arrow(slots.bottomDir, faArrowUp, strings.siblingUp)}
        {arrow(slots.rightDir, faArrowLeft, strings.siblingLeft)}
        {arrow(slots.topDir, faArrowDown, strings.siblingDown)}
        {arrow(slots.leftDir, faArrowRight, strings.siblingRight)}

        <Divider />

        <RibbonButton
          label={previewVisible ? strings.closePreview : strings.flyToImage}
          icon={previewVisible ? faXmark : faPlane}
          disabled={held && !previewVisible}
          onClick={() => sendRequest({ type: "flyToImage" })}
        />

        <span className="grow" />

        <IconButton
          label={expanded ? strings.collapse : strings.expand}
          icon={expanded ? faChevronUp : faChevronDown}
          onClick={() => setExpanded((open) => !open)}
        />
      </div>

      {expanded && (
        <div className="mt-2 border-0 border-t border-solid border-gray-200 pt-2">
          <div className="mb-2 flex items-center justify-between gap-4">
            <span className="min-w-0 truncate text-sm text-gray-500 tabular-nums">
              {status}
            </span>
            <button
              type="button"
              className="flex cursor-pointer items-center gap-2 whitespace-nowrap border-0 bg-transparent text-sm text-gray-600 hover:text-gray-900"
              onClick={resetLook}
            >
              <FontAwesomeIcon icon={faRotateLeft} />
              {strings.reset}
            </button>
          </div>

          <div className="grid grid-cols-1 gap-x-8 gap-y-3 lg:grid-cols-2">
            <Section title={strings.sectionImage}>
              <div className="flex flex-wrap items-center gap-2">
                <RibbonButton
                  label={strings.openImage}
                  icon={faExternalLink}
                  disabled={!downloadUrl}
                  onClick={() => {
                    if (downloadUrl) window.open(downloadUrl, "_blank");
                  }}
                />
                <RibbonButton
                  label={strings.downloadImage}
                  icon={faFileArrowDown}
                  disabled={!downloadUrl}
                  onClick={() => {
                    if (downloadUrl) void downloadAsBlobAsync(downloadUrl);
                  }}
                />
                {selectedImageId && (
                  <ContactMailButton
                    width="auto"
                    emailAddress="geodatenzentrum@stadt.wuppertal.de"
                    subjectPrefix="Datenschutzprüfung Luftbildschrägaufnahme"
                    productName="Luftbildschrägaufnahmen"
                    portalName="Wuppertaler Geodatenportal"
                    imageId={selectedImageId}
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
