import type { Meta, StoryObj } from "@storybook/react";

import { MeshNivCalibrationScene } from "../components/MeshNivCalibrationScene";

const meta = {
  id: "mesh-2024-hoehenfestpunkt-kalibrierung",
  title: "Mesh 2024/Höhenfestpunkt-Kalibrierung",
  component: MeshNivCalibrationScene,
  parameters: {
    layout: "fullscreen",
    controls: { disable: true },
    docs: {
      description: {
        component:
          "Eigenständige Three.js-Szene zur vertikalen Prüfung des Mesh 2024 an amtlichen Wuppertaler Höhenfestpunkten. Die Kamera fliegt zur groben NIV-Lage; Punktproben treffen per Three-Raycaster die tatsächlich geladenen Mesh-Dreiecke. Für Wandbolzen wird die sichtbare Oberkante markiert, für andere bekannte Marken das geometrische Zentrum. Ausgewertet wird ausschließlich die Höhe: DHHN2016 wird räumlich mit GCG2016 in ETRS89-Ellipsoidhöhe überführt. Wiederholungen werden zunächst je Festpunkt gemittelt, danach werden Bias, MAE, RMSE, Standardabweichung und Spannweite live berechnet. Die amtliche XY-Lage der NIV-Datei dient nur zum Auffinden und fließt nicht in eine Lagefehler-Aussage ein.",
      },
    },
  },
} satisfies Meta<typeof MeshNivCalibrationScene>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BolzenUndBekanntePunkte: Story = {};
