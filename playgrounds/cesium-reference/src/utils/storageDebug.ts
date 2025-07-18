/**
 * Storage debugging utilities for development
 */

export function logStorageUsage() {
  console.group("[Storage] Current Usage");

  // localStorage
  const localStorageSize = JSON.stringify(localStorage).length;
  console.log("localStorage:", localStorageSize, "bytes");
  Object.keys(localStorage).forEach((key) => {
    const value = localStorage.getItem(key);
    if (value) {
      console.log(`  ${key}:`, value.length, "bytes");
    }
  });

  // sessionStorage
  const sessionStorageSize = JSON.stringify(sessionStorage).length;
  console.log("sessionStorage:", sessionStorageSize, "bytes");
  Object.keys(sessionStorage).forEach((key) => {
    const value = sessionStorage.getItem(key);
    if (value) {
      console.log(`  ${key}:`, value.length, "bytes");
    }
  });

  // IndexedDB usage estimation
  if ("storage" in navigator && "estimate" in navigator.storage) {
    navigator.storage.estimate().then((estimate) => {
      console.log(
        "IndexedDB usage:",
        estimate.usage,
        "bytes of",
        estimate.quota
      );
      console.log(
        "Storage usage %:",
        (((estimate.usage || 0) / (estimate.quota || 1)) * 100).toFixed(2) + "%"
      );
    });
  }

  console.groupEnd();
}

export function clearMeasurements() {
  console.group("[Storage] Clearing measurements...");

  const MEASUREMENT_KEY = "cesium-reference-measurements";
  const measurementData = localStorage.getItem(MEASUREMENT_KEY);

  if (measurementData) {
    const measurements = JSON.parse(measurementData);
    console.log(
      "Removing measurements from localStorage:",
      measurements.length,
      "entries"
    );
    localStorage.removeItem(MEASUREMENT_KEY);
    console.log("Measurements cleared. Reload the page to start fresh.");
  } else {
    console.log("No measurements found in localStorage");
  }

  console.groupEnd();
}

export function debugMeasurements() {
  console.group("[Storage] Measurements Debug");

  const MEASUREMENT_KEY = "cesium-reference-measurements";
  const measurementData = localStorage.getItem(MEASUREMENT_KEY);

  if (measurementData) {
    const measurements = JSON.parse(measurementData);
    console.log("Total measurements:", measurements.length);

    // Count by type
    const measurementTypes = measurements.reduce(
      (acc: Record<string, number>, m: { type: string }) => {
        acc[m.type] = (acc[m.type] || 0) + 1;
        return acc;
      },
      {}
    );
    console.log("Measurement types:", measurementTypes);

    // Check for measurements with shouldRebuildEntry flag
    const needsRebuild = measurements.filter(
      (m: { shouldRebuildEntry?: boolean }) => m.shouldRebuildEntry
    );
    console.log("Measurements needing rebuild:", needsRebuild.length);

    // Log size
    console.log("Data size:", measurementData.length, "bytes");
  } else {
    console.log("No measurements found in localStorage");
  }

  console.groupEnd();
}

export function clearAllStorage() {
  console.group("[Storage] Clearing all storage...");

  // Clear localStorage
  const localKeys = Object.keys(localStorage);
  localStorage.clear();
  console.log("localStorage cleared, removed keys:", localKeys);

  // Clear sessionStorage
  const sessionKeys = Object.keys(sessionStorage);
  sessionStorage.clear();
  console.log("sessionStorage cleared, removed keys:", sessionKeys);

  // Clear IndexedDB
  if ("indexedDB" in window) {
    indexedDB.databases().then((databases) => {
      databases.forEach((db) => {
        if (db.name) {
          console.log("Deleting IndexedDB:", db.name);
          indexedDB.deleteDatabase(db.name);
        }
      });
    });
  }

  // Clear caches
  if ("caches" in window) {
    caches.keys().then((cacheNames) => {
      cacheNames.forEach((cacheName) => {
        console.log("Deleting cache:", cacheName);
        caches.delete(cacheName);
      });
    });
  }

  console.groupEnd();
  console.log("All storage cleared. Reload the page to start fresh.");
}

