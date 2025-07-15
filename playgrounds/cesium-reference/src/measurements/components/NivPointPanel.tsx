import React, { FC } from "react";
import { Card, Typography } from "antd";

import { NivPointInfo } from "./NivPointInfo";
import { useCesiumNivPoints } from "../CesiumNivPointContext";

const { Text } = Typography;

export const NivPointPanel: FC = () => {
  const { nearestNivPoint } = useCesiumNivPoints();

  const nivp = nearestNivPoint?.properties.nivpData.getValue();
  console.debug("NivPointPanel", nivp);
  return (
    <Card size="small">
      {nivp ? (
        <NivPointInfo nivp={nivp} />
      ) : (
        <Text type="secondary" style={{ fontSize: 11 }}>
          Kein Höhenfestpunkt gefunden,
          <br />
          bitte 3D-Punktabfrage auswählen.
          <br />
          Dann auf das Stadtmodell klicken
        </Text>
      )}
    </Card>
  );
};

export default NivPointPanel;
