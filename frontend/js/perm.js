/* 首次进入 APP 统一声明必要权限：相机（扫一扫）、位置（地图/轨迹/雷达）。
   Android APK 由原生 MainActivity 在启动时申请；这里再触发一次浏览器/WebView
   的权限对话框，用户点「同意并开启」后一次性全部询问，避免用到时才一个个弹。 */
export const PERM_KEY = "starven_perm_v3";

export async function requestAll() {
  const out = { camera: "unsupported", geo: "unsupported" };
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } }, audio: false,
      });
      s.getTracks().forEach((t) => t.stop());
      out.camera = "granted";
    } catch (e) {
      out.camera = (e && e.name === "NotAllowedError") ? "denied" : "error";
    }
  }
  if (navigator.geolocation) {
    out.geo = await new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        () => resolve("granted"),
        (e) => resolve(e && e.code === 1 ? "denied" : "error"),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 9000 }
      );
    });
  }
  return out;
}

export async function status() {
  const out = { secure: window.isSecureContext, camera: "unknown", geo: "unknown" };
  try {
    if (navigator.permissions && navigator.permissions.query) {
      out.camera = (await navigator.permissions.query({ name: "camera" })).state;
      out.geo = (await navigator.permissions.query({ name: "geolocation" })).state;
    }
  } catch (e) { /* 部分 WebView 不支持 permissions API */ }
  return out;
}
