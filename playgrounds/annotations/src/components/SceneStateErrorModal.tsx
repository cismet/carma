import { useEffect, useMemo, useState } from "react";

import { Modal } from "antd";
import {
  useCesiumSceneStateErrorOptional,
  useCesiumSceneStateOptional,
} from "@carma-mapping/engines/cesium/react/scene-state";

const isScreenCenterIntersectionError = (error: Error | null): boolean =>
  Boolean(error?.message.includes("Missing screen-center intersection"));

export const SceneStateErrorModal = ({
  fallbackHeightM,
}: {
  fallbackHeightM: number;
}) => {
  const sceneStateError = useCesiumSceneStateErrorOptional();
  const sceneState = useCesiumSceneStateOptional();
  const [dismissedMessage, setDismissedMessage] = useState<string | null>(null);

  const activeMessage = sceneStateError?.message ?? null;
  const open = Boolean(activeMessage && activeMessage !== dismissedMessage);
  const isFallbackActive = sceneState?.orbitPoint?.source === "fallback";

  useEffect(() => {
    if (!sceneStateError) {
      setDismissedMessage(null);
    }
  }, [sceneStateError]);

  const title = useMemo(() => {
    if (isScreenCenterIntersectionError(sceneStateError)) {
      return "Terrain intersection unavailable";
    }
    return "Scene state fallback active";
  }, [sceneStateError]);

  return (
    <Modal
      open={open}
      title={title}
      okText="Continue"
      cancelButtonProps={{ style: { display: "none" } }}
      onOk={() => setDismissedMessage(activeMessage)}
      onCancel={() => setDismissedMessage(activeMessage)}
      maskClosable={true}
      centered={true}
      destroyOnClose={false}
    >
      <div style={{ display: "grid", gap: 10 }}>
        <div>
          The scene-state provider could not intersect the terrain at the screen
          center.
        </div>
        <div>
          We are continuing with a fallback anchor height of{" "}
          <strong>{fallbackHeightM} m</strong>
          {isFallbackActive ? " for the current scene sync." : "."}
        </div>
        {activeMessage ? (
          <pre
            style={{
              margin: 0,
              padding: 12,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              background: "rgba(15, 23, 42, 0.06)",
              borderRadius: 8,
              fontSize: 12,
              lineHeight: 1.4,
            }}
          >
            {activeMessage}
          </pre>
        ) : null}
      </div>
    </Modal>
  );
};
