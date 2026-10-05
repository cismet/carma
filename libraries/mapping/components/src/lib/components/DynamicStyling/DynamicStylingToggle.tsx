import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { faCircleNodes, faPalette } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { cn } from "@carma-commons/utils";
import { resolveIconUrl } from "@carma-mapping/utils";
import type { DynamicStylingControlProps } from "./DynamicStylingControl";

// FontAwesome icons an option may name in `faIcon`; kept to a short list so
// the bundle does not pull in the whole icon set
const FA_ICONS: Record<string, IconDefinition> = {
  "circle-nodes": faCircleNodes,
};

export const DynamicStylingToggle = ({
  config: toggleConfig,
  carmaLayerId,
  currentSelection,
  onSelectionChange,
  showIcon: showIconProp,
}: DynamicStylingControlProps) => {
  const currentOption = toggleConfig.options.find(
    (o) => o.id === currentSelection
  );
  const showIcon = showIconProp ?? toggleConfig.showIcon !== false;
  const faIcon =
    typeof currentOption?.faIcon === "string"
      ? FA_ICONS[currentOption.faIcon]
      : undefined;

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextOption = toggleConfig.options.find(
      (o) => o.id !== currentSelection
    );
    if (!nextOption) {
      return;
    }
    onSelectionChange(nextOption.id);
  };

  return (
    <div
      // stretch like the row's direct button children so the icon centers
      // on the same line as theirs
      className="flex self-stretch"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {faIcon ? (
        // same look as the layer bar's tool buttons (filter, zoom to extent)
        <button
          id={`stylingLayerButton-${carmaLayerId}`}
          className={cn(
            "px-1.5 flex items-center justify-center text-sm",
            currentOption?.faded
              ? "text-gray-300 hover:text-gray-400"
              : "text-gray-600 hover:text-gray-500"
          )}
          title={currentOption?.title}
          onClick={handleToggle}
        >
          <FontAwesomeIcon icon={faIcon} />
        </button>
      ) : (
        <button
          id={`stylingLayerButton-${carmaLayerId}`}
          className="px-1.5 flex items-center gap-1 justify-center"
          title={currentOption?.title}
          onClick={handleToggle}
        >
          {showIcon && (
            <FontAwesomeIcon
              icon={faPalette}
              className="text-sm text-gray-600 hover:text-gray-500"
            />
          )}
          {resolveIconUrl(currentOption?.icon) ? (
            <img
              src={resolveIconUrl(currentOption?.icon)}
              alt={currentOption?.title}
              className="w-4 h-4 object-contain"
            />
          ) : (
            <FontAwesomeIcon
              icon={faPalette}
              className="text-sm text-gray-400"
            />
          )}
        </button>
      )}
    </div>
  );
};
