import { safeText } from "./kingdee-http.js";
const KEY = "kingdee-integration-logs-v1";
const MAX = 1000;
const SUCCESS_MS = 5 * 86400000;
const ERROR_MS = 15 * 86400000;
function sanitize(e = {}) {
  return { id: e.id || crypto.randomUUID(), time: e.time || new Date().toISOString(), requestId: safeText(e.requestId || `KD-${Date.now()}`, 80), user: safeText(e.user, 160), operation: safeText(e.operation, 120), service: safeText(e.service, 180), status: e.status === "success" ? "success" : "error", httpStatus: Number(e.httpStatus || 0), durationMs: Number(e.durationMs || 0), retryCount: Number(e.retryCount || 0), code: safeText(e.code, 100), kingdeeCode: safeText(e.kingdeeCode, 100), message: safeText(e.message, 1000), suggestedAction: safeText(e.suggestedAction, 500) };
}
function clean(items) {
  const now = Date.now();
  return items.filter(x => { const age = now - Date.parse(x.time || 0); return age <= (x.status === "success" ? SUCCESS_MS : ERROR_MS); }).sort((a,b)=>Date.parse(b.time)-Date.parse(a.time)).slice(0, MAX);
}
async function all(env) {
  if (!env.KINGDEE_LOGS) return [];
  try { return clean(JSON.parse(await env.KINGDEE_LOGS.get(KEY) || "[]")); } catch { return []; }
}
export async function addLog(env, entry) {
  const item = sanitize(entry); if (!env.KINGDEE_LOGS) return item;
  const items = clean([item, ...(await all(env))]); await env.KINGDEE_LOGS.put(KEY, JSON.stringify(items)); return item;
}
export async function listLogs(env, filters = {}) {
  let items = await all(env);
  if (filters.status) items = items.filter(x => x.status === filters.status);
  if (filters.operation) items = items.filter(x => x.operation === filters.operation);
  if (filters.search) { const q = filters.search.toLowerCase(); items = items.filter(x => `${x.requestId} ${x.message} ${x.user}`.toLowerCase().includes(q)); }
  return items.slice(0, Math.max(1, Math.min(Number(filters.limit || 50), 1000)));
}
export async function lastStatus(env) { return (await all(env))[0] || null; }
