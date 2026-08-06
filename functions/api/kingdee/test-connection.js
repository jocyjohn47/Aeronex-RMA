import { requireAdminTech, userFromRequest, json, safeText } from "../../lib/kingdee-http.js";
import { kingdeeConfig } from "../../lib/kingdee-config.js";
import { KingdeeClient } from "../../lib/kingdee-client.js";
import { addLog } from "../../lib/kingdee-log.js";
function suggestion(code) {
  return ({ configuration_missing: "Add the missing Cloudflare variable or secret.", invalid_protocol: "Use an HTTP or HTTPS Kingdee base URL.", timeout: "Check Kingdee availability and network access, or increase KINGDEE_REQUEST_TIMEOUT.", login_failed: "Verify account ID, username, App ID, App Secret, and LCID.", login_cookie_missing: "Check the Kingdee gateway/session configuration.", http_error: "Check the Kingdee server and reverse proxy response." })[code] || "Review the diagnostic details and Kingdee server logs.";
}
export async function onRequestPost({ request, env }) {
  const denied = requireAdminTech(request); if (denied) return denied;
  const started = Date.now(), requestId = `KD-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0,14)}-${crypto.randomUUID().slice(0,8)}`, user = userFromRequest(request);
  try {
    const cfg = kingdeeConfig(env), client = new KingdeeClient(cfg);
    await client.login();
    for (const probe of cfg.probes) await client.query(probe.formId, probe.field);
    const item = await addLog(env, { requestId, user, operation: "Connection Test", service: "Login + Customer + Material + Sales Order read queries", status: "success", httpStatus: 200, durationMs: Date.now()-started, code: "connected", message: "Kingdee login and read-only test queries completed successfully.", suggestedAction: "No action required." });
    return json({ ok: true, connected: true, result: item });
  } catch (e) {
    const code = String(e?.code || "connection_failed");
    const item = await addLog(env, { requestId, user, operation: "Connection Test", service: "Kingdee WebAPI", status: "error", httpStatus: Number(e?.status || 502), durationMs: Date.now()-started, code, message: safeText(e?.message || e), suggestedAction: suggestion(code) });
    const responseStatus = Number(e?.status || 500);
    return json({ ok: false, connected: false, error: item.message, result: item }, responseStatus >= 400 && responseStatus <= 599 ? responseStatus : 500);
  }
}
