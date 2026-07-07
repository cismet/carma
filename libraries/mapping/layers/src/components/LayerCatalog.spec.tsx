/* eslint-disable @typescript-eslint/no-explicit-any */
import { createElement, type ReactNode } from "react";
import { configureStore } from "@reduxjs/toolkit";
import {
  configure,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { Provider } from "react-redux";

import capabilitiesKartenXml from "../test/fixtures/capabilities-karten.xml?raw";
import additionalLayerConfig from "../test/fixtures/additionalLayerConfig.json";
import additionalSensorConfig from "../test/fixtures/additionalSensorConfig.json";
import additionalObjectConfig from "../test/fixtures/additionalObjectConfig.json";
import discoverItems from "../test/fixtures/discoverItems.json";

vi.mock("@carma-mapping/components", () => ({
  useMapFrameworkSwitcherContext: () => ({
    isCesium: false,
    requestTransitionToCesium: vi.fn(),
    requestTransitionToLeaflet: vi.fn(),
  }),
  LayerButton: ({ children }: { children?: ReactNode }) =>
    createElement("div", null, children),
  LayerIcon: () => null,
}));

vi.mock("@carma-providers/auth", () => ({
  useAuth: () => ({
    jwt: undefined,
    userGroups: [],
    setJWT: vi.fn(),
  }),
}));

import { mapLayersReducer } from "../slices/mapLayers";
import { mapLayersUIReducer } from "../slices/ui";
import { LayerCatalog, type ActiveLayers } from "./LayerCatalog";
import { wuppLayerCatalogConfig } from "../config/layerCatalogConfig";

const textResponse = (body: string, status = 200) =>
  Promise.resolve({
    ok: status < 400,
    status,
    text: async () => body,
    json: async () => JSON.parse(body),
  } as Response);

const jsonResponse = (data: unknown) => textResponse(JSON.stringify(data));

// The replace/merge handling in getLayerStructure only works when the
// additional config layers are already dispatched to the store when the WMS
// capabilities arrive (in production the WMS responses are far slower than
// the small config files). The gate holds the mocked capabilities responses
// back until the store has received the replace layers.
let capabilitiesGate: Promise<void> = Promise.resolve();

const createCapabilitiesGate = (
  store: ReturnType<typeof createTestStore>,
  timeoutMs = 4000
) =>
  new Promise<void>((resolve) => {
    const hasReplaceLayers = () =>
      (store.getState() as any).mapLayers.replaceLayers.length > 0;
    if (hasReplaceLayers()) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      unsubscribe();
      resolve();
    }, timeoutMs);
    const unsubscribe = store.subscribe(() => {
      if (hasReplaceLayers()) {
        clearTimeout(timer);
        unsubscribe();
        resolve();
      }
    });
  });

const routedFetch = (input: RequestInfo | URL): Promise<Response> => {
  const url = String(input);

  if (url.includes("additionalLayerConfig.json")) {
    return jsonResponse(additionalLayerConfig);
  }
  if (url.includes("additionalSensorConfig.json")) {
    return jsonResponse(additionalSensorConfig);
  }
  if (url.includes("additionalObjectConfig.json")) {
    return jsonResponse(additionalObjectConfig);
  }
  if (url.includes("systemMessages.json.md5")) {
    return textResponse("system-messages-md5");
  }
  if (url.includes("systemMessages.json")) {
    return jsonResponse({});
  }
  if (
    url.includes("maps.wuppertal.de/karten") &&
    url.includes("GetCapabilities")
  ) {
    return capabilitiesGate.then(() => textResponse(capabilitiesKartenXml));
  }
  if (url.includes("maps.wuppertal.de")) {
    // the other WMS services stay empty in the tests
    return capabilitiesGate.then(() => textResponse("", 204));
  }
  if (url.includes("dataAquisition")) {
    // force the fallback to the public discover JSON
    return textResponse("server error", 500);
  }
  if (url.includes("gp_entdecken.json.md5")) {
    return textResponse("gp-entdecken-md5");
  }
  if (url.includes("gp_entdecken.json")) {
    return jsonResponse(discoverItems);
  }

  return Promise.reject(
    new Error(`Unmocked fetch in LayerCatalog.spec: ${url}`)
  );
};

