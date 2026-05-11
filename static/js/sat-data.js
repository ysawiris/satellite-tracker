// Static data: satellite groups, sensor metadata, imagery providers.
// Ported from app/satellites/{groups,metadata}.py — single source of truth
// in the client now that the deploy is pure static.

export const GROUPS = [
  { id: "stations", name: "Space Stations", query: "GROUP=stations", color: "#3b82f6", default_visible: true },
  { id: "visual",   name: "Brightest",      query: "GROUP=visual",   color: "#a3e635", default_visible: true },
  { id: "hubble",   name: "Hubble",         query: "CATNR=20580",    color: "#ec4899", default_visible: true },
  { id: "weather",  name: "Weather",        query: "GROUP=weather",  color: "#06b6d4", default_visible: false },
  { id: "gps",      name: "GPS",            query: "GROUP=gps-ops",  color: "#f59e0b", default_visible: false },
  { id: "starlink", name: "Starlink",       query: "GROUP=starlink", color: "#8b5cf6", default_visible: false },
  { id: "science",  name: "Science",        query: "GROUP=science",  color: "#10b981", default_visible: false },
  { id: "geo",      name: "Geostationary",  query: "GROUP=geo",      color: "#ef4444", default_visible: false },
];

const GROUPS_BY_ID = Object.fromEntries(GROUPS.map((g) => [g.id, g]));
export function getGroup(id) { return GROUPS_BY_ID[id] || null; }

// ----------------------------------------------------------------------------
// Sensor type metadata (radar, optical, IR, comms, navigation)
// ----------------------------------------------------------------------------

const RADAR_SATS = {
  39634: "Sentinel-1A",
  62261: "Sentinel-1C",
  32382: "RADARSAT-2",
  44322: "RADARSAT Constellation 1",
  44323: "RADARSAT Constellation 2",
  44324: "RADARSAT Constellation 3",
  31598: "COSMO-SkyMed 1",
  32376: "COSMO-SkyMed 2",
  33412: "COSMO-SkyMed 3",
  37216: "COSMO-SkyMed 4",
  49260: "COSMO-SkyMed 2nd Gen FM-1",
  52937: "COSMO-SkyMed 2nd Gen FM-2",
  43641: "SAOCOM-1A",
  46265: "SAOCOM-1B",
  31698: "TerraSAR-X",
  36605: "TanDEM-X",
  43653: "PAZ-1",
  43800: "ICEYE-X1",
  43801: "ICEYE-X2",
  44390: "ICEYE-X4",
  44391: "ICEYE-X5",
  46497: "ICEYE-X6",
  46498: "ICEYE-X7",
  48916: "ICEYE-X8",
  48917: "ICEYE-X9",
  46269: "Capella-2",
  47498: "Capella-3",
  47499: "Capella-4",
  47999: "Capella-5",
  48000: "Capella-6",
  50979: "Capella-7",
  50980: "Capella-8",
  39766: "ALOS-2",
};

const GROUP_FALLBACKS = {
  weather:  { sensor_type: "ir",         all_weather: false, description: "Infrared/visible weather imagery — blocked by thick clouds" },
  noaa:     { sensor_type: "ir",         all_weather: false, description: "NOAA polar weather imager" },
  gps:      { sensor_type: "navigation", all_weather: true,  description: "GPS signals pass through any weather" },
  starlink: { sensor_type: "comms",      all_weather: true,  description: "Comms link works through clouds" },
  geo:      { sensor_type: "comms",      all_weather: true,  description: "Geostationary comms" },
  stations: { sensor_type: "optical",    all_weather: false, description: "Crewed station — windows + cameras" },
  hubble:   { sensor_type: "optical",    all_weather: false, description: "Astronomy telescope — looks outward" },
  science:  { sensor_type: "unknown",    all_weather: false, description: "" },
  visual:   { sensor_type: "unknown",    all_weather: false, description: "" },
};

export function getSensorInfo(noradId, groupId = null) {
  if (noradId in RADAR_SATS) {
    return { sensor_type: "radar", all_weather: true, description: `${RADAR_SATS[noradId]} (SAR — sees through clouds)` };
  }
  if (groupId && groupId in GROUP_FALLBACKS) return GROUP_FALLBACKS[groupId];
  return { sensor_type: "unknown", all_weather: false, description: "" };
}

// ----------------------------------------------------------------------------
// Imagery provider mapping (free vs paid)
// ----------------------------------------------------------------------------

