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
  const value = f['Invoice Download'] || f['Invoice Link'] || f['Invoice URL'];
  const secure = Array.isArray(value) && value.length ? secureLarkAttachmentUrl(value[0],'Invoice Download',row) : '';
  const url = secure || linkUrlValue(value);
  const current = url ? `<a class="btn-light" target="_blank" rel="noopener" href="${esc(url)}">Download Invoice</a>` : '-';
  const orderNo = orderNoValue(f);
  const upload = (canManageOrders && canManageOrders())
    ? `<br><label class="mini-upload">Upload Invoice<input type="file" onchange="uploadInvoiceFile('${esc(row.record_id)}','${esc(row._table_id||'')}','${esc(getSpareOrderNoFromRow(row))}',this)"></label>`
    : '';
  return current + upload;
}
function paymentReceiptCell(row){
  const f = (row && row.fields) || {};
  const value = f['Payment Receipt'] || f['Payment Receipt Link'] || f['Payment Receipt URL'];
  const secure = Array.isArray(value) && value.length ? secureLarkAttachmentUrl(value[0],'Payment Receipt',row) : '';
  const url = secure || linkUrlValue(value);
  const current = url ? `<a class="btn-light" target="_blank" rel="noopener" href="${esc(url)}">View Receipt</a>` : '-';
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
function uniqueOptions(list){
  return [...new Set((Array.isArray(list)?list:[]).map(x=>String(x||'').trim()).filter(Boolean))];
}
function larkOptions(section, fieldName){
  return uniqueOptions(S.dropdownOptions?.[section]?.[fieldName] || []);
}
function selectOptions(list, current, includeBlank=true){
  const cur=String(current||'');
  const opts=uniqueOptions(list);
  if(cur && !opts.includes(cur)) opts.unshift(cur);
  if(includeBlank) opts.unshift('');
  return uniqueOptions(opts).map(x=>`<option value="${esc(x)}" ${cur===x?'selected':''}>${esc(x||'Select')}</option>`).join('');
}
function statusOptions(type, current){
  return selectOptions(larkOptions(type==='repair'?'repair':'order','Status'), current, false);
}
async function loadDropdownOptions(){
  try{
    const d=await api('/api/lark-dropdown-options?country='+encodeURIComponent(selectedCountry()));
    S.dropdownOptions={order:d.order||{},repair:d.repair||{}};
  }catch(e){
    console.error('Unable to load Lark dropdown options',e);
    S.dropdownOptions={order:{},repair:{}};
  }
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


let S={dealerRepairCases:[],drcParts:[],drcEditingId:'',drcSubmitting:false,afterSalesRows:[],afterSalesFields:[],afterSalesTableId:'',afterSalesEditingId:'',afterSalesPage:1,portalNotesPage:1,user:loadUser(),spares:[],cart:[],orders:[],repairs:[],dealers:[],notes:[],dropdownOptions:{order:{},repair:{}},listUi:{orders:{page:1,pageSize:10,search:''},repairs:{page:1,pageSize:10,search:''}}};
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
  return uf('TRN NO','') || '';
}
function dealerPoBox(){
  return uf('P O Box','') || '';
}

function country(){return normalizeCountryValue(S.user?.country||S.user?.fields?.Country||'UAE & Other Region')}function uf(k,d=''){return S.user?.fields?.[k]??d}

function ensureAeronexLogoStyles(){
  if(document.getElementById('aeronexLogoStyles')) return;
  const s=document.createElement('style');
  s.id='aeronexLogoStyles';
  s.textContent=`
    .brand{display:flex;flex-direction:column;align-items:flex-start}.brand-sub{margin-top:2px;color:#fff;font-size:13px;font-weight:500}.brand-logo-img{height:44px;max-width:220px;object-fit:contain;display:block}
    .login-logo-img{width:260px;max-width:88%;height:auto;display:block;margin:0 auto 16px auto}
  `;
  document.head.appendChild(s);
}

function layout(){ensureAeronexLogoStyles();let n=S.user?.displayName||S.user?.username||'User';document.body.innerHTML=`<header class="topbar"><div class="brand"><img class="brand-logo-img" src="img/dji_aeronex_logo.png" alt="DJI AERONEX" onerror="this.style.display='none';this.insertAdjacentHTML('afterend','<div class=&quot;brand-title&quot;>AERO NEX</div><div class=&quot;brand-sub&quot;>RMA & Spare Order Portal</div>')"></div><nav class="nav">
<a class="active" data-sec="dashboard" href="#" onclick="show('dashboard')">⌂ Dashboard</a><a data-sec="spare" href="#" onclick="show('spare')">🛒 Spare Order</a><a data-sec="repairCreate" href="#" onclick="show('repairCreate')">📝 Create Repair Case</a><a data-sec="repairStatus" href="#" onclick="show('repairStatus')">📋 Repair Status</a>${dealerRepairCasesSectionVisible()?`<a data-sec="dealerRepairCase" href="#" onclick="show('dealerRepairCase')">🧰 Dealer Repair Case</a>`:''}<a data-sec="dealers" href="#" onclick="show('dealers')">🏢 Dealer Details</a><a data-sec="portalNotes" href="#" onclick="show('portalNotes')">📄 Portal Notes</a>${adminCenterEnabled()?`<a data-sec="adminCenter" href="#" onclick="show('adminCenter')">🧰 Admin Center</a>`:''}</nav><div class="user" onclick="this.classList.toggle('open')"><div class="avatar">${esc(initials())}</div><div><b>${esc(n)}</b><br><small>${esc(S.user.role||'End user')}</small></div><span>⌄</span><div class="menu"><a href="#" onclick="event.stopPropagation();show('changePassword')">🔒 Change Password</a><a href="#" onclick="event.stopPropagation();logout()">↪ Logout</a></div></div></header><main class="page">${['dashboard','spare','repairCreate','repairStatus','dealerRepairCase','warrantySoftwareStatus','logsDiagnostics','flycartCredit','dealers','adminCenter','reportBackup','spareStockUpdate','internalRepair','afterSalesSupport','spareOrderDetailsAdmin','portalNotes','changePassword','admin'].map(x=>`<section id="${x}" class="section"></section>`).join('')}</main><footer class="footer">© 2025 AERO NEX FZCO. This portal and its contents are proprietary and confidential.<br>Developed by Jocy John | For support, contact: support@aeronex.ae</footer>`}

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
  if(sec==='warrantySoftwareStatus'){try{renderWarrantySoftwareStatus()}catch(e){console.error('renderWarrantySoftwareStatus failed',e)}}if(sec==='flycartCredit'){loadFlycartCredit().then(renderFlycartCredit).catch(e=>{console.error('flycartCredit failed',e);try{renderFlycartCredit()}catch(err){}})}if(sec==='logsDiagnostics'){try{renderLogsDiagnostics()}catch(e){console.error('renderLogsDiagnostics failed',e)}}if(sec==='adminCenter'){try{renderAdminCenter()}catch(e){console.error('renderAdminCenter failed',e)}}if(sec==='reportBackup'){try{renderReportBackup()}catch(e){console.error('renderReportBackup failed',e)}}if(sec==='spareStockUpdate'){try{renderSpareStockUpdate()}catch(e){console.error('renderSpareStockUpdate failed',e)}}if(sec==='internalRepair'){loadInternalRepairMeta().then(renderInternalRepair).catch(e=>{console.error('internalRepair failed',e);try{renderInternalRepairError(e)}catch(_){}})}if(sec==='afterSalesSupport'){loadAfterSalesSupport().then(renderAfterSalesSupport).catch(e=>{console.error('afterSalesSupport failed',e);try{renderAfterSalesSupportError(e)}catch(_){}})}if(sec==='spareOrderDetailsAdmin'){loadSpareOrderDetailsMeta().then(renderSpareOrderDetailsAdmin).catch(e=>{console.error('spareOrderDetails failed',e);try{renderSpareOrderDetailsError(e)}catch(_){}})}scrollTo(0,0)
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
    ['USER_TABLE_ID','User & Company Details'],
    ['SPARE_LIST_TABLE_ID','Spare Part List'],
    ['ORDER_UAE_TABLE_ID','Spare Order UAE'],
    ['ORDER_KSA_TABLE_ID','Spare Order KSA'],
    ['REPAIR_UAE_TABLE_ID','Repair Case UAE'],
    ['REPAIR_KSA_TABLE_ID','Repair Case KSA'],
    ['INTERNAL_REPAIR_UAE_TABLE_ID','Internal Repair Register - UAE & Other Region'],
    ['INTERNAL_REPAIR_KSA_TABLE_ID','Internal Repair Register - KSA'],
    ['SPARE_ORDER_DETAILS_TABLE_ID','Internal Spare Order details'],
    ['CONTRACT_DOCUMENT_INTERNAL_TABLE_ID','Contract & Document - Internal'],
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
    const table=($('diagTableSelect')?.value||'');
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
  const d=larkTimestampToDate(v);
  if(d) return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
  const s=String(v||'').trim();
  const m=s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if(m){
    const d2=new Date(Number(m[1]),Number(m[2])-1,Number(m[3]));
    if(!isNaN(d2.getTime())) return d2.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
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
async function openInternalRepairFromRepair(recordId){
  const row=(S.repairs||[]).find(r=>r.record_id===recordId) || {};
  const f=row.fields||{};
  const repairCaseNo=internalRepairCaseNo(f);

  // Always bind the Repair Status case to an existing Internal Repair record
  // when one already exists. This prevents Save from creating a duplicate row.
  try{
    await loadInternalRepairMeta();
  }catch(e){
    console.warn('Unable to preload Internal Repair records',e);
  }
  const existing=(S.internalRepairRows||[]).find(r=>{
    const rf=r.fields||{};
    return repairCaseNo && String(rf['Repair Case']||'').trim().toLowerCase()===String(repairCaseNo).trim().toLowerCase();
  });
  if(existing){
    S.internalRepairEdit=existing;
    S.internalRepairPrefill=null;
  }else{
    S.internalRepairEdit=null;
    S.internalRepairPrefill={
      'Repair Case': repairCaseNo,
      'Company Name': f['Company Name']||f['Dealer Name']||'',
      'Product Model': f['Model No']||'',
      'Serial No': f['Serial No']||'',
      'Warranty Status': f['Warranty Status']||'',
      'Warranry Status': f['Warranty Status']||'',
      'Remark': f['Details Of Issue']||f['Issue Description']||f['Remarks']||'',
      'Remarks': f['Details Of Issue']||f['Issue Description']||f['Remarks']||''
    };
  }
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
  const ui=ensureListUi('internalRepair');
  const q=String(ui.search||'').trim().toLowerCase();
  const filtered=rows.map((r,index)=>({r,index})).filter(({r})=>{
    const f=r.fields||{};
    const caseText=String(f['DJI Case ID']||f['DJI Internal Case ID']||f['Repair Case']||'').toLowerCase();
    const company=String(f['Company Name']||'').toLowerCase();
    return !q || caseText.includes(q) || company.includes(q);
  }).sort((a,b)=>listDateMillis(b.r,'internalRepair')-listDateMillis(a.r,'internalRepair'));
  const total=filtered.length;
  const pageSize=Number(ui.pageSize)||10;
  const pages=Math.max(1,Math.ceil(total/pageSize));
  ui.page=Math.min(Math.max(1,Number(ui.page)||1),pages);
  const start=(ui.page-1)*pageSize;
  const pageRows=filtered.slice(start,start+pageSize);
  sec.innerHTML=`<div class="panel"><h2>Internal Repair</h2>
    <div class="notice">${S.returnToRepairStatus ? '<button class="btn-light" onclick="backToRepairStatus()">← Back to Repair Status</button>' : ''}
    ${internalRepairCountryControl(country)}
    <button class="btn-light" onclick="loadInternalRepairMeta().then(renderInternalRepair)">Refresh</button>
    <button class="act" onclick="newInternalRepair()">New Internal Repair</button></div>
    <div id="internalRepairForm"></div>
    <h3>Internal Repair Register</h3>
    <div class="row" style="align-items:end;gap:12px;flex-wrap:wrap"><div style="min-width:260px;flex:1"><label>Search by Case No or Company</label><input value="${esc(ui.search||'')}" oninput="setListSearch('internalRepair',this.value)" placeholder="Search case or company..."></div><div style="width:150px"><label>Records per page</label><select onchange="setListPageSize('internalRepair',this.value)">${[10,20,30,40,50,100].map(n=>`<option value="${n}" ${pageSize===n?'selected':''}>${n}</option>`).join('')}</select></div></div>
    <div class="muted" style="margin:10px 0">${total?`Showing ${start+1}–${Math.min(start+pageSize,total)} of ${total} Internal Repair Cases`:'Showing 0 of 0 Internal Repair Cases'}</div>
    <div class="table-wrap"><table><thead><tr><th>DJI Case ID</th><th>Repair Case</th><th>Case created</th><th>Company</th><th>Model</th><th>Serial</th><th>Case Type</th><th>Status</th><th>Action</th></tr></thead><tbody>
    ${pageRows.map(({r,index})=>{const f=r.fields||{};return `<tr><td>${esc(f['DJI Case ID']||'')}</td><td>${esc(f['Repair Case']||'')}</td><td>${esc(formatDisplayDate(f['Case created'])||'-')}</td><td>${esc(f['Company Name']||'')}</td><td>${esc(f['Product Model']||'')}</td><td>${esc(f['Serial No']||'')}</td><td>${esc(f['Case Type']||'')}</td><td>${esc(f['Case Status']||'')}</td><td><button class="btn-light" onclick="editInternalRepair(${index})">Open</button></td></tr>`}).join('')||'<tr><td colspan="9" class="muted">No internal repair cases found.</td></tr>'}
    </tbody></table></div><div class="row" style="justify-content:center;align-items:center;margin-top:12px">${listPaginationHtml('internalRepair',total,ui.page,pageSize)}</div></div>`;
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
      <input id="irMaterialConsumed" type="hidden" value="${esc(f[n.material]||'')}">
      <div><label>DJI Invoice</label><input id="irDjiInvoice" value="${esc(f['DJI Invoice']||'')}"></div>
      <div><label>Total Amount</label><input id="irTotalAmount" type="number" step="0.01" value="${esc(f['Total Amount']??'')}"></div>
      <div><label>DJI Repair Status</label>${fieldMetaByName(meta)[n.djiStatus]?.optionCount?selectHtml(meta,'irDjiStatus',n.djiStatus,f[n.djiStatus]||''):`<input id="irDjiStatus" value="${esc(f[n.djiStatus]||'')}">`}</div>
      <div><label>Case Status</label>${selectHtml(meta,'irCaseStatus','Case Status',f['Case Status']||'')}</div>
    </div>
    <label>Remarks</label><textarea id="irRemark">${esc(f[n.remark]||'')}</textarea>
    <div class="notice"><b>Add spare used:</b> select from Spare Part List. It saves to Material Consumed / Unit Consumed in the same case row.</div>
    <div class="row"><input id="irSpareSearch" placeholder="Search Material Code or Name" oninput="renderInternalRepairSpareOptions()"><input id="irSpareQty" class="qty" type="number" min="1" value="1"><button class="btn-light" onclick="addInternalRepairSpare()">Add Spare</button></div>
    <select id="irSpareSelect"></select>
    <div id="irSparePreview" class="notice"></div>
    <div class="panel">
      <h3>Shipping Document</h3>
      <div class="notice"><b>Current shipping document:</b> ${detailsFieldValue(f['Shipping Document'],'Shipping Document',S.internalRepairEdit||null)}</div>
      <div class="row"><input id="irShippingDocumentFile" type="file" multiple><button class="btn-light" onclick="uploadInternalRepairShippingDocument()">Upload Shipping Document(s)</button></div>
      <div id="irShippingDocumentMsg" class="msg"></div>
    </div>
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
async function saveInternalRepair(opts){
  opts = opts || {};
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
      'Total Amount':val('irTotalAmount'),
      [n.djiStatus]:selectedOptionsValue('irDjiStatus')||val('irDjiStatus'),
      'Case Status':selectedOptionsValue('irCaseStatus'),
      [n.remark]:val('irRemark')
    };
    const editingId=S.internalRepairEdit?.record_id||'';
    const res=await api('/api/save-internal-repair',{method:'POST',body:JSON.stringify({role:S.user.role||'',country:meta.country||adminModuleCountry(),userCountry:userCountryText()||'',record_id:editingId,fields})});
    if(!opts.silent) msg('internalRepairMsg','Saved successfully');
    const createdId=res?.record_id||res?.record?.record_id||res?.record?.record?.record_id||'';
    const savedId=editingId||createdId;
    await loadInternalRepairMeta();
    if(savedId){
      const savedRow=(S.internalRepairRows||[]).find(x=>x.record_id===savedId);
      S.internalRepairEdit=savedRow||{record_id:savedId,fields};
    }
    if(opts.keepForm) return {record_id:savedId};
    if(document.getElementById('detailsModalOverlay') && editingId){
      const idx=(S.internalRepairRows||[]).findIndex(x=>x.record_id===editingId);
      if(idx>=0) editInternalRepair(idx);
    }else{
      S.internalRepairEdit=null;S.internalRepairPrefill=null;
      renderInternalRepair();
    }
  }catch(e){if(!opts.silent) msg('internalRepairMsg',e.message||'Save failed'); else throw e; return null}
}

async function uploadInternalRepairShippingDocument(){
  if(!currentUserIsAdminTech()) return alert('Admin/Technician only');
  const inp=scopedEl('irShippingDocumentFile');
  const files=inp&&inp.files ? Array.from(inp.files) : [];
  const box=scopedEl('irShippingDocumentMsg');
  const setUploadMsg=(text,cls)=>{if(box){box.className='msg '+(cls||'');box.textContent=text;}};
  if(!files.length) return setUploadMsg('Upload Failed: select shipping document file','upload-fail');
  const recordId=S.internalRepairEdit?.record_id||'';
  if(!recordId){
    return setUploadMsg('Upload Failed: save the Internal Repair record before uploading the Shipping Document','upload-fail');
  }
  try{
    setUploadMsg('Uploading... Please wait','upload-wait');
    const uploaded=[];
    for(const file of files){
      const data=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>resolve(null);reader.readAsDataURL(file);});
      uploaded.push({name:file.name,type:file.type||'application/octet-stream',data});
    }
    const meta=S.internalRepairMeta||{};
    await api('/api/upload-internal-shipping-document',{method:'POST',body:JSON.stringify({
      role:S.user.role||'',module:'internalRepair',country:meta.country||adminModuleCountry(),userCountry:userCountryText()||'',record_id:recordId,files:uploaded
    })});
    setUploadMsg(`Upload Success: ${files.length} shipping document(s) uploaded to Lark`,'upload-ok');
    await loadInternalRepairMeta();
    const idx=(S.internalRepairRows||[]).findIndex(x=>x.record_id===recordId);
    if(idx>=0) setTimeout(()=>editInternalRepair(idx),700);
  }catch(e){setUploadMsg('Upload Failed: '+(e.message||'Unknown error'),'upload-fail');}
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
  const ui=ensureListUi('internalSpare');
  const q=String(ui.search||'').trim().toLowerCase();
  const filtered=rows.map((r,index)=>({r,index})).filter(({r})=>{
    const f=r.fields||{};
    const caseText=String(f['DJI Case ID']||f['Case ID Remarks']||'').toLowerCase();
    const company=String(f['Company Name']||'').toLowerCase();
    return !q || caseText.includes(q) || company.includes(q);
  }).sort((a,b)=>listDateMillis(b.r,'internalSpare')-listDateMillis(a.r,'internalSpare'));
  const total=filtered.length;
  const pageSize=Number(ui.pageSize)||10;
  const pages=Math.max(1,Math.ceil(total/pageSize));
  ui.page=Math.min(Math.max(1,Number(ui.page)||1),pages);
  const start=(ui.page-1)*pageSize;
  const pageRows=filtered.slice(start,start+pageSize);
  sec.innerHTML=`<div class="panel"><h2>Internal Spare Order details</h2><div class="notice">Admin-only table for DJI/internal spare order, shipment and document records. <button class="btn-light" onclick="loadSpareOrderDetailsMeta().then(renderSpareOrderDetailsAdmin)">Refresh</button> <button class="act" onclick="newSpareOrderDetails()">New Internal Spare Order</button></div><div id="spareOrderDetailsForm"></div>
  <div class="row" style="align-items:end;gap:12px;flex-wrap:wrap"><div style="min-width:260px;flex:1"><label>Search by DJI Case ID or Company</label><input value="${esc(ui.search||'')}" oninput="setListSearch('internalSpare',this.value)" placeholder="Search case or company..."></div><div style="width:150px"><label>Records per page</label><select onchange="setListPageSize('internalSpare',this.value)">${[10,20,30,40,50,100].map(n=>`<option value="${n}" ${pageSize===n?'selected':''}>${n}</option>`).join('')}</select></div></div>
  <div class="muted" style="margin:10px 0">${total?`Showing ${start+1}–${Math.min(start+pageSize,total)} of ${total} Internal Spare Orders`:'Showing 0 of 0 Internal Spare Orders'}</div>
  <div class="table-wrap"><table><thead><tr><th>DJI Case ID</th><th>Company</th><th>Case Type</th><th>Billing</th><th>Order Type</th><th>DJI Cost</th><th>Case created</th><th>Closed</th><th>Document</th><th>Action</th></tr></thead><tbody>
  ${pageRows.map(({r,index})=>{const f=r.fields||{};return `<tr><td>${esc(f['DJI Case ID']||'')}</td><td>${esc(f['Company Name']||'')}</td><td>${esc(f['Case Type']||'')}</td><td>${esc(f['Billing Company']||'')}</td><td>${esc(Array.isArray(f['Order Type'])?f['Order Type'].join(', '):(f['Order Type']||''))}</td><td>${esc(f['DJI Cost']||'')}</td><td>${esc(formatDisplayDate(f['Case created'])||'-')}</td><td>${esc(dateInputValue(f['Case Close Date']))}</td><td>${detailsFieldValue(f['Document Upload'],'Document Upload',r)}</td><td><button class="btn-light" onclick="editSpareOrderDetails(${index})">Open</button></td></tr>`}).join('')||'<tr><td colspan="10" class="muted">No internal spare orders found.</td></tr>'}</tbody></table></div><div class="row" style="justify-content:center;align-items:center;margin-top:12px">${listPaginationHtml('internalSpare',total,ui.page,pageSize)}</div></div>`;
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
  const html = spareOrderDetailsFormHtml(f,r) + `<h3 class="details-section-title">All Lark Fields</h3>${renderAllLarkFieldsTable(f,r)}`;
  showDetailsModal(`Internal Spare Order details - ${(f['DJI Case ID']||f['Company Name']||'Open')}`, html);
}
function spareOrderDetailsFormHtml(f,row){
  const meta=S.spareOrderDetailsMeta||{};
  return `<div class="subpanel"><h3>${S.spareOrderDetailsEdit?'Edit':'New'} Internal Spare Order details</h3><div class="grid3">
    <div><label>DJI Case ID</label><input id="sodDjiCaseId" value="${esc(f['DJI Case ID']||'')}"></div>
    <div><label>Case ID Remarks</label><input id="sodCaseIdRemarks" value="${esc(f['Case ID Remarks']||'')}"></div>
    <div><label>Case Type</label>${selectHtml(meta,'sodCaseType','Case Type',f['Case Type']||'')}</div>
    ${companyInputHtml('sodCompanyName','Company Name',f['Company Name']||'')}
    <div><label>Type of Case</label><input id="sodTypeOfCase" value="${esc(f['Type of Case']||'')}"></div>
    <div><label>Billing Company</label>${selectHtml(meta,'sodBillingCompany','Billing Company',f['Billing Company']||'')}</div>
    <div><label>Order Type</label>${selectHtml(meta,'sodOrderType','Order Type',Array.isArray(f['Order Type'])?f['Order Type'].join(','):(f['Order Type']||''))}</div>
    <div><label>DJI Cost</label><input id="sodDjiCost" value="${esc(f['DJI Cost']||'')}"></div>
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
    <div class="notice"><b>Current document:</b> ${detailsFieldValue(f['Document Upload'],'Document Upload',row)}</div>
    <div class="row"><input id="sodDocumentUploadFile" type="file" multiple><button class="btn-light" onclick="uploadSpareOrderDetailsDocument()">Upload Document(s)</button></div>
    <div id="sodDocumentMsg" class="msg"></div>
  </div>
  <div class="panel">
    <h3>Shipping Document</h3>
    <div class="notice"><b>Current shipping document:</b> ${detailsFieldValue(f['Shipping Document'],'Shipping Document',row)}</div>
    <div class="row"><input id="sodShippingDocumentFile" type="file" multiple><button class="btn-light" onclick="uploadSpareOrderDetailsShippingDocument()">Upload Shipping Document(s)</button></div>
    <div id="sodShippingDocumentMsg" class="msg"></div>
  </div>
  <p><button class="act" onclick="saveSpareOrderDetails()">Save Internal Spare Order</button> <span id="spareOrderDetailsMsg" class="msg"></span></p></div>`;
}
function renderSpareOrderDetailsForm(f){
  const box=$('spareOrderDetailsForm'); if(!box)return;
  box.innerHTML=spareOrderDetailsFormHtml(f||{},S.spareOrderDetailsEdit||null);
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
  let recordId = r && r.record_id ? r.record_id : '';
  if(!files.length) return setUploadMsg('Upload Failed: select document file','upload-fail');
  if(!recordId){
    setUploadMsg('Saving record before upload...','upload-wait');
    const saved = await saveSpareOrderDetails({silent:true, keepForm:true});
    recordId = saved && saved.record_id ? saved.record_id : '';
    if(!recordId) return setUploadMsg('Upload Failed: unable to create Internal Spare Order record first','upload-fail');
  }
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
      record_id:recordId,
      files:uploaded
    })});
    setUploadMsg(`Upload Success: ${files.length} document(s) uploaded to Lark`,'upload-ok');
    await loadSpareOrderDetailsMeta();
    const idx=(S.spareOrderDetailsRows||[]).findIndex(x=>x.record_id===recordId);
    if(idx>=0){
      setTimeout(()=>editSpareOrderDetails(idx),700);
    }else{
      renderSpareOrderDetailsAdmin();
    }
  }catch(e){
    setUploadMsg('Upload Failed: '+(e.message||'Unknown error'),'upload-fail');
  }
}