const createTestStore = () =>
  configureStore({
    reducer: { mapLayers: mapLayersReducer, mapLayersUI: mapLayersUIReducer },
  });

const backgroundLayer = {
  id: "karte",
  title: "Stadtplan",
  opacity: 1,
  visible: true,
  layerType: "vector",
  description: "",
  inhalt: "",
  eignung: "",
  layers: "",
  props: { name: "", url: "" },
} as unknown as ActiveLayers[0];

const renderModal = (
  overrides: Partial<Parameters<typeof LayerCatalog>[0]> = {}
) => {
  const store = createTestStore();
  capabilitiesGate = createCapabilitiesGate(store);
  const props = {
    open: true,
    setOpen: vi.fn(),
    setAdditionalLayers: vi.fn(),
    addFavorite: vi.fn(),
    removeFavorite: vi.fn(),
    updateActiveLayer: vi.fn(),
    setFeatureFlags: vi.fn(),
    favorites: [],
    customCategories: [],
    activeLayers: [backgroundLayer] as ActiveLayers,
    config: {
      ...wuppLayerCatalogConfig,
      discoverProps: {
        appKey: "geoportal-test",
        apiUrl: "https://wunda-cloud-api.cismet.de",
        daqKey: "gp_entdecken",
      },
    },
    appKey: "geoportal-test",
    ...overrides,
  };

  const view = render(
    <Provider store={store}>
      <LayerCatalog {...props} />
    </Provider>
  );

  return { ...view, props, store };
};

const findLayerCard = async (title: string) => {
  const titleElement = await screen.findByText(title, undefined, {
    timeout: 8000,
  });
  const card = titleElement.closest('[data-test-id="card-layer-prev"]');
  expect(card).not.toBeNull();
  return card as HTMLElement;
};