const FREE_IMAGERY = {
  39084: { provider: "USGS EarthExplorer",       url: "https://earthexplorer.usgs.gov/",
           description: "Landsat-8 OLI/TIRS · 30 m multispectral, 100 m thermal · free since 2008" },
  49260: { provider: "USGS EarthExplorer",       url: "https://earthexplorer.usgs.gov/",
           description: "Landsat-9 OLI-2/TIRS-2 · 30 m multispectral · free + global revisit" },
  39634: { provider: "Copernicus Browser",       url: "https://browser.dataspace.copernicus.eu/?lat={lat}&lng={lon}&zoom=10&datasetId=S1_GRD_IW",
           description: "Sentinel-1A · C-band SAR · 5–20 m, all-weather, free under Copernicus", deep_link: true },
  62261: { provider: "Copernicus Browser",       url: "https://browser.dataspace.copernicus.eu/?lat={lat}&lng={lon}&zoom=10&datasetId=S1_GRD_IW",
           description: "Sentinel-1C · C-band SAR · all-weather, free under Copernicus", deep_link: true },
  40697: { provider: "Copernicus Browser",       url: "https://browser.dataspace.copernicus.eu/?lat={lat}&lng={lon}&zoom=10&datasetId=S2L2A",
           description: "Sentinel-2A · 10 m multispectral · 5-day revisit · free", deep_link: true },
  42063: { provider: "Copernicus Browser",       url: "https://browser.dataspace.copernicus.eu/?lat={lat}&lng={lon}&zoom=10&datasetId=S2L2A",
           description: "Sentinel-2B · 10 m multispectral · pairs with 2A for 5-day revisit", deep_link: true },
  60989: { provider: "Copernicus Browser",       url: "https://browser.dataspace.copernicus.eu/?lat={lat}&lng={lon}&zoom=10&datasetId=S2L2A",
           description: "Sentinel-2C · 10 m multispectral · launched 2024, free", deep_link: true },
  41335: { provider: "Copernicus Browser",       url: "https://browser.dataspace.copernicus.eu/?lat={lat}&lng={lon}&zoom=6&datasetId=S3OLCI",
           description: "Sentinel-3A · 300 m ocean / land color · daily global coverage · free", deep_link: true },
  43437: { provider: "Copernicus Browser",       url: "https://browser.dataspace.copernicus.eu/?lat={lat}&lng={lon}&zoom=6&datasetId=S3OLCI",
           description: "Sentinel-3B · 300 m ocean / land color · pairs with 3A · free", deep_link: true },
  42969: { provider: "Copernicus Browser",       url: "https://browser.dataspace.copernicus.eu/?lat={lat}&lng={lon}&zoom=4&datasetId=S5_NO2",
           description: "Sentinel-5P TROPOMI · atmospheric NO₂, ozone, methane · free", deep_link: true },
  27424: { provider: "NASA Worldview",           url: "https://worldview.earthdata.nasa.gov/?v={lon_w},{lat_s},{lon_e},{lat_n}&l=MODIS_Aqua_CorrectedReflectance_TrueColor",
           description: "MODIS Aqua · 250 m–1 km true color · daily global · free", deep_link: true },
  25994: { provider: "NASA Worldview",           url: "https://worldview.earthdata.nasa.gov/?v={lon_w},{lat_s},{lon_e},{lat_n}&l=MODIS_Terra_CorrectedReflectance_TrueColor",
           description: "MODIS Terra · 250 m–1 km true color · daily global · free", deep_link: true },
  37849: { provider: "NASA Worldview",           url: "https://worldview.earthdata.nasa.gov/?v={lon_w},{lat_s},{lon_e},{lat_n}&l=VIIRS_SNPP_CorrectedReflectance_TrueColor",
           description: "VIIRS Suomi NPP · 375 m true color · daily, plus night-lights · free", deep_link: true },
  43013: { provider: "NASA Worldview",           url: "https://worldview.earthdata.nasa.gov/?v={lon_w},{lat_s},{lon_e},{lat_n}&l=VIIRS_NOAA20_CorrectedReflectance_TrueColor",
           description: "VIIRS NOAA-20 · 375 m true color · daily · free", deep_link: true },
  41866: { provider: "NOAA RAMMB SLIDER",        url: "https://rammb-slider.cira.colostate.edu/?sat=goes-16&sec=full_disk",
           description: "GOES-16 (East) · ABI · full-disk every 10 min, real-time weather · free" },
  43226: { provider: "NOAA RAMMB SLIDER",        url: "https://rammb-slider.cira.colostate.edu/?sat=goes-17&sec=full_disk",
           description: "GOES-17 · ABI · full-disk every 10 min · free" },
  51850: { provider: "NOAA RAMMB SLIDER",        url: "https://rammb-slider.cira.colostate.edu/?sat=goes-18&sec=full_disk",
           description: "GOES-18 (West) · ABI · full-disk every 10 min · free" },
  40267: { provider: "JMA Himawari Real-Time Web", url: "https://www.jma.go.jp/bosai/map.html#contents=himawari",
           description: "Himawari-8 · AHI · 10-min full-disk for Asia/Pacific · free" },
  49055: { provider: "JMA Himawari Real-Time Web", url: "https://www.jma.go.jp/bosai/map.html#contents=himawari",
           description: "Himawari-9 · AHI · 10-min full-disk · free" },
  25544: { provider: "NASA Earth Observations Lab", url: "https://eol.jsc.nasa.gov/SearchPhotos/",
           description: "Astronaut-shot photographs from the cupola — searchable archive of 4M+ images" },
  20580: { provider: "Hubble Legacy Archive",    url: "https://hla.stsci.edu/",
           description: "Looks outward at galaxies, nebulae, planets — not Earth imagery" },
};