export function debugCesiumMemory() {
  console.group("[Cesium] Memory Debug");

  // Check if viewer is available
  const viewer = (window as unknown as { cesiumViewer?: object }).cesiumViewer;
  if (viewer) {
    console.log("Cesium viewer found");

    // Check scene primitives
    const viewerObj = viewer as {
      scene?: { primitives?: { _primitives?: object[] } };
    };
    const tilesets =
      viewerObj.scene?.primitives?._primitives?.filter(
        (p: object) => p.constructor.name === "Cesium3DTileset"
      ) || [];
    console.log("Active tilesets:", tilesets.length);

    tilesets.forEach((tileset: unknown, index: number) => {
      const tilesetObj = tileset as {
        url?: string;
        totalMemoryUsageInBytes?: number;
        cacheBytes?: number;
        maximumCacheOverflowBytes?: number;
        isDestroyed?: () => boolean;
        ready?: boolean;
      };

      console.log(`Tileset ${index}:`, {
        url: tilesetObj.url,
        totalMemoryUsageInBytes: tilesetObj.totalMemoryUsageInBytes,
        cacheBytes: tilesetObj.cacheBytes,
        maximumCacheOverflowBytes: tilesetObj.maximumCacheOverflowBytes,
        isDestroyed: tilesetObj.isDestroyed?.(),
        ready: tilesetObj.ready,
      });
    });

    // Check cache statistics
    const sceneObj = viewerObj.scene as {
      globe?: {
        _surface?: {
          tileProvider?: { quadTree?: { _tileCacheSize?: number } };
        };
      };
    };
    if (sceneObj.globe?._surface) {
      const tileProvider = sceneObj.globe._surface.tileProvider;
      if (tileProvider?.quadTree) {
        console.log("Globe tile cache:", tileProvider.quadTree._tileCacheSize);
      }
    }
  } else {
    console.log("No Cesium viewer found");
  }

  console.groupEnd();
}

export function debugTilesetRequests() {
  console.group("[Cesium] Tileset Requests Debug");

  const RequestScheduler = (
    window as unknown as { Cesium?: { RequestScheduler?: object } }
  ).Cesium?.RequestScheduler;
  if (RequestScheduler) {
    const scheduler = RequestScheduler as {
      maximumRequests?: number;
      maximumRequestsPerServer?: number;
      requestsByServer?: Record<string, number>;
    };

    console.log("RequestScheduler stats:", {
      maximumRequests: scheduler.maximumRequests,
      maximumRequestsPerServer: scheduler.maximumRequestsPerServer,
      requestsByServer: scheduler.requestsByServer,
      totalActiveRequests: Object.values(
        scheduler.requestsByServer || {}
      ).reduce((a, b) => (a as number) + (b as number), 0),
    });
  }

  console.groupEnd();
}

export function monitorStorageChanges() {
  const originalSetItem = localStorage.setItem;
  const originalRemoveItem = localStorage.removeItem;

  localStorage.setItem = function (key, value) {
    console.debug(
      "[Storage] localStorage.setItem:",
      key,
      value.length,
      "bytes"
    );
    originalSetItem.call(this, key, value);
  };

  localStorage.removeItem = function (key) {
    console.debug("[Storage] localStorage.removeItem:", key);
    originalRemoveItem.call(this, key);
  };
}

// Development utilities
if (import.meta.env.DEV) {
  // Add to window for easy access in dev tools
  (window as unknown as { storageDebug: object }).storageDebug = {
    logStorageUsage,
    clearAllStorage,
    monitorStorageChanges,
    debugCesiumMemory,
    debugTilesetRequests,
    clearMeasurements,
    debugMeasurements,
  };

  // Initial storage log
  setTimeout(logStorageUsage, 1000);

  // Monitor storage changes
  monitorStorageChanges();

  console.log(
    "🔧 Storage debugging utilities available via window.storageDebug"
  );
  console.log("📋 Available commands:");
  console.log("  - window.storageDebug.logStorageUsage()");
  console.log("  - window.storageDebug.clearAllStorage()");
  console.log("  - window.storageDebug.debugCesiumMemory()");
  console.log("  - window.storageDebug.debugTilesetRequests()");
  console.log("  - window.storageDebug.clearMeasurements()");
  console.log("  - window.storageDebug.debugMeasurements()");
}
