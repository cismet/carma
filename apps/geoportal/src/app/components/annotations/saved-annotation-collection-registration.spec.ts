import { describe, expect, it, vi } from "vitest";
import type {
  AdhocFeature,
  AdhocFeatureCollection,
} from "@carma-appframeworks/portals";
import type { Layer } from "@carma-mapping/layers";

vi.mock("../../helper/annotation-info-box", () => ({
  layerHasRuntimeAnnotationsGeoJson: (layer: { id?: string }) =>
    layer.id?.startsWith("saved-annotations-") === true,
}));

import {
  hasVisibleSavedAnnotationCollections,
  resolveActiveSavedAnnotationCollectionIds,
  resolveVisibleSavedAnnotationCollectionIds,
  shouldRegisterSavedAnnotationCollection,
} from "./saved-annotation-collection-registration";

const buildLayer = ({
  id,
  visible = true,
}: {
  id: string;
  visible?: boolean;
}) =>
  ({
    id,
    visible,
  } as Layer);

const buildCollection = ({
  id,
  renderAsRuntimeAnnotations = true,
}: {
  id: string;
  renderAsRuntimeAnnotations?: boolean;
}): AdhocFeatureCollection => {
  const feature: AdhocFeature = {
    id: `${id}:feature`,
    kind: "maplibre-style",
    data: {
      version: 8,
      sources: {},
      layers: [],
    },
    metadata: {
      renderAsRuntimeAnnotations,
    },
  };

  return {
    id,
    features: [feature],
  };
};

describe("saved annotation collection registration", () => {
  it("treats only visible saved annotation layers as visible collections", () => {
    const visibleCollectionIds = resolveVisibleSavedAnnotationCollectionIds([
      buildLayer({ id: "saved-annotations-visible", visible: true }),
      buildLayer({ id: "saved-annotations-hidden", visible: false }),
      buildLayer({ id: "regular-layer", visible: true }),
    ]);

    expect([...visibleCollectionIds]).toEqual(["saved-annotations-visible"]);
    expect(
      hasVisibleSavedAnnotationCollections([
        buildLayer({ id: "saved-annotations-hidden", visible: false }),
      ])
    ).toBe(false);
  });

  it("registers runtime annotation collections only when the matching layer is visible", () => {
    const featureCollections = [
      buildCollection({ id: "saved-annotations-visible" }),
      buildCollection({ id: "saved-annotations-hidden" }),
      buildCollection({
        id: "saved-annotations-no-runtime-feature",
        renderAsRuntimeAnnotations: false,
      }),
    ];

    const activeCollectionIds = resolveActiveSavedAnnotationCollectionIds({
      featureCollections,
      layers: [
        buildLayer({ id: "saved-annotations-visible", visible: true }),
        buildLayer({ id: "saved-annotations-hidden", visible: false }),
        buildLayer({
          id: "saved-annotations-no-runtime-feature",
          visible: true,
        }),
      ],
    });

    expect([...activeCollectionIds]).toEqual(["saved-annotations-visible"]);
    expect(
      shouldRegisterSavedAnnotationCollection({
        collection: buildCollection({ id: "saved-annotations-hidden" }),
        visibleCollectionIds: new Set(),
      })
    ).toBe(false);
  });
});
