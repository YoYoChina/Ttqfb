/* GPS/BDS 定位 v2：持续上报 + 全程轨迹批量缓存（弱网重发靠 seq 去重） */
export const isSecure = window.isSecureContext
  || ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
export const geoSupported = "geolocation" in navigator;

let watchId = null;
let queue = [];
let seq = 0;
let lastFlush = 0;
let cfg = {
  onBatch: null, onFix: null, onError: null,
  batchSize: 5, flushSeconds: 8,
  phase: () => "", enabled: () => true,
};

function failMessage(err) {
  if (!isSecure) return "当前是 HTTP 明文访问，浏览器禁止定位。请改用 HTTPS（见部署说明）";
  if (err && err.code === 1) return "定位权限被拒绝，请在浏览器/系统设置里允许位置权限";
  if (err && err.code === 3) return "定位超时，请到户外开阔处再试";
  return "暂时无法获取定位：" + ((err && err.message) || "未知原因");
}

export function configure(opts) { cfg = { ...cfg, ...opts }; }

export async function permission() {
  if (!navigator.permissions || !navigator.permissions.query) return "unknown";
  try {
    const r = await navigator.permissions.query({ name: "geolocation" });
    return r.state; // granted / prompt / denied
  } catch (e) { return "unknown"; }
}

export async function diagnose() {
  return {
    secure: isSecure,
    supported: geoSupported,
    permission: await permission(),
    watching: watchId !== null,
    queued: queue.length,
    seq,
  };
}

export function startWatching(onFix, onError) {
  if (onFix) cfg.onFix = onFix;
  if (onError) cfg.onError = onError;
  if (!geoSupported) { (cfg.onError || (() => {}))(failMessage({ message: "设备不支持定位" })); return false; }
  stopWatching();
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const fix = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy || null,
        at: pos.timestamp / 1000,
      };
      if (cfg.onFix) cfg.onFix(fix);
      if (cfg.enabled()) {
        queue.push({
          lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy,
          seq: ++seq, recorded_at: fix.at, phase: cfg.phase() || null,
        });
        if (queue.length >= cfg.batchSize || Date.now() / 1000 - lastFlush >= cfg.flushSeconds) flush();
      }
    },
    (err) => { if (cfg.onError) cfg.onError(failMessage(err)); },
    { enableHighAccuracy: true, maximumAge: 3000, timeout: 12000 }
  );
  return true;
}

/** 把缓存的轨迹点交给上层批量上报；返回本次送出的点数 */
export function flush() {
  if (!queue.length || !cfg.onBatch) return 0;
  const batch = queue.splice(0, 200);
  lastFlush = Date.now() / 1000;
  Promise.resolve(cfg.onBatch(batch)).catch(() => {
    // 失败把点放回队首，下次重发（后端按 seq 去重，不会产生重复轨迹）
    queue = batch.concat(queue).slice(0, 400);
  });
  return batch.length;
}

export function stopWatching() {
  flush();
  if (watchId !== null && navigator.geolocation) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
}

export function once() {
  return new Promise((resolve, reject) => {
    if (!geoSupported) return reject(new Error(failMessage({ message: "设备不支持定位" })));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({
        lat: p.coords.latitude, lng: p.coords.longitude,
        accuracy: p.coords.accuracy || null, at: p.timestamp / 1000,
      }),
      (e) => reject(new Error(failMessage(e))),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    );
  });
}
