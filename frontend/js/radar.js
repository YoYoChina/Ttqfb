/* 雷达画布：不依赖外部地图服务，用场地中心 + 相对米坐标展示 */
export function drawRadar(canvas, data, myId) {
  if (!canvas || !data) return;
  const box = canvas.getBoundingClientRect();
  const size = Math.max(240, Math.round(box.width || 320));
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, size, size);

  const c = size / 2;
  const R = Math.min(c - 24, size * 0.42);
  const center = data.center || { lat: 0, lng: 0, radius_m: 150 };
  const radius = center.radius_m || 150;
  const cosLat = Math.max(0.05, Math.cos((center.lat || 0) * Math.PI / 180));
  const toXY = (lat, lng) => {
    const dx = (lng - center.lng) * 111320 * cosLat;
    const dy = (lat - center.lat) * 111320;
    let x = c + dx / radius * R;
    let y = c - dy / radius * R;
    const dist = Math.hypot(x - c, y - c);
    if (dist > R) { x = c + (x - c) / dist * R; y = c + (y - c) / dist * R; }
    return { x, y };
  };

  // 底色
  const g = ctx.createRadialGradient(c, c, 10, c, c, R);
  g.addColorStop(0, "#FDFAF8"); g.addColorStop(1, "#F7EAE2");
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c, c, R, 0, Math.PI * 2); ctx.fill();

  // 同心圈
  ctx.strokeStyle = "#EBDCD1"; ctx.lineWidth = 1;
  [1 / 3, 2 / 3, 1].forEach((k) => {
    ctx.beginPath(); ctx.arc(c, c, R * k, 0, Math.PI * 2); ctx.stroke();
  });
  // 30 米探测圈
  if (radius > 30) {
    ctx.setLineDash([4, 4]); ctx.strokeStyle = "rgba(201,123,90,.6)";
    ctx.beginPath(); ctx.arc(c, c, 30 / radius * R, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(168,93,62,.8)"; ctx.font = "10px sans-serif";
    ctx.fillText("30m", c + 30 / radius * R + 3, c - 4);
  }
  // 十字与方位
  ctx.strokeStyle = "#F0E4DB"; ctx.beginPath();
  ctx.moveTo(c - R, c); ctx.lineTo(c + R, c); ctx.moveTo(c, c - R); ctx.lineTo(c, c + R); ctx.stroke();
  ctx.fillStyle = "#A99A91"; ctx.font = "11px sans-serif"; ctx.textAlign = "center";
  ctx.fillText("北", c, c - R + 13); ctx.fillText("南", c, c + R - 4);
  ctx.fillText("西", c - R + 9, c + 4); ctx.fillText("东", c + R - 9, c + 4);

  // 场地中心
  ctx.fillStyle = "#DCC6B7"; ctx.beginPath(); ctx.arc(c, c, 3, 0, Math.PI * 2); ctx.fill();

  const pts = data.points || [];
  const now = Date.now() / 1000;
  pts.forEach((p) => {
    const { x, y } = toXY(p.lat, p.lng);
    const stale = now - (p.at || now) > 120;
    if (p.kind === "decoy") {
      const pulse = 0.55 + 0.45 * Math.sin(now * 4 + p.id.length);
      ctx.fillStyle = `rgba(227,183,116,${0.2 * pulse})`;
      ctx.beginPath(); ctx.arc(x, y, 15, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#E3B774";
      ctx.beginPath(); ctx.moveTo(x, y - 7); ctx.lineTo(x + 6, y + 5); ctx.lineTo(x - 6, y + 5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#A68042"; ctx.font = "10px sans-serif";
      ctx.fillText("可疑", x, y + 17);
    } else {
      const color = p.kind === "self" ? "#7C9CB8" : (p.alive === false ? "#B9AFA8" : "#8FA38C");
      ctx.fillStyle = stale ? "#CFC4BC" : color;
      ctx.beginPath(); ctx.arc(x, y, p.kind === "self" ? 6 : 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke();
      if (p.kind === "self") {
        ctx.fillStyle = "rgba(124,156,184,.18)";
        ctx.beginPath(); ctx.arc(x, y, 13, 0, Math.PI * 2); ctx.fill();
      }
      if (data.privileged || p.kind === "self") {
        ctx.fillStyle = "#7C6E66"; ctx.font = "9.5px sans-serif";
        ctx.fillText(p.label || "", x, y - 10);
      }
    }
  });

  ctx.fillStyle = "#A99A91"; ctx.font = "10px sans-serif";
  ctx.fillText(`场地半径 ${Math.round(radius)} 米 · ${pts.length} 个信号`, c, size - 6);
}
