import { Viewer } from 'resium';

function View() {
  return (
    <Viewer
      // ViewerOtherProps (Resium)
      className="App"
      full // equals style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}`
      // CesiumProps
      resolutionScale={window.devicePixelRatio}
    />
  );
}

export default View;
