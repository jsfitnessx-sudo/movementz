export const paidFeatureTabs = new Set(["progress", "habits", "feed", "food", "messages"]);

export const paidFeatureLabels = {
  progress: "Progress",
  habits: "Habits",
  feed: "Feed",
  food: "Nutrition",
  messages: "Messages"
};

function paidUntilIsCurrent(value) {
  if (!value) return true;
  const expiry = new Date(value).getTime();
  return Number.isFinite(expiry) && expiry > Date.now();
}

export function hasFullUserAccess(profile, role) {
  const resolvedRole = role || profile?.role || "normal_user";
  if (["admin", "coach", "client"].includes(resolvedRole)) return true;
  if (profile?.admin_granted_paid_access) return true;
  if (["admin", "coach"].includes(profile?.access_tier)) return true;
  return profile?.access_tier === "paid" && paidUntilIsCurrent(profile?.paid_access_until);
}

export function tabNeedsPaidAccess(tabId) {
  return paidFeatureTabs.has(tabId);
}

export function tabIsLocked(tabId, profile, role) {
  return tabNeedsPaidAccess(tabId) && !hasFullUserAccess(profile, role);
}
