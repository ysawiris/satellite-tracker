// 3D globe view backed by CesiumJS, lazy-loaded on first activation.
// Uses OpenStreetMap imagery to avoid requiring a Cesium Ion token.

const CESIUM_VERSION = "1.118";
const CESIUM_BASE = `https://cdn.jsdelivr.net/npm/cesium@${CESIUM_VERSION}/Build/Cesium`;

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
    this.onSelect = onSelect || (() => {});
  }

  async init() {
    if (this.viewer) return;
    const Cesium = await ensureCesiumLoaded();
    Cesium.Ion.defaultAccessToken = ""; // No token needed; using OSM.

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
        point: { pixelSize: 12, color: Cesium.Color.LIME, outlineColor: Cesium.Color.WHITE, outlineWidth: 2 },
        label: {
          text: "You",
          font: "12px sans-serif",
          pixelOffset: new Cesium.Cartesian2(0, -18),
          fillColor: Cesium.Color.WHITE,
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
          point: {
            pixelSize: 6,
            color: Cesium.Color.fromCssColorString(sat.color),
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 1,
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
    for (const [id, entity] of this.entities) {
      const isSelected = id === noradId;
      entity.point.pixelSize = isSelected ? 12 : 6;
      entity.point.outlineColor = isSelected ? Cesium.Color.YELLOW : Cesium.Color.WHITE;
      entity.point.outlineWidth = isSelected ? 2 : 1;
    }
  }

  flyTo(lat, lon, alt_km) {
    if (!this.viewer) return;
    this.viewer.camera.flyTo({
      destination: window.Cesium.Cartesian3.fromDegrees(lon, lat, (alt_km + 5000) * 1000),
      duration: 1.2,
    });
  }
}
