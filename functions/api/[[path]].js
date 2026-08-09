import { connect } from "cloudflare:sockets";

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

function attachmentTokens(value) {
  const out = [];
  const walk = v => {
    if (!v) return;
    if (Array.isArray(v)) return v.forEach(walk);
    if (typeof v !== "object") return;
    const direct = norm(v.file_token || v.token);
    if (direct) out.push(direct);
    const raw = norm(v.tmp_url || v.url || v.file_url || v.href);
    const m = raw.match(/\/medias\/([^/]+)\/download/i);
    if (m) out.push(decodeURIComponent(m[1]));
  };
  walk(value);
  return [...new Set(out)];
}

function allowedAttachmentTables(env) {
  return new Set([
    env.SPARE_ORDER_UAE_TABLE_ID, env.SPARE_ORDER_KSA_TABLE_ID,
    env.REPAIR_UAE_TABLE_ID, env.REPAIR_KSA_TABLE_ID,
    env.INTERNAL_REPAIR_UAE_TABLE_ID, env.INTERNAL_REPAIR_KSA_TABLE_ID,
    env.SPARE_ORDER_DETAILS_TABLE_ID, env.DEALER_REPAIR_CASE_TABLE_ID,
    env.FLYCART_CREDIT_USE_TABLE_ID, env.WARRANTY_STATUS_TABLE_ID,
    env.SOFTWARE_STATUS_TABLE_ID, env.CONTRACT_DOCUMENT_INTERNAL_TABLE_ID,
    env.INTERNAL_CONTRACT_DOCUMENT_TABLE_ID, env.CONTRACT_DOCUMENT_TABLE_ID,
    env.PORTAL_NOTES_TABLE_ID, env.AFTER_SALES_SUPPORT_TABLE_ID
  ].filter(Boolean));
}

async function attachmentUser(env, email) {
  const wanted = lower(email);
  if (!wanted) return null;
  const rows = await listRecords(env, env.USER_TABLE_ID);
  const rec = rows.find(r => userEmail(r.fields || {}) === wanted);
  return rec ? publicUser(rec) : null;
}

function canAccessAttachmentRecord(user, recordFields) {
  if (!user) return false;
  const role = lower(user.role);
  if (role.includes("admin") || role.includes("technician")) return true;
  const f = recordFields || {};
  const userMail = lower(user.email || user.username);
  const userComp = lower(user.companyName || user.fields?.["Company Name"]);
  const recordMails = [f["Contact Email"], f["Username ( Email )"], f["Email"], f["Dealer Email"]].map(x => lower(fieldText(x))).filter(Boolean);
  const recordCompanies = [f["Company Name"], f["Dealer / Company"], f["Dealer Name"], f["Company"]].map(x => lower(fieldText(x))).filter(Boolean);
  return (!!userMail && recordMails.includes(userMail)) || (!!userComp && recordCompanies.includes(userComp));
}

async function downloadLarkAttachment(env, tableId, fileToken, fileName) {
  const token = await larkToken(env);
  const extra = encodeURIComponent(JSON.stringify({ bitablePerm: { tableId } }));
  const url = `https://open.larksuite.com/open-apis/drive/v1/medias/${encodeURIComponent(fileToken)}/download?extra=${extra}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Lark attachment download failed (${res.status}): ${text.slice(0,300)}`);
  }
  const headers = new Headers();
  headers.set("content-type", res.headers.get("content-type") || "application/octet-stream");
  headers.set("content-disposition", `attachment; filename*=UTF-8''${encodeURIComponent(fileName || "download")}`);
  headers.set("cache-control", "private, no-store");
  headers.set("x-content-type-options", "nosniff");
  return new Response(res.body, { status: 200, headers });
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

