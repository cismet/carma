import { ProgressIndicator } from "@carma-appframeworks/portals";
import { useLibreContext } from "@carma-mapping/contexts";
import { useMapLoadingProgress } from "@carma-mapping/engines/maplibre";

export const MapLoadingProgress = ({
  navbarVisible,
}: {
  navbarVisible: boolean;
}) => {
  const { map } = useLibreContext();
  const { active, percent } = useMapLoadingProgress(map);
  return (
    <ProgressIndicator
      edge
      show={!map || active}
      progress={map ? percent : 0}
      message="Karteninhalt, Terrain und Schatten werden aktualisiert"
      style={{
        color: "rgba(255, 255, 255, 0.75)",
        position: "fixed",
        zIndex: 10001,
        top: navbarVisible
          ? "calc(4rem + var(--system-message-banner-height, 0px))"
          : 0,
      }}
    />
  );
};
