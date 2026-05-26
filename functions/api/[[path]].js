const H = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
  "access-control-allow-headers": "content-type,x-user-role,x-user-email"
};

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: H });
const norm = v => String(v ?? "").trim();
const lower = v => norm(v).toLowerCase();

async function readBody(req) {
  try { return await req.json(); } catch { return {}; }
}

function fieldText(v) {
  if (Array.isArray(v)) return v.map(fieldText).filter(Boolean).join(", ");
  if (typeof v === "object" && v) return norm(v.text || v.name || v.value || v.link || "");
  return norm(v);
}

function firstField(f, names) {
  for (const n of names) {
    if (f && f[n] !== undefined && f[n] !== null && fieldText(f[n]) !== "") return f[n];
  }
  return "";
}

function userEmail(f) { return lower(fieldText(firstField(f, ["Username ( Email )","Username (Email)","Username","Email","Contact Email","Login Email"]))); }
function userPassword(f) { return norm(fieldText(firstField(f, ["Reset Password","Password","Temp Password","Temporary Password","Login Password"]))); }
function userRole(f) { return fieldText(firstField(f, ["User Role","Role","User Type"])); }
function userCompany(f) { return fieldText(firstField(f, ["Company Name","Dealer / Company","Company"])); }
function userContact(f) { return fieldText(firstField(f, ["Contact Person","Contact Name","Name"])); }
function userCountry(f) { return fieldText(firstField(f, ["Country","Region"])); }

function publicUser(r) {
  const f = r.fields || {};
  return {
    record_id: r.record_id,
    email: userEmail(f),
    username: userEmail(f),
    companyName: userCompany(f),
    contactName: userContact(f),
    role: userRole(f),
    country: userCountry(f),
    fields: f
  };
}

async function larkToken(env) {
  const res = await fetch("https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ app_id: env.LARK_APP_ID, app_secret: env.LARK_APP_SECRET })
  });
  const data = await res.json();
  if (!data.tenant_access_token) throw new Error("Lark token error: " + JSON.stringify(data));
  return data.tenant_access_token;
}

async function larkFetch(env, path, init = {}) {
  const token = await larkToken(env);
  const res = await fetch("https://open.larksuite.com/open-apis" + path, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json; charset=utf-8",
      ...(init.headers || {})
    }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.code) throw new Error("Lark API error: " + JSON.stringify(data));
  return data;
}

async function listRecords(env, tableId) {
  if (!tableId) return [];
  let rows = [];
  let pageToken = "";
  do {
    const qs = new URLSearchParams({ page_size: "500" });
    if (pageToken) qs.set("page_token", pageToken);
    const data = await larkFetch(env, `/bitable/v1/apps/${env.LARK_BASE_TOKEN}/tables/${tableId}/records?${qs}`);
    rows.push(...(data.data?.items || []));
    pageToken = data.data?.page_token || "";
  } while (pageToken);
  return rows;
}

async function getFieldTypes(env, tableId) {
  if (!tableId) return {};
  const data = await larkFetch(env, `/bitable/v1/apps/${env.LARK_BASE_TOKEN}/tables/${tableId}/fields`);
  const out = {};
  for (const f of data.data?.items || []) out[f.field_name] = f.type;
  return out;
}


async function createRecord(env, tableId, fields) {
  return larkFetch(env, `/bitable/v1/apps/${env.LARK_BASE_TOKEN}/tables/${tableId}/records`, {
    method: "POST",
    body: JSON.stringify({ fields })
  });
}

async function updateRecord(env, tableId, recordId, fields) {
  return larkFetch(env, `/bitable/v1/apps/${env.LARK_BASE_TOKEN}/tables/${tableId}/records/${recordId}`, {
    method: "PUT",
    body: JSON.stringify({ fields })
  });
}

async function deleteRecord(env, tableId, recordId) {
  return larkFetch(env, `/bitable/v1/apps/${env.LARK_BASE_TOKEN}/tables/${tableId}/records/${recordId}`, {
    method: "DELETE"
  });
}

function larkUrl(url, label) {
  return { link: url, text: label || url };
}

