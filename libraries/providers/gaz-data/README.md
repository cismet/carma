# gaz-data

Gazetteer data provider for loading and managing gazetteer search data.

## Usage

```typescript
import { GazDataProvider, useGazData } from '@carma-providers/gaz-data';

// Wrap your app
<GazDataProvider config={config}>
  <YourApp />
</GazDataProvider>

// Use in components
const { gazData, crs, isLoading, error } = useGazData();
```
