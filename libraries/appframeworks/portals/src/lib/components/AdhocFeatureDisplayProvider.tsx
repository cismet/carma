import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Feature, FeatureCollection } from "geojson";
import type {
  CarmaMapLibreStyleData,
  FeatureInfoProperties,
} from "@carma/types";
import type { BoundingSphere } from "@carma/cesium";
import { normalizeAdhocFeatureGeoJsonFeatureIds } from "../utils/adhoc-feature-utils";

export type AdhocFeatureMetadata = {
  accentColor?: string;
  elevatedGeoJson?: Feature | FeatureCollection;
  flyToGeoJson?: Feature | FeatureCollection;
  flyToBoundingSphere?: BoundingSphere;
  hasElevations?: boolean;
  header?: string;
  rehydrated?: boolean;
  title?: string;
  wallHeightMeters?: number;
  wallHeights?: number[];
  [key: string]: unknown;
};

export type AdhocMapLibreStyleFeature = {
  id: string;
  kind: "maplibre-style";
  data: CarmaMapLibreStyleData;
  properties?: FeatureInfoProperties;
  metadata?: AdhocFeatureMetadata;
};

export type AdhocFeatureMetadataUpdate = {
  id: string;
  metadata: Partial<AdhocFeatureMetadata>;
};

export type AdhocFeature = AdhocMapLibreStyleFeature;

export type AdhocFeatureCollectionMetadata = {
  [key: string]: unknown;
};

export type AdhocFeatureCollection = {
  id: string;
  title?: string;
  metadata?: AdhocFeatureCollectionMetadata;
  features: AdhocFeature[];
};

export type AdhocFeatureCollectionSeed = Omit<
  AdhocFeatureCollection,
  "features"
>;

export type AddAdhocFeatureOptions = {
  collectionId?: string;
  collectionTitle?: string;
  collectionMetadata?: AdhocFeatureCollectionMetadata;
};

export type RemoveAdhocFeatureOptions = {
  collectionId?: string;
};

export type SelectedAdhocFeature = {
  id: string;
  collectionId: string;
};

interface AdhocFeatureDisplayContextType {
  featureCollections: AdhocFeatureCollection[];
  features: AdhocFeature[];
  selectedFeature: SelectedAdhocFeature | null;
  shouldFocusSelected: boolean;
  addFeatureCollection: (collection: AdhocFeatureCollectionSeed) => void;
  removeFeatureCollection: (collectionId: string) => void;
  addFeature: (feature: AdhocFeature, options?: AddAdhocFeatureOptions) => void;
  removeFeature: (id: string, options?: RemoveAdhocFeatureOptions) => void;
  updateFeatureMetadata: (
    updates: AdhocFeatureMetadataUpdate | AdhocFeatureMetadataUpdate[]
  ) => void;
  setSelectedFeatureById: (id: string) => void;
  clearSelectedFeature: () => void;
  setShouldFocusSelected: (shouldFocus: boolean) => void;
  clearFeatures: (collectionId?: string) => void;
}

const AdhocFeatureDisplayContext = createContext<
  AdhocFeatureDisplayContextType | undefined
>(undefined);

interface AdhocFeatureDisplayProviderProps {
  children: React.ReactNode;
}

const DEFAULT_ADHOC_FEATURE_COLLECTION_ID = "default";

const mergeAdhocFeature = (
  existingFeature: AdhocFeature,
  incomingFeature: AdhocFeature
): AdhocFeature => ({
  ...existingFeature,
  ...incomingFeature,
  metadata: {
    ...(existingFeature.metadata ?? {}),
    ...(incomingFeature.metadata ?? {}),
  },
});

const hasFeatureInCollection = (
  collection: AdhocFeatureCollection | undefined,
  id: string | null
): boolean =>
  id !== null &&
  !!collection &&
  collection.features.some((feature) => feature.id === id);

const upsertAdhocFeatureCollection = (
  collections: AdhocFeatureCollection[],
  seed: AdhocFeatureCollectionSeed
): AdhocFeatureCollection[] => {
  const existingCollectionIndex = collections.findIndex(
    (collection) => collection.id === seed.id
  );
  if (existingCollectionIndex === -1) {
    return [
      ...collections,
      {
        id: seed.id,
        ...(seed.title ? { title: seed.title } : {}),
        ...(seed.metadata ? { metadata: seed.metadata } : {}),
        features: [],
      },
    ];
  }

  const existingCollection = collections[existingCollectionIndex];
  const shouldUpdateTitle =
    seed.title !== undefined && seed.title !== existingCollection.title;
  const shouldUpdateMetadata = seed.metadata !== undefined;
  if (!shouldUpdateTitle && !shouldUpdateMetadata) {
    return collections;
  }

  const nextCollection: AdhocFeatureCollection = {
    ...existingCollection,
    ...(shouldUpdateTitle ? { title: seed.title } : {}),
    ...(shouldUpdateMetadata
      ? {
          metadata: {
            ...(existingCollection.metadata ?? {}),
            ...seed.metadata,
          },
        }
      : {}),
  };

  const nextCollections = [...collections];
  nextCollections[existingCollectionIndex] = nextCollection;
  return nextCollections;
};

