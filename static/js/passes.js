// Pass prediction — finds rise / culmination / set events for an observer.
// Replaces Skyfield's `find_events` with a simple coarse-step + binary-refine
// loop. ~60s steps over 5 days = ~7200 propagations per call → <1 s in practice.

import { altAzAt, positionAt } from "./sat-core.js";
import { sunAltitudeAt, isSatelliteSunlit } from "./sun-math.js";

const STEP_SECONDS = 30;            // coarse search step
const REFINE_ITERATIONS = 10;        // binary search rounds → sub-second precision
const DARK_SUN_ALTITUDE_DEG = -6.0;  // civil twilight threshold

/**
 * Predict passes over an observer location for the next `days` days.
 *
 * Each pass is tagged with a `visible` flag — true when the satellite is
 * sunlit AND the observer is past civil twilight at culmination.
 */
export function predictPasses(satrec, lat, lon, days = 5, minAltDeg = 10, visibleOnly = false) {
  const start = Date.now();
  const end = start + days * 86_400_000;
  const passes = [];

  let prevAlt = null;
  let current = null;

  for (let t = start; t <= end; t += STEP_SECONDS * 1000) {
    const date = new Date(t);
    const aa = altAzAt(satrec, lat, lon, date);
    if (!aa) { prevAlt = null; continue; }

    if (prevAlt !== null) {
      const wasBelow = prevAlt < minAltDeg;
      const nowAbove = aa.alt >= minAltDeg;

      if (wasBelow && nowAbove && current === null) {
        // Rise — refine to find the exact moment crossing minAltDeg.
        const riseMs = _refineCrossing(satrec, lat, lon, t - STEP_SECONDS * 1000, t, minAltDeg);
        current = {
          rise_utc: new Date(riseMs).toISOString(),
          max_altitude_deg: aa.alt,
          culminate_utc: date.toISOString(),
          azimuth_deg: aa.az,
        };
      } else if (current !== null) {
        // Track culmination
        if (aa.alt > current.max_altitude_deg) {
          current.max_altitude_deg = aa.alt;
          current.culminate_utc = date.toISOString();
          current.azimuth_deg = aa.az;
        }
        // Detect set
        if (!nowAbove && prevAlt >= minAltDeg) {
          const setMs = _refineCrossing(satrec, lat, lon, t - STEP_SECONDS * 1000, t, minAltDeg);
          current.set_utc = new Date(setMs).toISOString();
          const riseMs = new Date(current.rise_utc).getTime();
          current.duration_seconds = Math.max(1, Math.round((setMs - riseMs) / 1000));

          // Visibility check — sat sunlit + observer in twilight or darker.
          const culmDate = new Date(current.culminate_utc);
          const culmPos = positionAt(satrec, culmDate);
          const sunAlt = sunAltitudeAt(lat, lon, culmDate);
          const sunlit = culmPos ? isSatelliteSunlit(culmPos.eci_km, culmDate) : false;
          current.sat_sunlit = sunlit;
          current.observer_sun_altitude_deg = Math.round(sunAlt * 10) / 10;
          current.visible = sunlit && sunAlt <= DARK_SUN_ALTITUDE_DEG;

          // Round the displayed altitude / azimuth to match the previous API.
          current.max_altitude_deg = Math.round(current.max_altitude_deg * 10) / 10;
          current.azimuth_deg = Math.round(current.azimuth_deg * 10) / 10;

          if (!visibleOnly || current.visible) passes.push(current);
          current = null;
        }
      }
    }
    prevAlt = aa.alt;
  }
  return passes;
}

/** Binary search the moment alt(satrec) crosses `target` between t0Ms and t1Ms. */
function _refineCrossing(satrec, lat, lon, t0Ms, t1Ms, target) {
  let lo = t0Ms, hi = t1Ms;
  for (let i = 0; i < REFINE_ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    const aa = altAzAt(satrec, lat, lon, new Date(mid));
    if (!aa) return mid;
    const aLo = altAzAt(satrec, lat, lon, new Date(lo));
    if (!aLo) return mid;
    // Crossing is between lo and mid if signs differ
    if ((aLo.alt - target) * (aa.alt - target) < 0) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}
