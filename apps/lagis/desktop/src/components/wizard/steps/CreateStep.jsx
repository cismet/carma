import React, { useEffect, useState } from "react";
import { Radio, Space } from "antd";
import { BankOutlined, BlockOutlined } from "@ant-design/icons";
import { useSelector } from "react-redux";
import LandParcelKeyChooser from "../LandParcelKeyChooser";
import {
  buildAlkisId,
  fetchGeometryForKey,
} from "../../../core/wizard/geometry";
import { FLURSTUECK_ART } from "../../../core/wizard/constants";

// no point in asking ALKIS while the key is still being typed
const CHECK_DELAY_MS = 400;

const formatArea = (area) =>
  `${Number(area ?? 0).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} m²`;

const CreateStep = ({ value, onChange, onProblem }) => {
  const jwt = useSelector((state) => state.auth.jwt);
  const [chooserStatus, setChooserStatus] = useState({ valid: false });
  const [geometry, setGeometry] = useState({ status: "idle" });

  const key = value.createKey;
  const alkisId = buildAlkisId(key);

  useEffect(() => {
    if (!alkisId) {
      setGeometry({ status: "idle" });
      return undefined;
    }
    let cancelled = false;
    setGeometry({ status: "checking" });
    const timer = setTimeout(async () => {
      try {
        const found = await fetchGeometryForKey(key, jwt);
        if (!cancelled) {
          setGeometry(
            found
              ? { status: "found", area: found.area }
              : { status: "missing" }
          );
        }
      } catch (e) {
        if (!cancelled) {
          setGeometry({ status: "error", message: e.message });
        }
      }
    }, CHECK_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // the ALKIS id identifies the key completely
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alkisId, jwt]);

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
          incompleteMessage="Bitte geben Sie den neuen Flurstücksschlüssel ein"
          value={key}
          onChange={(next) => onChange({ createKey: next })}
          onValidity={handleValidity}
        />
      </div>

      <div>
        <div className="mb-1 font-medium">Art des Flurstücks</div>
        <Radio.Group
          value={value.isStaedtisch ?? true}
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

      {chooserStatus.valid && geometry.status === "checking" && (
        <div className="text-sm text-gray-500">Geometrie wird geprüft...</div>
      )}
      {chooserStatus.valid && geometry.status === "found" && (
        <div className="text-sm text-green-700">
          Geometrie in ALKIS gefunden ({formatArea(geometry.area)}).
        </div>
      )}
      {chooserStatus.valid && geometry.status === "missing" && (
        <div className="text-amber-600 text-sm">
          Zu diesem Flurstück konnte keine Geometrie gefunden werden. Es kann
          angelegt werden, wird aber nicht auf der Karte dargestellt.
        </div>
      )}
      {chooserStatus.valid && geometry.status === "error" && (
        <div className="text-amber-600 text-sm">
          Die Geometrie konnte nicht geprüft werden.
        </div>
      )}
    </div>
  );
};

export default CreateStep;
