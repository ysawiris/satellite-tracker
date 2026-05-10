// Favorites persisted in localStorage as { norad_id, name } objects.

const KEY = "satellite-tracker.favorites";

export function loadFavorites() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveFavorites(list) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function isFavorite(noradId, list) {
  return list.some((f) => f.norad_id === noradId);
}

export function toggleFavorite(sat, list) {
  if (isFavorite(sat.norad_id, list)) {
    return list.filter((f) => f.norad_id !== sat.norad_id);
  }
  return [...list, { norad_id: sat.norad_id, name: sat.name }];
}