describe("LayerCatalog", () => {
  beforeAll(() => {
    configure({ testIdAttribute: "data-test-id" });
  });

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(routedFetch));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fills the map layer categories from capabilities and additional configs", async () => {
    renderModal();

    // category and layers derived from the WMS capabilities + baseConfig
    await screen.findByText("Stadtgrundkarte (grau)", undefined, {
      timeout: 8000,
    });
    expect(screen.getAllByText("Basis").length).toBeGreaterThan(0);

    // layer only present in the capabilities, appended to the category
    expect(
      screen.getByText("Testebene ohne Konfiguration")
    ).toBeTruthy();

    // layer hidden via carmaconf://hideLayer keyword
    expect(
      screen.queryByText("Amtliche Basiskarte (farbig)")
    ).toBeNull();

    // replaceId from the additional config swaps the capabilities layer
    await screen.findByText("ALKIS Ersatzkarte (Test)", undefined, {
      timeout: 8000,
    });
    expect(
      screen.queryByText("ALKIS Strichkarte (gelb)")
    ).toBeNull();

    // additional config category with own title
    expect(screen.getAllByText("Zusatzebenen").length).toBeGreaterThan(0);
    expect(screen.getByText("Zusatz Testlayer")).toBeTruthy();

    // feature flag layers stay hidden without the active flag
    expect(
      screen.queryByText("Featureflag Testlayer")
    ).toBeNull();
  });

  it("fills the sensor, object and discover categories", async () => {
    renderModal();

    await screen.findByText("Stadtgrundkarte (grau)", undefined, {
      timeout: 8000,
    });

    fireEvent.click(screen.getByText("Sensoren"));
    await screen.findByText("Bodenfeuchte Testsensor", undefined, {
      timeout: 8000,
    });
    expect(screen.getAllByText("Boden").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText("Objekte"));
    await screen.findByText("Testgebäude 3D", undefined, { timeout: 8000 });
    expect(screen.getAllByText("Gebäude").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText("Entdecken"));
    await screen.findByText(
      "Liegenschaftskarte Testzusammenstellung",
      undefined,
      { timeout: 8000 }
    );
    expect(screen.getByText("POI Testkarte (Entwurf)")).toBeTruthy();
    // draft ribbon for draft discover items
    expect(screen.getByText("Entwurf")).toBeTruthy();
  });

  it("adds a layer to the map via the card button", async () => {
    const { props } = renderModal();

    const card = await findLayerCard("Stadtgrundkarte (grau)");
    fireEvent.click(within(card).getByTestId("apply-layer-to-map"));

    expect(props.setAdditionalLayers).toHaveBeenCalledTimes(1);
    expect(props.setAdditionalLayers).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "wuppKarten:alkomgw",
        title: "Stadtgrundkarte (grau)",
      }),
      false,
      false,
      false
    );
  });

  it("adds and removes favorites via the card star", async () => {
    const { props } = renderModal();

    const card = await findLayerCard("Stadtgrundkarte (grau)");
    fireEvent.click(within(card).getByTestId("add-layer-favorite"));

    expect(props.addFavorite).toHaveBeenCalledTimes(1);
    expect(props.addFavorite).toHaveBeenCalledWith(
      expect.objectContaining({ id: "wuppKarten:alkomgw" })
    );
  });

  it("shows the filled favorite star and removes the favorite again", async () => {
    const { props } = renderModal({
      favorites: [{ id: "fav_wuppKarten:alkomgw" } as any],
    });

    const card = await findLayerCard("Stadtgrundkarte (grau)");
    expect(
      within(card).queryByTestId("add-layer-favorite")
    ).toBeNull();

    fireEvent.click(within(card).getByTestId("remove-layer-favorite"));
    expect(props.removeFavorite).toHaveBeenCalledTimes(1);
    expect(props.removeFavorite).toHaveBeenCalledWith(
      expect.objectContaining({ id: "wuppKarten:alkomgw" })
    );
  });

  it("opens the info card with title, description sections, links and legend", async () => {
    const { props } = renderModal();

    const card = await findLayerCard("Stadtgrundkarte (grau)");
    fireEvent.click(card);

    const infoCard = await screen.findByTestId("card-layer-detailed-info");
    const info = within(infoCard);

    // title
    expect(
      info.getByRole("heading", { name: "Stadtgrundkarte (grau)" })
    ).toBeTruthy();

    // description sections parsed from the abstract, Sichtbarkeit stays hidden
    expect(info.getByText("Inhalt")).toBeTruthy();
    expect(
      info.getByText(
        "Aus dem Liegenschaftskataster erzeugte Hintergrundkarte in Graustufen."
      )
    ).toBeTruthy();
    expect(info.getByText("Nutzung")).toBeTruthy();
    expect(info.queryByText("Sichtbarkeit")).toBeNull();

    // links to the WMS capabilities and the open data portal
    const capabilitiesLink = info.getByRole("link", {
      name: "Inhaltsverzeichnis des Kartendienstes (WMS Capabilities)",
    });
    expect(capabilitiesLink.getAttribute("href")).toBe("https://maps.wuppertal.de/karten?service=WMS&request=GetCapabilities&version=1.1.1");
    const openDataLink = info.getByRole("link", {
      name: "Datenquelle im Open-Data-Portal Wuppertal",
    });
    expect(openDataLink.getAttribute("href")).toBe("https://offenedaten-wuppertal.de/dataset/alkomgw");

    // legend image from the capabilities style
    expect(info.getByText("Legende")).toBeTruthy();
    expect(info.getByAltText("Legende").getAttribute("src")).toBe("https://example.test/legenden/alkomgw-legende.png");

    // tag footer
    expect(info.getByText("Basis")).toBeTruthy();

    // action buttons work from the info card as well
    fireEvent.click(info.getByRole("button", { name: /Hinzufügen/ }));
    expect(props.setAdditionalLayers).toHaveBeenCalledWith(
      expect.objectContaining({ id: "wuppKarten:alkomgw" }),
      false,
      false,
      false
    );
    fireEvent.click(info.getByRole("button", { name: /Favorisieren/ }));
    expect(props.addFavorite).toHaveBeenCalledWith(
      expect.objectContaining({ id: "wuppKarten:alkomgw" })
    );
  });

  it("clears the loading state when capabilities fail to load", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("maps.wuppertal.de")) {
          return Promise.reject(new Error("network down"));
        }
        return routedFetch(input);
      })
    );

    const { store } = renderModal();

    await waitFor(
      () => {
        const state = store.getState() as any;
        expect(state.mapLayers.loadingCapabilities).toBe(false);
        expect(state.mapLayers.loadingCapabilitiesIDs).toEqual([]);
      },
      { timeout: 8000 }
    );
  });
});
