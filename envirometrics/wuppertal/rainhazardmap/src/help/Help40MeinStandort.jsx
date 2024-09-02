import React from "react";
import GenericModalMenuSection from "react-cismap/topicmaps/menu/Section";
import MyLocation from "react-cismap/topicmaps/docBlocks/GenericHelpTextForMyLocation";

const Component = () => {
  return (
    <GenericModalMenuSection
      sectionKey='standort'
      sectionTitle='Mein Standort'
      sectionBsStyle='success'
      sectionContent={<MyLocation />}
    />
  );
};
export default Component;
