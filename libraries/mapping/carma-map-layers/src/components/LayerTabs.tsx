import { Badge, Tabs } from 'antd';
import { Item, XMLLayer } from '../helper/types';

interface LayerTabsProps {
  layers: Item[];
  activeId: string;
  numberOfItems: number;
}

const LayerTabs = ({ layers, activeId, numberOfItems }: LayerTabsProps) => {
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
        activeKey={numberOfItems > 0 ? activeId : ''}
        onTabClick={(key) => {
          document.getElementById(key)?.scrollIntoView({ behavior: 'smooth' });
        }}
      />
    </>
  );
};

export default LayerTabs;
