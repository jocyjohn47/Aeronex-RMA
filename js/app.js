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
    await api('/api/update-status',{method:'POST',body:JSON.stringify({tableId,record_id:recordId,status,type})});
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

function ensureAeronexLogoStyles(){
  if(document.getElementById('aeronexLogoStyles')) return;
  const s=document.createElement('style');
  s.id='aeronexLogoStyles';
  s.textContent=`
    .brand-logo-img{height:44px;max-width:220px;object-fit:contain;display:block}
    .login-logo-img{width:260px;max-width:88%;height:auto;display:block;margin:0 auto 16px auto}
  `;
  document.head.appendChild(s);
}

function layout(){ensureAeronexLogoStyles();let n=S.user?.displayName||S.user?.username||'User';document.body.innerHTML=`<header class="topbar"><div class="brand"><img class="brand-logo-img" src="img/aeronex_rma_logo_new.png" alt="AERONEX RMA Portal" onerror="this.style.display='none';this.insertAdjacentHTML('afterend','<div class=&quot;brand-title&quot;>AERO NEX</div><div class=&quot;brand-sub&quot;>RMA & Spare Order Portal</div>')"></div><nav class="nav">
<a class="active" data-sec="dashboard" href="#" onclick="show('dashboard')">⌂ Dashboard</a><a data-sec="spare" href="#" onclick="show('spare')">🛒 Spare Order</a><a data-sec="repairCreate" href="#" onclick="show('repairCreate')">📝 Create Repair Case</a><a data-sec="repairStatus" href="#" onclick="show('repairStatus')">📋 Repair Status</a>${dealerRepairCasesSectionVisible()?`<a data-sec="dealerRepairCase" href="#" onclick="show('dealerRepairCase')">🧰 Dealer Repair Case</a>`:''}<a data-sec="dealers" href="#" onclick="show('dealers')">🏢 Dealer Details</a><a data-sec="portalNotes" href="#" onclick="show('portalNotes')">📄 Portal Notes</a>${adminCenterEnabled()?`<a data-sec="adminCenter" href="#" onclick="show('adminCenter')">🧰 Admin Center</a>`:''}</nav><div class="user" onclick="this.classList.toggle('open')"><div class="avatar">${esc(initials())}</div><div><b>${esc(n)}</b><br><small>${esc(S.user.role||'End user')}</small></div><span>⌄</span><div class="menu"><a href="#" onclick="event.stopPropagation();show('changePassword')">🔒 Change Password</a><a href="#" onclick="event.stopPropagation();logout()">↪ Logout</a></div></div></header><main class="page">${['dashboard','spare','repairCreate','repairStatus','dealerRepairCase','warrantySoftwareStatus','logsDiagnostics','flycartCredit','dealers','adminCenter','internalRepair','spareOrderDetailsAdmin','portalNotes','changePassword','admin'].map(x=>`<section id="${x}" class="section"></section>`).join('')}</main><footer class="footer">© 2025 AERO NEX FZCO. This portal and its contents are proprietary and confidential.<br>Developed by Jocy John | For support, contact: support@aeronex.ae</footer>`}

async function ensureSpareListLoaded(){
  if(Array.isArray(S.spares) && S.spares.length) return S.spares;
  try{
    S.spares = await api('/api/spares');
    if(!Array.isArray(S.spares)) S.spares=[];
  }catch(e){
    S.spares=[];
    console.warn('Spare list load failed', e);
  }
  return S.spares;
}

