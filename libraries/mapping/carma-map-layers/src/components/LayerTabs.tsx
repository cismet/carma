import { Badge, Tabs } from "antd";
import { useEffect, useState } from "react";

interface LayerTabsProps {
  // TODO add type for layers
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  layers?: any[];
  activeId: string;
  setActiveId: (id: string) => void;
  numberOfItems: number;
}

const LayerTabs = ({
  layers,
  activeId,
  setActiveId,
  numberOfItems,
}: LayerTabsProps) => {
  const [tabClicked, setTabClicked] = useState(false);
  const [clickedId, setClickedId] = useState("");

  useEffect(() => {
    const handleScrollEnd = () => {
      if (tabClicked) {
        setTabClicked(false);
        setActiveId(clickedId);
        setClickedId("");
      }
    };

    const scrollContainer = document.getElementById("scrollContainer");
    scrollContainer?.addEventListener("scrollend", handleScrollEnd);

    return () => {
      scrollContainer?.removeEventListener("scroll", handleScrollEnd);
    };
  }, [tabClicked]);

  if (!layers) {
    return null;
  }

  return (
    <>
      <Tabs
        defaultActiveKey="1"
        items={layers.map((layer, i) => {
          const title = layer.Title;
          return {
            key: title,
            label: (
              <div className="flex items-center gap-2">
                <span>{title}</span>
                {layer.layers.length > 0 && (
                  <Badge count={layer.layers.length} color="#808080" />
                )}
              </div>
            ),
            disabled: layer.layers.length === 0,
          };
        })}
        activeKey={numberOfItems > 0 ? activeId : ""}
        onTabClick={(key) => {
          document.getElementById(key)?.scrollIntoView({ behavior: "smooth" });
          setTabClicked(true);
          setClickedId(key);
        }}
      />
    </>
  );
};

export default LayerTabs;
