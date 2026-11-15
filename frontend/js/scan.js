/* 扫一扫：优先系统 BarcodeDetector，回退本地 jsQR，最后兜底手动输入 */
export function createScanner({ video, onCode, onStatus }) {
  let stream = null;
  let timer = null;
  let raf = null;
  let detector = null;
  let running = false;
  let lastCode = "";
  let lastAt = 0;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  function accept(raw) {
    const code = (raw || "").trim().toUpperCase();
    const t = Date.now();
    if (!code || (code === lastCode && t - lastAt < 2500)) return;
    lastCode = code; lastAt = t;
    onCode(code);
  }

  async function nativeLoop() {
    if (!running) return;
    try {
      const list = await detector.detect(video);
      if (list && list.length) accept(list[0].rawValue);
    } catch (e) { /* 单帧失败忽略 */ }
    timer = setTimeout(nativeLoop, 350);
  }

  function jsqrLoop() {
    if (!running) return;
    if (video.readyState >= 2 && typeof window.jsQR === "function") {
      const w = Math.min(640, video.videoWidth || 640);
      const h = Math.round(w * (video.videoHeight || 480) / (video.videoWidth || 640));
      if (canvas.width !== w) { canvas.width = w; canvas.height = h; }
      try {
        ctx.drawImage(video, 0, 0, w, h);
        const img = ctx.getImageData(0, 0, w, h);
        const res = window.jsQR(img.data, w, h, { inversionAttempts: "dontInvert" });
        if (res && res.data) accept(res.data);
      } catch (e) { /* ignore */ }
    }
    raf = requestAnimationFrame(() => setTimeout(jsqrLoop, 120));
  }

  async function start() {
    if (running) return "running";
    running = true;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      onStatus("当前环境不支持摄像头，请直接在下方手动输入球码");
      return "manual";
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }, audio: false,
      });
    } catch (e) {
      onStatus("摄像头未开启（" + (e.name || "权限不足") + "），请用下方手动输入；HTTPS 下才能调用摄像头");
      running = false;
      return "manual";
    }
    video.srcObject = stream;
    try { await video.play(); } catch (e) { /* ignore */ }
    if ("BarcodeDetector" in window) {
      try { detector = new BarcodeDetector({ formats: ["qr_code"] }); } catch (e) { detector = null; }
    }
    if (detector) { onStatus("摄像头已开启 · 系统扫码引擎"); nativeLoop(); return "native"; }
    if (typeof window.jsQR === "function") {
      onStatus("摄像头已开启 · 本地扫码引擎"); jsqrLoop(); return "jsqr";
    }
    onStatus("摄像头已开启，但缺少扫码引擎，请用下方手动输入");
    return "manual";
  }

  function stop() {
    running = false;
    clearTimeout(timer);
    if (raf) cancelAnimationFrame(raf);
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    if (video) video.srcObject = null;
  }

  return { start, stop };
}
