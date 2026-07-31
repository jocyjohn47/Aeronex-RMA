import { requireAdminTech, requireAdmin, roleFromRequest, json } from "../../lib/kingdee-http.js";
import { listLogs } from "../../lib/kingdee-log.js";
function csvCell(v) { return `"${String(v ?? "").replace(/"/g, '""')}"`; }
export async function onRequestGet({ request, env }) {
  const denied = requireAdminTech(request); if (denied) return denied;
  const url = new URL(request.url), format = (url.searchParams.get("format") || "").toLowerCase();
  if (format && requireAdmin(request)) return requireAdmin(request);
  const logs = await listLogs(env, { limit: url.searchParams.get("limit") || (format ? 1000 : 50), status: url.searchParams.get("status") || "", operation: url.searchParams.get("operation") || "", search: url.searchParams.get("search") || "" });
  if (format === "json") return new Response(JSON.stringify(logs, null, 2), { headers: { "content-type": "application/json", "content-disposition": "attachment; filename=kingdee-integration-logs.json" } });
  if (format === "csv") {
    const fields = ["time","requestId","user","operation","service","status","httpStatus","durationMs","retryCount","code","kingdeeCode","message","suggestedAction"];
    const body = [fields.join(","), ...logs.map(x => fields.map(f => csvCell(x[f])).join(","))].join("\r\n");
    return new Response(body, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=kingdee-integration-logs.csv" } });
  }
  return json({ ok: true, logs, viewerRole: roleFromRequest(request) });
}