function recordCreatedMillis(row){
  const raw = row?.created_time || row?.createdTime || row?.fields?.["Case created"] || row?.fields?.["Case Created"] || 0;
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return n > 100000000000 ? n : n * 1000;
  const parsed = Date.parse(String(raw || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}
function recentRecord(rows, maxAgeMs, matcher){
  const now = Date.now();
  return (rows || []).find(row => {
    const created = recordCreatedMillis(row);
    return created && now - created >= 0 && now - created <= maxAgeMs && matcher(row.fields || {});
  }) || null;
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
  if (type === 2) {
    const numeric = Number(String(v).replace(/,/g, "").trim());
    return Number.isFinite(numeric) ? numeric : "";
  }
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

function sameFieldValue(a, b) {
  const left = lower(norm(a));
  const right = lower(norm(b));
  return !!left && !!right && left === right;
}

function findExistingInternalRepair(rows, fields) {
  const repairCase = fields?.["Repair Case"];
  const djiCase = fields?.["DJI Case ID"];
  const djiInternalCase = fields?.["DJI Internal Case ID"];
  return (rows || []).find(r => {
    const f = r.fields || {};
    return (repairCase && sameFieldValue(f["Repair Case"], repairCase)) ||
           (djiCase && sameFieldValue(f["DJI Case ID"], djiCase)) ||
           (djiInternalCase && sameFieldValue(f["DJI Internal Case ID"], djiInternalCase));
  }) || null;
}


async function syncInternalRepairSharedFieldsToRepair(env, country, sourceFields) {
  const caseNo = norm(sourceFields?.["Repair Case"]);
  if (!caseNo) return { ok:true, skipped:true, reason:"Repair Case missing" };
  const tableId = repairTable(env, country);
  if (!tableId) return { ok:true, skipped:true, reason:"Repair table not configured" };
  const rows = await listRecords(env, tableId);
  const target = (rows || []).find(r => sameFieldValue(repairNo(r.fields || {}), caseNo));
  if (!target?.record_id) return { ok:true, skipped:true, reason:"Linked Repair Case not found" };
  const fieldTypes = await getFieldTypes(env, tableId);
  let warranty = sourceFields?.["Warranty Status"];
  if (lower(country).includes("ksa")) {
    if (lower(warranty) === "warranty") warranty = "YES";
    if (lower(warranty) === "no warranty") warranty = "NO";
  }
  const shared = prepareFieldsForTable(fieldTypes, {
    "Case created":sourceFields?.["Case created"],
    "Company Name":sourceFields?.["Company Name"],
    "Model No":sourceFields?.["Model No"],
    "Serial No":sourceFields?.["Serial No"],
    "Warranty Status":warranty
  });
  if (!Object.keys(shared).length) return { ok:true, skipped:true, reason:"No shared fields to sync" };
  const result = await updateRecordBestEffort(env, tableId, target.record_id, shared);
  return { ok:true, record_id:target.record_id, ...result };
}

async function markLinkedInternalRepairClosed(env, repairTableId, repairRecordId) {
  const country = repairTableId === env.REPAIR_KSA_TABLE_ID ? "KSA - SAUDI ARABIA" : "UAE & Other Region";
  const repair = await getRecord(env, repairTableId, repairRecordId);
  const caseNo = repairNo(repair?.fields || {});
  if (!caseNo) return { ok:true, skipped:true, reason:"Repair Case missing" };
  const rows = await listInternalRepairRows(env, country);
  const linked = (rows || []).find(r => sameFieldValue((r.fields || {})["Repair Case"], caseNo));
  if (!linked?.record_id) return { ok:true, skipped:true, reason:"Linked Internal Repair not found" };
  const internalTableId = internalRepairTable(env, country);
  const fieldTypes = await getFieldTypes(env, internalTableId);
  const localOffsetHours = lower(country).includes("ksa") ? 3 : 4;
  const localDate = new Date(Date.now() + localOffsetHours * 60 * 60 * 1000).toISOString().slice(0,10);
  const fields = prepareFieldsForTable(fieldTypes, { "Case Closed":localDate });
  if (!Object.keys(fields).length) return { ok:true, skipped:true, reason:"Case Closed field unavailable" };
  await updateRecord(env, internalTableId, linked.record_id, fields);
  return { ok:true, record_id:linked.record_id, updated:Object.keys(fields) };
}

function findExistingInternalSpareOrder(rows, fields) {
  const djiCase = fields?.["DJI Case ID"];
  if (!djiCase) return null;
  return (rows || []).find(r => sameFieldValue((r.fields || {})["DJI Case ID"], djiCase)) || null;
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

async function attachOrderExcelToLark(env, tableId, recordId, bytes, fileName, mimeType = "application/vnd.ms-excel") {
  if (!recordId) throw new Error("Missing record_id for Order File attachment");
  const fieldTypes = await getFieldTypes(env, tableId);
  if (!fieldTypes["Order File"]) return { skipped: true, reason: "Order File field not found" };
  const fileToken = await larkUploadBitableAttachment(env, bytes, fileName, mimeType);
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
    { key:"SPARE_ORDER_DETAILS_TABLE_ID", name:"Internal Spare Order details", tableId:env.SPARE_ORDER_DETAILS_TABLE_ID || "" },
    { key:"CONTRACT_DOCUMENT_INTERNAL_TABLE_ID", name:"Contract & Document - Internal", tableId:env.CONTRACT_DOCUMENT_INTERNAL_TABLE_ID || env.INTERNAL_CONTRACT_DOCUMENT_TABLE_ID || env.CONTRACT_DOCUMENT_TABLE_ID || "" },
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

async function getFullTableFieldsForDiagnostics(env, tableId) {
  // Diagnostics only. Single selected table, single field-list request.
  // Do not use shared larkFetch / admin-module-meta / record reads here.
  const token = await larkToken(env);
  const qs = new URLSearchParams({ page_size: "100" });
  const res = await fetch(`https://open.larksuite.com/open-apis/bitable/v1/apps/${env.LARK_BASE_TOKEN}/tables/${tableId}/fields?${qs}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.code) {
    throw new Error(data.msg || data.error?.message || `Lark field read failed: ${res.status}`);
  }
  return (data.data?.items || []).map(f => {
    const options = diagnosticFieldOptions(f);
    return {
      field_id: f.field_id || "",
      field_name: f.field_name,
      type: f.type,
      is_primary: !!f.is_primary,
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
    const fields = await getFullTableFieldsForDiagnostics(env, tableCfg.tableId);
    out.fields = fields;
    out.fieldCount = fields.length;
    out.missingExpectedFields = missingExpectedFields(expectedFieldsForDiagnostics(tableCfg.name), fields);
    out.recordCount = null;
    out.permission = "OK";
  } catch (e) {
    out.permission = "ERROR";
    out.error = e.message || String(e);
  }
  return out;
}



function reportBackupTableConfigs(env) {
  return {
    users: { label:"User & Company Details", tableId:env.USER_TABLE_ID || "" },
    spareParts: { label:"Spare Part List", tableId:env.SPARE_LIST_TABLE_ID || "" },
    spareUae: { label:"Spare Orders - UAE & Other Region", tableId:env.ORDER_UAE_TABLE_ID || env.SPARE_ORDER_UAE_TABLE_ID || "" },
    spareKsa: { label:"Spare Orders - KSA", tableId:env.ORDER_KSA_TABLE_ID || env.SPARE_ORDER_KSA_TABLE_ID || "" },
    repairUae: { label:"Repair Cases - UAE & Other Region", tableId:env.REPAIR_UAE_TABLE_ID || env.REPAIR_CASE_UAE_TABLE_ID || "" },
    repairKsa: { label:"Repair Cases - KSA", tableId:env.REPAIR_KSA_TABLE_ID || env.REPAIR_CASE_KSA_TABLE_ID || "" },
    internalRepairUae: { label:"Internal Repair Register - UAE & Other Region", tableId:env.INTERNAL_REPAIR_UAE_TABLE_ID || "" },
    internalRepairKsa: { label:"Internal Repair Register - KSA", tableId:env.INTERNAL_REPAIR_KSA_TABLE_ID || "" },
    internalSpare: { label:"Internal Spare Order details", tableId:env.SPARE_ORDER_DETAILS_TABLE_ID || "" },
    dealerRepair: { label:"Dealer Repair Case", tableId:env.DEALER_REPAIR_CASE_TABLE_ID || "" },
    warranty: { label:"Warranty Status", tableId:env.WARRANTY_STATUS_TABLE_ID || "" },
    software: { label:"Software Status", tableId:env.SOFTWARE_STATUS_TABLE_ID || "" },
    flycart: { label:"Flycart Credit Use", tableId:env.FLYCART_CREDIT_USE_TABLE_ID || "" },
    portalNotes: { label:"Portal Notes", tableId:env.PORTAL_NOTES_TABLE_ID || "" },
    contracts: { label:"Contract & Document - Internal", tableId:env.CONTRACT_DOCUMENT_INTERNAL_TABLE_ID || env.INTERNAL_CONTRACT_DOCUMENT_TABLE_ID || env.CONTRACT_DOCUMENT_TABLE_ID || "" }
  };
}

function reportBackupAccessAllowed(role) {
  const r = lower(role);
  return r.includes("admin") || r.includes("technician") || r.includes("tech");
}

function reportCellText(v) {
  if (v === undefined || v === null) return "";
  if (Array.isArray(v)) return v.map(reportCellText).filter(Boolean).join(", ");
  if (typeof v === "object") {
    if (v.link || v.url) return norm(v.text || v.name || v.link || v.url || "");
    return norm(v.text || v.name || v.value || v.title || JSON.stringify(v));
  }
  return norm(v);
}

function isReportDateHeader(h) {
  const k = lower(h || "");
  return k.includes("date") || k === "created" || k === "created at" || k.includes("shipping date");
}

function reportDateText(v) {
  const ms = reportDateMs(v);
  if (ms === null) return reportCellText(v);
  const d = new Date(ms);
  if (isNaN(d.getTime())) return reportCellText(v);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function reportCellForHeader(header, value) {
  return isReportDateHeader(header) ? reportDateText(value) : reportCellText(value);
}

function reportEsc(v) {
  return String(v ?? "").replace(/[&<>]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));
}

function reportDateMs(v) {
  const s = reportCellText(v);
  if (!s) return null;
  const n = Number(s);
  if (Number.isFinite(n)) {
    const ms = n > 1000000000000 ? n : n * 1000;
    return Number.isFinite(ms) ? ms : null;
  }
  const parts = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
  if (parts) {
    const d = new Date(Number(parts[3]), Number(parts[2]) - 1, Number(parts[1]));
    return isNaN(d.getTime()) ? null : d.getTime();
  }
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

function reportRowDateMs(fields) {
  const names = ["Date Created","Case created","Case Created","Case Creation Date","Case Close Date","Date of Purchase / Activation date","Shipping Date","Date","Created","Created At"];
  for (const n of names) {
    const ms = reportDateMs(fields[n]);
    if (ms !== null) return ms;
  }
  return null;
}

function reportMatchesFilters(row, filters) {
  const f = row.fields || {};
  const company = lower(filters.company);
  if (company) {
    const txt = lower(reportCellText(firstField(f, ["Company Name","Dealer Name","Customer Name","Company"])));
    if (!txt.includes(company)) return false;
  }
  const status = lower(filters.status);
  if (status) {
    const txt = lower(reportCellText(firstField(f, ["Status","Case Status","Repair Status","DJI Repair Status","DJI Repair status"])));
    if (!txt.includes(status)) return false;
  }
  const caseId = lower(filters.caseId);
  if (caseId) {
    const hay = lower(Object.values(f).map(reportCellText).join(" "));
    if (!hay.includes(caseId)) return false;
  }
  const fromMs = filters.dateFrom ? Date.parse(filters.dateFrom + "T00:00:00") : null;
  const toMs = filters.dateTo ? Date.parse(filters.dateTo + "T23:59:59") : null;
  if (fromMs || toMs) {
    const ms = reportRowDateMs(f);
    if (ms === null) return false;
    if (fromMs && ms < fromMs) return false;
    if (toMs && ms > toMs) return false;
  }
  return true;
}

async function reportBackupRows(env, tableId, filters) {
  const rows = await listRecords(env, tableId);
  return rows.filter(r => reportMatchesFilters(r, filters));
}

function reportWorkbookBytes(label, rows, filters) {
  const headers = [];
  for (const r of rows) {
    for (const k of Object.keys(r.fields || {})) if (!headers.includes(k)) headers.push(k);
  }
  const safeHeaders = headers.length ? headers : ["No data"];
  const filterRows = [
    ["Report", label],
    ["Generated At", new Date().toISOString()],
    ["Date From", filters.dateFrom || ""],
    ["Date To", filters.dateTo || ""],
    ["Company", filters.company || ""],
    ["Status", filters.status || ""],
    ["Case ID / DJI Case ID", filters.caseId || ""],
    ["Record Count", String(rows.length)]
  ].map(r => `<tr><th>${reportEsc(r[0])}</th><td>${reportEsc(r[1])}</td></tr>`).join("");
  const head = safeHeaders.map(h => `<th>${reportEsc(h)}</th>`).join("");
  const body = rows.length ? rows.map(r => `<tr>${safeHeaders.map(h => `<td>${reportEsc(reportCellForHeader(h, (r.fields || {})[h]))}</td>`).join("")}</tr>`).join("") : `<tr><td>No matching records</td></tr>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif}table{border-collapse:collapse;margin-bottom:18px}th,td{border:1px solid #999;padding:6px;mso-number-format:'\\@'}th{background:#d9eaf7;font-weight:bold}.meta th{background:#eef3fb;text-align:left}</style></head><body><h2>${reportEsc(label)}</h2><table class="meta">${filterRows}</table><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`;
}

const BACKUP_SETTINGS_KEY = "rma-backup-settings-v1";
const BACKUP_HISTORY_KEY = "rma-backup-history-v1";
const BACKUP_LOGS_KEY = "rma-backup-logs-v1";
const BACKUP_LOCK_KEY = "rma-backup-running-v1";

async function backupKvRead(env, key, fallback) {
  if (!env.KINGDEE_LOGS) return fallback;
  try {
    const raw = await env.KINGDEE_LOGS.get(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

async function backupKvWrite(env, key, value) {
  if (!env.KINGDEE_LOGS) throw new Error("KINGDEE_LOGS KV binding missing. Cannot save backup configuration/logs.");
  await env.KINGDEE_LOGS.put(key, JSON.stringify(value));
}

async function getBackupSettings(env) {
  return await backupKvRead(env, BACKUP_SETTINGS_KEY, {});
}

async function saveBackupSettings(env, settings) {
  const safe = {
    protocol: norm(settings.protocol || "ftps"),
    host: norm(settings.host).replace(/^(?:ftps?|sftp):\/\//i, "").replace(/\/$/, ""),
    port: norm(settings.port),
    username: norm(settings.username),
    remoteFolder: norm(settings.remoteFolder),
    scheduleTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(norm(settings.scheduleTime)) ? norm(settings.scheduleTime) : "04:00",
    schedule: `${/^([01]\d|2[0-3]):[0-5]\d$/.test(norm(settings.scheduleTime)) ? norm(settings.scheduleTime) : "04:00"} daily`,
    retentionDays: [3,7].includes(Number(settings.retentionDays)) ? Number(settings.retentionDays) : 3,
    retention: [3,7].includes(Number(settings.retentionDays)) ? Number(settings.retentionDays) : 3,
    updatedAt: new Date().toISOString()
  };
  await backupKvWrite(env, BACKUP_SETTINGS_KEY, safe);
  return safe;
}


function nasPort(value, fallback) {
  const n = Number(norm(value));
  return Number.isInteger(n) && n > 0 && n <= 65535 ? n : fallback;
}

function socketTimeout(ms, message) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(message || "NAS connection timed out")), ms));
}

async function readSocketText(reader, timeoutMs = 8000) {
  const decoder = new TextDecoder();
  let text = "";
  for (let i = 0; i < 12; i++) {
    const result = await Promise.race([reader.read(), socketTimeout(timeoutMs, "NAS response timed out")]);
    if (result.done) break;
    text += decoder.decode(result.value, { stream:true });
    if (text.includes("\n")) break;
  }
  return text + decoder.decode();
}

async function readFtpReply(reader, timeoutMs = 8000) {
  const decoder = new TextDecoder();
  let text = "";
  let code = "";
  let multiline = false;
  for (let i = 0; i < 40; i++) {
    const result = await Promise.race([reader.read(), socketTimeout(timeoutMs, "FTPS response timed out")]);
    if (result.done) break;
    text += decoder.decode(result.value, { stream:true });
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (!code && lines.length) {
      const m = lines[0].match(/^(\d{3})([ -])/);
      if (m) { code = m[1]; multiline = m[2] === "-"; }
    }
    if (code) {
      if (!multiline && lines.some(line => line.startsWith(code + " "))) break;
      if (multiline && lines.slice(1).some(line => line.startsWith(code + " "))) break;
    }
  }
  text += decoder.decode();
  const first = text.match(/^(\d{3})[ -]/m);
  return { code: first ? first[1] : "", text: text.trim() };
}

async function ftpCommand(writer, reader, command, expectedCodes) {
  await writer.write(new TextEncoder().encode(command + "\r\n"));
  const reply = await readFtpReply(reader);
  if (!expectedCodes.includes(reply.code)) {
    throw new Error(`${command.split(" ")[0]} failed (${reply.code || "no code"}): ${reply.text.slice(0, 300)}`);
  }
  return reply;
}

async function testFtpsExplicitConnection({ host, port, username, password }) {
  if (!username) throw new Error("NAS username is required");
  if (!password) throw new Error("Cloudflare secret NAS_BACKUP_PASSWORD is not configured");
  const cleanHost = norm(host).replace(/^ftps?:\/\//i, "").replace(/\/$/, "");
  let socket = connect({ hostname:cleanHost, port }, { secureTransport:"starttls", allowHalfOpen:true });
  await Promise.race([socket.opened, socketTimeout(10000, "FTPS TCP connection timed out")]);
  let reader = socket.readable.getReader();
  let writer = socket.writable.getWriter();
  let authTlsReply = "";
  try {
    const welcome = await readFtpReply(reader, 10000);
    if (welcome.code !== "220") throw new Error(`FTPS server did not return 220: ${welcome.text.slice(0, 300)}`);
    const auth = await ftpCommand(writer, reader, "AUTH TLS", ["234", "334"]);
    authTlsReply = auth.text;
    reader.releaseLock();
    writer.releaseLock();
    try {
      const secureSocket = socket.startTls();
      socket = secureSocket;
      await Promise.race([secureSocket.opened, socketTimeout(12000, "FTPS TLS handshake timed out")]);
    } catch (e) {
      const detail = e?.message || String(e);
      const ipHost = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(cleanHost);
      const hint = ipHost
        ? "The NAS is being contacted by raw IP. FileZilla can let a user manually accept an untrusted or hostname-mismatched certificate, but Cloudflare Workers cannot show that certificate prompt. Install a publicly trusted QNAP certificate and use its matching DDNS hostname as NAS Host."
        : "Cloudflare Workers require the NAS TLS certificate to be publicly trusted and valid for the NAS Host name. Check the QNAP FTPS certificate chain, expiry, and hostname.";
      const err = new Error(`FTPS TLS handshake failed after AUTH TLS (${authTlsReply.slice(0,120)}). ${hint} Detail: ${detail}`);
      err.code = "ftps_tls_handshake_failed";
      throw err;
    }
    reader = socket.readable.getReader();
    writer = socket.writable.getWriter();
    const userReply = await ftpCommand(writer, reader, `USER ${username}`, ["230", "331"]);
    if (userReply.code === "331") await ftpCommand(writer, reader, `PASS ${password}`, ["230"]);
    await ftpCommand(writer, reader, "PBSZ 0", ["200"]);
    await ftpCommand(writer, reader, "PROT P", ["200"]);
    const pwd = await ftpCommand(writer, reader, "PWD", ["257"]);
    let folders = [];
    let folderListingError = "";
    try { folders = await listFtpFolders({ host:cleanHost, writer, reader, encrypted:true }); }
    catch (e) { folderListingError = e.message || String(e); }
    try { await ftpCommand(writer, reader, "QUIT", ["221"]); } catch {}
    return { ok:true, status:"Connected", protocol:"ftps", tls:"Explicit TLS", authenticated:true, dataProtection:"Private", serverReply:pwd.text.slice(0, 300), folders, folderListingError };
  } finally {
    try { reader.releaseLock(); } catch {}
    try { writer.releaseLock(); } catch {}
    try { await socket.close(); } catch {}
  }
}

async function testFtpPlainConnection({ host, port, username, password }) {
  if (!username) throw new Error("NAS username is required");
  if (!password) throw new Error("Cloudflare secret NAS_BACKUP_PASSWORD is not configured");
  const cleanHost = norm(host).replace(/^ftp:\/\//i, "").replace(/\/$/, "");
  const socket = connect({ hostname:cleanHost, port }, { secureTransport:"off", allowHalfOpen:true });
  await Promise.race([socket.opened, socketTimeout(10000, "FTP TCP connection timed out")]);
  const reader = socket.readable.getReader();
  const writer = socket.writable.getWriter();
  try {
    const welcome = await readFtpReply(reader, 10000);
    if (welcome.code !== "220") throw new Error(`FTP server did not return 220: ${welcome.text.slice(0, 300)}`);
    const userReply = await ftpCommand(writer, reader, `USER ${username}`, ["230", "331"]);
    if (userReply.code === "331") await ftpCommand(writer, reader, `PASS ${password}`, ["230"]);
    const pwd = await ftpCommand(writer, reader, "PWD", ["257"]);
    let folders = [];
    let folderListingError = "";
    try { folders = await listFtpFolders({ host:cleanHost, writer, reader, encrypted:false }); }
    catch (e) { folderListingError = e.message || String(e); }
    try { await ftpCommand(writer, reader, "QUIT", ["221"]); } catch {}
    return { ok:true, status:"Connected", protocol:"ftp", tls:"None", authenticated:true, dataProtection:"Unencrypted", serverReply:pwd.text.slice(0, 300), folders, folderListingError };
  } finally {
    try { reader.releaseLock(); } catch {}
    try { writer.releaseLock(); } catch {}
    try { await socket.close(); } catch {}
  }
}

async function testSftpReachability({ host, port }) {
  const socket = connect({ hostname:host, port }, { secureTransport:"off", allowHalfOpen:true });
  await Promise.race([socket.opened, socketTimeout(8000, "SFTP TCP connection timed out")]);
  const reader = socket.readable.getReader();
  try {
    const banner = (await readSocketText(reader, 8000)).trim();
    if (!/^SSH-/.test(banner)) throw new Error(`Server is reachable but did not return an SSH banner: ${banner.slice(0, 200) || "empty response"}`);
    return { ok:true, status:"Reachable", protocol:"sftp", authenticated:false, note:"SFTP/SSH service is reachable. Credential authentication will be verified when the SFTP transfer client is enabled.", serverBanner:banner.slice(0, 200) };
  } finally {
    try { reader.releaseLock(); } catch {}
    try { await socket.close(); } catch {}
  }
}

function parseEpsvPort(replyText) {
  const m = String(replyText || "").match(/\(\|\|\|(\d+)\|\)/);
  const port = m ? Number(m[1]) : 0;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("FTPS EPSV reply did not contain a valid passive port");
  return port;
}

function parseMlsdFolders(text) {
  const out = [];
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const split = line.lastIndexOf(";");
    if (split < 0) continue;
    const facts = line.slice(0, split + 1).toLowerCase();
    const name = line.slice(split + 1).trim();
    if (!name || name === "." || name === "..") continue;
    if (!facts.includes("type=dir;") || facts.includes("type=cdir;") || facts.includes("type=pdir;")) continue;
    if (!out.includes(name)) out.push(name);
  }
  return out.sort((a,b)=>a.localeCompare(b));
}

async function listFtpFolders({ host, writer, reader, encrypted=true }) {
  const epsv = await ftpCommand(writer, reader, "EPSV", ["229"]);
  const dataPort = parseEpsvPort(epsv.text);
  const dataSocket = connect({ hostname:host, port:dataPort }, { secureTransport: encrypted ? "on" : "off", allowHalfOpen:true });
  await Promise.race([dataSocket.opened, socketTimeout(8000, `${encrypted ? "FTPS" : "FTP"} passive data connection timed out`)]);
  const dataReader = dataSocket.readable.getReader();
  try {
    await writer.write(new TextEncoder().encode("MLSD\r\n"));
    const opening = await readFtpReply(reader);
    if (!["125","150"].includes(opening.code)) throw new Error(`MLSD failed (${opening.code || "no code"}): ${opening.text.slice(0,300)}`);
    const decoder = new TextDecoder();
    let listing = "";
    for (let i=0; i<200; i++) {
      const r = await Promise.race([dataReader.read(), socketTimeout(8000, `${encrypted ? "FTPS" : "FTP"} folder listing timed out`)]);
      if (r.done) break;
      listing += decoder.decode(r.value, { stream:true });
    }
    listing += decoder.decode();
    const done = await readFtpReply(reader);
    if (!["226","250"].includes(done.code)) throw new Error(`${encrypted ? "FTPS" : "FTP"} folder listing did not complete (${done.code || "no code"}): ${done.text.slice(0,300)}`);
    return parseMlsdFolders(listing);
  } finally {
    try { dataReader.releaseLock(); } catch {}
    try { await dataSocket.close(); } catch {}
  }
}


function backupSafeName(value, fallback="item") {
  const s = norm(value || fallback).replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").replace(/\s+/g, " ").trim();
  return (s || fallback).slice(0, 120);
}

function backupFormatBytes(bytes) {
  const n = Number(bytes || 0);
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B","KB","MB","GB","TB"];
  let v = n, i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v >= 10 || i === 0 ? v.toFixed(0) : v.toFixed(2)} ${units[i]}`;
}

function backupCsvCell(v) {
  let text;
  if (v === undefined || v === null) text = "";
  else if (typeof v === "object") text = JSON.stringify(v);
  else text = String(v);
  return `"${text.replace(/"/g, '""')}"`;
}

function backupCsvBytes(rows, schema) {
  const headers = (schema || []).map(f => f.field_name);
  const lines = [headers.map(backupCsvCell).join(",")];
  for (const row of rows || []) lines.push(headers.map(h => backupCsvCell((row.fields || {})[h])).join(","));
  return new TextEncoder().encode('\ufeff' + lines.join("\r\n"));
}

function backupXlsBytes(label, rows, schema) {
  const headers = (schema || []).map(f => f.field_name);
  const escHtml = v => String(v ?? "").replace(/[&<>]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));
  const cell = v => escHtml(v === undefined || v === null ? "" : (typeof v === "object" ? JSON.stringify(v) : String(v)));
  const head = headers.map(h => `<th>${escHtml(h)}</th>`).join("");
  const body = (rows || []).map(r => `<tr>${headers.map(h => `<td>${cell((r.fields || {})[h])}</td>`).join("")}</tr>`).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif}table{border-collapse:collapse}th,td{border:1px solid #999;padding:5px;mso-number-format:'\\@'}th{background:#e8eef8}</style></head><body><h2>${escHtml(label)}</h2><p>Generated ${escHtml(new Date().toISOString())}</p><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`;
  return new TextEncoder().encode(html);
}

function backupJsonBytes(value) {
  return new TextEncoder().encode(JSON.stringify(value, null, 2));
}

async function backupSha256Hex(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const digest = await crypto.subtle.digest("SHA-256", view);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2,"0")).join("");
}

function backupAttachmentItems(value) {
  const out = [];
  const seen = new Set();
  const walk = v => {
    if (!v) return;
    if (Array.isArray(v)) return v.forEach(walk);
    if (typeof v !== "object") return;
    const token = norm(v.file_token || v.token);
    if (token && !seen.has(token)) {
      seen.add(token);
      out.push({ token, name: backupSafeName(v.name || v.file_name || v.title || `${token}.bin`, `${token}.bin`) });
    }
    for (const child of Object.values(v)) if (child && typeof child === "object") walk(child);
  };
  walk(value);
  return out;
}


function backupUrlItems(value) {
  const out = [];
  const seen = new Set();
  const walk = v => {
    if (!v) return;
    if (Array.isArray(v)) return v.forEach(walk);
    if (typeof v === "string") {
      const u = norm(v);
      if (/^https?:\/\//i.test(u) && !seen.has(u)) { seen.add(u); out.push({ url:u, name:"" }); }
      return;
    }
    if (typeof v !== "object") return;
    const u = norm(v.link || v.url || v.href);
    if (/^https?:\/\//i.test(u) && !seen.has(u)) { seen.add(u); out.push({ url:u, name:backupSafeName(v.text || v.name || "linked-file", "linked-file") }); }
    for (const child of Object.values(v)) if (child && typeof child === "object") walk(child);
  };
  walk(value);
  return out;
}

async function backupFetchUrlBytes(item, index) {
  const res = await fetch(item.url, { redirect:"follow" });
  if (!res.ok) throw new Error(`Linked file download failed (${res.status}) from ${item.url.slice(0,180)}`);
  const ct = res.headers.get("content-type") || "application/octet-stream";
  const cd = res.headers.get("content-disposition") || "";
  const m = cd.match(/filename\*?=(?:UTF-8''|\")?([^";]+)/i);
  let name = item.name || (m ? decodeURIComponent(m[1].replace(/^"|"$/g,"")) : "");
  if (!name || name === "linked-file") {
    try { const u = new URL(item.url); name = decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() || `linked-file-${index}`); } catch { name = `linked-file-${index}`; }
  }
  return { bytes:new Uint8Array(await res.arrayBuffer()), contentType:ct, name:backupSafeName(name,`linked-file-${index}`) };
}

async function backupFetchAttachmentBytes(env, tableId, fileToken) {
  const token = await larkToken(env);
  const extra = encodeURIComponent(JSON.stringify({ bitablePerm: { tableId } }));
  const url = `https://open.larksuite.com/open-apis/drive/v1/medias/${encodeURIComponent(fileToken)}/download?extra=${extra}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Lark attachment download failed (${res.status}): ${text.slice(0,300)}`);
  }
  return { bytes:new Uint8Array(await res.arrayBuffer()), contentType:res.headers.get("content-type") || "application/octet-stream" };
}

