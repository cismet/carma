import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Feature, FeatureCollection } from "geojson";
import type {
  CarmaMapLibreStyleData,
  FeatureInfoProperties,
} from "@carma/types";
import type { BoundingSphere } from "@carma/cesium";
import {
  getGeoJsonFromFeature,
  normalizeAdhocFeatureGeoJsonFeatureIds,
} from "../utils/adhoc-feature-utils";
import {
  DEFAULT_ADHOC_FEATURE_COLLECTION_ID,
  DEFAULT_ADHOC_FEATURE_LAYER_ID,
} from "../constants/adhoc";

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
  layerId?: string;
  kind: "maplibre-style";
  data: CarmaMapLibreStyleData;
  properties?: FeatureInfoProperties;
  metadata?: AdhocFeatureMetadata;
};

export type AdhocFeatureMetadataUpdate = {
  id: string;
  collectionId?: string;
  layerId?: string;
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
  layerId?: string;
  collectionTitle?: string;
  collectionMetadata?: AdhocFeatureCollectionMetadata;
};

export type RemoveAdhocFeatureOptions = {
  collectionId?: string;
  layerId?: string;
};

export type SelectedAdhocFeature = {
  id: string;
  collectionId: string;
  layerId: string;
};

export type AdhocFeatureSelectionChange = {
  feature: AdhocFeature;
  collectionId: string;
  layerId: string;
};

export type AdhocFeatureSelectionChangeListener = (
  selection: AdhocFeatureSelectionChange | null
) => void;

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
  setSelectedFeatureById: (
    id: string,
    collectionId: string,
    layerId?: string
  ) => void;
  clearSelectedFeature: () => void;
  setShouldFocusSelected: (shouldFocus: boolean) => void;
  clearFeatures: (collectionId?: string, layerId?: string) => void;
  onSelectionChange: (
    listener: AdhocFeatureSelectionChangeListener
  ) => () => void;
}

const AdhocFeatureDisplayContext = createContext<
  AdhocFeatureDisplayContextType | undefined
>(undefined);

interface AdhocFeatureDisplayProviderProps {
  children: React.ReactNode;
  onSelectionChange?: AdhocFeatureSelectionChangeListener;
}

const resolveAdhocFeatureLayerId = (
  feature: AdhocFeature,
  options?: { layerId?: string }
): string =>
  options?.layerId ?? feature.layerId ?? DEFAULT_ADHOC_FEATURE_LAYER_ID;

const matchesSelectedAdhocFeature = (
  feature: AdhocFeature,
  selectedFeature: SelectedAdhocFeature
): boolean =>
  (feature.id === selectedFeature.id ||
    ((): boolean => {
      if (feature.kind !== "maplibre-style") {
        return false;
      }
      const geojson = getGeoJsonFromFeature(feature);
      if (!geojson) {
        return false;
      }
      const features =
        geojson.type === "FeatureCollection" ? geojson.features : [geojson];
      return features.some((geojsonFeature) => {
        if (!geojsonFeature) return false;
        if (
          typeof geojsonFeature.id === "string" ||
          typeof geojsonFeature.id === "number"
        ) {
          return String(geojsonFeature.id) === selectedFeature.id;
        }
        const propertiesId = (
          geojsonFeature.properties as { id?: unknown } | null | undefined
        )?.id;
        if (
          typeof propertiesId === "string" ||
          typeof propertiesId === "number"
        ) {
          return String(propertiesId) === selectedFeature.id;
        }
        return false;
      });
    })()) &&
  resolveAdhocFeatureLayerId(feature) === selectedFeature.layerId;

const findSelectedFeatureInCollection = (
  collection: AdhocFeatureCollection | undefined,
  selectedFeature: SelectedAdhocFeature | null
): AdhocFeature | null => {
  if (!collection || !selectedFeature) {
    return null;
  }
  return (
    collection.features.find((feature) =>
      matchesSelectedAdhocFeature(feature, selectedFeature)
    ) ?? null
  );
};

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
  selectedFeature: SelectedAdhocFeature | null
): boolean =>
  selectedFeature !== null &&
  !!collection &&
  collection.id === selectedFeature.collectionId &&
  findSelectedFeatureInCollection(collection, selectedFeature) !== null;

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

