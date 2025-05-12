import { Badge, Tabs } from "antd";
import { useEffect, useRef, useState } from "react";
import { cn } from "@carma-commons/utils";

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
  const clickedRef = useRef("");
  const isClickedRef = useRef(false);

  clickedRef.current = clickedId;
  isClickedRef.current = tabClicked;

  const handleScrollEnd = () => {
    if (isClickedRef.current) {
      setTabClicked(false);
      setActiveId(clickedRef.current);
      setClickedId("");
    }
  };
  useEffect(() => {
    const scrollContainer = document.getElementById("scrollContainer");
    scrollContainer?.addEventListener("scrollend", handleScrollEnd);

    return () => {
      scrollContainer?.removeEventListener("scroll", handleScrollEnd);
    };
  }, []);

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
                <span
                  className={cn(
                    layer.layers.length === 0
                      ? "text-black/25"
                      : activeId === title
                      ? "text-[#1677ff] hover:text-[#4096ff]"
                      : "text-black/80 hover:text-[#4096ff]"
                  )}
                >
                  {title}
                </span>
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