const findAdhocFeatureById = (
  collections: AdhocFeatureCollection[],
  id: string
): AdhocFeature | null => {
  for (const collection of collections) {
    const candidate = collection.features.find((feature) => feature.id === id);
    if (candidate) {
      return candidate;
    }
  }
  return null;
};

const removeAdhocFeatureFromCollections = (
  collections: AdhocFeatureCollection[],
  id: string,
  options?: RemoveAdhocFeatureOptions
): AdhocFeatureCollection[] => {
  const collectionId = options?.collectionId;
  let didChange = false;
  const nextCollections = collections.map((collection) => {
    if (collectionId && collection.id !== collectionId) return collection;
    const nextFeatures = collection.features.filter(
      (feature) => feature.id !== id
    );
    if (nextFeatures.length === collection.features.length) return collection;
    didChange = true;
    return {
      ...collection,
      features: nextFeatures,
    };
  });

  return didChange ? nextCollections : collections;
};

const upsertAdhocFeatureInCollections = (
  collections: AdhocFeatureCollection[],
  feature: AdhocFeature,
  options?: AddAdhocFeatureOptions
): AdhocFeatureCollection[] => {
  const collectionSeed: AdhocFeatureCollectionSeed = {
    id: options?.collectionId ?? DEFAULT_ADHOC_FEATURE_COLLECTION_ID,
    ...(options?.collectionTitle ? { title: options.collectionTitle } : {}),
    ...(options?.collectionMetadata
      ? { metadata: options.collectionMetadata }
      : {}),
  };

  const existingFeature = findAdhocFeatureById(collections, feature.id);
  const mergedFeature = existingFeature
    ? mergeAdhocFeature(existingFeature, feature)
    : feature;

  const withTargetCollection = upsertAdhocFeatureCollection(
    collections,
    collectionSeed
  );
  const withoutFeature = removeAdhocFeatureFromCollections(
    withTargetCollection,
    feature.id
  );
  return withoutFeature.map((collection) =>
    collection.id !== collectionSeed.id
      ? collection
      : {
          ...collection,
          features: [...collection.features, mergedFeature],
        }
  );
};

