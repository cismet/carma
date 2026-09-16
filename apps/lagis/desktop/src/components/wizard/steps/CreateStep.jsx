import React, { useState } from "react";
import { Radio, Space } from "antd";
import { BankOutlined, BlockOutlined } from "@ant-design/icons";
import { useSelector } from "react-redux";
import LandParcelKeyChooser from "../LandParcelKeyChooser";
import { getLandparcelInternaDataStructure } from "../../../store/slices/lagis";
import { alkisIdForKey } from "../../../core/wizard/areaCheck";
import { FLURSTUECK_ART } from "../../../core/wizard/constants";

/**
 * Port of CreateActionPanel — pick a not yet existing key and say whether the
 * parcel is städtisch or Abteilung IX. The hint about a missing geometry is the
 * one CreateActionPanel showed when the WFS lookup came back empty.
 */
const CreateStep = ({ value, onChange, onProblem }) => {
  const structure = useSelector(getLandparcelInternaDataStructure);
  const [chooserStatus, setChooserStatus] = useState({ valid: false });

  const isStaedtisch = value.isStaedtisch ?? true;
  const key = value.createKey;
  const geometryMissing = key && !alkisIdForKey(key, structure);

  const handleValidity = (status) => {
    setChooserStatus(status);
    onProblem(status.valid ? null : status.message);
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-1 font-medium">Neues Flurstück</div>
        <LandParcelKeyChooser
          mode="creation"
          value={key}
          onChange={(next) => onChange({ createKey: next })}
          onValidity={handleValidity}
        />
      </div>

      <div>
        <div className="mb-1 font-medium">Art des Flurstücks</div>
        <Radio.Group
          value={isStaedtisch}
          onChange={(event) => onChange({ isStaedtisch: event.target.value })}
        >
          <Space direction="vertical" size={4}>
            <Radio value={true}>
              <BankOutlined className="mr-1" />
              {FLURSTUECK_ART.STAEDTISCH}
            </Radio>
            <Radio value={false}>
              <BlockOutlined className="mr-1" />
              {FLURSTUECK_ART.ABTEILUNG_IX}
            </Radio>
          </Space>
        </Radio.Group>
      </div>

      {chooserStatus.valid && geometryMissing && (
        <div className="text-amber-600 text-sm">
          Zu diesem Flurstück konnte keine Geometrie gefunden werden. Es kann
          angelegt werden, wird aber nicht auf der Karte dargestellt.
        </div>
      )}
    </div>
  );
};

export default CreateStep;
