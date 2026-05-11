// "API" facade — used to be HTTP calls to a Flask backend; now all
// computation runs in the browser (satellite.js + ported orbital math).
// Same shape so callers in app.js / map.js / globe.js / skyview.js stay
// untouched.

import { GROUPS, getGroup, getSensorInfo, getImageryInfo } from "./sat-data.js";
import { altAzAt, orbitTrack, positionAt, skyTrack } from "./sat-core.js";
import { sunSubpoint } from "./sun-math.js";
import { predictPasses } from "./passes.js";
import { findByNoradId, loadGroup, searchLoaded } from "./tle-store.js";

const KNOWN_GROUP_IDS = GROUPS.map((g) => g.id);

export const api = {
  groups: async () => GROUPS,

  groupSatellites: async (groupId) => {
    const group = getGroup(groupId);
    if (!group) throw new Error(`Unknown group: ${groupId}`);
    const satrecs = await loadGroup(groupId);
    const out = [];
    for (const satrec of satrecs) {
      const pos = positionAt(satrec);
      if (!pos) continue;
      pos.group = group.id;
      pos.color = group.color;
      const sensor = getSensorInfo(pos.norad_id, group.id);
      pos.sensor_type = sensor.sensor_type;
      pos.all_weather = sensor.all_weather;
      pos.sensor_description = sensor.description;
      pos.imagery = getImageryInfo(pos.norad_id, pos.name);
      delete pos.eci_km; // internal-only, drop from public payload
      out.push(pos);
    }
    return out;
  },

  satellite: async (noradId) => {
    const satrec = await findByNoradId(noradId, KNOWN_GROUP_IDS);
    if (!satrec) throw new Error(`Satellite ${noradId} not found`);
    const pos = positionAt(satrec);
    if (!pos) throw new Error(`Could not propagate satellite ${noradId}`);
    const sensor = getSensorInfo(pos.norad_id);
    pos.sensor_type = sensor.sensor_type;
    pos.all_weather = sensor.all_weather;
    pos.sensor_description = sensor.description;
    pos.imagery = getImageryInfo(pos.norad_id, pos.name);
    delete pos.eci_km;
    return pos;
  },

  passes: async (noradId, lat, lon, days = 5, visibleOnly = false) => {
    const satrec = await findByNoradId(noradId, KNOWN_GROUP_IDS);
    if (!satrec) throw new Error(`Satellite ${noradId} not found`);
    const passes = predictPasses(satrec, lat, lon, days, 10, visibleOnly);
    return { satellite: satrec._name, norad_id: satrec._noradId, passes };
  },

  orbit: async (noradId, minutes = 120, stepSeconds = 30) => {
    const satrec = await findByNoradId(noradId, KNOWN_GROUP_IDS);
    if (!satrec) throw new Error(`Satellite ${noradId} not found`);
    const samples = orbitTrack(satrec, minutes, stepSeconds);
    return { satellite: satrec._name, norad_id: satrec._noradId, samples };
  },

  skytrack: async (noradId, lat, lon, startIso, endIso, stepSeconds = 10) => {
    const satrec = await findByNoradId(noradId, KNOWN_GROUP_IDS);
    if (!satrec) throw new Error(`Satellite ${noradId} not found`);
    const samples = skyTrack(satrec, lat, lon, new Date(startIso), new Date(endIso), stepSeconds);
    return { satellite: satrec._name, norad_id: satrec._noradId, samples };
  },

  positions: async (noradIds) => {
    const out = [];
    for (const id of noradIds) {
      const satrec = await findByNoradId(id, KNOWN_GROUP_IDS);
      if (!satrec) continue;
      const pos = positionAt(satrec);
      if (pos) {
        delete pos.eci_km;
        out.push(pos);
      }
    }
    return out;
  },

  search: async (q) => {
    if (q.trim().length < 2) throw new Error("Query must be at least 2 characters");
    return searchLoaded(q);
  },

  sun: async () => {
    const { lat, lon } = sunSubpoint();
    return { lat, lon, t: new Date().toISOString() };
  },
};
