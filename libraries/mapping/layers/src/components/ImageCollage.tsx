import { Item } from "@carma/types";
import { cn } from "@carma-commons/utils";

interface ImageCollageProps {
  layer: Item;
}

const ImageCollage = ({ layer }: ImageCollageProps) => {
  if (layer.type !== "collection") return;

  const imageCount = Math.min(layer.layers.length, 4);

  const getGridLayout = (count: number) => {
    switch (count) {
      case 1:
        return "grid-cols-1";
      case 2:
        return "grid-cols-2";
      case 3:
        return "grid-cols-3";
      case 4:
        return "grid-cols-4";
      default:
        return "grid-cols-1";
    }
  };

  const getImageClasses = (index: number, count: number) => {
    return "col-span-1";
  };

  const getObjectPosition = (index: number, count: number) => {
    // For images with count 1-4, position based on count and index
    if (count === 2) {
      // For 2 images: left and right
      return index === 0 ? "object-left" : "object-right";
    } else if (count === 3) {
      // For 3 images: left, center, right
      if (index === 0) return "object-left";
      if (index === 1) return "object-center";
      return "object-right";
    } else if (count === 4) {
      // For 4 images: left, left-center, right-center, right
      switch (index) {
        case 0:
          return "object-left";
        case 1:
          return "object-left-center";
        case 2:
          return "object-right-center";
        case 3:
          return "object-right";
      }
    }

    // Default for single image or fallback
    return "object-center";
  };

  return (
    <div className="relative">
      <div
        className={cn(
          "grid aspect-[1.7777/1] overflow-hidden",
          getGridLayout(imageCount)
        )}
      >
        {layer.layers.slice(0, 4).map((item, i) => {
          return (
            <div
              key={`collection_img_${i}`}
              className={cn(
                "relative overflow-hidden bg-muted group",
                getImageClasses(i, imageCount)
              )}
            >
              <img
                src={item.other?.thumbnail || "/placeholder.svg"}
                alt={`Image ${i + 1}`}
                className={cn(
                  "w-full h-full object-cover transition-transform duration-300 group-hover:scale-105",
                  getObjectPosition(i, imageCount)
                )}
              />
            </div>
          );
        })}
      </div>
      {layer.layers.length > 4 && (
        <div className="absolute bottom-2 right-2 bg-black/70 text-white text-sm px-2 py-1 rounded-md font-medium">
          +{layer.layers.length - 4}
        </div>
      )}
    </div>
  );
};

export default ImageCollage;
