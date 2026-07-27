import { memo } from "react";
import { Badge, Spin, Tabs } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import { cn } from "@carma-commons/utils";

import { useCatalogData } from "../context/LayerCatalogProvider";
import type { CatalogSubCategory } from "../hooks/useCatalogSearch";

interface CategoryTabsProps {
  categories: CatalogSubCategory[] | null;
  activeId: string;
  /** the scroll-spy scrolls to the section and pins the highlight */
  onTabClick: (id: string) => void;
}

/** one tab per shown subcategory, highlight driven by the scroll-spy */
const CategoryTabs = memo(
  ({ categories, activeId, onTabClick }: CategoryTabsProps) => {
    const { loadingServiceIds, loadingCapabilities } = useCatalogData();

    if (!categories) {
      return null;
    }
    const hasItems = categories.some((category) => category.layers.length > 0);

    return (
      <Tabs
        defaultActiveKey="1"
        items={categories.map((category) => {
          const title = category.Title;
          return {
            key: title,
            label: (
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    category.layers.length === 0
                      ? "text-black/25"
                      : activeId === title
                      ? "text-[#1677ff] hover:text-[#4096ff]"
                      : "text-black/80 hover:text-[#4096ff]"
                  )}
                >
                  {title}
                </span>
                {category.id !== undefined &&
                  loadingServiceIds.includes(category.id) &&
                  category.layers.length === 0 &&
                  !loadingCapabilities && (
                    <Spin indicator={<LoadingOutlined spin />} size="small" />
                  )}
                {category.layers.length > 0 && (
                  <Badge count={category.layers.length} color="#808080" />
                )}
              </div>
            ),
            disabled: category.layers.length === 0,
          };
        })}
        activeKey={hasItems ? activeId : ""}
        onTabClick={onTabClick}
      />
    );
  }
);
CategoryTabs.displayName = "CategoryTabs";

export default CategoryTabs;
