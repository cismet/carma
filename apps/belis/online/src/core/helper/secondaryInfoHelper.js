export const getSecondaryInfo = (feature) => {
  const description = {};

  switch (feature.featuretype) {
    case "tdta_leuchten":
      {
        description.leuchte = { label: "Leuchte", descriptions: getDescriptions(feature) };
        description.mast = {
          label: "Mast",
          descriptions: getDescriptions({
            featuretype: "tdta_standort_mast",
            properties: feature.properties.fk_standort,
          }),
        };
      }
      break;
    case "Leitung":
    case "leitung":
      {
      }
      break;
    case "mauerlasche":
      {
      }
      break;
    case "schaltstelle":
      {
      }
      break;
    case "abzweigdose":
      {
      }
      break;
    case "tdta_standort_mast":
      {
      }
      break;
    default:
  }
};
const getDescriptions = (feature) => {
  const item = feature.properties;
  const descriptions = [];

  switch (feature.featuretype) {
    case "tdta_leuchten":
      {
        descriptions.push({
          contentstyle: {},
          label: "Inbetriebnahme",
          labelStyle: {},
          span: 1,
          children: item?.inbetriebnahme_leuchte,
        });
        //     descriptions.push({contentstyle:{},label:"",labelStyle:{},span, children:"klsdj"})
        //     descriptions.push({contentstyle:{},label:"",labelStyle:{},span, children:"klsdj"})
        //   descriptions.push({contentstyle:{},label:"",labelStyle:{},span, children:"klsdj"})
      }
      break;
    case "Leitung":
    case "leitung":
      {
      }
      break;
    case "mauerlasche":
      {
      }
      break;
    case "schaltstelle":
      {
      }
      break;
    case "abzweigdose":
      {
      }
      break;
    case "tdta_standort_mast":
      {
        descriptions.push({
          contentstyle: {},
          label: "Masttyp",
          labelStyle: {},
          span: 1,
          children: item?.masttyp?.bezeichnung,
        });
        // descriptions.push({contentstyle:{},label:"",labelStyle:{},span, children:"klsdj"})
        // descriptions.push({contentstyle:{},label:"",labelStyle:{},span, children:"klsdj"})
      }
      break;
    default:
  }
  return descriptions;
};

export const ivAsterisk = (isIntermediateAttribute) => {
  return isIntermediateAttribute === true ? "*" : "";
};
