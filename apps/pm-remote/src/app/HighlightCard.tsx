import type { ShowHighlight } from "@carma-mapping/show-remote";

/**
 * The live scene's stored highlights, one button each. A button switches its
 * spot on the model on or off; several can be on together. Every scene
 * starts with all of them off, and the pointer hides them while it is held.
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
  onToggle: (id: string) => void;
}) => (
  <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <span className="truncate text-xs uppercase tracking-[0.2em] text-neutral-400">
        Hervorhebungen
      </span>
      <span className="shrink-0 text-sm tabular-nums text-neutral-300">
        {on.length > 0 ? `${on.length} an` : "alle aus"}
      </span>
    </div>
    <div className="grid grid-cols-2 gap-3">
      {highlights.map(({ id, title }) => {
        const isOn = on.includes(id);
        return (
          <button
            key={id}
            type="button"
            disabled={disabled}
            aria-pressed={isOn}
            onClick={() => onToggle(id)}
            className={`min-h-[64px] break-words rounded-xl px-3 text-left text-base font-semibold leading-tight disabled:opacity-40 ${
              isOn
                ? "bg-amber-400 text-neutral-950 active:bg-amber-300"
                : "border border-neutral-700 bg-neutral-950 text-neutral-100 active:bg-neutral-800"
            }`}
          >
            {title.trim() || "(ohne Namen)"}
          </button>
        );
      })}
    </div>
  </section>
);
