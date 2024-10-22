import { useState, useEffect } from "react";
import { getGazData } from "../helper/helper";

export const useGazData = () => {
  const [gazData, setGazData] = useState([]);

  useEffect(() => {
    getGazData(setGazData);
  }, []);

  return gazData;
};
