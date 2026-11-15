/* 星湾躲猫猫 APP · v2 主控
   新：自定义多段倒计时、地图/雷达双定位、全程轨迹、一键公开全员定位、定位自检
*/
import { API, getToken, setToken, clearToken } from "./api.js";
import * as WS from "./ws.js";
import * as GEO from "./geo.js";
import { createScanner } from "./scan.js";
import { drawRadar } from "./radar.js";
import * as MAP from "./mapview.js";
import { fmtCoord, fmtAccuracy } from "./coords.js";

const $ = (s) => document.querySelector(s);
const view = $("#view"), tabsEl = $("#tabs"), toastEl = $("#toast");
const modal = $("#modal"), modalBody = $("#modal-body"), tipEl = $("#security-tip");

const S = {
  user: null, tab: "home", state: null, stateAt: 0,
  authMode: "login", scanResult: null, scanner: null, scanning: false,
  cd: null, cdAt: 0, cdEditing: false, cdModeDraft: "sequential",
  mapMode: "map", mapData: null, geoDiag: null, geoFix: null, geoError: "",
  geoTest: "", revealAll: false, tilesKey: "osm", tilesTk: "",
  radar: null, adminData: { players: [], balls: [], invites: [], games: [] },
  installEvt: null, lastReport: 0, wsGameId: null, wsConnected: false,
  trackCount: 0, mapStats: null,
};
let toastTimer = null, clockTimer = null, cdTimer = null, mapTimer = null, radarTimer = null;

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const attr = (s) => esc(s);
const icon = (n, cls = "") => `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${n}"></use></svg>`;

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2800);
}
function showModal(html) { modalBody.innerHTML = html; modal.classList.remove("hidden"); }
function closeModal() { modal.classList.add("hidden"); modalBody.innerHTML = ""; }