async function uploadSpareOrderDetailsShippingDocument(){
  if(!isAdmin()) return alert('Admin only');
  const inp=scopedEl('sodShippingDocumentFile');
  const files=inp&&inp.files ? Array.from(inp.files) : [];
  const box=scopedEl('sodShippingDocumentMsg');
  const setUploadMsg=(text,cls)=>{if(box){box.className='msg '+(cls||'');box.textContent=text;}};
  const recordId=S.spareOrderDetailsEdit?.record_id||'';
  if(!files.length) return setUploadMsg('Upload Failed: select shipping document file','upload-fail');
  if(!recordId){
    return setUploadMsg('Upload Failed: save the Internal Spare Order record before uploading the Shipping Document','upload-fail');
  }
  try{
    setUploadMsg('Uploading... Please wait','upload-wait');
    const uploaded=[];
    for(const file of files){
      const data=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>resolve(null);reader.readAsDataURL(file);});
      uploaded.push({name:file.name,type:file.type||'application/octet-stream',data});
    }
    await api('/api/upload-internal-shipping-document',{method:'POST',body:JSON.stringify({role:S.user.role||'',module:'internalSpare',record_id:recordId,files:uploaded})});
    setUploadMsg(`Upload Success: ${files.length} shipping document(s) uploaded to Lark`,'upload-ok');
    await loadSpareOrderDetailsMeta();
    const idx=(S.spareOrderDetailsRows||[]).findIndex(x=>x.record_id===recordId);
    if(idx>=0) setTimeout(()=>editSpareOrderDetails(idx),700);
  }catch(e){setUploadMsg('Upload Failed: '+(e.message||'Unknown error'),'upload-fail');}
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

