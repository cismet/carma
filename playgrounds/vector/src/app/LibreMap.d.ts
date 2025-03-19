import React from "react";
import { VectorStyleInput } from "./types";

interface LibreMapProps {
  vectorStyles?: VectorStyleInput[];
  opacity?: number;
}

declare const LibreMap: React.FC<LibreMapProps>;

export default LibreMap;
