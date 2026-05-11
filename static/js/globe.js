// 3D globe view backed by CesiumJS, lazy-loaded on first activation.
// Uses OpenStreetMap imagery and satellite-shaped billboards.

const CESIUM_VERSION = "1.105";
const CESIUM_BASE = `https://cdn.jsdelivr.net/npm/cesium@${CESIUM_VERSION}/Build/Cesium`;

const SAT_BILLBOARD = "data:image/svg+xml;utf8," + encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 36 20' width='36' height='20'>
    <rect x='0' y='4' width='8' height='12' opacity='0.6' rx='1.2' fill='white'/>
    <rect x='28' y='4' width='8' height='12' opacity='0.6' rx='1.2' fill='white'/>
    <rect x='8' y='9' width='4' height='2' opacity='0.7' fill='white'/>
    <rect x='24' y='9' width='4' height='2' opacity='0.7' fill='white'/>
    <rect x='13' y='3' width='10' height='14' rx='2.4' fill='white'/>
    <rect x='15.5' y='6' width='5' height='8' rx='0.8' fill='rgba(0,0,0,0.45)'/>
  </svg>`
);

const SUN_BILLBOARD = "data:image/svg+xml;utf8," + encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64' width='64' height='64'>
    <defs>
      <radialGradient id='core' cx='50%' cy='50%' r='50%'>
        <stop offset='0%' stop-color='#fffbe6'/>
        <stop offset='35%' stop-color='#fde68a'/>
        <stop offset='70%' stop-color='#f59e0b'/>
        <stop offset='100%' stop-color='#f59e0b' stop-opacity='0'/>
      </radialGradient>
      <radialGradient id='halo' cx='50%' cy='50%' r='50%'>
        <stop offset='0%' stop-color='#fde68a' stop-opacity='0.6'/>
        <stop offset='60%' stop-color='#f59e0b' stop-opacity='0.15'/>
        <stop offset='100%' stop-color='#f59e0b' stop-opacity='0'/>
      </radialGradient>
    </defs>
    <circle cx='32' cy='32' r='30' fill='url(#halo)'/>
    <g stroke='#fde68a' stroke-width='1.5' stroke-linecap='round' opacity='0.7'>
      <line x1='32' y1='6' x2='32' y2='14'/>
      <line x1='32' y1='50' x2='32' y2='58'/>
      <line x1='6' y1='32' x2='14' y2='32'/>
      <line x1='50' y1='32' x2='58' y2='32'/>
      <line x1='13' y1='13' x2='19' y2='19'/>
      <line x1='45' y1='45' x2='51' y2='51'/>
      <line x1='13' y1='51' x2='19' y2='45'/>
      <line x1='45' y1='19' x2='51' y2='13'/>
    </g>
    <circle cx='32' cy='32' r='12' fill='url(#core)'/>
  </svg>`
);

let cesiumLoading = null;

export async function ensureCesiumLoaded() {
  if (window.Cesium) return window.Cesium;
  if (cesiumLoading) return cesiumLoading;
  cesiumLoading = new Promise((resolve, reject) => {
    window.CESIUM_BASE_URL = CESIUM_BASE;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `${CESIUM_BASE}/Widgets/widgets.css`;
    document.head.appendChild(link);

    const script = document.createElement("script");
    script.src = `${CESIUM_BASE}/Cesium.js`;
    script.onload = () => resolve(window.Cesium);
    script.onerror = () => reject(new Error("Failed to load CesiumJS"));
    document.head.appendChild(script);
  });
  return cesiumLoading;
}

export class GlobeView {
  constructor(containerId, { onSelect } = {}) {
    this.containerId = containerId;
    this.viewer = null;
    this.entities = new Map(); // norad_id -> Cesium.Entity
    this.observerEntity = null;
    this.selectedId = null;
    this.orbitEntity = null;
    this.sunEntity = null;
    this._clockTimer = null;
    this.onSelect = onSelect || (() => {});
  }