const removeAdhocFeatureFromCollections = (
  collections: AdhocFeatureCollection[],
  id: string,
  options?: RemoveAdhocFeatureOptions
): AdhocFeatureCollection[] => {
  const collectionId = options?.collectionId;
  const layerId = options?.layerId;
  let didChange = false;
  const nextCollections = collections.map((collection) => {
    if (collectionId && collection.id !== collectionId) return collection;
    const nextFeatures = collection.features.filter(
      (feature) =>
        !(
          feature.id === id &&
          (!layerId || resolveAdhocFeatureLayerId(feature) === layerId)
        )
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
  const layerId = resolveAdhocFeatureLayerId(feature, options);
  const normalizedFeature: AdhocFeature = {
    ...feature,
    layerId,
  };
  const collectionSeed: AdhocFeatureCollectionSeed = {
    id: options?.collectionId ?? DEFAULT_ADHOC_FEATURE_COLLECTION_ID,
    ...(options?.collectionTitle ? { title: options.collectionTitle } : {}),
    ...(options?.collectionMetadata
      ? { metadata: options.collectionMetadata }
      : {}),
  };

  const withTargetCollection = upsertAdhocFeatureCollection(
    collections,
    collectionSeed
  );
  return withTargetCollection.map((collection) =>
    collection.id !== collectionSeed.id
      ? collection
      : {
          ...collection,
          features: (() => {
            const existingIndex = collection.features.findIndex(
              (candidate) =>
                candidate.id === normalizedFeature.id &&
                resolveAdhocFeatureLayerId(candidate) === layerId
            );
            if (existingIndex === -1) {
              return [...collection.features, normalizedFeature];
            }

            const existingFeature = collection.features[existingIndex];
            const nextFeatures = [...collection.features];
            nextFeatures[existingIndex] = mergeAdhocFeature(
              existingFeature,
              normalizedFeature
            );
            return nextFeatures;
          })(),
        }
  );
};

export function AdhocFeatureDisplayProvider({
  children,
  onSelectionChange: onSelectionChangeProp,
}: AdhocFeatureDisplayProviderProps) {
  const [featureCollections, setFeatureCollections] = useState<
    AdhocFeatureCollection[]
  >([]);
  const [selectedFeatureSelection, setSelectedFeatureSelection] =
    useState<SelectedAdhocFeature | null>(null);
  const [shouldFocusSelected, setShouldFocusSelected] =
    useState<boolean>(false);
  const selectionChangeListenersRef = useRef<
    Set<AdhocFeatureSelectionChangeListener>
  >(new Set());

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
        if (
          hasFeatureInCollection(collectionToRemove, selectedFeatureSelection)
        ) {
          shouldClearSelected = true;
        }
        return prev.filter((collection) => collection.id !== collectionId);
      });
      if (shouldClearSelected) {
        setSelectedFeatureSelection(null);
      }
    },
    [selectedFeatureSelection]
  );

  const setSelectedFeatureById = useCallback(
    (id: string, collectionId: string, layerId?: string) => {
      setSelectedFeatureSelection({
        id,
        collectionId,
        layerId: layerId ?? DEFAULT_ADHOC_FEATURE_LAYER_ID,
      });
    },
    []
  );

  const addFeature = useCallback(
    (feature: AdhocFeature, options?: AddAdhocFeatureOptions) => {
      const targetCollectionId =
        options?.collectionId ?? DEFAULT_ADHOC_FEATURE_COLLECTION_ID;
      const targetLayerId = resolveAdhocFeatureLayerId(feature, options);
      const featureWithLayerId: AdhocFeature = {
        ...feature,
        layerId: targetLayerId,
      };
      const { feature: normalizedFeature, generatedGeoJsonFeatureIds } =
        normalizeAdhocFeatureGeoJsonFeatureIds(featureWithLayerId);
      if (generatedGeoJsonFeatureIds.length > 0) {
        console.debug("[ADHOC|IMPORT] Generated GeoJSON feature ids", {
          id: feature.id,
          collectionId: targetCollectionId,
          layerId: targetLayerId,
          generatedGeoJsonFeatureIds,
        });
      }
      let isNew = false;
      setFeatureCollections((prev) => {
        const targetCollection = prev.find(
          (collection) => collection.id === targetCollectionId
        );
        isNew =
          !targetCollection ||
          !targetCollection.features.some(
            (candidate) =>
              candidate.id === normalizedFeature.id &&
              resolveAdhocFeatureLayerId(candidate) === targetLayerId
          );
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
        setSelectedFeatureById(
          normalizedFeature.id,
          targetCollectionId,
          targetLayerId
        );
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
      setSelectedFeatureSelection((current) => {
        if (!current || current.id !== id) {
          return current;
        }
        if (
          options?.collectionId &&
          current.collectionId !== options.collectionId
        ) {
          return current;
        }
        if (options?.layerId && current.layerId !== options.layerId) {
          return current;
        }
        return null;
      });
    },
    []
  );

  const clearSelectedFeature = useCallback(() => {
    setSelectedFeatureSelection(null);
  }, []);

  const updateFeatureMetadata = useCallback(
    (updates: AdhocFeatureMetadataUpdate | AdhocFeatureMetadataUpdate[]) => {
      const updateList = Array.isArray(updates) ? updates : [updates];
      if (updateList.length === 0) return;

      setFeatureCollections((prev) => {
        let didChange = false;
        const next = prev.map((collection) => {
          let collectionChanged = false;
          const nextFeatures = collection.features.map((feature) => {
            const update = updateList.find(
              (candidate) =>
                candidate.id === feature.id &&
                (!candidate.collectionId ||
                  candidate.collectionId === collection.id) &&
                (!candidate.layerId ||
                  candidate.layerId === resolveAdhocFeatureLayerId(feature))
            );
            if (!update) {
              return feature;
            }
            didChange = true;
            collectionChanged = true;
            const currentMetadata = feature.metadata ?? {};
            return {
              ...feature,
              metadata: {
                ...currentMetadata,
                ...update.metadata,
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
    (collectionId?: string, layerId?: string) => {
      if (!collectionId) {
        setFeatureCollections([]);
        setSelectedFeatureSelection(null);
        return;
      }

      let shouldClearSelected = false;
      setFeatureCollections((prev) =>
        prev.map((collection) => {
          if (collection.id !== collectionId) return collection;
          const hasMatchingSelectedFeature =
            selectedFeatureSelection !== null &&
            selectedFeatureSelection.collectionId === collectionId &&
            (!layerId || selectedFeatureSelection.layerId === layerId);
          if (
            hasMatchingSelectedFeature &&
            collection.features.some(
              (feature) =>
                feature.id === selectedFeatureSelection?.id &&
                resolveAdhocFeatureLayerId(feature) ===
                  selectedFeatureSelection?.layerId
            )
          ) {
            shouldClearSelected = true;
          }
          const nextFeatures = layerId
            ? collection.features.filter(
                (feature) => resolveAdhocFeatureLayerId(feature) !== layerId
              )
            : [];
          return {
            ...collection,
            features: nextFeatures,
          };
        })
      );
      if (shouldClearSelected) {
        setSelectedFeatureSelection(null);
      }
    },
    [selectedFeatureSelection]
  );

  const onSelectionChange = useCallback(
    (listener: AdhocFeatureSelectionChangeListener) => {
      selectionChangeListenersRef.current.add(listener);
      return () => {
        selectionChangeListenersRef.current.delete(listener);
      };
    },
    []
  );

  const features = useMemo(
    () => featureCollections.flatMap((collection) => collection.features),
    [featureCollections]
  );

  const selectedFeature = useMemo(() => {
    if (!selectedFeatureSelection) {
      return null;
    }

    const selectedCollection = featureCollections.find(
      (collection) => collection.id === selectedFeatureSelection.collectionId
    );
    if (
      !selectedCollection ||
      !findSelectedFeatureInCollection(
        selectedCollection,
        selectedFeatureSelection
      )
    ) {
      return null;
    }

    return selectedFeatureSelection;
  }, [featureCollections, selectedFeatureSelection]);

  const selectedFeatureWithCollection = useMemo(() => {
    if (!selectedFeature) {
      return null;
    }
    const selectedCollection = featureCollections.find(
      (collection) => collection.id === selectedFeature.collectionId
    );
    if (!selectedCollection) {
      return null;
    }
    const feature = findSelectedFeatureInCollection(
      selectedCollection,
      selectedFeature
    );
    if (!feature) {
      return null;
    }
    const selectedFeaturePayload =
      feature.id === selectedFeature.id
        ? feature
        : {
            ...feature,
            id: selectedFeature.id,
          };
    return {
      feature: selectedFeaturePayload,
      collectionId: selectedCollection.id,
      layerId: selectedFeature.layerId,
    } satisfies AdhocFeatureSelectionChange;
  }, [featureCollections, selectedFeature]);

  useEffect(() => {
    if (!selectedFeatureSelection) {
      return;
    }
    if (selectedFeature) {
      return;
    }
    setSelectedFeatureSelection(null);
  }, [selectedFeatureSelection, selectedFeature]);

  useEffect(() => {
    if (!selectedFeatureWithCollection) return;
    console.debug("[ADHOC|SELECT] Feature selected", {
      id: selectedFeatureWithCollection.feature.id,
      collectionId: selectedFeatureWithCollection.collectionId,
      layerId: selectedFeatureWithCollection.layerId,
    });
  }, [selectedFeatureWithCollection]);

  useEffect(() => {
    onSelectionChangeProp?.(selectedFeatureWithCollection);
    selectionChangeListenersRef.current.forEach((listener) => {
      listener(selectedFeatureWithCollection);
    });
  }, [onSelectionChangeProp, selectedFeatureWithCollection]);

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
      onSelectionChange,
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
      onSelectionChange,
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
