// SGP4 propagation + position/altaz/orbit-track helpers.
// Wraps the global `satellite` object loaded via CDN (satellite.js v5).
// Replaces the Skyfield-based Python compute module entirely.

import { isSatelliteSunlit } from "./sun-math.js";

const satellite = window.satellite;
if (!satellite) {
  throw new Error("satellite.js missing — script tag in index.html should load it before app.js");
}

/** Build a satrec from an [name, line1, line2] tuple. Returns null on parse failure. */
export function buildSatrec(tle) {
  const satrec = satellite.twoline2satrec(tle[1], tle[2]);
  if (!satrec || satrec.error) return null;
  satrec._name = tle[0];
  satrec._noradId = parseInt(tle[1].slice(2, 7), 10);
  return satrec;
}

/** Sub-satellite point + altitude + velocity at a moment (default now). */
export function positionAt(satrec, date = new Date()) {
  const pv = satellite.propagate(satrec, date);
  if (!pv.position) return null;
  const gmst = satellite.gstime(date);
  const geo = satellite.eciToGeodetic(pv.position, gmst);
  const v = pv.velocity;
  const speed = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  const eciKm = [pv.position.x, pv.position.y, pv.position.z];
  return {
    name: satrec._name,
    norad_id: satrec._noradId,
    lat: satellite.degreesLat(geo.latitude),
    lon: satellite.degreesLong(geo.longitude),
    alt_km: geo.height,
    velocity_kms: Math.round(speed * 1000) / 1000,
    epoch: epochToIso(satrec),
    sunlit: isSatelliteSunlit(eciKm, date),
    eci_km: eciKm,
  };
}

/** Altitude / azimuth / range from observer to satellite at a moment. */
export function altAzAt(satrec, observerLat, observerLon, date = new Date()) {
  const pv = satellite.propagate(satrec, date);
  if (!pv.position) return null;
  const gmst = satellite.gstime(date);
  const observerGd = {
    longitude: observerLon * Math.PI / 180,
    latitude: observerLat * Math.PI / 180,
    height: 0,
  };
  const ecf = satellite.eciToEcf(pv.position, gmst);
  const look = satellite.ecfToLookAngles(observerGd, ecf);
  return {
    alt: look.elevation * 180 / Math.PI,
    az: ((look.azimuth * 180 / Math.PI) + 360) % 360,
    range_km: look.rangeSat,
  };
}

/** Sample the satellite's ground track for the next N minutes. */
export function orbitTrack(satrec, minutes = 120, stepSeconds = 30) {
  const samples = [];
  const start = Date.now();
  for (let offset = 0; offset <= minutes * 60; offset += stepSeconds) {
    const date = new Date(start + offset * 1000);
    const p = positionAt(satrec, date);
    if (!p) continue;
    samples.push({
      t: date.toISOString(),
      lat: p.lat,
      lon: p.lon,
      alt_km: p.alt_km,
      sunlit: p.sunlit,
    });
  }
  return samples;
}

/** Sample alt/az for an observer over a time window — used to draw pass arcs. */
export function skyTrack(satrec, observerLat, observerLon, startDate, endDate, stepSeconds = 10) {
  const samples = [];
  const startMs = startDate.getTime();
  const endMs = endDate.getTime();
  // Hard cap on samples — match the old API's behaviour.
  const maxSamples = 600;
  const span = (endMs - startMs) / 1000;
  if (span / stepSeconds > maxSamples) {
    stepSeconds = Math.max(stepSeconds, Math.ceil(span / maxSamples));
  }
  for (let t = startMs; t <= endMs; t += stepSeconds * 1000) {
    const date = new Date(t);
    const aa = altAzAt(satrec, observerLat, observerLon, date);
    if (!aa) continue;
    samples.push({
      t: date.toISOString(),
      alt: Math.round(aa.alt * 100) / 100,
      az: Math.round(aa.az * 100) / 100,
      range_km: Math.round(aa.range_km * 10) / 10,
    });
  }
  return samples;
}

function epochToIso(satrec) {
  // satellite.js exposes the TLE epoch as Julian day (jdsatepoch). Convert to ISO.
  const jdMs = (satrec.jdsatepoch - 2440587.5) * 86_400_000;
  return new Date(jdMs).toISOString();
}
