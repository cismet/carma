import { ReactNode, MouseEvent, useEffect, useState } from 'react';
import { useCesium } from 'resium';
import OnMapButton from './OnMapButton';
import { BoundingSphere, Cartesian3 } from 'cesium';
import { faHouseUser } from '@fortawesome/free-solid-svg-icons';
import { RootState, setIsAnimating } from '../../store';
import { useSelector } from 'react-redux';

type HomeProps = {
  children?: ReactNode;
};

const HomeControl = (props: HomeProps) => {
  const { viewer } = useCesium();
  const { homePosition } = useSelector((state: RootState) => state.viewer);
  const [homePos, setHomePos] = useState<Cartesian3 | null>(null);

  useEffect(() => {
    viewer &&
      homePosition &&
      setHomePos(
        new Cartesian3(homePosition.x, homePosition.y, homePosition.z)
      );
  }, [viewer, homePosition]);

  const handleHomeClick = (e: MouseEvent) => {
    e.preventDefault();
    if (viewer && homePos) {
      setIsAnimating(false);
      const boundingSphere = new BoundingSphere(homePos, 400);
      viewer.camera.flyToBoundingSphere(boundingSphere);
    }
  };

  return (
    <OnMapButton
      icon={faHouseUser}
      onClick={handleHomeClick}
      title="Startposition"
    />
  );
};

export default HomeControl;
