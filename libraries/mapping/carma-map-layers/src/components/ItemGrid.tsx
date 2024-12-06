import { Item } from "../helper/types";
import LayerItem from "./LayerItem";

interface ItemGridProps {
  categories: {
    Title: string;
    layers: Item[];
  }[];
}

const ItemGrid = ({ categories }: ItemGridProps) => {
  return (
    <>
        {categories.map((category, i) => (
             <div key={category.Title}>
             {category.layers.length > 0 && (
                <>
                 <p className="mb-4 text-2xl font-semibold">
                   {category?.Title}
                 </p>
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
                       showWithoutThumbnail
                     />
                   ))}
                 </div>
                 </>
             )}
           </div>
        ))}
    </>
  )
};

export default ItemGrid;
