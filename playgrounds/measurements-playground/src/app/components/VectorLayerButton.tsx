/**
 * Garbage can button to clear saved vector layer
 */

interface VectorLayerButtonProps {
  hasSavedVectorStyle: boolean;
  onClear: () => void;
}

export function VectorLayerButton({
  hasSavedVectorStyle,
  onClear,
}: VectorLayerButtonProps) {
  if (!hasSavedVectorStyle) {
    return null;
  }

  return (
    <button
      onClick={onClear}
      style={{
        padding: "8px 12px",
        border: "1px solid #ccc",
        borderRadius: "4px",
        background: "white",
        color: "black",
        cursor: "pointer",
        fontSize: "14px",
        whiteSpace: "nowrap",
      }}
      title="Clear saved vector layer"
    >
      🗑️
    </button>
  );
}
