import React from 'react';
import {
  useCesium,
} from 'resium';
import {
  Color,
  ConstantProperty,
  defined,
} from 'cesium';


interface ResiumComponentInterface {
  debug?: boolean;
  style?: unknown;
}


// TEMPLATE for ResiumComponent to be use in Resiumcontext
const ResiumComponent: React.FC<ResiumComponentInterface> = ({
  debug = false,
  style,
}) => {
  const { viewer } = useCesium();

  // resium logic here


  return (
    <ResiumComponent
    />
  );
};

export default ResiumComponent;
