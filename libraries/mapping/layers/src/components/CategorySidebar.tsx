import { memo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconProp } from "@fortawesome/fontawesome-svg-core";
import { Badge } from "antd";
import { useWindowSize } from "@uidotdev/usehooks";

import "./badge.css";

export interface SidebarEntry {
  id: string;
  label: string;
  icon: IconProp;
  disabled: boolean;
  /** search-hit count shown as badge; only rendered while a search is active */
  count: number;
  showCount: boolean;
}

interface SidebarItemProps {
  entry: SidebarEntry;
  active: boolean;
  onClick: () => void;
}

const SidebarItem = ({ entry, active, onClick }: SidebarItemProps) => {
  const size = useWindowSize();

  return (
    <div
      className={`w-full ${active && "bg-[#f2f2f2]"} ${
        entry.disabled ? "cursor-not-allowed" : "cursor-pointer"
      } ml-6 rounded-l-md py-3 flex flex-col gap-1 items-center`}
      onClick={!entry.disabled ? onClick : undefined}
    >
      <Badge
        count={entry.showCount ? entry.count : 0}
        offset={size.width && size.width < 640 ? [-12, 0] : [0, 0]}
        size={size.width && size.width < 640 ? "small" : "default"}
        color="#9ca3af"
        overflowCount={500}
      >
        <FontAwesomeIcon
          className={`sm:w-9 sm:h-9 w-7 h-7 mr-3 ${
            entry.disabled ? "text-gray-500" : "text-gray-400"
          }`}
          icon={entry.icon}
        />
      </Badge>

      <p
        className={`mb-0 hidden sm:block text-base font-semibold mr-3 ${
          entry.disabled ? "text-gray-500" : "text-gray-400"
        }`}
      >
        {entry.label}
      </p>
    </div>
  );
};

interface CategorySidebarProps {
  entries: SidebarEntry[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

/** the main category rail on the left edge of the catalog */
const CategorySidebar = memo(
  ({ entries, selectedIndex, onSelect }: CategorySidebarProps) => (
    <div
      className={`sm:w-40 w-16 h-full flex justify-between items-center flex-col pb-3 bg-gray-600`}
      style={{ height: "calc(100vh - 188px)" }}
    >
      <div className="flex flex-col w-full items-center gap-2 overflow-y-auto overflow-x-hidden">
        <div className="h-8 sm:h-24"></div>
        {entries.map((entry, index) => (
          <SidebarItem
            key={entry.id}
            entry={entry}
            active={index === selectedIndex}
            onClick={() => onSelect(index)}
          />
        ))}
      </div>
    </div>
  )
);
CategorySidebar.displayName = "CategorySidebar";

export default CategorySidebar;
