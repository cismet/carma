import { useState, useEffect } from "react";
import type { TilesetProgress } from "../hooks/useTilesetManager";

interface TilesetProgressBarsProps {
  tilesets: TilesetProgress[];
}

export function TilesetProgressBars({ tilesets }: TilesetProgressBarsProps) {
  const [fadingOut, setFadingOut] = useState(false);
  const [isHidden, setIsHidden] = useState(false);

  // Only show bars for visible tilesets
  const activeTilesets = tilesets.filter((t) => t.visible);

  // Check if all tiles are loaded
  const allLoaded =
    activeTilesets.length > 0 && activeTilesets.every((t) => t.allTilesLoaded);

  // Trigger fade out when all loaded
  useEffect(() => {
    if (allLoaded && !fadingOut) {
      setFadingOut(true);
      const timeout = setTimeout(() => {
        setIsHidden(true);
        setFadingOut(false);
      }, 1000);
      return () => clearTimeout(timeout);
    } else if (!allLoaded && isHidden) {
      setIsHidden(false);
    }
  }, [allLoaded, fadingOut, isHidden]);

  // Hide if no tilesets or faded out
  if (activeTilesets.length === 0 || isHidden) return null;

  const isLoading = activeTilesets.some((t) => t.progress < 100);

  return (
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        pointerEvents: "none",
        opacity: fadingOut ? 0 : 1,
        transition: "opacity 1s ease-out",
      }}
    >
      {activeTilesets.map((tileset) => (
        <div
          key={tileset.id}
          style={{
            height: "4px",
            width: "100%",
            background: "transparent",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: "100%",
              background: isLoading
                ? "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.8) 50%, rgba(255,255,255,0) 100%)"
                : "rgba(255,255,255,0.6)",
              animation: isLoading ? "pulse 2s ease-in-out infinite" : "none",
            }}
          />
        </div>
      ))}
      <style>
        {`
          @keyframes pulse {
            0%, 100% { opacity: 0.3; }
            50% { opacity: 1; }
          }
        `}
      </style>
    </div>
  );
}
