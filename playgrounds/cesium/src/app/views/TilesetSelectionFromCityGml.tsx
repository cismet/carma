import React from 'react';
import TilesetSelector from '../components/TilesetSelector';
import {
  useSelectionTransparencyControl,
  useTilesetControl,
} from '../utils/controls';
import { CITYGML_TEST_TILESET } from '../config';

function View() {
  useSelectionTransparencyControl();
  useTilesetControl();
  return <TilesetSelector uri={CITYGML_TEST_TILESET.url} />;
}

export default View;
