import type { Radians } from "@carma-units";
import { shortestAngleDelta } from "@carma-commons/math";
import { unpackIdInfo } from "./imageRecord";
import type { ObliqueDataset, ObliqueDirectionalCatalog } from "../types";

export type CatalogPriority = {
  prioritySeriesId?: string;
  priorityImageId?: string;
  priorityHeadingRad?: Radians;
  priorityCameraView?: "nadir";
};

/** Restored source identity takes precedence; otherwise use measured optical bearing. */
export const resolveDirectionalCatalog = (
  dataset: ObliqueDataset,
  priority: CatalogPriority
): ObliqueDirectionalCatalog | undefined => {
  const groups = dataset.directionalCatalogs ?? [];
  let sourceId = priority.priorityImageId?.split("::").at(-1);
  try {
    if (sourceId) sourceId = decodeURIComponent(sourceId);
  } catch {
    sourceId = undefined;
  }
  const exactGroup = sourceId
    ? dataset.directionalCatalogPriority?.imageGroups[sourceId]
    : undefined;
  const exact = groups.find((group) => group.id === exactGroup);
  if (exact) return exact;
  const legacy = sourceId ? unpackIdInfo(sourceId) : null;
  const modern = sourceId
    ? [
        ...new Set(
          groups.flatMap((group) => [
            ...group.cameraIds,
            ...(group.cameraPrefixes ?? []),
          ])
        ),
      ]
        .map((cameraId) => {
          if (!sourceId!.startsWith(cameraId)) return null;
          const line = /^_?(\d+)_/.exec(sourceId!.slice(cameraId.length));
          return line ? { cameraId, lineIndex: Number(line[1]) } : null;
        })
        .find((identity) => identity !== null)
    : undefined;
  const identity = legacy ?? modern;
  const parity =
    identity?.lineIndex !== undefined && identity.lineIndex % 2 === 0
      ? "EVEN"
      : "ODD";
  const routedId = identity
    ? dataset.directionalCatalogPriority?.cameraLineParity[parity]?.[
        identity.cameraId
      ]
    : undefined;
  const routed = groups.find((group) => group.id === routedId);
  if (routed) return routed;
  const cameraGroups = sourceId
    ? groups.filter((group) =>
        identity
          ? [...group.cameraIds, ...(group.cameraPrefixes ?? [])].includes(
              identity.cameraId
            )
          : [...group.cameraIds, ...(group.cameraPrefixes ?? [])].some((id) =>
              sourceId!.startsWith(`${id}_`)
            )
      )
    : [];
  const sector = identity
    ? dataset.cameraIdToDirection?.[
        identity.lineIndex % 2 === 0 ? "EVEN" : "ODD"
      ]?.[identity.cameraId]
    : undefined;
  const restored =
    sector !== undefined
      ? cameraGroups.find(
          (group) => group.sector === ["N", "E", "S", "W"][sector]
        )
      : cameraGroups.length === 1
      ? cameraGroups[0]
      : undefined;
  if (restored) return restored;
  const candidates = groups.filter((group) =>
    priority.priorityCameraView === "nadir"
      ? group.sector === "nadir"
      : group.sector !== "nadir"
  );
  if (priority.priorityHeadingRad === undefined) return candidates[0];
  return candidates.reduce<ObliqueDirectionalCatalog | undefined>(
    (best, group) =>
      !best ||
      Math.abs(
        shortestAngleDelta(priority.priorityHeadingRad!, group.meanHeadingRad)
      ) <
        Math.abs(
          shortestAngleDelta(priority.priorityHeadingRad!, best.meanHeadingRad)
        )
        ? group
        : best,
    undefined
  );
};