function bytesFromDataUrl(dataUrl) {
  const s = String(dataUrl || "").includes(",") ? String(dataUrl).split(",").pop() : String(dataUrl || "");
  const bin = atob(s);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

async function putR2(env, key, bytes, contentType) {
  if (!env.R2) throw new Error("R2 binding missing. Add binding name R2 to bucket aeronex-rma.");
  await env.R2.put(key, bytes, { httpMetadata: { contentType: contentType || "application/octet-stream" } });
  return `${String(env.R2_PUBLIC_URL || "").replace(/\/+$/, "")}/${key}`;
}

function spareTable(env, country) {
  return lower(country).includes("ksa") ? env.SPARE_ORDER_KSA_TABLE_ID : env.SPARE_ORDER_UAE_TABLE_ID;
}

function repairTable(env, country) {
  return lower(country).includes("ksa") ? env.REPAIR_KSA_TABLE_ID : env.REPAIR_UAE_TABLE_ID;
}



function orderNo(fields) {
  return norm(fields["Spare Order No"] || fields["Spare Order Case"]);
}

function repairNo(fields) {
  return norm(fields["Repair Case No"] || fields["Repair No"] || fields["Repair Case"]);
}

function orderFileUrl(env, row) {
  const f = row.fields || {};
  const text = String((f.Remarks || "") + "\n" + (f.Notes || ""));
  const m = text.match(/Order File URL:\s*(https?:\/\/\S+)/i);
  if (m) return m[1];
  const no = orderNo(f);
  return no ? `${String(env.R2_PUBLIC_URL || "").replace(/\/+$/, "")}/${getOrderFolderKey(no, "order.xls")}` : "";
}

function withSpareMeta(env, tableId, row) {
  return { ...row, _table_id: tableId, r2OrderFileUrl: orderFileUrl(env, row) };
}

function withRepairMeta(env, tableId, row) {
  return { ...row, _table_id: tableId };
}

function canSeeAll(role) {
  const r = lower(role);
  return r.includes("admin") || r.includes("technician") || r.includes("tech");
}

function filterOwn(rows, email, role) {
  if (canSeeAll(role) || !email) return rows;
  const e = lower(email);
  return rows.filter(r => lower(r.fields?.["Contact Email"] || r.fields?.["Username ( Email )"] || r.fields?.Email) === e);
}

function csvBytes(caseNo, fields, items) {
  const rows = [
    ["Case No", caseNo],
    ["Company Name", fields["Company Name"] || ""],
    ["Contact Name", fields["Contact Name"] || fields["Contact Person"] || ""],
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












async function getRecord(env, tableId, recordId) {
  if (!tableId || !recordId) throw new Error("Missing tableId or record_id");
  const data = await larkFetch(env, `/bitable/v1/apps/${env.LARK_BASE_TOKEN}/tables/${tableId}/records/${recordId}`);
  return data.data?.record || data.data;
}

function makeSpareOrderNo(country) {
  const ts = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const prefix = lower(country).includes("ksa") ? "KSAASPARE" : "UAEASPARE";
  return `${prefix}${ts}`;
}

function spareOrderNo(fields) {
  return norm(
    fields?.["Spare Order Case"] ||
    fields?.["Spare Order No"] ||
    fields?.["Order No"] ||
    fields?.["Case No"] ||
    ""
  );
}

function getOrderFolderKey(orderNo, fileName) {
  return `aeronex-orders/${orderNo}/${fileName}`;
}

function htmlExcelBytes(orderNo, fields, items) {
  const escHtml = v => String(v ?? "").replace(/[&<>"]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[s]));
  const itemRows = (items || []).map((i, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td>${escHtml(i.materialCode || i["Material Code"] || "")}</td>
      <td>${escHtml(i.materialName || i["Material Name"] || "")}</td>
      <td>${escHtml(i.compatibleModel || i["Compatible Model"] || "")}</td>
      <td>${escHtml(i.qty || i.Qty || 1)}</td>
    </tr>`).join("");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
body{font-family:Arial,sans-serif}h1{font-size:20px;color:#1f3b8a}h2{font-size:16px;margin-top:20px}
table{border-collapse:collapse;width:100%}th{background:#1f3b8a;color:#fff;font-weight:bold}
th,td{border:1px solid #777;padding:8px;text-align:left}.meta th{width:220px}
</style></head><body>
<h1>AERO NEX Spare Order</h1>
<table class="meta">
<tr><th>Spare Order No</th><td>${escHtml(orderNo)}</td></tr>
<tr><th>Company Name</th><td>${escHtml(fields["Company Name"])}</td></tr>
<tr><th>Contact Name</th><td>${escHtml(fields["Contact Name"] || fields["Contact Person"])}</td></tr>
<tr><th>Billing Address</th><td>${escHtml(fields["Billing Address"] || fields["Invoice Address"])}</td></tr>
<tr><th>Country</th><td>${escHtml(fields.Country)}</td></tr>
<tr><th>Invoice Currency</th><td>${escHtml(fields["Invoice Currency"])}</td></tr>
<tr><th>Status</th><td>${escHtml(fields.Status || "Submitted")}</td></tr>
</table>
<h2>Spare Parts</h2>
<table><thead><tr><th>No</th><th>Material Code</th><th>Material Name</th><th>Compatible Model</th><th>Qty</th></tr></thead>
<tbody>${itemRows || '<tr><td colspan="5">No items</td></tr>'}</tbody></table>
</body></html>`;
  return new TextEncoder().encode(html);
}

function larkAttachmentValue(fileToken, fileName) {
  return [{ file_token: fileToken, name: fileName || "order.xls" }];
}

async function larkUploadBitableAttachment(env, bytes, fileName, mimeType) {
  const token = await larkToken(env);
  const boundary = "----aeronex" + Math.random().toString(16).slice(2);
  const enc = new TextEncoder();
  const parts = [
    enc.encode(`--${boundary}\r\nContent-Disposition: form-data; name="file_name"\r\n\r\n${fileName}\r\n`),
    enc.encode(`--${boundary}\r\nContent-Disposition: form-data; name="parent_type"\r\n\r\nbitable_file\r\n`),
    enc.encode(`--${boundary}\r\nContent-Disposition: form-data; name="parent_node"\r\n\r\n${env.LARK_BASE_TOKEN}\r\n`),
    enc.encode(`--${boundary}\r\nContent-Disposition: form-data; name="size"\r\n\r\n${bytes.length}\r\n`),
    enc.encode(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: ${mimeType || "application/vnd.ms-excel"}\r\n\r\n`),
    bytes,
    enc.encode(`\r\n--${boundary}--\r\n`)
  ];
  let size = 0;
  for (const p of parts) size += p.length;
  const body = new Uint8Array(size);
  let offset = 0;
  for (const p of parts) { body.set(p, offset); offset += p.length; }
  const res = await fetch("https://open.larksuite.com/open-apis/drive/v1/medias/upload_all", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": `multipart/form-data; boundary=${boundary}` },
    body
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.code) throw new Error("Lark upload_all error: " + JSON.stringify(data));
  const fileToken = data.data?.file_token || data.data?.file?.file_token || data.file_token;
  if (!fileToken) throw new Error("No file_token from Lark upload_all: " + JSON.stringify(data));
  return fileToken;
}

async function attachOrderExcelToLark(env, tableId, recordId, bytes, fileName) {
  if (!recordId) throw new Error("Missing record_id for Order File attachment");
  const fieldTypes = await getFieldTypes(env, tableId);
  if (!fieldTypes["Order File"]) return { skipped: true, reason: "Order File field not found" };
  const fileToken = await larkUploadBitableAttachment(env, bytes, fileName, "application/vnd.ms-excel");
  await updateRecord(env, tableId, recordId, { "Order File": larkAttachmentValue(fileToken, fileName) });
  return { ok: true, fileToken };
}

async function resolveOrderNoForUpload(env, b) {
  if (b.tableId && b.record_id) {
    const rec = await getRecord(env, b.tableId, b.record_id);
    const fromRecord = spareOrderNo(rec.fields || {});
    if (fromRecord) return fromRecord;
  }
  return norm(b.orderNo || b.caseNo);
}

async function handle(req, env) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: H });

  const url = new URL(req.url);
  const p = url.pathname;

  if (p === "/api/health") return json({ ok: true, cloudflare_pages_functions: true });

  if (p === "/api/debug-env") {
    return json({ ok: true, has: {
      LARK_APP_ID: !!env.LARK_APP_ID,
      LARK_APP_SECRET: !!env.LARK_APP_SECRET,
      LARK_BASE_TOKEN: !!env.LARK_BASE_TOKEN,
      USER_TABLE_ID: !!env.USER_TABLE_ID,
      SPARE_LIST_TABLE_ID: !!env.SPARE_LIST_TABLE_ID,
      SPARE_ORDER_UAE_TABLE_ID: !!env.SPARE_ORDER_UAE_TABLE_ID,
      SPARE_ORDER_KSA_TABLE_ID: !!env.SPARE_ORDER_KSA_TABLE_ID,
      REPAIR_UAE_TABLE_ID: !!env.REPAIR_UAE_TABLE_ID,
      REPAIR_KSA_TABLE_ID: !!env.REPAIR_KSA_TABLE_ID,
      PORTAL_NOTES_TABLE_ID: !!env.PORTAL_NOTES_TABLE_ID,
      R2_PUBLIC_URL: !!env.R2_PUBLIC_URL,
      R2: !!env.R2
    }});
  }

  // Block public user dump.
  if (p === "/api/users") return json({ error: "Forbidden" }, 403);

  if (p === "/api/login" && req.method === "POST") {
    const b = await readBody(req);
    const email = lower(b.username || b.email);
    const pass = norm(b.password);
    const rows = await listRecords(env, env.USER_TABLE_ID);
    const rec = rows.find(r => userEmail(r.fields || {}) === email);
    if (!rec) return json({ error: "Invalid login: email not found" }, 401);
    if (userPassword(rec.fields || {}) !== pass) return json({ error: "Invalid login: password mismatch" }, 401);
    return json({ ok: true, user: publicUser(rec) });
  }

  if (p === "/api/dealers") {
    return json(await listRecords(env, env.USER_TABLE_ID));
  }

  if (p === "/api/spares" || p === "/api/spare-list") {
    return json(await listRecords(env, env.SPARE_LIST_TABLE_ID));
  }

  if (p === "/api/portal-notes") {
    return json(await listRecords(env, env.PORTAL_NOTES_TABLE_ID));
  }

  if (p === "/api/my-orders") {
    const country = norm(url.searchParams.get("country"));
    const email = norm(url.searchParams.get("email"));
    const role = norm(url.searchParams.get("role"));
    const rows = [];
    const q = lower(country);
    if (!q || q.includes("uae")) rows.push(...(await listRecords(env, env.SPARE_ORDER_UAE_TABLE_ID)).map(r => withSpareMeta(env, env.SPARE_ORDER_UAE_TABLE_ID, r)));
    if (!q || q.includes("ksa")) rows.push(...(await listRecords(env, env.SPARE_ORDER_KSA_TABLE_ID)).map(r => withSpareMeta(env, env.SPARE_ORDER_KSA_TABLE_ID, r)));
    return json(filterOwn(rows, email, role));
  }

  if (p === "/api/my-repairs" || p === "/api/repair-status") {
    const country = norm(url.searchParams.get("country"));
    const email = norm(url.searchParams.get("email"));
    const role = norm(url.searchParams.get("role"));
    const rows = [];
    const q = lower(country);
    if (!q || q.includes("uae")) rows.push(...(await listRecords(env, env.REPAIR_UAE_TABLE_ID)).map(r => withRepairMeta(env, env.REPAIR_UAE_TABLE_ID, r)));
    if (!q || q.includes("ksa")) rows.push(...(await listRecords(env, env.REPAIR_KSA_TABLE_ID)).map(r => withRepairMeta(env, env.REPAIR_KSA_TABLE_ID, r)));
    return json(filterOwn(rows, email, role));
  }

  if ((p === "/api/submit-spare" || p === "/api/spare-order") && req.method === "POST") {
    const b = await readBody(req);
    const country = norm(b.country || "UAE & Other Region");
    const tableId = spareTable(env, country);
    const items = b.items || b.cart || [];
    const no = makeSpareOrderNo(country);

    const fields = {
      "Spare Order Case": no,
      "Spare Order No": no,
      "Company Name": b.companyName || "",
      "Contact Name": b.contactName || "",
      "Contact Email": b.contactEmail || b.email || "",
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

    const excelFileName = `${no}.xls`;
    const excelData = htmlExcelBytes(no, fields, items);
    const fileUrl = await putR2(env, getOrderFolderKey(no, "order.xls"), excelData, "application/vnd.ms-excel");
    fields.Remarks = fields.Remarks ? `${fields.Remarks}\nOrder File URL: ${fileUrl}` : `Order File URL: ${fileUrl}`;

    const fieldTypes = await getFieldTypes(env, tableId);
    const sendFields = {};
    for (const [k, v] of Object.entries(fields)) if (fieldTypes[k]) sendFields[k] = v;
    const result = await createRecord(env, tableId, sendFields);
    const recordId = result.data?.record?.record_id || result.data?.record_id;

    let orderFileUpload = null;
    try {
      orderFileUpload = await attachOrderExcelToLark(env, tableId, recordId, excelData, excelFileName);
    } catch (e) {
      orderFileUpload = { ok: false, error: e.message || String(e) };
    }

    return json({ ok: true, orderNo: no, r2ExcelUrl: fileUrl, r2OrderFileUrl: fileUrl, orderFileUpload, result: result.data });
  }

  if ((p === "/api/create-repair" || p === "/api/repair-case") && req.method === "POST") {
    const b = await readBody(req);
    const country = norm(b.country || "UAE & Other Region");
    const tableId = repairTable(env, country);
    const prefix = lower(country).includes("ksa") ? "KSARMA" : "DXBRMA";
    const no = `${prefix}REPAIR${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}`;

    const fields = {
      "Repair Case No": no,
      "Spare Order Case": no,
      "Company Name": b.companyName || "",
      "Contact Name": b.contactName || "",
      "Contact Person": b.contactName || "",
      "Contact Email": b.contactEmail || b.email || "",
      "Country": country,
      "Status": "Submitted",
      "Product Name": b.productName || b.model || "",
      "Serial No": b.serialNo || b.serial || "",
      "Issue Description": b.issueDescription || b.issue || b.description || "",
      "Notes": b.notes || "",
      "Remarks": b.remarks || ""
    };

    const fieldTypes = await getFieldTypes(env, tableId);
    const sendFields = {};
    for (const [k, v] of Object.entries(fields)) if (fieldTypes[k]) sendFields[k] = v;
    const result = await createRecord(env, tableId, sendFields);
    return json({ ok: true, repairNo: no, caseNo: no, result: result.data });
  }

  if (p === "/api/upload-invoice" && req.method === "POST") {
    const b = await readBody(req);
    const no = await resolveOrderNoForUpload(env, b);
    if (!no) return json({ error: "Missing orderNo" }, 400);
    const name = b.file?.name || "invoice.pdf";
    const ext = name.includes(".") ? name.split(".").pop() : "pdf";
    const fileUrl = await putR2(env, getOrderFolderKey(no, `invoice.${ext}`), bytesFromDataUrl(b.file?.data), b.file?.type || "application/pdf");
    if (b.record_id && b.tableId) {
      const fieldTypes = await getFieldTypes(env, b.tableId);
      await updateRecord(env, b.tableId, b.record_id, { "Invoice Download": fieldTypes["Invoice Download"] === 15 ? larkUrl(fileUrl, "Invoice Download") : fileUrl });
    }
    return json({ ok: true, orderNo: no, url: fileUrl });
  }

  if (p === "/api/upload-payment-receipt" && req.method === "POST") {
    const b = await readBody(req);
    const no = await resolveOrderNoForUpload(env, b);
    if (!no) return json({ error: "Missing orderNo" }, 400);
    const name = b.file?.name || "payment-receipt.pdf";
    const ext = name.includes(".") ? name.split(".").pop() : "pdf";
    const fileUrl = await putR2(env, getOrderFolderKey(no, `payment-receipt.${ext}`), bytesFromDataUrl(b.file?.data), b.file?.type || "application/pdf");
    if (b.record_id && b.tableId) {
      const fieldTypes = await getFieldTypes(env, b.tableId);
      await updateRecord(env, b.tableId, b.record_id, { "Payment Receipt": fieldTypes["Payment Receipt"] === 15 ? larkUrl(fileUrl, "Payment Receipt") : fileUrl });
    }
    return json({ ok: true, orderNo: no, url: fileUrl });
  }

  if (p === "/api/update-status" && req.method === "POST") {
    const b = await readBody(req);
    if (!b.tableId || !b.record_id) return json({ error: "Missing tableId/record_id" }, 400);
    await updateRecord(env, b.tableId, b.record_id, { Status: b.status });
    return json({ ok: true });
  }

  if (p === "/api/delete-order" && req.method === "POST") {
    const b = await readBody(req);
    if (!b.tableId || !b.record_id) return json({ error: "Missing tableId/record_id" }, 400);
    await deleteRecord(env, b.tableId, b.record_id);
    return json({ ok: true });
  }

  if (p === "/api/download-order-excel") {
    const tableId = norm(url.searchParams.get("tableId"));
    const recordId = norm(url.searchParams.get("record_id"));
    const rec = await getRecord(env, tableId, recordId);
    const fields = rec.fields || {};
    const no = spareOrderNo(fields) || norm(url.searchParams.get("orderNo"));
    if (!no) return json({ error: "Missing order number" }, 400);
    const fileUrl = `${String(env.R2_PUBLIC_URL || "").replace(/\/+$/, "")}/${getOrderFolderKey(no, "order.xls")}`;
    return Response.redirect(fileUrl, 302);
  }


return json({ error: "API not found", path: p }, 404);
}

export async function onRequest(context) {
  try {
    return await handle(context.request, context.env);
  } catch (e) {
    return json({ error: e.message || String(e) }, 500);
  }
}
