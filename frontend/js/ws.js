/* WebSocket 实时通道：断线自动重连，收到事件分发给界面 */
import { API_BASE } from "./api.js";

const handlers = new Map();
let ws = null;
let timer = null;
let hb = null;
let stopped = true;
let cfg = { token: "", gameId: "" };
let retry = 0;

export function on(type, fn) {
  if (!handlers.has(type)) handlers.set(type, []);
  handlers.get(type).push(fn);
}

function fire(type, payload) {
  (handlers.get(type) || []).forEach((fn) => {
    try { fn(payload); } catch (e) { console.warn(e); }
  });
  if (type !== "*") fire("*", { type, ...payload });
}

export function connect(token, gameId) {
  cfg = { token, gameId };
  stopped = false;
  retry = 0;
  open();
}

function open() {
  if (stopped) return;
  const base = API_BASE.replace(/^http/, "ws");
  const url = `${base}ws?token=${encodeURIComponent(cfg.token)}&game_id=${encodeURIComponent(cfg.gameId)}`;
  try { ws = new WebSocket(url); } catch (e) { schedule(); return; }
  ws.onopen = () => { retry = 0; fire("open", {}); };
  ws.onmessage = (ev) => {
    let msg = {};
    try { msg = JSON.parse(ev.data); } catch (e) { return; }
    fire(msg.type || "message", msg);
  };
  ws.onclose = () => { fire("close", {}); if (!stopped) schedule(); };
  ws.onerror = () => { try { ws.close(); } catch (e) { /* ignore */ } };
}

function schedule() {
  clearTimeout(timer);
  const delay = Math.min(8000, 1000 * Math.pow(1.5, retry++));
  timer = setTimeout(open, delay);
}

export function disconnect() {
  stopped = true;
  clearTimeout(timer);
  clearInterval(hb);
  if (ws) { try { ws.close(); } catch (e) { /* ignore */ } }
  ws = null;
}

// 心跳，防止中间代理把空闲连接断掉
hb = setInterval(() => {
  if (ws && ws.readyState === 1) ws.send("ping");
}, 25000);
