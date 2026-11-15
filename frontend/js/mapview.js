/* 地图视图：本地 Leaflet，无 CDN 依赖；瓦片源可切换，轨迹按人着色。
   crs=GCJ02 时自动用 coords.js 纠偏，避免「点在马路上但人明明在草坪」。
*/
import { toMapLatLng } from "./coords.js";

const PALETTE = ["#C97B5A", "#8FA38C", "#7C9CB8", "#E3B774", "#A88AA8", "#7FA39B", "#D19A8E", "#9AA47A"];
const colorOf = (id) => PALETTE[Math.abs(Number(id) || 0) % PALETTE.length];

let map = null;
let tileLayer = null;
let markerLayer = null;
let trackLayer = null;
let boundsLayer = null;
let currentCrs = "WGS84";
let currentCenter = null;
let rawCenter = null;

export function isReady() { return map !== null; }

export function initMap(domId, center, tiles) {
  destroy();
  currentCenter = center;
  rawCenter = { lat: center.lat, lng: center.lng, radius_m: center.radius_m || 150 };
  currentCrs = tiles.crs || "WGS84";
  const [clat, clng] = toMapLatLng(center.lat, center.lng, currentCrs);
  map = L.map(domId, {
    center: [clat, clng], zoom: 16, zoomControl: false,
    attributionControl: true, preferCanvas: true,
  });
  // 缩放按钮放右下，避开左上角的瓦片源 / 统计胶囊
  L.control.zoom({ position: "bottomright" }).addTo(map);
  markerLayer = L.layerGroup().addTo(map);
  trackLayer = L.layerGroup().addTo(map);
  boundsLayer = L.layerGroup().addTo(map);
  applyTiles(tiles);
  drawBounds();   // 场地边界圈（无论有没有瓦片都能看见范围）
  setTimeout(() => { if (map) map.invalidateSize(); }, 120);
  return map;
}

/** 用【当前瓦片源坐标系】重画场地圈：切换瓦片源后不再和轨迹错开 */
export function drawBounds() {
  if (!map || !boundsLayer || !rawCenter) return;
  boundsLayer.clearLayers();
  const [blat, blng] = toMapLatLng(rawCenter.lat, rawCenter.lng, currentCrs);
  L.circle([blat, blng], {
    radius: rawCenter.radius_m, color: "#C97B5A", weight: 1.6,
    dashArray: "5 6", fillColor: "#C97B5A", fillOpacity: .05,
  }).addTo(boundsLayer);
}

export function applyTiles(tiles) {
  if (!map) return;
  if (tileLayer) { map.removeLayer(tileLayer); tileLayer = null; }
  currentCrs = tiles.crs || "WGS84";
  drawBounds();
  if (!tiles.url) {
    // 无瓦片：纯轨迹画布，仍可缩放平移，背景用柔和网格
    document.getElementById("leaflet-map")?.classList.add("offline-map");
    return;
  }
  document.getElementById("leaflet-map")?.classList.remove("offline-map");
  let url = tiles.url;
  if (url.includes("{tk}")) {
    const tk = localStorage.getItem("starven_tianditu_tk") || "";
    if (!tk) return;  // 没 key 就退化成纯轨迹画布
    url = url.replace("{tk}", encodeURIComponent(tk));
  }
  tileLayer = L.tileLayer(url, {
    maxZoom: tiles.maxZoom || 19,
    subdomains: tiles.subdomains?.length ? tiles.subdomains : "abc",
    attribution: tiles.attribution || "",
  }).addTo(map);
  tileLayer.on("tileerror", () => {
    document.getElementById("leaflet-map")?.classList.add("tiles-failing");
  });
}

function dotIcon(kind, color) {
  const cls = kind === "self" ? "pin-dot me" : kind === "decoy" ? "pin-dot decoy" : "pin-dot";
  return L.divIcon({
    className: "", iconSize: [14, 14], iconAnchor: [7, 7],
    html: `<div class="${cls}" style="background:${color}"></div>`,
  });
}

export function update(mapData, myId, opts = {}) {
  if (!map) return;
  markerLayer.clearLayers();
  trackLayer.clearLayers();
  const crs = mapData.tiles?.crs || currentCrs;
  const conv = (lat, lng) => toMapLatLng(lat, lng, crs);

  // 轨迹（按人一条线）
  const groups = new Map();
  for (const p of (mapData.tracks || [])) {
    if (!groups.has(p.user_id)) groups.set(p.user_id, { name: p.display_name || "成员", pts: [] });
    groups.get(p.user_id).pts.push(conv(p.lat, p.lng));
  }
  let total = 0;
  for (const [uid, g] of groups) {
    if (g.pts.length > 1) {
      L.polyline(g.pts, {
        color: colorOf(uid), weight: 3, opacity: .72,
        lineCap: "round", lineJoin: "round",
      }).addTo(trackLayer);
    }
    total += g.pts.length;
  }

  // 实时点（公开后所有人同时显示）
  for (const p of (mapData.points || [])) {
    const [lat, lng] = conv(p.lat, p.lng);
    const isMe = p.kind === "self" || Number(p.id) === Number(myId);
    const color = p.kind === "decoy" ? "#E3B774" : isMe ? "#7C9CB8" : colorOf(p.id);
    const m = L.marker([lat, lng], { icon: dotIcon(p.kind, color), zIndexOffset: isMe ? 500 : 0 }).addTo(markerLayer);
    const label = p.kind === "decoy" ? "可疑信号" : (p.label || "成员");
    if (mapData.reveal_all || isMe || p.kind === "decoy" || mapData.see_all) {
      // 公开全员定位时点全部常驻；名字改为点按查看，避免十几个人挤成一团
      m.bindTooltip(label, { permanent: false, direction: "top", offset: [0, -8], className: "pin-label" });
    }
  }

  if (opts.fit && (total > 0 || (mapData.points || []).length)) {
    const all = [...(mapData.tracks || []).map((p) => conv(p.lat, p.lng)),
                 ...(mapData.points || []).map((p) => conv(p.lat, p.lng))];
    if (all.length) {
      try { map.fitBounds(L.latLngBounds(all).pad(.22), { maxZoom: 17, animate: true }); } catch (e) { /* ignore */ }
    }
  }
  return { trackPoints: total, people: groups.size };
}

export function focusMe(lat, lng, crs) {
  if (!map) return;
  const [a, b] = toMapLatLng(lat, lng, crs || currentCrs);
  map.setView([a, b], Math.max(map.getZoom(), 16), { animate: true });
}

export function destroy() {
  if (map) { try { map.remove(); } catch (e) { /* ignore */ } }
  map = null; tileLayer = null; markerLayer = null; trackLayer = null; boundsLayer = null;
}

export const colorFor = colorOf;
