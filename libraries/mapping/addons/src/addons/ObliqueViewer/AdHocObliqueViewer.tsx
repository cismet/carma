import type { Ratio } from "@carma-units";
import { useCallback, useEffect, useMemo, useState } from "react";
import { message } from "antd";
import type { Map as MaplibreMap } from "maplibre-gl";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";
import { registerDroppedAssetHandler } from "@carma-commons/utils";
import { registerRuntimeCatalogItems } from "@carma-mapping/layers";
import {
  ObliqueViewer as FeatureViewer,
  ObliqueViewerActionsProvider,
  registerAdHocObliqueAvif,
  useAdHocObliqueDatasets,
  useSavedObliqueAvifs,
  restoreSavedObliqueAvifs,
  saveObliqueAvif,
} from "@carma-mapping/oblique-viewer";
import { useObliqueViewerActions } from "./oblique-actions";

/** Host adapter: the feature owns local file storage, calibration and datasets. */
export const AdHocObliqueViewer = ({
  libreMap,
}: {
  libreMap: MaplibreMap | null;
}) => {
  const datasets = useAdHocObliqueDatasets();
  const saved = useSavedObliqueAvifs();
  const actions = useObliqueViewerActions();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activation, setActivation] = useState(0);
  const { requestTransitionToLeaflet, getIsCesium } =
    useMapFrameworkSwitcherContext();
  const activate = useCallback(
    async (id: string) => {
      if (getIsCesium()) await requestTransitionToLeaflet();
      actions.publish({
        isBusy: false,
        error: null,
        previewVisible: false,
        viewMode: "oblique",
        selectedImageId: null,
      });
      actions.setEnabledSeriesIds([id]);
      actions.setOn(true);
      actions.setPanelOpen(true);
      setActiveId(id);
      setActivation((value) => value + 1);
    },
    [
      actions.publish,
      actions.setEnabledSeriesIds,
      actions.setOn,
      actions.setPanelOpen,
      getIsCesium,
      requestTransitionToLeaflet,
    ]
  );
  useEffect(() => {
    void restoreSavedObliqueAvifs().catch(() =>
      message.warning("Lokal gespeicherte Bilder konnten nicht geladen werden.")
    );
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const unregister = registerDroppedAssetHandler({
      accepts: ({ file, url }) =>
        !!(
          file &&
          (file.type === "image/avif" || /\.avif$/i.test(file.name))
        ) || !!(url && /\.avif(?:[?#]|$)/i.test(url)),
      import: async ({ file, url }) => {
        const input = file ?? url!;
        const entry = await registerAdHocObliqueAvif(input, controller.signal);
        await activate(entry.id);
        // Disk writes must not delay the first preview or camera flight.
        void saveObliqueAvif({
          id: entry.id,
          sourceId: entry.sourceId,
          name: file?.name ?? entry.sourceId,
          input,
          savedAt: Date.now(),
        }).catch(() =>
          message.warning(
            "Das Bild ist geöffnet, konnte aber nicht dauerhaft lokal gespeichert werden."
          )
        );
      },
    });
    return () => {
      controller.abort();
      unregister();
    };
  }, [activate]);
  useEffect(() => {
    const controller = new AbortController();
    const unregister = registerRuntimeCatalogItems(
      saved.map((record) => ({
        categoryId: "objects",
        item: {
          id: record.id,
          title: record.name,
          description:
            "Lokal gespeichertes Schrägluftbild. Öffnen lädt seine eingebettete Vorschau und Kamerakalibrierung ohne Bildkatalog.",
          type: "object" as const,
          layerType: "vector" as const,
          props: { style: { version: 8 as const, sources: {}, layers: [] } },
          serviceName: "local-oblique-avif",
          path: "Eigene Schrägluftbilder",
          tags: ["AVIF", "Schrägluftbild", "lokal"],
        },
        activate: async () => {
          const existing = datasets.find((entry) => entry.id === record.id);
          const entry =
            existing ??
            (await registerAdHocObliqueAvif(record.input, controller.signal, {
              id: record.id,
            }));
          await activate(entry.id);
        },
      }))
    );
    return () => {
      controller.abort();
      unregister();
    };
  }, [saved, datasets, activate]);
  const active = datasets.find((entry) => entry.id === activeId);
  const config = useMemo(
    () =>
      active
        ? {
            series: [active.dataset],
            nextInterface: true,
            startEnabled: true,
            initialPreviewFlyToImage: true,
            animations: { flyToExteriorOrientation: { duration: 900 } },
            prioritySeriesId: active.id,
            previewState: {
              initial: {
                seriesId: active.id,
                imageId: active.sourceId,
                panX: 0 as Ratio,
                panY: 0 as Ratio,
                zoom: 0.9 as Ratio,
              },
              onChange: () => {},
            },
          }
        : null,
    [active]
  );
  return config && active ? (
    <ObliqueViewerActionsProvider actions={actions}>
      <FeatureViewer
        key={`${active.id}:${activation}`}
        config={config}
        libreMap={libreMap}
      />
    </ObliqueViewerActionsProvider>
  ) : null;
};
