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

async function getRecord(env, tableId, recordId) {
  if (!tableId || !recordId) throw new Error("Missing tableId or record_id");
  const data = await larkFetch(env, `/bitable/v1/apps/${env.LARK_BASE_TOKEN}/tables/${tableId}/records/${recordId}`);
  return data.data?.record || data.data;
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


function backendCleanPrice(v) {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function backendPriceLabel(prefix, currency) {
  return `${prefix} ${currency} (Without Tax & Duty)`;
}
function backendItemUnitPrice(item, currency) {
  const c = norm(currency || item.selectedCurrency || item.currency || "USD").toUpperCase();
  if (c === "AED") return backendCleanPrice(item.unitPrice ?? item.priceAED ?? item["AED (Without Tax & Duty)"]);
  if (c === "SAR") return backendCleanPrice(item.unitPrice ?? item.priceSAR ?? item["SAR (Without Tax & Duty)"]);
  return backendCleanPrice(item.unitPrice ?? item.priceUSD ?? item["Price (USD ) Without Tax & Duty"] ?? item.price);
}

function csvBytes(caseNo, fields, items) {
  const currency = norm(fields["Invoice Currency"] || "USD").toUpperCase();
  const rows = [
    ["Case No", caseNo],
    ["Company Name", fields["Company Name"] || ""],
    ["Contact Name", fields["Contact Name"] || fields["Contact Person"] || ""],
    ["Billing Address", fields["Billing Address"] || fields["Invoice Address"] || ""],
    ["Country", fields.Country || ""],
    ["Invoice Currency", currency],
    [],
    ["Material Code", "Material Name", "Compatible Model", "Qty", backendPriceLabel("Unit Price", currency), backendPriceLabel("Total", currency)],
    ...(items || []).map(i => {
      const qty = backendCleanPrice(i.qty || i.Qty || 1) || 1;
      const unit = backendItemUnitPrice(i, currency);
      return [
        i.materialCode || i["Material Code"] || "",
        i.materialName || i["Material Name"] || "",
        i.compatibleModel || i["Compatible Model"] || "",
        qty,
        unit.toFixed(2),
        (unit * qty).toFixed(2)
      ];
    })
  ];
  const csv = rows.map(r => r.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
  return new TextEncoder().encode(csv);
}

async function resolveOrderNoForUpload(env, b) {
  let no = "";
  if (b.tableId && b.record_id) {
    const rec = await getRecord(env, b.tableId, b.record_id);
    no = spareOrderNo(rec.fields || {});
  }
  if (!no) no = norm(b.orderNo || b.caseNo);
  return assertValidSpareOrderNo(no);
}




function makeSpareOrderNo(country) {
  const d = new Date();
  const pad = n => String(n).padStart(2, "0");
  const date = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
  const seq = `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`;
  const c = lower(country);
  const prefix = (c.includes("ksa") || c.includes("saudi")) ? "KSARMASPARE" : "DXBRMASPARE";
  return `${prefix}${date}${seq}`;
}

function isValidSpareOrderNo(no) {
  const s = norm(no);
  return /^DXBRMASPARE\d{12}$/.test(s) || /^KSARMASPARE\d{12}$/.test(s);
}

function assertValidSpareOrderNo(no) {
  if (!isValidSpareOrderNo(no)) {
    throw new Error("Invalid spare order number. Expected DXBRMASPAREYYYYMMDD0000 or KSARMASPAREYYYYMMDD0000, got: " + norm(no));
  }
  return norm(no);
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
  const no = assertValidSpareOrderNo(orderNo);
  return `aeronex-orders/${no}/${fileName}`;
}

function htmlExcelBytes(orderNo, fields, items) {
  const escHtml = v => String(v ?? "").replace(/[&<>"]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[s]));
  const currency = norm(fields["Invoice Currency"] || "USD").toUpperCase();
  const itemRows = (items || []).map((i, idx) => {
    const qty = backendCleanPrice(i.qty || i.Qty || 1) || 1;
    const unit = backendItemUnitPrice(i, currency);
    const total = unit * qty;
    return `
    <tr>
      <td>${idx + 1}</td>
      <td>${escHtml(i.materialCode || i["Material Code"] || "")}</td>
      <td>${escHtml(i.materialName || i["Material Name"] || "")}</td>
      <td>${escHtml(i.compatibleModel || i["Compatible Model"] || "")}</td>
      <td>${escHtml(qty)}</td>
      <td>${escHtml(unit.toFixed(2))}</td>
      <td>${escHtml(total.toFixed(2))}</td>
    </tr>`;
  }).join("");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
body{font-family:Arial,sans-serif}h1{font-size:20px;color:#1f3b8a}table{border-collapse:collapse;width:100%}th{background:#1f3b8a;color:#fff}th,td{border:1px solid #777;padding:8px;text-align:left}.meta th{width:220px}
</style></head><body>
<h1>AERO NEX Spare Order</h1>
<table class="meta">
<tr><th>Spare Order No</th><td>${escHtml(orderNo)}</td></tr>
<tr><th>Company Name</th><td>${escHtml(fields["Company Name"])}</td></tr>
<tr><th>Contact Name</th><td>${escHtml(fields["Contact Name"] || fields["Contact Person"])}</td></tr>
<tr><th>Billing Address</th><td>${escHtml(fields["Billing Address"] || fields["Invoice Address"])}</td></tr>
<tr><th>Country</th><td>${escHtml(fields.Country)}</td></tr>
<tr><th>Invoice Currency</th><td>${escHtml(currency)}</td></tr>
<tr><th>Status</th><td>${escHtml(fields.Status || "Submitted")}</td></tr>
</table>
<h2>Spare Parts</h2>
<table><thead><tr><th>No</th><th>Material Code</th><th>Material Name</th><th>Compatible Model</th><th>Qty</th><th>${escHtml(backendPriceLabel("Unit Price", currency))}</th><th>${escHtml(backendPriceLabel("Total", currency))}</th></tr></thead>
<tbody>${itemRows || '<tr><td colspan="7">No items</td></tr>'}</tbody></table>
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

function toLarkDateTimeValue(v) {
  const s = norm(v);
  if (!s) return "";
  if (/^\d+$/.test(s)) return Number(s);

  let d = null;

  // Browser date input: 2026-05-04
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0));

  // Display style sometimes received from UI: 04-May-2026
  if (!d) {
    m = s.match(/^(\d{1,2})-([A-Za-z]{3,})-(\d{4})$/);
    if (m) {
      const months = {jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,sept:8,oct:9,nov:10,dec:11};
      const mon = months[m[2].toLowerCase()];
      if (mon !== undefined) d = new Date(Date.UTC(Number(m[3]), mon, Number(m[1]), 0, 0, 0));
    }
  }

  // Fallback parse for ISO or browser accepted strings.
  if (!d) {
    const parsed = new Date(s);
    if (!Number.isNaN(parsed.getTime())) d = parsed;
  }

  if (!d || Number.isNaN(d.getTime())) return s;
  return d.getTime();
}

function toLarkUrlValue(v, text = "Open Link") {
  const s = norm(v);
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return { link: s, text };
  return s;
}


function dealerRepairCaseNo(fields){return fields["Case Register No"]||fields["Dealer Repair Case No"]||fields["Case No"]||""}
function isDealerRepairLocked(status){const s=norm(status);return s==="Repaired & Returned"||s==="Not Repair & Returned"}
function dealerRepairCanAccess(company,role,recordFields){if(canSeeAll(role))return true;const uc=norm(company),rc=norm((recordFields||{})["Company Name"]);return uc&&rc&&lower(uc)===lower(rc)}
function parseDealerRepairMaterialsText(s){return String(s||"").split(";").map(x=>x.trim()).filter(Boolean).map(x=>{const m=x.match(/^(.*?)\s*-\s*(.*?)\s+x\s*([0-9.]+)$/i);if(m)return{materialCode:m[1].trim(),materialName:m[2].trim(),qty:m[3].trim()};const m2=x.match(/^(.*?)\s+x\s*([0-9.]+)$/i);if(m2)return{materialCode:"",materialName:m2[1].trim(),qty:m2[2].trim()};return{materialCode:"",materialName:x,qty:1}})}
function formatDealerRepairMaterials(items){return(items||[]).map(i=>{const code=norm(i.materialCode||i["Material Code"]||"CUSTOM")||"CUSTOM";const name=norm(i.materialName||i["Material Name"]||"");const qty=norm(i.qty||i.Qty||1)||"1";return`${code} - ${name} x${qty}`}).join("; ")}
function dealerRepairExcelBytes(caseNo,fields){const escHtml=v=>String(v??"").replace(/[&<>"]/g,s=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[s]));const materials=parseDealerRepairMaterialsText(fields["Material Replaced"]||"");const rows=materials.map((i,idx)=>`<tr><td>${idx+1}</td><td>${escHtml(i.materialCode||"CUSTOM")}</td><td>${escHtml(i.materialName||"")}</td><td>${escHtml(i.qty||1)}</td></tr>`).join("");const html=`<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif}h1{font-size:20px;color:#1f3b8a}table{border-collapse:collapse;width:100%}th{background:#1f3b8a;color:#fff}th,td{border:1px solid #777;padding:8px;text-align:left}.meta th{width:230px}</style></head><body><h1>AERO NEX Dealer Repair Case</h1><table class="meta"><tr><th>Case Register No</th><td>${escHtml(caseNo)}</td></tr><tr><th>Company Name</th><td>${escHtml(fields["Company Name"])}</td></tr><tr><th>Model No</th><td>${escHtml(fields["Model No"])}</td></tr><tr><th>Serial No</th><td>${escHtml(fields["Serial No"])}</td></tr><tr><th>Activation Date / Invoice Date</th><td>${escHtml(fields["Activation Date / Invoice Date"])}</td></tr><tr><th>Technician Name</th><td>${escHtml(fields["Technician Name"])}</td></tr><tr><th>Repair Type</th><td>${escHtml(fields["Repair Type"])}</td></tr><tr><th>Repair Status</th><td>${escHtml(fields["Repair Status"])}</td></tr><tr><th>Upload Repair Data</th><td>${escHtml(fields["Upload Repair Data"])}</td></tr></table><h2>Device Issue</h2><p>${escHtml(fields["Device Issue"])}</p><h2>Technician Note</h2><p>${escHtml(fields["Technician Note"])}</p><h2>Material Replaced</h2><table><thead><tr><th>No</th><th>Material Code</th><th>Material Name</th><th>Qty</th></tr></thead><tbody>${rows||'<tr><td colspan="4">No materials</td></tr>'}</tbody></table></body></html>`;return new TextEncoder().encode(html)}
async function resolveDealerRepairNo(env){const d=new Date();const ymd=d.getFullYear()+String(d.getMonth()+1).padStart(2,"0")+String(d.getDate()).padStart(2,"0");const prefix=`DRC${ymd}`;const rows=await listRecords(env,env.DEALER_REPAIR_CASE_TABLE_ID);let max=0;for(const r of rows||[]){const no=dealerRepairCaseNo(r.fields||{});if(String(no).startsWith(prefix)){const n=Number(String(no).slice(prefix.length));if(Number.isFinite(n)&&n>max)max=n}}return prefix+String(max+1).padStart(4,"0")}

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

  if (p === "/api/change-password" && req.method === "POST") {
    const b = await readBody(req);
    const email = lower(b.email);
    const currentPassword = norm(b.currentPassword);
    const newPassword = norm(b.newPassword);

    if (!email || !currentPassword || !newPassword) {
      return json({ error: "Missing password details" }, 400);
    }

    const rows = await listRecords(env, env.USER_TABLE_ID);
    const rec = rows.find(r => userEmail(r.fields || {}) === email);

    if (!rec) return json({ error: "User not found" }, 404);

    if (userPassword(rec.fields || {}) !== currentPassword) {
      return json({ error: "Current password is incorrect" }, 401);
    }

    await updateRecord(env, env.USER_TABLE_ID, rec.record_id, {
      "Reset Password": newPassword
    });

    return json({ ok: true });
  }

  if (p === "/api/dealers") {
    return json(await listRecords(env, env.USER_TABLE_ID));
  }

  if (p === "/api/spares" || p === "/api/spare-list") {
    return json(await listRecords(env, env.SPARE_LIST_TABLE_ID));
  }


  if (p === "/api/dealer-repair-cases") {
    const company = norm(url.searchParams.get("company"));
    const role = norm(url.searchParams.get("role"));
    const rows = await listRecords(env, env.DEALER_REPAIR_CASE_TABLE_ID);
    return json((rows || []).filter(r => dealerRepairCanAccess(company, role, r.fields || {})));
  }

  if (p === "/api/create-dealer-repair-case" && req.method === "POST") {
    const b = await readBody(req);
    const companyName = norm(b.companyName);
    if (!companyName) return json({ error: "Company Name missing from user profile" }, 400);
    const caseNo = await resolveDealerRepairNo(env);
    const fields = {
      "Case Register No": caseNo,
      "Company Name": companyName,
      "Model No": b.modelNo || "",
      "Serial No": b.serialNo || "",
      "Activation Date / Invoice Date": b.activationDate || "",
      "Technician Name": b.technicianName || "",
      "Material Replaced": formatDealerRepairMaterials(b.parts || []),
      "Device Issue": b.deviceIssue || "",
      "Technician Note": b.technicianNote || "",
      "Repair Type": b.repairType || "Local Repair",
      "Upload Repair Data": b.uploadRepairData || "",
      "Repair Status": "Submitted"
    };
    const fieldTypes = await getFieldTypes(env, env.DEALER_REPAIR_CASE_TABLE_ID);
    const sendFields = {};
    for (const [k, v] of Object.entries(fields)) {
      if (fieldTypes[k] && v !== undefined && v !== null && v !== "") {
        sendFields[k] = fieldTypes[k] === 15 && k === "Upload Repair Data" ? toLarkUrlValue(v, "Upload Repair Data") : v;
      }
    }
    const rec = await createRecord(env, env.DEALER_REPAIR_CASE_TABLE_ID, sendFields);
    return json({ ok: true, caseNo, record: rec });
  }

  if (p === "/api/update-dealer-repair-case" && req.method === "POST") {
    const b = await readBody(req);
    const recordId = b.record_id || b.recordId;
    if (!recordId) return json({ error: "Missing record_id" }, 400);
    const companyName = norm(b.companyName);
    const role = norm(b.role);
    const rows = await listRecords(env, env.DEALER_REPAIR_CASE_TABLE_ID);
    const row = (rows || []).find(r => r.record_id === recordId);
    if (!row) return json({ error: "Dealer Repair Case not found" }, 404);
    if (!dealerRepairCanAccess(companyName, role, row.fields || {})) return json({ error: "Permission denied" }, 403);
    if (isDealerRepairLocked((row.fields || {})["Repair Status"])) return json({ error: "This case is closed and cannot be modified" }, 403);
    const fields = {
      "Model No": b.modelNo || "",
      "Serial No": b.serialNo || "",
      "Activation Date / Invoice Date": b.activationDate || "",
      "Technician Name": b.technicianName || "",
      "Material Replaced": formatDealerRepairMaterials(b.parts || []),
      "Device Issue": b.deviceIssue || "",
      "Technician Note": b.technicianNote || "",
      "Repair Type": b.repairType || "Local Repair",
      "Upload Repair Data": b.uploadRepairData || ""
    };
    const fieldTypes = await getFieldTypes(env, env.DEALER_REPAIR_CASE_TABLE_ID);
    const sendFields = {};
    for (const [k, v] of Object.entries(fields)) {
      if (fieldTypes[k]) sendFields[k] = fieldTypes[k] === 15 && k === "Upload Repair Data" ? toLarkUrlValue(v, "Upload Repair Data") : v;
    }
    const rec = await updateRecord(env, env.DEALER_REPAIR_CASE_TABLE_ID, recordId, sendFields);
    return json({ ok: true, caseNo: dealerRepairCaseNo(row.fields || {}), record: rec });
  }

  if (p === "/api/download-dealer-repair-case-excel") {
    const recordId = norm(url.searchParams.get("record_id"));
    const company = norm(url.searchParams.get("company"));
    const role = norm(url.searchParams.get("role"));
    const rows = await listRecords(env, env.DEALER_REPAIR_CASE_TABLE_ID);
    const row = (rows || []).find(r => r.record_id === recordId);
    if (!row) return json({ error: "Dealer Repair Case not found" }, 404);
    if (!dealerRepairCanAccess(company, role, row.fields || {})) return json({ error: "Permission denied" }, 403);
    const caseNo = dealerRepairCaseNo(row.fields || {}) || norm(url.searchParams.get("caseNo")) || "dealer-repair-case";
    return new Response(dealerRepairExcelBytes(caseNo, row.fields || {}), { headers: { "content-type": "application/vnd.ms-excel; charset=utf-8", "content-disposition": `attachment; filename="${caseNo}.xls"` } });
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


  if (p === "/api/debug-repair-fields") {
    const country = norm(url.searchParams.get("country") || "UAE & Other Region");
    const tableId = repairTable(env, country);
    const todayKey = new Date().toISOString().slice(0,10).replace(/-/g, "");

    const newEmail = lower(fields["Contact Email"] || "");
    const newSerial = lower(fields["Serial No"] || "");
    const newModel = lower(fields["Model No"] || "");

    const existingRows = await listRecords(env, tableId);

    const duplicate = existingRows.some(r => {
      const f = r.fields || {};

      const oldEmail = lower(
        f["Contact Email"] ||
        f["Username ( Email )"] ||
        f["Email"] ||
        ""
      );

      const oldSerial = lower(f["Serial No"] || "");
      const oldModel = lower(f["Model No"] || "");

      const caseNo = String(
        f["REPAIR CASE"] ||
        f["Repair Case No"] ||
        f["Repair Case"] ||
        ""
      );

      let createdKey = "";

      const caseDateMatch = caseNo.match(/20\d{6}/);
      if (caseDateMatch) createdKey = caseDateMatch[0];

      if (!createdKey && r.created_time) {
        const d = new Date(Number(r.created_time));
        if (!isNaN(d.getTime())) {
          createdKey = d.toISOString().slice(0,10).replace(/-/g, "");
        }
      }

      return oldEmail === newEmail &&
             oldSerial === newSerial &&
             oldModel === newModel &&
             createdKey === todayKey;
    });

    if (duplicate) {
      return json(
        { error: "Duplicate repair case detected. Same model and serial number was already submitted today." },
        409
      );
    }

    const fieldTypes = await getFieldTypes(env, tableId);
    return json({ ok: true, tableId, fields: Object.keys(fieldTypes) });
  }

  if ((p === "/api/submit-spare" || p === "/api/spare-order") && req.method === "POST") {
    const b = await readBody(req);
    const country = norm(b.country || "UAE & Other Region");
    const tableId = spareTable(env, country);
    const items = b.items || b.cart || [];

    // Temporary fallback only. Lark row is the authority for final order number.
    const fallbackNo = makeSpareOrderNo(country);

    const fields = {
      "Spare Order Case": fallbackNo,
      "Spare Order No": fallbackNo,
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

    const fieldTypes = await getFieldTypes(env, tableId);
    const sendFields = {};
    for (const [k, v] of Object.entries(fields)) if (fieldTypes[k]) sendFields[k] = v;

    // Step 1: create Lark row first.
    const result = await createRecord(env, tableId, sendFields);
    const recordId = result.data?.record?.record_id || result.data?.record_id;
    if (!recordId) throw new Error("Lark record created but record_id was not returned");

    // Step 2: fetch Lark row and use Lark's final order number.
    let saved = await getRecord(env, tableId, recordId);
    let savedFields = saved.fields || {};
    let no = spareOrderNo(savedFields) || fallbackNo;
    no = assertValidSpareOrderNo(no);

    // Step 3: generate Excel using the same final Lark order number and the original item list.
    const finalFields = { ...fields, ...savedFields, "Spare Order Case": no, "Spare Order No": no };
    const excelFileName = `${no}.xls`;
    const excelData = htmlExcelBytes(no, finalFields, items);
    const fileUrl = await putR2(env, getOrderFolderKey(no, "order.xls"), excelData, "application/vnd.ms-excel");

    // Step 4: update Lark row with the same Order File and URL remark.
    let orderFileUpload = null;
    try {
      orderFileUpload = await attachOrderExcelToLark(env, tableId, recordId, excelData, excelFileName);
    } catch (e) {
      orderFileUpload = { ok: false, error: e.message || String(e) };
    }

    const updateFields = {};
// Only update order number fields if they are writable. Formula/autonumber fields may ignore or reject; errors are non-fatal.
    if (fieldTypes["Spare Order Case"]) updateFields["Spare Order Case"] = no;
    if (fieldTypes["Spare Order No"]) updateFields["Spare Order No"] = no;
    if (Object.keys(updateFields).length) {
      try { await updateRecord(env, tableId, recordId, updateFields); } catch (_) {}
    }

    return json({ ok: true, orderNo: no, r2ExcelUrl: fileUrl, r2OrderFileUrl: fileUrl, orderFileUpload, result: result.data });
  }

  if ((p === "/api/create-repair" || p === "/api/repair-case") && req.method === "POST") {
    const b = await readBody(req);
    const country = norm(b.country || "UAE & Other Region");
    const tableId = repairTable(env, country);
    const prefix = lower(country).includes("ksa") ? "KSARMA" : "DXBRMA";
    const no = `${prefix}${new Date().toISOString().replace(/\D/g, "").slice(0, 12)}`;

    const uploadRequiredLink = b.requiredDetailsLink || b.uploadRequiredDetailsLink || b.uploadAllRequiredDetailsLink || "";
    const logLink = b.logFileLink || b.logFile || "";
    const issueMediaLink = b.issueMediaLink || "";
    const gacaValue = b.gacaDocument?.data || b.gacaDocument || "";

    const fields = {
      "REPAIR CASE": no,
      "Repair Case No": no,
      "Repair Case": no,
      "Spare Order Case": no,

      "Company Name": b.companyName || "",
      "Name": b.companyName || "",
      "Contact Name": b.contactName || "",
      "Contact": b.contactName || "",
      "Contact Person": b.contactName || "",
      "Contact Person": b.contactName || "",
      "Contact Email": b.contactEmail || b.email || "",

      "Address ( Receiver Info )": b.address || b.receiverAddress || "",
      "Receiver Address": b.address || b.receiverAddress || "",
      "Address": b.address || b.receiverAddress || "",
      "Receiver Address": b.address || b.receiverAddress || "",

      "Country": country,
      "Model No": b.modelNo || b.model || "",
      "Serial No": b.serialNo || b.serial || "",
      "Date of Purchase / Activation date": b.purchaseDate || b.activationDate || b.date || "",
      "Date Of Activation": b.purchaseDate || b.activationDate || b.date || "",

      "Details Of Issue": b.details || b.issueDescription || b.issue || b.description || "",
      "Issue Description": b.details || b.issueDescription || b.issue || b.description || "",

      "Upload all the required details link": uploadRequiredLink,
      "Upload all the required details": uploadRequiredLink,
      "Upload all required details link": uploadRequiredLink,
      "Required Details Link": uploadRequiredLink,

      "Log File": logLink,
      "Log File Link": logLink,
      "Log for Drone and RC Link": logLink,

      "Issue Video and Pictures Link": issueMediaLink,

      "GACA Document": gacaValue,
      "Warranty Status": b.warrantyStatus || "",

      "Remarks": b.remarks || "",
      "Notes": b.notes || "",
      "Status": "Submitted"
    };

    const fieldTypes = await getFieldTypes(env, tableId);
    const urlFieldNames = new Set([
      "Upload all the required details link",
      "Upload all the required details",
      "Upload all required details link",
      "Required Details Link",
      "Log File",
      "Log File Link",
      "Log for Drone and RC Link",
      "Issue Video and Pictures Link"
    ]);
    const sendFields = {};
    for (const [k, v] of Object.entries(fields)) {
      if (fieldTypes[k] && v !== undefined && v !== null && v !== "") {
        sendFields[k] = fieldTypes[k] === 5
          ? toLarkDateTimeValue(v)
          : (fieldTypes[k] === 15 || urlFieldNames.has(k) ? toLarkUrlValue(v, k) : v);
      }
    }

    const result = await createRecord(env, tableId, sendFields);
    return json({ ok: true, repairNo: no, caseNo: no, result: result.data, sentFields: Object.keys(sendFields) });
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
    return json({ ok: true, url: fileUrl });
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
    return json({ ok: true, url: fileUrl });
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
