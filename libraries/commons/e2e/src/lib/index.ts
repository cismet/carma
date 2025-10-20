// Image mocks
export {
  mockAddresses,
  mockAdditionalData,
  mockEmptyDatasets,
  mockOMTMapHosting,
  mockRasterTiles,
  mockTopicMapData,
  mockVectorTiles,
  mockWMSImages,
  mockWMTSTiles,
  setupAllMocks,
} from "./image-mocks";

// Modal menu test functions
export { runModalMenuTest, type ModalMenuOptions } from "./modal-menu-test";

// Page object models
export { ExtendedTopicMapPage, TopicMapPage } from "./page-objects";

// Main smoke test functions
export {
  checkApplicationMenuVisible,
  checkFuzzySearchVisible,
  checkInfoBoxVisible,
  checkZoomControlVisible,
  runMapSmokeTest,
  type SmokeTestOptions,
} from "./smoke-tests";

// Test helper utilities
export {
  isTopicMapApp,
  setupSmokeTest,
  takeDebugScreenshot,
  toggleAccordion,
  waitForAppReady,
  waitForElementWithRetry,
  type SmokeTestSetupOptions,
} from "./test-helpers";
