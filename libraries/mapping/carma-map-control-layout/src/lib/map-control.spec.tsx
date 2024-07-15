import { render } from '@testing-library/react';

import MapControl from './map-control';

describe('MapControl', () => {
  it('should render successfully', () => {
    const { baseElement } = render(<MapControl />);
    expect(baseElement).toBeTruthy();
  });
});
