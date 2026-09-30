import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faXmark } from "@fortawesome/free-solid-svg-icons";
import { Input, Tooltip } from "antd";

import { useSpotHighlightsActions } from "./spot-actions";

const ICON_BUTTON =
  "flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent hover:bg-black/5";

/**
 * The spot layer's ribbon, opened from its row. While it is open the spots
 * edit on the map (`useSpotEditing`), so the header says how.
 *
 * Header: the "+" that waits for the click placing the next spot, the hint,
 * and how dark the rest is. Below it, one name per spot: the name its button
 * gets on the remote, with the ✕ that takes the spot away.
 */
export const SpotHighlightsPanel = () => {
  const {
    hasRow,
    spots,
    dim,
    isPlacing,
    startPlacing,
    cancelPlacing,
    renameSpot,
    removeSpot,
  } = useSpotHighlightsActions();

  if (!hasRow) {
    return null;
  }

  const hint = isPlacing
    ? "Klick in die Karte setzt die Hervorhebung. Esc bricht ab."
    : spots.length === 0
    ? "Mit + und einem Klick in die Karte eine Hervorhebung setzen."
    : "Mausrad auf einem Kreis ändert die Größe, daneben das Abdunkeln. Kreise lassen sich verschieben.";

  return (
    <div
      className="w-[100vw] sm:w-[86vw] sm:max-w-[680px] md:max-w-[760px] shrink-0 bg-white rounded-[10px] px-4 py-2 shadow-lg"
      data-test-id="spot-highlights-panel"
    >
      <div className="flex items-center gap-3 text-sm text-gray-700">
        <Tooltip
          title={isPlacing ? "Setzen abbrechen" : "Hervorhebung setzen"}
          placement="top"
        >
          <button
            type="button"
            aria-label={isPlacing ? "Setzen abbrechen" : "Hervorhebung setzen"}
            aria-pressed={isPlacing}
            onClick={isPlacing ? cancelPlacing : startPlacing}
            className={`${ICON_BUTTON} ${
              isPlacing ? "text-[#1677ff]" : "text-gray-600"
            }`}
          >
            <FontAwesomeIcon icon={faPlus} />
          </button>
        </Tooltip>

        <span
          className={`grow text-sm ${
            isPlacing ? "text-amber-700" : "text-gray-500"
          }`}
        >
          {hint}
        </span>

        <Tooltip
          title="Mausrad neben den Kreisen: dunkler oder heller"
          placement="top"
        >
          <span className="shrink-0 whitespace-nowrap tabular-nums">
            Abdunkeln {Math.round(dim * 100)} %
          </span>
        </Tooltip>
      </div>

      {spots.length > 0 && (
        <div className="mt-2 border-0 border-t border-solid border-gray-200 pt-2">
          <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">
            Knöpfe auf der Fernbedienung
            <span className="ml-2 font-normal normal-case tracking-normal">
              gleicher Name, ein Knopf
            </span>
          </h3>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {spots.map((spot) => (
              <div key={spot.id} className="flex items-center gap-1">
                <Input
                  size="small"
                  value={spot.title}
                  onChange={(event) => renameSpot(spot.id, event.target.value)}
                  aria-label="Name des Knopfs"
                  className="w-32"
                />
                <span className="w-12 text-right text-xs tabular-nums text-gray-500">
                  {Math.round(spot.radiusMeters)} m
                </span>
                <Tooltip title="Hervorhebung entfernen" placement="top">
                  <button
                    type="button"
                    aria-label="Hervorhebung entfernen"
                    onClick={() => removeSpot(spot.id)}
                    className={`${ICON_BUTTON} text-gray-600`}
                  >
                    <FontAwesomeIcon icon={faXmark} />
                  </button>
                </Tooltip>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
