const H = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type,x-user-role,x-user-email"
};

const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: H });
const norm = v => String(v ?? "").trim();
const lower = v => norm(v).toLowerCase();

async function body(req) {
  try { return await req.json(); } catch { return {}; }
}

function b64(dataUrl) {
  const s = String(dataUrl || "").includes(",") ? String(dataUrl).split(",").pop() : String(dataUrl || "");
  const bin = atob(s);
  const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
}

function larkUrl(url, text) {
  return { link: url, text: text || url };
}

async function token(env) {
  const res = await fetch("https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ app_id: env.LARK_APP_ID, app_secret: env.LARK_APP_SECRET })
  });
  const data = await res.json();
  if (!data.tenant_access_token) throw new Error("Lark token error: " + JSON.stringify(data));
  return data.tenant_access_token;
}

async function lf(env, path, init = {}) {
  const t = await token(env);
  const res = await fetch("https://open.larksuite.com/open-apis" + path, {
    ...init,
    headers: {
      "authorization": `Bearer ${t}`,
      "content-type": "application/json; charset=utf-8",
      ...(init.headers || {})
    }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.code) throw new Error("Lark API error: " + JSON.stringify(data));
  return data;
}

async function list(env, table) {
  let out = [], pt = "";
  do {
    const qs = new URLSearchParams({ page_size: "500" });
    if (pt) qs.set("page_token", pt);
    const d = await lf(env, `/bitable/v1/apps/${env.LARK_BASE_TOKEN}/tables/${table}/records?${qs}`);
    out.push(...(d.data?.items || []));
    pt = d.data?.page_token || "";
  } while (pt);
  return out;
}

async function create(env, table, fields) {
  return lf(env, `/bitable/v1/apps/${env.LARK_BASE_TOKEN}/tables/${table}/records`, {
    method: "POST",
    body: JSON.stringify({ fields })
  });
}

async function update(env, table, id, fields) {
  return lf(env, `/bitable/v1/apps/${env.LARK_BASE_TOKEN}/tables/${table}/records/${id}`, {
    method: "PUT",
    body: JSON.stringify({ fields })
  });
}

async function del(env, table, id) {
  return lf(env, `/bitable/v1/apps/${env.LARK_BASE_TOKEN}/tables/${table}/records/${id}`, { method: "DELETE" });
}

async function types(env, table) {
  const d = await lf(env, `/bitable/v1/apps/${env.LARK_BASE_TOKEN}/tables/${table}/fields`);
  const out = {};
  for (const f of d.data?.items || []) out[f.field_name] = f.type;
  return out;
}

function fieldText(v) {
  if (Array.isArray(v)) return v.map(x => norm(x?.text || x?.name || x)).filter(Boolean).join(", ");
  if (typeof v === "object" && v) return norm(v.text || v.name || v.value);
  return norm(v);
}

function publicUser(r) {
  const f = r.fields || {};
  return {
    record_id: r.record_id,
    email: norm(f["Username ( Email )"]),
    username: norm(f["Username ( Email )"]),
    companyName: norm(f["Company Name"]),
    contactName: norm(f["Contact Person"]),
    role: fieldText(f["User Role"]),
    country: fieldText(f["Country"]),
    fields: f
  };
}

function checkPassword(f, p) {
  p = norm(p);
  return p && (p === norm(f["Reset Password"]) || p === norm(f["Password"]) || p === norm(f["Temp Password"]));
}

function tableFor(env, country) {
  return lower(country).includes("ksa") ? env.SPARE_ORDER_KSA_TABLE_ID : env.SPARE_ORDER_UAE_TABLE_ID;
}

function orderNoFromFields(f) {
  return norm(f["Spare Order No"] || f["Spare Order Case"]);
}

function orderFileUrl(env, r) {
  const f = r.fields || {};
  const text = String((f.Remarks || "") + "\n" + (f.Notes || ""));
  const m = text.match(/Order File URL:\s*(https?:\/\/\S+)/i);
  if (m) return m[1];
  const no = orderNoFromFields(f);
  return no ? `${String(env.R2_PUBLIC_URL || "").replace(/\/+$/, "")}/aeronex-orders/${no}/order.xls` : "";
}

function withOrderMeta(env, table, r) {
  return { ...r, _table_id: table, r2OrderFileUrl: orderFileUrl(env, r) };
}

async function putR2(env, key, bytes, contentType) {
  await env.R2.put(key, bytes, { httpMetadata: { contentType: contentType || "application/octet-stream" } });
  return `${String(env.R2_PUBLIC_URL || "").replace(/\/+$/, "")}/${key}`;
}

function excelBytes(orderNo, fields, items) {
  const rows = [
    ["Spare Order No", orderNo],
    ["Company Name", fields["Company Name"] || ""],
    ["Contact Name", fields["Contact Name"] || ""],
    ["Billing Address", fields["Billing Address"] || fields["Invoice Address"] || ""],
    ["Country", fields.Country || ""],
    ["Invoice Currency", fields["Invoice Currency"] || ""],
    [],
    ["Material Code", "Material Name", "Compatible Model", "Qty"],
    ...(items || []).map(i => [
      i.materialCode || i["Material Code"] || "",
      i.materialName || i["Material Name"] || "",
      i.compatibleModel || i["Compatible Model"] || "",
      i.qty || i.Qty || 1
    ])
  ];
  const csv = rows.map(r => r.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
  return new TextEncoder().encode(csv);
}

async function handle(req, env) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: H });

  const url = new URL(req.url);
  const p = url.pathname;

  if (p === "/api/health") return json({ ok: true, cloudflare_pages_functions: true });

  if (p === "/api/login" && req.method === "POST") {
    const b = await body(req);
    const users = await list(env, env.USER_TABLE_ID);
    const r = users.find(x => lower(x.fields?.["Username ( Email )"]) === lower(b.username || b.email));
    if (!r || !checkPassword(r.fields || {}, b.password)) return json({ error: "Invalid login" }, 401);
    return json({ ok: true, user: publicUser(r) });
  }

  if (p === "/api/users") return json({ ok: true, users: (await list(env, env.USER_TABLE_ID)).map(publicUser) });

  if (p === "/api/dealers") return json({ ok: true, dealers: await list(env, env.USER_TABLE_ID) });

  if (p === "/api/spare-list") return json({ ok: true, items: await list(env, env.SPARE_LIST_TABLE_ID) });

  if (p === "/api/my-orders") {
    const email = lower(url.searchParams.get("email"));
    const role = lower(url.searchParams.get("role"));
    const admin = role.includes("admin") || role.includes("technician") || role.includes("tech");

    let rows = [
      ...(await list(env, env.SPARE_ORDER_UAE_TABLE_ID)).map(r => withOrderMeta(env, env.SPARE_ORDER_UAE_TABLE_ID, r)),
      ...(await list(env, env.SPARE_ORDER_KSA_TABLE_ID)).map(r => withOrderMeta(env, env.SPARE_ORDER_KSA_TABLE_ID, r))
    ];

    if (!admin && email) {
      rows = rows.filter(r =>
        lower(r.fields?.["Contact Email"] || r.fields?.["Username ( Email )"]) === email ||
        lower(r.fields?.["Contact Name"]).includes(email.split("@")[0] || "")
      );
    }
    return json({ ok: true, orders: rows });
  }

  if (p === "/api/submit-spare" && req.method === "POST") {
    const b = await body(req);
    const country = norm(b.country || "UAE & Other Region");
    const table = tableFor(env, country);
    const items = b.items || b.cart || [];
    const prefix = lower(country).includes("ksa") ? "KSA" : "UAE";
    const orderNo = `${prefix}ASPARE${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}`;

    const fields = {
      "Company Name": b.companyName || "",
      "Contact Name": b.contactName || "",
      "Billing Address": b.billingAddress || b.invoiceAddress || "",
      "Invoice Address": b.billingAddress || b.invoiceAddress || "",
      "Country": country,
      "Invoice Currency": b.invoiceCurrency || "USD",
      "Status": "Submitted",
      "Material Name": items.map(i => i.materialName || i["Material Name"] || "").filter(Boolean).join(", "),
      "Material Code": items.map(i => i.materialCode || i["Material Code"] || "").filter(Boolean).join(", "),
      "Qty": items.map(i => i.qty || i.Qty || 1).join(", "),
      "Notes": b.notes || "",
      "Remarks": b.remarks || ""
    };

    const fileUrl = await putR2(env, `aeronex-orders/${orderNo}/order.xls`, excelBytes(orderNo, fields, items), "application/vnd.ms-excel");
    fields.Remarks = fields.Remarks ? `${fields.Remarks}\nOrder File URL: ${fileUrl}` : `Order File URL: ${fileUrl}`;

    const t = await types(env, table);
    const finalFields = {};
    for (const [k, v] of Object.entries(fields)) if (t[k]) finalFields[k] = v;

    const r = await create(env, table, finalFields);
    return json({ ok: true, orderNo, r2ExcelUrl: fileUrl, r2OrderFileUrl: fileUrl, result: r.data });
  }

  if (p === "/api/upload-invoice" && req.method === "POST") {
    const b = await body(req);
    const orderNo = norm(b.orderNo);
    if (!orderNo) return json({ error: "Missing orderNo" }, 400);

    const name = b.file?.name || "invoice.pdf";
    const ext = name.includes(".") ? name.split(".").pop() : "pdf";
    const fileUrl = await putR2(env, `aeronex-orders/${orderNo}/invoice.${ext}`, b64(b.file?.data), b.file?.type || "application/pdf");

    if (b.record_id && b.tableId) {
      const t = await types(env, b.tableId);
      await update(env, b.tableId, b.record_id, {
        "Invoice Download": t["Invoice Download"] === 15 ? larkUrl(fileUrl, "Invoice Download") : fileUrl
      });
    }
    return json({ ok: true, url: fileUrl });
  }

  if (p === "/api/upload-payment-receipt" && req.method === "POST") {
    const b = await body(req);
    const orderNo = norm(b.orderNo);
    if (!orderNo) return json({ error: "Missing orderNo" }, 400);

    const name = b.file?.name || "payment-receipt.pdf";
    const ext = name.includes(".") ? name.split(".").pop() : "pdf";
    const fileUrl = await putR2(env, `aeronex-orders/${orderNo}/payment-receipt.${ext}`, b64(b.file?.data), b.file?.type || "application/pdf");

    if (b.record_id && b.tableId) {
      const t = await types(env, b.tableId);
      await update(env, b.tableId, b.record_id, {
        "Payment Receipt": t["Payment Receipt"] === 15 ? larkUrl(fileUrl, "Payment Receipt") : fileUrl
      });
    }
    return json({ ok: true, url: fileUrl });
  }

  if (p === "/api/update-status" && req.method === "POST") {
    const b = await body(req);
    await update(env, b.tableId, b.record_id, { Status: b.status });
    return json({ ok: true });
  }

  if (p === "/api/delete-order" && req.method === "POST") {
    const b = await body(req);
    await del(env, b.tableId, b.record_id);
    return json({ ok: true });
  }

  if (p === "/api/portal-notes") return json({ ok: true, notes: await list(env, env.PORTAL_NOTES_TABLE_ID) });

  return json({ error: "API not found", path: p }, 404);
}

export async function onRequest(context) {
  try {
    return await handle(context.request, context.env);
  } catch (e) {
    return json({ error: e.message || String(e) }, 500);
  }
}