async function saveSpareOrderDetails(opts){
  opts = opts || {};
  if(!isAdmin()){ if(!opts.silent) msg('spareOrderDetailsMsg','Admin only'); return null; }
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
    if(!opts.silent) msg('spareOrderDetailsMsg',res&&res.partial?'Saved partially. Some fields were skipped.':'Saved successfully');
    await loadSpareOrderDetailsMeta();
    if(res && res.record && (res.record.record_id || res.record.id)){
      S.spareOrderDetailsEdit = { record_id: res.record.record_id || res.record.id, fields };
    }
    if(opts.keepForm){
      return { record_id: S.spareOrderDetailsEdit?.record_id || editingId };
    }
    if(document.getElementById('detailsModalOverlay') && editingId){
      const idx=(S.spareOrderDetailsRows||[]).findIndex(x=>x.record_id===editingId);
      if(idx>=0) setTimeout(()=>editSpareOrderDetails(idx),500);
    }else{
      S.spareOrderDetailsEdit=null;
      renderSpareOrderDetailsAdmin();
    }
    return { record_id: S.spareOrderDetailsEdit?.record_id || editingId };
  }catch(e){ if(!opts.silent) msg('spareOrderDetailsMsg','Save Failed: '+(e.message||'Unknown error')); else throw e; return null; }
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
    'DJI Case No',
    'Dealer Credit Note Upload'
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
      ${fields.filter(k=>k!=='Dealer Credit Note Upload').map(k=>`<div><label>${esc(k)}</label><input id="${flycartInputId(k)}" value="${esc(flycartValue(f[k]))}"></div>`).join('')}
      <div><label>Dealer Credit Note Upload</label><input id="flycartCreditNoteFile" type="file"></div>
      <div><label>Current Credit Note</label><div>${spareOrderDisplayCell(f['Dealer Credit Note Upload'],row,'Dealer Credit Note Upload')}</div></div>
    </div>
    <div class="row">
      <button onclick="saveFlycartCredit()">Save to Lark</button>
      ${row?.record_id ? '<button class="btn-light" onclick="uploadFlycartCreditNote()">Upload Credit Note</button>' : ''}
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
    for(const k of flycartFields().filter(x=>x!=='Dealer Credit Note Upload')){
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


async function uploadFlycartCreditNote(){
  try{
    const record_id = $('flycartRecordId')?.value || '';
    const file = $('flycartCreditNoteFile')?.files?.[0];
    if(!record_id) return msg('flycartMsg','Save the Flycart Credit record first, then upload the Credit Note.');
    if(!file) return msg('flycartMsg','Select a Credit Note file.');
    const data = await fileToDataUrl(file);
    await api('/api/flycart-credit-use/upload-credit-note',{
      method:'POST',
      body:JSON.stringify({role:S.user.role||'',record_id,file:{name:file.name,type:file.type||'application/octet-stream',data}})
    });
    msg('flycartMsg','Dealer Credit Note uploaded.');
    await loadFlycartCredit();
    const rowIndex=(S.flycartCreditRows||[]).findIndex(r=>r.record_id===record_id);
    renderFlycartCredit();
    if(rowIndex>=0) editFlycartCredit(rowIndex);
  }catch(e){ msg('flycartMsg',e.message||String(e)); }
}


function adminCenterEnabled(){
  return isAdmin() || currentUserIsAdminTech();
}

function reportsEnabled(){
  const f=S.user?.fields||{};
  const v=String(f['Reports']||S.user?.Reports||S.user?.reports||'').trim().toLowerCase();
  return v==='yes'||v==='true'||v==='1';
}


const REPORT_BACKUP_REPORTS = [
  { key:'users', label:'User & Company Details', table:'User & Company Details' },
  { key:'spareParts', label:'Spare Part List', table:'Spare Part List' },
  { key:'spareUae', label:'Spare Orders - UAE & Other Region', table:'Spare Part Order Details - UAE & Other Region' },
  { key:'spareKsa', label:'Spare Orders - KSA', table:'Spare Part Order Details - KSA' },
  { key:'repairUae', label:'Repair Cases - UAE & Other Region', table:'Repair Case Details - UAE & Other Region' },
  { key:'repairKsa', label:'Repair Cases - KSA', table:'Repair Case Details - KSA' },
  { key:'internalRepairUae', label:'Internal Repair - UAE & Other Region', table:'Internal Repair Register - UAE & Other Region' },
  { key:'internalRepairKsa', label:'Internal Repair - KSA', table:'Internal Repair Register - KSA' },
  { key:'internalSpare', label:'Internal Spare Order Details', table:'Internal Spare Order details' },
  { key:'dealerRepair', label:'Dealer Repair Case', table:'Dealer Repair Case' },
  { key:'warranty', label:'Warranty Status', table:'Warranty Status' },
  { key:'software', label:'Software Status', table:'Software Status' },
  { key:'flycart', label:'Flycart Credit Use', table:'Flycart Credit Use' },
  { key:'portalNotes', label:'Portal Notes', table:'Portal Note' },
  { key:'contracts', label:'Contract & Document - Internal', table:'Contract & Document - Internal' }
];

function reportBackupReportOptions(){
  return `<option value="">Select a report</option>` + REPORT_BACKUP_REPORTS.map(r=>`<option value="${esc(r.key)}">${esc(r.label)}</option>`).join('');
}

function selectedReportBackupReport(){
  const key = $('reportBackupReportSelect')?.value || '';
  return REPORT_BACKUP_REPORTS.find(r=>r.key===key) || null;
}

function reportBackupQuery(){
  const r = selectedReportBackupReport();
  const qs = new URLSearchParams({
    report: r?.key || '',
    role: S.user?.role || '',
    dateFrom: $('reportBackupDateFrom')?.value || '',
    dateTo: $('reportBackupDateTo')?.value || '',
    company: $('reportBackupCompany')?.value || '',
    status: $('reportBackupStatus')?.value || '',
    caseId: $('reportBackupCaseId')?.value || ''
  });
  return qs;
}

async function previewReportBackupReport(){
  const r = selectedReportBackupReport();
  if(!r){ msg('reportBackupReportMsg','Choose a report first.'); return; }
  try{
    const data = await api('/api/report-backup/preview?' + reportBackupQuery().toString());
    msg('reportBackupReportMsg', `${data.count || 0} matching records found for ${data.label || r.label}.`, true);
  }catch(e){msg('reportBackupReportMsg', e.message)}
}

function downloadReportBackupExcel(){
  const r = selectedReportBackupReport();
  if(!r){ msg('reportBackupReportMsg','Choose a report first.'); return; }
  window.open('/api/report-backup/download?' + reportBackupQuery().toString(), '_blank', 'noopener');
  msg('reportBackupReportMsg','Excel download started.', true);
}

function reportBackupSettingsPayload(){
  return {
    protocol: $('backupNasProtocol')?.value || 'sftp',
    host: $('backupNasHost')?.value || '',
    port: $('backupNasPort')?.value || '',
    username: $('backupNasUser')?.value || '',
    secret: $('backupNasSecret')?.value || '',
    remoteFolder: $('backupNasFolder')?.value || ''
  };
}

async function saveReportBackupSettings(){
  try{const d=await api('/api/report-backup/settings?role='+encodeURIComponent(S.user?.role||''),{method:'POST',body:JSON.stringify(reportBackupSettingsPayload())});msg('backupMsg','Backup settings saved.',true)}catch(e){msg('backupMsg',e.message)}
}
async function testReportBackupNas(){
  try{const d=await api('/api/report-backup/test-nas?role='+encodeURIComponent(S.user?.role||''),{method:'POST',body:JSON.stringify(reportBackupSettingsPayload())});msg('backupMsg',(d.status||'Test completed')+(d.note?' - '+d.note:''),!!d.ok)}catch(e){msg('backupMsg',e.message)}
}
async function runReportBackupNow(){
  try{const d=await api('/api/report-backup/backup-now?role='+encodeURIComponent(S.user?.role||''),{method:'POST',body:JSON.stringify({})});msg('backupMsg',(d.status||'Backup requested')+(d.error?' - '+d.error:''),!!d.ok)}catch(e){msg('backupMsg',e.message)}
}

function renderReportBackup(){
  const sec=$('reportBackup');
  if(!sec) return;
  if(!reportsEnabled()){
    sec.innerHTML=`<div class="panel"><h2>Report & Backup</h2><div class="notice">You do not have permission to access Report & Backup.</div></div>`;
    return;
  }
  sec.innerHTML=`<div class="panel"><h2>Report & Backup</h2>
    <div class="notice">Reports export directly from Lark tables. Backup is planned every day at 04:00 AM with retention for the latest 3 successful backups.</div>

    <div class="panel" style="box-shadow:none;margin:16px 0 18px 0;padding:20px;border:1px solid #dbe3ef">
      <div style="display:flex;align-items:flex-start;gap:16px;margin-bottom:18px">
        <div style="font-size:32px;background:#eafff3;border-radius:14px;padding:12px;line-height:1">📊</div>
        <div style="flex:1">
          <h2 style="margin:0 0 6px 0">Reports</h2>
          <div class="muted">Generate and download module reports in Excel format.</div>
        </div>
      </div>
      <div class="grid4">
        <div><label>Select Report</label><select id="reportBackupReportSelect">${reportBackupReportOptions()}</select></div>
        <div><label>Date From</label><input id="reportBackupDateFrom" type="date"></div>
        <div><label>Date To</label><input id="reportBackupDateTo" type="date"></div>
        <div><label>Status</label><input id="reportBackupStatus" placeholder="All Status"></div>
        <div><label>Company</label><input id="reportBackupCompany" placeholder="All Companies"></div>
        <div><label>Case ID / DJI Case ID</label><input id="reportBackupCaseId" placeholder="Optional"></div>
      </div>
      <p>
        <button onclick="downloadReportBackupExcel()">Download Excel</button>
        <button class="btn-light" onclick="previewReportBackupReport()">Preview Selection</button>
        <span id="reportBackupReportMsg" class="msg"></span>
      </p>
    </div>

    <div class="panel" style="box-shadow:none;margin:0;padding:20px;border:1px solid #dbe3ef">
      <div style="display:flex;align-items:flex-start;gap:16px;margin-bottom:18px">
        <div style="font-size:32px;background:#eaf1ff;border-radius:14px;padding:12px;line-height:1">💾</div>
        <div style="flex:1">
          <h2 style="margin:0 0 6px 0">Backup</h2>
          <div class="muted">Configure NAS backup destination and monitor backup status.</div>
        </div>
      </div>
      <div class="grid4">
        <div><label>Status</label><input value="Not configured" disabled></div>
        <div><label>Last Backup Time</label><input value="-" disabled></div>
        <div><label>Backup Duration</label><input value="-" disabled></div>
        <div><label>NAS Connection Status</label><input value="Not tested" disabled></div>
        <div><label>Total Records</label><input value="-" disabled></div>
        <div><label>Total Attachments</label><input value="-" disabled></div>
        <div><label>Backup Size</label><input value="-" disabled></div>
        <div><label>Retention</label><input value="Latest 3 successful backups" disabled></div>
      </div>
      <h3>Backup Settings</h3>
      <div class="grid3">
        <div><label>NAS Protocol</label><select id="backupNasProtocol"><option value="sftp">SFTP / SSH</option><option value="smb">SMB / CIFS</option><option value="nfs">NFS</option><option value="webdav">WebDAV / HTTPS</option></select></div>
        <div><label>NAS Host</label><input id="backupNasHost" placeholder="NAS IP or hostname"></div>
        <div><label>Port</label><input id="backupNasPort" value="22"></div>
        <div><label>Username</label><input id="backupNasUser" placeholder="backup_user"></div>
        <div><label>Password / SSH Key</label><input id="backupNasSecret" type="password" placeholder="Password or key reference"></div>
        <div><label>Remote Folder</label><input id="backupNasFolder" placeholder="/AERONEX_RMA_Backup"></div>
        <div><label>Schedule</label><input value="Daily at 04:00 AM" disabled></div>
        <div><label>Contents</label><input value="Tables, attachments, XLSX, CSV, JSON, manifest" disabled></div>
        <div><label>Verification</label><input value="Manifest + latest successful backup only" disabled></div>
      </div>
      <p>
        <button onclick="runReportBackupNow()">Backup Now</button>
        <button class="btn-light" onclick="testReportBackupNas()">Test NAS Connection</button>
        <button class="btn-light" onclick="saveReportBackupSettings()">Save Settings</button>
        <span id="backupMsg" class="msg"></span>
      </p>
      <h3>Last 3 Backup History</h3>
      <div class="table-wrap"><table><thead><tr><th>Date</th><th>Status</th><th>Records</th><th>Attachments</th><th>Size</th><th>Destination</th><th>Error</th></tr></thead><tbody><tr><td colspan="7" class="muted">No backup history yet.</td></tr></tbody></table></div>
      <h3>Backup Log Viewer</h3>
      <pre style="white-space:pre-wrap;background:#f6f8fb;border:1px solid #dbe3ef;border-radius:10px;padding:12px;max-height:220px;overflow:auto">No logs yet.</pre>
    </div>
  </div>`;
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
    cards.push(['🎧','After Sales Support Register','Create, update, and close after-sales support cases.','afterSalesSupport','Open']);
  }
  if(isAdmin()){
    cards.push(['📦','Internal Spare Order details','Admin-only spare order internal processing records.','spareOrderDetailsAdmin','Open']);
  }
  if(isAdmin()){
    cards.push(['📊','Spare Stock Update','Download, compare, and update UAE or KSA spare stock.','spareStockUpdate','Open']);
  }
  if(logsPageEnabled()){
    cards.push(['🧾','Logs & Diagnostics','Check error logs and Lark table diagnostics.','logsDiagnostics','Open']);
  }
  if(reportsEnabled()){
    cards.push(['💾','Report & Backup','Daily backup status, SFTP settings, retention, and backup history.','reportBackup','Open']);
  }
  return cards;
}


