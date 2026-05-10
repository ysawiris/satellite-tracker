// 3D globe view backed by CesiumJS, lazy-loaded on first activation.
// Uses OpenStreetMap imagery and satellite-shaped billboards.

const CESIUM_VERSION = "1.118";
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
    this.onSelect = onSelect || (() => {});
  }

  async init() {
    if (this.viewer) return;
    const Cesium = await ensureCesiumLoaded();
    Cesium.Ion.defaultAccessToken = "";

    this.viewer = new Cesium.Viewer(this.containerId, {
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
      imageryProvider: new Cesium.OpenStreetMapImageryProvider({
        url: "https://tile.openstreetmap.org/",
      }),
    });

    this.viewer.scene.globe.enableLighting = true;
    this.viewer.scene.skyBox.show = true;
    this.viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#02030e");

    this.viewer.screenSpaceEventHandler.setInputAction((event) => {
      const picked = this.viewer.scene.pick(event.position);
      if (picked && picked.id && picked.id._satMeta) {
        this.onSelect(picked.id._satMeta);
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

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
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
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
}
