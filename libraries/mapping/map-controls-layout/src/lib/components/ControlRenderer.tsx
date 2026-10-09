import { memo, useCallback, useEffect, useState } from "react";
import type { ControlRegistry } from "../control-registry";
import { filterControls, sortControls } from "../utils/controlHelper";
import { DEFAULT_CONTROL_STYLE_OPTIONS } from "./control-styles";

interface ControlRendererProps {
  registry: ControlRegistry;
}

interface ControlSlotContentProps {
  registry: ControlRegistry;
  id: number;
}

// Registry changes come from `Control` effects. A state setter keeps each
// update in the lane of those effects, so it commits together with the other
// effect updates; useSyncExternalStore would force an extra sync commit.
function useRegistryValue<T>(
  subscribe: (listener: () => void) => () => void,
  read: () => T
): T {
  const [value, setValue] = useState(read);
  useEffect(() => {
    const sync = () => setValue(() => read());
    const unsubscribe = subscribe(sync);
    sync();
    return unsubscribe;
  }, [subscribe, read]);
  return value;
}

const ControlSlotContent = memo(function ControlSlotContent({
  registry,
  id,
}: ControlSlotContentProps) {
  const subscribe = useCallback(
    (listener: () => void) => registry.subscribeContent(id, listener),
    [registry, id]
  );
  const getContent = useCallback(() => registry.getContent(id), [registry, id]);
  return <>{useRegistryValue(subscribe, getContent)}</>;
});

function ControlRenderer({ registry }: ControlRendererProps) {
  const controls = useRegistryValue(registry.subscribeSlots, registry.getSlots);
  const { renderer } = DEFAULT_CONTROL_STYLE_OPTIONS;
  const topLeftControls = controls
    .filter((c) => filterControls(c, "topleft"))
    .sort(sortControls);
  const topRightControls = controls
    .filter((c) => filterControls(c, "topright"))
    .sort(sortControls);
  const topCenterControls = controls
    .filter((c) => filterControls(c, "topcenter"))
    .sort(sortControls);
  const bottomLeftControls = controls
    .filter((c) => filterControls(c, "bottomleft"))
    .sort(sortControls);
  const bottomRightControls = controls
    .filter((c) => filterControls(c, "bottomright"))
    .sort(sortControls);
  const bottomCenterControls = controls
    .filter((c) => filterControls(c, "bottomcenter"))
    .sort(sortControls);
  const hasBottomLeftControls = bottomLeftControls.length > 0;
  const bottomContainerStyle = {
    ...renderer.bottomContainer,
    justifyContent: hasBottomLeftControls ? "space-between" : "flex-end",
  };

  return (
    <>
      {topLeftControls.length > 0 && (
        <div style={renderer.topLeft}>
          {topLeftControls.map((control) => (
            <ControlSlotContent
              key={control.id}
              registry={registry}
              id={control.id}
            />
          ))}
        </div>
      )}

      {topRightControls.length > 0 && (
        <div style={renderer.topRight}>
          {topRightControls.map((control) => (
            <ControlSlotContent
              key={control.id}
              registry={registry}
              id={control.id}
            />
          ))}
        </div>
      )}

      {topCenterControls.length > 0 && (
        <div style={renderer.topCenter}>
          {topCenterControls.map((control) => (
            <div style={renderer.topCenterItem} key={control.id}>
              <ControlSlotContent registry={registry} id={control.id} />
            </div>
          ))}
        </div>
      )}

      {(bottomLeftControls.length > 0 ||
        bottomRightControls.length > 0 ||
        bottomCenterControls.length > 0) && (
        <div style={bottomContainerStyle}>
          {hasBottomLeftControls && (
            <div style={renderer.bottomLeft}>
              {bottomLeftControls.map((control) => (
                <ControlSlotContent
                  key={control.id}
                  registry={registry}
                  id={control.id}
                />
              ))}
            </div>
          )}

          {bottomCenterControls.length > 0 && (
            <div style={renderer.bottomCenter}>
              {bottomCenterControls.map((control) => (
                <div style={renderer.bottomCenterItem} key={control.id}>
                  <ControlSlotContent registry={registry} id={control.id} />
                </div>
              ))}
            </div>
          )}

          {bottomRightControls.length > 0 && (
            <div style={renderer.bottomRight}>
              {bottomRightControls.map((control) => (
                <ControlSlotContent
                  key={control.id}
                  registry={registry}
                  id={control.id}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

export default ControlRenderer;
