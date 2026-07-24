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
          "HÖHENDATUM DER SZENE: Die Szene rechnet durchgehend in ETRS89-Ellipsoidhöhen (EPSG:4937/4978). " +
          "Der Szenenursprung liegt bei 7.163461245 E / 51.241111235 N, 207.598 m; alle Positionen sind ECEF, " +
          "in ein lokales ENU-Meterframe um diesen Ursprung überführt.\n\n" +
          "VERWENDETE UMRECHNUNGEN: (1) Höhenfestpunkte: amtliche DHHN2016-Höhe (hoehe_ueber_nhn2016) wird räumlich " +
          "variabel mit GCG2016 in ETRS89-Ellipsoidhöhe überführt (h = H + zeta, zeta ~ 46.43 m in Wuppertal) und als " +
          "ECEF abgelegt; die Szene setzt die Marken direkt auf dieses ECEF. (2) Mesh-Treffer: Szenenposition -> ECEF -> " +
          "Ellipsoidhöhe, für die Anzeige mit demselben zeta des jeweiligen Festpunkts zurück nach DHHN2016.\n\n" +
          "BEKANNTE ABWEICHUNG (~46 m): Die Marken schweben rund eine Geoidundulation über dem Mesh. Ursache ist nicht " +
          "die Punktkette, sondern das Mesh 2024 selbst: dessen Kachelgeometrie führt orthometrische DHHN2016-Höhen, " +
          "obwohl sie als ECEF/ellipsoidisch interpretiert wird. Zwei unabhängige Belege: eine Dachprobe an " +
          "METTMANNER STRASSE 6 liefert roh 180.37 m und trifft damit die orthometrische Dachhöhe (Bolzen 169.768 m " +
          "DHHN2016 + Gebäudehöhe), nicht die ellipsoidische (~226 m); und die interaktive Registrierung der " +
          "ellipsoidischen Nordbahntrasse-Punktwolke auf das Mesh löst eine Vertikalverschiebung von -45.911 m " +
          "auf, praktisch identisch mit zeta. Solange das Mesh nicht auf Ellipsoidhöhen gehoben wird, ist der " +
          "ausgewiesene Bias um diesen Betrag versetzt; die Streuung (MAE, RMSE, Spannweite) bleibt aussagekräftig.\n\n" +
          "Eigenständige Three.js-Szene zur vertikalen Prüfung des Mesh 2024 an amtlichen Wuppertaler Höhenfestpunkten. " +
          "Die Kamera fliegt zur groben NIV-Lage; Punktproben treffen per Three-Raycaster die tatsächlich geladenen " +
          "Mesh-Dreiecke. Für Wandbolzen wird die sichtbare Oberkante markiert, für andere bekannte Marken das " +
          "geometrische Zentrum. Wiederholungen werden zunächst je Festpunkt gemittelt, danach werden Bias, MAE, RMSE, " +
          "Standardabweichung und Spannweite live berechnet. Die amtliche XY-Lage der NIV-Datei dient nur zum Auffinden " +
          "und fließt nicht in eine Lagefehler-Aussage ein.",
      },
    },
  },
} satisfies Meta<typeof MeshNivCalibrationScene>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BolzenUndBekanntePunkte: Story = {};
