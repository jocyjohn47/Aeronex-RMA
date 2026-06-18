let REPAIR_SUBMITTING = false;
let SPARE_SUBMITTING = false;

function isTechnician(){
  return currentUserRoleText().includes('technician') || currentUserRoleText().includes('tech');
}
function isEndUser(){
  return !isAdmin() && !isTechnician();
}



function displayName(){
  const u = S.user || {};
  return u.contactName || u.name || u.companyName || u.email || u.username || 'User';
}
function initials(){
  const name = displayName();
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if(parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return String(name || 'U').slice(0,2).toUpperCase();
}
function roleLabel(){
  const r = currentUserRoleText();
  if(r.includes('admin')) return 'Admin';
  if(r.includes('technician') || r.includes('tech')) return 'Technician';
  return 'End user';
}
function companyName(){
  const u = S.user || {}, f = u.fields || {};
  return u.companyName || f['Company Name'] || '';
}
function contactName(){
  const u = S.user || {}, f = u.fields || {};
  return u.contactName || f['Contact Person'] || f['Contact Name'] || '';
}
function userEmail(){
  const u = S.user || {}, f = u.fields || {};
  return u.email || u.username || f['Username ( Email )'] || f['Email'] || '';
}

function isAdmin(){
  return currentUserIsAdmin();
}
function isAdminTech(){
  return currentUserIsAdminTech();
}
function canManageOrders(){
  return currentUserIsAdminTech();
}

function save(user){
  localStorage.setItem('aeronexUser', JSON.stringify(user || {}));
  localStorage.setItem('aeronex_user', JSON.stringify(user || {}));
  localStorage.setItem('user', JSON.stringify(user || {}));
}
function loadUser(){
  try{
    return JSON.parse(localStorage.getItem('aeronexUser') || localStorage.getItem('aeronex_user') || localStorage.getItem('user') || 'null');
  }catch(e){
    return null;
  }
}
function logout(){
  localStorage.removeItem('aeronexUser');
  localStorage.removeItem('aeronex_user');
  localStorage.removeItem('user');
  location.href='/index.html';
}
function msg(id, text){
  const el = document.getElementById(id);
  if(el) el.textContent = text || '';
}
function requireLogin(){
  if(!S.user || !S.user.email){
    location.href='/index.html';
    return false;
  }
  return true;
}


function currentUserRoleText(){
  const u=S.user||{}, f=u.fields||{};
  return String(
    u.role ||
    u.userRole ||
    u['User Role'] ||
    u.user_role ||
    f['User Role'] ||
    f['User Role '] ||
    f.UserRole ||
    ''
  ).trim().toLowerCase();
}
function currentUserEmailLower(){
  const u=S.user||{}, f=u.fields||{};
  return String(
    u.email ||
    u.username ||
    u['Username ( Email )'] ||
    f['Username ( Email )'] ||
    f.Email ||
    ''
  ).trim().toLowerCase();
}
function currentUserIsAdmin(){
  return currentUserRoleText().includes('admin');
}
function currentUserIsAdminTech(){
  const role=currentUserRoleText();
  return role.includes('admin') ||
         role.includes('technician') ||
         role.includes('technicain') ||
         role.includes('techncian') ||
         role.includes('tech');
}
function dealerContactEmail(row){
  const f=(row&&row.fields)||{};
  return String(
    f['Contact Email'] ||
    f['Username ( Email )'] ||
    f['Username'] ||
    f.Email ||
    ''
  ).trim().toLowerCase();
}
function visibleDealers(){
  // Dealer Details visibility:
  // Admin sees all.
  // Technician and End User see only their own row.
  if(currentUserIsAdmin()) return S.dealers || [];
  const me=currentUserEmailLower();
  return (S.dealers||[]).filter(r=>dealerContactEmail(r)===me);
}















function linkUrlValue(v){
  if(!v) return '';
  if(typeof v === 'string') return v.trim();
  if(typeof v === 'object' && v.link) return v.link;
  if(Array.isArray(v) && v.length){
    const first = v[0] || {};
    return first.url || first.link || '';
  }
  return '';
}
function readUploadFile(input){
  return new Promise(resolve=>{
    const file = input.files && input.files[0];
    if(!file) return resolve(null);
    const reader = new FileReader();
    reader.onload = () => resolve({ name:file.name, type:file.type || 'application/octet-stream', data:reader.result });
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}
async function uploadInvoiceFile(recordId, tableId, orderNo, input){
  const file = await readUploadFile(input);
  if(!file) return;
  try{
    await api('/api/upload-invoice',{method:'POST',body:JSON.stringify({record_id:recordId,tableId,orderNo,file})});
    alert('Invoice uploaded');
    await loadOrders(); renderOrders();
  }catch(e){ alert(e.message); }
}
async function uploadPaymentReceipt(recordId, tableId, orderNo, input){
  const file = await readUploadFile(input);
  if(!file) return;
  try{
    await api('/api/upload-payment-receipt',{method:'POST',body:JSON.stringify({record_id:recordId,tableId,orderNo,file})});
    alert('Payment receipt uploaded');
    await loadOrders(); renderOrders();
  }catch(e){ alert(e.message); }
}
function getSpareOrderNoFromRow(r){
  const f = r && r.fields ? r.fields : {};
  return (
    f['Spare Order Case'] ||
    f['Spare Order No'] ||
    f['Order No'] ||
    f['Case No'] ||
    ''
  );
}

function invoiceDownloadCell(row){
  const f = (row && row.fields) || {};
  const url = linkUrlValue(f['Invoice Download'] || f['Invoice Link'] || f['Invoice URL']);
  const current = url ? `<a class="btn-light" target="_blank" href="${esc(url)}">Download Invoice</a>` : '-';
  const orderNo = orderNoValue(f);
  const upload = (canManageOrders && canManageOrders())
    ? `<br><label class="mini-upload">Upload Invoice<input type="file" onchange="uploadInvoiceFile('${esc(row.record_id)}','${esc(row._table_id||'')}','${esc(getSpareOrderNoFromRow(row))}',this)"></label>`
    : '';
  return current + upload;
}
function paymentReceiptCell(row){
  const f = (row && row.fields) || {};
  const url = linkUrlValue(f['Payment Receipt'] || f['Payment Receipt Link'] || f['Payment Receipt URL']);
  const current = url ? `<a class="btn-light" target="_blank" href="${esc(url)}">View Receipt</a>` : '-';
  const orderNo = orderNoValue(f);
  const upload = `<br><label class="mini-upload">Upload Receipt<input type="file" onchange="uploadPaymentReceipt('${esc(row.record_id)}','${esc(row._table_id||'')}','${esc(getSpareOrderNoFromRow(row))}',this)"></label>`;
  return current + upload;
}





function getOrderR2Url(row){
  if(row && row.r2OrderFileUrl) return row.r2OrderFileUrl;
  if(row && row.r2ExcelUrl) return row.r2ExcelUrl;
  const f = (row && row.fields) || {};
  const text = `${f['Remarks'] || ''}\n${f['Notes'] || ''}`;
  const m = text.match(/Order File URL:\s*(https?:\/\/\S+)/i);
  if(m) return m[1].trim();
  return '';
}
function orderFileCellR2(row){
  if(!canManageOrders || !canManageOrders()) return '<span class="muted">Internal only</span>';
  const url = getOrderR2Url(row);
  return url ? `<a class="btn-light" target="_blank" href="${esc(url)}">Download Excel</a>` : '-';
}

function renderPageNote(text){
  const t = String(text || '').trim();
  if(!t) return '';
  return `<div class="page-note">${esc(t)}</div>`;
}





function normalizeCountryValue(v){
  if(Array.isArray(v)) return v.join(', ');
  return String(v || '');
}
function countryHas(v, name){
  if(Array.isArray(v)) return v.includes(name);
  return String(v || '').split(',').map(x=>x.trim()).includes(name) || String(v || '').includes(name);
}
function selectedDealerCountries(){
  const el = $('dCountry');
  if(!el) return '';
  return Array.from(el.selectedOptions).map(o=>o.value).join(',');
}


function canUpdateStatus(){
  const role = String(S.user?.role || S.user?.fields?.['User Role'] || '').toLowerCase();
  return role.includes('admin') || role.includes('technician');
}
function statusOptions(type, current){
  const repair = ['Registered','On Process','Closed'];
  const spare = ['Submitted','Registered','On Process','Approved','Invoiced','Closed','Cancelled'];
  const list = type === 'repair' ? repair : spare;
  const cur = current || (type === 'repair' ? 'Registered' : 'Submitted');
  return list.map(x => `<option ${x===cur?'selected':''}>${x}</option>`).join('');
}
async function updateRecordStatus(tableId, recordId, status, type){
  try{
    await api('/api/update-status',{method:'POST',body:JSON.stringify({tableId,record_id:recordId,status})});
    if(type === 'repair'){ await loadRepairs(); renderRepairStatus(); }
    else { await loadOrders(); renderOrders(); }
  }catch(e){ alert(e.message); }
}
function statusCell(row, type){
  const f = row.fields || {};
  const cur = f['Status'] || '';
  if(!canUpdateStatus()) return `<span class="status">${esc(cur || '-')}</span>`;
  return `<select style="min-width:140px" onchange="updateRecordStatus('${row._table_id||''}','${row.record_id}',this.value,'${type}')">${statusOptions(type, cur)}</select>`;
}



function canUpdateRepairStatus(){
  const role = String(S.user?.role || S.user?.fields?.['User Role'] || '').toLowerCase();
  return role.includes('admin') || role.includes('technician');
}
function repairLarkUrl(row){
  const f = row.fields || {};
  // Prefer record country/field layout; fallback to selected country
  const isKsaRow = !!(f['Repair Case'] || f['Dealer Name'] || f['Date Of Activation'] || f['Issue Description']) || String(f.Country || selectedCountry()).includes('KSA');
  return isKsaRow ? (window.LARK_REPAIR_KSA_URL || '') : (window.LARK_REPAIR_UAE_URL || '');
}
function repairStatusActionCell(row){
  if(!canUpdateRepairStatus()) return '-';
  const url = repairLarkUrl(row);
  return url ? `<a class="btn-light" target="_blank" href="${esc(url)}">Download Excel</a>` : '<span class="muted">Add repair table URL in config.js</span>';
}
async function refreshRepairs(){
  await loadRepairs();
  renderRepairStatus();
}
async function refreshAfterCreateRepair(){
  await loadRepairs();
  renderRepairStatus();
}

function canManageOrders(){
  return currentUserIsAdminTech();
}
function larkOrderTableUrl(row){
  const c = (row.fields?.Country || selectedCountry() || '').toString();
  if(c.includes('KSA')) return window.LARK_SPARE_ORDER_KSA_URL || '';
  return window.LARK_SPARE_ORDER_UAE_URL || '';
}
function orderFileCell(row){ return orderFileCellR2(row); }
async function deleteOrder(recordId, tableId, country){
  if(!confirm('Delete this order from Lark?')) return;
  try{
    await api('/api/delete-order',{method:'POST',body:JSON.stringify({record_id:recordId,tableId,country})});
    await loadOrders(); renderOrders();
  }catch(e){ alert(e.message); }
}
async function resetUserPassword(recordId){
  const p=prompt('New temporary password','Temp@123');
  if(!p) return;
  try{ const d=await api('/api/reset-user-password',{method:'POST',body:JSON.stringify({record_id:recordId,newPassword:p})}); alert('Password reset. Temporary password: '+d.newPassword); }
  catch(e){ alert(e.message); }
}



function canSeeInternalFiles(){
  const role = String(S.user?.role || S.user?.fields?.['User Role'] || '').toLowerCase();
  return role.includes('admin') || role.includes('technician');
}
function externalLinkCell(v){
  if(!v) return '-';
  if(typeof v === 'object' && v.link) return `<a class="btn-light" target="_blank" href="${esc(v.link)}">${esc(v.text || 'Open')}</a>`;
  const s = String(v);
  if(s.startsWith('http://') || s.startsWith('https://')) return `<a class="btn-light" target="_blank" href="${esc(s)}">Open</a>`;
  return esc(s);
}

function getFileToken(fileObj){
  if(!fileObj) return '';
  return fileObj.file_token || fileObj.token || fileObj.tmp_url || fileObj.url || '';
}
function getFileName(fileObj, fallback='download'){
  if(!fileObj) return fallback;
  return fileObj.name || fileObj.file_name || fileObj.filename || fallback;
}
function attachmentDownloadLink(v, localOrderNo){
  // Do not download from Lark token. Lark Base is private and token download fails.
  // Admin/Technician get local generated Excel only.
  if(!canSeeInternalFiles()) return '<span class="muted">Internal only</span>';
  if(localOrderNo) return `<a class="btn-light" href="/api/download-file?local=${encodeURIComponent(localOrderNo+'.xls')}&name=${encodeURIComponent(localOrderNo+'.xls')}">Download</a>`;
  if(Array.isArray(v) && v.length) return '<span class="muted">Download Excel only</span>';
  return '-';
}
function portalDocumentLink(v){
  // Portal note documents are external links such as Google Drive.
  // If Lark field is URL/link, v may be {link,text}; if Text, v is URL string.
  if(!v) return '-';
  if(Array.isArray(v) && v.length){
    // Existing old attachment format: do not download through private Lark.
    return '<span class="muted">Use external document link field</span>';
  }
  return externalLinkCell(v);
}


let S={dealerRepairCases:[],drcParts:[],drcEditingId:'',drcSubmitting:false,user:loadUser(),spares:[],cart:[],orders:[],repairs:[],dealers:[],notes:[]};
function $(id){return document.getElementById(id)}function esc(v){return String(v??'').replace(/[&<>"]/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[s]))}



function fileDownloadLink(v){
  if(!Array.isArray(v) || !v.length) return '-';
  const f=v[0]||{};
  const token=f.file_token || f.token || f.tmp_url || '';
  const name=f.name || f.file_name || 'order.xls';
  if(!token) return 'Available';
  return `<a class="btn-light" href="/api/download-order-file?token=${encodeURIComponent(token)}&name=${encodeURIComponent(name)}">Download</a>`;
}

async function api(url,opt={}){
  let r=await fetch(url,{...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}});
  let d=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(d.error||JSON.stringify(d));
  if(Array.isArray(d)) return d;
  if(url.startsWith('/api/spares') && d.items) return d.items;
  if(url.startsWith('/api/spare-list') && d.items) return d.items;
  if(url.startsWith('/api/dealers') && d.dealers) return d.dealers;
  if(url.startsWith('/api/portal-notes') && d.notes) return d.notes;
  if(url.startsWith('/api/my-orders') && d.orders) return d.orders;
  if(url.startsWith('/api/my-repairs') && d.repairs) return d.repairs;
  return d;
}

function selectedCountry(){
  if(isAdmin()) return localStorage.getItem('aeronexAdminCountry') || 'UAE & Other Region';
  return country();
}
function setAdminCountry(v){
  localStorage.setItem('aeronexAdminCountry', v);
  initApp();
}

async function login(){
  try{
    let d=await api('/api/login',{method:'POST',body:JSON.stringify({username:$('u').value.trim(),password:$('p').value})});
    save(d.user||d);
    location.href='/dashboard.html';
  }catch(e){
    msg('msg', e.message || 'Invalid login');
  }
}
function dealerPhone(){
  return uf('Contact No','') || '';
}
function dealerTrn(){
  return parseRemark(uf('Remarks',''),'TRN No') || '';
}
function dealerPoBox(){
  return parseRemark(uf('Remarks',''),'P.O Box No') || '';
}

function country(){return normalizeCountryValue(S.user?.country||S.user?.fields?.Country||'UAE & Other Region')}function uf(k,d=''){return S.user?.fields?.[k]??d}
function layout(){let n=S.user?.displayName||S.user?.username||'User';document.body.innerHTML=`<header class="topbar"><div class="brand"><div class="brand-title">AERO NEX</div><div class="brand-sub">RMA & Spare Order Portal</div></div><nav class="nav">
<a class="active" data-sec="dashboard" href="#" onclick="show('dashboard')">⌂ Dashboard</a><a data-sec="spare" href="#" onclick="show('spare')">🛒 Spare Order</a><a data-sec="repairCreate" href="#" onclick="show('repairCreate')">📝 Create Repair Case</a><a data-sec="repairStatus" href="#" onclick="show('repairStatus')">📋 Repair Status</a>${dealerRepairCasesSectionVisible()?`<a data-sec="dealerRepairCase" href="#" onclick="show('dealerRepairCase')">🧰 Dealer Repair Case</a>`:''}${warrantySoftwareStatusEnabled()?`<a data-sec="warrantySoftwareStatus" href="#" onclick="show('warrantySoftwareStatus')">🔎 Warranty & Software Status</a>`:''}${logsPageEnabled()?`<a data-sec="logsDiagnostics" href="#" onclick="show('logsDiagnostics')">🧾 Logs</a>`:''}<a data-sec="dealers" href="#" onclick="show('dealers')">🏢 Dealer Details</a><a data-sec="portalNotes" href="#" onclick="show('portalNotes')">📄 Portal Notes</a>${isAdmin()?`<a data-sec="admin" href="#" onclick="show('admin')">⚙ Admin</a>`:''}</nav><div class="user" onclick="this.classList.toggle('open')"><div class="avatar">${esc(initials())}</div><div><b>${esc(n)}</b><br><small>${esc(S.user.role||'End user')}</small></div><span>⌄</span><div class="menu"><a href="#" onclick="event.stopPropagation();show('changePassword')">🔒 Change Password</a><a href="#" onclick="event.stopPropagation();logout()">↪ Logout</a></div></div></header><main class="page">${['dashboard','spare','repairCreate','repairStatus','dealerRepairCase','warrantySoftwareStatus','logsDiagnostics','dealers','portalNotes','changePassword','admin'].map(x=>`<section id="${x}" class="section"></section>`).join('')}</main><footer class="footer">© 2025 AERO NEX FZCO. This portal and its contents are proprietary and confidential.<br>Developed by Jocy John | For support, contact: support@aeronex.ae</footer>`}
function show(sec){
  document.querySelectorAll('.section').forEach(x=>x.classList.remove('active'));
  $(sec)?.classList.add('active');
  document.querySelectorAll('.nav a').forEach(a=>a.classList.toggle('active',a.dataset.sec===sec));
  if(sec==='dealerRepairCase'){
    loadDealerRepairCases()
      .then(()=>renderDealerRepairCase())
      .catch(e=>{
        console.error('dealer repair history refresh failed',e);
        try{renderDealerRepairCase()}catch(err){console.error('renderDealerRepairCase failed',err)}
      });
  }
  if(sec==='warrantySoftwareStatus'){try{renderWarrantySoftwareStatus()}catch(e){console.error('renderWarrantySoftwareStatus failed',e)}}if(sec==='logsDiagnostics'){try{renderLogsDiagnostics()}catch(e){console.error('renderLogsDiagnostics failed',e)}}scrollTo(0,0)
}

function dealerRepairCaseEnabled(){
  const f=S.user?.fields||{};
  const v=String(f['Dealer Repair Case']||S.user?.['Dealer Repair Case']||S.user?.dealerRepairCase||'').trim().toLowerCase();
  return v==='yes'||v==='true'||v==='1';
}
function dealerRepairCasesSectionVisible(){return dealerRepairCaseEnabled()||currentUserIsAdminTech()}
function dealerRepairCompany(){return uf('Company Name','')||S.user?.companyName||S.user?.company||S.user?.displayName||''}
function dealerRepairCaseLocked(status){const s=String(status||'').trim();return s==='Repaired & Returned'||s==='Not Repair & Returned'}
function dealerRepairCaseNoValue(rowOrFields){const f=rowOrFields&&rowOrFields.fields?rowOrFields.fields:(rowOrFields||{});return f['Case Register No']||f['Dealer Repair Case No']||f['Case No']||''}
function dealerRepairDataLink(v){const url=linkUrlValue(v);return url?`<a class="btn-light" target="_blank" rel="noopener" href="${esc(url)}">Open Link</a>`:'-'}
function dealerRepairExcelLink(row){const no=dealerRepairCaseNoValue(row),recordId=row&&row.record_id||'';if(!recordId)return'-';return`<a class="btn-light" href="/api/download-dealer-repair-case-excel?record_id=${encodeURIComponent(recordId)}&caseNo=${encodeURIComponent(no)}&email=${encodeURIComponent(userEmail())}&role=${encodeURIComponent(S.user.role||'')}&company=${encodeURIComponent(dealerRepairCompany())}" target="_blank" rel="noopener">Download Excel</a>`}
function parseDealerRepairMaterials(text){
  const s=String(text||'').trim();if(!s)return[];
  return s.split(';').map(x=>x.trim()).filter(Boolean).map(x=>{
    const m=x.match(/^(.*?)\s*-\s*(.*?)\s+x\s*([0-9.]+)$/i);
    if(m)return{materialCode:m[1].trim(),materialName:m[2].trim(),qty:m[3].trim()};
    const m2=x.match(/^(.*?)\s+x\s*([0-9.]+)$/i);
    if(m2)return{materialCode:'',materialName:m2[1].trim(),qty:m2[2].trim()};
    return{materialCode:'',materialName:x,qty:1};
  });
}
function renderDealerRepairPartOptions(){
  let q=($('drcPartSearch')?.value||'').toLowerCase(),s=$('drcPartSelect');if(!s)return;
  s.innerHTML=(S.spares||[]).filter(x=>{let f=x.fields||{};return `${f['Material Code']||''} ${f['Material Name']||''} ${f['Compatible Model']||''}`.toLowerCase().includes(q)}).map(x=>{let f=x.fields||{},o={materialCode:f['Material Code']||'',materialName:f['Material Name']||'',compatibleModel:f['Compatible Model']||''};return `<option value="${encodeURIComponent(JSON.stringify(o))}">${esc(o.materialCode)} - ${esc(o.materialName)} ${o.compatibleModel?'('+esc(o.compatibleModel)+')':''}</option>`}).join('');
}
function addDealerRepairListedPart(){let s=$('drcPartSelect');if(!s||!s.value)return;let o=JSON.parse(decodeURIComponent(s.value));o.qty=$('drcPartQty').value||'1';S.drcParts=S.drcParts||[];S.drcParts.push(o);drawDealerRepairParts()}
function addDealerRepairCustomPart(){
  let name=($('drcCustomName')?.value||'').trim();if(!name)return msg('dealerRepairMsg','Enter custom material name');
  S.drcParts=S.drcParts||[];
  S.drcParts.push({materialCode:($('drcCustomCode')?.value||'CUSTOM').trim()||'CUSTOM',materialName:name,qty:($('drcCustomQty')?.value||'1')});
  $('drcCustomCode').value='';$('drcCustomName').value='';$('drcCustomQty').value='1';drawDealerRepairParts();
}
function drawDealerRepairParts(){
  let e=$('drcPartsRows');if(!e)return;S.drcParts=S.drcParts||[];
  e.innerHTML=S.drcParts.map((x,i)=>`<tr><td>${esc(x.materialCode||'CUSTOM')}</td><td>${esc(x.materialName||'')}</td><td>${esc(x.qty||1)}</td><td><button class="btn-danger" onclick="S.drcParts.splice(${i},1);drawDealerRepairParts()">Remove</button></td></tr>`).join('');
}
function resetDealerRepairForm(){
  S.drcEditingId='';S.drcParts=[];
  ['drcModel','drcSerial','drcActivation','drcTech','drcIssue','drcNote','drcUploadLink'].forEach(id=>{let el=$(id);if(el)el.value=''});
  if($('drcRepairType'))$('drcRepairType').value='Local Repair';
  if($('drcSubmitBtn'))$('drcSubmitBtn').textContent='Submit Dealer Repair Case';
  if($('drcCancelEdit'))$('drcCancelEdit').classList.add('hidden');
  drawDealerRepairParts();
}
function editDealerRepairCase(recordId){
  const row=(S.dealerRepairCases||[]).find(r=>r.record_id===recordId);if(!row)return;const f=row.fields||{};
  if(dealerRepairCaseLocked(f['Repair Status']))return alert('This case is closed and cannot be edited.');
  S.drcEditingId=recordId;
  $('drcModel').value=f['Model No']||'';$('drcSerial').value=f['Serial No']||'';$('drcActivation').value=f['Activation Date / Invoice Date']||'';
  $('drcTech').value=f['Technician Name']||'';$('drcIssue').value=f['Device Issue']||'';$('drcNote').value=f['Technician Note']||'';
  $('drcRepairType').value=f['Repair Type']||'Local Repair';$('drcUploadLink').value=linkUrlValue(f['Upload Repair Data']||'')||f['Upload Repair Data']||'';
  S.drcParts=parseDealerRepairMaterials(f['Material Replaced']||'');drawDealerRepairParts();
  $('drcSubmitBtn').textContent='Update Dealer Repair Case';$('drcCancelEdit').classList.remove('hidden');show('dealerRepairCase');scrollTo(0,0);
}
async function loadDealerRepairCases(){
  if(!dealerRepairCasesSectionVisible()){S.dealerRepairCases=[];return}
  try{
    S.dealerRepairCases=await api('/api/dealer-repair-cases?email='+encodeURIComponent(userEmail())+'&role='+encodeURIComponent(S.user.role||'')+'&company='+encodeURIComponent(dealerRepairCompany()));
  }catch(e){
    console.warn('dealer repair cases load failed',e);
    S.dealerRepairCases=[];
  }
}
async function submitDealerRepairCase(){
  if(S.drcSubmitting)return;S.drcSubmitting=true;
  try{
    const payload={record_id:S.drcEditingId||'',email:userEmail(),role:S.user.role||'',companyName:dealerRepairCompany(),modelNo:($('drcModel')?.value||'').trim(),serialNo:($('drcSerial')?.value||'').trim(),activationDate:($('drcActivation')?.value||'').trim(),technicianName:($('drcTech')?.value||'').trim(),deviceIssue:($('drcIssue')?.value||'').trim(),technicianNote:($('drcNote')?.value||'').trim(),repairType:($('drcRepairType')?.value||'Local Repair').trim(),uploadRepairData:($('drcUploadLink')?.value||'').trim(),parts:S.drcParts||[]};
    if(!payload.companyName)return msg('dealerRepairMsg','Company Name missing from user profile');
    if(!payload.modelNo||!payload.serialNo)return msg('dealerRepairMsg','Model No and Serial No are required');
    if(!payload.parts.length)return msg('dealerRepairMsg','Add at least one replaced material');
    const endpoint=payload.record_id?'/api/update-dealer-repair-case':'/api/create-dealer-repair-case';
    const d=await api(endpoint,{method:'POST',body:JSON.stringify(payload)});
    msg('dealerRepairMsg',(payload.record_id?'Dealer Repair Case updated: ':'Dealer Repair Case submitted: ')+(d.caseNo||''),true);
    resetDealerRepairForm();await loadDealerRepairCases();renderDealerRepairCase();
  }catch(e){msg('dealerRepairMsg',e.message)}finally{S.drcSubmitting=false}
}
function renderDealerRepairCase(){
  if(!$('dealerRepairCase'))return;
  if(!dealerRepairCasesSectionVisible()){$('dealerRepairCase').innerHTML=`<div class="panel"><h2>Dealer Repair Case</h2><div class="notice">You do not have permission to access Dealer Repair Case.</div></div>`;return}
  S.drcParts=S.drcParts||[];const company=dealerRepairCompany();
  $('dealerRepairCase').innerHTML=`<div class="panel"><h2>Dealer Repair Case</h2><div class="notice">Create and track dealer repair cases. Closed cases cannot be edited.</div>
  <div class="grid3"><div><label>Company Name</label><input value="${esc(company)}" disabled></div><div><label>Model No *</label><input id="drcModel"></div><div><label>Serial No *</label><input id="drcSerial"></div></div>
  <div class="grid3"><div><label>Activation Date / Invoice Date</label><input id="drcActivation" type="date"></div><div><label>Technician Name</label><input id="drcTech"></div><div><label>Repair Type</label><select id="drcRepairType"><option>Local Repair</option><option>DJI / Aeronex Repair</option></select></div></div>
  <label>Device Issue</label><textarea id="drcIssue"></textarea><label>Technician Note</label><textarea id="drcNote"></textarea>
  <label>Upload Repair Data</label><input id="drcUploadLink" placeholder="Google Drive link"><div class="muted">Upload the Google Drive Link (Include Issue Photos/Videos, Flight Logs or Crash Logs, After Repair Photos/Videos.)</div>
  <h3>Material Replaced</h3>
  <div class="row"><div><label>Search Spare Part List</label><input id="drcPartSearch" oninput="renderDealerRepairPartOptions()" placeholder="Search Material Code / Material Name"></div><div><label>Select Material</label><select id="drcPartSelect"></select></div><div class="qty"><label>Qty</label><input id="drcPartQty" type="number" min="1" value="1"></div><div class="act"><button onclick="addDealerRepairListedPart()">Add Part</button></div></div>
  <div class="row"><div><label>Custom Material Code</label><input id="drcCustomCode" placeholder="CUSTOM"></div><div><label>Custom Material Name</label><input id="drcCustomName"></div><div class="qty"><label>Qty</label><input id="drcCustomQty" type="number" min="1" value="1"></div><div class="act"><button onclick="addDealerRepairCustomPart()">Add Custom</button></div></div>
  <div class="table-wrap"><table><thead><tr><th>Material Code</th><th>Material Name</th><th>Qty</th><th>Action</th></tr></thead><tbody id="drcPartsRows"></tbody></table></div>
  <div class="row"><button id="drcSubmitBtn" onclick="submitDealerRepairCase()">Submit Dealer Repair Case</button><button id="drcCancelEdit" class="btn-light hidden" onclick="resetDealerRepairForm()">Cancel Edit</button></div><div id="dealerRepairMsg" class="msg"></div></div>
  <div class="panel"><h2>My Dealer Repair Case History</h2><div class="table-wrap"><table><thead><tr><th>Case Register No</th><th>Company Name</th><th>Model No</th><th>Serial No</th><th>Activation Date / Invoice Date</th><th>Repair Type</th><th>Repair Status</th><th>Upload Repair Data</th><th>Excel</th><th>Edit</th></tr></thead><tbody>${(S.dealerRepairCases||[]).map(r=>{let f=r.fields||{},locked=dealerRepairCaseLocked(f['Repair Status']);return `<tr><td>${esc(dealerRepairCaseNoValue(f))}</td><td>${esc(f['Company Name']||'')}</td><td>${esc(f['Model No']||'')}</td><td>${esc(f['Serial No']||'')}</td><td>${esc(f['Activation Date / Invoice Date']||'')}</td><td>${esc(f['Repair Type']||'')}</td><td>${statusCell(r,'dealerRepair')}</td><td>${dealerRepairDataLink(f['Upload Repair Data'])}</td><td>${dealerRepairExcelLink(r)}</td><td>${locked?'<span class="muted">Locked</span>':`<button class="btn-light" onclick="editDealerRepairCase('${r.record_id}')">Edit</button>`}</td></tr>`}).join('')}</tbody></table></div></div>`;
  renderDealerRepairPartOptions();drawDealerRepairParts();
}


function warrantySoftwareStatusEnabled(){return currentUserIsAdminTech()}
function fieldTextDisplay(v){
  if(v===undefined||v===null)return '';
  if(Array.isArray(v))return v.map(fieldTextDisplay).filter(Boolean).join(', ');
  if(typeof v==='object')return v.text||v.name||v.value||v.link||v.url||'';
  return String(v);
}
function wsCell(fields,names){
  for(const n of names){const t=fieldTextDisplay(fields&&fields[n]);if(t)return t}
  return '';
}
function formatWarrantySoftwareDate(v){
  const s=fieldTextDisplay(v);
  if(!s)return '';
  const n=Number(s);
  if(Number.isFinite(n)){
    const ms=n>1000000000000?n:n*1000;
    const d=new Date(ms);
    if(!isNaN(d.getTime())){
      return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
    }
  }
  return s;
}
function wsDateCell(fields,names){
  for(const n of names){
    const t=formatWarrantySoftwareDate(fields&&fields[n]);
    if(t)return t;
  }
  return '';
}

function renderWarrantySoftwareRows(rows,type){
  if(!rows||!rows.length)return `<tr><td colspan="8" class="muted">No ${type} records found</td></tr>`;
  return rows.map(r=>{const f=r.fields||{};return `<tr><td>${esc(wsCell(f,['Serial Number','Serial No']))}</td><td>${esc(wsCell(f,['Activation Code']))}</td><td>${esc(wsCell(f,['Order No.','Order No','Order Number']))}</td><td>${esc(wsCell(f,['Customer Name']))}</td><td>${esc(wsCell(f,['Product Model','Product Name']))}</td><td>${esc(wsDateCell(f,['Shipping Date']))}</td><td>${esc(wsCell(f,['Warranty Years','Aerocare Warranty','Warranty Status','Software Status']))}</td><td>${esc(wsCell(f,['Remarks','Notes']))}</td></tr>`}).join('');
}
async function searchWarrantySoftwareStatus(){
  const q=($('wsSearchInput')?.value||'').trim();
  S.wsLastQuery=q;
  if(!q)return msg('wsMsg','Enter Serial Number / Activation Code / Order No. / Customer Name');
  msg('wsMsg','Searching...',true);
  try{
    S.warrantySoftwareResult=await api('/api/warranty-software-status?q='+encodeURIComponent(q)+'&role='+encodeURIComponent(S.user.role||''));
    renderWarrantySoftwareStatus();
    msg('wsMsg','Search completed',true);
  }catch(e){msg('wsMsg',e.message)}
}
function renderWarrantySoftwareStatus(){
  if(!$('warrantySoftwareStatus'))return;
  if(!warrantySoftwareStatusEnabled()){
    $('warrantySoftwareStatus').innerHTML=`<div class="panel"><h2>Warranty & Software Status</h2><div class="notice">You do not have permission to access this page.</div></div>`;
    return;
  }
  const result=S.warrantySoftwareResult||{warranty:[],software:[]};
  $('warrantySoftwareStatus').innerHTML=`<div class="panel"><h2>Warranty & Software Status</h2><div class="notice">Admin/Technician search only. No create, edit, or delete.</div><div class="row"><div style="flex:1"><label>Search by Serial Number / Activation Code / Order No. / Customer Name</label><input id="wsSearchInput" placeholder="Enter search value" onkeydown="if(event.key==='Enter')searchWarrantySoftwareStatus()" value="${esc(S.wsLastQuery||'')}"></div><div class="act"><button onclick="searchWarrantySoftwareStatus()">Search</button></div></div><div id="wsMsg" class="msg"></div></div><div class="panel"><h2>Warranty Status</h2><div class="table-wrap"><table><thead><tr><th>Serial Number</th><th>Activation Code</th><th>Order No.</th><th>Customer Name</th><th>Product</th><th>Shipping Date</th><th>Status / Years</th><th>Remarks</th></tr></thead><tbody>${renderWarrantySoftwareRows(result.warranty,'warranty')}</tbody></table></div></div><div class="panel"><h2>Software Status</h2><div class="table-wrap"><table><thead><tr><th>Serial Number</th><th>Activation Code</th><th>Order No.</th><th>Customer Name</th><th>Product</th><th>Shipping Date</th><th>Status / Warranty</th><th>Remarks</th></tr></thead><tbody>${renderWarrantySoftwareRows(result.software,'software')}</tbody></table></div></div>`;
}


function logsPageEnabled(){ return currentUserIsAdminTech(); }

function renderLogsDiagnosticsTableOptions(){
  const list = [
    ['ALL','All Tables'],
    ['USER_TABLE_ID','User & Company Details'],
    ['SPARE_TABLE_ID','Spare Part List'],
    ['ORDER_UAE_TABLE_ID','Spare Order UAE'],
    ['ORDER_KSA_TABLE_ID','Spare Order KSA'],
    ['REPAIR_UAE_TABLE_ID','Repair Case UAE'],
    ['REPAIR_KSA_TABLE_ID','Repair Case KSA'],
    ['DEALER_REPAIR_CASE_TABLE_ID','Dealer Repair Case'],
    ['WARRANTY_STATUS_TABLE_ID','Warranty Status'],
    ['SOFTWARE_STATUS_TABLE_ID','Software Status'],
    ['FLYCART_CREDIT_USE_TABLE_ID','Flycart Credit Use'],
    ['PORTAL_NOTES_TABLE_ID','Portal Notes']
  ];
  return list.map(x=>`<option value="${esc(x[0])}">${esc(x[1])}</option>`).join('');
}

function renderLogsDiagnostics(){
  if(!$('logsDiagnostics')) return;
  if(!logsPageEnabled()){
    $('logsDiagnostics').innerHTML=`<div class="panel"><h2>Logs</h2><div class="notice">You do not have permission to access Logs.</div></div>`;
    return;
  }
  $('logsDiagnostics').innerHTML=`<div class="panel"><h2>Logs & Diagnostics</h2>
    <div class="notice">Admin/Technician only. Error logs are stored in Cloudflare R2 under /logs/. Keep max 3 days using R2 lifecycle policy.</div>
    <div class="grid3">
      <div><label>Lark Table</label><select id="diagTableSelect">${renderLogsDiagnosticsTableOptions()}</select></div>
      <div class="act"><button onclick="generateLarkDiagnostics()">Generate Lark Table Diagnostics</button></div>
      <div class="act"><button class="btn-light" onclick="generateEnvironmentDiagnostics()">Environment Check</button></div>
    </div>
    <div class="row">
      <button class="btn-light" onclick="loadErrorLogs()">Load Error Logs</button>
      <button class="btn-light" onclick="createTestErrorLog()">Create Test Error Log</button>
      <button class="btn-light" onclick="copyDiagnosticsJson()">Copy JSON</button>
      <button class="btn-light" onclick="downloadDiagnosticsJson()">Download JSON</button>
    </div>
    <div id="logsMsg" class="msg"></div>
    <pre id="logsOutput" style="white-space:pre-wrap;background:#f6f8fb;border:1px solid #dbe3ef;border-radius:10px;padding:12px;max-height:520px;overflow:auto"></pre>
  </div>`;
}

function setLogsOutput(data){
  S.logsDiagnosticsData=data;
  const el=$('logsOutput');
  if(el) el.textContent=typeof data==='string'?data:JSON.stringify(data,null,2);
}

async function generateLarkDiagnostics(){
  try{
    msg('logsMsg','Generating Lark diagnostics...');
    const table=($('diagTableSelect')?.value||'ALL');
    const d=await api('/api/logs-diagnostics/tables?role='+encodeURIComponent(S.user.role||'')+'&table='+encodeURIComponent(table));
    setLogsOutput(d);
    msg('logsMsg','Diagnostics generated');
  }catch(e){ msg('logsMsg',e.message); }
}

async function generateEnvironmentDiagnostics(){
  try{
    msg('logsMsg','Checking environment...');
    const d=await api('/api/logs-diagnostics/environment?role='+encodeURIComponent(S.user.role||''));
    setLogsOutput(d);
    msg('logsMsg','Environment check complete');
  }catch(e){ msg('logsMsg',e.message); }
}

async function loadErrorLogs(){
  try{
    msg('logsMsg','Loading error logs...');
    const d=await api('/api/logs-diagnostics/error-logs?role='+encodeURIComponent(S.user.role||'')+'&limit=50');
    setLogsOutput(d);
    msg('logsMsg','Error logs loaded');
  }catch(e){ msg('logsMsg',e.message); }
}

async function createTestErrorLog(){
  try{
    msg('logsMsg','Creating test error log...');
    const d=await api('/api/logs-diagnostics/test-error-log?role='+encodeURIComponent(S.user.role||'')+'&email='+encodeURIComponent(userEmail()));
    setLogsOutput(d);
    msg('logsMsg','Test error log created');
  }catch(e){ msg('logsMsg',e.message); }
}

async function copyDiagnosticsJson(){
  const text=$('logsOutput')?.textContent||'';
  if(!text) return msg('logsMsg','Nothing to copy');
  try{
    await navigator.clipboard.writeText(text);
    msg('logsMsg','Copied');
  }catch(e){ msg('logsMsg','Copy failed'); }
}

function downloadDiagnosticsJson(){
  const text=$('logsOutput')?.textContent||'';
  if(!text) return msg('logsMsg','Nothing to download');
  const blob=new Blob([text],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='aeronex-diagnostics-'+new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')+'.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function renderDashboard(){$('dashboard').classList.add('active');$('dashboard').innerHTML=`<div class="hero"><h2>Welcome back, ${esc(S.user.displayName||S.user.username)}</h2><div class="muted">Here's what you can do today</div>${isAdmin()?`<div class="notice"><b>Country:</b> <select style="max-width:260px;display:inline-block;margin-left:10px" onchange="setAdminCountry(this.value)"><option ${selectedCountry()==='UAE & Other Region'?'selected':''}>UAE & Other Region</option><option ${selectedCountry()==='KSA - SAUDI ARABIA'?'selected':''}>KSA - SAUDI ARABIA</option></select></div>`:''}</div><div class="cards">${[['🛒','Spare Order','Order spare parts from inventory.','spare','Go to Spare Order'],['🔧','Create Repair Case','Submit a new repair request.','repairCreate','Create Case'],['📋','Repair Status','Track repair cases, reports and invoices.','repairStatus','View Status'],['🏢','Dealer Details','View and manage dealer information.','dealers','View Dealers'],['📄','Portal Notes','Important information and announcements.','portalNotes','View Notes']].map(c=>`<div class="card"><div class="ico">${c[0]}</div><h3>${c[1]}</h3><p>${c[2]}</p><a href="#" onclick="show('${c[3]}')">${c[4]} →</a></div>`).join('')}
<div class="address-grid">
  <div class="address-box">
    <h2>UAE Address</h2>
    <p>
AERONEX (UAE & Other Region )
Comapny Name : AERONEX DRONE TRADING LLC
Address :      C-WING , C706-708
               DUBAI SILICON OASIS HQ BUILDING
               DSO , DUBAI , UAE
Working Time : MON - FRI ( 9AM - 5PM )  SAT & SUN ( CLOSED )
Email :        support@aeronex.ae
    </p>
  </div>

  <div class="address-box">
    <h2>KSA Address</h2>
    <p>
AERONEX  (KSA Only )
Company Name :  CHARKA MESAA TAYARAH
Address :       OFFICE NO 403, Al JAWHARA TOWER ,
                OLAYA STREET. AL OLAYA , RIYAD , KSA .
Working Time :  SUN - THU ( 9AM - 6 PM ) FRI & SAT ( CLOSED )
Email :         support.ksa@aeronex.ae
    </p>
</div>

<div style="
  margin-top:20px;
  text-align:center;
  font-size:18px;
  color:#2563eb;
">
  For official DJI warranty verification,
  <a href="https://repair.dji.com/device/Search?re=id&lang=en"
     target="_blank"
     rel="noopener">
     Open DJI Warranty Check →
  </a>
</div>

</div></div>`}
function renderChangePassword(){$('changePassword').innerHTML=`<div class="panel" style="max-width:620px;margin:auto"><h2>Change Password</h2><label>Current Password</label><input id="currentPassword" type="password"><label>New Password</label><input id="newPassword" type="password"><label>Confirm New Password</label><input id="confirmPassword" type="password"><button onclick="changePassword()">Update Password</button><div id="cpMsg" class="msg"></div></div>`}

async function changePassword(){
  const currentPassword = $('currentPassword')?.value || '';
  const newPassword = $('newPassword')?.value || '';
  const confirmPassword = $('confirmPassword')?.value || '';

  if(!currentPassword || !newPassword || !confirmPassword){
    return msg('cpMsg','Please fill all password fields');
  }

  if(newPassword !== confirmPassword){
    return msg('cpMsg','New password and confirm password do not match');
  }

  try{
    await api('/api/change-password',{
      method:'POST',
      body:JSON.stringify({
        email:userEmail(),
        currentPassword,
        newPassword
      })
    });

    msg('cpMsg','Password updated successfully');
    $('currentPassword').value = '';
    $('newPassword').value = '';
    $('confirmPassword').value = '';
  }catch(e){
    msg('cpMsg',e.message || 'Password update failed');
  }
}

function dealerAddress(){
  const u = S.user || {};
  const f = u.fields || {};
  return (
    u.address ||
    u.billingAddress ||
    u.invoiceAddress ||
    f['Billing Address'] ||
    f['Invoice Address'] ||
    f['Address'] ||
    ''
  );
}
function allowedInvoiceCurrencies(){
  return selectedCountry().includes('KSA') ? ['USD','SAR'] : ['USD','AED'];
}
function selectedInvoiceCurrency(){
  const el = document.getElementById('invoiceCurrency');
  const allowed = allowedInvoiceCurrencies();
  const cur = (el && el.value) || allowed[0] || 'USD';
  return allowed.includes(cur) ? cur : (allowed[0] || 'USD');
}
function currencyOptions(){
  const cur = selectedInvoiceCurrency();
  return allowedInvoiceCurrencies().map(c => `<option ${cur===c?'selected':''}>${c}</option>`).join('');
}
function priceLabel(prefix, currency){
  return `${prefix} ${currency} (Without Tax & Duty)`;
}
function cleanPrice(v){
  if(v===null || v===undefined || v==='') return 0;
  const n = Number(String(v).replace(/[^0-9.\-]/g,''));
  return Number.isFinite(n) ? n : 0;
}
function itemUnitPrice(item, currency){
  const c = currency || selectedInvoiceCurrency();
  if(c==='AED') return cleanPrice(item.priceAED ?? item['AED (Without Tax & Duty)']);
  if(c==='SAR') return cleanPrice(item.priceSAR ?? item['SAR (Without Tax & Duty)']);
  return cleanPrice(item.priceUSD ?? item['Price (USD ) Without Tax & Duty'] ?? item.price);
}
function fmtPrice(v){
  return cleanPrice(v).toFixed(2);
}

function renderSpare(){$('spare').innerHTML=`<div class="panel"><h2>Spare Order</h2><div class="notice">Select material by name or material code. Review before submit. No edit after apply; cancel request only.${isAdmin()?`<br><b>Country:</b> <select style="max-width:260px;display:inline-block;margin-left:10px" onchange="setAdminCountry(this.value)"><option ${selectedCountry()==='UAE & Other Region'?'selected':''}>UAE & Other Region</option><option ${selectedCountry()==='KSA - SAUDI ARABIA'?'selected':''}>KSA - SAUDI ARABIA</option></select>`:''}</div><div class="grid4"><div><label>Company Name</label><input value="${esc(uf('Company Name','AERO NEX'))}" disabled></div><div><label>Contact Name</label><input value="${esc(uf('Contact Person',''))}" disabled></div><div><label>Billing Address</label><input value="${esc(dealerAddress())}" disabled></div><div><label>Country</label><input value="${esc(selectedCountry())}" disabled></div></div><div style="max-width:260px"><label>Invoice Currency</label><select id="invoiceCurrency" onchange="drawCart()">${currencyOptions()}</select></div><label>Add from Spare Part List</label><div class="row"><input id="spareSearch" placeholder="Search by Material Code or Material Name..." oninput="renderSpareOptions()"><input id="spareQty" class="qty" type="number" min="1" value="1"><button class="act" onclick="addListed()">Add Item</button></div><select id="spareSelect"></select><h3>Custom Spare (if not in list)</h3><div class="row"><input id="customCode" placeholder="Material Code (if known)"><input id="customName" placeholder="Material Name"><input id="customQty" class="qty" type="number" min="1" value="1"><button class="act" onclick="addCustom()">Add Custom</button></div><label>Notes</label><textarea id="spareNotes" placeholder="Optional notes for this spare order" style="min-height:80px"></textarea><h3>Review Items</h3><div class="table-wrap"><table><thead><tr><th>Material Code</th><th>Material Name</th><th>Compatible Model</th><th>Qty</th><th id="cartUnitPriceHead">Unit Price</th><th id="cartTotalHead">Total</th><th>Action</th></tr></thead><tbody id="cartRows"></tbody></table></div><button onclick="submitOrder()">Submit Order</button> <button class="btn-light" onclick="S.cart=[];drawCart()">Clear All</button><div id="orderMsg" class="msg"></div><h3>My Order History <button class="btn-light" onclick="loadOrders().then(renderOrders)">Refresh</button></h3><div class="table-wrap"><table><thead><tr><th>Spare Order No</th><th>Company Name</th><th>Billing Address</th><th>Country</th><th>Invoice Currency</th><th>Status</th><th>Order File (Admin/Technician)</th><th>Invoice Download</th><th>Payment Receipt</th>${canManageOrders()?'<th>Action</th>':''}</tr></thead><tbody id="orderRows"></tbody></table>${renderPageNote(window.AERONEX_SPARE_ORDER_NOTE)}</div></div>`;renderSpareOptions();drawCart();renderOrders()}
function renderSpareOptions(){let q=($('spareSearch')?.value||'').toLowerCase(),s=$('spareSelect');if(!s)return;s.innerHTML=S.spares.filter(x=>{let f=x.fields||{};return `${f['Material Code']||''} ${f['Material Name']||''} ${f['Compatible Model']||''}`.toLowerCase().includes(q)}).map(x=>{let f=x.fields||{},o={materialCode:f['Material Code']||'',materialName:f['Material Name']||'',compatibleModel:f['Compatible Model']||'',priceUSD:f['Price (USD ) Without Tax & Duty']||'',priceAED:f['AED (Without Tax & Duty)']||'',priceSAR:f['SAR (Without Tax & Duty)']||'',price:f['Price (USD ) Without Tax & Duty']||'',stock:f['Local Stock']||''};return `<option value="${encodeURIComponent(JSON.stringify(o))}">${esc(o.materialCode)} - ${esc(o.materialName)} ${o.compatibleModel?'('+esc(o.compatibleModel)+')':''}</option>`}).join('')}
function addListed(){let v=$('spareSelect').value;if(!v)return msg('orderMsg','Select material first');let o=JSON.parse(decodeURIComponent(v));o.qty=$('spareQty').value||'1';S.cart.push(o);drawCart()}
function addCustom(){let n=$('customName').value.trim();if(!n)return msg('orderMsg','Enter custom material name');S.cart.push({materialCode:$('customCode').value.trim(),materialName:n,compatibleModel:'Custom',priceUSD:0,priceAED:0,priceSAR:0,price:0,stock:'-',qty:$('customQty').value||'1'});$('customCode').value='';$('customName').value='';drawCart()}
function drawCart(){
  let e=$('cartRows');
  if(!e)return;
  const cur = selectedInvoiceCurrency();
  const unitHead = $('cartUnitPriceHead');
  const totalHead = $('cartTotalHead');
  if(unitHead) unitHead.textContent = priceLabel('Unit Price', cur);
  if(totalHead) totalHead.textContent = priceLabel('Total', cur);
  e.innerHTML=S.cart.map((x,i)=>{
    const qty = cleanPrice(x.qty || 1) || 1;
    const unit = itemUnitPrice(x, cur);
    const total = unit * qty;
    x.selectedCurrency = cur;
    x.unitPrice = unit;
    x.totalPrice = total;
    return `<tr><td>${esc(x.materialCode||'CUSTOM')}</td><td>${esc(x.materialName)}</td><td>${esc(x.compatibleModel)}</td><td>${esc(x.qty)}</td><td>${fmtPrice(unit)}</td><td>${fmtPrice(total)}</td><td><button class="btn-danger" onclick="S.cart.splice(${i},1);drawCart()">Remove</button></td></tr>`;
  }).join('');
}
async function submitOrder(){
  if(SPARE_SUBMITTING) return;
  SPARE_SUBMITTING = true;
  try{
    if(!S.cart.length) return msg('orderMsg','Add at least one item');
    const currency = selectedInvoiceCurrency();
    const pricedItems = S.cart.map(x=>{
      const qty = cleanPrice(x.qty || 1) || 1;
      const unit = itemUnitPrice(x, currency);
      return {...x, selectedCurrency:currency, unitPrice:unit, totalPrice:unit*qty, price:unit};
    });
    let p={companyName:uf('Company Name','AERO NEX'),contactName:uf('Contact Person',''),billingAddress:dealerAddress(),invoiceCurrency:currency,country:selectedCountry(),items:pricedItems,notes:(($('spareNotes')&&$('spareNotes').value)||'').trim()};
    let d=await api('/api/submit-spare',{method:'POST',body:JSON.stringify(p)});
    msg('orderMsg','Order submitted with Excel file: '+d.orderNo,true);
    S.cart=[];
    drawCart();
    await loadOrders();
    renderOrders();
  }catch(e){
    msg('orderMsg',e.message);
  }finally{
    SPARE_SUBMITTING = false;
  }
}




function orderNoValue(rowOrFields){
  const f = rowOrFields && rowOrFields.fields ? rowOrFields.fields : (rowOrFields || {});
  return (
    f['Spare Order No'] ||
    f['Spare Order Case'] ||
    f['Order No'] ||
    f['Case No'] ||
    ''
  );
}


async function uploadInvoiceForRow(r, inputId){
  const inp = document.getElementById(inputId);
  const file = inp && inp.files && inp.files[0];
  if(!file) return alert('Select invoice file');
  const data = await fileToDataUrl(file);
  await api('/api/upload-invoice', {
    method:'POST',
    body: JSON.stringify({
      tableId: r._table_id || r.tableId || r.table_id,
      record_id: r.record_id,
      orderNo: getSpareOrderNoFromRow(r),
      file: { name:file.name, type:file.type, data }
    })
  });
  await loadOrders();
  renderSpare();
}

async function uploadReceiptForRow(r, inputId){
  const inp = document.getElementById(inputId);
  const file = inp && inp.files && inp.files[0];
  if(!file) return alert('Select receipt file');
  const data = await fileToDataUrl(file);
  await api('/api/upload-payment-receipt', {
    method:'POST',
    body: JSON.stringify({
      tableId: r._table_id || r.tableId || r.table_id,
      record_id: r.record_id,
      orderNo: getSpareOrderNoFromRow(r),
      file: { name:file.name, type:file.type, data }
    })
  });
  await loadOrders();
  renderSpare();
}


function backendOrderDownloadLink(r){
  const no = getSpareOrderNoFromRow(r);
  const tableId = r && (r._table_id || r.tableId || r.table_id) || '';
  const recordId = r && r.record_id || '';
  if(!tableId || !recordId) return '-';
  const url = `/api/download-order-excel?tableId=${encodeURIComponent(tableId)}&record_id=${encodeURIComponent(recordId)}&orderNo=${encodeURIComponent(no)}`;
  return `<a class="btn-light" href="${url}" target="_blank" rel="noopener">Download Excel</a>`;
}

function localOrderDownloadLink(orderNo, fileVal, row){
  return backendOrderDownloadLink(row);
}

function renderOrders(){let e=$('orderRows');if(!e)return;e.innerHTML=(Array.isArray(S.orders)?S.orders:[]).map(r=>{let f=r.fields||{};return `<tr><td>${esc(orderNoValue(f))}</td><td>${esc(f['Company Name'])}</td><td>${esc(f['Billing Address']||'')}</td><td>${esc(f['Country']||'')}</td><td>${esc(f['Invoice Currency']||'')}</td><td>${statusCell(r,'spare')}</td><td>${backendOrderDownloadLink(r)}</td><td>${invoiceDownloadCell(r)}</td><td>${paymentReceiptCell(r)}</td><td>${Array.isArray(f['Invoice Upload'])?'Download':'-'}</td></tr>`}).join('')}

function readFileBase64(inputId){
  return new Promise(resolve=>{
    const input=$(inputId);
    if(!input || !input.files || !input.files[0]) return resolve(null);
    const file=input.files[0];
    const reader=new FileReader();
    reader.onload=()=>resolve({name:file.name,type:file.type||'application/octet-stream',data:reader.result});
    reader.onerror=()=>resolve(null);
    reader.readAsDataURL(file);
  });
}

function renderRepairCreate(){
  const isKsaForm = selectedCountry().includes('KSA');
  $('repairCreate').innerHTML=`<div class="panel"><h2>Create Repair Case <button class="btn-light" onclick="refreshAfterCreateRepair()">Refresh</button></h2>
    <div class="grid3"><div><label>${isKsaForm?'Dealer Name':'Company Name'}</label><input id="rcCompany" value="${esc(uf('Company Name','AERO NEX'))}"></div><div><label>${isKsaForm?'Dealer Contact':'Contact Name'}</label><input id="rcContact" value="${esc(uf('Contact Person',''))}"></div><div><label>Contact Email</label><input id="rcEmail" value="${esc(uf('Username ( Email )',S.user.username))}"></div></div>
    <label>${isKsaForm?'Dealer Address':'Receiver Address'} *</label><input id="rcAddress" value="${esc(dealerAddress())}">
    <div class="grid4"><div><label>Country *</label><select id="rcCountry"><option>UAE & Other Region</option><option>KSA - SAUDI ARABIA</option></select></div><div><label>Model No *</label><input id="rcModel"></div><div><label>Serial No *</label><input id="rcSerial"></div><div><label>${isKsaForm?'Date Of Activation':'Date of Purchase / Activation'} *</label><input id="rcDate" type="date"></div></div>
    ${isKsaForm?`<div class="grid3"><div><label>Warranty Status</label><select id="rcWarranty"><option>Under Warranty</option><option>Out of Warranty</option><option>Unknown</option></select></div><div><label>GACA Document</label><input id="gacaDocument" type="file"></div><div><label>Log for Drone and RC Link</label><input id="logFileLink" placeholder="Paste log link"></div></div><label>Issue Video and Pictures Link</label><input id="issueMediaLink" placeholder="Paste video/picture link"><label>Issue Description *</label><textarea id="rcDetails"></textarea>`:`<label>Details Of Issue *</label><textarea id="rcDetails"></textarea><div class="grid3"><div><label>Upload all required details link</label><input id="requiredDetailsLink" placeholder="Paste link here"></div><div><label>Log File Link</label><input id="logFileLink" placeholder="Paste log file link here"></div><div><label>Notes</label><input id="rcRemarks"></div></div>`}
    ${isKsaForm?`<div class="grid3"><div><label>Notes</label><input id="rcRemarks"></div><div><label>Notes</label><input id="rcNotes"></div><div></div></div>`:`<label>Notes</label><input id="rcNotes">`}
    <button onclick="submitRepair()">Submit Repair Case</button><div id="repairMsg" class="msg"></div>${renderPageNote(window.AERONEX_REPAIR_CASE_NOTE)}</div>`;
  $('rcCountry').value=selectedCountry().includes('KSA')?'KSA - SAUDI ARABIA':'UAE & Other Region';
}
async function submitRepair(){
  if(REPAIR_SUBMITTING) return;
  REPAIR_SUBMITTING = true;

  const btn = (typeof event !== 'undefined' && event && event.target) ? event.target : null;
  if(btn){
    btn.disabled = true;
    btn.textContent = 'Submitting...';
  }

  try{
    for(let id of ['rcAddress','rcCountry','rcModel','rcSerial','rcDate','rcDetails']) {
      if(!$(id).value.trim()) {
        msg('repairMsg','Please fill required fields');
        return;
      }
    }

    const isKsaForm = $('rcCountry').value.includes('KSA');
    const gacaDocument = isKsaForm ? await readFileBase64('gacaDocument') : null;

    let p={
      companyName:$('rcCompany').value,
      contactName:$('rcContact').value,
      contactEmail:$('rcEmail').value,
      address:$('rcAddress').value,
      country:$('rcCountry').value,
      modelNo:$('rcModel').value,
      serialNo:$('rcSerial').value,
      purchaseDate:$('rcDate').value,
      details:$('rcDetails').value,
      warrantyStatus: isKsaForm ? ($('rcWarranty')?.value||'') : '',
      gacaDocument,
      requiredDetailsLink: isKsaForm ? '' : ($('requiredDetailsLink')?.value||''),
      issueMediaLink: isKsaForm ? ($('issueMediaLink')?.value||'') : '',
      logFileLink:($('logFileLink')?.value||''),
      remarks:$('rcRemarks')?.value||'',
      notes:$('rcNotes')?.value||'',
      username:S.user.username
    };

    let d=await api('/api/repair-case',{method:'POST',body:JSON.stringify(p)});
    msg('repairMsg','Repair case created',true);
    await loadRepairs();
    renderRepairStatus();
  }catch(e){
    msg('repairMsg',e.message || 'Submit failed');
  }finally{
    REPAIR_SUBMITTING = false;
    if(btn){
      btn.disabled = false;
      btn.textContent = 'Submit Repair Case';
    }
  }
}
function renderRepairStatus(){
  $('repairStatus').innerHTML=`<div class="panel"><h2>Repair Status <button class="btn-light" onclick="refreshRepairs()">Refresh</button></h2><div class="table-wrap"><table><thead><tr><th>Repair Case No</th><th>Dealer / Company</th><th>Model No</th><th>Serial No</th><th>Date</th><th>Status</th><th>Log Link</th><th>Issue Media / Required Details</th><th>Remarks</th><th>Notes</th><th>Case Close Comment</th></tr></thead><tbody>${(Array.isArray(S.repairs)?S.repairs:[]).map(r=>{let f=r.fields||{};return `<tr><td>${esc(f['REPAIR CASE']||f['Repair Case']||'')}</td><td>${esc(f['Company Name']||f['Dealer Name']||'')}</td><td>${esc(f['Model No']||'')}</td><td>${esc(f['Serial No']||'')}</td><td>${new Date(Number(f['Date of Purchase / Activation date']||f['Date Of Activation']||'')).toLocaleDateString('en-GB')}</td><td>${statusCell(r,'repair')}</td><td>${linkCell(f['Log File']||f['Log for Drone and RC'])}</td><td>${linkCell(f['Upload all the required details']||f['Issue Video and Pictures'])}</td><td>${esc(f['Remarks']||'')}</td><td>${esc(f['Notes']||'')}</td><td>${esc(f['Case Close Comment']||'')}</td></tr>`}).join('')}</tbody></table></div></div>`;
}
function linkCell(v){if(!v)return '-'; if(typeof v==='object'&&v.link)return `<a href="${esc(v.link)}" target="_blank">Open</a>`; return `<a href="${esc(v)}" target="_blank">Open</a>`;}
function renderDealers(){
  $('dealers').innerHTML=`<div class="panel"><h2>Dealer Details</h2><div id="dealerForm"></div><div class="table-wrap"><table><thead><tr><th>Company Name</th><th>Contact Name</th><th>Contact No</th><th>Contact Email</th><th>Address</th><th>TRN NO</th><th>P O Box</th><th>Country</th><th>Action</th></tr></thead><tbody>${visibleDealers().map((r,i)=>{let f=r.fields||{},phone=f['Contact No']||f['Contact Number']||f['Phone']||f['Mobile']||'';return `<tr><td>${esc(f['Company Name'])}</td><td>${esc(f['Contact Person'])}</td><td>${esc(phone)}</td><td>${esc(f['Username ( Email )'])}</td><td>${esc(f.Address)}</td><td>${esc(f['TRN NO'])}</td><td>${esc(f['P O Box'])}</td><td>${esc(normalizeCountryValue(f.Country))}</td><td><button onclick="editDealer(${i})">Edit</button></td></tr>`}).join('')}</tbody></table></div></div>`;
}
function editDealer(i){
  const r=visibleDealers()[i], f=r.fields||{};
  const phone = f['Contact No'] || (String(f.Remarks||'').match(/(\\+?\\d[\\d\\s-]{7,})/)||[])[1] || '';
  $('dealerForm').innerHTML=`<h3>Edit Dealer Details</h3><div class="grid3"><div><label>Company Name</label><input id="dCompany" value="${esc(f['Company Name']||'')}"></div><div><label>Contact Name</label><input id="dContact" value="${esc(f['Contact Person']||'')}"></div><div><label>Contact No</label><input id="dPhone" value="${esc(phone)}"></div></div><div class="grid3"><div><label>Contact Email</label><input value="${esc(f['Username ( Email )']||'')}" disabled></div><div><label>TRN NO</label><input id="dTrn" value="${esc(f['TRN NO']||'')}"></div><div><label>P O Box</label><input id="dPo" value="${esc(f['P O Box']||'')}"></div></div><label>Address</label><input id="dAddress" value="${esc(f.Address||'')}"><label>Country</label><select id="dCountry" multiple size="2"><option>UAE & Other Region</option><option>KSA - SAUDI ARABIA</option></select><br><button onclick="saveDealer('${r.record_id}')">Save Dealer Details</button><div id="dealerMsg" class="msg"></div>`;
  Array.from($('dCountry').options).forEach(o=>o.selected=countryHas(f.Country,o.value));
}
async function saveDealer(record_id){
  const p={record_id,companyName:$('dCompany').value,contactName:$('dContact').value,contactNo:$('dPhone').value,address:$('dAddress').value,trnNo:$('dTrn').value,poBoxNo:$('dPo').value,country:selectedDealerCountries()};
  try{await api('/api/dealer-update',{method:'POST',body:JSON.stringify(p)});msg('dealerMsg','Dealer details saved',true);S.dealers=await api('/api/dealers');renderDealers()}catch(e){msg('dealerMsg',e.message)}
}
function renderNotes(){
  $('portalNotes').innerHTML=`<div class="panel"><h2>Portal Notes</h2><div class="notice">Important announcements, policies, and external document links.</div><div class="table-wrap"><table><thead><tr><th>Title</th><th>Page</th><th>Note</th><th>Country</th><th>Document Link</th></tr></thead><tbody>${(Array.isArray(S.notes)?S.notes:[]).map(r=>{let f=r.fields||{};let doc=f['Document Link']||f.Document||f.Link||f.URL||f['Document URL'];return `<tr><td>${esc(f.Title||'')}</td><td>${esc(f.Page||'')}</td><td>${esc(f.Note||f.Description||'')}</td><td>${esc(f.Country||'All')}</td><td>${portalDocumentLink(doc)}</td></tr>`}).join('')}</tbody></table></div></div>`;
}
function renderAdmin(){
  $('admin').innerHTML=`<div class="panel"><h2>Admin Dashboard</h2><div class="notice">Admin tools: reset passwords, mandatory fields planning, spare Excel sync planning, portal notes planning.</div>
  <h3>User Management</h3>
  <div class="table-wrap"><table><thead><tr><th>Company</th><th>User Email</th><th>Contact</th><th>Role</th><th>Country</th><th>Action</th></tr></thead><tbody>${visibleDealers().map(r=>{let f=r.fields||{};return `<tr><td>${esc(f['Company Name']||'')}</td><td>${esc(f['Username ( Email )']||'')}</td><td>${esc(f['Contact Person']||'')}</td><td>${esc(f['User Role']||'')}</td><td>${esc(f['Country']||'')}</td><td><button onclick="resetUserPassword('${r.record_id}')">Reset Password</button></td></tr>`}).join('')}</tbody></table></div>
  <div class="cards"><div class="card"><h3>Mandatory Field Settings</h3><p>Coming next: configurable required fields.</p></div><div class="card"><h3>Spare List Excel Sync</h3><p>Coming next: upload/merge spare list.</p></div><div class="card"><h3>Portal Notes</h3><p>Use Lark Portal Note table with external document links.</p></div></div></div>`;
}
async function loadOrders(){S.orders=await api('/api/my-orders?country='+encodeURIComponent(selectedCountry())+'&role='+encodeURIComponent(S.user.role||''))}
async function loadRepairs(){S.repairs=await api('/api/my-repairs?country='+encodeURIComponent(selectedCountry())+'&role='+encodeURIComponent(S.user.role||'')+'&email='+encodeURIComponent(userEmail()))}
async function initApp(){if(!requireLogin())return;layout();renderDashboard();try{S.spares=await api('/api/spares')}catch{}try{await loadOrders()}catch{}try{await loadRepairs()}catch{}try{S.dealers=await api('/api/dealers')}catch{}try{S.notes=await api('/api/portal-notes')}catch{}renderSpare();renderRepairCreate();renderRepairStatus();renderDealers();renderNotes();renderChangePassword();renderAdmin()}

