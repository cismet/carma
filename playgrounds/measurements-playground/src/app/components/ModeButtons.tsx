/**
 * Mode selection buttons component
 */

type Mode =
  | "features"
  | "coordinates"
  | "coordinatesUnderPointer"
  | "spider"
  | "spiderRocket"
  | "serious";

interface ModeButtonsProps {
  mode: Mode | null;
  onModeChange: (mode: Mode) => void;
}

export function ModeButtons({ mode, onModeChange }: ModeButtonsProps) {
  const buttonStyle = (isActive: boolean) => ({
    padding: "8px 12px",
    border: "1px solid #ccc",
    borderRadius: "4px",
    background: isActive ? "#4CAF50" : "white",
    color: isActive ? "white" : "black",
    cursor: "pointer",
    fontSize: "14px",
    whiteSpace: "nowrap" as const,
  });

  return (
    <>
      <button
        onClick={() => onModeChange("features")}
        style={buttonStyle(mode === "features")}
      >
        Highlight Features
      </button>
      <button
        onClick={() => onModeChange("coordinates")}
        style={buttonStyle(mode === "coordinates")}
      >
        Highlight Coordinates
      </button>
      <button
        onClick={() => onModeChange("coordinatesUnderPointer")}
        style={buttonStyle(mode === "coordinatesUnderPointer")}
      >
        Highlight Coordinates Under Pointer
      </button>
      <button
        onClick={() => onModeChange("spider")}
        style={buttonStyle(mode === "spider")}
      >
        Spider
      </button>
      <button
        onClick={() => onModeChange("spiderRocket")}
        style={buttonStyle(mode === "spiderRocket")}
      >
        Spider 🚀
      </button>
      <button
        onClick={() => onModeChange("serious")}
        style={buttonStyle(mode === "serious")}
      >
        Serious
      </button>
    </>
  );
}
