# selection

Selection provider for managing selected items and overlay features across the application.

## Usage

```typescript
import { SelectionProvider, useSelection } from '@carma-providers/selection';

// Wrap your app
<SelectionProvider>
  <YourApp />
</SelectionProvider>

// Use in components
const { selection, setSelection, overlayFeature, setOverlayFeature } = useSelection();
```
