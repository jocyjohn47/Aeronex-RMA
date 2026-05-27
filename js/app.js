
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


let S={user:loadUser(),spares:[],cart:[],orders:[],repairs:[],dealers:[],notes:[]};
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
  return parseRemark(uf('Remarks',''),'Contact No') || '';
}
function dealerTrn(){
  return parseRemark(uf('Remarks',''),'TRN No') || '';
}
function dealerPoBox(){
  return parseRemark(uf('Remarks',''),'P.O Box No') || '';
}

function country(){return normalizeCountryValue(S.user?.country||S.user?.fields?.Country||'UAE & Other Region')}function uf(k,d=''){return S.user?.fields?.[k]??d}
function layout(){let n=S.user?.displayName||S.user?.username||'User';document.body.innerHTML=`<header class="topbar"><div class="brand"><div class="brand-title">AERO NEX</div><div class="brand-sub">RMA & Spare Order Portal</div></div><nav class="nav">
<a class="active" data-sec="dashboard" href="#" onclick="show('dashboard')">⌂ Dashboard</a><a data-sec="spare" href="#" onclick="show('spare')">🛒 Spare Order</a><a data-sec="repairCreate" href="#" onclick="show('repairCreate')">📝 Create Repair Case</a><a data-sec="repairStatus" href="#" onclick="show('repairStatus')">📋 Repair Status</a><a data-sec="dealers" href="#" onclick="show('dealers')">🏢 Dealer Details</a><a data-sec="portalNotes" href="#" onclick="show('portalNotes')">📄 Portal Notes</a>${isAdmin()?`<a data-sec="admin" href="#" onclick="show('admin')">⚙ Admin</a>`:''}</nav><div class="user" onclick="this.classList.toggle('open')"><div class="avatar">${esc(initials())}</div><div><b>${esc(n)}</b><br><small>${esc(S.user.role||'End user')}</small></div><span>⌄</span><div class="menu"><a href="#" onclick="event.stopPropagation();show('changePassword')">🔒 Change Password</a><a href="#" onclick="event.stopPropagation();logout()">↪ Logout</a></div></div></header><main class="page">${['dashboard','spare','repairCreate','repairStatus','dealers','portalNotes','changePassword','admin'].map(x=>`<section id="${x}" class="section"></section>`).join('')}</main><footer class="footer">© 2025 AERO NEX<br>Developed by Jocy John<br>Support: support@aeronex.ae</footer>`}
function show(sec){document.querySelectorAll('.section').forEach(x=>x.classList.remove('active'));$(sec)?.classList.add('active');document.querySelectorAll('.nav a').forEach(a=>a.classList.toggle('active',a.dataset.sec===sec));scrollTo(0,0)}
function renderDashboard(){$('dashboard').classList.add('active');$('dashboard').innerHTML=`<div class="hero"><h2>Welcome back, ${esc(S.user.displayName||S.user.username)}</h2><div class="muted">Here's what you can do today</div>${isAdmin()?`<div class="notice"><b>Country:</b> <select style="max-width:260px;display:inline-block;margin-left:10px" onchange="setAdminCountry(this.value)"><option ${selectedCountry()==='UAE & Other Region'?'selected':''}>UAE & Other Region</option><option ${selectedCountry()==='KSA - SAUDI ARABIA'?'selected':''}>KSA - SAUDI ARABIA</option></select></div>`:''}</div><div class="cards">${[['🛒','Spare Order','Order spare parts from inventory.','spare','Go to Spare Order'],['🔧','Create Repair Case','Submit a new repair request.','repairCreate','Create Case'],['📋','Repair Status','Track repair cases, reports and invoices.','repairStatus','View Status'],['🏢','Dealer Details','View and manage dealer information.','dealers','View Dealers'],['📄','Portal Notes','Important information and announcements.','portalNotes','View Notes']].map(c=>`<div class="card"><div class="ico">${c[0]}</div><h3>${c[1]}</h3><p>${c[2]}</p><a href="#" onclick="show('${c[3]}')">${c[4]} →</a></div>`).join('')}</div>`}
function renderChangePassword(){$('changePassword').innerHTML=`<div class="panel" style="max-width:620px;margin:auto"><h2>Change Password</h2><label>Current Password</label><input type="password"><label>New Password</label><input id="newPassword" type="password"><label>Confirm New Password</label><input id="confirmPassword" type="password"><button onclick="changePassword()">Update Password</button><div id="cpMsg" class="msg"></div></div>`}

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
function selectedInvoiceCurrency(){
  const el = document.getElementById('invoiceCurrency');
  return (el && el.value) || 'USD';
}
function currencyOptions(){
  const cur = selectedInvoiceCurrency();
  return ['USD','AED','SAR'].map(c => `<option ${cur===c?'selected':''}>${c}</option>`).join('');
}

