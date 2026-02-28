import { FC } from "react";
import { Checkbox, Radio } from "antd";
import { useCesiumNivPoints } from "../CesiumNivPointContext";
import { useCRS } from "../CRSContext";

export const NivPointControls: FC = () => {
  const {
    showNivPoints,
    nivPointEntities,
    setShowNivPoints,
    showHistoricNivPoints,
    setShowHistoricNivPoints,
  } = useCesiumNivPoints();
  const { verticalDatum, setVerticalDatum } = useCRS();
  const pointCount = nivPointEntities ? nivPointEntities.length : 0;
  return (
    <>
      <Checkbox
        checked={showNivPoints}
        onChange={(e) => setShowNivPoints(e.target.checked)}
      >
        Zeige Höhenfestpunkte ({pointCount > 0 ? pointCount : "Laden..."})
      </Checkbox>
      {showNivPoints && (
        <>
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
        </>
      )}
    </>
  );
};

export default NivPointControls;
