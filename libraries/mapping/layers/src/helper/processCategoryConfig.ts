import type { SavedLayerConfig } from "@carma/types";
import type { Dispatch, SetStateAction } from "react";

interface ProcessCategoryConfigParams {
  config: any[];
  categoryId: string;
  flags: Record<string, any>;
  addItemToCategory: (
    categoryId: string,
    subCategory: { id: string; Title: string },
    item: SavedLayerConfig | SavedLayerConfig[]
  ) => void;
  setSidebarElements: Dispatch<
    SetStateAction<
      {
        icon: any;
        text: string;
        id: string;
        disabled?: boolean;
      }[]
    >
  >;
  setLoading?: (loading: boolean) => void;
}

export const processCategoryConfig = ({
  config,
  categoryId,
  flags,
  addItemToCategory,
  setSidebarElements,
  setLoading,
}: ProcessCategoryConfigParams) => {
  if (config.length > 0) {
    const hasItems = config.some((c) => {
      if (!c.layers || c.layers.length === 0) return false;
      const availableLayers = c.layers.filter((layer) => {
        if (layer.ff) return flags[layer.ff as string];
        return true;
      });
      return availableLayers.length > 0;
    });

    setSidebarElements((prev) =>
      prev.map((element) =>
        element.id === categoryId
          ? { ...element, disabled: !hasItems }
          : element
      )
    );

    [...config].reverse().forEach((c, i) => {
      const layers = c.layers
        .filter((layer) => {
          if (layer.ff) return flags[layer.ff as string];
          return true;
        })
        .map((layer) => ({
          ...layer,
          serviceName: c.serviceName || layer.serviceName,
        }));

      if (layers.length === 0) return;

      if (c.Title) {
        addItemToCategory(
          categoryId,
          { id: c.id || c.serviceName, Title: c.Title },
          layers
        );
      }

      if (i === config.length - 1) {
        setLoading?.(false);
      }
    });
  } else {
    setSidebarElements((prev) =>
      prev.map((element) =>
        element.id === categoryId ? { ...element, disabled: true } : element
      )
    );
    setLoading?.(false);
  }
};
