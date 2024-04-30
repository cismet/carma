import React, { useState, useEffect, useRef, useContext } from 'react';
import RoutedMap from '../RoutedMap';
import { TopicMapContext } from 'react-cismap/contexts/TopicMapContextProvider';

const TempMeasure = (props) => {
  // Other code...

  // Accessing the setRoutedMapRef function from context
  //   const { setRoutedMapRef } = useContext(TopicMapDispatchContext);

  const { routedMapRef } = useContext(TopicMapContext);

  console.log('mmm', routedMapRef);

  // Ref for the Leaflet map
  const leafletRoutedMapRef = useRef(null);

  // useEffect to set the leafletRoutedMapRef when it's ready
  //   useEffect(() => {
  //     console.log('mmm', setRoutedMapRef);
  //     if (leafletRoutedMapRef.current !== null) {
  //       setRoutedMapRef(leafletRoutedMapRef.current);
  //     }
  //   }, [leafletRoutedMapRef, setRoutedMapRef]);

  // Other code...

  return (
    <div>
      111111
      {/* Rendering the RoutedMap component with the leafletRoutedMapRef */}
      {/* <RoutedMap ref={leafletRoutedMapRef} /> */}
      {/* Your other components */}
    </div>
  );
};

export default TempMeasure;
