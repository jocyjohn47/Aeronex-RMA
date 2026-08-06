const LOGIN = "Kingdee.BOS.WebApi.ServicesStub.AuthService.LoginByAppSecret.common.kdsvc";
const QUERY = "Kingdee.BOS.WebApi.ServicesStub.DynamicFormService.ExecuteBillQuery.common.kdsvc";

function cookies(headers) {
  const raw = typeof headers.getSetCookie === "function"
    ? headers.getSetCookie()
    : [headers.get("set-cookie")].filter(Boolean);
  return raw.map(v => String(v).split(";", 1)[0]).filter(v => v.includes("="));
}

function kingdeeTimestamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);

  const value = type => parts.find(part => part.type === type)?.value || "";
  return `${value("year")}-${value("month")}-${value("day")} ${value("hour")}:${value("minute")}:${value("second")}`;
}

function kingdeeRequestId(date = new Date()) {
  const stamp = kingdeeTimestamp(date).replace(/[-: ]/g, "");
  return `AERONEXRMA-${stamp}-${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
}

export class KingdeeClient {
  constructor(config) {
    this.config = config;
    this.cookies = [];
  }

  async post(service, parameters) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const now = new Date();
      const url = `${this.config.baseUrl}/${service}`;
      const payload = {
        format: 1,
        useragent: "AeronexRMA",
        rid: kingdeeRequestId(now),
        parameters: JSON.stringify(parameters),
        timestamp: kingdeeTimestamp(now),
        v: "1.0"
      };

      const response = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        redirect: "follow",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json; charset=utf-8",
          ...(this.cookies.length ? { Cookie: this.cookies.join("; ") } : {})
        },
        body: JSON.stringify(payload)
      });

      const returnedCookies = cookies(response.headers);
      if (returnedCookies.length) this.cookies = returnedCookies;

      const text = await response.text();
      let data = {};

      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        const preview = String(text || "").replace(/\s+/g, " ").trim().slice(0, 300);
        throw Object.assign(
          new Error(`Kingdee returned a non-JSON response${preview ? `: ${preview}` : ""}`),
          {
            code: "invalid_response",
            status: response.status,
            responseContentType: response.headers.get("content-type") || "",
            responseServer: response.headers.get("server") || ""
          }
        );
      }

      if (!response.ok) {
        throw Object.assign(
          new Error(`Kingdee request failed with HTTP ${response.status}`),
          { code: "http_error", status: response.status }
        );
      }

      return data;
    } catch (e) {
      if (e?.name === "AbortError") {
        throw Object.assign(new Error("Kingdee request timed out"), { code: "timeout", status: 504 });
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  async login() {
    const d = await this.post(LOGIN, [
      this.config.acctId,
      this.config.username,
      this.config.appId,
      this.config.appSecret,
      2052
    ]);

    if (![1, -5].includes(d?.LoginResultType)) {
      throw Object.assign(
        new Error(`Kingdee login failed: LoginResultType=${d?.LoginResultType ?? "unknown"}`),
        { code: "login_failed" }
      );
    }

    if (!this.cookies.length) {
      throw Object.assign(
        new Error("Kingdee login did not return a session cookie"),
        { code: "login_cookie_missing" }
      );
    }

    return d;
  }

  query(formId, field) {
    return this.post(QUERY, [{
      FormId: formId,
      FieldKeys: field,
      FilterString: "",
      OrderString: "",
      TopRowCount: 1,
      StartRow: 0,
      Limit: 1,
      SubSystemId: ""
    }]);
  }
}
