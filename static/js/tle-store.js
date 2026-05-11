// TLE store — fetches & caches CelesTrak TLE files from /data/groups/<id>.txt.
// The files are committed to the repo by a GitHub Action that runs every 4
// hours, so the deploy is fully static (no live CelesTrak fetches from
// the browser, no CORS problems, no rate limits).

import { buildSatrec } from "./sat-core.js";

const CACHE_TTL_MS = 30 * 60 * 1000; // 30-min in-memory dedupe; the action refreshes every 4h
const inMemory = new Map(); // groupId or `norad:<id>` → { satrecs, fetchedAt }

/** Parse a CelesTrak 3LE blob into [name, line1, line2] tuples. */
export function parseTleText(text) {
  const lines = text.replace(/\r/g, "").split("\n").map((l) => l.trim()).filter(Boolean);
  const out = [];
  let i = 0;
  while (i + 2 < lines.length + 1) {
    if (i + 2 >= lines.length) break;
    const [name, l1, l2] = [lines[i], lines[i + 1], lines[i + 2]];
    if (l1.startsWith("1 ") && l2.startsWith("2 ")) {
      out.push([name.trim(), l1, l2]);
      i += 3;
    } else {
      i += 1;
    }
  }
  return out;
}

/** Fetch + parse + build satrecs for a group. Cached for the session. */
export async function loadGroup(groupId) {
  const cached = inMemory.get(groupId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.satrecs;

  const url = `data/groups/${groupId}.txt`;
  const resp = await fetch(url, { headers: { Accept: "text/plain" } });
  if (!resp.ok) throw new Error(`Failed to load TLEs for ${groupId}: HTTP ${resp.status}`);
  const text = await resp.text();
  const tles = parseTleText(text);
  const satrecs = tles.map(buildSatrec).filter(Boolean);
  inMemory.set(groupId, { satrecs, fetchedAt: Date.now() });
  return satrecs;
}

/**
 * Find a single satellite by NORAD id across all known groups. Walks the
 * cache first, then falls through to loading any unloaded groups. Cached.
 */
export async function findByNoradId(noradId, knownGroups) {
  const key = `norad:${noradId}`;
  const cached = inMemory.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.satrec;

  // Walk in-memory groups first.
  for (const { satrecs } of inMemory.values()) {
    if (!Array.isArray(satrecs)) continue;
    const hit = satrecs.find((s) => s._noradId === noradId);
    if (hit) {
      inMemory.set(key, { satrec: hit, fetchedAt: Date.now() });
      return hit;
    }
  }
  // Try loading other groups we haven't fetched yet.
  for (const groupId of knownGroups) {
    if (inMemory.has(groupId)) continue;
    try {
      const satrecs = await loadGroup(groupId);
      const hit = satrecs.find((s) => s._noradId === noradId);
      if (hit) {
        inMemory.set(key, { satrec: hit, fetchedAt: Date.now() });
        return hit;
      }
    } catch (_) { /* group missing — skip */ }
  }
  return null;
}

/** Quick text/NORAD search across loaded (default-visible) groups. */
export function searchLoaded(query) {
  const q = query.trim().toLowerCase();
  const matches = [];
  const seen = new Set();
  for (const [groupKey, entry] of inMemory) {
    if (groupKey.startsWith("norad:")) continue;
    if (!Array.isArray(entry?.satrecs)) continue;
    for (const sat of entry.satrecs) {
      if (seen.has(sat._noradId)) continue;
      const name = sat._name.toLowerCase();
      if (name.includes(q) || String(sat._noradId) === q) {
        matches.push({ name: sat._name, norad_id: sat._noradId, group: groupKey });
        seen.add(sat._noradId);
        if (matches.length >= 50) return matches;
      }
    }
  }
  return matches;
}
