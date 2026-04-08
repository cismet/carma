import { useEffect, useState, type KeyboardEvent } from "react";

import { faCheck, faMinus, faPlus, faTrashCan } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  PURE_LABEL_DEFAULT_BACKGROUND_COLOR,
  PURE_LABEL_DEFAULT_FONT_SIZE_PX,
  PURE_LABEL_DEFAULT_TEXT_COLOR,
} from "@carma-mapping/annotations/core";

import {
  getPendingAnnotationIdForTool,
  removeAnnotationById,
  setPendingAnnotationIdByToolType,
  updateAnnotationEntryById,
  useAnnotationsDispatch,
  useAnnotationsSelector,
} from "../../store";
import type { RuntimeAnnotationEntry } from "../../store";

const PURE_LABEL_MIN_FONT_SIZE_PX = 10;
const PURE_LABEL_MAX_FONT_SIZE_PX = 48;

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
  Math.min(PURE_LABEL_MAX_FONT_SIZE_PX, Math.max(PURE_LABEL_MIN_FONT_SIZE_PX, Math.round(value)));

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
}: {
  annotation: RuntimeAnnotationEntry;
}) => {
  const dispatch = useAnnotationsDispatch();
  const pendingAnnotationId = useAnnotationsSelector((state) =>
    getPendingAnnotationIdForTool(state.draftState, annotation.toolType)
  );
  const isPending = pendingAnnotationId === annotation.id;
  const [draftDisplayName, setDraftDisplayName] = useState(
    annotation.displayName ?? ""
  );

  useEffect(() => {
    setDraftDisplayName(annotation.displayName ?? "");
  }, [annotation.displayName]);

  const fontSizePx = clampFontSizePx(
    annotation.labelAppearance?.fontSizePx ?? PURE_LABEL_DEFAULT_FONT_SIZE_PX
  );
  const backgroundColor =
    annotation.labelAppearance?.backgroundColor?.trim() ||
    PURE_LABEL_DEFAULT_BACKGROUND_COLOR;
  const textColor =
    annotation.labelAppearance?.textColor?.trim() || PURE_LABEL_DEFAULT_TEXT_COLOR;

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
    <div className="text-[12px] leading-normal text-[#212529]">
      <div className="mb-2">
        <div className="mb-1 text-[#6c757d]">Bezeichnung</div>
        <input
          type="text"
          className="w-full rounded border border-[#ced4da] px-2 py-1"
          value={draftDisplayName}
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
        <span className="text-[#6c757d]">Schriftgröße:</span>
        <button
          type="button"
          className="inline-flex h-5 w-5 items-center justify-center rounded border border-[#ced4da]"
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
          disabled={fontSizePx <= PURE_LABEL_MIN_FONT_SIZE_PX}
          aria-label="Schriftgröße verkleinern"
        >
          <FontAwesomeIcon icon={faMinus} />
        </button>
        <span className="min-w-[48px] text-center tabular-nums">{fontSizePx}px</span>
        <button
          type="button"
          className="inline-flex h-5 w-5 items-center justify-center rounded border border-[#ced4da]"
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
          disabled={fontSizePx >= PURE_LABEL_MAX_FONT_SIZE_PX}
          aria-label="Schriftgröße vergrößern"
        >
          <FontAwesomeIcon icon={faPlus} />
        </button>
      </div>

      <div className="mb-2 flex items-center gap-2">
        <span className="text-[#6c757d]">Hintergrund:</span>
        <input
          type="color"
          className="h-6 w-8 cursor-pointer rounded border border-[#ced4da] bg-transparent p-0"
          aria-label="Hintergrundfarbe"
          value={normalizeColorToHex(backgroundColor, "#c8c8c8")}
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
        <span className="text-[#6c757d]">Text:</span>
        <input
          type="color"
          className="h-6 w-8 cursor-pointer rounded border border-[#ced4da] bg-transparent p-0"
          aria-label="Textfarbe"
          value={normalizeColorToHex(textColor, "#000000")}
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
            className="inline-flex items-center gap-1 rounded border border-[#ced4da] px-2 py-1"
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
            className="inline-flex items-center gap-1 rounded border border-[#ced4da] px-2 py-1"
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