function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const p = (v) => String(v).padStart(2, "0");
  return h > 0 ? `${p(h)}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}
function fmtAt(t) { return t ? new Date(t * 1000).toLocaleTimeString("zh-CN", { hour12: false }) : "—"; }
function fmtMin(sec) {
  const m = Math.round((sec || 0) / 60 * 10) / 10;
  return Number.isInteger(m) ? `${m}` : m.toFixed(1);
}
async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast("已复制：" + text); }
  catch (e) {
    const ta = document.createElement("textarea");
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); toast("已复制：" + text); }
    catch (_) { toast("请手动复制：" + text); }
    ta.remove();
  }
}
const gid = () => (S.state?.has_game ? S.state.game.id : "");
const roleCn = (r) => ({ catcher: "抓捕者", hider: "躲藏者", assistant: "协助者",
  pending: "待抽签", admin: "管理员" })[r] || r;

/* ---------------------------------------------------------------- 启动 */
async function boot() {
  S.tilesKey = localStorage.getItem("starven_tiles") || "osm";
  S.tilesTk = localStorage.getItem("starven_tianditu_tk") || "";
  if (!getToken()) { renderAuth(); return; }
  try {
    S.user = (await API.me()).user;
    await refresh();
    startGeo(); ensureWs();
  } catch (e) { clearToken(); renderAuth(); }
}

window.addEventListener("starven:unauthorized", () => {
  S.user = null; WS.disconnect(); GEO.stopWatching();
  clearInterval(clockTimer); clearInterval(cdTimer); clearInterval(mapTimer); clearInterval(radarTimer);
  MAP.destroy(); renderAuth();
});
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); S.installEvt = e; });

/* ---------------------------------------------------------------- 登录 */
function renderAuth() {
  tabsEl.classList.add("hidden");
  $("#topbar-right").innerHTML = `<span>第一期拍摄企划</span>`;
  tipEl.classList.add("hidden");
  const reg = S.authMode === "register";
  view.innerHTML = `
    <div class="auth-wrap">
      <div class="auth-hero">
        <div class="hero-chip">✦ STARVEN · EP.01</div>
        <h1>星湾躲猫猫</h1>
        <p>第一期趣味比赛 · 星湾工作室官方 APP</p>
      </div>
      <div class="auth-tabs">
        <div data-act="auth-switch" data-mode="login" class="${reg ? "" : "on"}">登录</div>
        <div data-act="auth-switch" data-mode="register" class="${reg ? "on" : ""}">注册</div>
      </div>
      <div class="card">
        ${reg ? `
          <form data-form="register">
            <label class="field"><span>用户名（3-20 位字母数字下划线）</span><input name="username" required autocomplete="username"></label>
            <label class="field"><span>昵称 / 姓名</span><input name="display_name" required maxlength="20"></label>
            <label class="field"><span>密码（至少 8 位）</span><input name="password" type="password" required minlength="8"></label>
            <label class="field"><span>邀请码</span><input name="invite_code" required placeholder="向管理员索取"></label>
            <button class="btn block" type="submit">${icon("sparkle", "sm")} 注册并登录</button>
          </form>` : `
          <form data-form="login">
            <label class="field"><span>用户名</span><input name="username" required autocomplete="username"></label>
            <label class="field"><span>密码</span><input name="password" type="password" required autocomplete="current-password"></label>
            <button class="btn block" type="submit">${icon("arrow", "sm")} 登录</button>
          </form>`}
      </div>
      <div class="notice sage">${icon("info", "sm")} 全员参加 · 携带手机与拍摄设备。账号由工作室统一发放邀请码注册。<br>「为星湾之未来而奋斗 ✊」</div>
    </div>`;
}

async function doLogin(form) {
  const r = await API.login(Object.fromEntries(new FormData(form)));
  setToken(r.token); S.user = r.user;
  toast(`欢迎回来，${r.user.display_name}`);
  await refresh(); startGeo(); ensureWs();
}
async function doRegister(form) {
  const r = await API.register(Object.fromEntries(new FormData(form)));
  setToken(r.token); S.user = r.user;
  toast("注册成功，欢迎加入！");
  await refresh(); startGeo(); ensureWs();
}

/* ---------------------------------------------------------------- 数据 / 渲染保护 */
async function refresh(silent = false) {
  try {
    S.state = await API.current();
    S.stateAt = Date.now() / 1000;
    if (S.user?.is_admin && S.tab === "admin") await loadAdmin();
    safeRender();
    ensureWs();
  } catch (e) { if (!silent) toast(e.message); }
}

/** 地图初始化后 / 摄像头取流中 / 倒计时编辑中，不做整页重绘，避免打断 */
function safeRender() {
  if (S.tab === "locate" && S.mapMode === "map") { paintRevealBanner(); paintGeoCard(); return; }
  if (S.tab === "scan" && S.scanning) { renderTopbar(); return; }
  if (S.tab === "timer" && S.cdEditing) { paintCountdown(); return; }
  render();
}

function ensureWs() {
  const id = gid();
  if (!S.user || !getToken()) return;
  if (S.wsGameId === id) return;
  S.wsGameId = id;
  WS.disconnect(); WS.connect(getToken(), id);
}

function startGeo() {
  if (!GEO.isSecure) { S.geoError = "HTTP 明文访问，浏览器已禁用定位与摄像头"; renderTip(); return; }
  GEO.configure({
    phase: () => S.state?.clock?.phase || "",
    enabled: () => !!(gid() && S.state?.game.status !== "finished"),
    onFix: async (fix) => {
      S.geoFix = fix; S.geoError = "";
      const id = gid(), t = Date.now() / 1000;
      if (!id || !S.state || S.state.game.status === "finished") return;
      if (t - S.lastReport >= 5) {
        S.lastReport = t;
        try { await API.position(id, { lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy }); }
        catch (e) { /* 静默 */ }
      }
      if (S.tab === "locate") paintGeoCard();
    },
    onError: (msg) => { S.geoError = msg; renderTip(); if (S.tab === "locate") paintGeoCard(); },
    onBatch: async (points) => {
      const id = gid(); if (!id) return;
      const r = await API.track(id, points);
      S.trackCount = r.total;
      if (S.tab === "locate") paintGeoCard();
    },
  });
  GEO.startWatching();
}

function renderTip() {
  if (!S.user) { tipEl.classList.add("hidden"); return; }
  if (!GEO.isSecure) {
    tipEl.innerHTML = `<strong>⚠️ 当前为 HTTP 明文访问</strong>：浏览器会禁用摄像头扫码与 GPS/BDS 定位，地图轨迹也无法记录。请启用 HTTPS（推荐复用现有 443 加子域名反代，或 8443 + 证书）。`;
    tipEl.classList.remove("hidden");
  } else if (S.geoError) {
    tipEl.innerHTML = `<strong>定位提示</strong>：${esc(S.geoError)}。扫球仍可手动输入球码完成，计分不受影响。`;
    tipEl.classList.remove("hidden");
  } else tipEl.classList.add("hidden");
}

/* ---------------------------------------------------------------- 框架 */
const TABS = [
  { id: "home", ico: "home", label: "大厅" },
  { id: "timer", ico: "timer", label: "倒计时" },
  { id: "scan", ico: "scan", label: "扫一扫" },
  { id: "locate", ico: "map", label: "定位" },
  { id: "me", ico: "user", label: "我的" },
  { id: "admin", ico: "settings", label: "管理", admin: true },
];

function renderTopbar() {
  if (!S.user) return;
  const st = S.state?.clock;
  $("#topbar-right").innerHTML = S.user.is_admin
    ? `<b>管理员</b> · ${esc(S.user.display_name)}`
    : `${esc(S.user.display_name)}<br><span class="tiny">${st ? esc(st.phase_cn) : "未加入比赛"}</span>`;
}

function render() {
  if (!S.user) { renderAuth(); return; }
  clearInterval(clockTimer); clearInterval(cdTimer); clearInterval(mapTimer); clearInterval(radarTimer);
  if (S.tab !== "scan" && S.scanner) { S.scanner.stop(); S.scanner = null; S.scanning = false; }
  if (S.tab !== "locate") MAP.destroy();

  tabsEl.innerHTML = TABS.filter((t) => !t.admin || S.user.is_admin).map((t) => `
    <button class="tab ${S.tab === t.id ? "on" : ""}" data-act="tab" data-tab="${t.id}">
      <span class="tab-ico">${icon(t.ico)}</span><span>${t.label}</span>
    </button>`).join("");
  tabsEl.classList.remove("hidden");
  renderTopbar(); renderTip();

  let html = "";
  switch (S.tab) {
    case "timer": html = renderTimer(); break;
    case "scan": html = renderScan(); break;
    case "locate": html = renderLocate(); break;
    case "me": html = renderMe(); break;
    case "admin": html = renderAdmin(); break;
    default: html = renderHome();
  }
  view.innerHTML = html;
  mountTab();
}

function mountTab() {
  if (S.tab === "home" && S.state?.has_game) startClock();
  if (S.tab === "timer") { loadCountdown(); cdTimer = setInterval(() => { if (S.tab === "timer") paintCountdown(); }, 1000); }
  if (S.tab === "locate" && S.mapMode === "radar") {
    loadRadar(); radarTimer = setInterval(() => { if (S.tab === "locate") drawRadar($("#radar-canvas"), S.radar, S.user?.id); }, 350);
  }
  if (S.tab === "locate" && S.mapMode === "map") {
    loadMap(true);
    mapTimer = setInterval(() => { if (S.tab === "locate" && S.mapMode === "map") loadMap(false); }, 6000);
  }
}

function startClock() {
  const paint = () => {
    const el = $("#hero-clock"), bar = $("#hero-bar");
    if (!el || !S.state?.clock) return;
    const c = S.state.clock;
    const left = Math.max(0, c.remaining - (Date.now() / 1000 - S.stateAt));
    el.textContent = c.phase === "finished" ? "已结束" : fmtTime(left);
    if (bar && c.duration) bar.style.width = Math.min(100, ((c.duration - left) / c.duration) * 100) + "%";
  };
  paint(); clockTimer = setInterval(paint, 1000);
}

/* ---------------------------------------------------------------- 大厅 */
function renderHome() {
  const st = S.state;
  if (!st?.has_game) {
    return `
      <div class="card">
        <div class="card-title"><span>加入比赛</span>${icon("sparkle", "sm")}</div>
        <p class="small muted">向管理员索取 6 位比赛码，输入后进入名单，等待现场抽签。</p>
        <label class="field"><span>比赛码</span><input id="join-code" placeholder="例如 3A9F2C" class="mono" autocomplete="off"></label>
        <button class="btn block" data-act="join">${icon("arrow", "sm")} 加入比赛</button>
      </div>
      ${S.user.is_admin ? `<div class="card tight"><div class="card-title">管理员入口</div>
        <p class="small muted">先创建本场比赛，再把比赛码发给大家。</p>
        <button class="btn ghost block" data-act="tab" data-tab="admin">前往管理后台</button></div>` : ""}
      <div class="notice sage">📅 11月21日（周六）下午1点（待定） · 📍 滨海公园<br>素材赛后上传工作室公告网盘。</div>`;
  }
  const g = st.game, c = st.clock, me = st.me;
  const winnerText = c.phase === "finished" ? (g.winner === "hiders" ? "🎉 躲藏者获胜" : "🎯 抓捕者获胜") : "";
  const phaseText = c.phase === "finished" ? "比赛结束" : `${c.phase_cn} · 剩余 ${fmtTime(c.remaining)}`;
  const top3 = st.leaderboard.slice(0, 3);
  return `
    <div class="card hero-card">
      <div class="hero-bg"></div>
      <div class="hero-inner">
        <div class="eyebrow">STARVEN · EP.01</div>
        <h2>${esc(g.name)}</h2>
        <div class="clock" id="hero-clock">${fmtTime(c.remaining)}</div>
        <div class="clock-caption">${esc(phaseText)}${winnerText ? " · " + winnerText : ""}</div>
        <div class="progress"><i id="hero-bar" style="width:0%"></i></div>
        <div class="stat-grid">
          <div class="stat"><b>${me.score}</b><span>我的积分</span></div>
          <div class="stat"><b>${st.counts.alive_hiders}</b><span>存活躲藏者</span></div>
          <div class="stat"><b>${st.counts.total}</b><span>参赛人数</span></div>
        </div>
      </div>
    </div>

    <div class="card tight">
      <div class="row" style="border:0;padding:2px 0 10px">
        <span class="badge ${me.role === "catcher" ? "dark" : me.role === "hider" ? "" : "blue"}">${esc(me.role_cn)}</span>
        <span class="badge ${me.alive ? "green" : "gray"}">${me.alive ? "存活" : "已被抓"}</span>
        <span class="grow small muted">比赛码 <b class="mono">${esc(g.join_code)}</b></span>
        <button class="btn xs soft" data-act="copy-code" data-code="${attr(g.join_code)}">复制</button>
      </div>
      <div class="btn-row three">
        <button class="btn sm ghost" data-act="tab" data-tab="timer">${icon("timer", "sm")} 倒计时</button>
        <button class="btn sm ghost" data-act="tab" data-tab="locate">${icon("map", "sm")} 定位</button>
        <button class="btn sm ghost" data-act="my-qr">${icon("scan", "sm")} 身份码</button>
      </div>
    </div>

    <div class="section-label">积分榜 · 前三</div>
    <div class="card tight">
      ${top3.map((p) => `<div class="row">
        <span class="rank top${p.rank}">${p.rank}</span>
        <span class="grow"><div class="name">${esc(p.display_name)}</div><div class="meta">${esc(p.role_cn)}</div></span>
        <span class="score">${p.score}</span></div>`).join("")}
      <button class="btn sm ghost block" style="margin-top:10px" data-act="full-board">${icon("trophy", "sm")} 查看完整榜单与流水</button>
    </div>

    <div class="section-label">最近动态</div>
    <div class="card tight">
      ${st.recent_events.length ? st.recent_events.slice(0, 5).map((e) => `
        <div class="row"><span class="grow"><span class="name">${esc(e.display_name)}</span>
          <div class="meta">${esc(e.kind === "hider_decoy" ? "发送随机错误定位" :
            e.kind === "catcher_radar" ? "30 米探测" : e.kind === "catch" ? "完成抓获" : e.kind)}</div></span>
          <span class="tiny muted">${fmtAt(e.created_at)}</span></div>`).join("")
        : `<div class="empty">${icon("sparkle")}比赛开始后这里会实时更新</div>`}
    </div>
    <div class="notice sage">${icon("info", "sm")} 全程开启 GPS/BDS 定位用于展示，不影响玩法判定。扫球发出的随机错误定位只会出现在抓捕者的雷达与地图上。</div>`;
}

async function showFullBoard() {
  const id = gid(); if (!id) return;
  try {
    const [board, events] = await Promise.all([API.board(id), API.scoreEvents(id)]);
    showModal(`
      <div class="modal-head"><b>实时积分榜</b><button class="modal-close" data-act="modal-close">${icon("close", "sm")}</button></div>
      ${board.items.map((p) => `<div class="row">
        <span class="rank ${p.rank <= 3 ? "top" + p.rank : ""}">${p.rank}</span>
        <span class="grow"><div class="name">${esc(p.display_name)} ${p.user_id === S.user.id ? '<span class="tiny muted">（我）</span>' : ""}</div>
        <div class="meta">${esc(p.role_cn)} · ${p.alive ? "存活" : "已被抓"}</div></span>
        <span class="score">${p.score}</span></div>`).join("")}
      <div class="section-label">积分流水</div>
      ${events.items.slice(0, 40).map((e) => `<div class="row"><span class="grow">
        <span class="name">${esc(e.display_name)}</span><div class="meta">${esc(e.reason)} · ${fmtAt(e.created_at)}</div></span>
        <b style="color:var(--green)">+${e.delta}</b></div>`).join("") || `<div class="empty">暂无记录</div>`}`);
  } catch (e) { toast(e.message); }
}

/* ---------------------------------------------------------------- 倒计时 */
function cdSignature(cd) {
  return `${cd.mode}|${cd.items.map((x) => `${x.id}:${x.status}`).join(",")}`;
}

async function loadCountdown() {
  const id = gid(); if (!id) { S.cd = null; return; }
  try {
    S.cd = await API.countdown(id);
    S.cdAt = Date.now() / 1000;
    S.cdModeDraft = S.cd.mode;
    // 仅在结构（模式 / 段数 / 状态）变化时重绘；数字由 paintCountdown 局部刷新。
    // 签名守卫也避免 render() → mountTab() → loadCountdown() 递归。
    const sig = cdSignature(S.cd);
    if (S.tab === "timer" && !S.cdEditing && sig !== S.cdSig) {
      S.cdSig = sig; render();
    } else {
      S.cdSig = sig;
    }
    paintCountdown();
  } catch (e) { if (S.tab === "timer") toast(e.message); }
}

function cdRemaining(item) {
  if (item.status === "running" && item.ends_at) {
    return Math.max(0, item.ends_at - S.cd.server_now - (Date.now() / 1000 - S.cdAt));
  }
  if (item.status === "paused") return item.remaining ?? item.duration;
  if (item.status === "done") return 0;
  return item.duration;
}

function paintCountdown() {
  if (!S.cd || S.tab !== "timer") return;
  view.querySelectorAll("[data-cd-id]").forEach((el) => {
    const id = Number(el.dataset.cdId);
    const it = S.cd.items.find((x) => x.id === id);
    if (!it) return;
    const rem = cdRemaining(it);
    const t = el.querySelector("[data-cd-time]");
    if (t) t.textContent = fmtTime(rem);
    const bar = el.querySelector("[data-cd-bar]");
    if (bar) bar.style.width = Math.max(0, Math.min(100, rem / it.duration * 100)) + "%";
    const ring = el.querySelector("[data-cd-ring]");
    if (ring) ring.style.strokeDashoffset = String(326.7 * (1 - Math.max(0, Math.min(1, rem / it.duration))));
  });
}

function renderTimer() {
  const cd = S.cd;
  const admin = S.user.is_admin;
  if (!cd) return `<div class="card"><div class="empty">${icon("timer")}载入倒计时…</div></div>`;
  const parallel = cd.mode === "parallel";
  const active = cd.items.find((x) => x.id === cd.active_id);
  return `
    <div class="card tight">
      <div class="card-title"><span>自定义倒计时</span>
        <span class="sub">${cd.segment_count} 段 · ${parallel ? "同时显示" : "单独显示"}</span></div>
      <div class="segmented">
        <button class="${parallel ? "" : "on"}" data-act="cd-mode" data-mode="sequential" ${admin ? "" : "disabled"}>${icon("timer", "sm")} 单独显示</button>
        <button class="${parallel ? "on" : ""}" data-act="cd-mode" data-mode="parallel" ${admin ? "" : "disabled"}>${icon("layers", "sm")} 同时显示</button>
      </div>
      <div class="small muted">${parallel
        ? "多段各自独立计时，同屏并列展示；每段归零自动结束。"
        : "只放大当前段，一段结束后<b>自动启动下一段</b>，其余排队等待。"}</div>
    </div>

    ${parallel ? `
      <div class="section-label">并行倒计时</div>
      <div class="cd-grid">
        ${cd.items.map((it) => `<div class="cd-tile ${it.status === "running" ? "running" : ""} ${it.status === "done" ? "done" : ""}" data-cd-id="${it.id}">
          <div class="t-label">${esc(it.label)} · ${it.status === "done" ? "已结束" : it.status === "paused" ? "已暂停" : it.status === "running" ? "进行中" : "待开始"}</div>
          <div class="t-time" data-cd-time>${fmtTime(cdRemaining(it))}</div>
          <div class="t-bar"><i data-cd-bar style="width:100%"></i></div>
          <div class="tiny muted" style="margin-top:7px">${fmtMin(it.duration)} 分钟 · 第 ${it.seq} 段</div>
        </div>`).join("")}
      </div>` : `
      <div class="cd-hero" data-cd-id="${active?.id || cd.items[0]?.id || 0}">
        <div class="cd-label">${active ? esc(active.label) : (cd.all_done ? "全部倒计时结束" : "等待开始")}</div>
        <div class="cd-ring">
          <svg viewBox="0 0 120 120">
            <circle class="track" cx="60" cy="60" r="52"></circle>
            <circle class="bar" cx="60" cy="60" r="52"
              stroke-dasharray="326.7" stroke-dashoffset="0" data-cd-ring></circle>
          </svg>
          <div class="inner"><b data-cd-time>${fmtTime(cdRemaining(active || cd.items[0]))}</b><span>剩余时间</span></div>
        </div>
        <div class="cd-sub">${active ? `第 ${active.seq} / ${cd.segment_count} 段 · ${fmtMin(active.duration)} 分钟` : "点击开始启动倒计时"}</div>
      </div>
      <div class="section-label">排队段</div>
      <div class="cd-queue">
        ${cd.items.map((it) => `<div class="qitem ${it.status === "running" ? "on" : ""} ${it.status === "done" ? "done" : ""}" data-cd-id="${it.id}">
          <span class="qnum">${it.seq}</span>
          <span class="grow"><div class="name">${esc(it.label)}</div>
            <div class="meta">${it.status === "done" ? "已完成" : it.status === "running" ? "进行中" : it.status === "paused" ? "已暂停" : "待开始"} · ${fmtMin(it.duration)} 分钟</div></span>
          <span class="qtime" data-cd-time>${fmtTime(cdRemaining(it))}</span>
        </div>`).join("")}
      </div>`}

    ${admin ? `
      <div class="section-label">控制</div>
      <div class="card">
        <div class="btn-row three">
          <button class="btn sm" data-act="cd-action" data-action="start">${icon("play", "sm")} 开始</button>
          <button class="btn sm soft" data-act="cd-action" data-action="pause">${icon("pause", "sm")} 暂停</button>
          <button class="btn sm soft" data-act="cd-action" data-action="resume">${icon("play", "sm")} 继续</button>
          <button class="btn sm ghost" data-act="cd-action" data-action="next">${icon("next", "sm")} 下一段</button>
          <button class="btn sm ghost" data-act="cd-action" data-action="reset">${icon("reset", "sm")} 重置</button>
          <button class="btn sm ghost" data-act="cd-edit">${icon("pencil", "sm")} 编辑段</button>
        </div>
      </div>` : `<div class="notice sage">${icon("info", "sm")} 倒计时由管理员统一控制，所有人的屏幕会实时同步，无需手动刷新。</div>`}

    <div class="notice">${icon("info", "sm")} 段数不限 3 段，可自由添加 / 删除 / 改名 / 改时长。计时以服务器时钟为准，弱网或锁屏后重新打开会自动校准。</div>`;
}

async function showCdEditor() {
  const id = gid(); if (!id) return;
  try {
    const cd = await API.countdown(id);
    S.cd = cd; S.cdAt = Date.now() / 1000;
    showModal(`
      <div class="modal-head"><b>编辑倒计时段</b><button class="modal-close" data-act="modal-close">${icon("close", "sm")}</button></div>
      <div class="small muted" style="margin-bottom:12px">时长单位为分钟。默认给了 3 段模板，可任意增删；保存后所有客户端立即同步。</div>
      <form data-form="cd-save">
        <div id="cd-edit-list">
          ${cd.items.map((it, i) => cdEditRow(i + 1, it.label, fmtMin(it.duration))).join("")}
        </div>
        <button type="button" class="btn sm ghost block" style="margin:6px 0 12px" data-act="cd-add-row">${icon("plus", "sm")} 添加一段</button>
        <button class="btn block" type="submit">${icon("check", "sm")} 保存并同步</button>
      </form>
      <div class="divider"></div>
      <div class="card-title">快速加一段</div>
      <form data-form="cd-add" style="display:flex;gap:8px">
        <input name="label" placeholder="段名，如 加时赛" style="flex:1">
        <input name="minutes" type="number" step="0.5" value="5" placeholder="分钟" style="width:88px">
        <button class="btn sm" type="submit">添加</button>
      </form>`);
  } catch (e) { toast(e.message); }
}

function cdEditRow(n, label, minutes) {
  return `<div class="cd-edit-row" data-cd-row>
    <span class="qnum">${n}</span>
    <input class="f-label" name="label" value="${attr(label)}" maxlength="20" required>
    <input class="f-min" name="minutes" type="number" step="0.5" min="0.1" max="360" value="${attr(minutes)}" required>
    <button type="button" class="btn xs soft" data-act="cd-del-row">${icon("trash", "sm")}</button>
  </div>`;
}

/* ---------------------------------------------------------------- 扫一扫 */
function renderScan() {
  const r = S.scanResult;
  return `
    <div class="card tight">
      <div class="card-title"><span>扫一扫 · 道具球 / 身份码</span><span class="sub">+0.5 / +10</span></div>
      <div class="scan-frame">
        <video id="scan-video" playsinline muted></video>
        <div class="corner c1"></div><div class="corner c2"></div>
        <div class="corner c3"></div><div class="corner c4"></div>
        <div class="laser"></div>
        <div class="hint" id="scan-hint">对准小球上的二维码，或下方手动输入</div>
      </div>
      <div class="btn-row" style="margin-top:11px">
        <button class="btn" data-act="scan-start" id="scan-toggle">${icon("camera", "sm")} 开启摄像头</button>
        <button class="btn ghost" data-act="my-qr">${icon("scan", "sm")} 我的身份码</button>
      </div>
    </div>
    <div class="card">
      <div class="card-title">手动输入 <span class="sub">摄像头不可用时照常玩</span></div>
      <form data-form="manual-scan">
        <label class="field"><span>球码 / 玩家码</span><input name="code" placeholder="B-XXXXXX-YYYY 或 P-1-XXXXXX" class="mono" required autocomplete="off"></label>
        <button class="btn block" type="submit">${icon("check", "sm")} 提交扫码</button>
      </form>
      <div class="small muted" style="margin-top:9px">球码印在道具球上；抓捕者扫到躲藏者的身份码即完成抓获判定（+10 分）。</div>
    </div>
    ${r ? `<div class="card result-card">
      <div class="card-title">上一次结果 <span class="sub">${fmtAt(r.at)}</span></div>
      <div class="big">${esc(r.title)}</div>
      <div class="small muted">${esc(r.detail)}</div>
      ${r.delta ? `<div class="delta" style="margin-top:8px">本次 +${r.delta} 分 · 累计 ${r.score} 分</div>` : ""}
      ${r.sectors?.length ? `<div class="pill-list" style="margin-top:8px">${r.sectors.map((x) =>
        `<span class="pill">${esc(x.sector)} 约 ${x.dist_m} 米</span>`).join("")}</div>` : ""}
    </div>` : ""}
    <div class="notice">${icon("shield", "sm")} 扫一扫与定位需要 <b>HTTPS 安全上下文</b>。若摄像头不可用，手动输入球码，玩法与计分完全一致。</div>`;
}

async function submitScan(code) {
  const id = gid(); if (!id) { toast("请先加入比赛"); return; }
  try {
    const r = await API.scan(id, code);
    S.scanResult = { ...r, at: Date.now() / 1000 };
    toast(r.title);
    if (S.tab === "scan" && S.scanning) renderResultOnly(); else render();
    await refresh(true);
  } catch (e) {
    toast(e.message);
    S.scanResult = { title: "扫码未成功", detail: e.message, at: Date.now() / 1000 };
    if (S.tab === "scan") renderResultOnly();
  }
}
function renderResultOnly() {
  const old = view.querySelector(".result-card"); if (old) old.remove();
  const r = S.scanResult; if (!r) return;
  const div = document.createElement("div"); div.className = "card result-card";
  div.innerHTML = `<div class="card-title">上一次结果 <span class="sub">${fmtAt(r.at)}</span></div>
    <div class="big">${esc(r.title)}</div><div class="small muted">${esc(r.detail)}</div>
    ${r.delta ? `<div class="delta" style="margin-top:8px">本次 +${r.delta} 分 · 累计 ${r.score} 分</div>` : ""}`;
  view.insertBefore(div, view.querySelector(".notice"));
}
function toggleScanner() {
  if (S.scanning) {
    S.scanner?.stop(); S.scanner = null; S.scanning = false;
    const b = $("#scan-toggle"); if (b) b.innerHTML = `${icon("camera", "sm")} 开启摄像头`;
    const h = $("#scan-hint"); if (h) h.textContent = "摄像头已关闭"; return;
  }
  const video = $("#scan-video"); if (!video) return;
  const scanner = createScanner({
    video, onCode: (code) => submitScan(code),
    onStatus: (msg) => { const h = $("#scan-hint"); if (h) h.textContent = msg; },
  });
  scanner.start().then((mode) => {
    S.scanner = scanner; S.scanning = mode !== "manual";
    const b = $("#scan-toggle");
    if (b) b.innerHTML = mode === "manual" ? `${icon("camera", "sm")} 重新尝试` : `${icon("close", "sm")} 关闭摄像头`;
  });
}

/* ---------------------------------------------------------------- 定位（地图 / 雷达） */
function renderLocate() {
  const isMap = S.mapMode === "map";
  return `
    <div class="card tight">
      <div class="card-title"><span>定位视图</span><span class="sub">GPS / BDS · 全程轨迹</span></div>
      <div class="segmented">
        <button class="${isMap ? "on" : ""}" data-act="map-mode" data-mode="map">${icon("map", "sm")} 地图</button>
        <button class="${isMap ? "" : "on"}" data-act="map-mode" data-mode="radar">${icon("radar", "sm")} 雷达</button>
      </div>
      <div class="small muted">${isMap ? "真实地图底图 + 全员轨迹回放" : "场地相对坐标圆盘，不依赖任何地图服务"}</div>
    </div>

    ${revealBannerHtml()}

    ${isMap ? `
      <div class="card tight">
        <div class="map-wrap" id="map-wrap">
          <div id="leaflet-map"></div>
          <div class="map-overlay">
            <span class="chiplet" id="map-chip">${esc(tilesName(S.tilesKey))}</span>
            <span class="chiplet" id="map-stat">轨迹载入中…</span>
          </div>
        </div>
        <div class="btn-row three" style="margin-top:11px">
          <button class="btn sm ghost" data-act="map-focus">${icon("pin", "sm")} 回到我</button>
          <button class="btn sm ghost" data-act="map-refresh">${icon("reset", "sm")} 刷新</button>
          <button class="btn sm ghost" data-act="open-tiles">${icon("layers", "sm")} 地图源</button>
        </div>
        <div class="legend">
          <span><i style="background:#7C9CB8"></i>我</span>
          <span><i style="background:#8FA38C"></i>真实定位</span>
          <span><i style="background:#E3B774"></i>可疑信号</span>
          <span><i style="background:#C97B5A"></i>轨迹</span>
        </div>
        <div class="tiny muted" style="margin-top:8px">${icon("info", "sm")} 点按地图上的圆点可查看是谁；公开后所有人位置同时显示。</div>
      </div>` : `
      <div class="card">
        <div class="card-title"><span>定位雷达</span><span class="sub">相对坐标</span></div>
        <div class="radar-wrap"><canvas id="radar-canvas"></canvas></div>
        <div class="legend">
          <span><i style="background:#7C9CB8"></i>我</span>
          <span><i style="background:#8FA38C"></i>真实定位</span>
          <span><i style="background:#E3B774"></i>可疑信号</span>
        </div>
        <div class="btn-row" style="margin-top:12px"><button class="btn sm ghost" data-act="radar-refresh">${icon("reset", "sm")} 刷新</button></div>
      </div>`}

    <div id="reveal-roster"></div>

    ${geoCardHtml()}

    <div class="notice sage">${icon("info", "sm")} 轨迹从比赛开始持续记录并批量上报，弱网重发不会重复。管理员可在「管理 → 导出轨迹」拿到 GeoJSON / CSV，用于剪辑与复盘。</div>`;
}

/** 公开全员定位后的名单：每个人一个彩色标记，点全部同时显示在地图上 */
function paintRoster() {
  const el = $("#reveal-roster");
  if (!el || S.tab !== "locate") return;
  if (!S.revealAll || !S.mapData?.tracks?.length) { el.innerHTML = ""; return; }
  const groups = new Map();
  for (const p of S.mapData.tracks) {
    if (!groups.has(p.user_id)) groups.set(p.user_id, { name: p.display_name || "成员", n: 0 });
    groups.get(p.user_id).n++;
  }
  el.innerHTML = `<div class="section-label">已公开 · ${groups.size} 人同时显示</div>
    <div class="card tight"><div class="pill-list">
      ${[...groups].map(([uid, v]) => `<span class="pill" style="background:#F7F3EF;color:var(--ink-soft)">
        <i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${MAP.colorFor(uid)};margin-right:6px"></i>
        ${esc(v.name)} · ${v.n} 点</span>`).join("")}
    </div><div class="tiny muted" style="margin-top:9px">点按地图上的圆点可查看姓名；轨迹按人着色。</div></div>`;
}

function tilesName(key) {
  return ({ osm: "OpenStreetMap", gaode: "高德地图", tianditu: "天地图",
    none: "纯轨迹画布" })[key] || key;
}

function revealBannerHtml() {
  const on = S.revealAll, admin = S.user?.is_admin;
  return `<div class="reveal-banner ${on ? "on" : "off"}" id="reveal-banner">
    <span class="rb-ico">${icon(on ? "eye" : "eye-off")}</span>
    <span class="grow"><b>${on ? "全员定位已公开" : "全员定位未公开"}</b>
      <span>${on ? "所有人可同时看到彼此的真实位置与轨迹" : "默认仅管理员 / 协助者可见全场"}</span></span>
    ${admin ? `<button class="btn sm ${on ? "soft" : ""}" data-act="toggle-reveal">${on ? "关闭" : "公开"}</button>`
            : `<span class="badge ${on ? "" : "gray"}">${on ? "已公开" : "未公开"}</span>`}
  </div>`;
}

function paintRevealBanner() {
  const el = $("#reveal-banner"); if (!el) return;
  const wrap = document.createElement("div");
  wrap.innerHTML = revealBannerHtml();
  const fresh = wrap.firstElementChild;
  el.replaceWith(fresh);
  paintRoster();
}

function geoCardHtml() {
  const d = S.geoDiag, f = S.geoFix;
  const cell = (label, val, good) => `<div class="geo-cell ${good === true ? "good" : good === false ? "bad" : ""}">
    <span>${label}</span><b>${val}</b></div>`;
  return `<div class="section-label">定位自检 · 现场先点「立即测试」</div>
    <div class="card" id="geo-card">
      <div class="card-title"><span>能不能用，一眼看清</span>
        <span class="sub">${icon("wifi", "sm")} ${S.wsConnected ? "实时已连接" : "重连中"}</span></div>
      <div class="geo-grid">
        ${cell("HTTPS 安全上下文", GEO.isSecure ? "✓ 正常" : "✗ 不可用", GEO.isSecure)}
        ${cell("浏览器定位支持", GEO.geoSupported ? "✓ 支持" : "✗ 不支持", GEO.geoSupported)}
        ${cell("位置权限", d ? ({ granted: "✓ 已允许", prompt: "待询问", denied: "✗ 被拒绝" }[d.permission] || d.permission) : "检测中…", d?.permission === "granted" ? true : d?.permission === "denied" ? false : null)}
        ${cell("持续监听", d?.watching ? "✓ 运行中" : "— 未启动", d?.watching)}
        ${cell("当前坐标", f ? `${fmtCoord(f.lat)}, ${fmtCoord(f.lng)}` : "尚未获取", !!f)}
        ${cell("定位精度", f ? fmtAccuracy(f.accuracy) : "—", f ? (f.accuracy < 30) : null)}
        ${cell("已记录轨迹点", String(S.trackCount || 0), S.trackCount > 0)}
        ${cell("轨迹缓存 / 序列", d ? `${d.queued} / #${d.seq}` : "—", null)}
      </div>
      ${S.geoError ? `<div class="notice" style="margin-top:11px">${esc(S.geoError)}</div>` : ""}
      ${S.geoTest ? `<div class="notice sage" style="margin-top:9px">${esc(S.geoTest)}</div>` : ""}
      <div class="btn-row" style="margin-top:12px">
        <button class="btn sm" data-act="geo-test">${icon("pin", "sm")} 立即测试定位</button>
        <button class="btn sm ghost" data-act="geo-diag">${icon("info", "sm")} 复制诊断</button>
      </div>
      <div class="tiny muted" style="margin-top:9px">${S.geoFix ? `最后定位：${fmtAt(S.geoFix.at)}` : "尚未拿到定位"} · 瓦片：${esc(tilesName(S.tilesKey))}</div>
    </div>`;
}

function paintGeoCard() {
  const el = $("#geo-card"); if (!el || S.tab !== "locate") return;
  const wrap = document.createElement("div"); wrap.innerHTML = geoCardHtml();
  const fresh = wrap.querySelector("#geo-card");
  if (fresh) el.replaceWith(fresh);
}

async function loadMap(first = false) {
  const id = gid(); if (!id) { toast("还没有比赛"); return; }
  try {
    const data = await API.map(id);
    S.mapData = data;
    S.revealAll = !!data.reveal_all;
    const key = data.tiles?.key || "osm";
    // 用户本机选过瓦片源就尊重本机选择；否则首次跟随管理员设置的默认值
    if (first && !localStorage.getItem("starven_tiles")) S.tilesKey = key;
    if (!MAP.isReady() || first) {
      MAP.initMap("leaflet-map", data.center, tilesFor(data, S.tilesKey));
    }
    const stats = MAP.update(data, S.user.id, { showNames: true, fit: first });
    S.mapStats = stats;
    const chip = $("#map-chip"), stat = $("#map-stat");
    if (chip) chip.textContent = tilesName(S.tilesKey);
    if (stat) stat.textContent = `${stats?.people || 0} 人 · ${stats?.trackPoints || 0} 轨迹点`;
    paintRevealBanner();
  } catch (e) { if (first) toast(e.message); }
}

function tilesFor(data, key) {
  const preset = data.tile_presets?.[key] || data.tiles;
  if (key === "tianditu" && S.tilesTk) {
    return { ...preset, url: preset.url.replace("{tk}", encodeURIComponent(S.tilesTk)) };
  }
  return preset;
}

async function loadRadar() {
  const id = gid(); if (!id) return;
  try {
    S.radar = await API.radar(id);
    S.revealAll = !!S.radar.reveal_all;
    if (S.revealAll) { try { S.mapData = await API.map(id); } catch (e) { /* 名单降级 */ } }
    requestAnimationFrame(() => drawRadar($("#radar-canvas"), S.radar, S.user.id));
    paintRevealBanner();
  } catch (e) { toast(e.message); }
}

async function geoTest() {
  S.geoTest = "正在请求一次定位…"; paintGeoCard();
  try {
    const f = await GEO.once();
    S.geoFix = f;
    const d = await GEO.diagnose(); S.geoDiag = d;
    S.geoTest = `✓ 定位成功：${fmtCoord(f.lat)}, ${fmtCoord(f.lng)}，精度 ${fmtAccuracy(f.accuracy)}。已自动写入轨迹。`;
    // 立刻把这一点补进轨迹队列，保证「测试」也能被记录
    const id = gid();
    if (id) await API.track(id, [{ lat: f.lat, lng: f.lng, accuracy: f.accuracy,
      seq: Date.now(), recorded_at: f.at, phase: S.state?.clock?.phase || null }]);
    S.trackCount = (S.trackCount || 0) + 1;
  } catch (e) { S.geoTest = "✗ " + e.message; }
  try { S.geoDiag = await GEO.diagnose(); } catch (e) { /* ignore */ }
  paintGeoCard(); renderTip();
}

async function showTiles() {
  const data = S.mapData;
  const presets = data?.tile_presets || {
    osm: { name: "OpenStreetMap（WGS-84）", crs: "WGS84" },
    gaode: { name: "高德矢量瓦片（GCJ-02，国内推荐）", crs: "GCJ02" },
    tianditu: { name: "天地图（需 tk）", crs: "WGS84" },
    none: { name: "纯轨迹画布（完全离线）", crs: "WGS84" },
  };
  showModal(`
    <div class="modal-head"><b>地图源</b><button class="modal-close" data-act="modal-close">${icon("close", "sm")}</button></div>
    <div class="small muted" style="margin-bottom:12px">库已本地内置，不依赖 CDN。高德/腾讯瓦片是 GCJ-02，APP 会自动纠偏；OSM 与天地图用 WGS-84。</div>
    ${Object.entries(presets).map(([k, v]) => `
      <div class="row" data-act="pick-tiles" data-key="${k}" style="cursor:pointer">
        <span class="grow"><div class="name">${esc(v.name)}</div><div class="meta">坐标系 ${esc(v.crs || "WGS84")}</div></span>
        ${S.tilesKey === k ? `<span class="badge green">${icon("check", "sm")} 当前</span>` : ""}
      </div>`).join("")}
    <div class="divider"></div>
    <label class="field"><span>天地图 tk（仅存本机，不上传服务器）</span>
      <input id="tdt-tk" value="${attr(S.tilesTk)}" placeholder="申请后填入"></label>
    <button class="btn ghost block" data-act="save-tk">${icon("check", "sm")} 保存 tk</button>
    <div class="notice" style="margin-top:12px">${icon("info", "sm")} 若瓦片加载失败（现场网络限制），选「纯轨迹画布」仍能看到全员轨迹与场地圈，定位功能不受影响。</div>`);
}

/* ---------------------------------------------------------------- 我的 */
function renderMe() {
  return `
    <div class="card">
      <div class="card-title"><span>${esc(S.user.display_name)}</span>
        <span class="badge ${S.user.is_admin ? "dark" : ""}">${S.user.is_admin ? "管理员" : "工作室成员"}</span></div>
      <div class="row"><span class="grow small muted">登录账号</span><b class="mono">${esc(S.user.username)}</b></div>
      <div class="row"><span class="grow small muted">当前比赛</span><b>${S.state?.has_game ? esc(S.state.game.name) : "未加入"}</b></div>
      <div class="row"><span class="grow small muted">地图源</span><b>${esc(tilesName(S.tilesKey))}</b></div>
      <div class="row"><span class="grow small muted">定位状态</span><b>${S.geoError ? "异常" : GEO.isSecure ? "实时上报中" : "HTTP 受限"}</b></div>
      <div class="btn-row" style="margin-top:12px">
        <button class="btn sm ghost" data-act="my-qr">${icon("scan", "sm")} 我的身份码</button>
        <button class="btn sm ghost" data-act="open-tiles">${icon("layers", "sm")} 地图源</button>
        ${S.installEvt ? `<button class="btn sm ghost" data-act="install">${icon("download", "sm")} 装到桌面</button>` : ""}
      </div>
    </div>
    <div class="card">
      <div class="card-title">修改密码</div>
      <form data-form="password">
        <label class="field"><span>原密码</span><input name="old_password" type="password" required></label>
        <label class="field"><span>新密码（至少 8 位）</span><input name="new_password" type="password" required minlength="8"></label>
        <button class="btn block" type="submit">${icon("key", "sm")} 保存</button>
      </form>
    </div>
    <div class="card tight">
      <div class="card-title">关于</div>
      <div class="small muted">星湾工作室 · Starven Studio<br>第一期趣味躲猫猫比赛 · 2026.11.21 滨海公园<br>
        ≥14 人开局，抓捕者1 : 躲藏者10 : 协助者3；躲藏 30 分钟 + 抓捕 30 分钟。</div>
    </div>
    <button class="btn ghost block" data-act="logout">${icon("logout", "sm")} 退出登录</button>`;
}

async function showMyQr() {
  const id = gid(); if (!id) { toast("请先加入比赛"); return; }
  try {
    const r = await API.myQr(id);
    showModal(`
      <div class="modal-head"><b>我的身份码</b><button class="modal-close" data-act="modal-close">${icon("close", "sm")}</button></div>
      <div class="qr-box">${r.svg}<div class="mono small" style="margin-top:9px">${esc(r.code)}</div></div>
      <div class="notice sage" style="margin-top:12px">${esc(r.hint)}。</div>
      <button class="btn ghost block" style="margin-top:10px" data-act="copy-code" data-code="${attr(r.code)}">${icon("copy", "sm")} 复制身份码</button>`);
  } catch (e) { toast(e.message); }
}

/* ---------------------------------------------------------------- 管理后台 */
function renderAdmin() {
  const st = S.state, g = st?.has_game ? st.game : null;
  const a = S.adminData, status = g?.status || "none";
  return `
    ${!g ? `<div class="card">
      <div class="card-title">创建第一期比赛</div>
      <form data-form="create-game">
        <label class="field"><span>比赛名称</span><input name="name" value="第一期趣味躲猫猫比赛" required></label>
        <div class="btn-row">
          <label class="field" style="flex:1"><span>场地中心 纬度</span><input name="center_lat" id="center-lat" type="number" step="any" required placeholder="33.xxxx"></label>
          <label class="field" style="flex:1"><span>场地中心 经度</span><input name="center_lng" id="center-lng" type="number" step="any" required placeholder="120.xxxx"></label>
        </div>
        <button class="btn ghost block" type="button" data-act="use-location" style="margin-bottom:12px">${icon("pin", "sm")} 用我当前位置作为场地中心</button>
        <div class="btn-row three">
          <label class="field" style="flex:1"><span>半径(米)</span><input name="radius_m" type="number" value="150" step="any"></label>
          <label class="field" style="flex:1"><span>躲藏(分)</span><input name="hide_minutes" type="number" value="30" step="any"></label>
          <label class="field" style="flex:1"><span>抓捕(分)</span><input name="chase_minutes" type="number" value="30" step="any"></label>
        </div>
        <button class="btn block" type="submit">${icon("plus", "sm")} 创建比赛</button>
      </form>
    </div>` : `
    <div class="card tight">
      <div class="card-title"><span>${esc(g.name)}</span><span class="sub">${esc(st?.clock?.phase_cn || "待开始")}</span></div>
      <div style="font-size:27px;font-weight:780;letter-spacing:2px" class="mono">${esc(g.join_code)}</div>
      <div class="tiny muted">比赛码 · 发给全体成员自助加入</div>
      <div class="btn-row" style="margin-top:12px">
        <button class="btn sm ghost" data-act="copy-code" data-code="${attr(g.join_code)}">${icon("copy", "sm")} 复制比赛码</button>
        <button class="btn sm ghost" data-act="refresh">${icon("reset", "sm")} 刷新</button>
      </div>
    </div>

    <div class="section-label">现场流程</div>
    <div class="card">
      <div class="chip-grid">
        <div class="chip ${status === "draft" ? "on" : ""}" data-act="admin-draw">${icon("sparkle", "sm")} 现场抽签</div>
        <div class="chip ${status === "draft" ? "on" : ""}" data-act="admin-start">${icon("play", "sm")} 开始比赛</div>
        <div class="chip ${status === "hiding" ? "on" : ""}" data-act="admin-next">${icon("next", "sm")} 切抓捕阶段</div>
        <div class="chip ${["hiding", "chasing"].includes(status) ? "on" : ""}" data-act="admin-finish">${icon("check", "sm")} 结束判定</div>
        <div class="chip" data-act="tab" data-tab="timer">${icon("timer", "sm")} 倒计时设置</div>
        <div class="chip" data-act="tab" data-tab="locate">${icon("map", "sm")} 地图 / 轨迹</div>
      </div>
      <div class="small muted" style="margin-top:11px">当前 ${st.counts.total} 人 · 存活躲藏者 ${st.counts.alive_hiders} 人</div>
    </div>

    <div class="section-label">公开全员定位</div>
    ${revealBannerHtml()}
    <div class="card tight">
      <div class="small muted" style="margin-bottom:10px">开启后所有客户端的地图与雷达会<b>同时显示所有人的真实定位与轨迹</b>，用于赛后展示；默认关闭。</div>
      <div class="btn-row">
        <button class="btn sm ghost" data-act="export-tracks" data-format="geojson">${icon("download", "sm")} 导出 GeoJSON</button>
        <button class="btn sm ghost" data-act="export-tracks" data-format="csv">${icon("download", "sm")} 导出 CSV</button>
      </div>
    </div>

    <div class="section-label">成员名单 · ${a.players.length}</div>
    <div class="card">
      <form data-form="add-player" style="display:flex;gap:8px;margin-bottom:10px">
        <input name="username" placeholder="输入已注册用户名" style="flex:1">
        <button class="btn sm" type="submit">添加</button>
      </form>
      ${a.players.length ? a.players.map((p) => `<div class="row">
        <span class="grow"><span class="name">${esc(p.display_name)}</span>
          <div class="meta mono">@${esc(p.username)} · ${p.score} 分</div></span>
        <select data-act="role-change" data-uid="${p.user_id}" style="width:94px;padding:6px;font-size:12px">
          ${["pending", "catcher", "hider", "assistant"].map((r) =>
            `<option value="${r}" ${p.role === r ? "selected" : ""}>${roleCn(r)}</option>`).join("")}
        </select>
        ${status === "draft" ? `<button class="btn xs soft" data-act="remove-player" data-uid="${p.user_id}">${icon("trash", "sm")}</button>` : ""}
      </div>`).join("") : `<div class="empty">${icon("user")}暂无成员</div>`}
    </div>

    <div class="section-label">道具球二维码 · ${a.balls.length} 颗</div>
    <div class="card">
      <div class="btn-row">
        <button class="btn sm" data-act="admin-gen-balls" data-count="20">${icon("ball", "sm")} 生成 20 颗</button>
        <button class="btn sm ghost" data-act="admin-print-balls">${icon("camera", "sm")} 查看 / 打印</button>
      </div>
      <div class="small muted" style="margin-top:9px">打印后放到赛场各处，每颗球只能扫一次。</div>
    </div>

    <div class="section-label">成员邀请码 · 未用 ${a.invites.filter((x) => !x.used_by).length}</div>
    <div class="card">
      <button class="btn sm" data-act="admin-invites" data-count="20">${icon("plus", "sm")} 批量生成 20 个</button>
      <div class="pill-list" style="margin-top:11px">
        ${a.invites.filter((x) => !x.used_by).slice(0, 30).map((x) =>
          `<span class="pill mono" data-act="copy-code" data-code="${attr(x.code)}">${esc(x.code)}</span>`).join("")
          || `<span class="small muted">暂无可用邀请码</span>`}
      </div>
    </div>

    <div class="section-label">代确认抓获</div>
    <div class="card">
      <select id="catch-select" style="margin-bottom:9px">
        ${a.players.filter((p) => p.role === "hider" && p.alive).map((p) =>
          `<option value="${p.user_id}">${esc(p.display_name)}</option>`).join("") || `<option value="">无存活躲藏者</option>`}
      </select>
      <button class="btn block" data-act="admin-catch">${icon("check", "sm")} 确认抓获（抓捕者 +10）</button>
    </div>`}
    <div class="notice sage">${icon("info", "sm")} 文娱部提前到场部署场地与道具；剪辑组赛后按公告要求把素材上传工作室公告网盘。</div>`;
}

async function loadAdmin() {
  if (!S.user?.is_admin) return;
  const id = gid();
  try {
    const [games, invites] = await Promise.all([API.games(), API.invites()]);
    S.adminData.games = games.items; S.adminData.invites = invites.items;
    if (id) {
      const [p, b] = await Promise.all([API.players(id), API.balls(id)]);
      S.adminData.players = p.items; S.adminData.balls = b.items;
    } else { S.adminData.players = []; S.adminData.balls = []; }
  } catch (e) { if (S.tab === "admin") toast(e.message); }
}

async function showBalls() {
  const id = gid(); if (!id) return;
  try {
    const r = await API.balls(id);
    S.adminData.balls = r.items;
    showModal(`
      <div class="modal-head"><b>道具球二维码 · ${r.count} 颗</b>
        <button class="modal-close" data-act="modal-close">${icon("close", "sm")}</button></div>
      <div class="no-print" style="margin-bottom:11px"><button class="btn sm ghost block" onclick="window.print()">🖨 打印这一页</button></div>
      <div class="qr-grid">
        ${r.items.map((x) => `<div class="qr-item">
          <div class="label">${esc(x.label)}</div>${x.svg}
          <div class="code mono">${esc(x.code)}</div>
          <div class="tiny muted">${x.used_by ? "已使用" : "未使用"}</div>
        </div>`).join("") || `<div class="empty">还没有生成小球</div>`}
      </div>`);
  } catch (e) { toast(e.message); }
}

/* ---------------------------------------------------------------- 事件 */
document.addEventListener("click", async (ev) => {
  const el = ev.target.closest("[data-act]");
  if (!el) return;
  const act = el.dataset.act;
  try {
    switch (act) {
      case "auth-switch": S.authMode = el.dataset.mode; renderAuth(); break;
      case "tab": {
        const t = el.dataset.tab;
        if (t === "admin" && !S.user?.is_admin) return;
        S.tab = t;
        if (t === "admin") await loadAdmin();
        render(); break;
      }
      case "refresh": await refresh(); toast("已刷新"); break;
      case "copy-code": await copy(el.dataset.code); break;
      case "modal-close": closeModal(); S.cdEditing = false; break;
      case "my-qr": await showMyQr(); break;
      case "full-board": await showFullBoard(); break;
      case "join": {
        const code = ($("#join-code")?.value || "").trim();
        if (!code) { toast("请输入比赛码"); return; }
        const r = await API.join(code); toast(r.detail || "加入成功"); await refresh(); break;
      }
      case "scan-start": toggleScanner(); break;
      case "logout": {
        try { await API.logout(); } catch (e) { /* ignore */ }
        clearToken(); WS.disconnect(); GEO.stopWatching(); MAP.destroy();
        [clockTimer, cdTimer, mapTimer, radarTimer].forEach(clearInterval);
        S.user = null; S.state = null; S.wsGameId = null; S.tab = "home";
        renderAuth(); toast("已退出登录"); break;
      }
      case "install": {
        if (S.installEvt) { S.installEvt.prompt(); S.installEvt = null; toast("按提示添加到主屏幕"); }
        else toast("请用浏览器菜单中的「添加到主屏幕」"); break;
      }
      // ---- 倒计时 ----
      case "cd-mode": {
        if (!S.user.is_admin) return;
        await API.cdMode(gid(), el.dataset.mode);
        toast(el.dataset.mode === "parallel" ? "已切换：多段同时显示" : "已切换：单独显示 · 自动接棒");
        await loadCountdown(); break;
      }
      case "cd-action": {
        const r = await API.cdAction(gid(), el.dataset.action);
        S.cd = r.state; S.cdAt = Date.now() / 1000;
        toast(({ start: "倒计时开始", pause: "已暂停", resume: "已继续",
                 reset: "已重置", next: "已切到下一段" })[el.dataset.action] || "完成");
        render(); break;
      }
      case "cd-edit": S.cdEditing = true; await showCdEditor(); break;
      case "cd-add-row": {
        const list = $("#cd-edit-list");
        const div = document.createElement("div");
        div.innerHTML = cdEditRow(list.children.length + 1, `第 ${list.children.length + 1} 段`, "5");
        list.appendChild(div.firstElementChild); break;
      }
      case "cd-del-row": {
        const row = el.closest("[data-cd-row]");
        if (row) row.remove();
        $("#cd-edit-list").querySelectorAll("[data-cd-row]").forEach((r, i) => {
          const n = r.querySelector(".qnum"); if (n) n.textContent = i + 1;
        });
        break;
      }
      // ---- 定位 ----
      case "map-mode": {
        S.mapMode = el.dataset.mode;
        MAP.destroy(); clearInterval(mapTimer); clearInterval(radarTimer);
        render(); break;
      }
      case "map-refresh": await loadMap(false); toast("地图已刷新"); break;
      case "radar-refresh": await loadRadar(); toast("雷达已刷新"); break;
      case "map-focus": {
        if (S.geoFix && S.mapData) MAP.focusMe(S.geoFix.lat, S.geoFix.lng, S.mapData.tiles?.crs);
        else toast("还没有拿到你的定位"); break;
      }
      case "open-tiles": await showTiles(); break;
      case "pick-tiles": {
        const key = el.dataset.key;
        S.tilesKey = key; localStorage.setItem("starven_tiles", key);
        if (S.user.is_admin) { try { await API.setTiles(gid(), key, S.tilesTk); } catch (e) { /* 本地预览仍生效 */ } }
        closeModal();
        if (S.mapData) { MAP.applyTiles(tilesFor(S.mapData, key)); MAP.update(S.mapData, S.user.id, { showNames: true }); }
        paintGeoCard(); toast(`已切换：${tilesName(key)}`); break;
      }
      case "save-tk": {
        S.tilesTk = ($("#tdt-tk")?.value || "").trim();
        localStorage.setItem("starven_tianditu_tk", S.tilesTk);
        toast("tk 已保存在本机"); break;
      }
      case "toggle-reveal": {
        const r = await API.setReveal(gid(), !S.revealAll);
        S.revealAll = r.enabled;
        toast(r.enabled ? "已公开全员定位" : "已关闭公开");
        paintRevealBanner(); await loadMap(false); break;
      }
      case "geo-test": await geoTest(); break;
      case "geo-diag": {
        const d = await GEO.diagnose();
        const txt = [
          `星湾定位诊断 ${new Date().toLocaleString("zh-CN")}`,
          `HTTPS: ${d.secure}`, `支持定位: ${d.supported}`, `权限: ${d.permission}`,
          `监听中: ${d.watching}`, `缓存点: ${d.queued}`, `序列: #${d.seq}`,
          `坐标: ${S.geoFix ? fmtCoord(S.geoFix.lat) + "," + fmtCoord(S.geoFix.lng) : "无"}`,
          `精度: ${S.geoFix ? fmtAccuracy(S.geoFix.accuracy) : "无"}`,
          `轨迹点: ${S.trackCount}`, `瓦片: ${tilesName(S.tilesKey)}`,
          `WebSocket: ${S.wsConnected ? "已连接" : "未连接"}`,
        ].join("\n");
        await copy(txt); break;
      }
      case "export-tracks": {
        const format = el.dataset.format;
        const res = await fetch(API.exportTracks(gid(), format), {
          headers: { Authorization: "Bearer " + getToken() },
        });
        if (!res.ok) throw new Error("导出失败，请确认已登录管理员账号");
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `starven-tracks-${gid()}.${format === "csv" ? "csv" : "geojson"}`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 3000);
        toast("轨迹文件已下载"); break;
      }
      // ---- 管理 ----
      case "use-location": {
        try {
          const p = await GEO.once();
          $("#center-lat").value = p.lat.toFixed(6);
          $("#center-lng").value = p.lng.toFixed(6);
          toast("已填入当前位置");
        } catch (e) { toast(e.message); }
        break;
      }
      case "admin-draw": {
        const r = await API.draw(gid());
        toast(`抽签完成：抓${r.alloc["抓捕者"]} / 躲${r.alloc["躲藏者"]} / 协助${r.alloc["协助者"]}`);
        await refresh(); await loadAdmin(); break;
      }
      case "admin-start": await API.start(gid()); toast("躲藏阶段开始"); await refresh(); break;
      case "admin-next": await API.nextPhase(gid()); toast("抓捕阶段开始"); await refresh(); break;
      case "admin-finish": {
        const r = await API.finish(gid());
        toast(r.winner === "hiders" ? "躲藏者获胜 🎉" : "抓捕者获胜 🎯");
        await refresh(); break;
      }
      case "admin-gen-balls": {
        const r = await API.addBalls(gid(), Number(el.dataset.count || 20));
        toast(`已生成 ${r.count} 颗道具球`); await loadAdmin(); render(); break;
      }
      case "admin-print-balls": await showBalls(); break;
      case "admin-invites": {
        const r = await API.createInvites(Number(el.dataset.count || 20));
        toast(`已生成 ${r.count} 个邀请码`); await loadAdmin(); render(); break;
      }
      case "admin-catch": {
        const uid = Number($("#catch-select")?.value || 0);
        if (!uid) { toast("没有存活的躲藏者"); return; }
        await API.catchByAdmin(gid(), uid); toast("已确认抓获，抓捕者 +10");
        await refresh(); await loadAdmin(); break;
      }
      case "remove-player": {
        await API.removePlayer(gid(), Number(el.dataset.uid));
        toast("已移除"); await refresh(); await loadAdmin(); break;
      }
    }
  } catch (e) { toast(e.message); }
});