async function backupTableSchema(env, tableId) {
  const data = await larkFetch(env, `/bitable/v1/apps/${env.LARK_BASE_TOKEN}/tables/${tableId}/fields`);
  return data.data?.items || [];
}

function restoreBackupTableConfigs(env) {
  const candidates = [
    ["users","User & Company Details","USER_TABLE_ID",env.USER_TABLE_ID],
    ["spareParts","Spare Part List","SPARE_LIST_TABLE_ID",env.SPARE_LIST_TABLE_ID],
    ["spareUae","Spare Orders - UAE & Other Region",env.ORDER_UAE_TABLE_ID?"ORDER_UAE_TABLE_ID":"SPARE_ORDER_UAE_TABLE_ID",env.ORDER_UAE_TABLE_ID || env.SPARE_ORDER_UAE_TABLE_ID],
    ["spareKsa","Spare Orders - KSA",env.ORDER_KSA_TABLE_ID?"ORDER_KSA_TABLE_ID":"SPARE_ORDER_KSA_TABLE_ID",env.ORDER_KSA_TABLE_ID || env.SPARE_ORDER_KSA_TABLE_ID],
    ["repairUae","Repair Cases - UAE & Other Region",env.REPAIR_UAE_TABLE_ID?"REPAIR_UAE_TABLE_ID":"REPAIR_CASE_UAE_TABLE_ID",env.REPAIR_UAE_TABLE_ID || env.REPAIR_CASE_UAE_TABLE_ID],
    ["repairKsa","Repair Cases - KSA",env.REPAIR_KSA_TABLE_ID?"REPAIR_KSA_TABLE_ID":"REPAIR_CASE_KSA_TABLE_ID",env.REPAIR_KSA_TABLE_ID || env.REPAIR_CASE_KSA_TABLE_ID],
    ["internalRepairUae","Internal Repair Register - UAE & Other Region","INTERNAL_REPAIR_UAE_TABLE_ID",env.INTERNAL_REPAIR_UAE_TABLE_ID],
    ["internalRepairKsa","Internal Repair Register - KSA","INTERNAL_REPAIR_KSA_TABLE_ID",env.INTERNAL_REPAIR_KSA_TABLE_ID],
    ["internalSpare","Internal Spare Order details","SPARE_ORDER_DETAILS_TABLE_ID",env.SPARE_ORDER_DETAILS_TABLE_ID],
    ["dealerRepair","Dealer Repair Case","DEALER_REPAIR_CASE_TABLE_ID",env.DEALER_REPAIR_CASE_TABLE_ID],
    ["warranty","Warranty Status","WARRANTY_STATUS_TABLE_ID",env.WARRANTY_STATUS_TABLE_ID],
    ["software","Software Status","SOFTWARE_STATUS_TABLE_ID",env.SOFTWARE_STATUS_TABLE_ID],
    ["flycart","Flycart Credit Use","FLYCART_CREDIT_USE_TABLE_ID",env.FLYCART_CREDIT_USE_TABLE_ID],
    ["portalNotes","Portal Notes","PORTAL_NOTES_TABLE_ID",env.PORTAL_NOTES_TABLE_ID],
    ["contracts","Contract & Document - Internal",env.CONTRACT_DOCUMENT_INTERNAL_TABLE_ID?"CONTRACT_DOCUMENT_INTERNAL_TABLE_ID":env.INTERNAL_CONTRACT_DOCUMENT_TABLE_ID?"INTERNAL_CONTRACT_DOCUMENT_TABLE_ID":"CONTRACT_DOCUMENT_TABLE_ID",env.CONTRACT_DOCUMENT_INTERNAL_TABLE_ID || env.INTERNAL_CONTRACT_DOCUMENT_TABLE_ID || env.CONTRACT_DOCUMENT_TABLE_ID],
    ["afterSales","After Sales Support Register","AFTER_SALES_SUPPORT_TABLE_ID",env.AFTER_SALES_SUPPORT_TABLE_ID]
  ];
  const byId = new Map();
  for (const [key,label,envKey,tableId] of candidates) {
    if (!tableId) continue;
    if (!byId.has(tableId)) byId.set(tableId,{ key,label,envKey,tableId });
  }
  return [...byId.values()];
}

