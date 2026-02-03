import { useEffect } from "react";

import { useAdhocFeatureDisplay } from "@carma-appframeworks/portals";

import { ADHOC_TEST_MODEL } from "./sample-data/adhoc-test-model";
import { ADHOC_TEST_FEATURE_WEST } from "./sample-data/adhoc-test-feature-west";
import { ADHOC_TEST_FEATURE_Z } from "./sample-data/adhoc-test-feature-z";
import { ADHOC_TEST_FEATURE } from "./sample-data/test.style";

const AdhocFeatureConsoleBridge = () => {
  const {
    addFeature,
    removeFeature,
    setActiveFeatureId,
    setSelectedFeatureId,
    setShouldFocusSelected,
  } = useAdhocFeatureDisplay();

  useEffect(() => {
    const windowRef = window as Window & {
      carmaAdhocTest?: { show: () => void; remove: () => void };
      carmaAdhocTestModel?: { show: () => void; remove: () => void };
      carmaAdhocTestZValue?: { show: () => void; remove: () => void };
    };

    const api = {
      show: () => {
        addFeature(ADHOC_TEST_MODEL);
        addFeature(ADHOC_TEST_FEATURE);
        addFeature(ADHOC_TEST_FEATURE_WEST);
        addFeature(ADHOC_TEST_FEATURE_Z);
        setActiveFeatureId(ADHOC_TEST_FEATURE.id);
        setSelectedFeatureId(ADHOC_TEST_FEATURE.id);
        setShouldFocusSelected(true);
      },
      remove: () => {
        removeFeature(ADHOC_TEST_MODEL.id);
        removeFeature(ADHOC_TEST_FEATURE.id);
        removeFeature(ADHOC_TEST_FEATURE_WEST.id);
        removeFeature(ADHOC_TEST_FEATURE_Z.id);
      },
    };

    const modelApi = {
      show: () => {
        addFeature(ADHOC_TEST_MODEL);
        setActiveFeatureId(ADHOC_TEST_MODEL.id);
        setSelectedFeatureId(ADHOC_TEST_MODEL.id);
        setShouldFocusSelected(true);
      },
      remove: () => {
        removeFeature(ADHOC_TEST_MODEL.id);
      },
    };

    const zValueApi = {
      show: () => {
        addFeature(ADHOC_TEST_FEATURE_Z);
        setActiveFeatureId(ADHOC_TEST_FEATURE_Z.id);
        setSelectedFeatureId(ADHOC_TEST_FEATURE_Z.id);
        setShouldFocusSelected(true);
      },
      remove: () => {
        removeFeature(ADHOC_TEST_FEATURE_Z.id);
      },
    };

    windowRef.carmaAdhocTest = api;
    windowRef.carmaAdhocTestModel = modelApi;
    windowRef.carmaAdhocTestZValue = zValueApi;

    return () => {
      delete windowRef.carmaAdhocTest;
      delete windowRef.carmaAdhocTestModel;
      delete windowRef.carmaAdhocTestZValue;
    };
  }, [
    addFeature,
    removeFeature,
    setActiveFeatureId,
    setSelectedFeatureId,
    setShouldFocusSelected,
  ]);

  return null;
};

export default AdhocFeatureConsoleBridge;
