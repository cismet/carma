import { memo } from "react";

import type { Item } from "../lib/contracts/carma-layers.d";
import type { CatalogSubCategory } from "../hooks/useCatalogSearch";
import { useCatalogSelectedItem } from "../context/LayerCatalogProvider";
import ItemCard from "./ItemCard";
import ItemSkeleton from "./ItemSkeleton";

const GRID_CLASSES =
  "grid xl:grid-cols-7 grid-flow-dense lg:grid-cols-5 sm:grid-cols-3 min-[490px]:grid-cols-2 gap-8 mb-4";

interface CatalogGridProps {
  categories: CatalogSubCategory[] | null;
  /** the source backing the shown category is still loading */
  loadingCurrentCategory: boolean;
  isSearchCategory: boolean;
  /** a search term or attribute filter narrows the results, so an empty
   * grid means "no matches" instead of "nothing here" */
  currentlyNarrowed: boolean;
}

const countLayers = (categories: { layers: readonly unknown[] }[]): number =>
  categories.reduce((sum, category) => sum + category.layers.length, 0);

const getAllUniquePaths = (layers: Item[]): string[] => {
  const paths: string[] = [];
  layers.forEach((layer) => {
    if (layer.path && !paths.includes(layer.path)) {
      paths.push(layer.path);
    }
  });
  return paths;
};

const NoItemFound = () => {
  return <div className="text-xl">Keine Ergebnisse gefunden</div>;
};

interface CategorySectionProps {
  title: string;
  layers: Item[];
  selectedId?: string;
}

const CategorySection = ({
  title,
  layers,
  selectedId,
}: CategorySectionProps) => (
  // content-visibility lets the browser skip rendering off-screen sections
  // (cheap alternative to grid virtualization); the intrinsic size keeps the
  // scrollbar from jumping while sections are skipped
  <div className="[content-visibility:auto] [contain-intrinsic-size:auto_600px]">
    <p className="mb-4 text-2xl font-semibold">{title}</p>
    <div className={GRID_CLASSES}>
      {layers.map((layer, index) => (
        <ItemCard
          layer={layer}
          isSelected={selectedId === layer.id}
          key={`${title}_layer_${index}_${layer.id}`}
        />
      ))}
    </div>
  </div>
);

/** the section list + card grid for the currently shown sidebar category */
const CatalogGrid = memo(
  ({
    categories,
    loadingCurrentCategory,
    isSearchCategory,
    currentlyNarrowed,
  }: CatalogGridProps) => {
    const selectedItem = useCatalogSelectedItem();
    const selectedId = selectedItem?.id;

    const numberOfLayers = categories ? countLayers(categories) : 0;
    if (numberOfLayers === 0 && loadingCurrentCategory) {
      return (
        <div>
          <div className={`pt-2 ${GRID_CLASSES}`}>
            {[...Array(10)].map((_, i) => (
              <ItemSkeleton key={`itemSkeleton_${i}`} />
            ))}
          </div>
        </div>
      );
    }
    if (!categories || categories.length === 0) {
      return null;
    }

    if (isSearchCategory) {
      const categoriesWithPath = categories.map((category) => ({
        ...category,
        subCategories: getAllUniquePaths(category.layers as Item[]).map(
          (path) => ({
            Title: category.Title + " > " + path,
            layers: (category.layers as Item[]).filter(
              (layer) => layer.path === path
            ),
          })
        ),
      }));

      if (
        countLayers(categoriesWithPath.flatMap((c) => c.subCategories)) === 0
      ) {
        return <NoItemFound />;
      }

      return (
        <>
          {categoriesWithPath.map((category) => (
            <div key={category.Title} id={category.Title}>
              {category.subCategories.map((subCategory) => (
                <div key={subCategory.Title} id={subCategory.Title}>
                  <CategorySection
                    title={subCategory.Title}
                    layers={subCategory.layers}
                    selectedId={selectedId}
                  />
                </div>
              ))}
            </div>
          ))}
        </>
      );
    }

    if (numberOfLayers === 0 && currentlyNarrowed) {
      return <NoItemFound />;
    }

    return (
      <>
        {categories.map((category) => (
          <div key={category.Title} id={category.Title}>
            {category.layers.length > 0 && (
              <CategorySection
                title={category.Title}
                layers={category.layers as Item[]}
                selectedId={selectedId}
              />
            )}
          </div>
        ))}
      </>
    );
  }
);
CatalogGrid.displayName = "CatalogGrid";

export default CatalogGrid;
