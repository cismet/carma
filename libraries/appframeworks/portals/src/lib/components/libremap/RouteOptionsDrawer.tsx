import { Spin } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCar,
  faWalking,
  faBicycle,
  faClock,
  faRoute,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerClose,
} from "@carma-commons/ui/shadcn";
import type { RouteOption } from "./libremap.utils";

interface RouteOptionsDrawerProps {
  open: boolean;
  onClose: () => void;
  onSelectRoute: (route: RouteOption) => void;
  routes: RouteOption[];
  loading?: boolean;
  destinationName?: string;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours} Std ${minutes} Min`;
  }
  return `${minutes} Min`;
}

function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }
  return `${Math.round(meters)} m`;
}

function getModeIcon(mode: string) {
  switch (mode?.toLowerCase()) {
    case "car":
      return faCar;
    case "walk":
    case "walking":
      return faWalking;
    case "bike":
    case "bicycle":
      return faBicycle;
    default:
      return faCar;
  }
}

function getModeLabel(mode: string): string {
  switch (mode?.toLowerCase()) {
    case "car":
      return "Auto";
    case "walk":
    case "walking":
      return "Zu Fuß";
    case "bike":
    case "bicycle":
      return "Fahrrad";
    default:
      return mode || "Route";
  }
}

export const RouteOptionsDrawer = ({
  open,
  onClose,
  onSelectRoute,
  routes,
  loading = false,
  destinationName,
}: RouteOptionsDrawerProps) => {
  return (
    <Drawer
      open={open}
      onOpenChange={(isOpen) => !isOpen && onClose()}
      modal={false}
    >
      <DrawerContent>
        <div style={{ width: "100%", maxWidth: "100%", padding: "0 16px" }}>
          <DrawerHeader className="relative">
            <DrawerTitle className="flex items-center gap-2">
              <FontAwesomeIcon icon={faRoute} className="text-blue-500" />
              Routenoptionen
            </DrawerTitle>
          </DrawerHeader>

          <div className="p-4 pb-8">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-8">
                <Spin size="large" />
                <p className="mt-4 text-sm text-gray-500">
                  Routen werden berechnet...
                </p>
              </div>
            ) : routes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8">
                <p className="text-sm text-gray-500">Keine Routen gefunden</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {routes.map((route) => (
                  <button
                    key={route.index}
                    onClick={() => onSelectRoute(route)}
                    className="flex w-full flex-col rounded-lg border border-gray-200 p-4 text-left transition-all hover:border-blue-500 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <FontAwesomeIcon
                          icon={getModeIcon(route.mode)}
                          className="text-lg text-blue-500"
                        />
                        <span className="font-medium">
                          {getModeLabel(route.mode)}
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 flex gap-6 text-sm text-gray-600">
                      <div className="flex items-center gap-2">
                        <FontAwesomeIcon icon={faClock} className="text-xs" />
                        <span>{formatDuration(route.duration)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <FontAwesomeIcon icon={faRoute} className="text-xs" />
                        <span>{formatDistance(route.distance)}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default RouteOptionsDrawer;
