import { Card, Progress, Tag } from "antd";
import { TransitionStage } from "@carma-mapping/engines-interop";

interface TransitionProgressProps {
  currentStage: TransitionStage | null;
  lastZoom: number | null;
  lastDistance: number | null;
  lastTerrainHeight: number | null;
  currentFOV: number | null;
}

const STAGE_LABELS: Record<TransitionStage, string> = {
  [TransitionStage.IDLE]: "Idle",
  [TransitionStage.PREPARE_2D]: "Prepare 2D",
  [TransitionStage.ZOOM_OUT]: "Zoom Out",
  [TransitionStage.POSITION_3D_CAMERA]: "Position Camera",
  [TransitionStage.WAIT_RESOURCES]: "Wait Resources",
  [TransitionStage.FADE_IN_3D]: "Fade In 3D",
  [TransitionStage.ANIMATE_CAMERA]: "Animate Camera",
  [TransitionStage.COMPLETE]: "Complete",
  [TransitionStage.ERROR]: "Error",
};

const STAGE_ORDER = [
  TransitionStage.IDLE,
  TransitionStage.PREPARE_2D,
  TransitionStage.ZOOM_OUT,
  TransitionStage.POSITION_3D_CAMERA,
  TransitionStage.WAIT_RESOURCES,
  TransitionStage.FADE_IN_3D,
  TransitionStage.ANIMATE_CAMERA,
  TransitionStage.COMPLETE,
];

export const TransitionProgress = ({
  currentStage,
  lastZoom,
  lastDistance,
  lastTerrainHeight,
  currentFOV,
}: TransitionProgressProps) => {
  if (!currentStage) {
    return null;
  }

  const stageIndex = STAGE_ORDER.indexOf(currentStage);
  const progressPercent =
    stageIndex >= 0 ? ((stageIndex + 1) / STAGE_ORDER.length) * 100 : 0;
  const isComplete = currentStage === TransitionStage.COMPLETE;
  const isError = currentStage === TransitionStage.ERROR;

  return (
    <Card size="small" style={{ marginBottom: "8px" }}>
      <div style={{ marginBottom: "8px" }}>
        <strong>Transition Progress</strong>
      </div>
      <Progress
        percent={progressPercent}
        status={isComplete ? "success" : isError ? "exception" : "active"}
        strokeColor={{ from: "#1890ff", to: "#52c41a" }}
        showInfo={false}
      />
      <div style={{ marginTop: "8px" }}>
        <Tag color={isError ? "red" : isComplete ? "green" : "blue"}>
          {STAGE_LABELS[currentStage]}
        </Tag>
      </div>

      {/* Last Transition Metrics */}
      {(lastZoom !== null ||
        lastDistance !== null ||
        lastTerrainHeight !== null ||
        currentFOV !== null) && (
        <div
          style={{
            marginTop: "12px",
            paddingTop: "8px",
            borderTop: "1px solid #f0f0f0",
          }}
        >
          <div style={{ marginBottom: "4px" }}>
            <strong>Last Transition</strong>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              flexWrap: "wrap",
            }}
          >
            {lastZoom !== null && (
              <Tag color="cyan">Zoom {lastZoom.toFixed(1)}</Tag>
            )}
            {lastDistance !== null && (
              <Tag color="cyan">Dist {lastDistance.toFixed(0)}m</Tag>
            )}
            {lastTerrainHeight !== null && (
              <Tag color="cyan">Ground {lastTerrainHeight.toFixed(1)}m</Tag>
            )}
            {currentFOV !== null && (
              <Tag color="cyan">FOV {currentFOV.toFixed(1)}°</Tag>
            )}
          </div>
        </div>
      )}
    </Card>
  );
};
