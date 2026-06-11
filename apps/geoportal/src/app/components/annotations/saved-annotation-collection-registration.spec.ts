import { describe, expect, it } from "vitest";
import {
  ADHOC_LAYER_SOURCES,
  type AdhocFeature,
  type AdhocFeatureCollection,
  type AdhocLayerSource,
} from "@carma-appframeworks/portals";
import type { Layer } from "@carma-mapping/layers";

import {
  hasVisibleSavedAnnotationCollections,
  resolveActiveSavedAnnotationCollectionIds,
  resolveVisibleSavedAnnotationCollectionIds,
  shouldRegisterSavedAnnotationCollection,
} from "./saved-annotation-collection-registration";

const buildLayer = ({
  id,
  source = ADHOC_LAYER_SOURCES.ANNOTATIONS,
  visible = true,
}: {
  id: string;
  source?: AdhocLayerSource | null;
  visible?: boolean;
}) =>
  ({
    id,
    props: {
      style: source ? { source } : {},
    },
    visible,
  } as Layer);

const buildCollection = ({
  id,
  source = ADHOC_LAYER_SOURCES.ANNOTATIONS,
}: {
  id: string;
  source?: AdhocLayerSource | null;
}): AdhocFeatureCollection => {
  const feature: AdhocFeature = {
    id: `${id}:feature`,
    kind: "maplibre-style",
    data: {
      version: 8,
      sources: {},
      layers: [],
      ...(source ? { source } : {}),
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
      buildLayer({ id: "regular-layer", source: null, visible: true }),
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
        source: null,
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
