import { useEffect, useState, type KeyboardEvent } from "react";

import {
  faCheck,
  faMinus,
  faPlus,
  faTrashCan,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { PURE_LABEL_DEFAULTS } from "@carma-mapping/annotations/core";
import {
  resolveAnnotationInfoBoxVisualOptions,
  type AnnotationInfoBoxVisualOptions,
} from "@carma-mapping/annotations/ui";

import {
  getPendingAnnotationIdForTool,
  removeAnnotationById,
  setPendingAnnotationIdByToolType,
  updateAnnotationEntryById,
  useAnnotationsDispatch,
  useAnnotationsSelector,
} from "../../store";
import type { RuntimeAnnotationEntry } from "../../store";

const pureLabelInfoBoxDefaults = Object.freeze({
  fontSizePx: Object.freeze({
    min: 10,
    max: 48,
  }),
});

const toHexChannel = (value: number): string =>
  Math.max(0, Math.min(255, Math.round(value)))
    .toString(16)
    .padStart(2, "0");

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

  const [, r, g, b] = rgbMatch;
  return `#${toHexChannel(Number(r))}${toHexChannel(Number(g))}${toHexChannel(
    Number(b)
  )}`;
};

const clampFontSizePx = (value: number) =>
  Math.min(
    pureLabelInfoBoxDefaults.fontSizePx.max,
    Math.max(pureLabelInfoBoxDefaults.fontSizePx.min, Math.round(value))
  );

const commitDisplayName = ({
  annotation,
  draftDisplayName,
  dispatch,
}: {
  annotation: RuntimeAnnotationEntry;
  draftDisplayName: string;
  dispatch: ReturnType<typeof useAnnotationsDispatch>;
}) => {
  const trimmedDisplayName = draftDisplayName.trim();
  if (!trimmedDisplayName) {
    return;
  }

  dispatch(
    updateAnnotationEntryById({
      annotationId: annotation.id,
      displayName: trimmedDisplayName,
    })
  );
};

export const LabelToolInfoBoxContent = ({
  annotation,
  visualOptions,
}: {
  annotation: RuntimeAnnotationEntry;
  visualOptions?: AnnotationInfoBoxVisualOptions;
}) => {
  const resolvedVisualOptions =
    resolveAnnotationInfoBoxVisualOptions(visualOptions);
  const dispatch = useAnnotationsDispatch();
  const pendingAnnotationId = useAnnotationsSelector((state) =>
    getPendingAnnotationIdForTool(state.draftState, annotation.toolType)
  );
  const isPending = pendingAnnotationId === annotation.id;
  const [draftDisplayName, setDraftDisplayName] = useState(
    annotation.displayName ?? ""
  );
  const isLocked = Boolean(annotation.locked);

  useEffect(() => {
    setDraftDisplayName(annotation.displayName ?? "");
  }, [annotation.displayName]);

  const fontSizePx = clampFontSizePx(
    annotation.labelAppearance?.fontSizePx ?? PURE_LABEL_DEFAULTS.fontSizePx
  );
  const backgroundColor =
    annotation.labelAppearance?.backgroundColor?.trim() ||
    PURE_LABEL_DEFAULTS.backgroundColor;
  const textColor =
    annotation.labelAppearance?.textColor?.trim() ||
    PURE_LABEL_DEFAULTS.textColor;

  const confirmPending = () => {
    dispatch(
      setPendingAnnotationIdByToolType({
        toolType: annotation.toolType,
        annotationId: null,
      })
    );
  };

  const discardPending = () => {
    dispatch(
      removeAnnotationById({
        annotationId: annotation.id,
        nextSelectedAnnotationId: null,
      })
    );
  };

  const handleNameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      commitDisplayName({
        annotation,
        draftDisplayName,
        dispatch,
      });
      if (isPending) {
        confirmPending();
      }
    }
  };

  return (
    <div
      className={resolvedVisualOptions.bodyTextClassName}
      style={resolvedVisualOptions.bodyTextStyle}
    >
      <div className="mb-2">
        <div className={`mb-1 ${resolvedVisualOptions.mutedTextClassName}`}>
          Bezeichnung
        </div>
        <input
          type="text"
          className={`w-full rounded px-2 py-1 ${resolvedVisualOptions.fieldInputBorderClassName}`}
          value={draftDisplayName}
          disabled={isLocked}
          onChange={(event) => setDraftDisplayName(event.target.value)}
          onBlur={() =>
            commitDisplayName({
              annotation,
              draftDisplayName,
              dispatch,
            })
          }
          onKeyDown={handleNameKeyDown}
        />
      </div>

      <div className="mb-2 flex items-center gap-2">
        <span className={resolvedVisualOptions.mutedTextClassName}>
          Schriftgröße:
        </span>
        <button
          type="button"
          className={resolvedVisualOptions.inlineFieldButtonClassName}
          disabled={
            isLocked || fontSizePx <= pureLabelInfoBoxDefaults.fontSizePx.min
          }
          onClick={() =>
            dispatch(
              updateAnnotationEntryById({
                annotationId: annotation.id,
                labelAppearance: {
                  ...(annotation.labelAppearance ?? {}),
                  fontSizePx: clampFontSizePx(fontSizePx - 1),
                },
              })
            )
          }
          aria-label="Schriftgröße verkleinern"
        >
          <FontAwesomeIcon icon={faMinus} />
        </button>
        <span className="min-w-[4ch] text-center tabular-nums">
          {fontSizePx}px
        </span>
        <button
          type="button"
          className={resolvedVisualOptions.inlineFieldButtonClassName}
          disabled={
            isLocked || fontSizePx >= pureLabelInfoBoxDefaults.fontSizePx.max
          }
          onClick={() =>
            dispatch(
              updateAnnotationEntryById({
                annotationId: annotation.id,
                labelAppearance: {
                  ...(annotation.labelAppearance ?? {}),
                  fontSizePx: clampFontSizePx(fontSizePx + 1),
                },
              })
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
          value={normalizeColorToHex(backgroundColor, "#c8c8c8")}
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
          value={normalizeColorToHex(textColor, "#000000")}
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

      {isPending ? (
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            className={resolvedVisualOptions.inlineActionButtonClassName}
            onClick={() => {
              commitDisplayName({
                annotation,
                draftDisplayName,
                dispatch,
              });
              confirmPending();
            }}
          >
            <FontAwesomeIcon icon={faCheck} />
            <span>Übernehmen</span>
          </button>
          <button
            type="button"
            className={resolvedVisualOptions.inlineActionButtonClassName}
            onClick={discardPending}
          >
            <FontAwesomeIcon icon={faTrashCan} />
            <span>Verwerfen</span>
          </button>
        </div>
      ) : null}
    </div>
  );
};
