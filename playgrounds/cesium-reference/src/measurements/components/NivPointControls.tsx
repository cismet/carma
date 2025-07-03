import { FC } from "react";
import { Checkbox, Radio, Space, Card } from "antd";
import { useCesiumNivPoints } from "../CesiumNivPointContext";

export const NivPointControls: FC = () => {
  const {
    showNivPoints,
    nivPointEntities,
    setShowNivPoints,
    showHistoricNivPoints,
    setShowHistoricNivPoints,
    verticalDatum,
    setVerticalDatum,
  } = useCesiumNivPoints();
  const pointCount = nivPointEntities ? nivPointEntities.length : 0;
  return (
    <Card size="small" title="Höhenfestpunkte">
      <Checkbox
        checked={showNivPoints}
        onChange={(e) => setShowNivPoints(e.target.checked)}
      >
        Zeige Höhenfestpunkte ({pointCount > 0 ? pointCount : "Laden..."})
      </Checkbox>
      <br />

      {showNivPoints && (
        <Space direction="vertical" size="middle">
          <Checkbox
            checked={showHistoricNivPoints}
            onChange={(e) => setShowHistoricNivPoints(e.target.checked)}
          >
            inkl. historische Punkte (ohne Höhe)
          </Checkbox>

          <Radio.Group
            value={verticalDatum}
            onChange={(e) => setVerticalDatum(e.target.value)}
          >
            <Radio.Button value="nhn">NHN (default)</Radio.Button>
            <Radio.Button value="nhn2016">NHN 2016</Radio.Button>
            <Radio.Button value="nn">NN</Radio.Button>
          </Radio.Group>
        </Space>
      )}
    </Card>
  );
};

export default NivPointControls;
