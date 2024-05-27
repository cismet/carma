import { render } from '@testing-library/react';

import WuppertalComponents from './wuppertal-components';

describe('WuppertalComponents', () => {
  it('should render successfully', () => {
    const { baseElement } = render(<WuppertalComponents />);
    expect(baseElement).toBeTruthy();
  });
});