document.addEventListener("submit", async (ev) => {
  const form = ev.target.closest("[data-form]");
  if (!form) return;
  ev.preventDefault();
  const d = Object.fromEntries(new FormData(form));
  try {
    switch (form.dataset.form) {
      case "login": await doLogin(form); break;
      case "register": await doRegister(form); break;
      case "manual-scan": await submitScan(d.code.trim().toUpperCase()); form.reset(); break;
      case "password": {
        await API.password(d); toast("密码已修改，请重新登录");
        clearToken(); WS.disconnect(); GEO.stopWatching(); MAP.destroy();
        S.user = null; renderAuth(); break;
      }
      case "create-game": {
        await API.createGame({
          name: d.name, center_lat: Number(d.center_lat), center_lng: Number(d.center_lng),
          radius_m: Number(d.radius_m || 150), hide_minutes: Number(d.hide_minutes || 30),
          chase_minutes: Number(d.chase_minutes || 30),
        });
        toast("比赛已创建，把比赛码发给大家吧");
        await refresh(); await loadAdmin(); render(); break;
      }
      case "add-player": {
        await API.addPlayer(gid(), d.username.trim());
        toast("已添加成员"); form.reset(); await refresh(); await loadAdmin(); break;
      }
      case "cd-save": {
        const rows = [...$("#cd-edit-list").querySelectorAll("[data-cd-row]")].map((r) => ({
          label: r.querySelector('[name="label"]').value.trim() || "未命名",
          duration: Math.max(5, Math.round(Number(r.querySelector('[name="minutes"]').value || 5) * 60)),
        }));
        if (!rows.length) { toast("至少保留 1 段"); return; }
        const r = await API.cdSetSegments(gid(), rows);
        S.cd = r.state; S.cdAt = Date.now() / 1000;
        S.cdEditing = false; closeModal(); render(); toast(`已保存 ${rows.length} 段倒计时`); break;
      }
      case "cd-add": {
        const minutes = Number(d.minutes || 5);
        const r = await API.cdAddSegment(gid(), (d.label || "新一段").trim(), Math.round(minutes * 60));
        S.cd = r.state; S.cdAt = Date.now() / 1000;
        toast("已添加一段"); await showCdEditor(); break;
      }
    }
  } catch (e) { toast(e.message); }
});