async function openPlainFtpSession({ host, port, username, password }) {
  if (!username) throw new Error("NAS username is required");
  if (!password) throw new Error("Cloudflare secret NAS_BACKUP_PASSWORD is not configured");
  const cleanHost = norm(host).replace(/^ftp:\/\//i, "").replace(/\/$/, "");
  const socket = connect({ hostname:cleanHost, port }, { secureTransport:"off", allowHalfOpen:true });
  await Promise.race([socket.opened, socketTimeout(10000, "FTP TCP connection timed out")]);
  const reader = socket.readable.getReader();
  const writer = socket.writable.getWriter();
  const welcome = await readFtpReply(reader, 10000);
  if (welcome.code !== "220") throw new Error(`FTP server did not return 220: ${welcome.text.slice(0,300)}`);
  const userReply = await ftpCommand(writer, reader, `USER ${username}`, ["230","331"]);
  if (userReply.code === "331") await ftpCommand(writer, reader, `PASS ${password}`, ["230"]);
  await ftpCommand(writer, reader, "TYPE I", ["200"]);
  return { host:cleanHost, socket, reader, writer };
}

async function closeFtpSession(session) {
  if (!session) return;
  try { await ftpCommand(session.writer, session.reader, "QUIT", ["221"]); } catch {}
  try { session.reader.releaseLock(); } catch {}
  try { session.writer.releaseLock(); } catch {}
  try { await session.socket.close(); } catch {}
}

async function ftpEnsureDir(session, name) {
  const safe = backupSafeName(name, "folder");
  try { await ftpCommand(session.writer, session.reader, `CWD ${safe}`, ["250"]); return; } catch {}
  try { await ftpCommand(session.writer, session.reader, `MKD ${safe}`, ["257","250"]); } catch (e) {
    // Some FTP servers return 550 when the folder already exists. CWD below is the authoritative check.
  }
  await ftpCommand(session.writer, session.reader, `CWD ${safe}`, ["250"]);
}

async function ftpCwdAbsolute(session, path) {
  const parts = norm(path).split("/").filter(Boolean);
  await ftpCommand(session.writer, session.reader, "CWD /", ["250"]);
  for (const part of parts) await ftpEnsureDir(session, part);
}

async function ftpPassiveSocket(session, timeoutLabel="FTP data") {
  const epsv = await ftpCommand(session.writer, session.reader, "EPSV", ["229"]);
  const dataPort = parseEpsvPort(epsv.text);
  const dataSocket = connect({ hostname:session.host, port:dataPort }, { secureTransport:"off", allowHalfOpen:true });
  await Promise.race([dataSocket.opened, socketTimeout(12000, `${timeoutLabel} connection timed out`)]);
  return dataSocket;
}

async function ftpUploadBytes(session, fileName, bytes) {
  const safeName = backupSafeName(fileName, "file.bin");
  const dataSocket = await ftpPassiveSocket(session, `FTP upload ${safeName}`);
  const dataWriter = dataSocket.writable.getWriter();
  try {
    await session.writer.write(new TextEncoder().encode(`STOR ${safeName}\r\n`));
    const opening = await readFtpReply(session.reader, 10000);
    if (!["125","150"].includes(opening.code)) throw new Error(`STOR failed (${opening.code || "no code"}): ${opening.text.slice(0,300)}`);
    await dataWriter.write(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
    await dataWriter.close();
    const done = await readFtpReply(session.reader, 15000);
    if (!["226","250"].includes(done.code)) throw new Error(`STOR did not complete (${done.code || "no code"}): ${done.text.slice(0,300)}`);
  } finally {
    try { dataWriter.releaseLock(); } catch {}
    try { await dataSocket.close(); } catch {}
  }
  const sizeReply = await ftpCommand(session.writer, session.reader, `SIZE ${safeName}`, ["213"]);
  const remoteSize = Number((sizeReply.text.match(/213\s+(\d+)/) || [])[1] || -1);
  const expectedSize = bytes.byteLength ?? bytes.length ?? 0;
  if (remoteSize !== expectedSize) throw new Error(`NAS size verification failed for ${safeName}: expected ${expectedSize}, got ${remoteSize}`);
  return { name:safeName, size:expectedSize };
}

async function ftpDownloadBytes(session, fileName) {
  const safeName = backupSafeName(fileName, "file.bin");
  const dataSocket = await ftpPassiveSocket(session, `FTP verify ${safeName}`);
  const dataReader = dataSocket.readable.getReader();
  const chunks = [];
  let total = 0;
  try {
    await session.writer.write(new TextEncoder().encode(`RETR ${safeName}\r\n`));
    const opening = await readFtpReply(session.reader, 10000);
    if (!["125","150"].includes(opening.code)) throw new Error(`RETR failed (${opening.code || "no code"}): ${opening.text.slice(0,300)}`);
    for (;;) {
      const r = await Promise.race([dataReader.read(), socketTimeout(20000, `FTP verify read timed out for ${safeName}`)]);
      if (r.done) break;
      chunks.push(r.value); total += r.value.byteLength;
    }
    const done = await readFtpReply(session.reader, 15000);
    if (!["226","250"].includes(done.code)) throw new Error(`RETR did not complete (${done.code || "no code"}): ${done.text.slice(0,300)}`);
  } finally {
    try { dataReader.releaseLock(); } catch {}
    try { await dataSocket.close(); } catch {}
  }
  const out = new Uint8Array(total); let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.byteLength; }
  return out;
}

async function ftpUploadVerified(session, fileName, bytes, manifestFile) {
  const src = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const sourceHash = await backupSha256Hex(src);
  await ftpUploadBytes(session, fileName, src);
  const readBack = await ftpDownloadBytes(session, fileName);
  const remoteHash = await backupSha256Hex(readBack);
  if (sourceHash !== remoteHash || readBack.byteLength !== src.byteLength) {
    throw new Error(`NAS read-back verification failed for ${fileName}`);
  }
  manifestFile.size = src.byteLength;
  manifestFile.sha256 = sourceHash;
  manifestFile.verified = true;
  return src.byteLength;
}


async function acquireBackupLock(env) {
  const now = Date.now();
  const lock = await backupKvRead(env, BACKUP_LOCK_KEY, null);
  if (lock && Number(lock.expiresAt || 0) > now) throw new Error(`Another backup is already running (started ${lock.startedAt || "recently"})`);
  const value = { startedAt:new Date(now).toISOString(), expiresAt:now + 2 * 60 * 60 * 1000 };
  await backupKvWrite(env, BACKUP_LOCK_KEY, value);
  return value;
}

async function releaseBackupLock(env) {
  if (!env.KINGDEE_LOGS) return;
  try { await env.KINGDEE_LOGS.delete(BACKUP_LOCK_KEY); } catch {}
}

async function runRestoreGradeBackup(env, settings, trigger="Manual") {
  const started = Date.now();
  const startedAt = new Date().toISOString();
  if (lower(settings.protocol) !== "ftp") throw new Error("Full backup currently requires the confirmed working FTP protocol. FTPS/SFTP remain available for connectivity testing.");
  if (!settings.host || !settings.username || !settings.remoteFolder) throw new Error("NAS Host, Username, and Remote Folder must be configured");
  const tables = restoreBackupTableConfigs(env);
  if (!tables.length) throw new Error("No configured Lark tables were found for backup");
  const stamp = startedAt.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const backupFolder = `AERONEX_RMA_${stamp}`;
  const session = await openPlainFtpSession({ host:settings.host, port:nasPort(settings.port,21), username:settings.username, password:norm(env.NAS_BACKUP_PASSWORD) });
  const manifest = {
    format:"AERONEX-RMA-RESTORE-BACKUP-v1",
    createdAt:startedAt,
    trigger,
    larkBaseToken:env.LARK_BASE_TOKEN || "",
    restoreReady:false,
    verification:"SHA-256 read-back verification for every uploaded file",
    totals:{ tables:0, records:0, attachments:0, files:0, bytes:0 },
    tables:[], failures:[]
  };
  try {
    await ftpCwdAbsolute(session, settings.remoteFolder);
    await ftpEnsureDir(session, backupFolder);
    const backupRootPwd = await ftpCommand(session.writer, session.reader, "PWD", ["257"]);

    for (const table of tables) {
      const tableEntry = { key:table.key, label:table.label, envKey:table.envKey, tableId:table.tableId, schemaFile:"", rawFile:"", csvFile:"", excelFile:"", records:0, attachments:0, files:[], failures:[] };
      manifest.tables.push(tableEntry);
      try {
        const schema = await backupTableSchema(env, table.tableId);
        const rows = await listRecords(env, table.tableId);
        tableEntry.records = rows.length;
        manifest.totals.tables++;
        manifest.totals.records += rows.length;
        const tableFolder = backupSafeName(`${table.key}-${table.label}`, table.key);
        await ftpEnsureDir(session, "Tables");
        await ftpEnsureDir(session, tableFolder);

        const schemaName = "schema.json";
        const rawName = "records.json";
        const csvName = "records.csv";
        const xlsName = "records.xls";
        for (const [name, bytes, kind] of [
          [schemaName, backupJsonBytes({ key:table.key,label:table.label,envKey:table.envKey,tableId:table.tableId,fields:schema }), "schema"],
          [rawName, backupJsonBytes({ key:table.key,label:table.label,envKey:table.envKey,tableId:table.tableId,records:rows }), "raw"],
          [csvName, backupCsvBytes(rows,schema), "csv"],
          [xlsName, backupXlsBytes(table.label,rows,schema), "excel"]
        ]) {
          const mf = { path:`Tables/${tableFolder}/${name}`, kind, verified:false };
          tableEntry.files.push(mf); manifest.totals.files++;
          manifest.totals.bytes += await ftpUploadVerified(session,name,bytes,mf);
          if (kind === "schema") tableEntry.schemaFile = mf.path;
          if (kind === "raw") tableEntry.rawFile = mf.path;
          if (kind === "csv") tableEntry.csvFile = mf.path;
          if (kind === "excel") tableEntry.excelFile = mf.path;
        }

        await ftpCommand(session.writer, session.reader, "CDUP", ["250"]); // Tables
        await ftpCommand(session.writer, session.reader, "CDUP", ["250"]); // backup root
        await ftpEnsureDir(session, "Cases");
        await ftpEnsureDir(session, tableFolder);
        const primary = schema.find(f => f.is_primary) || schema[0];
        const attachmentFields = new Set(schema.filter(f => Number(f.type) === 17).map(f => f.field_name));
        const urlFields = new Set(schema.filter(f => Number(f.type) === 15).map(f => f.field_name));
        for (const row of rows) {
          const caseName = backupSafeName(fieldText((row.fields || {})[primary?.field_name]) || row.record_id, row.record_id || "record");
          await ftpEnsureDir(session, caseName);
          const recMeta = {
            record_id:row.record_id,
            created_time:row.created_time ?? row.createdTime ?? null,
            last_modified_time:row.last_modified_time ?? row.lastModifiedTime ?? null,
            fields:row.fields || {},
            source:{ tableId:table.tableId, envKey:table.envKey, tableKey:table.key, primaryField:primary?.field_name || "" }
          };
          const recMf = { path:`Cases/${tableFolder}/${caseName}/record.json`, kind:"record", verified:false };
          tableEntry.files.push(recMf); manifest.totals.files++;
          manifest.totals.bytes += await ftpUploadVerified(session,"record.json",backupJsonBytes(recMeta),recMf);
          for (const fieldName of attachmentFields) {
            const items = backupAttachmentItems((row.fields || {})[fieldName]);
            if (!items.length) continue;
            const fieldFolder = backupSafeName(fieldName,"Attachments");
            await ftpEnsureDir(session, fieldFolder);
            let n = 0;
            for (const item of items) {
              n++;
              const baseFileName = backupSafeName(item.name || `${fieldFolder}-${n}.bin`, `${fieldFolder}-${n}.bin`);
              const fileName = backupSafeName(`${String(n).padStart(2,"0")}-${baseFileName}`, `${fieldFolder}-${n}.bin`);
              try {
                const dl = await backupFetchAttachmentBytes(env, table.tableId, item.token);
                const mf = { path:`Cases/${tableFolder}/${caseName}/${fieldFolder}/${fileName}`, kind:"attachment", fieldName, fileToken:item.token, contentType:dl.contentType, verified:false };
                tableEntry.files.push(mf); manifest.totals.files++;
                manifest.totals.bytes += await ftpUploadVerified(session,fileName,dl.bytes,mf);
                tableEntry.attachments++; manifest.totals.attachments++;
              } catch (e) {
                const failure = { table:table.label, tableId:table.tableId, recordId:row.record_id, case:caseName, field:fieldName, fileToken:item.token, fileName, error:e.message || String(e) };
                tableEntry.failures.push(failure); manifest.failures.push(failure);
              }
            }
            await ftpCommand(session.writer, session.reader, "CDUP", ["250"]);
          }
          for (const fieldName of urlFields) {
            const links = backupUrlItems((row.fields || {})[fieldName]);
            if (!links.length) continue;
            const fieldFolder = backupSafeName(`${fieldName}-Linked-Files`,"Linked-Files");
            await ftpEnsureDir(session, fieldFolder);
            let n = 0;
            for (const link of links) {
              n++;
              try {
                const dl = await backupFetchUrlBytes(link,n);
                const fileName = backupSafeName(`${String(n).padStart(2,"0")}-${dl.name}`,`linked-file-${n}`);
                const mf = { path:`Cases/${tableFolder}/${caseName}/${fieldFolder}/${fileName}`, kind:"linked-file", fieldName, sourceUrl:link.url, contentType:dl.contentType, verified:false };
                tableEntry.files.push(mf); manifest.totals.files++;
                manifest.totals.bytes += await ftpUploadVerified(session,fileName,dl.bytes,mf);
                tableEntry.attachments++; manifest.totals.attachments++;
              } catch (e) {
                const failure = { table:table.label, tableId:table.tableId, recordId:row.record_id, case:caseName, field:fieldName, sourceUrl:link.url, error:e.message || String(e) };
                tableEntry.failures.push(failure); manifest.failures.push(failure);
              }
            }
            await ftpCommand(session.writer, session.reader, "CDUP", ["250"]);
          }
          await ftpCommand(session.writer, session.reader, "CDUP", ["250"]);
        }
        await ftpCommand(session.writer, session.reader, "CDUP", ["250"]); // Cases
        await ftpCommand(session.writer, session.reader, "CDUP", ["250"]); // backup root
      } catch (e) {
        const failure = { table:table.label, tableId:table.tableId, stage:"table_export", error:e.message || String(e) };
        tableEntry.failures.push(failure); manifest.failures.push(failure);
        try { await ftpCwdAbsolute(session, `${settings.remoteFolder}/${backupFolder}`); } catch {}
      }
    }

    manifest.restoreReady = manifest.failures.length === 0 && manifest.totals.tables === tables.length && manifest.tables.every(t => t.schemaFile && t.rawFile && t.files.every(f => f.verified));
    manifest.completedAt = new Date().toISOString();
    manifest.durationMs = Date.now() - started;
    manifest.destination = `ftp://${settings.host}${settings.remoteFolder}/${backupFolder}`;
    manifest.expectedTableCount = tables.length;
    manifest.actualTableCount = manifest.totals.tables;
    manifest.backupSize = backupFormatBytes(manifest.totals.bytes);

    await ftpCwdAbsolute(session, `${settings.remoteFolder}/${backupFolder}`);
    const manifestMf = { path:"manifest.json", kind:"manifest", verified:false };
    manifest.totals.files++;
    const manifestBytes = backupJsonBytes(manifest);
    manifest.totals.bytes += await ftpUploadVerified(session,"manifest.json",manifestBytes,manifestMf);
    const restoreManifest = {
      format:manifest.format,
      backupFolder,
      createdAt:manifest.createdAt,
      restoreReady:manifest.restoreReady,
      sourceBaseToken:manifest.larkBaseToken,
      tables:manifest.tables.map(t => ({ key:t.key,label:t.label,envKey:t.envKey,sourceTableId:t.tableId,schemaFile:t.schemaFile,rawFile:t.rawFile,recordCount:t.records,attachmentCount:t.attachments })),
      restoreRules:[
        "Validate or recreate table schema from Schema/records metadata before importing records.",
        "Use records.json as the authoritative record source; Excel/CSV are inspection copies only.",
        "Re-upload attachment files and write new Lark file tokens into their original attachment fields.",
        "Preserve source record_id values as audit references; Lark may assign new record IDs during restore.",
        "Verify restored record and attachment counts against this manifest before declaring restore complete."
      ]
    };
    const restoreMf = { path:"restore-manifest.json", kind:"restore-manifest", verified:false };
    manifest.totals.files++;
    manifest.totals.bytes += await ftpUploadVerified(session,"restore-manifest.json",backupJsonBytes(restoreManifest),restoreMf);

    if (manifest.restoreReady) {
      const complete = { backupFolder, completedAt:new Date().toISOString(), restoreReady:true, records:manifest.totals.records, attachments:manifest.totals.attachments, files:manifest.totals.files, bytes:manifest.totals.bytes };
      const completeMf = { path:"BACKUP_COMPLETE.json", kind:"completion-marker", verified:false };
      manifest.totals.files++;
      manifest.totals.bytes += await ftpUploadVerified(session,"BACKUP_COMPLETE.json",backupJsonBytes(complete),completeMf);
    }

    return { manifest, backupFolder, rootReply:backupRootPwd.text };
  } finally {
    await closeFtpSession(session);
  }
}

async function appendBackupHistory(env, entry) {
  const items = await backupKvRead(env, BACKUP_HISTORY_KEY, []);
  const next = [entry, ...(Array.isArray(items) ? items : [])].slice(0, 20);
  await backupKvWrite(env, BACKUP_HISTORY_KEY, next);
}

async function listBackupHistory(env) {
  const items = await backupKvRead(env, BACKUP_HISTORY_KEY, []);
  return (Array.isArray(items) ? items : []).slice(0, 7);
}

async function appendBackupLog(env, entry) {
  const items = await backupKvRead(env, BACKUP_LOGS_KEY, []);
  const next = [entry, ...(Array.isArray(items) ? items : [])].slice(0, 50);
  await backupKvWrite(env, BACKUP_LOGS_KEY, next);
}

async function listBackupLogs(env) {
  const items = await backupKvRead(env, BACKUP_LOGS_KEY, []);
  return (Array.isArray(items) ? items : []).slice(0, 30);
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


  if (p === "/api/download-lark-attachment" && req.method === "GET") {
    const tableId = norm(url.searchParams.get("tableId"));
    const recordId = norm(url.searchParams.get("record_id"));
    const fieldName = norm(url.searchParams.get("fieldName"));
    const fileToken = norm(url.searchParams.get("fileToken"));
    const fileName = norm(url.searchParams.get("name")) || "download";
    const email = lower(url.searchParams.get("email"));
    if (!tableId || !recordId || !fieldName || !fileToken || !email) {
      return json({ error: "Missing attachment download parameters" }, 400);
    }
    if (!allowedAttachmentTables(env).has(tableId)) return json({ error: "Attachment table not allowed" }, 403);
    const user = await attachmentUser(env, email);
    if (!user) return json({ error: "User not found" }, 401);
    const rec = await getRecord(env, tableId, recordId);
    if (!canAccessAttachmentRecord(user, rec.fields || {})) return json({ error: "Forbidden" }, 403);
    const fieldValue = (rec.fields || {})[fieldName];
    if (!attachmentTokens(fieldValue).includes(fileToken)) return json({ error: "Attachment does not belong to this record" }, 403);
    return downloadLarkAttachment(env, tableId, fileToken, fileName);
  }

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


  if (p === "/api/lark-dropdown-options") {
    const country = norm(url.searchParams.get("country"));
    const build = async (tableId) => {
      if (!tableId) return {};
      const data = await larkFetch(env, `/bitable/v1/apps/${env.LARK_BASE_TOKEN}/tables/${tableId}/fields`);
      const out = {};
      for (const field of data.data?.items || []) {
        const options = diagnosticFieldOptions(field);
        if (options.length) out[field.field_name] = [...new Set(options.map(x => norm(x)).filter(Boolean))];
      }
      return out;
    };
    const [order, repair] = await Promise.all([
      build(spareTable(env, country)),
      build(repairTable(env, country))
    ]);
    return json({ ok:true, country:normalizePortalCountry(country), order, repair });
  }

  if (p === "/api/logs-diagnostics/tables") {
    const role = norm(url.searchParams.get("role"));
    if (!logAccessAllowed(role)) return json({ error:"Forbidden" }, 403);

    const selected = norm(url.searchParams.get("table"));
    const configs = logTableConfigs(env);
    const chosen = configs.find(x => x.key === selected || x.name === selected || x.tableId === selected);
    if (!chosen) return json({ error:"Select one Lark table", table:selected }, 400);

    const tables = [await buildLarkTableDiagnostic(env, chosen)];

    return json({
      ok: tables.every(t => t.permission === "OK" || t.permission === "NOT_CONFIGURED"),
      generatedAt: new Date().toISOString(),
      totalTables: tables.length,
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


  if (p === "/api/spare-stock-update/current") {
    const role = norm(url.searchParams.get("role") || req.headers.get("x-user-role"));
    if (lower(role) !== "admin") return json({ error:"Forbidden" }, 403);
    if (!env.SPARE_LIST_TABLE_ID) return json({ error:"SPARE_LIST_TABLE_ID not configured" }, 400);
    const warehouse = lower(url.searchParams.get("warehouse")) === "ksa" ? "ksa" : "uae";
    const rows = await listRecords(env, env.SPARE_LIST_TABLE_ID);
    const meta = await getFieldTypes(env, env.SPARE_LIST_TABLE_ID);
    const names = Object.keys(meta || {});
    const firstExisting = candidates => candidates.find(n => names.includes(n)) || "";
    const stockField = warehouse === "ksa"
      ? firstExisting(["KSA Stock","KSA Local Stock"])
      : firstExisting(["DSO Local Stock","UAE Local Stock","Local Stock"]);
    const materialNameField = firstExisting(["Material Name","Material Description","Description"]);
    if (!stockField) return json({ error:"Required stock field not found", warehouse, availableFields:names }, 400);
    return json({ warehouse, stockField, items:(rows||[]).map(r=>({
      recordId:r.record_id,
      materialCode:fieldText(r.fields?.["Material Code"]),
      materialName:fieldText(r.fields?.[materialNameField]),
      stock:r.fields?.[stockField] ?? null
    })).filter(x=>x.materialCode) });
  }

  if (p === "/api/spare-stock-update/apply" && req.method === "POST") {
    const b = await readBody(req);
    const role = norm(b.role || req.headers.get("x-user-role"));
    if (lower(role) !== "admin") return json({ error:"Forbidden" }, 403);
    if (!env.SPARE_LIST_TABLE_ID) return json({ error:"SPARE_LIST_TABLE_ID not configured" }, 400);
    const warehouse = lower(b.warehouse) === "ksa" ? "ksa" : "uae";
    const items = Array.isArray(b.items) ? b.items.slice(0, 25) : [];
    if (!items.length) return json({ error:"No stock updates supplied" }, 400);
    const meta = await getFieldTypes(env, env.SPARE_LIST_TABLE_ID), names=Object.keys(meta||{});
    const firstExisting = candidates => candidates.find(n => names.includes(n)) || "";
    const stockField = warehouse === "ksa"
      ? firstExisting(["KSA Stock","KSA Local Stock"])
      : firstExisting(["DSO Local Stock","UAE Local Stock","Local Stock"]);
    if (!stockField) return json({ error:"Required stock field not found", warehouse, availableFields:names }, 400);
    const token = await larkToken(env), updated=[], failed=[];
    for (const item of items) {
      const recordId=norm(item.recordId), stock=Number(item.stock);
      if (!recordId) { failed.push({materialCode:item.materialCode||"",error:"Missing record ID"}); continue; }
      if (!Number.isFinite(stock)) { failed.push({recordId,materialCode:item.materialCode||"",error:"Invalid stock value"}); continue; }
      try {
        const res=await fetch(`https://open.larksuite.com/open-apis/bitable/v1/apps/${env.LARK_BASE_TOKEN}/tables/${env.SPARE_LIST_TABLE_ID}/records/${recordId}`,{
          method:"PUT",
          headers:{authorization:`Bearer ${token}`,"content-type":"application/json; charset=utf-8"},
          body:JSON.stringify({fields:{[stockField]:stock}})
        });
        const data=await res.json().catch(()=>({}));
        if(!res.ok||data.code) throw new Error(data.msg||JSON.stringify(data));
        updated.push({recordId,materialCode:item.materialCode||""});
      } catch(e) { failed.push({recordId,materialCode:item.materialCode||"",error:e.message||String(e)}); }
    }
    return json({ok:failed.length===0,warehouse,stockField,updated:updated.length,failed});
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
      if (fieldTypes[k] && v !== undefined && v !== null && v !== "") {
        sendFields[k] = k === "Upload Repair Data" ? toLarkUrlValue(v, "Upload Repair Data") : v;
      }
    }
    if (!Object.keys(sendFields).length) return json({ ok:true, caseNo:dealerRepairCaseNo(row.fields || {}), updated:[], noChanges:true });
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

  if (p === "/api/flycart-credit-use/upload-credit-note" && req.method === "POST") {
    const b = await readBody(req);
    if (!flycartAdminOnly(b.role)) return json({ error:"Forbidden" }, 403);
    const tableId = env.FLYCART_CREDIT_USE_TABLE_ID;
    if (!tableId) return json({ error:"FLYCART_CREDIT_USE_TABLE_ID not configured" }, 400);
    if (!b.record_id || !b.file) return json({ error:"Missing record_id or file" }, 400);
    const fieldMeta = await getFieldMetaByName(env, tableId);
    const field = fieldMeta["Dealer Credit Note Upload"];
    if (!field?.field_id) return json({ error:"Dealer Credit Note Upload field not found" }, 400);
    const uploaded = await uploadBitableAttachmentToLark(env, tableId, b.record_id, field.field_id, b.file);
    const current = await getRecord(env, tableId, b.record_id);
    const existing = Array.isArray(current?.fields?.["Dealer Credit Note Upload"])
      ? current.fields["Dealer Credit Note Upload"].filter(x=>x && x.file_token)
      : [];
    await updateRecord(env, tableId, b.record_id, { "Dealer Credit Note Upload":[...existing, uploaded] });
    return json({ ok:true, uploaded });
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



  if (p === "/api/after-sales-support" && req.method === "GET") {
    const role = norm(url.searchParams.get("role"));
    if (!logAccessAllowed(role)) return json({ error:"Forbidden" }, 403);
    const tableId = env.AFTER_SALES_SUPPORT_TABLE_ID;
    if (!tableId) return json({ error:"AFTER_SALES_SUPPORT_TABLE_ID not configured" }, 400);
    const rows = await listRecords(env, tableId);
    const fields = await getTableFieldsForDiagnostics(env, tableId);
    return json({ ok:true, tableId, rows, fields });
  }

  if (p === "/api/after-sales-support/save" && req.method === "POST") {
    const body = await readBody(req);
    const role = norm(body.role);
    if (!logAccessAllowed(role)) return json({ error:"Forbidden" }, 403);
    const tableId = env.AFTER_SALES_SUPPORT_TABLE_ID;
    if (!tableId) return json({ error:"AFTER_SALES_SUPPORT_TABLE_ID not configured" }, 400);
    const fieldTypes = await getFieldTypes(env, tableId);
    const fields = prepareFieldsForTable(fieldTypes, body.fields || {});
    let recordId = norm(body.record_id);
    if (!Object.keys(fields).length) {
      if (recordId) return json({ ok:true, updated:true, created:false, record_id:recordId, updatedFields:[], noChanges:true });
      return json({ error:"No valid fields to save" }, 400);
    }
    let updated = false;
    if (recordId) {
      await updateRecord(env, tableId, recordId, fields);
      updated = true;
    } else {
      const created = await createRecord(env, tableId, fields);
      recordId = created.data?.record?.record_id || created.data?.record_id || created.data?.record?.id || "";
      if (!recordId) {
        const caseNo = norm((body.fields || {})["DJI Case Number"]);
        const rows = await listRecords(env, tableId);
        const match = [...rows].reverse().find(r => norm((r.fields || {})["DJI Case Number"]) === caseNo);
        recordId = match?.record_id || "";
      }
    }
    const files = Array.isArray(body.files) ? body.files : [];
    if (files.length) {
      if (!recordId) return json({ error:"Case saved but record_id was not returned for attachment upload" }, 500);
      const meta = await getFieldMetaByName(env, tableId);
      const attachmentField = meta["Attachment"];
      if (!attachmentField) return json({ error:"Attachment field not found in Lark table" }, 400);
      const current = updated ? await getRecord(env, tableId, recordId) : null;
      const existing = Array.isArray(current?.fields?.["Attachment"]) ? current.fields["Attachment"] : [];
      const uploaded = [];
      for (const file of files) uploaded.push(await uploadBitableAttachmentToLark(env, tableId, recordId, attachmentField.field_id, file));
      await updateRecord(env, tableId, recordId, { "Attachment":[...existing, ...uploaded] });
    }
    return json({ ok:true, updated, created:!updated, record_id:recordId });
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
    if (!Object.keys(fields).length && norm(b.record_id)) return json({ ok:true, updated:true, record_id:norm(b.record_id), updatedFields:[], noChanges:true });
    if (!Object.keys(fields).length) return json({ error:"No valid fields to save" }, 400);

    // Update-only protection: if the browser loses record_id, identify the
    // existing case by its stable case fields and update that same Lark row.
    let targetRecordId = norm(b.record_id);
    if (!targetRecordId) {
      const existingRows = await listInternalRepairRows(env, country);
      const existing = findExistingInternalRepair(existingRows, b.fields || {});
      targetRecordId = existing?.record_id || "";
    }
    if (targetRecordId) {
      await updateRecord(env, tableId, targetRecordId, fields);
      const repairSync = await syncInternalRepairSharedFieldsToRepair(env, country, b.fields || {});
      return json({ ok:true, updated:true, record_id:targetRecordId, matchedExisting:!b.record_id, repairSync });
    }

    // Creation is allowed only when no existing case can be found.
    const rec = await createRecord(env, tableId, fields);
    const repairSync = await syncInternalRepairSharedFieldsToRepair(env, country, b.fields || {});
    return json({ ok:true, created:true, record:rec.data || rec, repairSync });
  }

  
  if (p === "/api/upload-internal-shipping-document" && req.method === "POST") {
    const b = await readBody(req);
    const role = norm(b.role);
    const module = lower(b.module || "");
    let tableId = "";

    if (module === "internalspare") {
      if (!flycartAdminOnly(role)) return json({ error:"Forbidden" }, 403);
      tableId = env.SPARE_ORDER_DETAILS_TABLE_ID;
      if (!tableId) return json({ error:"SPARE_ORDER_DETAILS_TABLE_ID not configured" }, 400);
    } else if (module === "internalrepair") {
      if (!logAccessAllowed(role)) return json({ error:"Forbidden" }, 403);
      const country = scopedModuleCountry(role, b.country || "UAE & Other Region", b.userCountry || "");
      tableId = internalRepairTable(env, country);
      if (!tableId) return json({ error:"Internal Repair table id not configured" }, 400);
    } else {
      return json({ error:"Invalid module" }, 400);
    }

    if (!b.record_id) return json({ error:"Missing record_id" }, 400);
    const inputFiles = Array.isArray(b.files) && b.files.length ? b.files : (b.file ? [b.file] : []);
    if (!inputFiles.length) return json({ error:"No file received" }, 400);

    const fieldMeta = await getFieldMetaByName(env, tableId);
    const shippingField = fieldMeta["Shipping Document"];
    if (!shippingField) return json({ error:"Shipping Document field not found" }, 400);
    const fieldId = shippingField.field_id;
    if (!fieldId) return json({ error:"Shipping Document field_id not found" }, 400);

    const uploaded = [];
    for (const file of inputFiles) {
      uploaded.push(await uploadBitableAttachmentToLark(env, tableId, b.record_id, fieldId, file));
    }

    const current = await getRecord(env, tableId, b.record_id);
    const currentValue = current?.fields?.["Shipping Document"];
    const existing = Array.isArray(currentValue) ? currentValue.filter(x => x && x.file_token) : [];
    await updateRecord(env, tableId, b.record_id, { "Shipping Document": [...existing, ...uploaded] });
    return json({ ok:true, uploaded });
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
    const incomingFields = { ...(b.fields || {}) };
    if (Object.prototype.hasOwnProperty.call(incomingFields, "DJI Cost")) {
      const raw = incomingFields["DJI Cost"];
      if (fieldTypes["DJI Cost"] === 2) {
        const numeric = Number(String(raw ?? "").replace(/,/g, "").replace(/[^0-9.-]/g, "").trim());
        if (Number.isFinite(numeric)) incomingFields["DJI Cost"] = numeric;
      } else if (raw !== undefined && raw !== null) {
        incomingFields["DJI Cost"] = String(raw).trim();
      }
    }
    const fields = prepareFieldsForTable(fieldTypes, incomingFields);
    if (!Object.keys(fields).length && norm(b.record_id)) {
      return json({ ok:true, record_id:norm(b.record_id), updated:[], noChanges:true });
    }
    if (!Object.keys(fields).length) {
      return json({ error:"No valid fields to save", received:Object.keys(b.fields || {}), available:Object.keys(fieldTypes || {}) }, 400);
    }
    let targetRecordId = norm(b.record_id);
    if (!targetRecordId) {
      const existingRows = await listSpareOrderDetailsRows(env);
      const existing = findExistingInternalSpareOrder(existingRows, b.fields || {});
      targetRecordId = existing?.record_id || "";
    }
    if (targetRecordId) {
      const result = await updateRecordBestEffort(env, tableId, targetRecordId, fields);
      return json({ ...result, record_id:targetRecordId, matchedExisting:!b.record_id });
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

    // Duplicate guard for accidental double-click/browser retry.
    // Match the same dealer and exact submitted material/quantity set within two minutes.
    const normalizedItems = items.map(i => ({
      code: lower(i.materialCode || i["Material Code"] || ""),
      name: lower(i.materialName || i["Material Name"] || ""),
      qty: String(i.qty || i.Qty || 1).trim()
    }));
    const submittedCodes = normalizedItems.map(i => i.code).filter(Boolean).join(", ");
    const submittedNames = normalizedItems.map(i => i.name).filter(Boolean).join(", ");
    const submittedQty = normalizedItems.map(i => i.qty).join(", ");
    const recentRows = await listRecords(env, tableId);
    const duplicate = recentRecord(recentRows, 2 * 60 * 1000, f =>
      lower(fieldText(f["Company Name"])) === lower(b.companyName || "") &&
      lower(fieldText(f["Contact Name"])) === lower(b.contactName || "") &&
      lower(fieldText(f["Material Code"])) === submittedCodes &&
      lower(fieldText(f["Material Name"])) === submittedNames &&
      String(fieldText(f["Qty"]) || "").trim() === submittedQty &&
      lower(fieldText(f["Status"])) === "submitted"
    );
    if (duplicate) {
      const existingNo = assertValidSpareOrderNo(spareOrderNo(duplicate.fields || {}));
      return json({ ok:true, duplicatePrevented:true, orderNo:existingNo, tableId, record_id:duplicate.record_id, piGenerationRequired:true });
    }

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

    // Step 3: do not generate the legacy HTML-based .xls file here.
    // The browser creates the real template-based .xlsx and uploads it through
    // /api/upload-generated-order-xlsx after this request succeeds.
    const updateFields = {};
// Only update order number fields if they are writable. Formula/autonumber fields may ignore or reject; errors are non-fatal.
    if (fieldTypes["Spare Order Case"]) updateFields["Spare Order Case"] = no;
    if (fieldTypes["Spare Order No"]) updateFields["Spare Order No"] = no;
    if (Object.keys(updateFields).length) {
      try { await updateRecord(env, tableId, recordId, updateFields); } catch (_) {}
    }

    return json({ ok: true, orderNo: no, tableId, record_id: recordId, piGenerationRequired: true, result: result.data });
  }


  if (p === "/api/update-spare-order" && req.method === "POST") {
    const b = await readBody(req);
    if (!logAccessAllowed(norm(b.role))) return json({ error:"Forbidden" }, 403);
    const tableId = norm(b.tableId);
    const recordId = norm(b.record_id);
    const allowed = [env.SPARE_ORDER_UAE_TABLE_ID, env.SPARE_ORDER_KSA_TABLE_ID, env.ORDER_UAE_TABLE_ID, env.ORDER_KSA_TABLE_ID].filter(Boolean);
    if (!tableId || !recordId) return json({ error:"Missing tableId or record_id" }, 400);
    if (!allowed.includes(tableId)) return json({ error:"Invalid spare order table" }, 403);
    const current = await getRecord(env, tableId, recordId);
    const orderNo = assertValidSpareOrderNo(spareOrderNo(current.fields || {}));
    const items = Array.isArray(b.items) ? b.items : [];
    if (!items.length) return json({ error:"Add at least one item" }, 400);
    const requested = {
      "Company Name": b.companyName || "",
      "Contact Name": b.contactName || "",
      "Billing Address": b.billingAddress || "",
      "Invoice Address": b.billingAddress || "",
      "Invoice Currency": b.invoiceCurrency || current.fields?.["Invoice Currency"] || "USD",
      "Material Name": items.map(i=>i.materialName || i["Material Name"] || "").join(", "),
      "Material Code": items.map(i=>i.materialCode || i["Material Code"] || "").join(", "),
      "Qty": items.map(i=>i.qty || i.Qty || 1).join(", "),
      "Remarks": b.remarks || ""
    };
    const fieldTypes = await getFieldTypes(env, tableId);
    const fields = prepareFieldsForTable(fieldTypes, requested);
    if (!Object.keys(fields).length) return json({ ok:true, updated:false, noChanges:true, orderNo, tableId, record_id:recordId });
    await updateRecord(env, tableId, recordId, fields);
    return json({ ok:true, updated:true, orderNo, tableId, record_id:recordId });
  }

  if ((p === "/api/create-repair" || p === "/api/repair-case") && req.method === "POST") {
    const b = await readBody(req);
    const country = norm(b.country || "UAE & Other Region");
    const tableId = repairTable(env, country);
    const prefix = lower(country).includes("ksa") ? "KSARMA" : "DXBRMA";
    const no = `${prefix}${new Date().toISOString().replace(/\D/g, "").slice(0, 12)}`;

    // Duplicate guard for accidental double-click/browser retry.
    const recentRepairs = await listRecords(env, tableId);
    const duplicateRepair = recentRecord(recentRepairs, 2 * 60 * 1000, f =>
      lower(fieldText(f["Company Name"] || f["Name"])) === lower(b.companyName || "") &&
      lower(fieldText(f["Model No"])) === lower(b.modelNo || b.model || "") &&
      lower(fieldText(f["Serial No"])) === lower(b.serialNo || b.serial || "") &&
      lower(fieldText(f["Details Of Issue"] || f["Issue Description"])) === lower(b.details || b.issueDescription || b.issue || b.description || "") &&
      lower(fieldText(f["Status"])) === "submitted"
    );
    if (duplicateRepair) {
      const existingFields = duplicateRepair.fields || {};
      const existingNo = fieldText(existingFields["REPAIR CASE"] || existingFields["Repair Case"] || existingFields["Repair Case No"]);
      return json({ ok:true, duplicatePrevented:true, repairNo:existingNo, caseNo:existingNo, record_id:duplicateRepair.record_id, tableId });
    }

    const uploadRequiredLink = b.requiredDetailsLink || b.uploadRequiredDetailsLink || b.uploadAllRequiredDetailsLink || "";
    const logLink = b.logFileLink || b.logFile || "";
    const issueMediaLink = b.issueMediaLink || "";
    const gacaDocument = b.gacaDocument && typeof b.gacaDocument === "object"
      ? b.gacaDocument
      : null;

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

      // GACA Document is a Lark attachment field (type 17).
      // It is uploaded and attached only after the repair record exists.
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
    const recordId = result.data?.record?.record_id || result.data?.record_id;

    // Lark attachment fields cannot accept browser base64 data directly.
    // Create the row first, upload the file to Lark, then attach its file_token
    // to the same Repair Case record.
    if (gacaDocument?.data && fieldTypes["GACA Document"] === 17) {
      if (!recordId) throw new Error("Repair case created but record_id was not returned for GACA attachment");
      const fileName = norm(gacaDocument.name) || `GACA-${no}.pdf`;
      const mimeType = norm(gacaDocument.type) || "application/pdf";
      const bytes = bytesFromDataUrl(gacaDocument.data);
      const fileToken = await larkUploadBitableAttachment(env, bytes, fileName, mimeType);
      await updateRecord(env, tableId, recordId, {
        "GACA Document": larkAttachmentValue(fileToken, fileName)
      });
    }

    // Return the exact final case number stored by Lark. This is important when
    // the case field is an auto-number/formula field and differs from the
    // temporary value used during record creation.
    let savedCaseNo = "";
    if (recordId) {
      for (let attempt = 0; attempt < 3 && !savedCaseNo; attempt++) {
        if (attempt) await new Promise(resolve => setTimeout(resolve, 250));
        try {
          const savedRecord = await getRecord(env, tableId, recordId);
          const savedFields = savedRecord?.fields || {};
          savedCaseNo = fieldText(firstField(savedFields, [
            "REPAIR CASE",
            "Repair Case",
            "Repair Case No",
            "Case Register No"
          ]));
        } catch (_) {}
      }
    }
    if (!savedCaseNo) savedCaseNo = no;

    return json({ ok: true, repairNo: savedCaseNo, caseNo: savedCaseNo, record_id: recordId, tableId, result: result.data, sentFields: Object.keys(sendFields) });
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
    if (fieldTypes["Invoice Amount"]) fields["Invoice Amount"] = b.invoiceAmount || "";
    if (fieldTypes["Shipment Cost ( AED )"]) fields["Shipment Cost ( AED )"] = b.shipmentCostAed || "";
    if (fieldTypes["DJI Case NO"]) fields["DJI Case NO"] = b.djiCaseNo || "";
    else if (fieldTypes["DJI case NO"]) fields["DJI case NO"] = b.djiCaseNo || "";
    if (fieldTypes["Dealer Credit No"]) fields["Dealer Credit No"] = b.dealerCreditNo || "";
    const safeFields = prepareFieldsForTable(fieldTypes, fields);
    if (!Object.keys(safeFields).length) return json({ ok:true, updated:[], noChanges:true });
    await updateRecord(env, b.tableId, b.record_id, safeFields);
    return json({ ok:true, updated:Object.keys(safeFields) });
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


  if (p === "/api/report-backup/reports") {
    const role = norm(url.searchParams.get("role") || req.headers.get("x-user-role"));
    if (!reportBackupAccessAllowed(role)) return json({ error:"Forbidden" }, 403);
    const cfg = reportBackupTableConfigs(env);
    return json({ reports: Object.entries(cfg).map(([key, v]) => ({ key, label:v.label, configured:!!v.tableId })) });
  }

  if (p === "/api/report-backup/preview") {
    const role = norm(url.searchParams.get("role") || req.headers.get("x-user-role"));
    if (!reportBackupAccessAllowed(role)) return json({ error:"Forbidden" }, 403);
    const key = norm(url.searchParams.get("report"));
    const cfg = reportBackupTableConfigs(env)[key];
    if (!cfg || !cfg.tableId) return json({ error:"Report/table not configured" }, 400);
    const filters = {
      dateFrom: norm(url.searchParams.get("dateFrom")),
      dateTo: norm(url.searchParams.get("dateTo")),
      company: norm(url.searchParams.get("company")),
      status: norm(url.searchParams.get("status")),
      caseId: norm(url.searchParams.get("caseId"))
    };
    const rows = await reportBackupRows(env, cfg.tableId, filters);
    return json({ ok:true, report:key, label:cfg.label, count:rows.length });
  }

  if (p === "/api/report-backup/download") {
    const role = norm(url.searchParams.get("role") || req.headers.get("x-user-role"));
    if (!reportBackupAccessAllowed(role)) return json({ error:"Forbidden" }, 403);
    const key = norm(url.searchParams.get("report"));
    const cfg = reportBackupTableConfigs(env)[key];
    if (!cfg || !cfg.tableId) return json({ error:"Report/table not configured" }, 400);
    const filters = {
      dateFrom: norm(url.searchParams.get("dateFrom")),
      dateTo: norm(url.searchParams.get("dateTo")),
      company: norm(url.searchParams.get("company")),
      status: norm(url.searchParams.get("status")),
      caseId: norm(url.searchParams.get("caseId"))
    };
    const rows = await reportBackupRows(env, cfg.tableId, filters);
    const file = `${key}-report-${new Date().toISOString().slice(0,10)}.xls`;
    return new Response(reportWorkbookBytes(cfg.label, rows, filters), {
      headers: { "content-type":"application/vnd.ms-excel; charset=utf-8", "content-disposition":`attachment; filename="${file}"` }
    });
  }

  if (p === "/api/report-backup/status") {
    const role = norm(url.searchParams.get("role") || req.headers.get("x-user-role"));
    if (!reportBackupAccessAllowed(role)) return json({ error:"Forbidden" }, 403);
    const settings = await getBackupSettings(env);
    const history = await listBackupHistory(env);
    const logs = await listBackupLogs(env);
    return json({
      ok:true,
      status: history[0]?.status || "Not configured",
      lastBackupTime: history[0]?.date || "-",
      backupDuration: history[0]?.duration || "-",
      totalRecords: history[0]?.records || "-",
      totalAttachments: history[0]?.attachments || "-",
      backupSize: history[0]?.size || "-",
      nasConnectionStatus: settings.host ? "Configured" : "Not configured",
      credentialConfigured: !!norm(env.NAS_BACKUP_PASSWORD),
      retention: `Last ${Number(settings.retentionDays || 3)} days`,
      settings,
      history,
      logs
    });
  }

  if (p === "/api/report-backup/settings" && req.method === "POST") {
    const role = norm(url.searchParams.get("role") || req.headers.get("x-user-role"));
    if (!reportBackupAccessAllowed(role)) return json({ error:"Forbidden" }, 403);
    const b = await readBody(req);
    const saved = await saveBackupSettings(env, b || {});
    return json({ ok:true, settings:saved });
  }

  if (p === "/api/report-backup/test-nas" && req.method === "POST") {
    const role = norm(url.searchParams.get("role") || req.headers.get("x-user-role"));
    if (!reportBackupAccessAllowed(role)) return json({ error:"Forbidden" }, 403);
    const b = await readBody(req);
    const protocol = lower(b.protocol || "ftps");
    const host = norm(b.host);
    const username = norm(b.username);
    if (!host) return json({ ok:false, status:"Failed", error:"NAS host is required" }, 400);
    if (!["ftp","ftps","sftp"].includes(protocol)) return json({ ok:false, status:"Failed", error:"Supported protocols are FTP, FTPS (Explicit TLS), and SFTP" }, 400);
    const started = Date.now();
    try {
      const result = protocol === "ftps"
        ? await testFtpsExplicitConnection({ host, port:nasPort(b.port, 21), username, password:norm(env.NAS_BACKUP_PASSWORD) })
        : protocol === "ftp"
          ? await testFtpPlainConnection({ host, port:nasPort(b.port, 21), username, password:norm(env.NAS_BACKUP_PASSWORD) })
          : await testSftpReachability({ host, port:nasPort(b.port, 22) });
      const response={ ...result, durationMs:Date.now()-started, host, port:nasPort(b.port, protocol === "sftp" ? 22 : 21), username, remoteFolder:norm(b.remoteFolder), credentialConfigured:!!norm(env.NAS_BACKUP_PASSWORD) };
      await appendBackupLog(env,{ time:new Date().toISOString(), operation:"NAS Connection Test", status:"success", protocol, host, port:response.port, username, remoteFolder:norm(b.remoteFolder), durationMs:response.durationMs, message:result.authenticated===true?"NAS authentication successful":"NAS service reachable", folderCount:Array.isArray(result.folders)?result.folders.length:0 });
      return json(response);
    } catch (e) {
      const response={ ok:false, status:"Failed", protocol, durationMs:Date.now()-started, host, port:nasPort(b.port, protocol === "sftp" ? 22 : 21), username, remoteFolder:norm(b.remoteFolder), credentialConfigured:!!norm(env.NAS_BACKUP_PASSWORD), error:e.message || String(e) };
      await appendBackupLog(env,{ time:new Date().toISOString(), operation:"NAS Connection Test", status:"error", protocol, host, port:response.port, username, remoteFolder:norm(b.remoteFolder), durationMs:response.durationMs, message:response.error, error:response.error });
      return json(response, 200);
    }
  }

  if (p === "/api/report-backup/backup-now" && req.method === "POST") {
    const role = norm(url.searchParams.get("role") || req.headers.get("x-user-role"));
    if (!reportBackupAccessAllowed(role)) return json({ error:"Forbidden" }, 403);
    const settings = await getBackupSettings(env);
    if (!settings.host) return json({ ok:false, status:"Failed", error:"Backup settings are not configured" }, 400);
    const started = Date.now();
    let lockAcquired = false;
    try {
      await acquireBackupLock(env); lockAcquired = true;
      const result = await runRestoreGradeBackup(env, settings, "Manual");
      const m = result.manifest;
      const status = m.restoreReady ? "Success" : (m.totals.records > 0 ? "Partial" : "Failed");
      const entry = {
        date:m.createdAt, status, trigger:"Manual", records:m.totals.records, attachments:m.totals.attachments,
        size:backupFormatBytes(m.totals.bytes), sizeBytes:m.totals.bytes, destination:m.destination,
        duration:`${Math.round((Date.now()-started)/1000)} sec`, durationMs:Date.now()-started,
        restoreReady:!!m.restoreReady, tables:m.totals.tables, expectedTables:m.expectedTableCount,
        files:m.totals.files, failures:m.failures, backupFolder:result.backupFolder,
        message:m.restoreReady ? "Full Lark backup uploaded and read-back verified. Restore package is ready." : `Backup completed with ${m.failures.length} failure(s). Restore Ready: No.`
      };
      await appendBackupHistory(env, entry);
      await appendBackupLog(env,{ time:new Date().toISOString(), operation:"Backup Now", status:m.restoreReady?"success":"error", protocol:settings.protocol, host:settings.host, port:settings.port||"", username:settings.username||"", remoteFolder:settings.remoteFolder||"", durationMs:entry.durationMs, records:entry.records, attachments:entry.attachments, size:entry.size, restoreReady:entry.restoreReady, backupFolder:entry.backupFolder, failures:entry.failures, message:entry.message });
      return json({ ok:m.restoreReady, ...entry }, 200);
    } catch (e) {
      const entry = { date:new Date().toISOString(), status:"Failed", trigger:"Manual", records:0, attachments:0, size:"0 B", destination:`${settings.protocol || "ftp"}://${settings.host}${settings.remoteFolder || ""}`, durationMs:Date.now()-started, restoreReady:false, error:e.message || String(e), message:e.message || String(e) };
      await appendBackupHistory(env, entry);
      await appendBackupLog(env,{ time:entry.date, operation:"Backup Now", status:"error", protocol:settings.protocol||"ftp", host:settings.host, port:settings.port||"", username:settings.username||"", remoteFolder:settings.remoteFolder||"", durationMs:entry.durationMs, restoreReady:false, message:entry.message, error:entry.error });
      return json({ ok:false, ...entry }, 200);
    } finally {
      if (lockAcquired) await releaseBackupLock(env);
    }
  }


  if (p === "/api/update-repair-details" && req.method === "POST") {
    const b = await readBody(req);
    if (!logAccessAllowed(norm(b.role))) return json({ error:"Forbidden" }, 403);
    const allowed = [env.REPAIR_UAE_TABLE_ID, env.REPAIR_KSA_TABLE_ID].filter(Boolean);
    if (!allowed.includes(norm(b.tableId))) return json({ error:"Invalid repair table" }, 403);
    if (!b.record_id) return json({ error:"Missing record_id" }, 400);
    const fieldTypes = await getFieldTypes(env, b.tableId);
    const incoming = { "Invoice Amount":b.invoiceAmount, "Case Close Comment":b.caseCloseComment };
    const fields = prepareFieldsForTable(fieldTypes, incoming);
    if (!Object.keys(fields).length) return json({ ok:true, updated:[], noChanges:true });
    await updateRecord(env, b.tableId, b.record_id, fields);
    return json({ ok:true, updated:Object.keys(fields) });
  }

  if (p === "/api/upload-repair-document" && req.method === "POST") {
    const b = await readBody(req);
    if (!logAccessAllowed(norm(b.role))) return json({ error:"Forbidden" }, 403);
    const allowed = [env.REPAIR_UAE_TABLE_ID, env.REPAIR_KSA_TABLE_ID].filter(Boolean);
    if (!allowed.includes(norm(b.tableId))) return json({ error:"Invalid repair table" }, 403);
    if (!b.record_id || !b.file) return json({ error:"Missing record_id or file" }, 400);
    if (!["Invoice Download","Payment Receipt"].includes(norm(b.fieldName))) return json({ error:"Invalid attachment field" }, 400);
    const fieldMeta = await getFieldMetaByName(env, b.tableId);
    const field = fieldMeta[b.fieldName];
    if (!field?.field_id) return json({ error:`${b.fieldName} field not found` }, 400);
    const uploaded = await uploadBitableAttachmentToLark(env, b.tableId, b.record_id, field.field_id, b.file);
    await updateRecord(env, b.tableId, b.record_id, { [b.fieldName]:[uploaded] });
    return json({ ok:true, uploaded });
  }

  if (p === "/api/update-status" && req.method === "POST") {
    const b = await readBody(req);
    if (!b.tableId || !b.record_id) return json({ error: "Missing tableId/record_id" }, 400);

    await updateRecord(env, b.tableId, b.record_id, { Status: b.status });

    let stockResult = null;
    let internalRepairSync = null;
    if (lower(b.type) === "spare" && lower(b.status) === "closed") {
      const rec = await getRecord(env, b.tableId, b.record_id);
      stockResult = await deductSpareLocalStock(env, b.tableId, b.record_id, rec.fields || {});
    }
    if (lower(b.type) === "repair" && lower(b.status) === "closed") {
      internalRepairSync = await markLinkedInternalRepairClosed(env, b.tableId, b.record_id);
    }

    return json({ ok: true, stockResult, internalRepairSync });
  }

  if (p === "/api/delete-order" && req.method === "POST") {
    const b = await readBody(req);
    if (!b.tableId || !b.record_id) return json({ error: "Missing tableId/record_id" }, 400);
    await deleteRecord(env, b.tableId, b.record_id);
    return json({ ok: true });
  }
if (p === "/api/upload-generated-order-xlsx" && req.method === "POST") {
    const b = await readBody(req);
    const tableId = norm(b.tableId);
    const recordId = norm(b.record_id);
    if (!tableId || !recordId || !b.file?.data) return json({ error: "Missing tableId, record_id or file" }, 400);
    const allowedSpareOrderTables = [env.SPARE_ORDER_UAE_TABLE_ID, env.SPARE_ORDER_KSA_TABLE_ID, env.ORDER_UAE_TABLE_ID, env.ORDER_KSA_TABLE_ID].filter(Boolean);
    if (!allowedSpareOrderTables.includes(tableId)) return json({ error: "Invalid spare order table" }, 403);
    const rec = await getRecord(env, tableId, recordId);
    const no = assertValidSpareOrderNo(spareOrderNo(rec.fields || {}) || b.orderNo);
    const bytes = bytesFromDataUrl(b.file.data);
    const fileName = norm(b.file.name) || `${no}.xlsx`;
    const mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const fileUrl = await putR2(env, getOrderFolderKey(no, "order.xlsx"), bytes, mime);
    const orderFileUpload = await attachOrderExcelToLark(env, tableId, recordId, bytes, fileName, mime);
    return json({ ok: true, orderNo: no, fileUrl, orderFileUpload });
  }

if (p === "/api/download-order-excel") {
    const tableId = norm(url.searchParams.get("tableId"));
    const recordId = norm(url.searchParams.get("record_id"));
    const rec = await getRecord(env, tableId, recordId);
    const fields = rec.fields || {};
    const no = spareOrderNo(fields) || norm(url.searchParams.get("orderNo"));
    if (!no) return json({ error: "Missing order number" }, 400);
    const date = new Date().toISOString().slice(0,10);
    const xlsxKey = getOrderFolderKey(no, "order.xlsx");
    const xlsxName = `${no}_${date}.xlsx`;
    if (env.R2?.get) {
      const xlsxObj = await env.R2.get(xlsxKey);
      if (xlsxObj) return new Response(xlsxObj.body, { headers:{
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${xlsxName}"`
      }});
    }
    const xlsxUrl = `${String(env.R2_PUBLIC_URL || "").replace(/\/+$/, "")}/${xlsxKey}`;
    const xlsxRes = await fetch(xlsxUrl);
    if (xlsxRes.ok) return new Response(xlsxRes.body, { headers:{
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${xlsxName}"`
    }});

    return json({
      error: "PI Excel file not generated yet",
      orderNo: no,
      expectedFile: xlsxName
    }, 404);
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