  async init() {
    if (this.viewer) return;
    const Cesium = await ensureCesiumLoaded();
    Cesium.Ion.defaultAccessToken = "";

    // Base layer: ESRI World Imagery (clear-sky satellite photography).
    const baseProvider = new Cesium.UrlTemplateImageryProvider({
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      credit: "Esri, Maxar, Earthstar Geographics",
      maximumLevel: 18,
    });

    this.viewer = new Cesium.Viewer(this.containerId, {
      imageryProvider: baseProvider,
      terrainProvider: new Cesium.EllipsoidTerrainProvider(),
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      timeline: false,
      animation: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
    });

    // Cloud overlay — initialised at "yesterday's pass" and swappable via
    // setCloudTime() so the user can scrub through the past 24h.
    this._cloudLayers = [];
    this._cloudVisible = true;
    this._cloudAlpha = 0.65;
    this.setCloudTime(new Date(Date.now() - 36 * 3600 * 1000));

    // Force opaque globe — Cesium boots with translucency settings that
    // sometimes leave the surface invisible until poked.
    const globe = this.viewer.scene.globe;
    globe.show = true;
    globe.translucency.enabled = false;
    globe.translucency.frontFaceAlpha = 1.0;
    globe.translucency.backFaceAlpha = 1.0;
    globe.depthTestAgainstTerrain = false;
    globe.baseColor = Cesium.Color.fromCssColorString("#0a1a3a");
    globe.enableLighting = true;
    // Stronger night-side dimming so the terminator is obvious.
    if ("nightFadeOutDistance" in globe) globe.nightFadeOutDistance = 4_000_000;
    if ("nightFadeInDistance" in globe) globe.nightFadeInDistance = 40_000_000;
    if ("atmosphereLightIntensity" in globe) globe.atmosphereLightIntensity = 8.0;
    this.viewer.scene.skyBox.show = true;
    this.viewer.scene.skyAtmosphere.show = true;
    // Render Cesium's built-in sun at its real astronomical position (~1 AU
    // away) so the sun appears as a bright point in space when the camera
    // looks toward it — instead of a sticker glued to Earth's surface.
    this.viewer.scene.sun.show = true;
    if ("glowFactor" in this.viewer.scene.sun) this.viewer.scene.sun.glowFactor = 2.5;
    this.viewer.scene.moon.show = true;
    this.viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#02030e");
    // Switch off explicit-render mode so Cesium pumps frames continuously.
    this.viewer.scene.requestRenderMode = false;
    this.viewer.useDefaultRenderLoop = true;

    // Keep the clock pinned to wall-clock time so lighting (and therefore
    // the terminator) tracks the real sub-solar point. Without this, Cesium
    // happily freezes the sun wherever the page first loaded.
    const syncClock = () => {
      if (!this.viewer) return;
      this.viewer.clock.currentTime = Cesium.JulianDate.fromDate(new Date());
    };
    syncClock();
    this._clockTimer = setInterval(syncClock, 30_000);

    this.viewer.screenSpaceEventHandler.setInputAction((event) => {
      const picked = this.viewer.scene.pick(event.position);
      if (picked && picked.id && picked.id._satMeta) {
        this.onSelect(picked.id._satMeta);
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    // Cesium 1.x sometimes refuses to fetch the first imagery tiles until
    // the user actually interacts with the canvas. Dispatch a synthetic mouse
    // gesture and reset the surface tile-render queue to kick it awake.
    setTimeout(() => {
      if (!this.viewer) return;
      const canvas = this.viewer.canvas;
      const surface = this.viewer.scene.globe._surface;
      if (surface && Array.isArray(surface._tilesToRenderByTextureCount)) {
        surface._tilesToRenderByTextureCount = [];
      }
      canvas.dispatchEvent(new MouseEvent("mousedown", { clientX: canvas.width / 2, clientY: canvas.height / 2, bubbles: true }));
      canvas.dispatchEvent(new MouseEvent("mouseup", { clientX: canvas.width / 2, clientY: canvas.height / 2, bubbles: true }));
      this.viewer.scene.requestRender();
    }, 100);

  }

  setCloudsVisible(show) {
    this._cloudVisible = show;
    for (const l of this._cloudLayers) l.show = show;
  }
  setCloudsOpacity(alpha) {
    this._cloudAlpha = Math.max(0, Math.min(1, alpha));
    for (const l of this._cloudLayers) l.alpha = this._cloudAlpha;
  }

  /**
   * Swap the cloud overlay to imagery for a specific timestamp.
   *
   * Composites MODIS Aqua + Terra (different equator-crossing times) so the
   * scan-line gaps in any single satellite's pass get filled in by the other.
   * Clouds end up looking smooth + globally covered, instead of the strobing
   * stripe pattern you'd see from a single sensor.
   */
  setCloudTime(date) {
    if (!this.viewer) return;
    const Cesium = window.Cesium;
    const dateStr = (date instanceof Date ? date : new Date(date)).toISOString().slice(0, 10);

    const make = (productId, credit) => new Cesium.UrlTemplateImageryProvider({
      url: `https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/${productId}/default/${dateStr}/250m/{z}/{y}/{x}.jpg`,
      credit,
      maximumLevel: 8,
      tilingScheme: new Cesium.GeographicTilingScheme(),
      rectangle: Cesium.Rectangle.MAX_VALUE,
    });

    // Build the new pair first so old tiles stay on screen until the new ones
    // are ready — avoids a black flash during scrub.
    const aqua = this.viewer.imageryLayers.addImageryProvider(make("MODIS_Aqua_CorrectedReflectance_TrueColor", "NASA GIBS · MODIS Aqua"));
    const terra = this.viewer.imageryLayers.addImageryProvider(make("MODIS_Terra_CorrectedReflectance_TrueColor", "NASA GIBS · MODIS Terra"));

    // Each pass at half-alpha; together they sum to a near-opaque global
    // cloud blanket where land/ocean still shows through gaps.
    aqua.alpha = this._cloudAlpha * 0.6;
    terra.alpha = this._cloudAlpha * 0.6;
    // Light contrast bump makes clouds whiter against the warm imagery base.
    aqua.contrast = 1.15; terra.contrast = 1.15;
    aqua.brightness = 1.05; terra.brightness = 1.05;
    aqua.show = this._cloudVisible;
    terra.show = this._cloudVisible;

    // Drop the old layers after a short delay so the new pair has time to render.
    const old = this._cloudLayers.slice();
    this._cloudLayers = [aqua, terra];
    this._currentCloudDate = dateStr;
    setTimeout(() => {
      for (const l of old) {
        try { this.viewer.imageryLayers.remove(l, true); } catch (_) { /* viewer may have been torn down */ }
      }
    }, 500);
  }

  getCloudDate() { return this._currentCloudDate; }

  resize() {
    if (this.viewer) this.viewer.resize();
  }

  setObserver(lat, lon) {
    if (!this.viewer) return;
    const Cesium = window.Cesium;
    if (lat == null || lon == null) {
      if (this.observerEntity) {
        this.viewer.entities.remove(this.observerEntity);
        this.observerEntity = null;
      }
      return;
    }
    if (!this.observerEntity) {
      this.observerEntity = this.viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(lon, lat, 0),
        point: {
          pixelSize: 12,
          color: Cesium.Color.fromCssColorString("#34d399"),
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
        },
        label: {
          text: "You",
          font: "12px Inter, sans-serif",
          pixelOffset: new Cesium.Cartesian2(0, -22),
          fillColor: Cesium.Color.WHITE,
          showBackground: true,
          backgroundColor: Cesium.Color.fromCssColorString("rgba(5,8,22,0.85)"),
          backgroundPadding: new Cesium.Cartesian2(6, 4),
        },
      });
    } else {
      this.observerEntity.position = Cesium.Cartesian3.fromDegrees(lon, lat, 0);
    }
  }

  upsertSatellites(satellites) {
    if (!this.viewer) return new Set();
    const Cesium = window.Cesium;
    const seen = new Set();
    for (const sat of satellites) {
      seen.add(sat.norad_id);
      const pos = Cesium.Cartesian3.fromDegrees(sat.lon, sat.lat, sat.alt_km * 1000);
      const existing = this.entities.get(sat.norad_id);
      if (existing) {
        existing.position = pos;
        existing._satMeta = sat;
      } else {
        const entity = this.viewer.entities.add({
          position: pos,
          billboard: {
            image: SAT_BILLBOARD,
            width: 24,
            height: 14,
            color: Cesium.Color.fromCssColorString(sat.color),
            scaleByDistance: new Cesium.NearFarScalar(1.5e6, 1.4, 4e7, 0.6),
            // Depth-test against the globe so satellites on the far side
            // of Earth get hidden behind it.
          },
        });
        entity._satMeta = sat;
        this.entities.set(sat.norad_id, entity);
      }
    }
    return seen;
  }

  removeSatellitesNotIn(keepIds) {
    for (const [id, entity] of this.entities) {
      if (!keepIds.has(id)) {
        this.viewer.entities.remove(entity);
        this.entities.delete(id);
      }
    }
  }

  highlight(noradId) {
    if (!this.viewer) return;
    const Cesium = window.Cesium;
    if (this.selectedId != null && this.selectedId !== noradId) {
      const prev = this.entities.get(this.selectedId);
      const meta = prev?._satMeta;
      if (prev && meta) {
        prev.billboard.color = Cesium.Color.fromCssColorString(meta.color);
        prev.billboard.width = 24;
        prev.billboard.height = 14;
      }
    }
    this.selectedId = noradId;
    const entity = this.entities.get(noradId);
    if (!entity) return;
    entity.billboard.color = Cesium.Color.fromCssColorString("#fbbf24");
    entity.billboard.width = 36;
    entity.billboard.height = 20;
  }

  flyTo(lat, lon, alt_km) {
    if (!this.viewer) return;
    this.viewer.camera.flyTo({
      destination: window.Cesium.Cartesian3.fromDegrees(lon, lat, (alt_km + 5000) * 1000),
      duration: 1.2,
    });
  }

  // ---- Onboard / chase camera ---------------------------------------------

  /**
   * Lock the Cesium camera onto the satellite — Cesium handles the rest:
   * orbits around it, can be dragged to spin POV, follows as it moves.
   * Pass null to release.
   */
  followSatellite(noradId) {
    if (!this.viewer) return;
    if (noradId == null) {
      this.viewer.trackedEntity = undefined;
      return;
    }
    const entity = this.entities.get(noradId);
    if (!entity) return;
    this.viewer.trackedEntity = entity;
  }

  unfollowSatellite() {
    if (this.viewer) this.viewer.trackedEntity = undefined;
  }

  // ---- Orbit trail ---------------------------------------------------------

  setOrbitTrail(samples, color) {
    this.clearOrbitTrail();
    if (!this.viewer || !samples || samples.length < 2) return;
    const Cesium = window.Cesium;
    const positions = [];
    for (const s of samples) {
      positions.push(s.lon, s.lat, s.alt_km * 1000);
    }
    this.orbitEntity = this.viewer.entities.add({
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArrayHeights(positions),
        width: 4,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.35,
          taperPower: 0.6,
          color: Cesium.Color.fromCssColorString(color || "#fbbf24").withAlpha(0.95),
        }),
        arcType: Cesium.ArcType.NONE,
      },
    });
  }

  clearOrbitTrail() {
    if (this.orbitEntity && this.viewer) {
      this.viewer.entities.remove(this.orbitEntity);
      this.orbitEntity = null;
    }
  }

  // ---- Sub-solar marker ----------------------------------------------------

  /**
   * No-op on the 3D globe — Cesium's built-in real-time lighting already
   * shows where the sub-solar point is (it's the brightest spot on the lit
   * hemisphere). Stamping a sun-shaped billboard on the surface looked like
   * a sticker glued to the planet rather than the actual 1 AU-distant sun.
   * The 2D map keeps its prominent sun marker because flat projections
   * have no lighting to communicate it.
   */
  setSunPosition(_sunLat, _sunLon) {
    if (!this.viewer) return;
    if (this.sunEntity) {
      this.viewer.entities.remove(this.sunEntity);
      this.sunEntity = null;
    }
  }
}
