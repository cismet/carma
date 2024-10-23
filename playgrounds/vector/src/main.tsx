import { StrictMode, useEffect, useState } from "react";
import * as ReactDOM from "react-dom/client";
import {
  HashRouter as Router,
  Routes,
  Route,
  useSearchParams,
  useNavigate,
} from "react-router-dom";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";

import LeafletMap from "./app/LeafletMap";
import LibreMap from "./app/LibreMap";

const originalWarn = console.warn.bind(console);
const originalError = console.error.bind(console);
console.warn = (message, ...args) => {
  if (
    message?.includes &&
    !message.includes("ReactDOM.render is no longer supported in React 18")
  ) {
    originalWarn(message, ...args);
  }
};
console.error = (message, ...args) => {
  if (
    message?.includes &&
    !message.includes("ReactDOM.render is no longer supported in React 18")
  ) {
    originalError(message, ...args);
  }
};

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement,
);

const RootComponent = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const vectorStyles = searchParams.get("vectorStyles");

  //check if vectorStyles has more than one url (comma separated).
  //put them in an array and pass it to the App component
  let initialVectorStylesArray: string[] = [];
  if (vectorStyles) {
    initialVectorStylesArray = vectorStyles.split(",");
  }
  const [vectorStylesArray, setVectorStylesArray] = useState<string[]>(
    initialVectorStylesArray,
  );

  useEffect(() => {
    const vectorStyles = searchParams.get("vectorStyles");
    if (vectorStyles) {
      setVectorStylesArray(vectorStyles.split(","));
    } else {
      setVectorStylesArray([]);
    }
  }, [searchParams]);

  useEffect(() => {
    const handleDrop = async (event: DragEvent) => {
      event.preventDefault();

      const url = event.dataTransfer?.getData("URL");
      console.log("handleDrop", url);

      if (url) {
        try {
          // Fetch the content of the URL
          const response = await fetch(url);

          if (response.ok) {
            const contentType = response.headers.get("Content-Type");

            if (contentType?.includes("application/json")) {
              const jsonData = await response.json();
              console.log("JSON content fetched:", jsonData);

              // Store the JSON object in the array
              setVectorStylesArray((prev) => [...prev, jsonData]);
            } else {
              console.warn("The content is not JSON");
            }
          } else {
            console.error("Failed to fetch the URL:", response.statusText);
          }
        } catch (error) {
          console.error("Error fetching URL:", error);
        }
      } else if (
        event.dataTransfer?.files &&
        event.dataTransfer.files.length > 0
      ) {
        // Handle file drop
        const file = event.dataTransfer.files[0]; // Get the first dropped file
        console.log("File dropped:", file.name, file);

        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            // Attempt to parse the file content as JSON
            const fileContent = e.target?.result;
            if (typeof fileContent === "string") {
              const processedContent = fileContent.replace(
                /__SERVER_URL__/g,
                "https://tiles.cismet.de",
              );

              const jsonData = JSON.parse(processedContent);
              console.log("Parsed JSON from file:", jsonData);

              // Add the parsed JSON to the vectorStylesArray
              setVectorStylesArray((prev) => [...prev, jsonData]);
            }
          } catch (error) {
            console.error("Failed to parse the file as JSON:", error);
          }
        };

        reader.readAsText(file); // Read the file as text
      }
    };

    const handleDragOver = (event: DragEvent) => {
      event.preventDefault();
    };

    window.addEventListener("drop", handleDrop);
    window.addEventListener("dragover", handleDragOver);

    return () => {
      window.removeEventListener("drop", handleDrop);
      window.removeEventListener("dragover", handleDragOver);
    };
  }, [searchParams, setSearchParams, navigate]);

  return (
    <div className="App">
      <Routes>
        <Route
          path="/"
          element={<LeafletMap vectorStyles={vectorStylesArray} />}
        ></Route>
        <Route
          path="/leaflet"
          element={<LeafletMap vectorStyles={vectorStylesArray} />}
        ></Route>
        <Route
          path="/maplibre"
          element={<LibreMap vectorStyles={vectorStylesArray} />}
        ></Route>
      </Routes>
    </div>
  );
};

root.render(
  <StrictMode>
    <Router>
      <RootComponent />
    </Router>
  </StrictMode>,
);
