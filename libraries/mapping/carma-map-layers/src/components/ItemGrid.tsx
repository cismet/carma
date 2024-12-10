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
}: ItemGridProps) => {
  if (!categories || categories.length === 0) {
    return null;
  }
  return (
    <>
      {categories.map((category, i) => (
        <div key={category.Title} id={category.Title}>
          {category.layers.length > 0 && (
            <>
              <p className="mb-4 text-2xl font-semibold">{category?.Title}</p>
              <div className="grid xl:grid-cols-7 grid-flow-dense lg:grid-cols-5 sm:grid-cols-4 gap-8 mb-4">
                {category?.layers?.map((layer, i: number) => (
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
                ))}
              </div>
            </>
          )}
        </div>
      ))}
    </>
  );
};

export default ItemGrid;
