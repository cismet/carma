import { Descriptions } from "antd";

import { calcLength } from "../../../../core/helper/featureHelper";

const getLayout4Leitung = ({
  feature,
  jwt,
  dispatch,
  setVisible,
  setIndex,
  showActions = true,
  openLightBox = true,
}) => {
  const laengePart =
    feature?.geometry !== undefined
      ? Math.round(calcLength(feature.geometry) * 100) / 100 + "m"
      : "?m";
  const mainSection = (
    <Descriptions column={{ xs: 1, sm: 1, md: 1, lg: 1, xxl: 1 }} layout='horizontal' bordered>
      <Descriptions.Item label='Typ'>
        {feature.properties?.fk_leitungstyp?.bezeichnung || " "}
      </Descriptions.Item>
      <Descriptions.Item label='Material'>
        {feature.properties?.fk_material?.bezeichnung || " "}
      </Descriptions.Item>
      <Descriptions.Item label='Querschnitt'>
        {feature.properties?.fk_querschnitt?.groesse || " "}
      </Descriptions.Item>
    </Descriptions>
  );

  return {
    title: feature.properties.fk_leitungstyp?.bezeichnung + " " + laengePart,
    mainSection,
    subSections: [],
  };
};

export default getLayout4Leitung;
