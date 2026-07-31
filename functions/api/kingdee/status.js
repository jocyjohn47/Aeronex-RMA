import { requireAdminTech, json } from "../../lib/kingdee-http.js";
import { configurationStatus } from "../../lib/kingdee-config.js";
import { lastStatus } from "../../lib/kingdee-log.js";
export async function onRequestGet({ request, env }) { const denied = requireAdminTech(request); if (denied) return denied; return json({ ok: true, configuration: configurationStatus(env), lastStatus: await lastStatus(env) }); }
