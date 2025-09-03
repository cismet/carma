import { Item } from "@carma-commons/types";
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
        return "grid-cols-2 grid-rows-2";
      case 4:
        return "grid-cols-2 grid-rows-2";
      default:
        return "grid-cols-1";
    }
  };

  const getImageClasses = (index: number, count: number) => {
    if (count === 3 && index === 2) {
      return "col-span-2"; // Third image spans full width
    }
    return "";
  };

  return (
    <div className="relative">
      <div
        className={cn(
          "grid aspect-[4/3] overflow-hidden",
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
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ImageCollage;