const PAID_IMAGERY = {
  32060: { provider: "Maxar",            url: "https://www.maxar.com/products/satellite-imagery", description: "WorldView-1 · 50 cm panchromatic · commercial" },
  35946: { provider: "Maxar",            url: "https://www.maxar.com/products/satellite-imagery", description: "WorldView-2 · 46 cm pan / 1.85 m 8-band multispectral · commercial" },
  40115: { provider: "Maxar",            url: "https://www.maxar.com/products/satellite-imagery", description: "WorldView-3 · 31 cm pan / 1.24 m 8-band + SWIR · commercial" },
  41848: { provider: "Maxar",            url: "https://www.maxar.com/products/satellite-imagery", description: "WorldView-4 · 31 cm pan · commercial (decommissioned 2019, archive only)" },
  33331: { provider: "Maxar",            url: "https://www.maxar.com/products/satellite-imagery", description: "GeoEye-1 · 41 cm pan / 1.65 m multispectral · commercial" },
  38012: { provider: "Airbus OneAtlas",  url: "https://oneatlas.airbus.com/", description: "Pléiades-1A · 50 cm pan / 2 m 4-band · commercial" },
  39019: { provider: "Airbus OneAtlas",  url: "https://oneatlas.airbus.com/", description: "Pléiades-1B · 50 cm pan / 2 m 4-band · commercial" },
  38755: { provider: "Airbus OneAtlas",  url: "https://oneatlas.airbus.com/", description: "SPOT-6 · 1.5 m pan / 6 m multispectral · commercial" },
  40053: { provider: "Airbus OneAtlas",  url: "https://oneatlas.airbus.com/", description: "SPOT-7 · 1.5 m pan / 6 m multispectral · commercial" },
  39418: { provider: "Planet",           url: "https://www.planet.com/products/", description: "SkySat-1 · 72 cm pan / 1 m multispectral · commercial" },
  40072: { provider: "Planet",           url: "https://www.planet.com/products/", description: "SkySat-2 · 72 cm pan / 1 m multispectral · commercial" },
  43800: { provider: "ICEYE",            url: "https://www.iceye.com/satellite-data/products", description: "ICEYE X-band SAR · 0.5–1 m, all-weather · commercial (research access available)" },
  46269: { provider: "Capella Space",    url: "https://www.capellaspace.com/", description: "Capella X-band SAR · 0.5 m, all-weather · commercial" },
  44035: { provider: "BlackSky",         url: "https://www.blacksky.com/products/imagery/", description: "BlackSky Global · 1 m multispectral · commercial, high-cadence" },
  47422: { provider: "BlackSky",         url: "https://www.blacksky.com/products/imagery/", description: "BlackSky Global · 1 m · commercial" },
};

// Family-prefix matchers for satellites where individual NORAD IDs are too
// numerous to enumerate (Planet's Dove constellation has hundreds).
const FAMILY_MATCHERS = [
  ["FLOCK ",     { provider: "Planet",        url: "https://www.planet.com/products/",            description: "Planet Dove (Flock) · 3 m daily global · commercial" }],
  ["DOVE-",      { provider: "Planet",        url: "https://www.planet.com/products/",            description: "Planet Dove · 3 m · commercial" }],
  ["SUPERDOVE ", { provider: "Planet",        url: "https://www.planet.com/products/",            description: "Planet SuperDove · 3 m 8-band · commercial" }],
  ["SKYSAT-",    { provider: "Planet",        url: "https://www.planet.com/products/",            description: "Planet SkySat · 50 cm · commercial" }],
  ["ICEYE-",     { provider: "ICEYE",         url: "https://www.iceye.com/satellite-data/products", description: "ICEYE X-band SAR · all-weather · commercial" }],
  ["CAPELLA-",   { provider: "Capella Space", url: "https://www.capellaspace.com/",                description: "Capella X-band SAR · 0.5 m all-weather · commercial" }],
  ["BLACKSKY ",  { provider: "BlackSky",      url: "https://www.blacksky.com/products/imagery/",   description: "BlackSky Global · 1 m · commercial" }],
];

export function getImageryInfo(noradId, name = null) {
  if (noradId in FREE_IMAGERY) return { ...FREE_IMAGERY[noradId], free: true, deep_link: !!FREE_IMAGERY[noradId].deep_link };
  if (noradId in PAID_IMAGERY) return { ...PAID_IMAGERY[noradId], free: false, deep_link: false };
  if (name) {
    const upper = name.toUpperCase();
    for (const [prefix, info] of FAMILY_MATCHERS) {
      if (upper.startsWith(prefix)) return { ...info, free: false, deep_link: false };
    }
  }
  return null;
}
