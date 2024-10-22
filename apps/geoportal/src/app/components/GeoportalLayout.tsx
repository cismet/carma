import GeoportalMap from "./GeoportalMap";
import MapMeasurement from "./map-measure/MapMeasurement";
import TopNavbar from "./TopNavbar";

// TODO after getting rerenders on load under control, remove the true values

const GeoportalLayout = () => {
    console.log("RENDER: [GEOPORTAL] LAYOUT");
    return (
        <div className="flex flex-col w-full " style={{ height: "100dvh" }}>
            {true && <TopNavbar />}
            {true && <MapMeasurement />}
            {true && <GeoportalMap />}
        </div>
    );
};

export default GeoportalLayout;
