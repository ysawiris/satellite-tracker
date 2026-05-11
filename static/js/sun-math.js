// Sun position + satellite illumination math.
// Ported from app/satellites/sky.py — uses USNO low-precision formulas
// (~0.5° accuracy, plenty for terminator drawing + visible-pass filtering).

const EARTH_RADIUS_KM = 6378.137;
const J2000_MS = Date.UTC(2000, 0, 1, 12, 0, 0); // 2000-01-01 12:00 UTC
const DEG = Math.PI / 180;

function _daysSinceJ2000(date) {
  return (date.getTime() - J2000_MS) / 86_400_000;
}

function _sunEcliptic(date) {
  const d = _daysSinceJ2000(date);
  const meanLongitude = ((280.460 + 0.9856474 * d) % 360 + 360) % 360;
  const meanAnomaly = (((357.528 + 0.9856003 * d) % 360 + 360) % 360) * DEG;
  const lam = (meanLongitude + 1.915 * Math.sin(meanAnomaly) + 0.020 * Math.sin(2 * meanAnomaly)) * DEG;
  const eps = (23.439 - 0.0000004 * d) * DEG;
  return { lam, eps, d };
}

export function sunSubpoint(date = new Date()) {
  const { lam, eps, d } = _sunEcliptic(date);
  const declination = Math.asin(Math.sin(eps) * Math.sin(lam));
  const rightAscension = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam));
  const gmst = (((280.46061837 + 360.98564736629 * d) % 360 + 360) % 360) * DEG;
  let subLon = (rightAscension - gmst) / DEG;
  subLon = ((subLon + 540) % 360) - 180;
  return { lat: declination / DEG, lon: subLon };
}

export function sunEciUnitVector(date = new Date()) {
  const { lam, eps } = _sunEcliptic(date);
  return [Math.cos(lam), Math.cos(eps) * Math.sin(lam), Math.sin(eps) * Math.sin(lam)];
}

/**
 * Cylindrical-shadow check: True when a satellite at ECI (km) position is in sunlight.
 */
export function isSatelliteSunlit(satEciKm, date = new Date()) {
  const [sx, sy, sz] = sunEciUnitVector(date);
  const [rx, ry, rz] = satEciKm;
  const alongSun = rx * sx + ry * sy + rz * sz;
  if (alongSun > 0) return true; // day side
  const perpSq = rx * rx + ry * ry + rz * rz - alongSun * alongSun;
  return perpSq > EARTH_RADIUS_KM * EARTH_RADIUS_KM;
}

/**
 * Sun altitude (degrees) as seen by an observer at lat/lon. Negative = below horizon.
 */
export function sunAltitudeAt(observerLat, observerLon, date = new Date()) {
  const { lat: subLat, lon: subLon } = sunSubpoint(date);
  const phiO = observerLat * DEG;
  const phiS = subLat * DEG;
  const dLon = (observerLon - subLon) * DEG;
  let cosZenith = Math.sin(phiO) * Math.sin(phiS) + Math.cos(phiO) * Math.cos(phiS) * Math.cos(dLon);
  cosZenith = Math.max(-1, Math.min(1, cosZenith));
  return 90 - Math.acos(cosZenith) / DEG;
}
