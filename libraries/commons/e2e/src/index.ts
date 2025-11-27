// Main smoke test functions
export {
  runMapSmokeTest,
  checkZoomControlVisible,
  checkFuzzySearchVisible,
  checkApplicationMenuVisible,
  checkInfoBoxVisible,
  type SmokeTestOptions,
} from "./lib/smoke-tests";

// Modal menu test functions
export { runModalMenuTest, type ModalMenuOptions } from "./lib/modal-menu-test";

// Page object models
export { TopicMapPage, ExtendedTopicMapPage } from "./lib/page-objects";

// Image mocks
export {
  mockWMSImages,
  mockRasterTiles,
  mockVectorTiles,
  mockWMTSTiles,
  setupAllMocks,
  mockAddresses,
  mockEmptyDatasets,
  mockTopicMapData,
  mockAdditionalData,
  mockOMTMapHosting,
  mockGeoportalServices,
  mockObliqueServices,
} from "./lib/image-mocks";

// Test helper utilities
export {
  waitForAppReady,
  setupSmokeTest,
  takeDebugScreenshot,
  waitForElementWithRetry,
  isTopicMapApp,
  toggleAccordion,
  type SmokeTestSetupOptions,
} from "./lib/test-helpers";
