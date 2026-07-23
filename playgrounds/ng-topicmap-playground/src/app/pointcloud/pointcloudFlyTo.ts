export interface CloudFlyToButtonState {
  disabled: boolean;
  title: string;
  ariaLabel: string;
}

export const getCloudFlyToButtonState = (
  enabled: boolean,
  hasBounds: boolean,
  loading = false
): CloudFlyToButtonState => {
  if (!enabled) {
    return {
      disabled: true,
      title: "Punktwolke ist deaktiviert",
      ariaLabel: "Punktwolke ist deaktiviert",
    };
  }

  if (hasBounds) {
    return {
      disabled: false,
      title: "Zur Ausdehnung fliegen",
      ariaLabel: "Zur Ausdehnung fliegen",
    };
  }

  if (loading) {
    return {
      disabled: true,
      title: "Lädt…",
      ariaLabel: "Lädt…",
    };
  }

  return {
    disabled: true,
    title: "Noch keine Ausdehnung verfügbar",
    ariaLabel: "Noch keine Ausdehnung verfügbar",
  };
};
