import { faMinus, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  ANNOTATION_TYPES,
  annotationTypographyTokens,
  annotationVisualPalette,
  getAnnotationShortLabelBackgroundRgb255,
  type AnnotationLabelAppearance,
} from "@carma-mapping/annotations/core";
import type { Rgb255 } from "@carma-commons/utils";
import {
  resolveAnnotationInfoBoxVisualOptions,
  type AnnotationInfoBoxVisualOptions,
} from "@carma-mapping/annotations/ui";

import {
  updateAnnotationEntryById,
  useAnnotationsDispatch,
  pointLabelVisualDefaults,
} from "@carma-mapping/annotations/runtime";
import type { StoredAnnotation } from "@carma-mapping/annotations/runtime";

const labelToolInfoBoxDefaults = Object.freeze({
  fontSizePx: Object.freeze({
    min: 10,
    max: 48,
    step: 1,
  }),
});

const labelToolDefaultAppearance = Object.freeze({
  fontSizePx: annotationTypographyTokens.fontSizePx.measurementLabel,
  backgroundColor: pointLabelVisualDefaults.textBackgroundColor,
  textColor: pointLabelVisualDefaults.textColor,
} satisfies Required<AnnotationLabelAppearance>);

const toHexChannel = (value: number): string =>
  Math.max(0, Math.min(255, Math.round(value)))
    .toString(16)
    .padStart(2, "0");

const toHexColor = ([red, green, blue]: Rgb255): string =>
  `#${toHexChannel(red)}${toHexChannel(green)}${toHexChannel(blue)}`;

const normalizeColorToHex = (
  value: string | undefined,
  fallbackHex: string
): string => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return fallbackHex;
  }

  const hexMatch = trimmed.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (hexMatch) {
    const hex = hexMatch[1];
    if (hex.length === 3) {
      return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`.toLowerCase();
    }

    return `#${hex.toLowerCase()}`;
  }

  const rgbMatch = trimmed.match(
    /^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?:\s*,\s*(\d+(?:\.\d+)?)\s*)?\)$/
  );
  if (!rgbMatch) {
    return fallbackHex;
  }

  const [, red, green, blue] = rgbMatch;
  return `#${toHexChannel(Number(red))}${toHexChannel(
    Number(green)
  )}${toHexChannel(Number(blue))}`;
};

const labelToolInfoBoxHexDefaults = Object.freeze({
  background: toHexColor(
    getAnnotationShortLabelBackgroundRgb255(ANNOTATION_TYPES.LABEL)
  ),
  text: toHexColor(annotationVisualPalette.textRgb255.dark),
});

const labelToolDefaultBackgroundHex = normalizeColorToHex(
  labelToolDefaultAppearance.backgroundColor,
  labelToolInfoBoxHexDefaults.background
);
const labelToolDefaultTextHex = normalizeColorToHex(
  labelToolDefaultAppearance.textColor,
  labelToolInfoBoxHexDefaults.text
);

const clampFontSizePx = (value: number) =>
  Math.min(
    labelToolInfoBoxDefaults.fontSizePx.max,
    Math.max(labelToolInfoBoxDefaults.fontSizePx.min, Math.round(value))
  );

const resolveFontSizePercent = (fontSizePx: number): number =>
  (fontSizePx / labelToolDefaultAppearance.fontSizePx) * 100;

const formatFontSizePercent = (fontSizePx: number): string => {
  const percent = resolveFontSizePercent(fontSizePx);
  const roundedPercent = Math.round(percent * 10) / 10;
  return Number.isInteger(roundedPercent)
    ? `${roundedPercent}%`
    : `${roundedPercent.toFixed(1)}%`;
};

export const LabelToolInfoBoxContent = ({
  annotation,
  visualOptions,
}: {
  annotation: StoredAnnotation;
  visualOptions?: AnnotationInfoBoxVisualOptions;
}) => {
  const resolvedVisualOptions =
    resolveAnnotationInfoBoxVisualOptions(visualOptions);
  const dispatch = useAnnotationsDispatch();
  const isLocked = Boolean(annotation.locked);

  const fontSizePx = clampFontSizePx(
    annotation.labelAppearance?.fontSizePx ??
      labelToolDefaultAppearance.fontSizePx
  );
  const backgroundColor =
    annotation.labelAppearance?.backgroundColor?.trim() ||
    labelToolDefaultAppearance.backgroundColor;
  const textColor =
    annotation.labelAppearance?.textColor?.trim() ||
    labelToolDefaultAppearance.textColor;

  const applyFontSizePx = (nextFontSizePx: number) => {
    dispatch(
      updateAnnotationEntryById({
        annotationId: annotation.id,
        labelAppearance: {
          ...(annotation.labelAppearance ?? {}),
          fontSizePx: clampFontSizePx(nextFontSizePx),
        },
      })
    );
  };

  return (
    <div
      className={resolvedVisualOptions.bodyTextClassName}
      style={resolvedVisualOptions.bodyTextStyle}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className={resolvedVisualOptions.mutedTextClassName}>
          Schriftgröße:
        </span>
        <button
          type="button"
          className={resolvedVisualOptions.inlineFieldButtonClassName}
          disabled={
            isLocked || fontSizePx <= labelToolInfoBoxDefaults.fontSizePx.min
          }
          onClick={() =>
            applyFontSizePx(
              fontSizePx - labelToolInfoBoxDefaults.fontSizePx.step
            )
          }
          aria-label="Schriftgröße verkleinern"
        >
          <FontAwesomeIcon icon={faMinus} />
        </button>
        <span className="min-w-[4.5ch] text-center tabular-nums">
          {formatFontSizePercent(fontSizePx)}
        </span>
        <button
          type="button"
          className={resolvedVisualOptions.inlineFieldButtonClassName}
          disabled={
            isLocked || fontSizePx >= labelToolInfoBoxDefaults.fontSizePx.max
          }
          onClick={() =>
            applyFontSizePx(
              fontSizePx + labelToolInfoBoxDefaults.fontSizePx.step
            )
          }
          aria-label="Schriftgröße vergrößern"
        >
          <FontAwesomeIcon icon={faPlus} />
        </button>
      </div>

      <div className="mb-2 flex items-center gap-2">
        <span className={resolvedVisualOptions.mutedTextClassName}>
          Hintergrund:
        </span>
        <input
          type="color"
          className={resolvedVisualOptions.colorInputClassName}
          aria-label="Hintergrundfarbe"
          value={normalizeColorToHex(
            backgroundColor,
            labelToolDefaultBackgroundHex
          )}
          disabled={isLocked}
          onChange={(event) =>
            dispatch(
              updateAnnotationEntryById({
                annotationId: annotation.id,
                labelAppearance: {
                  ...(annotation.labelAppearance ?? {}),
                  backgroundColor: event.target.value,
                },
              })
            )
          }
        />
        <span className={resolvedVisualOptions.mutedTextClassName}>Text:</span>
        <input
          type="color"
          className={resolvedVisualOptions.colorInputClassName}
          aria-label="Textfarbe"
          value={normalizeColorToHex(textColor, labelToolDefaultTextHex)}
          disabled={isLocked}
          onChange={(event) =>
            dispatch(
              updateAnnotationEntryById({
                annotationId: annotation.id,
                labelAppearance: {
                  ...(annotation.labelAppearance ?? {}),
                  textColor: event.target.value,
                },
              })
            )
          }
        />
      </div>
    </div>
  );
};
