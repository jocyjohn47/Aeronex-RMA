const H = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "https://rma-spare.aeronex.ae",
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
  if (!res.ok || data.code) {
    await writeErrorLog(env, { source:"larkFetch", method:init.method || "GET", path, status:res.status, response:data });
    throw new Error("Lark API error: " + JSON.stringify(data));
  }
  return data;
}


async function larkFetchRaw(env, path, init = {}) {
  const token = await larkToken(env);
  const res = await fetch("https://open.larksuite.com/open-apis" + path, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.headers || {})
    }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.code) {
    await writeErrorLog(env, { source:"larkFetchRaw", method:init.method || "GET", path, status:res.status, response:data });
    throw new Error("Lark API error: " + JSON.stringify(data));
  }
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


async function getFieldMetaByName(env, tableId) {
  const data = await larkFetch(env, `/bitable/v1/apps/${env.LARK_BASE_TOKEN}/tables/${tableId}/fields`);
  const out = {};
  for (const f of data.data?.items || []) out[f.field_name] = f;
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


function internalRepairTable(env, country) {
  return lower(country).includes("ksa") ? env.INTERNAL_REPAIR_KSA_TABLE_ID : env.INTERNAL_REPAIR_UAE_TABLE_ID;
}

function normalizePortalCountry(v) {
  const s = lower(v || "");
  if (s.includes("ksa") || s.includes("saudi")) return "KSA - SAUDI ARABIA";
  return "UAE & Other Region";
}
function scopedModuleCountry(role, requestedCountry, userCountry) {
  const r = lower(role);
  if (r.includes("admin")) return norm(requestedCountry || "UAE & Other Region");
  return normalizePortalCountry(userCountry || requestedCountry || "UAE & Other Region");
}


function internalRepairCountryKey(country) {
  return lower(country).includes("ksa") ? "KSA" : "UAE";
}

function normalizeLarkOptionValue(v, type) {
  if (v === undefined || v === null) return "";
  if (type === 4) {
    if (Array.isArray(v)) return v.filter(x => x !== undefined && x !== null && String(x).trim() !== "");
    return String(v).split(",").map(x => x.trim()).filter(Boolean);
  }
  if (type === 5) return toLarkDateTimeValue(v);
  return v;
}

function prepareFieldsForTable(fieldTypes, fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields || {})) {
    if (!fieldTypes[k]) continue;
    if (v === undefined || v === null || v === "") continue;
    const val = normalizeLarkOptionValue(v, fieldTypes[k]);
    if (val === "" || (Array.isArray(val) && !val.length)) continue;
    out[k] = val;
  }
  return out;
}

async function updateRecordBestEffort(env, tableId, recordId, fields) {
  try {
    await updateRecord(env, tableId, recordId, fields);
    return { ok:true, updated:Object.keys(fields), skipped:[] };
  } catch (bulkErr) {
    const updated = [];
    const skipped = [];
    for (const [k, v] of Object.entries(fields || {})) {
      try {
        await updateRecord(env, tableId, recordId, { [k]: v });
        updated.push(k);
      } catch (e) {
        skipped.push({ field:k, error:String(e.message || e) });
      }
    }
    if (!updated.length) {
      throw new Error("No fields saved. First error: " + (skipped[0]?.error || bulkErr.message || bulkErr));
    }
    return { ok:true, partial:true, updated, skipped };
  }
}
async function createRecordBestEffort(env, tableId, fields) {
  return createRecord(env, tableId, fields);
}


function fieldMetaMap(fields) {
  const out = {};
  for (const f of fields || []) out[f.field_name] = f;
  return out;
}

function internalRepairFieldNames(country) {
  const isKsa = lower(country).includes("ksa");
  return {
    warranty: isKsa ? "Warranty Status" : "Warranry Status",
    material: isKsa ? "Material Consumed" : "Material  Consumed",
    remark: isKsa ? "Remarks" : "Remark",
    djiRepairStatus: isKsa ? "DJI Repair status" : "DJI Repair Status",
    sendTracking: isKsa ? "Shipping Tracking No - Sending" : "Shiping Tracking No-Sending",
    receiveTracking: "Shiping Tracking No -Receiving",
    receiveCost: isKsa ? "Shipping Cost - Receiving From DJI" : "Shipment Cost - Receive from DJI"
  };
}

async function listInternalRepairRows(env, country) {
  const tableId = internalRepairTable(env, country);
  if (!tableId) return [];
  return (await listRecords(env, tableId)).map(r => ({ ...r, _table_id: tableId }));
}

