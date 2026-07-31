const REQUIRED = ["KINGDEE_BASE_URL", "KINGDEE_ACCT_ID", "KINGDEE_USERNAME", "KINGDEE_APP_ID", "KINGDEE_APP_SECRET"];
export function configurationStatus(env = {}) {
  const fields = REQUIRED.map(name => ({ name, configured: Boolean(String(env[name] || "").trim()) }));
  const missing = fields.filter(x => !x.configured).map(x => x.name);
  let httpsValid = false;
  try { httpsValid = new URL(String(env.KINGDEE_BASE_URL || "")).protocol === "https:"; } catch {}
  return {
    ready: missing.length === 0 && httpsValid,
    missing,
    httpsValid,
    lcid: Number(env.KINGDEE_LCID || 1033),
    writeEnabled: String(env.KINGDEE_ENABLE_RMA_SALES_ORDER_WRITE || "false").toLowerCase() === "true",
    logStorage: env.KINGDEE_LOGS ? "Cloudflare KV" : "Not configured",
  };
}
export function kingdeeConfig(env = {}) {
  const required = name => { const v = String(env[name] || "").trim(); if (!v) throw Object.assign(new Error(`${name} is not configured`), { code: "configuration_missing" }); return v; };
  const baseUrl = required("KINGDEE_BASE_URL").replace(/\/+$/, "");
  if (new URL(baseUrl).protocol !== "https:") throw Object.assign(new Error("KINGDEE_BASE_URL must use HTTPS"), { code: "https_required" });
  return {
    baseUrl,
    acctId: required("KINGDEE_ACCT_ID"), username: required("KINGDEE_USERNAME"), appId: required("KINGDEE_APP_ID"), appSecret: required("KINGDEE_APP_SECRET"),
    lcid: Number(env.KINGDEE_LCID || 1033), timeoutMs: Math.max(5000, Number(env.KINGDEE_REQUEST_TIMEOUT || 30) * 1000),
    probes: [
      { operation: "Customer Query", formId: env.KINGDEE_TEST_CUSTOMER_FORM_ID || "BD_Customer", field: env.KINGDEE_TEST_CUSTOMER_FIELD || "FNumber" },
      { operation: "Material Query", formId: env.KINGDEE_TEST_MATERIAL_FORM_ID || "BD_MATERIAL", field: env.KINGDEE_TEST_MATERIAL_FIELD || "FNumber" },
      { operation: "Sales Order Query", formId: env.KINGDEE_TEST_SALES_ORDER_FORM_ID || "SAL_SaleOrder", field: env.KINGDEE_TEST_SALES_ORDER_FIELD || "FBillNo" },
    ],
  };
}
