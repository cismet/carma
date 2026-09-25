import React, { useEffect, useState } from "react";
import { Radio, Space } from "antd";
import { BankOutlined, BlockOutlined } from "@ant-design/icons";
import LandParcelKeyChooser from "../LandParcelKeyChooser";
import { FLURSTUECK_ART } from "../../../core/wizard/constants";
import useStammdaten from "../../../core/wizard/useStammdaten";

/**
 * Port of ChangeKindActionPanel. Selecting a parcel preselects the art it does
 * not currently have, and choosing the one it already has is rejected with the
 * message the Swing panel used.
 */
const CHOOSE_PROMPT = "Bitte wählen Sie das Flurstück aus.";

const ChangeKindStep = ({ value, onChange, onProblem }) => {
  const { arten } = useStammdaten();
  const [chooserMessage, setChooserMessage] = useState();
  const key = value.changeKey;
  const target = value.newArtBezeichnung;

  // preselect the other art, as the panel did on every new selection
  useEffect(() => {
    if (!key?.art?.bezeichnung) {
      return;
    }
    const other =
      key.art.bezeichnung === FLURSTUECK_ART.STAEDTISCH
        ? FLURSTUECK_ART.ABTEILUNG_IX
        : FLURSTUECK_ART.STAEDTISCH;
    onChange({ newArtBezeichnung: other });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key?.id]);

  useEffect(() => {
    if (!key) {
      onProblem(chooserMessage ?? CHOOSE_PROMPT);
      return;
    }
    if (!key.art?.bezeichnung) {
      onProblem("Flurstück besitzt keine Art");
      return;
    }
    if (!target) {
      onProblem("Bitte wählen Sie die neue Art des Flurstücks aus");
      return;
    }
    if (target === key.art.bezeichnung) {
      onProblem(
        target === FLURSTUECK_ART.STAEDTISCH
          ? "Flurstück ist bereits städtisch"
          : "Flurstück ist bereits Abteilung IX zugeordnet"
      );
      return;
    }
    if (!arten?.some((art) => art.bezeichnung === target)) {
      onProblem("Gewählte Art kommt in der Datenbank nicht vor");
      return;
    }
    onProblem(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, target, arten, chooserMessage]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-1 font-medium">Flurstück</div>
        <LandParcelKeyChooser
          mode="current"
          prefillCurrent
          incompleteMessage={CHOOSE_PROMPT}
          value={key}
          onChange={(next) => onChange({ changeKey: next })}
          onValidity={(status) =>
            setChooserMessage(status.valid ? undefined : status.message)
          }
        />
      </div>
      <div>
        <div className="mb-1 font-medium">Neue Art des Flurstücks</div>
        <Radio.Group
          value={target}
          disabled={!key}
          onChange={(event) =>
            onChange({ newArtBezeichnung: event.target.value })
          }
        >
          <Space direction="vertical" size={4}>
            <Radio value={FLURSTUECK_ART.STAEDTISCH}>
              <BankOutlined className="mr-1" />
              {FLURSTUECK_ART.STAEDTISCH}
            </Radio>
            <Radio value={FLURSTUECK_ART.ABTEILUNG_IX}>
              <BlockOutlined className="mr-1" />
              {FLURSTUECK_ART.ABTEILUNG_IX}
            </Radio>
          </Space>
        </Radio.Group>
      </div>
    </div>
  );
};

export default ChangeKindStep;
