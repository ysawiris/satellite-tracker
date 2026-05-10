// REST API wrapper. All endpoints return { data, error }.

async function request(path) {
  const resp = await fetch(path, { headers: { Accept: "application/json" } });
  const json = await resp.json();
  if (!resp.ok || json.error) {
    throw new Error(json.error || `HTTP ${resp.status}`);
  }
  return json.data;
}

export const api = {
  groups: () => request("/api/groups"),
  groupSatellites: (groupId) => request(`/api/groups/${groupId}/satellites`),
  satellite: (noradId) => request(`/api/satellites/${noradId}`),
  passes: (noradId, lat, lon, days = 5) =>
    request(`/api/satellites/${noradId}/passes?lat=${lat}&lon=${lon}&days=${days}`),
  positions: (noradIds) =>
    request(`/api/positions?norad_ids=${noradIds.join(",")}`),
  search: (q) => request(`/api/search?q=${encodeURIComponent(q)}`),
};
