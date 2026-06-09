export const movementzIconSrc = "/assets/movementz-icon.png";
export const movementzWordmarkSrc = "/assets/movementz-wordmark.png";

export function buildAppUrl(path = "/") {
  const configuredUrl = import.meta.env.VITE_APP_URL || import.meta.env.VITE_PUBLIC_APP_URL || "";
  if (configuredUrl) return `${configuredUrl.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  if (typeof window === "undefined") return "/?signup=user";
  return `${window.location.origin}${path.startsWith("/") ? path : `/${path}`}`;
}

export function buildSignupLink() {
  return buildAppUrl("/?signup=user");
}

export function buildAuthRedirectUrl() {
  return buildAppUrl("/");
}

export async function copyTextToClipboard(text) {
  if (!text) return false;

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  return false;
}
