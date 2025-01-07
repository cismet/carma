import { useState } from "react";
import { Item } from "../helper/types";
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
}: ItemGridProps) => {
  if (!categories || categories.length === 0) {
    return null;
  }

  const [categoriesWithPath, setCategoriesWithPath] = useState([]);

  const getAllUniquePaths = (layers) => {
    const paths: string[] = [];

    layers.forEach((layer: Item) => {
      if (layer.path && !paths.includes(layer.path)) {
        paths.push(layer.path);
      }
    });

    return paths;
  };

  if (isSearch) {
    const tmpCategories = categories.map((category) => {
      let lastPath = category?.layers?.[0]?.path || "";
      return {
        ...category,
        subCategories: getAllUniquePaths(category.layers).map((path) => {
          return {
            Title: category.Title + " | " + path,
            layers: category.layers.filter((layer) => layer.path === path),
          };
        }),
      };
    });

    return (
      <>
        {tmpCategories.map((category, i) => {
          return (
            <div key={category.Title} id={category.Title}>
              {category.subCategories.length > 0 &&
                category.subCategories.map((subCategory, i) => {
                  return (
                    <div key={subCategory.Title} id={subCategory.Title}>
                      <p className="mb-4 text-2xl font-semibold">
                        {subCategory?.Title}
                      </p>

                      <div className="grid xl:grid-cols-7 grid-flow-dense lg:grid-cols-5 sm:grid-cols-4 gap-8 mb-4">
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

                <div className="grid xl:grid-cols-7 grid-flow-dense lg:grid-cols-5 sm:grid-cols-4 gap-8 mb-4">
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
