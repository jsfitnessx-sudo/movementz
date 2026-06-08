export const movementzIconSrc = "/assets/movementz-icon.png";
export const movementzWordmarkSrc = "/assets/movementz-wordmark.png";

export function buildSignupLink() {
  if (typeof window === "undefined") return "/?signup=user";
  return `${window.location.origin}/?signup=user`;
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
