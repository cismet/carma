import React from "react";
import { VectorStyleInput } from "./types";

interface LeafletMapProps {
  vectorStyles?: VectorStyleInput[];
  opacity?: number;
}

declare const LeafletMap: React.FC<LeafletMapProps>;

export default LeafletMap;