function show(sec){
  document.querySelectorAll('.section').forEach(x=>x.classList.remove('active'));
  $(sec)?.classList.add('active');
  document.querySelectorAll('.nav a').forEach(a=>a.classList.toggle('active',a.dataset.sec===sec));
  if(sec==='spare'){ensureSpareListLoaded().then(()=>{try{renderSpareOptions();drawCart();}catch(e){try{renderSpare()}catch(_){}}}).catch(e=>console.error('spare list lazy load failed',e))}
  if(sec==='dealerRepairCase'){
    loadDealerRepairCases()
      .then(()=>renderDealerRepairCase())
      .catch(e=>{
        console.error('dealer repair history refresh failed',e);
        try{renderDealerRepairCase()}catch(err){console.error('renderDealerRepairCase failed',err)}
      });
  }
  if(sec==='warrantySoftwareStatus'){try{renderWarrantySoftwareStatus()}catch(e){console.error('renderWarrantySoftwareStatus failed',e)}}if(sec==='flycartCredit'){loadFlycartCredit().then(renderFlycartCredit).catch(e=>{console.error('flycartCredit failed',e);try{renderFlycartCredit()}catch(err){}})}if(sec==='logsDiagnostics'){try{renderLogsDiagnostics()}catch(e){console.error('renderLogsDiagnostics failed',e)}}if(sec==='adminCenter'){try{renderAdminCenter()}catch(e){console.error('renderAdminCenter failed',e)}}if(sec==='internalRepair'){loadInternalRepairMeta().then(renderInternalRepair).catch(e=>{console.error('internalRepair failed',e);try{renderInternalRepairError(e)}catch(_){}})}if(sec==='spareOrderDetailsAdmin'){loadSpareOrderDetailsMeta().then(renderSpareOrderDetailsAdmin).catch(e=>{console.error('spareOrderDetails failed',e);try{renderSpareOrderDetailsError(e)}catch(_){}})}scrollTo(0,0)
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



function adminCountryOptions(cur){
  const list=['UAE & Other Region','KSA - SAUDI ARABIA'];
  return list.map(x=>`<option value="${esc(x)}" ${String(cur||'')===x?'selected':''}>${esc(x)}</option>`).join('');
}

function userCountryText(){
  const u=S.user||{}, f=u.fields||{};
  return String(u.country || u.Country || f.Country || f['Country'] || '').trim();
}
function normalizedPortalCountry(v){
  const s=String(v||'').toLowerCase();
  if(s.includes('ksa') || s.includes('saudi')) return 'KSA - SAUDI ARABIA';
  return 'UAE & Other Region';
}
function allowedInternalRepairCountry(){
  if(isAdmin()) return localStorage.getItem('aeronexInternalRepairCountry') || 'UAE & Other Region';
  return normalizedPortalCountry(userCountryText() || country());
}
function internalRepairCountryQuery(){
  return allowedInternalRepairCountry();
}
function internalRepairCountryControl(current){
  if(isAdmin()){
    return `<b>Country:</b> <select id="internalRepairCountry" onchange="setInternalRepairCountry(this.value)">${adminCountryOptions(current)}</select>`;
  }
  return `<b>Country:</b> ${esc(current)} <span class="muted">(based on your user permission)</span>`;
}

function adminModuleCountry(){
  return allowedInternalRepairCountry();
}
function setInternalRepairCountry(v){
  if(!isAdmin()) return;
  localStorage.setItem('aeronexInternalRepairCountry', v);
  S.internalRepairMeta=null;
  loadInternalRepairMeta().then(renderInternalRepair).catch(renderInternalRepairError);
}
function fieldMetaByName(meta){
  const out={};
  (meta?.fields||[]).forEach(f=>out[f.field_name]=f);
  return out;
}
function metaOptions(meta, fieldName, current){
  const f=fieldMetaByName(meta)[fieldName] || {};
  const opts=[...(f.options||[])];
  if(current && !opts.includes(current)) opts.unshift(current);
  return `<option value=""></option>`+opts.map(x=>`<option value="${esc(x)}" ${String(current||'')===String(x)?'selected':''}>${esc(x)}</option>`).join('');
}
function isMetaMulti(meta, fieldName){
  return (fieldMetaByName(meta)[fieldName]||{}).type===4;
}
function companyOptions(current){
  const names=[...new Set((S.dealers||[]).map(r=>(r.fields||{})['Company Name']).filter(Boolean))].sort();
  if(current && !names.includes(current)) names.unshift(current);
  return `<option value=""></option>`+names.map(x=>`<option value="${esc(x)}" ${String(current||'')===String(x)?'selected':''}>${esc(x)}</option>`).join('');
}
function companyInputHtml(id, label, current){
  return `<div><label>${esc(label)}</label><input list="${id}List" id="${id}" value="${esc(current||'')}" placeholder="Select or type custom company"><datalist id="${id}List">${companyOptions(current).replaceAll('<option value=""></option>','')}</datalist></div>`;
}
function val(id){return ($(id)?.value||'').trim();}
function setVal(id,v){const el=$(id); if(el) el.value=v||'';}
function larkTimestampToDate(v){
  if(v===undefined || v===null || v==='') return '';
  const s=String(v).trim();
  if(/^\d{13}$/.test(s)){
    const d=new Date(Number(s));
    if(!isNaN(d.getTime())) return d;
  }
  if(/^\d{10}$/.test(s)){
    const d=new Date(Number(s)*1000);
    if(!isNaN(d.getTime())) return d;
  }
  if(typeof v==='number'){
    const d=new Date(v);
    if(!isNaN(d.getTime())) return d;
  }
  return null;
}
function formatDisplayDate(v){
  const pad=n=>String(n).padStart(2,'0');
  const fmt=d=>`${pad(d.getDate())}-${pad(d.getMonth()+1)}-${d.getFullYear()}`;
  const d=larkTimestampToDate(v);
  if(d) return fmt(d);
  const s=String(v||'').trim();
  const m=s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if(m){
    const d2=new Date(Number(m[1]),Number(m[2])-1,Number(m[3]));
    if(!isNaN(d2.getTime())) return fmt(d2);
  }
  return s;
}
function isDateFieldName(name){
  const k=String(name||'').toLowerCase();
  return k.includes('date') || k.includes('created') || k.includes('closed') || k.includes('creation') || k.includes('close');
}
function dateInputValue(v){
  if(!v) return '';
  const d=larkTimestampToDate(v);
  if(d) return d.toISOString().slice(0,10);
  const s=String(v);
  const m=s.match(/\d{4}-\d{2}-\d{2}/);
  return m?m[0]:s;
}
function selectedOptionsValue(id){
  const el=$(id);
  if(!el) return '';
  if(el.multiple) return Array.from(el.selectedOptions).map(o=>o.value).filter(Boolean);
  return el.value || '';
}
function selectHtml(meta, id, fieldName, current){
  const multi=isMetaMulti(meta, fieldName) && !['Order Type','Issue Type'].includes(fieldName);
  return `<select id="${id}" ${multi?'multiple size="4"':''}>${metaOptions(meta, fieldName, current)}</select>`;
}
function internalRepairFieldsForCountry(country){
  const k=String(country||'').toLowerCase().includes('ksa');
  return {
    warranty:k?'Warranty Status':'Warranry Status',
    material:k?'Material Consumed':'Material  Consumed',
    remark:k?'Remarks':'Remark',
    djiStatus:k?'DJI Repair status':'DJI Repair Status',
    sendTracking:k?'Shipping Tracking No - Sending':'Shiping Tracking No-Sending',
    recvTracking:'Shiping Tracking No -Receiving',
    recvCost:k?'Shipping Cost - Receiving From DJI':'Shipment Cost - Receive from DJI'
  };
}
async function loadInternalRepairMeta(){
  const country=internalRepairCountryQuery();
  const d=await api('/api/admin-module-meta?module=internalRepair&country='+encodeURIComponent(country)+'&role='+encodeURIComponent(S.user.role||'')+'&userCountry='+encodeURIComponent(userCountryText()||country));
  S.internalRepairMeta=d;
  S.dealers=d.dealers||S.dealers||[];
  if(Array.isArray(d.spares) && d.spares.length) S.spares=d.spares;
  S.repairSourceRows=d.repairs||[];
  S.internalRepairRows=d.rows||[];
  return d;
}
function internalRepairCaseNo(f){
  return f['REPAIR CASE']||f['Repair Case']||f['Case Register No']||'';
}
function internalRepairCaseLink(row){
  const f=row.fields||{};
  const no=internalRepairCaseNo(f);
  if(!currentUserIsAdminTech()) return esc(no||'-');
  return `<a href="#" onclick="openInternalRepairFromRepair('${esc(row.record_id)}');return false;">${esc(no||'Open')}</a>`;
}
function openInternalRepairFromRepair(recordId){
  const row=(S.repairs||[]).find(r=>r.record_id===recordId) || {};
  const f=row.fields||{};
  S.internalRepairEdit=null;
  S.internalRepairPrefill={
    'Repair Case': internalRepairCaseNo(f),
    'Company Name': f['Company Name']||f['Dealer Name']||'',
    'Product Model': f['Model No']||'',
    'Serial No': f['Serial No']||'',
    'Warranty Status': f['Warranty Status']||'',
    'Warranry Status': f['Warranty Status']||'',
    'Remark': f['Details Of Issue']||f['Issue Description']||f['Remarks']||'',
    'Remarks': f['Details Of Issue']||f['Issue Description']||f['Remarks']||''
  };
  S.returnToRepairStatus = true;
  show('internalRepair');
}
function backToRepairStatus(){
  S.returnToRepairStatus = false;
  show('repairStatus');
  if(typeof refreshRepairs === 'function') refreshRepairs();
}
function renderInternalRepairError(e){
  const sec=$('internalRepair');
  if(sec) sec.innerHTML=`<div class="panel"><h2>Internal Repair</h2><div class="msg">${esc(e.message||e)}</div></div>`;
}
function renderInternalRepair(){
  const sec=$('internalRepair'); if(!sec) return;
  if(!currentUserIsAdminTech()){sec.innerHTML=`<div class="panel"><h2>Internal Repair</h2><div class="notice">Admin/Technician only.</div></div>`;return;}
  const meta=S.internalRepairMeta||{};
  const country=meta.country||adminModuleCountry();
  const rows=S.internalRepairRows||[];
  sec.innerHTML=`<div class="panel"><h2>Internal Repair</h2>
    <div class="notice">${S.returnToRepairStatus ? '<button class="btn-light" onclick="backToRepairStatus()">← Back to Repair Status</button>' : ''}
    ${internalRepairCountryControl(country)}
    <button class="btn-light" onclick="loadInternalRepairMeta().then(renderInternalRepair)">Refresh</button>
    <button class="act" onclick="newInternalRepair()">New Internal Repair</button></div>
    <div id="internalRepairForm"></div>
    <h3>Internal Repair Register</h3>
    <div class="table-wrap"><table><thead><tr><th>DJI Case ID</th><th>Repair Case</th><th>Company</th><th>Model</th><th>Serial</th><th>Case Type</th><th>Status</th><th>Action</th></tr></thead><tbody>
    ${rows.map((r,i)=>{const f=r.fields||{};return `<tr><td>${esc(f['DJI Case ID']||'')}</td><td>${esc(f['Repair Case']||'')}</td><td>${esc(f['Company Name']||'')}</td><td>${esc(f['Product Model']||'')}</td><td>${esc(f['Serial No']||'')}</td><td>${esc(f['Case Type']||'')}</td><td>${esc(f['Case Status']||'')}</td><td><button class="btn-light" onclick="editInternalRepair(${i})">Open</button></td></tr>`}).join('')}
    </tbody></table></div></div>`;
  renderInternalRepairForm(S.internalRepairEdit||S.internalRepairPrefill||{});
}
function newInternalRepair(){S.internalRepairEdit=null;S.internalRepairPrefill={};renderInternalRepairForm({});}
function editInternalRepair(i){
  const r=(S.internalRepairRows||[])[i];
  if(!r) return;
  S.internalRepairEdit=r;
  S.internalRepairPrefill=null;
  const f=r.fields||{};
  const html = internalRepairFormHtml(f, true) + `<h3 class="details-section-title">All Lark Fields</h3>${renderAllLarkFieldsTable(f)}`;
  showDetailsModal(`Internal Repair Details - ${(f['DJI Case ID']||f['Repair Case']||'Open')}`, html);
  const n=internalRepairFieldsForCountry((S.internalRepairMeta||{}).country||adminModuleCountry());
  S.irParts=parseDealerRepairMaterials(f[n.material]||'').map(x=>({materialCode:x.materialCode,materialName:x.materialName,qty:x.qty}));
  setTimeout(()=>{try{renderInternalRepairSpareOptions();renderInternalRepairSparePreview();}catch(e){}},0);
}
function internalRepairFormHtml(src, isPopup){
  const meta=S.internalRepairMeta||{}, country=meta.country||adminModuleCountry(), n=internalRepairFieldsForCountry(country);
  const f=(S.internalRepairEdit&&S.internalRepairEdit.fields)||src||{};
  const rec=S.internalRepairEdit?.record_id||'';
  return `<div class="subpanel"><h3>${rec?'Edit':'New'} Internal Repair</h3>
    <div class="grid3">
      <div><label>DJI Case ID</label><input id="irDjiCaseId" value="${esc(f['DJI Case ID']||'')}"></div>
      <div><label>DJI Internal Case ID</label><input id="irDjiInternalCaseId" value="${esc(f['DJI Internal Case ID']||'')}"></div>
      <div><label>Repair Case</label><input id="irRepairCase" value="${esc(f['Repair Case']||'')}"></div>
      ${companyInputHtml('irCompanyName','Company Name',f['Company Name']||'')}
      <div><label>Product Model</label><input id="irProductModel" value="${esc(f['Product Model']||'')}"></div>
      <div><label>Serial No</label><input id="irSerialNo" value="${esc(f['Serial No']||'')}"></div>
      <div><label>Case Type</label>${selectHtml(meta,'irCaseType','Case Type',f['Case Type']||'')}</div>
      <div><label>Warranty Status</label>${selectHtml(meta,'irWarranty',n.warranty,f[n.warranty]||'')}</div>
      ${companyInputHtml('irBillingCompany','Billing Company',f['Billing Company']||'')}
      <div><label>Issue Type</label>${selectHtml(meta,'irIssueType','Issue Type',f['Issue Type']||'')}</div>
      <div><label>Case Creation Date</label><input id="irCreationDate" type="date" value="${esc(dateInputValue(f['Case Creation Date']))}"></div>
      <div><label>Case Close Date</label><input id="irCloseDate" type="date" value="${esc(dateInputValue(f['Case Close Date']))}"></div>
      <div><label>Shipper Name</label>${selectHtml(meta,'irShipper','Shipper Name',f['Shipper Name']||'')}</div>
      <div><label>Tracking No - Sending</label><input id="irSendTrack" value="${esc(f[n.sendTracking]||'')}"></div>
      <div><label>Shipment Cost - Sent to DJI</label><input id="irSendCost" value="${esc(f['Shipment Cost - Sent to DJI']||'')}"></div>
      <div><label>Tracking No - Receiving</label><input id="irRecvTrack" value="${esc(f[n.recvTracking]||'')}"></div>
      <div><label>Shipment Cost - Receiving</label><input id="irRecvCost" value="${esc(f[n.recvCost]||'')}"></div>
      <div><label>Unit Consumed</label><input id="irUnitConsumed" value="${esc(f['Unit Consumed']||'')}"></div>
      <div><label>Material Consumed</label><input id="irMaterialConsumed" value="${esc(f[n.material]||'')}"></div>
      <div><label>DJI Invoice</label><input id="irDjiInvoice" value="${esc(f['DJI Invoice']||'')}"></div>
      <div><label>DJI Repair Status</label>${fieldMetaByName(meta)[n.djiStatus]?.optionCount?selectHtml(meta,'irDjiStatus',n.djiStatus,f[n.djiStatus]||''):`<input id="irDjiStatus" value="${esc(f[n.djiStatus]||'')}">`}</div>
      <div><label>Case Status</label>${selectHtml(meta,'irCaseStatus','Case Status',f['Case Status']||'')}</div>
    </div>
    <label>Remarks</label><textarea id="irRemark">${esc(f[n.remark]||'')}</textarea>
    <div class="notice"><b>Add spare used:</b> select from Spare Part List. It saves to Material Consumed / Unit Consumed in the same case row.</div>
    <div class="row"><input id="irSpareSearch" placeholder="Search Material Code or Name" oninput="renderInternalRepairSpareOptions()"><input id="irSpareQty" class="qty" type="number" min="1" value="1"><button class="btn-light" onclick="addInternalRepairSpare()">Add Spare</button></div>
    <select id="irSpareSelect"></select>
    <div id="irSparePreview" class="notice"></div>
    <p><button class="act" onclick="saveInternalRepair()">Save Internal Repair</button> <span id="internalRepairMsg" class="msg"></span></p>
  </div>`;
}
function renderInternalRepairForm(src){
  const box=$('internalRepairForm'); if(!box) return;
  const meta=S.internalRepairMeta||{}, country=meta.country||adminModuleCountry(), n=internalRepairFieldsForCountry(country);
  const f=(S.internalRepairEdit&&S.internalRepairEdit.fields)||src||{};
  box.innerHTML=internalRepairFormHtml(src, false);
  S.irParts=parseDealerRepairMaterials(f[n.material]||'').map(x=>({materialCode:x.materialCode,materialName:x.materialName,qty:x.qty}));
  renderInternalRepairSpareOptions(); renderInternalRepairSparePreview();
}
function renderInternalRepairSpareOptions(){
  const s=$('irSpareSelect'); if(!s) return;
  const q=($('irSpareSearch')?.value||'').toLowerCase();
  s.innerHTML=(S.spares||[]).filter(x=>{const f=x.fields||{};return `${f['Material Code']||''} ${f['Material Name']||''}`.toLowerCase().includes(q)}).slice(0,200).map(x=>{const f=x.fields||{},o={materialCode:f['Material Code']||'',materialName:f['Material Name']||''};return `<option value="${encodeURIComponent(JSON.stringify(o))}">${esc(o.materialCode)} - ${esc(o.materialName)}</option>`}).join('');
}
function addInternalRepairSpare(){
  const s=$('irSpareSelect'); if(!s||!s.value) return;
  const o=JSON.parse(decodeURIComponent(s.value)); o.qty=val('irSpareQty')||'1';
  S.irParts=S.irParts||[]; S.irParts.push(o);
  setVal('irMaterialConsumed', S.irParts.map(p=>`${p.materialCode} - ${p.materialName} x ${p.qty}`).join('; '));
  setVal('irUnitConsumed', S.irParts.reduce((a,p)=>a+(Number(p.qty)||0),0));
  renderInternalRepairSparePreview();
}
function renderInternalRepairSparePreview(){
  const box=$('irSparePreview'); if(!box) return;
  const parts=S.irParts||[];
  box.innerHTML=parts.length?parts.map((p,i)=>`${esc(p.materialCode)} - ${esc(p.materialName)} x ${esc(p.qty)} <button class="btn-light" onclick="S.irParts.splice(${i},1);setVal('irMaterialConsumed',S.irParts.map(p=>p.materialCode+' - '+p.materialName+' x '+p.qty).join('; '));setVal('irUnitConsumed',S.irParts.reduce((a,p)=>a+(Number(p.qty)||0),0));renderInternalRepairSparePreview()">Remove</button>`).join('<br>'):'No spare selected.';
}
async function saveInternalRepair(){
  try{
    const meta=S.internalRepairMeta||{}, n=internalRepairFieldsForCountry(meta.country);
    const fields={
      'DJI Case ID':val('irDjiCaseId'),
      'DJI Internal Case ID':val('irDjiInternalCaseId'),
      'Repair Case':val('irRepairCase'),
      'Company Name':val('irCompanyName'),
      'Product Model':val('irProductModel'),
      'Serial No':val('irSerialNo'),
      'Case Type':selectedOptionsValue('irCaseType'),
      [n.warranty]:selectedOptionsValue('irWarranty'),
      'Billing Company':val('irBillingCompany'),
      'Issue Type':selectedOptionsValue('irIssueType'),
      'Case Creation Date':val('irCreationDate'),
      'Case Close Date':val('irCloseDate'),
      'Shipper Name':selectedOptionsValue('irShipper'),
      [n.sendTracking]:val('irSendTrack'),
      'Shipment Cost - Sent to DJI':val('irSendCost'),
      [n.recvTracking]:val('irRecvTrack'),
      [n.recvCost]:val('irRecvCost'),
      'Unit Consumed':val('irUnitConsumed'),
      [n.material]:val('irMaterialConsumed'),
      'DJI Invoice':val('irDjiInvoice'),
      [n.djiStatus]:selectedOptionsValue('irDjiStatus')||val('irDjiStatus'),
      'Case Status':selectedOptionsValue('irCaseStatus'),
      [n.remark]:val('irRemark')
    };
    const editingId=S.internalRepairEdit?.record_id||'';
    await api('/api/save-internal-repair',{method:'POST',body:JSON.stringify({role:S.user.role||'',country:meta.country||adminModuleCountry(),userCountry:userCountryText()||'',record_id:editingId,fields})});
    msg('internalRepairMsg','Saved successfully');
    await loadInternalRepairMeta();
    if(document.getElementById('detailsModalOverlay') && editingId){
      const idx=(S.internalRepairRows||[]).findIndex(x=>x.record_id===editingId);
      if(idx>=0) editInternalRepair(idx);
    }else{
      S.internalRepairEdit=null;S.internalRepairPrefill=null;
      renderInternalRepair();
    }
  }catch(e){msg('internalRepairMsg',e.message||'Save failed')}
}

async function loadSpareOrderDetailsMeta(){
  const d=await api('/api/admin-module-meta?module=spareOrderDetails&role='+encodeURIComponent(S.user.role||''));
  S.spareOrderDetailsMeta=d; S.dealers=d.dealers||S.dealers||[]; S.spareOrderDetailsRows=d.rows||[]; return d;
}
function renderSpareOrderDetailsError(e){
  const sec=$('spareOrderDetailsAdmin'); if(!sec)return;
  sec.innerHTML=`<div class="panel"><h2>Internal Spare Order details</h2><div class="notice">${esc(e.message||'Failed to load Internal Spare Order details')}</div></div>`;
}
function renderSpareOrderDetailsAdmin(){
  const sec=$('spareOrderDetailsAdmin'); if(!sec)return;
  if(!isAdmin()){sec.innerHTML=`<div class="panel"><h2>Internal Spare Order details</h2><div class="notice">Admin only.</div></div>`;return;}
  const rows=S.spareOrderDetailsRows||[];
  sec.innerHTML=`<div class="panel"><h2>Internal Spare Order details</h2><div class="notice">Admin-only table for DJI/internal spare order, shipment and document records. <button class="btn-light" onclick="loadSpareOrderDetailsMeta().then(renderSpareOrderDetailsAdmin)">Refresh</button> <button class="act" onclick="newSpareOrderDetails()">New Internal Spare Order</button></div><div id="spareOrderDetailsForm"></div>
  <div class="table-wrap"><table><thead><tr><th>DJI Case ID</th><th>Company</th><th>Case Type</th><th>Billing</th><th>Order Type</th><th>Created</th><th>Closed</th><th>Document</th><th>Action</th></tr></thead><tbody>
  ${rows.map((r,i)=>{const f=r.fields||{};return `<tr><td>${esc(f['DJI Case ID']||'')}</td><td>${esc(f['Company Name']||'')}</td><td>${esc(f['Case Type']||'')}</td><td>${esc(f['Billing Company']||'')}</td><td>${esc(Array.isArray(f['Order Type'])?f['Order Type'].join(', '):(f['Order Type']||''))}</td><td>${esc(formatDisplayDate(f['Case Creation Date']))}</td><td>${esc(formatDisplayDate(f['Case Close Date']))}</td><td>${detailsFieldValue(f['Document Upload'])}</td><td><button class="btn-light" onclick="editSpareOrderDetails(${i})">Open</button></td></tr>`}).join('')}</tbody></table></div></div>`;
  renderSpareOrderDetailsForm(S.spareOrderDetailsEdit?.fields||{});
}
function newSpareOrderDetails(){S.spareOrderDetailsEdit=null;renderSpareOrderDetailsForm({});}
function editSpareOrderDetails(i){
  const r=(S.spareOrderDetailsRows||[])[i];
  if(!r) return;
  S.spareOrderDetailsEdit=r;
  const inline=$('spareOrderDetailsForm');
  if(inline) inline.innerHTML='';
  const f=r.fields||{};
  const html = spareOrderDetailsFormHtml(f) + `<h3 class="details-section-title">All Lark Fields</h3>${renderAllLarkFieldsTable(f)}`;
  showDetailsModal(`Internal Spare Order details - ${(f['DJI Case ID']||f['Company Name']||'Open')}`, html);
}
function spareOrderDetailsFormHtml(f){
  const meta=S.spareOrderDetailsMeta||{};
  return `<div class="subpanel"><h3>${S.spareOrderDetailsEdit?'Edit':'New'} Internal Spare Order details</h3><div class="grid3">
    <div><label>DJI Case ID</label><input id="sodDjiCaseId" value="${esc(f['DJI Case ID']||'')}"></div>
    <div><label>Case ID Remarks</label><input id="sodCaseIdRemarks" value="${esc(f['Case ID Remarks']||'')}"></div>
    <div><label>Case Type</label>${selectHtml(meta,'sodCaseType','Case Type',f['Case Type']||'')}</div>
    ${companyInputHtml('sodCompanyName','Company Name',f['Company Name']||'')}
    <div><label>Type of Case</label><input id="sodTypeOfCase" value="${esc(f['Type of Case']||'')}"></div>
    <div><label>Billing Company</label>${selectHtml(meta,'sodBillingCompany','Billing Company',f['Billing Company']||'')}</div>
    <div><label>Order Type</label>${selectHtml(meta,'sodOrderType','Order Type',Array.isArray(f['Order Type'])?f['Order Type'].join(','):(f['Order Type']||''))}</div>
    <div><label>DJI Cost</label><input id="sodDjiCost" type="number" step="0.01" value="${esc(f['DJI Cost']||'')}"></div>
    <div><label>Case Creation Date</label><input id="sodCreationDate" type="date" value="${esc(dateInputValue(f['Case Creation Date']))}"></div>
    <div><label>Case Close Date</label><input id="sodCloseDate" type="date" value="${esc(dateInputValue(f['Case Close Date']))}"></div>
    <div><label>Shipper Name</label>${selectHtml(meta,'sodShipper','Shipper Name',f['Shipper Name']||'')}</div>
    <div><label>Tracking No - Sending</label><input id="sodSendTrack" value="${esc(f['Shiping Tracking No-Sending']||'')}"></div>
    <div><label>Shipment Cost - Sent to DJI</label><input id="sodSendCost" value="${esc(f['Shipment Cost - Sent to DJI']||'')}"></div>
    <div><label>Tracking No - Receiving</label><input id="sodRecvTrack" value="${esc(f['Shiping Tracking No -Receiving']||'')}"></div>
    <div><label>Shipment Cost - Receive from DJI</label><input id="sodRecvCost" value="${esc(f['Shipment Cost - Receive from DJI']||'')}"></div>
  </div>
  <label>Remarks</label><textarea id="sodRemarks">${esc(f['Remarks']||'')}</textarea>
  <div class="panel">
    <h3>Document Upload</h3>
    <div class="notice"><b>Current document:</b> ${detailsFieldValue(f['Document Upload'])}</div>
    <div class="row"><input id="sodDocumentUploadFile" type="file" multiple multiple><button class="btn-light" onclick="uploadSpareOrderDetailsDocument()">Upload Document(s)</button></div>
    <div id="sodDocumentMsg" class="msg"></div>
  </div>
  <p><button class="act" onclick="saveSpareOrderDetails()">Save Internal Spare Order</button> <span id="spareOrderDetailsMsg" class="msg"></span></p></div>`;
}
function renderSpareOrderDetailsForm(f){
  const box=$('spareOrderDetailsForm'); if(!box)return;
  box.innerHTML=spareOrderDetailsFormHtml(f||{});
}

async function uploadSpareOrderDetailsDocument(){
  if(!isAdmin()) return alert('Admin only');
  const r=S.spareOrderDetailsEdit;
  const inp=scopedEl('sodDocumentUploadFile');
  const files=inp&&inp.files ? Array.from(inp.files) : [];
  const box=scopedEl('sodDocumentMsg');
  const setUploadMsg=(text,cls)=>{
    if(box){
      box.className='msg '+(cls||'');
      box.textContent=text;
    }
  };
  if(!r || !r.record_id) return setUploadMsg('Upload Failed: save or open an Internal Spare Order record first','upload-fail');
  if(!files.length) return setUploadMsg('Upload Failed: select document file','upload-fail');
  try{
    setUploadMsg('Uploading... Please wait','upload-wait');
    const uploaded=[];
    for(const file of files){
      const data=await new Promise(resolve=>{
        const reader=new FileReader();
        reader.onload=()=>resolve(reader.result);
        reader.onerror=()=>resolve(null);
        reader.readAsDataURL(file);
      });
      uploaded.push({name:file.name,type:file.type||'application/octet-stream',data});
    }
    await api('/api/upload-spare-order-details-document',{method:'POST',body:JSON.stringify({
      role:S.user.role||'',
      record_id:r.record_id,
      files:uploaded
    })});
    setUploadMsg(`Upload Success: ${files.length} document(s) uploaded to Lark`,'upload-ok');
    await loadSpareOrderDetailsMeta();
    const idx=(S.spareOrderDetailsRows||[]).findIndex(x=>x.record_id===r.record_id);
    if(idx>=0){
      setTimeout(()=>editSpareOrderDetails(idx),700);
    }else{
      renderSpareOrderDetailsAdmin();
    }
  }catch(e){
    setUploadMsg('Upload Failed: '+(e.message||'Unknown error'),'upload-fail');
  }
}


function modalRoot(){
  return document.querySelector('#detailsModalOverlay .details-modal') || document;
}
function scopedEl(id){
  const root=modalRoot();
  return (root && root.querySelector('#'+CSS.escape(id))) || document.getElementById(id);
}
function scopedVal(id){
  const el=scopedEl(id);
  return el ? String(el.value || '').trim() : '';
}
function scopedSelectedOptionsValue(id){
  const el=scopedEl(id);
  if(!el) return '';
  if(el.multiple) return Array.from(el.selectedOptions).map(o=>o.value).filter(Boolean);
  return el.value || '';
}

async function saveSpareOrderDetails(){
  if(!isAdmin()) return msg('spareOrderDetailsMsg','Admin only');
  try{
    const editingId=S.spareOrderDetailsEdit?.record_id||'';
    const base=(S.spareOrderDetailsEdit&&S.spareOrderDetailsEdit.fields)||{};
    const get=(id, name)=>scopedVal(id) || '';
    const getSel=(id, name)=>scopedSelectedOptionsValue(id) || '';
    const fields={
      'DJI Case ID':get('sodDjiCaseId','DJI Case ID'),
      'Case ID Remarks':get('sodCaseIdRemarks','Case ID Remarks'),
      'Case Type':getSel('sodCaseType','Case Type'),
      'Company Name':get('sodCompanyName','Company Name'),
      'Type of Case':get('sodTypeOfCase','Type of Case'),
      'Billing Company':getSel('sodBillingCompany','Billing Company'),
      'Order Type':getSel('sodOrderType','Order Type'),
      'DJI Cost':get('sodDjiCost','DJI Cost'),
      'Case Creation Date':get('sodCreationDate','Case Creation Date'),
      'Case Close Date':get('sodCloseDate','Case Close Date'),
      'Shipper Name':getSel('sodShipper','Shipper Name'),
      'Shiping Tracking No-Sending':get('sodSendTrack','Shiping Tracking No-Sending'),
      'Shipment Cost - Sent to DJI':get('sodSendCost','Shipment Cost - Sent to DJI'),
      'Shiping Tracking No -Receiving':get('sodRecvTrack','Shiping Tracking No -Receiving'),
      'Shipment Cost - Receive from DJI':get('sodRecvCost','Shipment Cost - Receive from DJI'),
      'Remarks':get('sodRemarks','Remarks')
    };
    const res=await api('/api/save-spare-order-details',{method:'POST',body:JSON.stringify({role:S.user.role||'',record_id:editingId,fields})});
    msg('spareOrderDetailsMsg',res&&res.partial?'Saved partially. Some fields were skipped.':'Saved successfully');
    await loadSpareOrderDetailsMeta();
    if(document.getElementById('detailsModalOverlay') && editingId){
      const idx=(S.spareOrderDetailsRows||[]).findIndex(x=>x.record_id===editingId);
      if(idx>=0) setTimeout(()=>editSpareOrderDetails(idx),500);
    }else{
      S.spareOrderDetailsEdit=null;
      renderSpareOrderDetailsAdmin();
    }
  }catch(e){msg('spareOrderDetailsMsg','Save Failed: '+(e.message||'Unknown error'))}
}


function flycartCreditEnabled(){ return isAdmin(); }

function flycartFields(){
  return [
    'Spare Order Case',
    'Total Credit Available',
    'Credit Used',
    'Credit Balance',
    'Total Device Purchased',
    'Dealer email',
    'Spare PI amount',
    'DJI Order Cost',
    'Dealer Name',
    'DJI Case No'
  ];
}

async function loadFlycartCredit(){
  if(!flycartCreditEnabled()) return;
  const d = await api('/api/flycart-credit-use?role='+encodeURIComponent(S.user.role||''));
  S.flycartCreditRows = d.rows || [];
}

function flycartValue(v){
  if(v===undefined || v===null || v==='') return '';
  if(Array.isArray(v)) return v.map(flycartValue).filter(Boolean).join(', ');
  if(typeof v==='object') return v.text || v.name || v.file_name || v.link || v.url || v.value || '';
  return String(v);
}

function renderFlycartCredit(){
  const sec = $('flycartCredit');
  if(!sec) return;

  if(!flycartCreditEnabled()){
    sec.innerHTML = `<div class="panel"><h2>Flycart Credit Use</h2><div class="notice">Admin only.</div></div>`;
    return;
  }

  const rows = Array.isArray(S.flycartCreditRows) ? S.flycartCreditRows : [];
  const fields = flycartFields();

  sec.innerHTML = `<div class="panel">
    <h2>Flycart Credit Use</h2>
    <div class="notice">Admin only. This page reads and updates only the Lark table Flycart Credit Use. It is not linked to Spare Order or any other module.</div>
    <div class="row">
      <button onclick="loadFlycartCredit().then(renderFlycartCredit)">Refresh</button>
      <button class="btn-light" onclick="newFlycartCredit()">Add Record</button>
      <a class="btn-light" target="_blank" rel="noopener" href="/api/flycart-credit-use-report?role=${encodeURIComponent(S.user.role||'')}">Export Excel</a>
    </div>
    <div id="flycartMsg" class="msg"></div>
    <div class="table-wrap"><table>
      <thead><tr>${fields.map(x=>`<th>${esc(x)}</th>`).join('')}<th>Action</th></tr></thead>
      <tbody>
        ${rows.map((r,i)=>{
          const f=r.fields||{};
          return `<tr>${fields.map(k=>`<td>${esc(flycartValue(f[k]))}</td>`).join('')}<td><button class="btn-light" onclick="editFlycartCredit(${i})">Edit</button></td></tr>`;
        }).join('') || `<tr><td colspan="${fields.length+1}">No records found. Check FLYCART_CREDIT_USE_TABLE_ID binding.</td></tr>`}
      </tbody>
    </table></div>
    <div id="flycartEditor"></div>
  </div>`;
}

function flycartInputId(field){
  return 'flycart_'+field.replace(/[^a-zA-Z0-9]/g,'_');
}

function flycartEditorHtml(row){
  const f = row?.fields || {};
  const fields = flycartFields();
  return `<div class="panel" style="margin-top:18px">
    <h3>${row?.record_id ? 'Edit Flycart Credit Record' : 'Add Flycart Credit Record'}</h3>
    <input id="flycartRecordId" type="hidden" value="${esc(row?.record_id||'')}">
    <div class="grid3">
      ${fields.map(k=>`<div><label>${esc(k)}</label><input id="${flycartInputId(k)}" value="${esc(flycartValue(f[k]))}"></div>`).join('')}
    </div>
    <div class="row">
      <button onclick="saveFlycartCredit()">Save to Lark</button>
      <button class="btn-light" onclick="$('flycartEditor').innerHTML=''">Cancel</button>
    </div>
  </div>`;
}

function editFlycartCredit(i){
  const row = (S.flycartCreditRows||[])[i];
  $('flycartEditor').innerHTML = flycartEditorHtml(row);
  $('flycartEditor').scrollIntoView({behavior:'smooth',block:'start'});
}

function newFlycartCredit(){
  $('flycartEditor').innerHTML = flycartEditorHtml(null);
  $('flycartEditor').scrollIntoView({behavior:'smooth',block:'start'});
}

async function saveFlycartCredit(){
  try{
    const fields = {};
    for(const k of flycartFields()){
      fields[k] = ($(flycartInputId(k))?.value || '').trim();
    }
    const record_id = $('flycartRecordId')?.value || '';
    const d = await api('/api/flycart-credit-use/save',{
      method:'POST',
      body:JSON.stringify({
        role:S.user.role||'',
        record_id,
        fields
      })
    });
    msg('flycartMsg', d.skipped?.length ? 'Saved. Skipped non-editable fields: '+d.skipped.join(', ') : 'Saved');
    await loadFlycartCredit();
    renderFlycartCredit();
  }catch(e){
    msg('flycartMsg', e.message || String(e));
  }
}


function adminCenterEnabled(){
  return isAdmin() || currentUserIsAdminTech();
}

function adminCenterCards(){
  const cards = [];
  if(isAdmin()) cards.push(['⚙','Admin','User and system administration.','admin','Open']);
  if(warrantySoftwareStatusEnabled()){
    cards.push(['🔎','Warranty & Software Status','Check warranty and software status records.','warrantySoftwareStatus','Open']);
  }
  if(flycartCreditEnabled()){
    cards.push(['💳','Flycart Credit Use','Manage Flycart credit use records.','flycartCredit','Open']);
  }
  if(currentUserIsAdminTech()){
    cards.push(['🛠','Internal Repair','Create and update internal repair register cases.','internalRepair','Open']);
  }
  if(isAdmin()){
    cards.push(['📦','Internal Spare Order details','Admin-only spare order internal processing records.','spareOrderDetailsAdmin','Open']);
  }
  if(logsPageEnabled()){
    cards.push(['🧾','Logs & Diagnostics','Check error logs and Lark table diagnostics.','logsDiagnostics','Open']);
  }
  return cards;
}

function renderAdminCenter(){
  const sec=$('adminCenter');
  if(!sec) return;
  if(!adminCenterEnabled()){
    sec.innerHTML=`<div class="panel"><h2>Admin Center</h2><div class="notice">You do not have permission to access Admin Center.</div></div>`;
    return;
  }
  const cards=adminCenterCards();
  sec.innerHTML=`<div class="panel"><h2>Admin Center</h2><div class="notice">Role-based admin and technician tools.</div>
    <div class="cards">
      ${cards.map(c=>`<div class="card"><div class="ico">${c[0]}</div><h3>${c[1]}</h3><p>${c[2]}</p><a href="#" onclick="show('${c[3]}')">${c[4]} →</a></div>`).join('') || '<div class="notice">No tools available for this role.</div>'}
    </div>
  </div>`;
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


function uiLower(v){return String(v||'').toLowerCase();}
function canCreateOnBehalfOfDealer(){
  return isAdmin() || currentUserIsAdminTech();
}

function dealerRowsForOnBehalf(){
  if(!canCreateOnBehalfOfDealer()) return [];
  const rows = Array.isArray(S.dealers) ? S.dealers : [];
  const q = uiLower(selectedCountry());
  const me = currentUserEmailLower();

  return rows.filter(r=>{
    const f = r.fields || {};
    const c = uiLower(f.Country || '');
    const role = uiLower(f['User Role'] || f.Role || '');
    const email = dealerContactEmail(r);

    // Do not show Admin users in the on-behalf dealer dropdown.
    if(role.includes('admin')) return false;

    // Technician users should only see their own row plus dealers/end users.
    // This prevents one technician selecting another technician unless it is self.
    if((role.includes('technician') || role.includes('tech')) && email !== me) return false;

    // Country restriction.
    if(q.includes('ksa')) return c.includes('ksa');
    if(q.includes('uae')) return !c.includes('ksa');

    return true;
  });
}

function dealerOptionLabel(row){
  const f = row.fields || {};
  return [f['Company Name']||'', f['Contact Person']||'', f['Username ( Email )']||''].filter(Boolean).join(' - ');
}

function dealerAddressFromFields(f){
  return f.Address || parseRemark(f.Remarks||'', 'Address') || '';
}

function selectedOnBehalfDealer(prefix){
  if(!canCreateOnBehalfOfDealer()) return null;
  const idx = Number($(prefix+'DealerSelect')?.value || -1);
  const rows = dealerRowsForOnBehalf();
  return Number.isFinite(idx) && idx >= 0 ? rows[idx] : null;
}

function selectedOnBehalfDealerFields(prefix){
  const row = selectedOnBehalfDealer(prefix);
  return row ? (row.fields || {}) : null;
}

function dealerSelectHtml(prefix){
  if(!canCreateOnBehalfOfDealer()) return '';
  const rows = dealerRowsForOnBehalf();
  return `<div class="notice"><b>Create on behalf of dealer:</b>
    <select id="${prefix}DealerSelect" style="max-width:460px;display:inline-block;margin-left:10px" onchange="applyDealerTo${prefix==='spare'?'Spare':'Repair'}Form()">
      <option value="-1">Use my details</option>
      ${rows.map((r,i)=>`<option value="${i}">${esc(dealerOptionLabel(r))}</option>`).join('')}
    </select>
  </div>`;
}

function applyDealerToSpareForm(){
  const f = selectedOnBehalfDealerFields('spare');
  if(!f) {
    if($('spareCompany')) $('spareCompany').value = uf('Company Name','AERO NEX');
    if($('spareContact')) $('spareContact').value = uf('Contact Person','');
    if($('spareAddress')) $('spareAddress').value = dealerAddress();
    if($('spareCountry')) $('spareCountry').value = selectedCountry();
    return;
  }
  if($('spareCompany')) $('spareCompany').value = f['Company Name'] || '';
  if($('spareContact')) $('spareContact').value = f['Contact Person'] || '';
  if($('spareAddress')) $('spareAddress').value = dealerAddressFromFields(f);
  if($('spareCountry')) $('spareCountry').value = normalizeCountryValue(f.Country || selectedCountry());
}

function applyDealerToRepairForm(){
  const f = selectedOnBehalfDealerFields('repair');
  if(!f) {
    if($('rcCompany')) $('rcCompany').value = uf('Company Name','AERO NEX');
    if($('rcContact')) $('rcContact').value = uf('Contact Person','');
    if($('rcEmail')) $('rcEmail').value = uf('Username ( Email )',S.user.username);
    if($('rcAddress')) $('rcAddress').value = dealerAddress();
    if($('rcCountry')) $('rcCountry').value = selectedCountry();
    return;
  }
  if($('rcCompany')) $('rcCompany').value = f['Company Name'] || '';
  if($('rcContact')) $('rcContact').value = f['Contact Person'] || '';
  if($('rcEmail')) $('rcEmail').value = f['Username ( Email )'] || '';
  if($('rcAddress')) $('rcAddress').value = dealerAddressFromFields(f);
  if($('rcCountry')) $('rcCountry').value = normalizeCountryValue(f.Country || selectedCountry());
}

function renderSpare(){$('spare').innerHTML=`<div class="panel"><h2>Spare Order</h2><div class="notice">Select material by name or material code. Review before submit. No edit after apply; cancel request only.${isAdmin()?`<br><b>Country:</b> <select style="max-width:260px;display:inline-block;margin-left:10px" onchange="setAdminCountry(this.value);renderSpare()"><option ${selectedCountry()==='UAE & Other Region'?'selected':''}>UAE & Other Region</option><option ${selectedCountry()==='KSA - SAUDI ARABIA'?'selected':''}>KSA - SAUDI ARABIA</option></select>`:''}</div>${dealerSelectHtml('spare')}<div class="grid4"><div><label>Company Name</label><input id="spareCompany" value="${esc(uf('Company Name','AERO NEX'))}" disabled></div><div><label>Contact Name</label><input id="spareContact" value="${esc(uf('Contact Person',''))}" disabled></div><div><label>Billing Address</label><input id="spareAddress" value="${esc(dealerAddress())}" disabled></div><div><label>Country</label><input id="spareCountry" value="${esc(selectedCountry())}" disabled></div></div><div style="max-width:260px"><label>Invoice Currency</label><select id="invoiceCurrency" onchange="drawCart()">${currencyOptions()}</select></div><label>Add from Spare Part List</label><div class="row"><input id="spareSearch" placeholder="Search by Material Code or Material Name..." oninput="renderSpareOptions()"><input id="spareQty" class="qty" type="number" min="1" value="1"><button class="act" onclick="addListed()">Add Item</button></div><select id="spareSelect"></select><h3>Custom Spare (if not in list)</h3><div class="row"><input id="customCode" placeholder="Material Code (if known)"><input id="customName" placeholder="Material Name"><input id="customQty" class="qty" type="number" min="1" value="1"><button class="act" onclick="addCustom()">Add Custom</button></div><label>Remarks</label><textarea id="spareNotes" placeholder="Optional remarks for this spare order" style="min-height:80px"></textarea><h3>Review Items</h3><div class="table-wrap"><table><thead><tr><th>Material Code</th><th>Material Name</th><th>Compatible Model</th><th>Qty</th><th id="cartUnitPriceHead">Unit Price</th><th id="cartTotalHead">Total</th><th>Action</th></tr></thead><tbody id="cartRows"></tbody></table></div><button onclick="submitOrder()">Submit Order</button> <button class="btn-light" onclick="S.cart=[];drawCart()">Clear All</button><div id="orderMsg" class="msg"></div><h3>My Order History <button class="btn-light" onclick="loadOrders().then(renderOrders)">Refresh</button> ${isAdmin()?`<a class="btn-light" target="_blank" rel="noopener" href="/api/download-spare-orders-report?country=${encodeURIComponent(selectedCountry())}&role=${encodeURIComponent(S.user.role||'')}">Download All Reports</a>`:''}</h3><div class="table-wrap"><table><thead><tr><th>Spare Order No</th><th>Status</th><th>Invoice Download</th><th>Payment Receipt</th><th>Final Notes</th><th>Remarks</th></tr></thead><tbody id="orderRows"></tbody></table>${renderPageNote(window.AERONEX_SPARE_ORDER_NOTE)}</div></div>`;renderSpareOptions();drawCart();renderOrders()}
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

function submitSuccessPopup(kind, caseNo){
  const no = String(caseNo || '').trim();
  if(kind === 'Spare Order'){
    alert(
      `Spare Order Submitted Successfully

` +
      `Your spare order has been submitted successfully.` +
      (no ? `

Spare Order No: ${no}` : '') +
      `

Please send us an email with the Spare Order Number for follow-up.`
    );
    return;
  }
  if(kind === 'Repair Case'){
    alert(
      `Repair Case Submitted Successfully

` +
      `Your repair case has been submitted successfully.` +
      (no ? `

Case No: ${no}` : '') +
      `

Please send us an email with the Case Number for follow-up.`
    );
    return;
  }
  alert(
    `Submitted Successfully

` +
    `Your case has been submitted successfully.` +
    (no ? `

Case No: ${no}` : '') +
    `

Please send us an email with the Case Number for follow-up.`
  );
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
    let p={companyName:($('spareCompany')?.value||uf('Company Name','AERO NEX')),contactName:($('spareContact')?.value||uf('Contact Person','')),billingAddress:($('spareAddress')?.value||dealerAddress()),invoiceCurrency:currency,country:($('spareCountry')?.value||selectedCountry()),items:pricedItems,remarks:(($('spareNotes')&&$('spareNotes').value)||'').trim()};
    let d=await api('/api/submit-spare',{method:'POST',body:JSON.stringify(p)});
    msg('orderMsg','Order submitted with Excel file: '+d.orderNo,true);
    submitSuccessPopup('Spare Order', d.orderNo);
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
  if(!canSeeInternalFiles()) return '<span class="muted">Admin / Technician only</span>';
  const no = getSpareOrderNoFromRow(r);
  const tableId = r && (r._table_id || r.tableId || r.table_id) || '';
  const recordId = r && r.record_id || '';
  if(!tableId || !recordId) return '-';
  const url = `/api/download-order-excel?tableId=${encodeURIComponent(tableId)}&record_id=${encodeURIComponent(recordId)}&orderNo=${encodeURIComponent(no)}&role=${encodeURIComponent(S.user.role||'')}`;
  return `<a class="btn-light" href="${url}" target="_blank" rel="noopener">Download Order File</a>`;
}

function localOrderDownloadLink(orderNo, fileVal, row){
  return backendOrderDownloadLink(row);
}


function spareOrderDisplayCell(v){
  if(v===undefined || v===null || v==='') return '-';
  if(Array.isArray(v)){
    if(!v.length) return '-';
    const f=v[0]||{};
    const url=f.url||f.link||f.tmp_url||'';
    const name=f.name||f.file_name||f.filename||'Open';
    return url ? `<a class="btn-light" target="_blank" rel="noopener" href="${esc(url)}">${esc(name)}</a>` : esc(name||'Available');
  }
  if(typeof v==='object'){
    const url=v.link||v.url||v.tmp_url||'';
    const text=v.text||v.name||v.file_name||v.value||'Open';
    return url ? `<a class="btn-light" target="_blank" rel="noopener" href="${esc(url)}">${esc(text)}</a>` : esc(text);
  }
  const s=String(v);
  if(s.startsWith('http://') || s.startsWith('https://')) return `<a class="btn-light" target="_blank" rel="noopener" href="${esc(s)}">Open</a>`;
  return esc(s);
}
function spareOrderField(f, names){
  for(const n of names){
    if(f && f[n] !== undefined && f[n] !== null && f[n] !== '') return f[n];
  }
  return '';
}
function spareOrderDealerCnCell(f){ return spareOrderDisplayCell(spareOrderField(f, ['Dealer Credit Note','Dealer CN'])); }
function spareOrderDestinationValue(f){ return spareOrderField(f, ['Shipment Destination','Order Location','Spare Order Location']); }
function spareOrderTrackingValue(f){ return spareOrderField(f, ['Shipment Tracking No','Tracking No','Shipment Tracking Number']); }
function spareOrderSpecializedValue(f){ return spareOrderField(f, ['Specialized']); }
function spareOrderSpareSourceValue(f){ return spareOrderField(f, ['Spare Source']); }
function spareOrderStockUpdatedValue(f){ return spareOrderField(f, ['Stock Updated']); }
function spareOrderFinalNotesValue(f){ return spareOrderField(f, ['Final Notes']); }
function spareOrderDjiCaseValue(f){ return spareOrderField(f, ['DJI Case NO','DJI case NO','DJI Case No','DJI case No']); }
function spareOrderCanEditInternal(){ return isAdmin(); }
function spareOrderCanDownloadReport(){ return isAdmin(); }
function shipmentDestinationOptions(cur){
  const opts=['','HONG KONG WH','DXB FZCO (JAFZA)','DXB DSO (Mainland)','KSA Office','SHIP TO DEALER'];
  return opts.map(x=>`<option value="${esc(x)}" ${String(cur||'')===x?'selected':''}>${esc(x||'Select')}</option>`).join('');
}
function spareSourceOptions(cur){
  const isKsa = String(selectedCountry() || '').toLowerCase().includes('ksa');
  const opts = isKsa
    ? ['', 'KSA Local Stock', 'From DJI']
    : ['', 'UAE Local Stock', 'From DJI'];
  return opts.map(x=>`<option value="${esc(x)}" ${String(cur||'')===x?'selected':''}>${esc(x||'Select')}</option>`).join('');
}
function specializedOptions(cur){
  const opts=['','Enterprise','Delivery','Consumer','Agriculture'];
  return opts.map(x=>`<option value="${esc(x)}" ${String(cur||'')===x?'selected':''}>${esc(x||'Select')}</option>`).join('');
}

function ensureDetailsModalStyles(){
  if(document.getElementById('aeronexDetailsModalStyles')) return;
  const s=document.createElement('style');
  s.id='aeronexDetailsModalStyles';
  s.textContent=`
    .details-modal-overlay{position:fixed;inset:0;background:rgba(15,23,42,.58);z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding:32px 14px;overflow:auto}
    .details-modal{background:#fff;width:min(1180px,96vw);max-height:92vh;overflow:auto;border-radius:16px;box-shadow:0 24px 80px rgba(0,0,0,.32);border:1px solid #dbe7ff}
    .details-modal-head{position:sticky;top:0;background:linear-gradient(90deg,#e8f1ff,#f8fbff);border-bottom:1px solid #dbe7ff;padding:14px 18px;display:flex;align-items:center;justify-content:space-between;gap:12px;z-index:2}
    .details-modal-head h2{margin:0;font-size:20px;color:#0f2a5f}
    .details-modal-body{padding:18px}
    .details-modal-close{border:0;background:#0f2a5f;color:#fff;border-radius:8px;padding:8px 12px;cursor:pointer;font-weight:700}
    .details-kv{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:14px}
    .details-kv .kv{border:1px solid #e2e8f0;background:#f8fbff;border-radius:10px;padding:10px;min-width:0}
    .details-kv .kv b{display:block;font-size:12px;color:#475569;margin-bottom:5px}
    .details-kv .kv div{font-size:14px;color:#0f172a;word-break:break-word;overflow-wrap:anywhere}
    .details-section-title{margin:18px 0 8px 0;color:#0f2a5f}
    .details-all-fields-wrap{width:100%;overflow-x:auto;border:1px solid #e2e8f0;border-radius:10px;background:#fff}
    table.details-all-fields{width:100%;min-width:760px;border-collapse:collapse;table-layout:fixed}
    .details-all-fields th,.details-all-fields td{border-bottom:1px solid #e2e8f0;padding:9px 10px;text-align:left;vertical-align:top}
    .details-all-fields th{background:#eef6ff;color:#0f2a5f;width:260px;min-width:260px;max-width:260px;white-space:nowrap;word-break:normal;overflow-wrap:normal}
    .details-all-fields td{color:#0f172a;word-break:break-word;overflow-wrap:anywhere}
    .details-modal textarea{width:100%;box-sizing:border-box}.upload-ok{color:#15803d;font-weight:700}.upload-fail{color:#b91c1c;font-weight:700}.upload-wait{color:#1d4ed8;font-weight:700}
    @media(max-width:820px){.details-kv{grid-template-columns:1fr}.details-modal{width:98vw}.details-modal-body{padding:12px}.details-all-fields th{width:180px;min-width:180px;max-width:180px}}
  `;
  document.head.appendChild(s);
}
function closeDetailsModal(){
  const el=document.getElementById('detailsModalOverlay');
  if(el) el.remove();
}
function showDetailsModal(title, html){
  ensureDetailsModalStyles();
  closeDetailsModal();
  const el=document.createElement('div');
  el.id='detailsModalOverlay';
  el.className='details-modal-overlay';
  el.innerHTML=`<div class="details-modal"><div class="details-modal-head"><h2>${esc(title||'Details')}</h2><button class="details-modal-close" onclick="closeDetailsModal()">Close ✕</button></div><div class="details-modal-body">${html}</div></div>`;
  el.addEventListener('click', function(e){ if(e.target===el) closeDetailsModal(); });
  document.body.appendChild(el);
}
function shouldFormatAsDisplayDate(fieldName, value){
  const k = String(fieldName || '').toLowerCase();
  if(!(k.includes('date') || k.includes('created') || k.includes('creation') || k.includes('closed') || k.includes('close') || k.includes('updated') || k.includes('modified'))) return false;
  return !!larkTimestampToDate(value) || /\d{4}-\d{2}-\d{2}/.test(String(value || ''));
}
function detailsFieldValue(v, fieldName, row){
  if(v===undefined || v===null || v==='') return '-';

  const k = String(fieldName || '').toLowerCase();
  if(row && (k === 'order file' || k.includes('order file')) && typeof backendOrderDownloadLink === 'function'){
    return backendOrderDownloadLink(row);
  }

  if(Array.isArray(v)) return v.map(x=>detailsFieldValue(x, fieldName, row)).join('<br>');

  if(shouldFormatAsDisplayDate(fieldName, v)) return esc(formatDisplayDate(v));

  if(typeof v==='object'){
    const link = v.link || v.url || v.href || v.file_url || v.tmp_url;
    const name = v.text || v.name || v.filename || v.value || v.title || 'Open';
    if(link) return `<a target="_blank" rel="noopener" href="${esc(link)}">${esc(name)}</a>`;
    try{return esc(JSON.stringify(v));}catch(e){return esc(String(v));}
  }
  return esc(String(v));
}
function renderAllLarkFieldsTable(fields, row){
  const entries=Object.entries(fields||{});
  if(!entries.length) return '<div class="notice">No fields available.</div>';
  return `<div class="details-all-fields-wrap"><table class="details-all-fields"><tbody>${entries.map(([k,v])=>`<tr><th>${esc(k)}</th><td>${detailsFieldValue(v,k,row)}</td></tr>`).join('')}</tbody></table></div>`;
}
function kv(label, value){
  return `<div class="kv"><b>${esc(label)}</b><div>${detailsFieldValue(value,label)}</div></div>`;
}
function kvHtml(label, html){
  return `<div class="kv"><b>${esc(label)}</b><div>${html || '-'}</div></div>`;
}


function openOrderDetails(i){ return openSpareOrderDetails(i); }
function openSpareOrderDetails(i){
  currentSpareOrderDetailIndex=i;
  const r = (Array.isArray(S.orders) ? S.orders : [])[i];
  if(!r) return;
  const f = r.fields || {};
  const orderNo = orderNoValue(f);
  const canEdit = spareOrderCanEditInternal();
  const canReport = spareOrderCanDownloadReport();

  const summary = `<div class="details-kv">
    ${kv('Spare Order No', orderNo || '-')}
    ${kv('Status', f['Status'] || '-')}
    ${kv('Invoice Currency', f['Invoice Currency'] || '-')}
    ${kv('Company Name', f['Company Name'] || '-')}
    ${kv('Contact Name', f['Contact Name'] || '-')}
    ${kv('Billing / Invoice Address', f['Billing Address'] || f['Invoice Address'] || '-')}
    ${kvHtml('Order File', backendOrderDownloadLink(r))}
    ${kvHtml('Dealer CN', spareOrderDealerCnCell(f))}
    ${kv('Shipment Destination', spareOrderDestinationValue(f) || '-')}
    ${kv('Shipment Tracking No', spareOrderTrackingValue(f) || '-')}
    ${kv('Specialized', spareOrderSpecializedValue(f) || '-')}
    ${kv('Spare Source', spareOrderSpareSourceValue(f) || '-')}
    ${kvHtml('Invoice Download', invoiceDownloadCell(r))}
    ${kvHtml('Payment Receipt', paymentReceiptCell(r))}
    ${kv('DJI Case No', spareOrderDjiCaseValue(f) || '-')}
  </div>
  <h3 class="details-section-title">Remarks</h3><div class="notice">${esc(f['Remarks'] || '-')}</div>
  <h3 class="details-section-title">Final Notes</h3><div class="notice">${esc(spareOrderFinalNotesValue(f) || '-')}</div>`;

  const adminEdit = canEdit ? `
    <div class="panel">
      <h3>Admin Spare Order Update</h3>
      <div class="notice">Admin can update the spare order processing fields here. Internal Spare Order details remains a separate Admin Center page and is not linked automatically.</div>
      <div class="grid3">
        <div><label>Shipment Destination</label><select id="soShipDestination">${shipmentDestinationOptions(spareOrderDestinationValue(f))}</select></div>
        <div><label>Shipment Tracking No</label><input id="soShipTracking" value="${esc(spareOrderTrackingValue(f)||'')}"></div>
        <div><label>Specialized</label><select id="soSpecialized">${specializedOptions(spareOrderSpecializedValue(f))}</select></div>
        <div><label>Spare Source</label><select id="soSpareSource">${spareSourceOptions(spareOrderSpareSourceValue(f))}</select></div>
      </div>
      <div class="grid3">
        <div><label>Invoice Amount</label><input id="soInvoiceAmount" value="${esc(f['Invoice Amount']||'')}"></div>
        <div><label>Shipment Cost ( AED )</label><input id="soShipmentCostAed" value="${esc(f['Shipment Cost ( AED )']||'')}"></div>
        <div><label>DJI Case No</label><input id="soDjiCaseNo" value="${esc(spareOrderDjiCaseValue(f)||'')}"></div>
        <div><label>Dealer CN Upload</label><input id="soDealerCnFile" type="file" onchange="uploadSpareOrderDealerCn(currentSpareOrderDetailIndex)"></div>
      </div>
      <label>Final Notes</label><textarea id="soFinalNotes" style="min-height:90px">${esc(spareOrderFinalNotesValue(f)||'')}</textarea>
      <div class="row"><button onclick="saveSpareOrderInternal(${i})">Save Details</button></div>
      <div id="soDetailMsg" class="msg"></div>
    </div>` : '';

  const report = canReport ? `<a class="btn-light" target="_blank" rel="noopener" href="/api/download-spare-order-report?tableId=${encodeURIComponent(r._table_id||'')}&record_id=${encodeURIComponent(r.record_id||'')}&role=${encodeURIComponent(S.user.role||'')}">Download Excel Report</a>` : '';

  const html = `${summary}
    ${adminEdit}
    <h3 class="details-section-title">All Lark Fields</h3>
    ${renderAllLarkFieldsTable(f, r)}
    <div class="row">${report}</div>`;

  showDetailsModal(`Spare Order Details - ${orderNo || '-'}`, html);
}
async function saveSpareOrderInternal(i){
  const r = (Array.isArray(S.orders) ? S.orders : [])[i];
  if(!r) return;
  try{
    const payload={
      tableId:r._table_id||r.tableId||r.table_id||'',
      record_id:r.record_id,
      role:S.user.role||'',
      shipmentDestination:($('soShipDestination')?.value||'').trim(),
      shipmentTrackingNo:($('soShipTracking')?.value||'').trim(),
      specialized:($('soSpecialized')?.value||'').trim(),
      spareSource:($('soSpareSource')?.value||'').trim(),
      finalNotes:($('soFinalNotes')?.value||'').trim(),
      invoiceAmount:($('soInvoiceAmount')?.value||'').trim(),
      shipmentCostAed:($('soShipmentCostAed')?.value||'').trim(),
      djiCaseNo:($('soDjiCaseNo')?.value||'').trim()
    };
    await api('/api/update-spare-order-internal',{method:'POST',body:JSON.stringify(payload)});
    msg('soDetailMsg','Saved');
    await loadOrders();
    openSpareOrderDetails(i);
  }catch(e){msg('soDetailMsg',e.message)}
}
async function uploadSpareOrderDealerCn(i){
  if(i===undefined || i===null || i<0) i=currentSpareOrderDetailIndex;
  const r = (Array.isArray(S.orders) ? S.orders : [])[i];
  const inp=$('soDealerCnFile');
  const file=inp&&inp.files&&inp.files[0];
  if(!r || !file) return msg('soDetailMsg','Select Dealer CN file');
  try{
    const data=await new Promise(resolve=>{
      const reader=new FileReader();
      reader.onload=()=>resolve(reader.result);
      reader.onerror=()=>resolve(null);
      reader.readAsDataURL(file);
    });
    await api('/api/upload-dealer-cn',{method:'POST',body:JSON.stringify({
      tableId:r._table_id||r.tableId||r.table_id||'',
      record_id:r.record_id,
      orderNo:orderNoValue(r.fields||{}),
      role:S.user.role||'',
      file:{name:file.name,type:file.type||'application/octet-stream',data}
    })});
    msg('soDetailMsg','Dealer CN uploaded');
    await loadOrders();
    openSpareOrderDetails(i);
  }catch(e){msg('soDetailMsg',e.message)}
}

function renderOrders(){
  let e=$('orderRows');
  if(!e)return;
  e.innerHTML=(Array.isArray(S.orders)?S.orders:[]).map((r,i)=>{
    let f=r.fields||{};
    let no=orderNoValue(f);
    return `<tr>
      <td><a href="#" onclick="openSpareOrderDetails(${i});return false;">${esc(no||'-')}</a></td>
      <td>${statusCell(r,'spare')}</td>
      <td>${invoiceDownloadCell(r)}</td>
      <td>${paymentReceiptCell(r)}</td>
      <td>${esc(spareOrderFinalNotesValue(f)||'-')}</td>
      <td>${esc(f['Remarks']||'-')}</td>
    </tr>`;
  }).join('');
}
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
    ${dealerSelectHtml('repair')}
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
    submitSuccessPopup('Repair Case', d.caseNo || d.repairCase || d.orderNo || d.id || '');
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
  $('repairStatus').innerHTML=`<div class="panel"><h2>Repair Status <button class="btn-light" onclick="refreshRepairs()">Refresh</button></h2><div class="table-wrap"><table><thead><tr><th>Repair Case No</th><th>Dealer / Company</th><th>Model No</th><th>Serial No</th><th>Date</th><th>Status</th><th>Log Link</th><th>Issue Media / Required Details</th><th>Remarks</th><th>Notes</th><th>Case Close Comment</th></tr></thead><tbody>${(Array.isArray(S.repairs)?S.repairs:[]).map(r=>{let f=r.fields||{};return `<tr><td>${internalRepairCaseLink(r)}</td><td>${esc(f['Company Name']||f['Dealer Name']||'')}</td><td>${esc(f['Model No']||'')}</td><td>${esc(f['Serial No']||'')}</td><td>${new Date(Number(f['Date of Purchase / Activation date']||f['Date Of Activation']||'')).toLocaleDateString('en-GB')}</td><td>${statusCell(r,'repair')}</td><td>${linkCell(f['Log File']||f['Log for Drone and RC'])}</td><td>${linkCell(f['Upload all the required details']||f['Issue Video and Pictures'])}</td><td>${esc(f['Remarks']||'')}</td><td>${esc(f['Notes']||'')}</td><td>${esc(f['Case Close Comment']||'')}</td></tr>`}).join('')}</tbody></table></div></div>`;
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
async function loadOrders(){S.orders=await api('/api/my-orders?country='+encodeURIComponent(selectedCountry())+'&role='+encodeURIComponent(S.user.role||'')+'&email='+encodeURIComponent(userEmail())+'&companyName='+encodeURIComponent(companyName()))}
async function loadRepairs(){S.repairs=await api('/api/my-repairs?country='+encodeURIComponent(selectedCountry())+'&role='+encodeURIComponent(S.user.role||'')+'&email='+encodeURIComponent(userEmail())+'&companyName='+encodeURIComponent(companyName())+'&contactName='+encodeURIComponent(contactName()))}
async function initApp(){
  if(!requireLogin())return;
  layout();
  renderDashboard();

  // Do not load full spare list during initial login; it is large and slows the portal.
  S.spares = Array.isArray(S.spares) ? S.spares : [];

  try{await loadOrders()}catch{}
  try{await loadRepairs()}catch{}
  try{S.dealers=await api('/api/dealers')}catch{}
  try{S.notes=await api('/api/portal-notes')}catch{}

  renderSpare();
  renderRepairCreate();
  renderRepairStatus();
  renderDealers();
  renderNotes();
  renderChangePassword();
  renderAdmin();
  renderFlycartCredit();
  renderAdminCenter();
}

