import { Item } from "@carma-commons/types";
import LayerItem from "./LayerItem";

interface ItemGridProps {
  categories: {
    Title: string;
    layers: Item[];
  }[];
  setAdditionalLayers: any;
  activeLayers: any;
  favorites: any;
  addFavorite: any;
  removeFavorite: any;
  selectedLayerId: any;
  setSelectedLayerId: any;
  setPreview: any;
  isSearch?: boolean;
  setTriggerRefetch: (value: boolean) => void;
  loadingData: boolean;
  loadingCapabilities: boolean;
  currentCategoryIndex: number;
  discoverProps?: {
    appKey: string;
    apiUrl: string;
    daqKey: string;
  };
}

const ItemGrid = ({
  categories,
  setAdditionalLayers,
  activeLayers,
  favorites,
  addFavorite,
  removeFavorite,
  selectedLayerId,
  setSelectedLayerId,
  setPreview,
  isSearch,
  setTriggerRefetch,
  loadingData,
  loadingCapabilities,
  currentCategoryIndex,
  discoverProps,
}: ItemGridProps) => {
  if (loadingCapabilities && currentCategoryIndex === 3) {
    return (
      <div>
        {/* <div className="flex items-center gap-2 pt-8">
          {[...Array(8)].map((_, i) => (
            <div
              key={`loading_tabs_${i}`}
              className="mb-4 h-8 w-32 bg-slate-200 rounded animate-pulse"
            ></div>
          ))}
        </div> */}
        {/* <div className="mb-4 h-10 w-44 bg-slate-200 rounded animate-pulse"></div> */}
        <p className="mb-4 text-2xl font-semibold">POI</p>
        <div className="pt-2 grid xl:grid-cols-7 grid-flow-dense lg:grid-cols-5 sm:grid-cols-3 min-[490px]:grid-cols-2 gap-8 mb-4">
          {[...Array(10)].map((_, i) => (
            <div
              key={i}
              className="bg-white rounded-lg shadow-sm h-80 w-full flex flex-col gap-2 animate-pulse"
            >
              <div className="h-40 p-2 w-full bg-slate-200 rounded-t-lg"></div>
              <div className="h-4 mt-4 bg-slate-200 rounded mx-8 w-2/3"></div>
            </div>
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

  if (isSearch) {
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
                              selectedLayerId={selectedLayerId}
                              setSelectedLayerId={setSelectedLayerId}
                              setPreview={setPreview}
                              setTriggerRefetch={setTriggerRefetch}
                              loadingData={loadingData}
                              discoverProps={discoverProps}
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
                        selectedLayerId={selectedLayerId}
                        setSelectedLayerId={setSelectedLayerId}
                        setPreview={setPreview}
                        setTriggerRefetch={setTriggerRefetch}
                        loadingData={loadingData}
                        discoverProps={discoverProps}
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
