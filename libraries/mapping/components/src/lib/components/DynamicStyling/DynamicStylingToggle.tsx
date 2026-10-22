import { faPalette } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { DynamicStylingOptionIcon } from "./DynamicStylingOptionIcon";
import type { DynamicStylingControlProps } from "./DynamicStylingControl";

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
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        id={`stylingLayerButton-${carmaLayerId}`}
        className="px-1.5 flex items-center gap-1 justify-center"
        onClick={handleToggle}
      >
        {showIcon && (
          <FontAwesomeIcon
            icon={faPalette}
            className="text-sm text-gray-600 hover:text-gray-500"
          />
        )}
        <DynamicStylingOptionIcon
          icon={currentOption?.icon}
          title={currentOption?.title}
          fallback={
            <FontAwesomeIcon
              icon={faPalette}
              className="text-sm text-gray-400"
            />
          }
        />
      </button>
    </div>
  );
};
