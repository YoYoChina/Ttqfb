/* 坐标纠偏：手机 GPS/BDS 拿到的是 WGS-84；
   OSM / 天地图用 WGS-84，高德、腾讯瓦片是 GCJ-02，直接叠会偏 300~600 米。
   前端按当前瓦片源自动转换显示坐标（后端一律存 WGS-84，保证轨迹可导出复用）。
*/
const PI = Math.PI;
const A = 6378245.0;
const EE = 0.00669342162296594323;

function outOfChina(lat, lng) {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}
function transLat(x, y) {
  let ret = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += (20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2 / 3;
  ret += (20 * Math.sin(y * PI) + 40 * Math.sin(y / 3 * PI)) * 2 / 3;
  ret += (160 * Math.sin(y / 12 * PI) + 320 * Math.sin(y * PI / 30)) * 2 / 3;
  return ret;
}
function transLng(x, y) {
  let ret = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += (20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2 / 3;
  ret += (20 * Math.sin(x * PI) + 40 * Math.sin(x / 3 * PI)) * 2 / 3;
  ret += (150 * Math.sin(x / 12 * PI) + 300 * Math.sin(x / 30 * PI)) * 2 / 3;
  return ret;
}

export function wgs84ToGcj02(lat, lng) {
  if (outOfChina(lat, lng)) return [lat, lng];
  let dLat = transLat(lng - 105, lat - 35);
  let dLng = transLng(lng - 105, lat - 35);
  const radLat = lat / 180 * PI;
  let magic = Math.sin(radLat);
  magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180) / ((A * (1 - EE)) / (magic * sqrtMagic) * PI);
  dLng = (dLng * 180) / (A / sqrtMagic * Math.cos(radLat) * PI);
  return [lat + dLat, lng + dLng];
}

/** 按瓦片源 crs 转换一对坐标 */
export function toMapLatLng(lat, lng, crs = "WGS84") {
  return crs === "GCJ02" ? wgs84ToGcj02(lat, lng) : [lat, lng];
}

export const fmtCoord = (v) => (typeof v === "number" ? v.toFixed(6) : "—");
export const fmtAccuracy = (v) => (v == null ? "—" : `±${Math.round(v)} m`);


/** GCJ-02 -> WGS-84（迭代反解，误差 < 1 米）。
 *  管理员从高德/腾讯复制的坐标是 GCJ-02，入库前必须转成 WGS-84，
 *  才能和手机 GPS 上报的坐标对齐，场地圆圈才不会和轨迹错开几百米。 */
export function gcj02ToWgs84(lat, lng) {
  const glat = Number(lat), glng = Number(lng);
  let wlat = glat, wlng = glng;
  for (let i = 0; i < 6; i++) {
    const g = wgs84ToGcj02(wlat, wlng);
    wlat -= g[0] - glat;
    wlng -= g[1] - glng;
  }
  return [wlat, wlng];
}

/** 按用户选择的坐标系归一化到 WGS-84 */
export function normalizeInput(lat, lng, crs = "WGS84") {
  return String(crs).toUpperCase().indexOf("GCJ") >= 0
    ? gcj02ToWgs84(lat, lng) : [Number(lat), Number(lng)];
}