const SPARE_STOCK_UPDATE = { warehouse:'uae', current:[], preview:[], sourceFileName:'' };

function spareStockCode(v){ return String(v ?? '').trim().toUpperCase(); }
function spareStockHeader(v){ return String(v ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g,''); }
function spareStockNumber(v){
  if(v===null || v===undefined || String(v).trim()==='') return null;
  const n=Number(String(v).replace(/,/g,'').trim());
  return Number.isFinite(n) ? n : NaN;
}
function selectedSpareStockWarehouse(){
  return $('spareStockWarehouse')?.value === 'ksa' ? 'ksa' : 'uae';
}
function spareStockWarehouseLabel(w){ return w==='ksa' ? 'KSA' : 'UAE'; }
function spareStockColumnName(w){ return w==='ksa' ? 'KSA Stock' : 'DSO Local Stock'; }

function renderSpareStockUpdate(){
  const sec=$('spareStockUpdate');
  if(!sec) return;
  if(!isAdmin()){
    sec.innerHTML='<div class="panel"><h2>Spare Stock Update</h2><div class="notice">Admin access only.</div></div>';
    return;
  }
  sec.innerHTML=`<div class="panel"><h2>Spare Stock Update</h2>
    <div class="notice"><b>Rules:</b> Match only by Material Code. Blank stock cells do not change Lark. Zero and negative values are valid. Duplicate Material Codes are merged and their quantities are added. Unknown codes are not created. Descriptions and prices are never changed.</div>
    <div class="row">
      <div><label>Warehouse</label><select id="spareStockWarehouse" onchange="resetSpareStockAnalysis()"><option value="uae">UAE - DSO Local Stock</option><option value="ksa">KSA Stock</option></select></div>
      <div><label>Stock Excel (.xlsx)</label><input id="spareStockFile" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></div>
      <div class="act" style="align-self:end"><button onclick="analyzeSpareStockExcel()">Analyze Stock</button></div>
    </div>
    <div style="margin:12px 0"><button class="btn-light" onclick="downloadCurrentSpareStockList()">Download Current Stock List</button></div>
    <div id="spareStockMsg" class="msg"></div>
    <div id="spareStockSummary"></div>
    <div id="spareStockPreview"></div>
  </div>`;
}

function resetSpareStockAnalysis(){
  SPARE_STOCK_UPDATE.warehouse=selectedSpareStockWarehouse();
  SPARE_STOCK_UPDATE.preview=[];
  SPARE_STOCK_UPDATE.current=[];
  if($('spareStockSummary')) $('spareStockSummary').innerHTML='';
  if($('spareStockPreview')) $('spareStockPreview').innerHTML='';
  if($('spareStockMsg')) $('spareStockMsg').textContent='';
}

async function loadCurrentSpareStockRows(warehouse){
  const d=await api('/api/spare-stock-update/current?warehouse='+encodeURIComponent(warehouse)+'&role='+encodeURIComponent(S.user.role||''));
  SPARE_STOCK_UPDATE.current=Array.isArray(d.items)?d.items:[];
  return SPARE_STOCK_UPDATE.current;
}

async function downloadCurrentSpareStockList(){
  const msg=$('spareStockMsg');
  try{
    if(!window.XlsxPopulate) throw new Error('Excel library is not loaded.');
    const warehouse=selectedSpareStockWarehouse();
    const rows=await loadCurrentSpareStockRows(warehouse);
    const wb=await XlsxPopulate.fromBlankAsync();
    const sh=wb.sheet(0).name(spareStockWarehouseLabel(warehouse)+' Spare Stock');
    sh.cell('A1').value('Material Code');
    sh.cell('B1').value('Material Description');
    sh.cell('C1').value(spareStockColumnName(warehouse));
    rows.forEach((r,i)=>{
      const n=i+2;
      sh.cell(`A${n}`).value(r.materialCode||'');
      sh.cell(`B${n}`).value(r.materialName||'');
      sh.cell(`C${n}`).value(r.stock===null||r.stock===undefined?'':r.stock);
    });
    sh.row(1).style({bold:true});
    sh.column('A').width(26); sh.column('B').width(52); sh.column('C').width(20);
    const blob=await wb.outputAsync('blob');
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download=`AERONEX_${spareStockWarehouseLabel(warehouse)}_Spare_Stock_List_${new Date().toISOString().slice(0,10)}.xlsx`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href),1000);
    msg.textContent=`Downloaded ${rows.length} ${spareStockWarehouseLabel(warehouse)} stock records.`;
  }catch(e){ msg.textContent=e.message||String(e); }
}

async function analyzeSpareStockExcel(){
  const msg=$('spareStockMsg'), file=$('spareStockFile')?.files?.[0];
  try{
    if(!isAdmin()) throw new Error('Admin access only.');
    if(!file) throw new Error('Choose an .xlsx file first.');
    if(!window.XlsxPopulate) throw new Error('Excel library is not loaded.');
    const warehouse=selectedSpareStockWarehouse();
    SPARE_STOCK_UPDATE.warehouse=warehouse;
    SPARE_STOCK_UPDATE.sourceFileName=file.name;
    const wb=await XlsxPopulate.fromDataAsync(await file.arrayBuffer());
    const sh=wb.sheet(0), used=sh.usedRange();
    if(!used) throw new Error('The Excel sheet is empty.');
    const values=used.value();
    if(!Array.isArray(values)||values.length<2) throw new Error('The Excel sheet has no stock rows.');
    const headers=(values[0]||[]).map(spareStockHeader);
    const codeIx=headers.findIndex(h=>['materialcode','materialnumber','materialno','code'].includes(h));
    const wanted=warehouse==='ksa' ? ['ksastock','ksalocalstock','stock'] : ['dsolocalstock','uaelocalstock','localstock','stock'];
    const stockIx=headers.findIndex(h=>wanted.includes(h));
    if(codeIx<0) throw new Error('Material Code column was not found.');
    if(stockIx<0) throw new Error(`${spareStockColumnName(warehouse)} column was not found.`);

    const merged=new Map();
    let blankCodeRows=0, invalidRows=0;
    for(let i=1;i<values.length;i++){
      const row=values[i]||[], code=spareStockCode(row[codeIx]);
      if(!code){ blankCodeRows++; continue; }
      const raw=row[stockIx];
      if(raw===null||raw===undefined||String(raw).trim()==='') continue;
      const n=spareStockNumber(raw);
      if(Number.isNaN(n)){ invalidRows++; if(!merged.has(code)) merged.set(code,{materialCode:code,values:[],sourceRows:0,invalid:true}); merged.get(code).invalid=true; continue; }
      if(!merged.has(code)) merged.set(code,{materialCode:code,values:[],sourceRows:0,invalid:false});
      const x=merged.get(code); x.values.push(n); x.sourceRows++;
    }

    const current=await loadCurrentSpareStockRows(warehouse);
    const byCode=new Map(current.map(r=>[spareStockCode(r.materialCode),r]));
    SPARE_STOCK_UPDATE.preview=[...merged.values()].map(x=>{
      const cur=byCode.get(x.materialCode), uploaded=x.values.reduce((a,b)=>a+b,0);
      let status='No Change', error='';
      if(x.invalid){ status='Invalid Stock Value'; error='One or more values are not numeric'; }
      else if(!cur){ status='Material Not Found'; }
      else if(Number(cur.stock) !== uploaded){ status='Update'; }
      return {recordId:cur?.recordId||'',materialCode:x.materialCode,materialName:cur?.materialName||'',currentStock:cur?.stock??null,newStock:uploaded,sourceRows:x.sourceRows,status,error};
    });
    renderSpareStockPreview({blankCodeRows,invalidRows});
    msg.textContent='Analysis complete. Review the preview before confirming the update.';
  }catch(e){
    msg.textContent=e.message||String(e);
    if($('spareStockSummary')) $('spareStockSummary').innerHTML='';
    if($('spareStockPreview')) $('spareStockPreview').innerHTML='';
  }
}