export function AdhocFeatureDisplayProvider({
  children,
}: AdhocFeatureDisplayProviderProps) {
  const [featureCollections, setFeatureCollections] = useState<
    AdhocFeatureCollection[]
  >([]);
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(
    null
  );
  const [shouldFocusSelected, setShouldFocusSelected] =
    useState<boolean>(false);

  const addFeatureCollection = useCallback(
    (collection: AdhocFeatureCollectionSeed) => {
      setFeatureCollections((prev) =>
        upsertAdhocFeatureCollection(prev, collection)
      );
    },
    []
  );

  const removeFeatureCollection = useCallback(
    (collectionId: string) => {
      let shouldClearSelected = false;
      setFeatureCollections((prev) => {
        const collectionToRemove = prev.find(
          (collection) => collection.id === collectionId
        );
        if (hasFeatureInCollection(collectionToRemove, selectedFeatureId)) {
          shouldClearSelected = true;
        }
        return prev.filter((collection) => collection.id !== collectionId);
      });
      if (shouldClearSelected) {
        setSelectedFeatureId(null);
      }
    },
    [selectedFeatureId]
  );

  const setSelectedFeatureById = useCallback((id: string) => {
    setSelectedFeatureId(id);
  }, []);

  const addFeature = useCallback(
    (feature: AdhocFeature, options?: AddAdhocFeatureOptions) => {
      const targetCollectionId =
        options?.collectionId ?? DEFAULT_ADHOC_FEATURE_COLLECTION_ID;
      const { feature: normalizedFeature, generatedGeoJsonFeatureIds } =
        normalizeAdhocFeatureGeoJsonFeatureIds(feature, {
          collectionId: targetCollectionId,
        });
      if (generatedGeoJsonFeatureIds.length > 0) {
        console.debug("[ADHOC|IMPORT] Generated GeoJSON feature ids", {
          id: feature.id,
          collectionId: targetCollectionId,
          generatedGeoJsonFeatureIds,
        });
      }
      let isNew = false;
      setFeatureCollections((prev) => {
        isNew = findAdhocFeatureById(prev, normalizedFeature.id) === null;
        return upsertAdhocFeatureInCollections(
          prev,
          normalizedFeature,
          options
        );
      });

      const metadata = normalizedFeature.metadata as
        | { rehydrated?: boolean }
        | undefined;
      if (isNew && !metadata?.rehydrated) {
        setSelectedFeatureById(normalizedFeature.id);
        setShouldFocusSelected(true);
      }
    },
    [setSelectedFeatureById, setShouldFocusSelected]
  );

  const removeFeature = useCallback(
    (id: string, options?: RemoveAdhocFeatureOptions) => {
      setFeatureCollections((prev) =>
        removeAdhocFeatureFromCollections(prev, id, options)
      );
      setSelectedFeatureId((current) => (current === id ? null : current));
    },
    []
  );

  const clearSelectedFeature = useCallback(() => {
    setSelectedFeatureId(null);
  }, []);

  const updateFeatureMetadata = useCallback(
    (updates: AdhocFeatureMetadataUpdate | AdhocFeatureMetadataUpdate[]) => {
      const updateList = Array.isArray(updates) ? updates : [updates];
      if (updateList.length === 0) return;

      setFeatureCollections((prev) => {
        const updatesById = new Map(
          updateList.map((update) => [update.id, update.metadata])
        );
        let didChange = false;
        const next = prev.map((collection) => {
          let collectionChanged = false;
          const nextFeatures = collection.features.map((feature) => {
            const update = updatesById.get(feature.id);
            if (!update) return feature;
            didChange = true;
            collectionChanged = true;
            const currentMetadata = feature.metadata ?? {};
            return {
              ...feature,
              metadata: {
                ...currentMetadata,
                ...update,
              },
            };
          });
          if (!collectionChanged) return collection;
          return {
            ...collection,
            features: nextFeatures,
          };
        });

        return didChange ? next : prev;
      });
    },
    []
  );

  const clearFeatures = useCallback(
    (collectionId?: string) => {
      if (!collectionId) {
        setFeatureCollections([]);
        setSelectedFeatureId(null);
        return;
      }

      let shouldClearSelected = false;
      setFeatureCollections((prev) =>
        prev.map((collection) => {
          if (collection.id !== collectionId) return collection;
          if (hasFeatureInCollection(collection, selectedFeatureId)) {
            shouldClearSelected = true;
          }
          return {
            ...collection,
            features: [],
          };
        })
      );
      if (shouldClearSelected) {
        setSelectedFeatureId(null);
      }
    },
    [selectedFeatureId]
  );

  const features = useMemo(
    () => featureCollections.flatMap((collection) => collection.features),
    [featureCollections]
  );

  const selectedFeature = useMemo(() => {
    if (!selectedFeatureId) {
      return null;
    }

    for (const collection of featureCollections) {
      const hasSelectedFeature = collection.features.some(
        (feature) => feature.id === selectedFeatureId
      );
      if (hasSelectedFeature) {
        return {
          id: selectedFeatureId,
          collectionId: collection.id,
        } satisfies SelectedAdhocFeature;
      }
    }

    return null;
  }, [featureCollections, selectedFeatureId]);

  useEffect(() => {
    if (!selectedFeature) return;
    console.debug("[ADHOC|SELECT] Feature selected", {
      id: selectedFeature.id,
      collectionId: selectedFeature.collectionId,
    });
  }, [selectedFeature]);

  const value = useMemo(
    () => ({
      featureCollections,
      features,
      selectedFeature,
      shouldFocusSelected,
      addFeatureCollection,
      removeFeatureCollection,
      addFeature,
      removeFeature,
      updateFeatureMetadata,
      setSelectedFeatureById,
      clearSelectedFeature,
      setShouldFocusSelected,
      clearFeatures,
    }),
    [
      featureCollections,
      features,
      selectedFeature,
      shouldFocusSelected,
      addFeatureCollection,
      removeFeatureCollection,
      addFeature,
      removeFeature,
      updateFeatureMetadata,
      setSelectedFeatureById,
      clearSelectedFeature,
      setShouldFocusSelected,
      clearFeatures,
    ]
  );

  return (
    <AdhocFeatureDisplayContext.Provider value={value}>
      {children}
    </AdhocFeatureDisplayContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAdhocFeatureDisplay() {
  const context = useContext(AdhocFeatureDisplayContext);
  if (context === undefined) {
    throw new Error(
      "useAdhocFeatureDisplay must be used within an AdhocFeatureDisplayProvider"
    );
  }
  return context;
}