document.addEventListener("change", async (ev) => {
  const el = ev.target.closest('[data-act="role-change"]');
  if (!el) return;
  try { await API.setRole(gid(), Number(el.dataset.uid), el.value); toast("角色已更新"); await refresh(); }
  catch (e) { toast(e.message); }
});

/* ---------------------------------------------------------------- 实时事件 */
WS.on("open", () => { S.wsConnected = true; if (S.tab === "locate") paintGeoCard(); });
WS.on("close", () => { S.wsConnected = false; if (S.tab === "locate") paintGeoCard(); });
WS.on("refresh", () => refresh(true));
WS.on("phase", (m) => { toast(m.text); refresh(true); });
WS.on("draw", (m) => { toast(m.text); refresh(true); });
WS.on("caught", (m) => { toast(m.text); refresh(true); });
WS.on("decoy", (m) => { toast("📍 " + m.text); if (S.tab === "locate") (S.mapMode === "map" ? loadMap(false) : loadRadar()); });
WS.on("radar_result", (m) => toast(m.title));
WS.on("score", () => refresh(true));
WS.on("game_over", (m) => { toast(m.text); refresh(true); });
WS.on("position", () => { if (S.tab === "locate") (S.mapMode === "map" ? loadMap(false) : loadRadar()); });
WS.on("countdown", (m) => {
  S.cd = m.countdown; S.cdAt = Date.now() / 1000;
  if (m.text) toast(m.text);
  if (S.tab === "timer") {
    if (S.cdEditing) paintCountdown();
    else { render(); paintCountdown(); }
  } else if (S.tab === "home") safeRender();
});
WS.on("reveal", (m) => {
  S.revealAll = !!m.enabled; toast(m.text);
  if (S.tab === "locate") { paintRevealBanner(); (S.mapMode === "map" ? loadMap(false) : loadRadar()); }
  else if (S.tab === "admin") render();
});
WS.on("tiles", (m) => {
  toast(m.text); S.tilesKey = m.tiles;
  localStorage.setItem("starven_tiles", m.tiles);
  if (S.tab === "locate" && S.mapMode === "map") loadMap(false);
});

/* 定期拉取诊断信息；Service Worker 离线壳 */
setInterval(async () => {
  if (S.tab === "locate" && S.user) { S.geoDiag = await GEO.diagnose(); paintGeoCard(); }
}, 8000);

if ("serviceWorker" in navigator && GEO.isSecure) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(new URL("sw.js", document.baseURI)).catch(() => {});
  });
}

boot();