function renderSpareStockPreview(extra={}){
  const rows=SPARE_STOCK_UPDATE.preview||[], count=s=>rows.filter(r=>r.status===s).length;
  const mergedCount=rows.filter(r=>r.sourceRows>1).length;
  $('spareStockSummary').innerHTML=`<div class="grid4"><div><b>Total Material Codes</b><br>${rows.length}</div><div><b>Update</b><br>${count('Update')}</div><div><b>No Change</b><br>${count('No Change')}</div><div><b>Not Found / Invalid</b><br>${count('Material Not Found')+count('Invalid Stock Value')}</div></div><div class="notice">Duplicate codes merged: ${mergedCount}. Blank Material Code rows skipped: ${extra.blankCodeRows||0}.</div>`;
  $('spareStockPreview').innerHTML=`<div class="table-wrap"><table><thead><tr><th>Material Code</th><th>Material Description</th><th>Rows Merged</th><th>Current Stock</th><th>Uploaded Stock</th><th>Difference</th><th>Result</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.materialCode)}</td><td>${esc(r.materialName)}</td><td>${r.sourceRows}</td><td>${r.currentStock??''}</td><td>${r.newStock}</td><td>${r.currentStock===null?'':r.newStock-Number(r.currentStock)}</td><td>${esc(r.status)}</td></tr>`).join('')}</tbody></table></div><div style="margin-top:12px"><button onclick="applySpareStockUpdate()" ${count('Update')?'':'disabled'}>Confirm Stock Update (${count('Update')})</button> <button class="btn-light" onclick="downloadSpareStockComparison()">Download Comparison Excel</button></div>`;
}

async function applySpareStockUpdate(){
  const updates=(SPARE_STOCK_UPDATE.preview||[]).filter(r=>r.status==='Update').map(r=>({recordId:r.recordId,materialCode:r.materialCode,stock:r.newStock}));
  if(!updates.length) return;
  const warehouse=SPARE_STOCK_UPDATE.warehouse;
  if(!confirm(`${updates.length} ${spareStockWarehouseLabel(warehouse)} stock records will be replaced with the uploaded values. Continue?`)) return;
  const msg=$('spareStockMsg'); let done=0, failed=[];
  for(let i=0;i<updates.length;i+=20){
    const batch=updates.slice(i,i+20);
    msg.textContent=`Updating ${done} of ${updates.length}...`;
    const d=await api('/api/spare-stock-update/apply',{method:'POST',body:JSON.stringify({role:S.user.role||'',warehouse,items:batch})});
    done+=Number(d.updated||0); failed.push(...(d.failed||[]));
  }
  msg.textContent=`Spare stock update completed. Updated: ${done}. Failed: ${failed.length}.`;
  await analyzeSpareStockExcel();
}

async function downloadSpareStockComparison(){
  const msg=$('spareStockMsg');
  try{
    if(!window.XlsxPopulate) throw new Error('Excel library is not loaded.');
    const warehouse=SPARE_STOCK_UPDATE.warehouse;
    const wb=await XlsxPopulate.fromBlankAsync(), sh=wb.sheet(0).name('Stock Comparison');
    const heads=['Material Code','Material Description','Rows Merged','Current Stock','Uploaded Stock','Difference','Result'];
    heads.forEach((h,i)=>sh.cell(1,i+1).value(h));
    (SPARE_STOCK_UPDATE.preview||[]).forEach((r,i)=>{
      const n=i+2, vals=[r.materialCode,r.materialName,r.sourceRows,r.currentStock??'',r.newStock,r.currentStock===null?'':r.newStock-Number(r.currentStock),r.status];
      vals.forEach((v,j)=>sh.cell(n,j+1).value(v));
    });
    sh.row(1).style({bold:true});
    const blob=await wb.outputAsync('blob'), a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download=`AERONEX_${spareStockWarehouseLabel(warehouse)}_Spare_Stock_Comparison_${new Date().toISOString().slice(0,10)}.xlsx`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }catch(e){ msg.textContent=e.message||String(e); }
}


function afterSalesFieldValue(row,name){return (row?.fields||{})[name]??''}
function afterSalesDateInput(v){
  if(!v) return new Date().toISOString().slice(0,10);
  const n=Number(v), d=Number.isFinite(n)&&n>0?new Date(n):new Date(v);
  return Number.isNaN(d.getTime())?new Date().toISOString().slice(0,10):d.toISOString().slice(0,10);
}
function afterSalesAttachmentLinks(row){
  const files=afterSalesFieldValue(row,'Attachment');
  if(!Array.isArray(files)||!files.length) return '';
  return `<div style="display:grid;gap:8px;margin-top:10px">${files.map((f,i)=>{
    const token=f?.file_token||f?.token||'', name=f?.name||f?.file_name||`Attachment ${i+1}`;
    if(!token) return `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 10px;border:1px solid #dbe3ef;border-radius:8px"><span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">📄 ${esc(name)}</span></div>`;
    const q=new URLSearchParams({tableId:S.afterSalesTableId,record_id:row.record_id,fieldName:'Attachment',fileToken:token,name,email:userEmail()});
    return `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 10px;border:1px solid #dbe3ef;border-radius:8px"><span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">📄 ${esc(name)}</span><a class="btn-light" style="flex:0 0 auto;padding:5px 10px;white-space:nowrap" href="/api/download-lark-attachment?${q.toString()}">Download</a></div>`;
  }).join('')}</div>`;
}
function afterSalesDealerOptions(current){
  const items=[],seen=new Set();
  for(const r of (Array.isArray(S.dealers)?S.dealers:[])){
    const f=r?.fields||{},name=String(f['Company Name']||f['Dealer Name']||'').trim(),email=String(f['Username ( Email )']||f['Contact Email']||f.Email||'').trim();
    if(!name) continue; const key=(name+'|'+email).toLowerCase(); if(seen.has(key)) continue; seen.add(key); items.push({name,email});
  }
  items.sort((a,b)=>a.name.localeCompare(b.name));
  if(current&&!items.some(x=>x.name===current)) items.unshift({name:current,email:''});
  return items.map(x=>`<option value="${esc(x.name)}" data-email="${esc(x.email)}" ${x.name===current?'selected':''}>${esc(x.name)}${x.email?' — '+esc(x.email):''}</option>`).join('');
}
function afterSalesDealerChanged(){const sel=$('afterSalesDealerName'),email=$('afterSalesDealerEmail');if(!sel||!email)return;const opt=sel.options[sel.selectedIndex];email.value=opt?.dataset?.email||email.value}
function afterSalesSetPage(page){S.afterSalesPage=Math.max(1,Number(page)||1);renderAfterSalesSupport()}
function portalNotesSetPage(page){S.portalNotesPage=Math.max(1,Number(page)||1);renderNotes()}
function simplePaginationHtml(fn,page,totalPages){if(totalPages<=1)return '';return `<button class="btn-light" ${page<=1?'disabled':''} onclick="${fn}(${page-1})">Previous</button><span class="muted" style="padding:0 12px">Page ${page} of ${totalPages}</span><button class="btn-light" ${page>=totalPages?'disabled':''} onclick="${fn}(${page+1})">Next</button>`}

async function loadAfterSalesSupport(){
  if(!currentUserIsAdminTech()) throw new Error('Admin or Technician access only.');
  const d=await api('/api/after-sales-support?role='+encodeURIComponent(S.user.role||''));
  S.afterSalesRows=d.rows||[]; S.afterSalesFields=d.fields||[]; S.afterSalesTableId=d.tableId||'';
  return d;
}
function newAfterSalesSupport(){S.afterSalesEditingId='';renderAfterSalesSupport()}
function editAfterSalesSupport(recordId){S.afterSalesEditingId=recordId||'';renderAfterSalesSupport();setTimeout(()=>$('afterSalesForm')?.scrollIntoView({behavior:'smooth',block:'start'}),30)}
function renderAfterSalesSupportError(e){const sec=$('afterSalesSupport');if(sec)sec.innerHTML=`<div class="panel"><h2>After Sales Support Register</h2><div class="notice">${esc(e?.message||e||'Unable to load records.')}</div></div>`}
function renderAfterSalesSupport(){
  const sec=$('afterSalesSupport'); if(!sec) return;
  if(!currentUserIsAdminTech()){sec.innerHTML='<div class="panel"><h2>After Sales Support Register</h2><div class="notice">Admin or Technician access only.</div></div>';return}
  const rows=S.afterSalesRows||[], editing=rows.find(r=>r.record_id===S.afterSalesEditingId)||null, f=editing?.fields||{};
  const search=(window.AFTER_SALES_SEARCH||'').toLowerCase(),status=window.AFTER_SALES_STATUS||'';
  const filtered=rows.filter(r=>{const x=r.fields||{};const hay=['DJI Case Number','Dealer Name','Dealer Email','Type of Case','Case Description','Recorded by'].map(k=>String(x[k]||'')).join(' ').toLowerCase();return(!search||hay.includes(search))&&(!status||String(x['Case Status']||'')===status)});
  const pageSize=10,totalPages=Math.max(1,Math.ceil(filtered.length/pageSize));S.afterSalesPage=Math.min(Math.max(1,S.afterSalesPage||1),totalPages);const start=(S.afterSalesPage-1)*pageSize,shown=filtered.slice(start,start+pageSize);
  sec.innerHTML=`<div class="panel"><h2>After Sales Support Register <button class="btn-light" onclick="loadAfterSalesSupport().then(renderAfterSalesSupport)">Refresh</button></h2><div class="notice">Available to Admin and Technician. Records are saved directly to the Lark After Sales Support Register Case table.</div>
  <div class="row" style="align-items:end;gap:12px;flex-wrap:wrap"><div style="min-width:260px;flex:1"><label>Search</label><input value="${esc(window.AFTER_SALES_SEARCH||'')}" oninput="window.AFTER_SALES_SEARCH=this.value;S.afterSalesPage=1;renderAfterSalesSupport()" placeholder="Case number, dealer, email, or case type"></div><div style="width:190px"><label>Case Status</label><select onchange="window.AFTER_SALES_STATUS=this.value;S.afterSalesPage=1;renderAfterSalesSupport()"><option value="">All Status</option><option ${status==='Open'?'selected':''}>Open</option><option ${status==='Closed'?'selected':''}>Closed</option></select></div><div><button onclick="newAfterSalesSupport()">+ New Support Case</button></div></div>
  <div class="muted" style="margin:10px 0">${filtered.length?`Showing ${start+1}–${Math.min(start+pageSize,filtered.length)} of ${filtered.length}`:'Showing 0 of 0'}</div>
  <div class="table-wrap" style="margin-top:14px"><table><thead><tr><th>Date</th><th>DJI Case Number</th><th>Status</th><th>Dealer Name</th><th>Type of Case</th><th>Action</th></tr></thead><tbody>${shown.map(r=>{const x=r.fields||{};return `<tr><td>${esc(afterSalesDateInput(x['Date of Case Register']))}</td><td>${esc(x['DJI Case Number']||'')}</td><td>${esc(x['Case Status']||'')}</td><td>${esc(x['Dealer Name']||'')}</td><td>${esc(x['Type of Case']||'')}</td><td><button class="btn-light" onclick="editAfterSalesSupport('${esc(r.record_id)}')">View / Edit</button></td></tr>`}).join('')||'<tr><td colspan="6" class="muted">No support cases found.</td></tr>'}</tbody></table></div>
  <div class="row" style="justify-content:center;align-items:center;margin-top:12px">${simplePaginationHtml('afterSalesSetPage',S.afterSalesPage,totalPages)}</div>
  <div id="afterSalesForm" class="panel" style="box-shadow:none;margin-top:18px;border:1px solid #dbe3ef"><h3>${editing?'Update Support Case':'New Support Case'}</h3><input type="hidden" id="afterSalesRecordId" value="${esc(editing?.record_id||'')}"><div class="grid3"><div><label>Date of Case Register</label><input id="afterSalesDate" type="date" value="${esc(afterSalesDateInput(f['Date of Case Register']))}"></div><div><label>DJI Case Number</label><input id="afterSalesCaseNo" value="${esc(f['DJI Case Number']||'')}"></div><div><label>Case Status</label><select id="afterSalesCaseStatus"><option ${String(f['Case Status']||'Open')==='Open'?'selected':''}>Open</option><option ${String(f['Case Status']||'')==='Closed'?'selected':''}>Closed</option></select></div><div><label>Recorded by</label><input id="afterSalesRecordedBy" value="${esc(f['Recorded by']||S.user.displayName||S.user.contactName||S.user.username||'')}"></div><div><label>Dealer Name</label><select id="afterSalesDealerName" onchange="afterSalesDealerChanged()"><option value="">Select dealer</option>${afterSalesDealerOptions(f['Dealer Name']||'')}</select></div><div><label>Dealer Email</label><input id="afterSalesDealerEmail" type="email" value="${esc(f['Dealer Email']||'')}"></div><div><label>Type of Case</label><input id="afterSalesType" value="${esc(f['Type of Case']||'')}"></div><div style="grid-column:span 2"><label>Attachment</label><input id="afterSalesAttachment" type="file" multiple>${editing?afterSalesAttachmentLinks(editing):''}</div></div><div class="grid2"><div><label>Case Description</label><textarea id="afterSalesDescription" rows="4">${esc(f['Case Description']||'')}</textarea></div><div><label>DJI Reply</label><textarea id="afterSalesReply" rows="4">${esc(f['DJI Reply']||'')}</textarea></div></div><div><label>Remarks</label><textarea id="afterSalesRemarks" rows="3">${esc(f['Remarks']||'')}</textarea></div><p><button onclick="saveAfterSalesSupport()">${editing?'Update Case':'Create Case'}</button> <button class="btn-light" onclick="newAfterSalesSupport()">Clear</button> <span id="afterSalesMsg" class="msg"></span></p></div></div>`;
}
async function saveAfterSalesSupport(){
  try{
    if(!currentUserIsAdminTech()) throw new Error('Admin or Technician access only.');
    const fields={'Date of Case Register':$('afterSalesDate')?.value||'','DJI Case Number':$('afterSalesCaseNo')?.value.trim()||'','Case Status':$('afterSalesCaseStatus')?.value||'Open','Recorded by':$('afterSalesRecordedBy')?.value.trim()||'','Dealer Name':$('afterSalesDealerName')?.value.trim()||'','Dealer Email':$('afterSalesDealerEmail')?.value.trim()||'','Type of Case':$('afterSalesType')?.value.trim()||'','Case Description':$('afterSalesDescription')?.value.trim()||'','DJI Reply':$('afterSalesReply')?.value.trim()||'','Remarks':$('afterSalesRemarks')?.value.trim()||''};
    if(!fields['DJI Case Number']) throw new Error('DJI Case Number is required.');
    const files=[]; for(const file of Array.from($('afterSalesAttachment')?.files||[])) files.push({name:file.name,type:file.type||'application/octet-stream',data:await fileToDataUrl(file)});
    const d=await api('/api/after-sales-support/save',{method:'POST',body:JSON.stringify({role:S.user.role||'',record_id:$('afterSalesRecordId')?.value||'',fields,files})});
    msg('afterSalesMsg',d.updated?'Support case updated.':'Support case created.',true); S.afterSalesEditingId=d.record_id||''; await loadAfterSalesSupport(); renderAfterSalesSupport();
  }catch(e){msg('afterSalesMsg',e.message||String(e))}
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
  return larkOptions('order','Invoice Currency');
}
function defaultInvoiceCurrency(){
  const allowed = allowedInvoiceCurrencies();
  const configured = String(uf('Invoice Currency','') || '').trim().toUpperCase();
  if(allowed.includes(configured)) return configured;
  return allowed[0] || '';
}
function selectedInvoiceCurrency(){
  const el = document.getElementById('invoiceCurrency');
  const allowed = allowedInvoiceCurrencies();
  const cur = String((el && el.value) || defaultInvoiceCurrency() || '').toUpperCase();
  return allowed.includes(cur) ? cur : defaultInvoiceCurrency();
}
function currencyOptions(){
  return selectOptions(allowedInvoiceCurrencies(), selectedInvoiceCurrency(), false);
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

function renderSpare(){$('spare').innerHTML=`<div class="panel"><h2>Spare Order</h2><div class="notice">Select material by name or material code. Review before submit. No edit after apply; cancel request only.${isAdmin()?`<br><b>Country:</b> <select style="max-width:260px;display:inline-block;margin-left:10px" onchange="setAdminCountry(this.value);renderSpare()"><option ${selectedCountry()==='UAE & Other Region'?'selected':''}>UAE & Other Region</option><option ${selectedCountry()==='KSA - SAUDI ARABIA'?'selected':''}>KSA - SAUDI ARABIA</option></select>`:''}</div>${dealerSelectHtml('spare')}<div class="grid4"><div><label>Company Name</label><input id="spareCompany" value="${esc(uf('Company Name','AERO NEX'))}" disabled></div><div><label>Contact Name</label><input id="spareContact" value="${esc(uf('Contact Person',''))}" disabled></div><div><label>Billing Address</label><input id="spareAddress" value="${esc(dealerAddress())}" disabled></div><div><label>Country</label><input id="spareCountry" value="${esc(selectedCountry())}" disabled></div></div><div style="max-width:260px"><label>Invoice Currency</label><select id="invoiceCurrency" onchange="drawCart()">${currencyOptions()}</select></div><label>Add from Spare Part List</label><div class="row"><input id="spareSearch" placeholder="Search by Material Code or Material Name..." oninput="renderSpareOptions()"><input id="spareQty" class="qty" type="number" min="1" value="1"><button class="act" onclick="addListed()">Add Item</button></div><select id="spareSelect"></select><h3>Custom Spare (if not in list)</h3><div class="row"><input id="customCode" placeholder="Material Code (if known)"><input id="customName" placeholder="Material Name"><input id="customQty" class="qty" type="number" min="1" value="1"><button class="act" onclick="addCustom()">Add Custom</button></div><label>Remarks</label><textarea id="spareNotes" placeholder="Optional remarks for this spare order" style="min-height:80px"></textarea><h3>Review Items</h3><div class="table-wrap"><table><thead><tr><th>Material Code</th><th>Material Name</th><th>Compatible Model</th><th>Qty</th><th id="cartUnitPriceHead">Unit Price</th><th id="cartTotalHead">Total</th><th>Action</th></tr></thead><tbody id="cartRows"></tbody></table></div><button onclick="submitOrder()">Submit Order</button> <button class="btn-light" onclick="S.cart=[];drawCart()">Clear All</button><div id="orderMsg" class="msg"></div><h3>My Order History <button class="btn-light" onclick="loadOrders().then(renderOrders)">Refresh</button> ${isAdmin()?`<a class="btn-light" target="_blank" rel="noopener" href="/api/download-spare-orders-report?country=${encodeURIComponent(selectedCountry())}&role=${encodeURIComponent(S.user.role||'')}">Download All Reports</a>`:''}</h3><div class="row" style="align-items:end;gap:12px;flex-wrap:wrap"><div style="min-width:260px;flex:1"><label>Search by Order No or Dealer / Company</label><input id="orderListSearch" value="${esc(S.listUi?.orders?.search||'')}" oninput="setListSearch('orders',this.value)" placeholder="Search order or dealer..."></div><div style="width:150px"><label>Records per page</label><select id="orderPageSize" onchange="setListPageSize('orders',this.value)">${[10,20,30,40,50,100].map(n=>`<option value="${n}" ${Number(S.listUi?.orders?.pageSize||10)===n?'selected':''}>${n}</option>`).join('')}</select></div></div><div id="orderListCount" class="muted" style="margin:10px 0"></div><div class="table-wrap"><table><thead><tr><th>Spare Order No</th><th>Case created</th><th>Dealer / Company</th><th>Status</th><th>Invoice Download</th><th>Payment Receipt</th><th>Final Notes</th></tr></thead><tbody id="orderRows"></tbody></table></div><div id="orderPagination" class="row" style="justify-content:center;align-items:center;margin-top:12px"></div>${renderPageNote(window.AERONEX_SPARE_ORDER_NOTE)}</div>`;renderSpareOptions();drawCart();renderOrders()}
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


function piTemplateConfig(currency){
  const c=String(currency||'USD').toUpperCase();
  if(c==='AED') return {currency:'AED',file:'/templates/spare-order/PI_AED_Template.xlsx',sheet:'Invoice AED',date:'K3',invoice:'K4',customer:'B9',trn:'F9',address:'B10',contact:'B11',email:'B12',currencyCell:'K9',termsPrice:'B38',deliveryTerms:'B40',itemStart:14,itemEnd:33,codeCol:'B',modelCol:'C',qtyCol:'D',priceCol:'E'};
  if(c==='SAR') return {currency:'SAR',file:'/templates/spare-order/PI_SAR_Template.xlsx',sheet:'Invoice SAR',date:'K3',invoice:'K4',customer:'B9',trn:'F9',address:'B10',contact:'B11',email:'B12',currencyCell:'K9',termsPrice:'B38',deliveryTerms:'B40',itemStart:14,itemEnd:33,codeCol:'B',modelCol:'C',qtyCol:'D',priceCol:'E'};
  return {currency:'USD',file:'/templates/spare-order/PI_USD_Template.xlsx',sheet:'Invoice USD',date:'F3',invoice:'F4',customer:'B9',trn:'',address:'B10',contact:'B11',email:'B12',currencyCell:'F11',termsPrice:'B37',deliveryTerms:'B39',itemStart:14,itemEnd:33,codeCol:'C',modelCol:'B',qtyCol:'D',priceCol:'E'};
}
function piToday(){
  const d=new Date();
  return new Date(d.getFullYear(),d.getMonth(),d.getDate());
}
function blobToDataUrl(blob){
  return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error||new Error('Unable to read generated workbook'));r.readAsDataURL(blob)});
}
function safeSheetName(base,page){
  const suffix=` - Page ${page}`;
  return String(base||'Invoice').slice(0,31-suffix.length)+suffix;
}
function fillPiSheet(sheet,cfg,orderNo,orderData,items,pageIndex){
  const pageSize=cfg.itemEnd-cfg.itemStart+1;
  const start=pageIndex*pageSize;
  const pageItems=items.slice(start,start+pageSize);
  sheet.name(safeSheetName(cfg.sheet,pageIndex+1));
  sheet.cell(cfg.date).value(piToday()).style('numberFormat','dd-mm-yyyy');
  sheet.cell(cfg.invoice).value(orderNo);
  sheet.cell(cfg.customer).value(orderData.companyName||'');
  if(cfg.trn) sheet.cell(cfg.trn).value(orderData.trnNo||'');
  sheet.cell(cfg.address).value(orderData.billingAddress||'');
  sheet.cell(cfg.contact).value(orderData.contactName||'');
  sheet.cell(cfg.email).value(orderData.contactEmail||'');
  sheet.cell(cfg.currencyCell).value(cfg.currency);
  if(orderData.piTerms){
    sheet.cell(cfg.termsPrice).value(orderData.piTerms.price||'');
    sheet.cell(cfg.deliveryTerms).value(orderData.piTerms.delivery||'');
  }
  for(let row=cfg.itemStart;row<=cfg.itemEnd;row++){
    sheet.range(`A${row}:E${row}`).value(null);
    const item=pageItems[row-cfg.itemStart];
    if(!item) continue;
    const qty=cleanPrice(item.qty||item.Qty||1)||1;
    const unit=cleanPrice(item.unitPrice ?? item.price ?? itemUnitPrice(item,cfg.currency));
    sheet.cell(`A${row}`).value(start+(row-cfg.itemStart)+1);
    sheet.cell(`${cfg.codeCol}${row}`).value(item.materialCode||item['Material Code']||'');
    sheet.cell(`${cfg.modelCol}${row}`).value(item.materialName||item['Material Name']||item.compatibleModel||item['Compatible Model']||'');
    sheet.cell(`${cfg.qtyCol}${row}`).value(qty);
    sheet.cell(`${cfg.priceCol}${row}`).value(unit);
  }
}
async function generateAndUploadPi(orderResult,orderData,items){
  if(!window.XlsxPopulate) throw new Error('Excel template engine is not loaded');
  const orderNo=orderResult.orderNo;
  const tableId=orderResult.tableId;
  const recordId=orderResult.record_id;
  if(!orderNo||!tableId||!recordId) throw new Error('Missing order details for PI generation');
  const cfg=piTemplateConfig(orderData.invoiceCurrency);
  const res=await fetch(cfg.file,{cache:'no-store'});
  if(!res.ok) throw new Error(`PI template not found: ${cfg.file}`);
  const workbook=await XlsxPopulate.fromDataAsync(await res.arrayBuffer());
  const base=workbook.sheet(cfg.sheet)||workbook.sheet(0);
  const pageSize=cfg.itemEnd-cfg.itemStart+1;
  const pages=Math.max(1,Math.ceil(items.length/pageSize));
  const sheets=[base];
  for(let p=1;p<pages;p++) sheets.push(workbook.cloneSheet(base,safeSheetName(cfg.sheet,p+1)));
  for(let p=0;p<pages;p++) fillPiSheet(sheets[p],cfg,orderNo,orderData,items,p);
  let output=await workbook.outputAsync('arraybuffer');
  if(window.JSZip){
    const zip=await JSZip.loadAsync(output);
    let contentTypes=await zip.file('[Content_Types].xml').async('string');
    const closeTag='</Types>';
    const sheetFiles=Object.keys(zip.files).filter(x=>/^xl\/worksheets\/sheet\d+\.xml$/.test(x));
    for(const file of sheetFiles){
      const part='/'+file;
      if(!contentTypes.includes(`PartName=\"${part}\"`)){
        contentTypes=contentTypes.replace(closeTag,`<Override PartName=\"${part}\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/>${closeTag}`);
      }
    }
    zip.file('[Content_Types].xml',contentTypes);
    output=await zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  }
  const blob=output instanceof Blob?output:new Blob([output],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const date=new Date().toISOString().slice(0,10);
  const fileName=`${orderNo}_${date}.xlsx`;
  const data=await blobToDataUrl(blob);
  return api('/api/upload-generated-order-xlsx',{method:'POST',body:JSON.stringify({tableId,record_id:recordId,orderNo,file:{name:fileName,type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',data}})});
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
    let p={companyName:($('spareCompany')?.value||uf('Company Name','AERO NEX')),contactName:($('spareContact')?.value||uf('Contact Person','')),contactEmail:userEmail(),trnNo:uf('TRN NO','')||dealerTrn(),billingAddress:($('spareAddress')?.value||dealerAddress()),invoiceCurrency:currency,country:($('spareCountry')?.value||selectedCountry()),items:pricedItems,remarks:(($('spareNotes')&&$('spareNotes').value)||'').trim()};
    let d=await api('/api/submit-spare',{method:'POST',body:JSON.stringify(p)});
    try{await generateAndUploadPi(d,p,pricedItems);msg('orderMsg','Order submitted with PI Excel file: '+d.orderNo,true)}catch(piErr){console.error('PI generation failed',piErr);msg('orderMsg','Order submitted, but PI Excel generation failed: '+(piErr.message||piErr),false)}
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


function larkAttachmentToken(v){
  if(!v || typeof v!=='object') return '';
  const direct=v.file_token||v.token||'';
  if(direct) return String(direct);
  const raw=String(v.tmp_url||v.url||v.file_url||v.href||'');
  const m=raw.match(/\/medias\/([^/]+)\/download/i);
  return m ? decodeURIComponent(m[1]) : '';
}
function secureLarkAttachmentUrl(v, fieldName, row){
  const token=larkAttachmentToken(v);
  const tableId=row && (row._table_id||row.tableId||row.table_id) || '';
  const recordId=row && row.record_id || '';
  if(!token || !tableId || !recordId) return '';
  const q=new URLSearchParams({
    tableId,
    record_id:recordId,
    fieldName:String(fieldName||''),
    fileToken:token,
    name:String(v.name||v.file_name||v.filename||'download'),
    email:String(S.user?.email||S.user?.username||''),
    role:String(S.user?.role||'')
  });
  return '/api/download-lark-attachment?'+q.toString();
}
function spareOrderDisplayCell(v, row, fieldName){
  if(v===undefined || v===null || v==='') return '-';
  if(Array.isArray(v)){
    if(!v.length) return '-';
    return v.map(f=>spareOrderDisplayCell(f,row,fieldName)).join('<br>');
  }
  if(typeof v==='object'){
    const secure=secureLarkAttachmentUrl(v,fieldName,row);
    const url=secure || v.link||v.url||v.tmp_url||'';
    const text=v.text||v.name||v.file_name||v.filename||v.value||'Open';
    return url ? `<a class="btn-light" target="_blank" rel="noopener" href="${esc(url)}">${esc(text)}</a>` : esc(text);
  }
  const text=String(v);
  if(text.startsWith('http://') || text.startsWith('https://')) return `<a class="btn-light" target="_blank" rel="noopener" href="${esc(text)}">Open</a>`;
  return esc(text);
}
function spareOrderField(f, names){
  for(const n of names){
    if(f && f[n] !== undefined && f[n] !== null && f[n] !== '') return f[n];
  }
  return '';
}
function spareOrderDealerCnCell(f){ return spareOrderDisplayCell(spareOrderField(f, ['Dealer Credit Note','Dealer CN'])); }
function spareOrderDestinationValue(f){ return spareOrderField(f, ['Shipment Destination']); }
function spareOrderTrackingValue(f){ return spareOrderField(f, ['Shipment Tracking No','Tracking No','Shipment Tracking Number']); }
function spareOrderSpecializedValue(f){ return spareOrderField(f, ['Specialized']); }
function spareOrderSpareSourceValue(f){ return spareOrderField(f, ['Spare Source']); }
function spareOrderStockUpdatedValue(f){ return spareOrderField(f, ['Stock Updated']); }
function spareOrderFinalNotesValue(f){ return spareOrderField(f, ['Final Notes']); }
function spareOrderDjiCaseValue(f){ return spareOrderField(f, ['DJI Case NO','DJI case NO','DJI Case No','DJI case No']); }
function spareOrderCanEditInternal(){ return currentUserIsAdminTech(); }
function spareOrderCanDownloadReport(){ return currentUserIsAdminTech(); }
function shipmentDestinationOptions(cur){
  return selectOptions(larkOptions('order','Shipment Destination'),cur,true);
}
function spareOrderDealerFields(f){
  const email=String(spareOrderField(f,['Contact Email','Username ( Email )','Email'])||'').trim().toLowerCase();
  if(!email) return {};
  const row=(S.dealers||[]).find(x=>dealerContactEmail(x)===email);
  return row?.fields||{};
}
function uaePiTermsForOrder(f){
  const destination=String(spareOrderDestinationValue(f)||'').trim();
  if(destination==='DXB DSO (Mainland)') return {price:'Include Duty & VAT',delivery:'EXW Dubai'};
  if(destination==='DXB FZCO (JAFZA)') return {price:'Exclude Duty & VAT',delivery:'EXW JAFZA Free Zone'};
  if(destination==='HONG KONG WH') return {price:'Exclude Duty & VAT',delivery:'FCA Hong Kong'};
  if(destination==='SHIP TO DEALER'){
    const shippingCountry=String(spareOrderDealerFields(f)['Shipping Country']||'').trim();
    return {price:'Exclude Duty & VAT',delivery:`DAP – ${shippingCountry||'Country'}`};
  }
  return null;
}

function spareSourceOptions(cur){
  return selectOptions(larkOptions('order','Spare Source'),cur,true);
}
function specializedOptions(cur){
  return selectOptions(larkOptions('order','Specialized'),cur,true);
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
    const secure = secureLarkAttachmentUrl(v, fieldName, row);
    const link = secure || v.link || v.url || v.href || v.file_url || v.tmp_url;
    const name = v.text || v.name || v.file_name || v.filename || v.value || v.title || 'Open';
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



function splitOrderFieldValues(v){
  if(Array.isArray(v)) return v.map(x=>String(x||'').trim()).filter(Boolean);
  return String(v||'').split(',').map(x=>x.trim()).filter(Boolean);
}
function spareOrderItemsFromFields(f){
  const codes=splitOrderFieldValues(f['Material Code']);
  const names=splitOrderFieldValues(f['Material Name']);
  const qtys=splitOrderFieldValues(f['Qty']);
  const count=Math.max(codes.length,names.length,qtys.length);
  const items=[];
  for(let i=0;i<count;i++) items.push({materialCode:codes[i]||'',materialName:names[i]||'',qty:Number(qtys[i]||1)||1});
  return items;
}
function orderEditSpareOptions(){
  return (S.spares||[]).map(x=>{const f=x.fields||{};const o={materialCode:f['Material Code']||'',materialName:f['Material Name']||''};return `<option value="${encodeURIComponent(JSON.stringify(o))}">${esc(o.materialCode)} - ${esc(o.materialName)}</option>`}).join('');
}
function renderOrderEditItems(){
  const body=$('orderEditItems'); if(!body) return;
  const items=S.orderEdit?.items||[];
  body.innerHTML=items.map((x,i)=>`<tr><td>${esc(x.materialCode)}</td><td>${esc(x.materialName)}</td><td><input type="number" min="1" value="${esc(x.qty||1)}" onchange="S.orderEdit.items[${i}].qty=Math.max(1,Number(this.value)||1)"></td><td><button class="btn-light" onclick="S.orderEdit.items.splice(${i},1);renderOrderEditItems()">Remove</button></td></tr>`).join('')||'<tr><td colspan="4" class="muted">No items.</td></tr>';
}
function addOrderEditItem(){
  const sel=$('orderEditSpareSelect'); if(!sel||!sel.value) return;
  const item=JSON.parse(decodeURIComponent(sel.value));
  item.qty=Math.max(1,Number(val('orderEditQty'))||1);
  S.orderEdit.items.push(item);
  renderOrderEditItems();
}
async function loadExistingSpareOrderItems(r, currency){
  const fromFields=spareOrderItemsFromFields((r&&r.fields)||{}).filter(x=>x.materialCode||x.materialName);
  if(fromFields.length) return fromFields;
  if(!window.XlsxPopulate) return [];
  const tableId=r&&(r._table_id||r.tableId||r.table_id)||'';
  const recordId=r&&r.record_id||'';
  if(!tableId||!recordId) return [];
  const orderNo=getSpareOrderNoFromRow(r);
  const url=`/api/download-order-excel?tableId=${encodeURIComponent(tableId)}&record_id=${encodeURIComponent(recordId)}&orderNo=${encodeURIComponent(orderNo)}&role=${encodeURIComponent(S.user.role||'')}`;
  const res=await fetch(url,{cache:'no-store'});
  if(!res.ok) return [];
  const workbook=await XlsxPopulate.fromDataAsync(await res.arrayBuffer());
  const cfg=piTemplateConfig(currency);
  const items=[];
  for(const sheet of workbook.sheets()){
    for(let row=cfg.itemStart;row<=cfg.itemEnd;row++){
      const materialCode=String(sheet.cell(`${cfg.codeCol}${row}`).value()??'').trim();
      const materialName=String(sheet.cell(`${cfg.modelCol}${row}`).value()??'').trim();
      const qtyValue=sheet.cell(`${cfg.qtyCol}${row}`).value();
      if(!materialCode&&!materialName) continue;
      items.push({materialCode,materialName,qty:Math.max(1,Number(qtyValue)||1)});
    }
  }
  return items;
}
async function openSpareOrderEdit(i){
  if(!currentUserIsAdminTech()) return;
  const r=(S.orders||[])[i]; if(!r) return;
  const f=r.fields||{};
  const currency=String(f['Invoice Currency']||'USD').toUpperCase();
  S.orderEdit={index:i,row:r,items:[]};
  const html=`<div class="panel"><h3>Update Existing Spare Order</h3>
    <div class="grid3">
      <div><label>Spare Order No</label><input value="${esc(orderNoValue(f)||'')}" disabled></div>
      <div><label>Company Name</label><input id="orderEditCompany" value="${esc(f['Company Name']||'')}"></div>
      <div><label>Contact Name</label><input id="orderEditContact" value="${esc(f['Contact Name']||'')}"></div>
      <div><label>Billing Address</label><input id="orderEditAddress" value="${esc(f['Billing Address']||f['Invoice Address']||'')}"></div>
      <div><label>Invoice Currency</label><select id="orderEditCurrency">${selectOptions(allowedInvoiceCurrencies(),String(f['Invoice Currency']||'').toUpperCase(),false)}</select></div>
      <div><label>Country</label><input value="${esc(f['Country']||selectedCountry())}" disabled></div>
    </div>
    <label>Remarks</label><textarea id="orderEditRemarks">${esc(f['Remarks']||'')}</textarea>
    <h3>Order Items</h3>
    <div class="row"><select id="orderEditSpareSelect">${orderEditSpareOptions()}</select><input id="orderEditQty" class="qty" type="number" min="1" value="1"><button class="btn-light" onclick="addOrderEditItem()">Add Item</button></div>
    <div class="table-wrap"><table><thead><tr><th>Material Code</th><th>Material Name</th><th>Qty</th><th>Action</th></tr></thead><tbody id="orderEditItems"></tbody></table></div>
    <div class="row"><button class="act" onclick="saveExistingSpareOrder()">Save & Regenerate Order File</button></div><div id="orderEditMsg" class="msg"></div>
  </div>`;
  showDetailsModal(`Update Order - ${orderNoValue(f)||''}`,html);
  const body=$('orderEditItems');
  if(body) body.innerHTML='<tr><td colspan="4" class="muted">Loading order items...</td></tr>';
  try{
    S.orderEdit.items=await loadExistingSpareOrderItems(r,currency);
  }catch(e){
    console.error('Unable to load existing order items',e);
    S.orderEdit.items=[];
  }
  renderOrderEditItems();
}
async function saveExistingSpareOrder(){
  try{
    if(!currentUserIsAdminTech()) throw new Error('Admin/Technician only');
    const edit=S.orderEdit; if(!edit?.row) throw new Error('Order not selected');
    if(!edit.items.length) throw new Error('Add at least one item');
    const r=edit.row, f=r.fields||{}, currency=val('orderEditCurrency')||f['Invoice Currency']||'USD';
    const pricedItems=edit.items.map(x=>{const qty=Math.max(1,Number(x.qty)||1);const unit=itemUnitPrice(x,currency);return {...x,qty,selectedCurrency:currency,unitPrice:unit,totalPrice:unit*qty,price:unit};});
    const orderData={companyName:val('orderEditCompany'),contactName:val('orderEditContact'),billingAddress:val('orderEditAddress'),invoiceCurrency:currency,country:f['Country']||selectedCountry(),remarks:val('orderEditRemarks')};
    if(!String(orderData.country||'').toLowerCase().includes('ksa')) orderData.piTerms=uaePiTermsForOrder(f);
    const result=await api('/api/update-spare-order',{method:'POST',body:JSON.stringify({role:S.user.role||'',tableId:r._table_id||r.tableId||r.table_id,record_id:r.record_id,companyName:orderData.companyName,contactName:orderData.contactName,billingAddress:orderData.billingAddress,invoiceCurrency:currency,remarks:orderData.remarks,items:pricedItems})});
    await generateAndUploadPi({orderNo:result.orderNo,tableId:result.tableId,record_id:result.record_id},orderData,pricedItems);
    msg('orderEditMsg','Order updated and Order Excel replaced successfully');
    await loadOrders();
    setTimeout(()=>{const idx=(S.orders||[]).findIndex(x=>x.record_id===result.record_id);if(idx>=0)openSpareOrderDetails(idx);},500);
  }catch(e){msg('orderEditMsg',e.message||String(e));}
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
    ${kvHtml('Order File', `${backendOrderDownloadLink(r)}${currentUserIsAdminTech()?` <button class="btn-light" onclick="openSpareOrderEdit(${i})">Update Order</button>`:''}`)}
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
        <div><label>Dealer Credit No</label><input id="soDealerCreditNo" value="${esc(f['Dealer Credit No']||'')}"></div>
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
      djiCaseNo:($('soDjiCaseNo')?.value||'').trim(),
      dealerCreditNo:($('soDealerCreditNo')?.value||'').trim()
    };
    await api('/api/update-spare-order-internal',{method:'POST',body:JSON.stringify(payload)});
    msg('soDetailMsg','Saved');
    await loadOrders();
    openSpareOrderDetails(i);
  }catch(e){msg('soDetailMsg',e.message)}
}
function listDateMillis(row, kind){
  const f=(row&&row.fields)||{};
  const fieldNamesByKind={
    repairs:['Case created','Case Created','Date Created','Case Creation Date','Created Date'],
    orders:['Date Created','Case Created','Case created','Created Date','Order Date'],
    internalRepair:['Case Creation Date','Date Created','Case Created','Case created','Created Date'],
    internalSpare:['Case Creation Date','Date Created','Case Created','Case created','Created Date','Order Date']
  };
  const names=fieldNamesByKind[kind]||fieldNamesByKind.orders;
  const toMillis=(v)=>{
    if(v===undefined || v===null || v==='') return 0;
    const numeric=Number(v);
    if(Number.isFinite(numeric)){
      if(numeric>100000000000) return numeric;      // milliseconds
      if(numeric>1000000000) return numeric*1000;  // seconds
    }
    const parsed=Date.parse(String(v));
    return Number.isFinite(parsed)?parsed:0;
  };
  for(const name of names){
    const ms=toMillis(f[name]);
    if(ms) return ms;
  }
  return toMillis(row?.created_time || row?.createdTime || row?.modified_time || row?.modifiedTime || 0);
}
function ensureListUi(kind){
  S.listUi=S.listUi||{};
  S.listUi[kind]=S.listUi[kind]||{page:1,pageSize:10,search:''};
  return S.listUi[kind];
}
function renderListKind(kind){
  if(kind==='orders') return renderOrders();
  if(kind==='repairs') return renderRepairStatus();
  if(kind==='internalRepair') return renderInternalRepair();
  if(kind==='internalSpare') return renderSpareOrderDetailsAdmin();
}
function setListSearch(kind,value){
  const ui=ensureListUi(kind); ui.search=String(value||''); ui.page=1;
  renderListKind(kind);
}
function setListPageSize(kind,value){
  const ui=ensureListUi(kind); ui.pageSize=Math.max(1,Number(value)||10); ui.page=1;
  renderListKind(kind);
}
function changeListPage(kind,delta){
  const ui=ensureListUi(kind); ui.page=Math.max(1,(Number(ui.page)||1)+Number(delta||0));
  renderListKind(kind);
}
function listPaginationHtml(kind,total,page,pageSize){
  const pages=Math.max(1,Math.ceil(total/pageSize));
  return `<button class="btn-light" onclick="changeListPage('${kind}',-1)" ${page<=1?'disabled':''}>Previous</button><span class="muted">Page ${page} of ${pages}</span><button class="btn-light" onclick="changeListPage('${kind}',1)" ${page>=pages?'disabled':''}>Next</button>`;
}
function renderOrders(){
  let e=$('orderRows');
  if(!e)return;
  const ui=ensureListUi('orders');
  const q=String(ui.search||'').trim().toLowerCase();
  const source=(Array.isArray(S.orders)?S.orders:[]).map((r,index)=>({r,index}));
  const filtered=source.filter(({r})=>{
    const f=r.fields||{};
    const no=String(orderNoValue(f)||'').toLowerCase();
    const dealer=String(f['Company Name']||f['Dealer Name']||'').toLowerCase();
    return !q || no.includes(q) || dealer.includes(q);
  }).sort((a,b)=>listDateMillis(b.r,'orders')-listDateMillis(a.r,'orders'));
  const total=filtered.length;
  const pageSize=Number(ui.pageSize)||10;
  const pages=Math.max(1,Math.ceil(total/pageSize));
  ui.page=Math.min(Math.max(1,Number(ui.page)||1),pages);
  const start=(ui.page-1)*pageSize;
  const pageRows=filtered.slice(start,start+pageSize);
  e.innerHTML=pageRows.map(({r,index})=>{
    let f=r.fields||{};
    let no=orderNoValue(f);
    return `<tr>
      <td><a href="#" onclick="openSpareOrderDetails(${index});return false;">${esc(no||'-')}</a></td>
      <td>${esc(formatDisplayDate(f['Case created'])||'-')}</td>
      <td>${esc(f['Company Name']||f['Dealer Name']||'-')}</td>
      <td>${statusCell(r,'spare')}</td>
      <td>${invoiceDownloadCell(r)}</td>
      <td>${paymentReceiptCell(r)}</td>
      <td>${esc(spareOrderFinalNotesValue(f)||'-')}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="7" class="muted">No spare orders found.</td></tr>';
  const count=$('orderListCount');
  if(count) count.textContent=total ? `Showing ${start+1}–${Math.min(start+pageSize,total)} of ${total} Spare Orders` : 'Showing 0 of 0 Spare Orders';
  const nav=$('orderPagination');
  if(nav) nav.innerHTML=listPaginationHtml('orders',total,ui.page,pageSize);
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

function repairAttachmentCell(row, fieldName, label){
  const value=(row.fields||{})[fieldName];
  if(!Array.isArray(value) || !value.length) return '<span class="muted">Not uploaded</span>';
  return value.map(file=>{
    const url=secureLarkAttachmentUrl(file,fieldName,row);
    const name=file.name||file.file_name||file.filename||label||'Download';
    return url?`<a class="btn-light" target="_blank" rel="noopener" href="${esc(url)}">${esc(name)}</a>`:'<span class="muted">File unavailable</span>';
  }).join('<br>');
}
async function uploadRepairDocument(index, fieldName, input){
  const row=(S.repairs||[])[index];
  if(!row) return;
  const file=await readUploadFile(input);
  if(!file) return;
  try{
    await api('/api/upload-repair-document',{method:'POST',body:JSON.stringify({
      role:S.user.role||'', tableId:row._table_id||'', record_id:row.record_id, fieldName, file
    })});
    await loadRepairs();
    openRepairCaseDetails((S.repairs||[]).findIndex(x=>x.record_id===row.record_id));
  }catch(e){ alert(e.message||'Upload failed'); }
}
async function saveRepairCaseDetails(index){
  const row=(S.repairs||[])[index];
  if(!row) return;
  try{
    await api('/api/update-repair-details',{method:'POST',body:JSON.stringify({
      role:S.user.role||'', tableId:row._table_id||'', record_id:row.record_id,
      invoiceAmount:($('repairInvoiceAmount')?.value||'').trim(),
      caseCloseComment:($('repairCaseCloseComment')?.value||'').trim()
    })});
    msg('repairDetailMsg','Saved successfully');
    await loadRepairs();
    openRepairCaseDetails((S.repairs||[]).findIndex(x=>x.record_id===row.record_id));
  }catch(e){ msg('repairDetailMsg',e.message||'Save failed'); }
}
function openRepairCaseDetails(index){
  const row=(S.repairs||[])[index];
  if(!row) return;
  const f=row.fields||{};
  const canEdit=currentUserIsAdminTech();
  const caseNo=internalRepairCaseNo(f)||'-';
  const amount=f['Invoice Amount'];
  const html=`<div class="details-kv">
    ${kv('Repair Case',caseNo)}
    ${kv('Company Name',f['Company Name']||'-')}
    ${kv('Model No',f['Model No']||'-')}
    ${kv('Serial No',f['Serial No']||'-')}
    ${kv('Case created',formatDisplayDate(f['Case created'])||'-')}
    ${kv('Date of Purchase / Activation date',formatDisplayDate(f['Date of Purchase / Activation date']||f['Date Of Activation'])||'-')}
    ${kv('Status',f['Status']||'-')}
  </div>
  <h3 class="details-section-title">Invoice & Payment</h3>
  <div class="grid3">
    <div><label>Invoice Amount</label>${canEdit?`<input id="repairInvoiceAmount" type="number" step="0.01" value="${esc(amount??'')}">`:`<div class="notice">${esc(amount??'-')}</div>`}</div>
    <div><label>Invoice Download</label>${repairAttachmentCell(row,'Invoice Download','Download Invoice')}${canEdit?`<br><label class="mini-upload">Upload / Replace Invoice<input type="file" onchange="uploadRepairDocument(${index},'Invoice Download',this)"></label>`:''}</div>
    <div><label>Payment Receipt</label>${repairAttachmentCell(row,'Payment Receipt','Download Receipt')}${canEdit?`<br><label class="mini-upload">Upload / Replace Receipt<input type="file" onchange="uploadRepairDocument(${index},'Payment Receipt',this)"></label>`:''}</div>
  </div>
  <label>Case Close Comment</label>${canEdit?`<textarea id="repairCaseCloseComment">${esc(f['Case Close Comment']||'')}</textarea>`:`<div class="notice">${esc(f['Case Close Comment']||'-')}</div>`}
  ${canEdit?`<div class="row"><button class="act" onclick="saveRepairCaseDetails(${index})">Save Repair Details</button><span id="repairDetailMsg" class="msg"></span></div>`:''}
  <h3 class="details-section-title">All Lark Fields</h3>${renderAllLarkFieldsTable(f,row)}`;
  showDetailsModal(`Repair Case Details - ${caseNo}`,html);
}
function renderRepairStatus(){
  const ui=ensureListUi('repairs');
  const q=String(ui.search||'').trim().toLowerCase();
  const source=(Array.isArray(S.repairs)?S.repairs:[]).map((r,index)=>({r,index}));
  const filtered=source.filter(({r})=>{
    const f=r.fields||{};
    const caseNo=String(f['REPAIR CASE']||f['Repair Case']||f['Case Register No']||f['Repair Case No']||'').toLowerCase();
    const dealer=String(f['Company Name']||f['Dealer Name']||f['Contact Name']||'').toLowerCase();
    return !q || caseNo.includes(q) || dealer.includes(q);
  }).sort((a,b)=>listDateMillis(b.r,'repairs')-listDateMillis(a.r,'repairs'));
  const total=filtered.length;
  const pageSize=Number(ui.pageSize)||10;
  const pages=Math.max(1,Math.ceil(total/pageSize));
  ui.page=Math.min(Math.max(1,Number(ui.page)||1),pages);
  const start=(ui.page-1)*pageSize;
  const pageRows=filtered.slice(start,start+pageSize);
  $('repairStatus').innerHTML=`<div class="panel"><h2>Repair Status <button class="btn-light" onclick="refreshRepairs()">Refresh</button></h2><div class="row" style="align-items:end;gap:12px;flex-wrap:wrap"><div style="min-width:260px;flex:1"><label>Search by Case No or Dealer / Company</label><input id="repairListSearch" value="${esc(ui.search||'')}" oninput="setListSearch('repairs',this.value)" placeholder="Search case or dealer..."></div><div style="width:150px"><label>Records per page</label><select onchange="setListPageSize('repairs',this.value)">${[10,20,30,40,50,100].map(n=>`<option value="${n}" ${pageSize===n?'selected':''}>${n}</option>`).join('')}</select></div></div><div class="muted" style="margin:10px 0">${total?`Showing ${start+1}–${Math.min(start+pageSize,total)} of ${total} Repair Cases`:'Showing 0 of 0 Repair Cases'}</div><div class="table-wrap"><table><thead><tr><th>Repair Case No</th><th>Case created</th><th>Dealer / Company</th><th>Model No</th><th>Serial No</th><th>Status</th><th>Log Link</th><th>Issue Media / Required Details</th><th>Case Close Comment</th><th>Action</th></tr></thead><tbody>${pageRows.map(({r,index})=>{let f=r.fields||{};return `<tr><td>${internalRepairCaseLink(r)}</td><td>${esc(formatDisplayDate(f['Case created'])||'-')}</td><td>${esc(f['Company Name']||f['Dealer Name']||'')}</td><td>${esc(f['Model No']||'')}</td><td>${esc(f['Serial No']||'')}</td><td>${statusCell(r,'repair')}</td><td>${linkCell(f['Log File']||f['Log for Drone and RC'])}</td><td>${linkCell(f['Upload all the required details']||f['Issue Video and Pictures'])}</td><td>${esc(f['Case Close Comment']||'')}</td><td><button class="btn-light" onclick="openRepairCaseDetails(${index})">View / Edit</button></td></tr>`}).join('')||'<tr><td colspan="10" class="muted">No repair cases found.</td></tr>'}</tbody></table></div><div class="row" style="justify-content:center;align-items:center;margin-top:12px">${listPaginationHtml('repairs',total,ui.page,pageSize)}</div></div>`;
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
  const rows=Array.isArray(S.notes)?S.notes:[],pageSize=10,totalPages=Math.max(1,Math.ceil(rows.length/pageSize));S.portalNotesPage=Math.min(Math.max(1,S.portalNotesPage||1),totalPages);const start=(S.portalNotesPage-1)*pageSize,pageRows=rows.slice(start,start+pageSize);
  $('portalNotes').innerHTML=`<div class="panel"><h2>Portal Notes</h2><div class="notice">Important announcements, policies, and external document links.</div><div class="muted" style="margin:10px 0">${rows.length?`Showing ${start+1}–${Math.min(start+pageSize,rows.length)} of ${rows.length}`:'Showing 0 of 0'}</div><div class="table-wrap"><table><thead><tr><th>Title</th><th>Page</th><th>Note</th><th>Country</th><th>Document Link</th></tr></thead><tbody>${pageRows.map(r=>{let f=r.fields||{};let doc=f['Document Link']||f.Document||f.Link||f.URL||f['Document URL'];let link=portalDocumentLink(doc);if(doc&&link!=='-')link=link.replace(/>[^<]*<\/a>/,'>Open Document</a>');return `<tr><td>${esc(f.Title||'')}</td><td>${esc(f.Page||'')}</td><td>${esc(f.Note||f.Description||'')}</td><td>${esc(f.Country||'All')}</td><td style="white-space:nowrap">${link}</td></tr>`}).join('')||'<tr><td colspan="5" class="muted">No portal notes found.</td></tr>'}</tbody></table></div><div class="row" style="justify-content:center;align-items:center;margin-top:12px">${simplePaginationHtml('portalNotesSetPage',S.portalNotesPage,totalPages)}</div></div>`;
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

  await loadDropdownOptions();
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

