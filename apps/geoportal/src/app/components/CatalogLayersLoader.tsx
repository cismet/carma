import { useEffect, useRef, useState } from "react";
import { carma } from "@carma-api";
import { useCatalogData } from "@carma-mapping/layers";

/** how long ids still missing may take once the capabilities have settled */
const MISSING_IDS_GRACE_MS = 8000;

type CatalogLayersLoaderProps = {
  /** catalog ids of the applied config, bottom first */
  ids: string[];
  onDone: () => void;
};

/**
 * Adds the `catalogLayerIds` of an applied config the way picking them in the
 * catalog does. Lives inside the LayerCatalogProvider because the ids only
 * resolve once the catalog is assembled; until every id is found it waits,
 * and once the capabilities have settled it gives the rest a grace period and
 * then adds what it has.
 */
export const CatalogLayersLoader = ({
  ids,
  onDone,
}: CatalogLayersLoaderProps) => {
  const { catalogItems, loadingCapabilities } = useCatalogData();
  const [graceOver, setGraceOver] = useState(false);
  const startedRef = useRef<string[] | null>(null);

  useEffect(() => {
    setGraceOver(false);
    if (ids.length === 0 || loadingCapabilities) {
      return;
    }
    const timer = setTimeout(() => setGraceOver(true), MISSING_IDS_GRACE_MS);
    return () => clearTimeout(timer);
  }, [ids, loadingCapabilities]);

  useEffect(() => {
    if (ids.length === 0 || startedRef.current === ids) {
      return;
    }
    const allFound = ids.every((id) => catalogItems.has(id));
    if (!allFound && !graceOver) {
      return;
    }
    startedRef.current = ids;

    (async () => {
      // one after the other: each add appends, so this keeps the order
      for (const id of ids) {
        const added = await carma.mapping2D.addLayer(id);
        if (!added) {
          console.warn(
            "[CATALOG LAYERS] not added (unknown or already on the map)",
            { id }
          );
        }
      }
      onDone();
    })();
  }, [ids, catalogItems, graceOver, onDone]);

  return null;
};
