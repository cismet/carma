import MarkerContainer from '../../components/CesiumMarkerContainer';

function View() {
  return <MarkerContainer markerData={[
    { position: [7.2, 51.27], elevation: 300 }, 
    { position: [7.2, 51.274], elevation: 250},
    { position: [7.2, 51.278], elevation: 200},
  ]
  } />;
}

export default View;
