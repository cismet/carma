import GeoportalMap from "./GeoportalMap";
import MapMeasurement from "./map-measure/MapMeasurement";
import TopNavbar from "./TopNavbar";

const GeoportalLayout = () => {
    console.log("RENDER: [GEOPORTAL] LAYOUT");
    return (
        <div className="flex flex-col w-full " style={{ height: "100dvh" }}>
            <TopNavbar />
            <MapMeasurement />
            <GeoportalMap />
        </div>
    );
};

export default GeoportalLayout;
