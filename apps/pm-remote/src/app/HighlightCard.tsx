import {
  highlightButtons,
  type ShowHighlight,
} from "@carma-mapping/show-remote";

/**
 * The live scene's stored highlights, one button per name: spots named alike
 * switch on and off together. A scene comes up with all of them on, so a
 * scene shows its highlights without a press; a button switches its spots
 * off and on again. The pointer hides them while it is held.
 */
export const HighlightCard = ({
  highlights,
  on,
  disabled,
  onToggle,
}: {
  highlights: readonly ShowHighlight[];
  on: readonly string[];
  disabled: boolean;
  onToggle: (ids: readonly string[]) => void;
}) => {
  const buttons = highlightButtons(highlights).map((button) => ({
    ...button,
    isOn: button.ids.every((id) => on.includes(id)),
  }));
  const onCount = buttons.filter(({ isOn }) => isOn).length;
  return (
    <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <span className="truncate text-xs uppercase tracking-[0.2em] text-neutral-400">
          Hervorhebungen
        </span>
        <span className="shrink-0 text-sm tabular-nums text-neutral-300">
          {onCount > 0 ? `${onCount} an` : "alle aus"}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {buttons.map(({ key, title, ids, isOn }) => (
          <button
            key={key}
            type="button"
            disabled={disabled}
            aria-pressed={isOn}
            onClick={() => onToggle(ids)}
            className={`min-h-[64px] break-words rounded-xl px-3 text-left text-base font-semibold leading-tight disabled:opacity-40 ${
              isOn
                ? "bg-amber-400 text-neutral-950 active:bg-amber-300"
                : "border border-neutral-700 bg-neutral-950 text-neutral-100 active:bg-neutral-800"
            }`}
          >
            {title || "(ohne Namen)"}
          </button>
        ))}
      </div>
    </section>
  );
};
