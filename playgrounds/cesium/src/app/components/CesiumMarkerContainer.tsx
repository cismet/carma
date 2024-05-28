import React, { useMemo } from 'react';
import {
  useCesium,
  BillboardCollection,
  BillboardGraphics,
  Entity,
  PolylineGraphics,
} from 'resium';
import {
  Cartesian3,
  Color,
  ColorMaterialProperty,
  ConstantProperty,
  VerticalOrigin,
} from 'cesium';
import { faHouseUser } from '@fortawesome/free-solid-svg-icons';
import { APP_BASE_PATH } from '../config';

interface MarkerData {
  position: [number, number];
  elevation?: number;
  name?: string;
  id?: string;
  category?: string;
  description?: string;
  image?: string;
  // Add other properties as needed
}

interface MarkerContainerProps {
  debug?: boolean;
  style?: unknown;
  markerData: MarkerData[];
}

const svgIcon = faHouseUser.icon[4];
console.log('svgIcon', svgIcon);
const pngUri = `${APP_BASE_PATH}data/img/polygon.png`;

const MarkerContainer: React.FC<MarkerContainerProps> = ({
  debug = false,
  style,
  markerData,
}) => {
  const { viewer } = useCesium();

  const entities = useMemo(
    () =>
      markerData.map(
        ({ image = svgIcon, id, position: [x, y], elevation = 200 }, index) => {
          const position = Cartesian3.fromDegrees(x, y, elevation);
          const lineTopPosition = Cartesian3.fromDegrees(x, y, elevation - 10);
          const groundPosition = Cartesian3.fromDegrees(x, y, 0);

          return (
            <Entity key={id} position={position}>
              <BillboardGraphics image={pngUri} scale={0.2} verticalOrigin={VerticalOrigin.BOTTOM} />
              <PolylineGraphics
                width={4}
                positions={
                  new ConstantProperty([lineTopPosition, groundPosition])
                }
                material={new ColorMaterialProperty(Color.YELLOW)}
              />
            </Entity>
          );
        }
      ),
    [markerData]
  );
  // resium logic here

  return <BillboardCollection>{entities}</BillboardCollection>;
};

export default MarkerContainer;
