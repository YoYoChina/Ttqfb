/* REST 客户端：同源 /api/；GitHub Pages 部署时可用 window.STARVEN_API_BASE 指向线上后端 */
const override = (window.STARVEN_API_BASE || "").trim().replace(/\/$/, "");
const API_BASE = override
  ? `${override}/api/`
  : new URL("api/", new URL(location.pathname, location.origin)).href;
export { API_BASE };

let TOKEN = localStorage.getItem("starven_token") || "";

export const getToken = () => TOKEN;
export function setToken(t) {
  TOKEN = t || "";
  if (t) localStorage.setItem("starven_token", t);
  else localStorage.removeItem("starven_token");
}
export function clearToken() { setToken(""); }

async function req(path, { method = "GET", body, auth = true } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth && TOKEN) headers["Authorization"] = "Bearer " + TOKEN;
  let res;
  try {
    res = await fetch(API_BASE + path.replace(/^\//, ""), {
      method, headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new Error("网络不通，请确认后端已启动、地址配置正确");
  }
  let data = {};
  try { data = await res.json(); } catch (e) { /* ignore */ }
  if (!res.ok) {
    if (res.status === 401) {
      clearToken();
      window.dispatchEvent(new CustomEvent("starven:unauthorized"));
    }
    throw new Error(data.detail || `请求失败 (${res.status})`);
  }
  return data;
}

export const API = {
  // 账号
  login: (d) => req("auth/login", { method: "POST", body: d }),
  register: (d) => req("auth/register", { method: "POST", body: d }),
  me: () => req("auth/me"),
  password: (d) => req("auth/password", { method: "POST", body: d }),
  logout: () => req("auth/logout", { method: "POST", body: {} }),
  invites: () => req("auth/invites"),
  createInvites: (count) => req("auth/invites", { method: "POST", body: { count } }),
  // 成员
  join: (join_code) => req("games/join", { method: "POST", body: { join_code } }),
  current: () => req("games/current"),
  state: (gid) => req(`games/${gid}/state`),
  board: (gid) => req(`games/${gid}/leaderboard`),
  radar: (gid) => req(`games/${gid}/radar`),
  scoreEvents: (gid) => req(`games/${gid}/score-events`),
  position: (gid, d) => req(`games/${gid}/position`, { method: "POST", body: d }),
  scan: (gid, code) => req(`games/${gid}/scan`, { method: "POST", body: { code } }),
  myQr: (gid) => req(`games/${gid}/my-qr`),
  meta: () => req("meta", { auth: false }),
  health: () => req("health", { auth: false }),
  // v2 倒计时
  countdown: (gid) => req(`games/${gid}/countdown`),
  cdAdmin: (gid) => req(`admin/games/${gid}/countdown`),
  cdSetSegments: (gid, segments) => req(`admin/games/${gid}/countdown/segments`,
    { method: "PUT", body: { segments } }),
  cdAddSegment: (gid, label, duration) => req(`admin/games/${gid}/countdown/segments`,
    { method: "POST", body: { label, duration } }),
  cdDelSegment: (gid, id) => req(`admin/games/${gid}/countdown/segments/${id}`, { method: "DELETE" }),
  cdMode: (gid, mode) => req(`admin/games/${gid}/countdown/mode`,
    { method: "POST", body: { mode } }),
  cdAction: (gid, action) => req(`admin/games/${gid}/countdown/${action}`,
    { method: "POST", body: {} }),
  // v2 地图 / 轨迹 / 公开定位
  track: (gid, points) => req(`games/${gid}/track`, { method: "POST", body: { points } }),
  tracks: (gid, params = "") => req(`games/${gid}/tracks${params}`),
  map: (gid) => req(`games/${gid}/map`),
  geoStatus: (gid) => req(`games/${gid}/geo-status`),
  setReveal: (gid, enabled) => req(`admin/games/${gid}/reveal`,
    { method: "POST", body: { enabled } }),
  setTiles: (gid, tiles, tk = "") => req(`admin/games/${gid}/map-tiles`,
    { method: "PATCH", body: { tiles, tk } }),
  exportTracks: (gid, format) => `${API_BASE}admin/games/${gid}/tracks/export?format=${format}`,
  // 管理
  overview: () => req("admin/overview"),
  createGame: (d) => req("admin/games", { method: "POST", body: d }),
  games: () => req("admin/games"),
  gameDetail: (gid) => req(`admin/games/${gid}`),
  players: (gid) => req(`admin/games/${gid}/players`),
  addPlayer: (gid, username) => req(`admin/games/${gid}/players`, { method: "POST", body: { username } }),
  removePlayer: (gid, uid) => req(`admin/games/${gid}/players/${uid}`, { method: "DELETE" }),
  draw: (gid) => req(`admin/games/${gid}/draw`, { method: "POST", body: {} }),
  setRole: (gid, user_id, role) => req(`admin/games/${gid}/role`, { method: "PATCH", body: { user_id, role } }),
  start: (gid) => req(`admin/games/${gid}/start`, { method: "POST", body: {} }),
  nextPhase: (gid) => req(`admin/games/${gid}/next-phase`, { method: "POST", body: {} }),
  finish: (gid) => req(`admin/games/${gid}/finish`, { method: "POST", body: {} }),
  addBalls: (gid, count) => req(`admin/games/${gid}/balls`, { method: "POST", body: { count } }),
  balls: (gid) => req(`admin/games/${gid}/balls`),
  catchByAdmin: (gid, hider_id) => req(`admin/games/${gid}/catch`, { method: "POST", body: { hider_id } }),
};
