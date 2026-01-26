import { Spin } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faClock, faRoute, faXmark } from "@fortawesome/free-solid-svg-icons";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerClose,
} from "@carma-commons/ui/shadcn";
import type { RouteOption } from "../utils/routeDisplay";
import {
  formatDuration,
  formatDistance,
  getModeIcon,
  getModeLabel,
} from "../utils/formatters";

interface RouteOptionsDrawerProps {
  open: boolean;
  onClose: () => void;
  onSelectRoute: (route: RouteOption) => void;
  routes: RouteOption[];
  loading?: boolean;
  destinationName?: string;
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
