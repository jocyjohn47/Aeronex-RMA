const LOGIN = "Kingdee.BOS.WebApi.ServicesStub.AuthService.LoginByAppSecret.common.kdsvc";
const QUERY = "Kingdee.BOS.WebApi.ServicesStub.DynamicFormService.ExecuteBillQuery.common.kdsvc";
function cookies(headers) {
  const raw = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [headers.get("set-cookie")].filter(Boolean);
  return raw.map(v => String(v).split(";", 1)[0]).filter(v => v.includes("="));
}
export class KingdeeClient {
  constructor(config) { this.config = config; this.cookies = []; }
  async post(service, parameters) {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const now = Date.now();
      const response = await fetch(`${this.config.baseUrl}/${service}`, {
        method: "POST", signal: controller.signal, redirect: "follow",
        headers: { accept: "application/json", "content-type": "application/json; charset=utf-8", ...(this.cookies.length ? { cookie: this.cookies.join("; ") } : {}) },
        body: JSON.stringify({ format: 1, useragent: "AeronexRMA", rid: `${now}${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`, parameters: JSON.stringify(parameters), timestamp: new Date(now).toISOString().replace("T", " ").slice(0, 19), v: "1.0" }),
      });
      this.cookies = cookies(response.headers).length ? cookies(response.headers) : this.cookies;
      const text = await response.text(); let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch {
        const preview = String(text || "").replace(/\s+/g, " ").trim().slice(0, 300);
        throw Object.assign(
          new Error(`Kingdee returned a non-JSON response${preview ? `: ${preview}` : ""}`),
          { code: "invalid_response", status: response.status }
        );
      }
      if (!response.ok) throw Object.assign(new Error(`Kingdee request failed with HTTP ${response.status}`), { code: "http_error", status: response.status });
      return data;
    } catch (e) {
      if (e?.name === "AbortError") throw Object.assign(new Error("Kingdee request timed out"), { code: "timeout", status: 504 });
      throw e;
    } finally { clearTimeout(timer); }
  }
  async login() {
    const d = await this.post(LOGIN, [this.config.acctId, this.config.username, this.config.appId, this.config.appSecret, this.config.lcid]);
    if (![1, -5].includes(d?.LoginResultType)) throw Object.assign(new Error(`Kingdee login failed: LoginResultType=${d?.LoginResultType ?? "unknown"}`), { code: "login_failed" });
    if (!this.cookies.length) throw Object.assign(new Error("Kingdee login did not return a session cookie"), { code: "login_cookie_missing" });
    return d;
  }
  query(formId, field) {
    return this.post(QUERY, [{ FormId: formId, FieldKeys: field, FilterString: "", OrderString: "", TopRowCount: 1, StartRow: 0, Limit: 1, SubSystemId: "" }]);
  }
}
