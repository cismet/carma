import { useCallback, useEffect, useRef } from "react";
import { message } from "antd";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";
import { registerDroppedAssetHandler } from "@carma-commons/utils";
import { registerRuntimeCatalogItems } from "@carma-mapping/layers";
import {
  registerAdHocObliqueAvif,
  useAdHocObliqueDatasets,
  useSavedObliqueAvifs,
  restoreSavedObliqueAvifs,
  saveObliqueAvif,
} from "@carma-mapping/oblique-viewer";
import { useObliqueViewerActions } from "./oblique-actions";

type AdHocObliqueDataset = Awaited<ReturnType<typeof registerAdHocObliqueAvif>>;

/** Host adapter: the feature owns local file storage, calibration and datasets. */
export const AdHocObliqueViewer = () => {
  const datasets = useAdHocObliqueDatasets();
  const saved = useSavedObliqueAvifs();
  const actions = useObliqueViewerActions();
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const { requestTransitionToLeaflet, getIsCesium } =
    useMapFrameworkSwitcherContext();
  const activate = useCallback(
    async (entry: AdHocObliqueDataset) => {
      if (getIsCesium()) await requestTransitionToLeaflet();
      const current = actionsRef.current;
      const enabled =
        current.enabledSeriesIds ??
        current.series
          .filter((series) => series.enabled)
          .map((series) => series.id);
      actions.setEnabledSeriesIds([...enabled, entry.id]);
      actions.setOn(true);
      actions.setPanelOpen(true);
      actions.sendRequest({
        type: "openImage",
        seriesId: entry.id,
        imageId: entry.sourceId,
      });
    },
    [
      actions.setEnabledSeriesIds,
      actions.setOn,
      actions.setPanelOpen,
      actions.sendRequest,
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
        const entry = await registerAdHocObliqueAvif(input, controller.signal, {
          name: file?.name,
        });
        await activate(entry);
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
              name: record.name,
            }));
          await activate(entry);
        },
      }))
    );
    return () => {
      controller.abort();
      unregister();
    };
  }, [saved, datasets, activate]);
  return null;
};
