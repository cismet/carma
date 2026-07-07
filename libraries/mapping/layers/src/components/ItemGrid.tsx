import { Item } from "../lib/contracts/carma-layers.d";
import LayerItem from "./LayerItem";
import ItemSkeleton from "./ItemSkeleton";
import { getLoadingCapabilities } from "../slices/mapLayers";
import { useSelector } from "react-redux";
import type { ActiveLayers } from "./LayerCatalog";

interface ItemGridProps {
  categories: {
    Title: string;
    layers: Item[];
  }[];
  setAdditionalLayers: any;
  activeLayers: ActiveLayers;
  favorites: any;
  addFavorite: any;
  removeFavorite: any;
  setPreview: any;
  isSearchCategory?: boolean;
  isDiscoverCategory?: boolean;
  loadingData: boolean;
  currentCategoryIndex: number;
  currentlySearching?: boolean;
}

const NoItemFound = () => {
  return <div className="text-xl">Keine Ergebnisse gefunden</div>;
};

const ItemGrid = ({
  categories,
  setAdditionalLayers,
  activeLayers,
  favorites,
  addFavorite,
  removeFavorite,
  setPreview,
  isSearchCategory,
  isDiscoverCategory,
  loadingData,
  currentCategoryIndex,
  currentlySearching,
}: ItemGridProps) => {
  const getNumberOfLayers = (
    categories: { Title: string; layers: Item[] }[]
  ) => {
    let numberOfLayers = 0;
    if (!categories) return 0;
    categories.forEach((category) => {
      numberOfLayers += category.layers.length;
    });
    return numberOfLayers;
  };
  const loadingCapabilities = useSelector(getLoadingCapabilities);
  const numberOfLayers = getNumberOfLayers(categories);
  if (
    numberOfLayers === 0 &&
    ((loadingCapabilities && currentCategoryIndex === 3) ||
      (loadingData && isDiscoverCategory))
  ) {
    return (
      <div>
        <div className="pt-2 grid xl:grid-cols-7 grid-flow-dense lg:grid-cols-5 sm:grid-cols-3 min-[490px]:grid-cols-2 gap-8 mb-4">
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

  const getAllUniquePaths = (layers: Item[]) => {
    const paths: string[] = [];

    layers.forEach((layer) => {
      if (layer.path && !paths.includes(layer.path)) {
        paths.push(layer.path);
      }
    });

    return paths;
  };

  if (isSearchCategory) {
    const categoriesWithPath = categories.map((category) => {
      return {
        ...category,
        subCategories: getAllUniquePaths(category.layers).map((path) => {
          return {
            Title: category.Title + " > " + path,
            layers: category.layers.filter((layer) => layer.path === path),
          };
        }),
      };
    });

    if (getNumberOfLayers(categoriesWithPath) === 0) {
      return <NoItemFound />;
    }

    return (
      <>
        {categoriesWithPath.map((category, i) => {
          return (
            <div key={category.Title} id={category.Title}>
              {category.subCategories.length > 0 &&
                category.subCategories.map((subCategory, i) => {
                  return (
                    <div key={subCategory.Title} id={subCategory.Title}>
                      <p className="mb-4 text-2xl font-semibold">
                        {subCategory?.Title}
                      </p>

                      <div className="grid xl:grid-cols-7 grid-flow-dense lg:grid-cols-5 sm:grid-cols-3 min-[490px]:grid-cols-2 gap-8 mb-4">
                        {subCategory?.layers?.map((layer, i: number) => {
                          return (
                            <LayerItem
                              setAdditionalLayers={setAdditionalLayers}
                              layer={layer}
                              activeLayers={activeLayers}
                              favorites={favorites}
                              addFavorite={addFavorite}
                              removeFavorite={removeFavorite}
                              setPreview={setPreview}
                              loadingData={loadingData}
                              key={`${subCategory.Title}_layer_${i}_${layer.id}`}
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
            </div>
          );
        })}
      </>
    );
  }

  if (numberOfLayers === 0 && currentlySearching) {
    return <NoItemFound />;
  }

  return (
    <>
      {categories.map((category, i) => {
        return (
          <div key={category.Title} id={category.Title}>
            {category.layers.length > 0 && (
              <>
                <p className="mb-4 text-2xl font-semibold">{category?.Title}</p>

                <div className="grid xl:grid-cols-7 grid-flow-dense lg:grid-cols-5 sm:grid-cols-3 min-[490px]:grid-cols-2 gap-8 mb-4">
                  {category?.layers?.map((layer, i: number) => {
                    return (
                      <LayerItem
                        setAdditionalLayers={setAdditionalLayers}
                        layer={layer}
                        activeLayers={activeLayers}
                        favorites={favorites}
                        addFavorite={addFavorite}
                        removeFavorite={removeFavorite}
                        setPreview={setPreview}
                        loadingData={loadingData}
                        key={`${category.Title}_layer_${i}_${layer.id}`}
                      />
                    );
                  })}
                </div>
              </>
            )}
          </div>
        );
      })}
    </>
  );
};

export default ItemGrid;