function renderSpare(){$('spare').innerHTML=`<div class="panel"><h2>Spare Order</h2><div class="notice">Select material by name or material code. Review before submit. No edit after apply; cancel request only.${isAdmin()?`<br><b>Country:</b> <select style="max-width:260px;display:inline-block;margin-left:10px" onchange="setAdminCountry(this.value)"><option ${selectedCountry()==='UAE & Other Region'?'selected':''}>UAE & Other Region</option><option ${selectedCountry()==='KSA - SAUDI ARABIA'?'selected':''}>KSA - SAUDI ARABIA</option></select>`:''}</div><div class="grid4"><div><label>Company Name</label><input value="${esc(uf('Company Name','AERO NEX'))}" disabled></div><div><label>Contact Name</label><input value="${esc(uf('Contact Person',''))}" disabled></div><div><label>Billing Address</label><input value="${esc(dealerAddress())}" disabled></div><div><label>Country</label><input value="${esc(selectedCountry())}" disabled></div></div><div style="max-width:260px"><label>Invoice Currency</label><select id="invoiceCurrency">${currencyOptions()}</select></div><label>Add from Spare Part List</label><div class="row"><input id="spareSearch" placeholder="Search by Material Code or Material Name..." oninput="renderSpareOptions()"><input id="spareQty" class="qty" type="number" min="1" value="1"><button class="act" onclick="addListed()">Add Item</button></div><select id="spareSelect"></select><h3>Custom Spare (if not in list)</h3><div class="row"><input id="customCode" placeholder="Material Code (if known)"><input id="customName" placeholder="Material Name"><input id="customQty" class="qty" type="number" min="1" value="1"><button class="act" onclick="addCustom()">Add Custom</button></div><label>Remarks</label><textarea id="spareRemarks" placeholder="Optional remarks for this spare order" style="min-height:80px"></textarea><h3>Review Items</h3><div class="table-wrap"><table><thead><tr><th>Material Code</th><th>Material Name</th><th>Compatible Model</th><th>Qty</th><th>Action</th></tr></thead><tbody id="cartRows"></tbody></table></div><button onclick="submitOrder()">Submit Order</button> <button class="btn-light" onclick="S.cart=[];drawCart()">Clear All</button><div id="orderMsg" class="msg"></div><h3>My Order History <button class="btn-light" onclick="loadOrders().then(renderOrders)">Refresh</button></h3><div class="table-wrap"><table><thead><tr><th>Spare Order No</th><th>Company Name</th><th>Billing Address</th><th>Country</th><th>Invoice Currency</th><th>Status</th><th>Order File (Admin/Technician)</th><th>Invoice Download</th><th>Payment Receipt</th>${canManageOrders()?'<th>Action</th>':''}</tr></thead><tbody id="orderRows"></tbody></table>${renderPageNote(window.AERONEX_SPARE_ORDER_NOTE)}</div></div>`;renderSpareOptions();drawCart();renderOrders()}
function renderSpareOptions(){let q=($('spareSearch')?.value||'').toLowerCase(),s=$('spareSelect');if(!s)return;s.innerHTML=S.spares.filter(x=>{let f=x.fields||{};return `${f['Material Code']||''} ${f['Material Name']||''} ${f['Compatible Model']||''}`.toLowerCase().includes(q)}).map(x=>{let f=x.fields||{},o={materialCode:f['Material Code']||'',materialName:f['Material Name']||'',compatibleModel:f['Compatible Model']||'',price:f['Price (USD ) Without Tax & Duty']||'',stock:f['Local Stock']||''};return `<option value="${encodeURIComponent(JSON.stringify(o))}">${esc(o.materialCode)} - ${esc(o.materialName)} ${o.compatibleModel?'('+esc(o.compatibleModel)+')':''}</option>`}).join('')}
function addListed(){let v=$('spareSelect').value;if(!v)return msg('orderMsg','Select material first');let o=JSON.parse(decodeURIComponent(v));o.qty=$('spareQty').value||'1';S.cart.push(o);drawCart()}
function addCustom(){let n=$('customName').value.trim();if(!n)return msg('orderMsg','Enter custom material name');S.cart.push({materialCode:$('customCode').value.trim(),materialName:n,compatibleModel:'Custom',price:'-',stock:'-',qty:$('customQty').value||'1'});$('customCode').value='';$('customName').value='';drawCart()}
function drawCart(){let e=$('cartRows');if(!e)return;e.innerHTML=S.cart.map((x,i)=>`<tr><td>${esc(x.materialCode||'CUSTOM')}</td><td>${esc(x.materialName)}</td><td>${esc(x.compatibleModel)}</td><td>${esc(x.qty)}</td><td><button class="btn-danger" onclick="S.cart.splice(${i},1);drawCart()">Remove</button></td></tr>`).join('')}
async function submitOrder(){
  if(!Array.isArray(S.cart) || !S.cart.length) return msg('orderMsg','Add at least one item');
  const remarksEl = $('spareRemarks');
  const p = {
    companyName: uf('Company Name','AERO NEX'),
    contactName: uf('Contact Person',''),
    billingAddress: dealerAddress(),
    invoiceCurrency: selectedInvoiceCurrency(),
    country: selectedCountry(),
    items: S.cart,
    remarks: remarksEl ? remarksEl.value.trim() : ''
  };
  try{
    let r = await api('/api/submit-spare',{method:'POST',body:JSON.stringify(p)});
    S.cart = [];
    msg('orderMsg','Order submitted' + (r.orderNo ? ': ' + r.orderNo : ''));
    await loadOrders();
    renderSpare();
  }catch(e){
    msg('orderMsg', e.message || String(e));
  }
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
    ${isKsaForm?`<div class="grid3"><div><label>Warranty Status</label><select id="rcWarranty"><option>Under Warranty</option><option>Out of Warranty</option><option>Unknown</option></select></div><div><label>GACA Document</label><input id="gacaDocument" type="file"></div><div><label>Log for Drone and RC Link</label><input id="logFileLink" placeholder="Paste log link"></div></div><label>Issue Video and Pictures Link</label><input id="issueMediaLink" placeholder="Paste video/picture link"><label>Issue Description *</label><textarea id="rcDetails"></textarea>`:`<label>Details Of Issue *</label><textarea id="rcDetails"></textarea><div class="grid3"><div><label>Upload all required details link</label><input id="requiredDetailsLink" placeholder="Paste link here"></div><div><label>Log File Link</label><input id="logFileLink" placeholder="Paste log file link here"></div><div><label>Remarks</label><input id="rcRemarks"></div></div>`}
    ${isKsaForm?`<div class="grid3"><div><label>Remarks</label><input id="rcRemarks"></div><div><label>Notes</label><input id="rcNotes"></div><div></div></div>`:`<label>Notes</label><input id="rcNotes">`}
    <button onclick="submitRepair()">Submit Repair Case</button><div id="repairMsg" class="msg"></div>${renderPageNote(window.AERONEX_REPAIR_CASE_NOTE)}</div>`;
  $('rcCountry').value=selectedCountry().includes('KSA')?'KSA - SAUDI ARABIA':'UAE & Other Region';
}
async function submitRepair(){
  for(let id of ['rcAddress','rcCountry','rcModel','rcSerial','rcDate','rcDetails']) {
    if(!$(id).value.trim()) return msg('repairMsg','Please fill required fields');
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
  try{let d=await api('/api/repair-case',{method:'POST',body:JSON.stringify(p)});msg('repairMsg','Repair case created',true);await loadRepairs();renderRepairStatus()}catch(e){msg('repairMsg',e.message)}
}
function renderRepairStatus(){
  $('repairStatus').innerHTML=`<div class="panel"><h2>Repair Status <button class="btn-light" onclick="refreshRepairs()">Refresh</button></h2><div class="table-wrap"><table><thead><tr><th>Repair Case No</th><th>Dealer / Company</th><th>Model No</th><th>Serial No</th><th>Date</th><th>Status</th><th>Log Link</th><th>Issue Media / Required Details</th><th>Remarks</th><th>Notes</th></tr></thead><tbody>${(Array.isArray(S.repairs)?S.repairs:[]).map(r=>{let f=r.fields||{};return `<tr><td>${esc(f['REPAIR CASE']||f['Repair Case']||'')}</td><td>${esc(f['Company Name']||f['Dealer Name']||'')}</td><td>${esc(f['Model No']||'')}</td><td>${esc(f['Serial No']||'')}</td><td>${esc(f['Date of Purchase / Activation date']||f['Date Of Activation']||'')}</td><td>${statusCell(r,'repair')}</td><td>${linkCell(f['Log File']||f['Log for Drone and RC'])}</td><td>${linkCell(f['Upload all the required details']||f['Issue Video and Pictures'])}</td><td>${esc(f['Remarks']||'')}</td><td>${esc(f['Notes']||'')}</td></tr>`}).join('')}</tbody></table></div></div>`;
}
function linkCell(v){if(!v)return '-'; if(typeof v==='object'&&v.link)return `<a href="${esc(v.link)}" target="_blank">Open</a>`; return `<a href="${esc(v)}" target="_blank">Open</a>`;}
function renderDealers(){
  $('dealers').innerHTML=`<div class="panel"><h2>Dealer Details</h2><div id="dealerForm"></div><div class="table-wrap"><table><thead><tr><th>Company Name</th><th>Contact Name</th><th>Contact No</th><th>Contact Email</th><th>Address</th><th>TRN NO</th><th>P O Box</th><th>Country</th><th>Action</th></tr></thead><tbody>${visibleDealers().map((r,i)=>{let f=r.fields||{},phone=(String(f.Remarks||'').match(/(\\+?\\d[\\d\\s-]{7,})/)||[])[1]||'';return `<tr><td>${esc(f['Company Name'])}</td><td>${esc(f['Contact Person'])}</td><td>${esc(phone)}</td><td>${esc(f['Username ( Email )'])}</td><td>${esc(f.Address)}</td><td>${esc(f['TRN NO'])}</td><td>${esc(f['P O Box'])}</td><td>${esc(normalizeCountryValue(f.Country))}</td><td><button onclick="editDealer(${i})">Edit</button></td></tr>`}).join('')}</tbody></table></div></div>`;
}
function editDealer(i){
  const r=S.dealers[i], f=r.fields||{};
  const phone=(String(f.Remarks||'').match(/(\\+?\\d[\\d\\s-]{7,})/)||[])[1]||'';
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
async function loadRepairs(){S.repairs=await api('/api/my-repairs?country='+encodeURIComponent(selectedCountry())+'&role='+encodeURIComponent(S.user.role||''))}
async function initApp(){if(!requireLogin())return;layout();renderDashboard();try{S.spares=await api('/api/spares')}catch{}try{await loadOrders()}catch{}try{await loadRepairs()}catch{}try{S.dealers=await api('/api/dealers')}catch{}try{S.notes=await api('/api/portal-notes')}catch{}renderSpare();renderRepairCreate();renderRepairStatus();renderDealers();renderNotes();renderChangePassword();renderAdmin()}