async function listSpareOrderDetailsRows(env) {
  if (!env.SPARE_ORDER_DETAILS_TABLE_ID) return [];
  return (await listRecords(env, env.SPARE_ORDER_DETAILS_TABLE_ID)).map(r => ({ ...r, _table_id: env.SPARE_ORDER_DETAILS_TABLE_ID }));
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

function repairCompanyKey(v) {
  return lower(v || "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");
}

function filterOwnRepairs(rows, email, role, companyName, contactName) {
  if (canSeeAll(role)) return rows;

  const userCompany = repairCompanyKey(companyName);
  const e = lower(email || "");

  return rows.filter(r => {
    const f = r.fields || {};

    // Primary dealer matching: Company Name / Dealer Name
    const rowCompany = repairCompanyKey(
      f["Company Name"] ||
      f["Dealer Name"] ||
      f["Customer Name"] ||
      ""
    );

    if (userCompany && rowCompany) {
      return rowCompany === userCompany ||
             rowCompany.includes(userCompany) ||
             userCompany.includes(rowCompany);
    }

    // Fallback only for older rows where company is missing.
    if (e) {
      return lower(
        f["Contact Email"] ||
        f["Username ( Email )"] ||
        f.Email ||
        f["Dealer email"] ||
        ""
      ) === e;
    }

    return false;
  });
}


function spareCompanyKey(v) {
  return lower(v || "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");
}

function filterOwnSpareOrders(rows, email, role, companyName, contactName) {
  const r = lower(role);

  // Admin and Technician see all spare orders from the selected country table(s).
  if (r.includes("admin") || r.includes("technician") || r.includes("technicain") || r.includes("techncian") || r.includes("tech")) {
    return rows;
  }

  const userCompany = spareCompanyKey(companyName);
  if (!userCompany) return [];

  return rows.filter(row => {
    const f = row.fields || {};
    const rowCompany = spareCompanyKey(
      f["Company Name"] ||
      f["Dealer Name"] ||
      f["Customer Name"] ||
      ""
    );

    if (!rowCompany) return false;

    return rowCompany === userCompany ||
           rowCompany.includes(userCompany) ||
           userCompany.includes(rowCompany);
  });
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

async function uploadBitableAttachmentToLark(env, tableId, recordId, fieldId, file) {
  // Upload the file to Lark Drive as a bitable_file, then write the returned
  // file_token into the Bitable attachment field. This is the same stable
  // method used by the spare order Excel upload.
  const name = file?.name || "document";
  const bytes = bytesFromDataUrl(file?.data);
  if (!bytes || !bytes.length) throw new Error("Empty file data for " + name);
  const fileToken = await larkUploadBitableAttachment(env, bytes, name, file?.type || "application/octet-stream");
  return { file_token: fileToken, name };
}

function formatDealerRepairMaterials(items){return(items||[]).map(i=>{const code=norm(i.materialCode||i["Material Code"]||"CUSTOM")||"CUSTOM";const name=norm(i.materialName||i["Material Name"]||"");const qty=norm(i.qty||i.Qty||1)||"1";return`${code} - ${name} x${qty}`}).join("; ")}
function dealerRepairExcelBytes(caseNo,fields){const escHtml=v=>String(v??"").replace(/[&<>"]/g,s=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[s]));const materials=parseDealerRepairMaterialsText(fields["Material Replaced"]||"");const rows=materials.map((i,idx)=>`<tr><td>${idx+1}</td><td>${escHtml(i.materialCode||"CUSTOM")}</td><td>${escHtml(i.materialName||"")}</td><td>${escHtml(i.qty||1)}</td></tr>`).join("");const html=`<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif}h1{font-size:20px;color:#1f3b8a}table{border-collapse:collapse;width:100%}th{background:#1f3b8a;color:#fff}th,td{border:1px solid #777;padding:8px;text-align:left}.meta th{width:230px}</style></head><body><h1>AERO NEX Dealer Repair Case</h1><table class="meta"><tr><th>Case Register No</th><td>${escHtml(caseNo)}</td></tr><tr><th>Company Name</th><td>${escHtml(fields["Company Name"])}</td></tr><tr><th>Model No</th><td>${escHtml(fields["Model No"])}</td></tr><tr><th>Serial No</th><td>${escHtml(fields["Serial No"])}</td></tr><tr><th>Activation Date / Invoice Date</th><td>${escHtml(fields["Activation Date / Invoice Date"])}</td></tr><tr><th>Technician Name</th><td>${escHtml(fields["Technician Name"])}</td></tr><tr><th>Repair Type</th><td>${escHtml(fields["Repair Type"])}</td></tr><tr><th>Repair Status</th><td>${escHtml(fields["Repair Status"])}</td></tr><tr><th>Upload Repair Data</th><td>${escHtml(fields["Upload Repair Data"])}</td></tr></table><h2>Device Issue</h2><p>${escHtml(fields["Device Issue"])}</p><h2>Technician Note</h2><p>${escHtml(fields["Technicain Note"])}</p><h2>Material Replaced</h2><table><thead><tr><th>No</th><th>Material Code</th><th>Material Name</th><th>Qty</th></tr></thead><tbody>${rows||'<tr><td colspan="4">No materials</td></tr>'}</tbody></table></body></html>`;return new TextEncoder().encode(html)}
async function resolveDealerRepairNo(env){const d=new Date();const ymd=d.getFullYear()+String(d.getMonth()+1).padStart(2,"0")+String(d.getDate()).padStart(2,"0");const prefix=`DRC${ymd}`;const rows=await listRecords(env,env.DEALER_REPAIR_CASE_TABLE_ID);let max=0;for(const r of rows||[]){const no=dealerRepairCaseNo(r.fields||{});if(String(no).startsWith(prefix)){const n=Number(String(no).slice(prefix.length));if(Number.isFinite(n)&&n>max)max=n}}return prefix+String(max+1).padStart(4,"0")}


function currentRoleCanAccessWarrantySoftware(role) {
  const r = lower(role);
  return r.includes("admin") ||
         r.includes("technician") ||
         r.includes("technicain") ||
         r.includes("techncian") ||
         r.includes("tech");
}
function warrantySoftwareMatchValue(fields, q) {
  const needle = lower(q);
  if (!needle) return false;
  const names = ["Serial Number","Serial No","Activation Code","Order No.","Order No","Order Number","Customer Name"];
  return names.some(n => lower(fieldText((fields || {})[n])).includes(needle));
}
function pickWarrantySoftwareFields(fields) {
  const out = {};
  const wanted = ["Serial Number","Serial No","Activation Code","Order No.","Order No","Order Number","Customer Name","Product Material Code","Product Model","Product Name","Shipping Date","Warranty Years","Aerocare Warranty","Warranty Status","Software Status","Remarks","Notes"];
  for (const k of wanted) if (fields && fields[k] !== undefined && fields[k] !== null && fieldText(fields[k]) !== "") out[k] = fields[k];
  return out;
}


function logAccessAllowed(role) {
  const r = lower(role);
  return r.includes("admin") ||
         r.includes("technician") ||
         r.includes("technicain") ||
         r.includes("techncian") ||
         r.includes("tech");
}

function logTableConfigs(env) {
  return [
    { key:"USER_TABLE_ID", name:"User & Company Details", tableId:env.USER_TABLE_ID || "" },
    { key:"SPARE_LIST_TABLE_ID", name:"Spare Part List", tableId:env.SPARE_LIST_TABLE_ID || "" },
    { key:"ORDER_UAE_TABLE_ID", name:"Spare Order UAE", tableId:env.ORDER_UAE_TABLE_ID || env.SPARE_ORDER_UAE_TABLE_ID || "" },
    { key:"ORDER_KSA_TABLE_ID", name:"Spare Order KSA", tableId:env.ORDER_KSA_TABLE_ID || env.SPARE_ORDER_KSA_TABLE_ID || "" },
    { key:"REPAIR_UAE_TABLE_ID", name:"Repair Case UAE", tableId:env.REPAIR_UAE_TABLE_ID || env.REPAIR_CASE_UAE_TABLE_ID || "" },
    { key:"REPAIR_KSA_TABLE_ID", name:"Repair Case KSA", tableId:env.REPAIR_KSA_TABLE_ID || env.REPAIR_CASE_KSA_TABLE_ID || "" },
    { key:"INTERNAL_REPAIR_UAE_TABLE_ID", name:"Internal Repair Register - UAE & Other Region", tableId:env.INTERNAL_REPAIR_UAE_TABLE_ID || "" },
    { key:"INTERNAL_REPAIR_KSA_TABLE_ID", name:"Internal Repair Register - KSA", tableId:env.INTERNAL_REPAIR_KSA_TABLE_ID || "" },
    { key:"SPARE_ORDER_DETAILS_TABLE_ID", name:"Spare Order Details", tableId:env.SPARE_ORDER_DETAILS_TABLE_ID || "" },
    { key:"DEALER_REPAIR_CASE_TABLE_ID", name:"Dealer Repair Case", tableId:env.DEALER_REPAIR_CASE_TABLE_ID || "" },
    { key:"WARRANTY_STATUS_TABLE_ID", name:"Warranty Status", tableId:env.WARRANTY_STATUS_TABLE_ID || "" },
    { key:"SOFTWARE_STATUS_TABLE_ID", name:"Software Status", tableId:env.SOFTWARE_STATUS_TABLE_ID || "" },
    { key:"FLYCART_CREDIT_USE_TABLE_ID", name:"Flycart Credit Use", tableId:env.FLYCART_CREDIT_USE_TABLE_ID || "" },
    { key:"PORTAL_NOTES_TABLE_ID", name:"Portal Notes", tableId:env.PORTAL_NOTES_TABLE_ID || "" }
  ];
}

function diagnosticFieldOptions(f) {
  const candidates = [
    f?.ui_property?.options,
    f?.ui_property?.option,
    f?.property?.options,
    f?.property?.option,
    f?.options,
    f?.option
  ];
  const raw = candidates.find(x => Array.isArray(x)) || [];
  return raw.map(o => {
    if (typeof o === "string") return o;
    if (!o || typeof o !== "object") return "";
    return String(o.name || o.text || o.value || o.label || o.id || "").trim();
  }).filter(Boolean);
}

async function getTableFieldsForDiagnostics(env, tableId) {
  const data = await larkFetch(env, `/bitable/v1/apps/${env.LARK_BASE_TOKEN}/tables/${tableId}/fields`);
  return (data.data?.items || []).map(f => {
    const options = diagnosticFieldOptions(f);
    return {
      field_name: f.field_name,
      type: f.type,
      options,
      optionCount: options.length
    };
  });
}

async function countRecordsForDiagnostics(env, tableId) {
  const data = await larkFetch(env, `/bitable/v1/apps/${env.LARK_BASE_TOKEN}/tables/${tableId}/records?page_size=1`);
  return data.data?.total ?? data.data?.items?.length ?? 0;
}

function expectedFieldsForDiagnostics(tableName) {
  const n = lower(tableName);
  if (n.includes("spare order")) return [
    "Spare Order Case","Company Name","Contact Name","Invoice Currency","Status",
    "Order File","Payment Receipt","Final Notes","Remarks","Shipment Tracking No",
    "Specialized","Spare Source"
  ];
  if (n.includes("internal repair register")) return [];
  if (n.includes("spare order details")) return [];
  if (n.includes("dealer repair")) return [
    "Case Register No","Company Name","Model No","Serial No","Activation Date / Invoice Date",
    "Technician Name","Material Replaced","Device Issue","Technicain Note","Repair Type",
    "Upload Repair Data","Repair Status"
  ];
  if (n.includes("repair case")) return ["Repair Case","Company Name","Model No","Serial No","Status"];
  if (n.includes("user")) return ["Company Name","Username ( Email )","User Role","Country"];
  if (n.includes("spare part")) return ["Material Code","Material Name"];
  if (n.includes("warranty")) return ["Serial Number","Order No.","Customer Name","Shipping Date"];
  if (n.includes("software")) return ["Activation Code","Order No.","Customer Name","Shipping Date"];
  return [];
}

function missingExpectedFields(expected, fields) {
  const existing = new Set((fields || []).map(f => lower(f.field_name)));
  return (expected || []).filter(x => !existing.has(lower(x)));
}

async function buildLarkTableDiagnostic(env, tableCfg) {
  const out = {
    tableName: tableCfg.name,
    envKey: tableCfg.key,
    tableId: tableCfg.tableId || "",
    configured: !!tableCfg.tableId,
    permission: "NOT_CONFIGURED",
    fieldCount: 0,
    recordCount: null,
    fields: [],
    missingExpectedFields: [],
    error: ""
  };
  if (!tableCfg.tableId) return out;
  try {
    const fields = await getTableFieldsForDiagnostics(env, tableCfg.tableId);
    out.fields = fields;
    out.fieldCount = fields.length;
    out.missingExpectedFields = missingExpectedFields(expectedFieldsForDiagnostics(tableCfg.name), fields);
    out.recordCount = await countRecordsForDiagnostics(env, tableCfg.tableId);
    out.permission = "OK";
  } catch (e) {
    out.permission = "ERROR";
    out.error = e.message || String(e);
  }
  return out;
}

async function writeErrorLog(env, entry) {
  try {
    if (!env.LOGS_BUCKET) return { ok:false, skipped:"LOGS_BUCKET not bound" };
    const now = new Date();
    const key = `logs/${now.toISOString().slice(0,10)}/${now.getTime()}-${Math.random().toString(36).slice(2)}.json`;
    await env.LOGS_BUCKET.put(key, JSON.stringify({
      ts: now.toISOString(),
      level: "ERROR",
      ...entry
    }, null, 2), { httpMetadata: { contentType: "application/json" } });
    return { ok:true, key };
  } catch (e) {
    return { ok:false, error:e.message || String(e) };
  }
}

async function listRecentErrorLogs(env, limit=50) {
  if (!env.LOGS_BUCKET) return { logs: [], warning: "LOGS_BUCKET not bound" };
  const listed = await env.LOGS_BUCKET.list({ prefix:"logs/", limit: Math.min(Math.max(Number(limit)||50, 1), 100) });
  const objs = (listed.objects || []).sort((a,b)=>String(b.uploaded||"").localeCompare(String(a.uploaded||""))).slice(0, limit);
  const logs = [];
  for (const obj of objs) {
    try {
      const r = await env.LOGS_BUCKET.get(obj.key);
      const text = await r.text();
      logs.push({ key: obj.key, uploaded: obj.uploaded, data: JSON.parse(text) });
    } catch (e) {
      logs.push({ key: obj.key, uploaded: obj.uploaded, error: e.message || String(e) });
    }
  }
  return { logs };
}



function numberValue(v) {
  const n = Number(String(fieldText(v) || "0").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function stockSourceFieldName(source) {
  const s = lower(source).trim();
  if (s === "uae local stock") return "UAE Local Stock";
  if (s === "ksa local stock") return "KSA Local Stock";
  if (s === "from dji") return "";
  return "";
}

function stockUpdatedIsYes(v) {
  const s = lower(fieldText(v));
  return s === "yes" || s === "true" || s === "updated" || s === "done";
}

function parseSpareItemsFromOrderFields(fields) {
  const codes = String(fields["Material Code"] || "").split(",").map(x => x.trim()).filter(Boolean);
  const names = String(fields["Material Name"] || "").split(",").map(x => x.trim()).filter(Boolean);
  const qtys = String(fields["Qty"] || "").split(",").map(x => x.trim()).filter(Boolean);
  return codes.map((code, i) => ({
    materialCode: code,
    materialName: names[i] || "",
    qty: numberValue(qtys[i] || 1) || 1
  })).filter(x => x.materialCode);
}

function materialCodeKey(v) {
  return lower(v).replace(/\s+/g, "");
}

async function deductSpareLocalStock(env, orderTableId, orderRecordId, orderFields) {
  const source = fieldText(orderFields["Spare Source"]);
  const stockField = stockSourceFieldName(source);
  if (!stockField) return { skipped: true, reason: "Spare Source is not local stock" };

  if (stockUpdatedIsYes(orderFields["Stock Updated"])) {
    return { skipped: true, reason: "Stock already updated" };
  }

  const spareTableId = env.SPARE_LIST_TABLE_ID;
  if (!spareTableId) {
    return { skipped: true, reason: "Spare Part List table id not configured" };
  }

  const items = parseSpareItemsFromOrderFields(orderFields);
  if (!items.length) return { skipped: true, reason: "No material code/qty found in order" };

  const spareRows = await listRecords(env, spareTableId);
  const byCode = new Map();
  for (const row of spareRows) {
    const f = row.fields || {};
    const code = materialCodeKey(f["Material Code"] || f["Material code"] || f["material code"] || "");
    if (code) byCode.set(code, row);
  }

  const results = [];
  for (const item of items) {
    const row = byCode.get(materialCodeKey(item.materialCode));
    if (!row) {
      results.push({ materialCode: item.materialCode, qty: item.qty, updated: false, error: "Material Code not found" });
      continue;
    }

    const f = row.fields || {};
    const current = numberValue(f[stockField]);
    const next = current - item.qty; // allow minus stock
    await updateRecord(env, spareTableId, row.record_id, { [stockField]: next });
    results.push({ materialCode: item.materialCode, qty: item.qty, stockField, before: current, after: next, updated: true });
  }

  const orderFieldTypes = await getFieldTypes(env, orderTableId);
  const update = {};
  if (orderFieldTypes["Stock Updated"]) update["Stock Updated"] = "Yes";
  if (orderFieldTypes["Final Notes"]) {
    const oldNotes = fieldText(orderFields["Final Notes"]);
    const added = `Stock updated from ${source} on ${new Date().toISOString().slice(0,10)}`;
    update["Final Notes"] = oldNotes ? `${oldNotes}\n${added}` : added;
  }
  if (Object.keys(update).length) await updateRecord(env, orderTableId, orderRecordId, update);

  return { ok: true, source, stockField, items: results };
}

function spareReportEsc(v) {
  return String(v ?? "").replace(/[&<>"]/g, s => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[s]));
}
function fieldFirst(fields, names) {
  for (const n of names) if (fields && fields[n] !== undefined && fields[n] !== null && fields[n] !== "") return fields[n];
  return "";
}
function spareReportFieldText(v) {
  if (v === undefined || v === null || v === "") return "";
  if (Array.isArray(v)) return v.map(fieldText).filter(Boolean).join(", ");
  if (typeof v === "object") return v.text || v.name || v.file_name || v.link || v.url || v.value || "";
  return String(v);
}
function spareOrderReportBytes(orderNo, fields) {
  const rows = [
    ["Spare Order No", orderNo],
    ["Status", fields["Status"] || ""],
    ["Company Name", fields["Company Name"] || ""],
    ["Contact Name", fields["Contact Name"] || ""],
    ["Billing Address", fields["Billing Address"] || fields["Invoice Address"] || ""],
    ["Country", fields["Country"] || ""],
    ["Invoice Currency", fields["Invoice Currency"] || ""],
    ["Remarks", fields["Remarks"] || ""],
    ["Final Notes", fields["Final Notes"] || ""],
    ["Dealer CN", spareReportFieldText(fieldFirst(fields, ["Dealer Credit Note","Dealer CN"]))],
    ["Shipment Destination", spareReportFieldText(fieldFirst(fields, ["Shipment Destination","Order Location","Spare Order Location"]))],
    ["Shipment Tracking No", spareReportFieldText(fieldFirst(fields, ["Shipment Tracking No","Tracking No","Shipment Tracking Number"]))],
    ["Specialized", spareReportFieldText(fields["Specialized"])],
    ["Spare Source", spareReportFieldText(fields["Spare Source"])],
    ["Stock Updated", spareReportFieldText(fields["Stock Updated"])],
    ["DJI Cost", fields["DJI Cost"] || ""],
    ["Shipment Cost ( AED )", fields["Shipment Cost ( AED )"] || ""],
    ["Dealer Credit", fields["Dealer Credit"] || ""],
    ["DJI Case No", spareReportFieldText(fieldFirst(fields, ["DJI Case NO","DJI case NO","DJI Case No","DJI case No"]))],
    ["Invoice Download", spareReportFieldText(fields["Invoice Download"])],
    ["Payment Receipt", spareReportFieldText(fields["Payment Receipt"])],
    ["Order File", spareReportFieldText(fields["Order File"])]
  ];
  const body = rows.map(r => `<tr><th>${spareReportEsc(r[0])}</th><td>${spareReportEsc(r[1])}</td></tr>`).join("");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  body{font-family:Arial,sans-serif}h1{font-size:20px;color:#1f3b8a}
  table{border-collapse:collapse;width:100%}th{background:#1f3b8a;color:#fff;width:240px}
  th,td{border:1px solid #777;padding:8px;text-align:left;vertical-align:top}
  </style></head><body><h1>AERO NEX Spare Order Report</h1><table>${body}</table></body></html>`;
  return new TextEncoder().encode(html);
}
function spareOrdersReportBytes(rows) {
  const headers = ["Spare Order No","Status","Company Name","Contact Name","Billing Address","Country","Invoice Currency","Remarks","Final Notes","Dealer CN","Shipment Destination","Shipment Tracking No","Specialized","Spare Source","Stock Updated","DJI Cost","Shipment Cost ( AED )","Dealer Credit","DJI Case No","Invoice Download","Payment Receipt","Order File"];
  const tr = (cells, head=false) => `<tr>${cells.map(c => head ? `<th>${spareReportEsc(c)}</th>` : `<td>${spareReportEsc(c)}</td>`).join("")}</tr>`;
  const body = (rows || []).map(r => {
    const f = r.fields || {};
    return tr([
      spareOrderNo(f),
      f["Status"] || "",
      f["Company Name"] || "",
      f["Contact Name"] || "",
      f["Billing Address"] || f["Invoice Address"] || "",
      f["Country"] || "",
      f["Invoice Currency"] || "",
      f["Remarks"] || "",
      f["Final Notes"] || "",
      spareReportFieldText(fieldFirst(f, ["Dealer Credit Note","Dealer CN"])),
      spareReportFieldText(fieldFirst(f, ["Shipment Destination","Order Location","Spare Order Location"])),
      spareReportFieldText(fieldFirst(f, ["Shipment Tracking No","Tracking No","Shipment Tracking Number"])),
      spareReportFieldText(f["Specialized"]),
      spareReportFieldText(f["Spare Source"]),
      spareReportFieldText(f["Stock Updated"]),
      f["DJI Cost"] || "",
      f["Shipment Cost ( AED )"] || "",
      f["Dealer Credit"] || "",
      spareReportFieldText(fieldFirst(f, ["DJI Case NO","DJI case NO","DJI Case No","DJI case No"])),
      spareReportFieldText(f["Invoice Download"]),
      spareReportFieldText(f["Payment Receipt"]),
      spareReportFieldText(f["Order File"])
    ]);
  }).join("");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  body{font-family:Arial,sans-serif}h1{font-size:20px;color:#1f3b8a}
  table{border-collapse:collapse;width:100%}th{background:#1f3b8a;color:#fff}
  th,td{border:1px solid #777;padding:8px;text-align:left;vertical-align:top}
  </style></head><body><h1>AERO NEX Spare Orders Report</h1><table>${tr(headers,true)}${body}</table></body></html>`;
  return new TextEncoder().encode(html);
}


const FLYCART_CREDIT_FIELDS = [
  "Spare Order Case",
  "Total Credit Available",
  "Credit Used",
  "Credit Balance",
  "Total Device Purchased",
  "Dealer email",
  "Spare PI amount",
  "DJI Order Cost",
  "Dealer Name",
  "DJI Case No"
];

function flycartAdminOnly(role) {
  return lower(role).includes("admin");
}

function flycartText(v) {
  if (v === undefined || v === null || v === "") return "";
  if (Array.isArray(v)) return v.map(flycartText).filter(Boolean).join(", ");
  if (typeof v === "object") return v.text || v.name || v.file_name || v.link || v.url || v.value || "";
  return String(v);
}

function flycartNumber(v) {
  const n = Number(String(v || "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function flycartValueByType(fieldType, value) {
  if (value === undefined || value === null) return "";
  if (fieldType === 2) return flycartNumber(value);
  return String(value);
}

function flycartReportBytes(rows) {
  const escHtml = v => String(v ?? "").replace(/[&<>"]/g, s => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[s]));
  const tr = (cells, head=false) => `<tr>${cells.map(c => head ? `<th>${escHtml(c)}</th>` : `<td>${escHtml(c)}</td>`).join("")}</tr>`;
  const body = (rows || []).map(r => {
    const f = r.fields || {};
    return tr(FLYCART_CREDIT_FIELDS.map(k => flycartText(f[k])));
  }).join("");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  body{font-family:Arial,sans-serif}h1{font-size:20px;color:#1f3b8a}
  table{border-collapse:collapse;width:100%}th{background:#1f3b8a;color:#fff}
  th,td{border:1px solid #777;padding:8px;text-align:left;vertical-align:top}
  </style></head><body><h1>AERO NEX - Flycart Credit Use</h1><table>${tr(FLYCART_CREDIT_FIELDS,true)}${body}</table></body></html>`;
  return new TextEncoder().encode(html);
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


  if (p === "/api/warranty-software-status") {
    const role = norm(url.searchParams.get("role"));
    if (!currentRoleCanAccessWarrantySoftware(role)) return json({ error: "Forbidden" }, 403);
    const q = norm(url.searchParams.get("q"));
    if (!q) return json({ warranty: [], software: [] });

    const warrantyRows = env.WARRANTY_STATUS_TABLE_ID ? await listRecords(env, env.WARRANTY_STATUS_TABLE_ID) : [];
    const softwareRows = env.SOFTWARE_STATUS_TABLE_ID ? await listRecords(env, env.SOFTWARE_STATUS_TABLE_ID) : [];

    const warranty = (warrantyRows || [])
      .filter(r => warrantySoftwareMatchValue(r.fields || {}, q))
      .slice(0, 50)
      .map(r => ({ record_id: r.record_id, fields: pickWarrantySoftwareFields(r.fields || {}) }));

    const software = (softwareRows || [])
      .filter(r => warrantySoftwareMatchValue(r.fields || {}, q))
      .slice(0, 50)
      .map(r => ({ record_id: r.record_id, fields: pickWarrantySoftwareFields(r.fields || {}) }));

    return json({ warranty, software });
  }


  if (p === "/api/logs-diagnostics/tables") {
    const role = norm(url.searchParams.get("role"));
    if (!logAccessAllowed(role)) return json({ error:"Forbidden" }, 403);

    const selected = norm(url.searchParams.get("table"));
    const configs = logTableConfigs(env);
    const chosen = !selected || selected === "ALL"
      ? configs
      : configs.filter(x => x.key === selected || x.name === selected);

    const tables = [];
    for (const cfg of chosen) tables.push(await buildLarkTableDiagnostic(env, cfg));

    return json({
      ok: tables.every(t => t.permission === "OK" || t.permission === "NOT_CONFIGURED"),
      generatedAt: new Date().toISOString(),
      tables
    });
  }

  if (p === "/api/logs-diagnostics/table-options") {
    const role = norm(url.searchParams.get("role"));
    if (!logAccessAllowed(role)) return json({ error:"Forbidden" }, 403);
    return json({ tables: logTableConfigs(env).map(x => ({ key:x.key, name:x.name, configured:!!x.tableId })) });
  }

  if (p === "/api/logs-diagnostics/environment") {
    const role = norm(url.searchParams.get("role"));
    if (!logAccessAllowed(role)) return json({ error:"Forbidden" }, 403);

    const configs = logTableConfigs(env);
    return json({
      ok: true,
      generatedAt: new Date().toISOString(),
      larkBaseTokenPresent: !!env.LARK_BASE_TOKEN,
      logsBucketBound: !!env.LOGS_BUCKET,
      configuredTables: configs.map(x => ({ key:x.key, name:x.name, configured:!!x.tableId }))
    });
  }

  if (p === "/api/logs-diagnostics/error-logs") {
    const role = norm(url.searchParams.get("role"));
    if (!logAccessAllowed(role)) return json({ error:"Forbidden" }, 403);
    return json(await listRecentErrorLogs(env, Number(url.searchParams.get("limit") || 50)));
  }

  if (p === "/api/logs-diagnostics/test-error-log") {
    const role = norm(url.searchParams.get("role"));
    if (!logAccessAllowed(role)) return json({ error:"Forbidden" }, 403);
    const result = await writeErrorLog(env, {
      source:"manual-test",
      message:"Manual test error log from Logs page",
      userEmail:norm(url.searchParams.get("email")),
      path:p
    });
    return json(result);
  }

  if (p === "/api/dealers") {
    return json(await listRecords(env, env.USER_TABLE_ID));
  }

  if (p === "/api/spares" || p === "/api/spare-list") {
    if (!env.SPARE_LIST_TABLE_ID) return json({ error:"SPARE_LIST_TABLE_ID not configured" }, 400);
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

    // Case Register No is Lark auto-number. Do NOT write it from API.
    const fields = {
      "Company Name": companyName,
      "Model No": b.modelNo || "",
      "Serial No": b.serialNo || "",
      "Activation Date / Invoice Date": b.activationDate || "",
      "Technician Name": b.technicianName || "",
      "Material Replaced": formatDealerRepairMaterials(b.parts || []),
      "Device Issue": b.deviceIssue || "",
      "Technicain Note": b.technicianNote || "",
      "Repair Type": b.repairType || "Local Repair",
      "Upload Repair Data": b.uploadRepairData || "",
      "Repair Status": "Submitted"
    };
    const fieldTypes = await getFieldTypes(env, env.DEALER_REPAIR_CASE_TABLE_ID);
    const sendFields = {};
    for (const [k, v] of Object.entries(fields)) {
      if (fieldTypes[k] && v !== undefined && v !== null && v !== "") {
        sendFields[k] = k === "Upload Repair Data" ? toLarkUrlValue(v, "Upload Repair Data") : v;
      }
    }
    const rec = await createRecord(env, env.DEALER_REPAIR_CASE_TABLE_ID, sendFields);
    const recordId = rec.data?.record?.record_id || rec.data?.record_id;
    let caseNo = "";
    if (recordId) {
      try {
        const saved = await getRecord(env, env.DEALER_REPAIR_CASE_TABLE_ID, recordId);
        caseNo = dealerRepairCaseNo(saved.fields || {});
      } catch (_) {}
    }
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
      "Technicain Note": b.technicianNote || "",
      "Repair Type": b.repairType || "Local Repair",
      "Upload Repair Data": b.uploadRepairData || ""
    };
    const fieldTypes = await getFieldTypes(env, env.DEALER_REPAIR_CASE_TABLE_ID);
    const sendFields = {};
    for (const [k, v] of Object.entries(fields)) {
      if (fieldTypes[k]) sendFields[k] = k === "Upload Repair Data" ? toLarkUrlValue(v, "Upload Repair Data") : v;
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


  if (p === "/api/flycart-credit-use") {
    const role = norm(url.searchParams.get("role"));
    if (!flycartAdminOnly(role)) return json({ error:"Forbidden" }, 403);
    if (!env.FLYCART_CREDIT_USE_TABLE_ID) return json({ rows:[], warning:"FLYCART_CREDIT_USE_TABLE_ID not configured" });
    return json({ ok:true, rows:await listRecords(env, env.FLYCART_CREDIT_USE_TABLE_ID) });
  }

  if (p === "/api/flycart-credit-use/save" && req.method === "POST") {
    const b = await readBody(req);
    if (!flycartAdminOnly(b.role)) return json({ error:"Forbidden" }, 403);
    if (!env.FLYCART_CREDIT_USE_TABLE_ID) return json({ error:"FLYCART_CREDIT_USE_TABLE_ID not configured" }, 400);

    const fieldTypes = await getFieldTypes(env, env.FLYCART_CREDIT_USE_TABLE_ID);
    const fields = {};
    const skipped = [];

    for (const k of FLYCART_CREDIT_FIELDS) {
      if (!fieldTypes[k]) {
        skipped.push(k);
        continue;
      }
      // Skip formula/autonumber/readonly fields if Lark marks them as non-editable types.
      if (fieldTypes[k] === 20 || fieldTypes[k] === 1005) {
        skipped.push(k);
        continue;
      }
      fields[k] = flycartValueByType(fieldTypes[k], b.fields?.[k] ?? "");
    }

    let result;
    if (b.record_id) {
      result = await updateRecord(env, env.FLYCART_CREDIT_USE_TABLE_ID, b.record_id, fields);
    } else {
      result = await createRecord(env, env.FLYCART_CREDIT_USE_TABLE_ID, fields);
    }
    return json({ ok:true, result:result.data || result, updated:Object.keys(fields), skipped });
  }

  if (p === "/api/flycart-credit-use-report") {
    const role = norm(url.searchParams.get("role"));
    if (!flycartAdminOnly(role)) return json({ error:"Forbidden" }, 403);
    if (!env.FLYCART_CREDIT_USE_TABLE_ID) return json({ error:"FLYCART_CREDIT_USE_TABLE_ID not configured" }, 400);
    const rows = await listRecords(env, env.FLYCART_CREDIT_USE_TABLE_ID);
    return new Response(flycartReportBytes(rows), {
      headers: {
        "content-type":"application/vnd.ms-excel; charset=utf-8",
        "content-disposition":`attachment; filename="flycart-credit-use-report.xls"`
      }
    });
  }


  if (p === "/api/admin-module-meta") {
    const role = norm(url.searchParams.get("role"));
    if (!logAccessAllowed(role)) return json({ error:"Forbidden" }, 403);
    const module = lower(url.searchParams.get("module"));
    const requestedCountry = norm(url.searchParams.get("country") || "UAE & Other Region");
    const userCountry = norm(url.searchParams.get("userCountry") || "");
    const country = scopedModuleCountry(role, requestedCountry, userCountry);

    let tableId = "";
    let tableName = "";
    let rows = [];
    if (module === "internalrepair" || module === "internal-repair") {
      tableId = internalRepairTable(env, country);
      tableName = lower(country).includes("ksa") ? "Internal Repair Register - KSA" : "Internal Repair Register - UAE & Other Region";
      rows = await listInternalRepairRows(env, country);
    } else if (module === "spareorderdetails" || module === "spare-order-details") {
      if (!flycartAdminOnly(role)) return json({ error:"Forbidden" }, 403);
      tableId = env.SPARE_ORDER_DETAILS_TABLE_ID;
      tableName = "Internal Spare Order details";
      rows = await listSpareOrderDetailsRows(env);
    } else {
      return json({ error:"Unknown module" }, 400);
    }

    if (!tableId) return json({ error:"Module table id not configured", module, country }, 400);
    const fields = await getTableFieldsForDiagnostics(env, tableId);
    const dealers = env.USER_TABLE_ID ? await listRecords(env, env.USER_TABLE_ID) : [];
    const repairs = (module === "internalrepair" || module === "internal-repair")
      ? await listRecords(env, repairTable(env, country))
      : [];
    const spares = [];
    return json({ ok:true, module, country, tableId, tableName, fields, rows, dealers, repairs, spares });
  }

  if (p === "/api/save-internal-repair" && req.method === "POST") {
    const b = await readBody(req);
    const role = norm(b.role);
    if (!logAccessAllowed(role)) return json({ error:"Forbidden" }, 403);
    const country = scopedModuleCountry(role, b.country || "UAE & Other Region", b.userCountry || "");
    const tableId = internalRepairTable(env, country);
    if (!tableId) return json({ error:"Internal Repair table id not configured" }, 400);
    const fieldTypes = await getFieldTypes(env, tableId);
    const fields = prepareFieldsForTable(fieldTypes, b.fields || {});
    if (!Object.keys(fields).length) return json({ error:"No valid fields to save" }, 400);
    if (b.record_id) {
      await updateRecord(env, tableId, b.record_id, fields);
      return json({ ok:true, updated:true });
    }
    const rec = await createRecord(env, tableId, fields);
    return json({ ok:true, created:true, record:rec.data || rec });
  }

  
  if (p === "/api/upload-spare-order-details-document" && req.method === "POST") {
    const b = await readBody(req);
    const role = norm(b.role);
    if (!flycartAdminOnly(role)) return json({ error:"Forbidden" }, 403);
    const tableId = env.SPARE_ORDER_DETAILS_TABLE_ID;
    if (!tableId) return json({ error:"SPARE_ORDER_DETAILS_TABLE_ID not configured" }, 400);
    if (!b.record_id) return json({ error:"Missing record_id" }, 400);

    const inputFiles = Array.isArray(b.files) && b.files.length ? b.files : (b.file ? [b.file] : []);
    if (!inputFiles.length) return json({ error:"No file received" }, 400);

    const fieldMeta = await getFieldMetaByName(env, tableId);
    const docField = fieldMeta["Document Upload"];
    if (!docField) return json({ error:"Document Upload field not found in Internal Spare Order details table" }, 400);
    const fieldId = docField.field_id;
    if (!fieldId) return json({ error:"Document Upload field_id not found" }, 400);

    const uploaded = [];
    for (const file of inputFiles) {
      uploaded.push(await uploadBitableAttachmentToLark(env, tableId, b.record_id, fieldId, file));
    }

    const current = await getRecord(env, tableId, b.record_id);
    const currentValue = current?.fields?.["Document Upload"];
    let merged = [];
    if (Array.isArray(currentValue)) {
      merged = currentValue.filter(x => x && x.file_token);
    }

    await updateRecord(env, tableId, b.record_id, { "Document Upload": [...merged, ...uploaded] });
    return json({ ok:true, uploaded });
  }

if (p === "/api/save-spare-order-details" && req.method === "POST") {
    const b = await readBody(req);
    const role = norm(b.role);
    if (!flycartAdminOnly(role)) return json({ error:"Forbidden" }, 403);
    const tableId = env.SPARE_ORDER_DETAILS_TABLE_ID;
    if (!tableId) return json({ error:"SPARE_ORDER_DETAILS_TABLE_ID not configured" }, 400);
    const fieldTypes = await getFieldTypes(env, tableId);
    const fields = prepareFieldsForTable(fieldTypes, b.fields || {});
    if (!Object.keys(fields).length) {
      return json({ error:"No valid fields to save", received:Object.keys(b.fields || {}), available:Object.keys(fieldTypes || {}) }, 400);
    }
    if (b.record_id) {
      const result = await updateRecordBestEffort(env, tableId, b.record_id, fields);
      return json(result);
    }
    const rec = await createRecordBestEffort(env, tableId, fields);
    return json({ ok:true, created:true, record:rec.data || rec });
  }

  if (p === "/api/my-orders") {
    const country = norm(url.searchParams.get("country"));
    const email = norm(url.searchParams.get("email"));
    const role = norm(url.searchParams.get("role"));
    const companyName = norm(url.searchParams.get("companyName"));
    const contactName = norm(url.searchParams.get("contactName"));
    const rows = [];
    const q = lower(country);
    if (!q || q.includes("uae")) rows.push(...(await listRecords(env, env.SPARE_ORDER_UAE_TABLE_ID)).map(r => withSpareMeta(env, env.SPARE_ORDER_UAE_TABLE_ID, r)));
    if (!q || q.includes("ksa")) rows.push(...(await listRecords(env, env.SPARE_ORDER_KSA_TABLE_ID)).map(r => withSpareMeta(env, env.SPARE_ORDER_KSA_TABLE_ID, r)));
    return json(filterOwnSpareOrders(rows, email, role, companyName, contactName));
  }

  if (p === "/api/my-repairs" || p === "/api/repair-status") {
    const country = norm(url.searchParams.get("country"));
    const email = norm(url.searchParams.get("email"));
    const role = norm(url.searchParams.get("role"));
    const companyName = norm(url.searchParams.get("companyName"));
    const contactName = norm(url.searchParams.get("contactName"));
    const rows = [];
    const q = lower(country);
    if (!q || q.includes("uae")) rows.push(...(await listRecords(env, env.REPAIR_UAE_TABLE_ID)).map(r => withRepairMeta(env, env.REPAIR_UAE_TABLE_ID, r)));
    if (!q || q.includes("ksa")) rows.push(...(await listRecords(env, env.REPAIR_KSA_TABLE_ID)).map(r => withRepairMeta(env, env.REPAIR_KSA_TABLE_ID, r)));
    return json(filterOwnRepairs(rows, email, role, companyName, contactName));
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
      "Remarks": b.remarks || "",
      "Stock Updated": "No",
      "Spare Source": b.spareSource || ""
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


  if (p === "/api/update-spare-order-internal" && req.method === "POST") {
    const b = await readBody(req);
    if (!flycartAdminOnly(b.role)) return json({ error:"Forbidden" }, 403);
    if (!b.tableId || !b.record_id) return json({ error:"Missing tableId/record_id" }, 400);
    const fieldTypes = await getFieldTypes(env, b.tableId);
    const fields = {};
    if (fieldTypes["Shipment Destination"]) fields["Shipment Destination"] = b.shipmentDestination || "";
    else if (fieldTypes["Order Location"]) fields["Order Location"] = b.shipmentDestination || "";
    else if (fieldTypes["Spare Order Location"]) fields["Spare Order Location"] = b.shipmentDestination || "";
    if (fieldTypes["Shipment Tracking No"]) fields["Shipment Tracking No"] = b.shipmentTrackingNo || "";
    if (fieldTypes["Specialized"]) fields["Specialized"] = b.specialized || "";
    if (fieldTypes["Spare Source"]) fields["Spare Source"] = b.spareSource || "";
    if (fieldTypes["Final Notes"]) fields["Final Notes"] = b.finalNotes || "";
    if (fieldTypes["DJI Cost"]) fields["DJI Cost"] = b.djiCost || "";
    if (fieldTypes["Invoice Amount"]) fields["Invoice Amount"] = b.invoiceAmount || "";
    if (fieldTypes["Shipment Cost ( AED )"]) fields["Shipment Cost ( AED )"] = b.shipmentCostAed || "";
    if (fieldTypes["DJI Case NO"]) fields["DJI Case NO"] = b.djiCaseNo || "";
    else if (fieldTypes["DJI case NO"]) fields["DJI case NO"] = b.djiCaseNo || "";
    await updateRecord(env, b.tableId, b.record_id, fields);
    return json({ ok:true, updated:Object.keys(fields) });
  }

  if (p === "/api/upload-dealer-cn" && req.method === "POST") {
    const b = await readBody(req);
    if (!flycartAdminOnly(b.role)) return json({ error:"Forbidden" }, 403);
    if (!b.tableId || !b.record_id) return json({ error:"Missing tableId/record_id" }, 400);
    const no = await resolveOrderNoForUpload(env, b);
    const name = b.file?.name || "dealer-cn.pdf";
    const ext = name.includes(".") ? name.split(".").pop() : "pdf";
    const fileUrl = await putR2(env, getOrderFolderKey(no, `dealer-cn.${ext}`), bytesFromDataUrl(b.file?.data), b.file?.type || "application/pdf");
    const fieldTypes = await getFieldTypes(env, b.tableId);
    const update = {};
    if (fieldTypes["Dealer Credit Note"]) update["Dealer Credit Note"] = fieldTypes["Dealer Credit Note"] === 15 ? larkUrl(fileUrl, "Dealer CN") : fileUrl;
    else if (fieldTypes["Dealer CN"]) update["Dealer CN"] = fieldTypes["Dealer CN"] === 15 ? larkUrl(fileUrl, "Dealer CN") : fileUrl;
    await updateRecord(env, b.tableId, b.record_id, update);
    return json({ ok:true, url:fileUrl });
  }

  if (p === "/api/download-spare-order-report") {
    const role = norm(url.searchParams.get("role"));
    if (!lower(role).includes("admin")) return json({ error:"Forbidden" }, 403);
    const tableId = norm(url.searchParams.get("tableId"));
    const recordId = norm(url.searchParams.get("record_id"));
    const rec = await getRecord(env, tableId, recordId);
    const fields = rec.fields || {};
    const no = spareOrderNo(fields) || "spare-order";
    return new Response(spareOrderReportBytes(no, fields), { headers: { "content-type":"application/vnd.ms-excel; charset=utf-8", "content-disposition":`attachment; filename="${no}-report.xls"` } });
  }

  if (p === "/api/download-spare-orders-report") {
    const role = norm(url.searchParams.get("role"));
    if (!lower(role).includes("admin")) return json({ error:"Forbidden" }, 403);
    const country = norm(url.searchParams.get("country"));
    const rows = [];
    const q = lower(country);
    if (!q || q.includes("uae")) rows.push(...(await listRecords(env, env.SPARE_ORDER_UAE_TABLE_ID)).map(r => withSpareMeta(env, env.SPARE_ORDER_UAE_TABLE_ID, r)));
    if (!q || q.includes("ksa")) rows.push(...(await listRecords(env, env.SPARE_ORDER_KSA_TABLE_ID)).map(r => withSpareMeta(env, env.SPARE_ORDER_KSA_TABLE_ID, r)));
    return new Response(spareOrdersReportBytes(rows), { headers: { "content-type":"application/vnd.ms-excel; charset=utf-8", "content-disposition":`attachment; filename="spare-orders-report.xls"` } });
  }

  if (p === "/api/update-status" && req.method === "POST") {
    const b = await readBody(req);
    if (!b.tableId || !b.record_id) return json({ error: "Missing tableId/record_id" }, 400);

    await updateRecord(env, b.tableId, b.record_id, { Status: b.status });

    let stockResult = null;
    if (lower(b.type) === "spare" && lower(b.status) === "closed") {
      const rec = await getRecord(env, b.tableId, b.record_id);
      stockResult = await deductSpareLocalStock(env, b.tableId, b.record_id, rec.fields || {});
    }

    return json({ ok: true, stockResult });
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
