const H = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type,x-user-role,x-user-email"
};
const json = (d,s=200)=>new Response(JSON.stringify(d),{status:s,headers:H});
const norm = v => String(v ?? "").trim();
const lower = v => norm(v).toLowerCase();

async function readBody(req){ try{return await req.json()}catch{return {}} }

function fieldText(v){
  if(Array.isArray(v)) return v.map(fieldText).filter(Boolean).join(", ");
  if(typeof v==="object" && v) return norm(v.text || v.name || v.value || v.link || "");
  return norm(v);
}
function first(f,names){
  for(const n of names){
    if(f && f[n] !== undefined && f[n] !== null && fieldText(f[n]) !== "") return f[n];
  }
  return "";
}
function userEmail(f){ return lower(fieldText(first(f,["Username ( Email )","Username (Email)","Username","Email","Contact Email","Login Email"]))); }
function userPass(f){ return norm(fieldText(first(f,["Reset Password","Password","Temp Password","Temporary Password","Login Password"]))); }
function userRole(f){ return fieldText(first(f,["User Role","Role","User Type"])); }
function userCompany(f){ return fieldText(first(f,["Company Name","Dealer / Company","Company"])); }
function userContact(f){ return fieldText(first(f,["Contact Person","Contact Name","Name"])); }
function userCountry(f){ return fieldText(first(f,["Country","Region"])); }

function publicUser(r){
  const f=r.fields||{};
  return {record_id:r.record_id,email:userEmail(f),username:userEmail(f),companyName:userCompany(f),contactName:userContact(f),role:userRole(f),country:userCountry(f),fields:f};
}

async function larkToken(env){
  const res=await fetch("https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal",{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({app_id:env.LARK_APP_ID,app_secret:env.LARK_APP_SECRET})
  });
  const data=await res.json();
  if(!data.tenant_access_token) throw new Error("Lark token error: "+JSON.stringify(data));
  return data.tenant_access_token;
}
async function lf(env,path,opt={}){
  const t=await larkToken(env);
  const res=await fetch("https://open.larksuite.com/open-apis"+path,{
    ...opt,
    headers:{authorization:`Bearer ${t}`,"content-type":"application/json; charset=utf-8",...(opt.headers||{})}
  });
  const data=await res.json().catch(()=>({}));
  if(!res.ok || data.code) throw new Error("Lark API error: "+JSON.stringify(data));
  return data;
}
async function list(env,table){
  let out=[],pt="";
  do{
    const qs=new URLSearchParams({page_size:"500"});
    if(pt) qs.set("page_token",pt);
    const d=await lf(env,`/bitable/v1/apps/${env.LARK_BASE_TOKEN}/tables/${table}/records?${qs}`);
    out.push(...(d.data?.items||[]));
    pt=d.data?.page_token||"";
  }while(pt);
  return out;
}
async function types(env,table){
  const d=await lf(env,`/bitable/v1/apps/${env.LARK_BASE_TOKEN}/tables/${table}/fields`);
  const o={}; for(const f of d.data?.items||[]) o[f.field_name]=f.type; return o;
}
async function create(env,table,fields){
  return lf(env,`/bitable/v1/apps/${env.LARK_BASE_TOKEN}/tables/${table}/records`,{method:"POST",body:JSON.stringify({fields})});
}
async function update(env,table,id,fields){
  return lf(env,`/bitable/v1/apps/${env.LARK_BASE_TOKEN}/tables/${table}/records/${id}`,{method:"PUT",body:JSON.stringify({fields})});
}
async function del(env,table,id){
  return lf(env,`/bitable/v1/apps/${env.LARK_BASE_TOKEN}/tables/${table}/records/${id}`,{method:"DELETE"});
}
function larkUrl(url,text){return {link:url,text:text||url};}
function b64(dataUrl){
  const s=String(dataUrl||"").includes(",")?String(dataUrl).split(",").pop():String(dataUrl||"");
  const bin=atob(s); const a=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) a[i]=bin.charCodeAt(i);
  return a;
}
async function putR2(env,key,bytes,ct){
  await env.R2.put(key,bytes,{httpMetadata:{contentType:ct||"application/octet-stream"}});
  return `${String(env.R2_PUBLIC_URL||"").replace(/\/+$/,"")}/${key}`;
}
function tableFor(env,c){return lower(c).includes("ksa")?env.SPARE_ORDER_KSA_TABLE_ID:env.SPARE_ORDER_UAE_TABLE_ID;}
function orderNo(f){return norm(f["Spare Order No"]||f["Spare Order Case"]);}
function orderFileUrl(env,r){
  const f=r.fields||{}; const m=String((f.Remarks||"")+"\n"+(f.Notes||"")).match(/Order File URL:\s*(https?:\/\/\S+)/i);
  if(m) return m[1];
  const no=orderNo(f);
  return no ? `${String(env.R2_PUBLIC_URL||"").replace(/\/+$/,"")}/aeronex-orders/${no}/order.xls` : "";
}
function withMeta(env,table,r){return {...r,_table_id:table,r2OrderFileUrl:orderFileUrl(env,r)};}
function excelBytes(orderNo,fields,items){
  const rows=[["Spare Order No",orderNo],["Company Name",fields["Company Name"]||""],["Contact Name",fields["Contact Name"]||""],["Billing Address",fields["Billing Address"]||fields["Invoice Address"]||""],["Country",fields.Country||""],["Invoice Currency",fields["Invoice Currency"]||""],[],["Material Code","Material Name","Compatible Model","Qty"],...(items||[]).map(i=>[i.materialCode||i["Material Code"]||"",i.materialName||i["Material Name"]||"",i.compatibleModel||i["Compatible Model"]||"",i.qty||i.Qty||1])];
  const csv=rows.map(r=>r.map(c=>`"${String(c??"").replace(/"/g,'""')}"`).join(",")).join("\r\n");
  return new TextEncoder().encode(csv);
}

async function handle(req,env){
  if(req.method==="OPTIONS") return new Response(null,{status:204,headers:H});
  const url=new URL(req.url), p=url.pathname;
  if(p==="/api/health") return json({ok:true,cloudflare_pages_functions:true});
  if(p==="/api/debug-env") return json({ok:true,has:{
    LARK_APP_ID:!!env.LARK_APP_ID,LARK_APP_SECRET:!!env.LARK_APP_SECRET,LARK_BASE_TOKEN:!!env.LARK_BASE_TOKEN,
    USER_TABLE_ID:!!env.USER_TABLE_ID,SPARE_LIST_TABLE_ID:!!env.SPARE_LIST_TABLE_ID,
    SPARE_ORDER_UAE_TABLE_ID:!!env.SPARE_ORDER_UAE_TABLE_ID,SPARE_ORDER_KSA_TABLE_ID:!!env.SPARE_ORDER_KSA_TABLE_ID,
    R2_PUBLIC_URL:!!env.R2_PUBLIC_URL,R2:!!env.R2
  }});
  if(p==="/api/login" && req.method==="POST"){
    const b=await readBody(req);
    const email=lower(b.username||b.email), pass=norm(b.password);
    const users=await list(env,env.USER_TABLE_ID);
    const rec=users.find(r=>userEmail(r.fields||{})===email);
    if(!rec) return json({error:"Invalid login: email not found"},401);
    if(userPass(rec.fields||{})!==pass) return json({error:"Invalid login: password mismatch"},401);
    return json({ok:true,user:publicUser(rec)});
  }
  if(p==="/api/users") return json({ok:true,users:(await list(env,env.USER_TABLE_ID)).map(publicUser)});
  if(p==="/api/dealers") return json({ok:true,dealers:await list(env,env.USER_TABLE_ID)});
  if(p==="/api/spare-list") return json({ok:true,items:await list(env,env.SPARE_LIST_TABLE_ID)});
  if(p==="/api/my-orders"){
    const email=lower(url.searchParams.get("email")), role=lower(url.searchParams.get("role"));
    const admin=role.includes("admin")||role.includes("technician")||role.includes("tech");
    let rows=[...(await list(env,env.SPARE_ORDER_UAE_TABLE_ID)).map(r=>withMeta(env,env.SPARE_ORDER_UAE_TABLE_ID,r)),...(await list(env,env.SPARE_ORDER_KSA_TABLE_ID)).map(r=>withMeta(env,env.SPARE_ORDER_KSA_TABLE_ID,r))];
    if(!admin && email) rows=rows.filter(r=>lower(r.fields?.["Contact Email"]||r.fields?.["Username ( Email )"])===email);
    return json({ok:true,orders:rows});
  }
  if(p==="/api/submit-spare" && req.method==="POST"){
    const b=await readBody(req), country=norm(b.country||"UAE & Other Region"), table=tableFor(env,country), items=b.items||b.cart||[];
    const prefix=lower(country).includes("ksa")?"KSA":"UAE"; const no=`${prefix}ASPARE${new Date().toISOString().replace(/\D/g,"").slice(0,14)}`;
    const fields={"Company Name":b.companyName||"","Contact Name":b.contactName||"","Billing Address":b.billingAddress||b.invoiceAddress||"","Invoice Address":b.billingAddress||b.invoiceAddress||"","Country":country,"Invoice Currency":b.invoiceCurrency||"USD","Status":"Submitted","Material Name":items.map(i=>i.materialName||i["Material Name"]||"").filter(Boolean).join(", "),"Material Code":items.map(i=>i.materialCode||i["Material Code"]||"").filter(Boolean).join(", "),"Qty":items.map(i=>i.qty||i.Qty||1).join(", "),"Notes":b.notes||"","Remarks":b.remarks||""};
    const fileUrl=await putR2(env,`aeronex-orders/${no}/order.xls`,excelBytes(no,fields,items),"application/vnd.ms-excel");
    fields.Remarks=fields.Remarks?`${fields.Remarks}\nOrder File URL: ${fileUrl}`:`Order File URL: ${fileUrl}`;
    const t=await types(env,table), finalFields={}; for(const [k,v] of Object.entries(fields)) if(t[k]) finalFields[k]=v;
    const r=await create(env,table,finalFields); return json({ok:true,orderNo:no,r2ExcelUrl:fileUrl,r2OrderFileUrl:fileUrl,result:r.data});
  }
  if(p==="/api/upload-invoice" && req.method==="POST"){
    const b=await readBody(req), no=norm(b.orderNo); if(!no) return json({error:"Missing orderNo"},400);
    const name=b.file?.name||"invoice.pdf", ext=name.includes(".")?name.split(".").pop():"pdf";
    const fileUrl=await putR2(env,`aeronex-orders/${no}/invoice.${ext}`,b64(b.file?.data),b.file?.type||"application/pdf");
    if(b.record_id&&b.tableId){const t=await types(env,b.tableId); await update(env,b.tableId,b.record_id,{"Invoice Download":t["Invoice Download"]===15?larkUrl(fileUrl,"Invoice Download"):fileUrl});}
    return json({ok:true,url:fileUrl});
  }
  if(p==="/api/upload-payment-receipt" && req.method==="POST"){
    const b=await readBody(req), no=norm(b.orderNo); if(!no) return json({error:"Missing orderNo"},400);
    const name=b.file?.name||"payment-receipt.pdf", ext=name.includes(".")?name.split(".").pop():"pdf";
    const fileUrl=await putR2(env,`aeronex-orders/${no}/payment-receipt.${ext}`,b64(b.file?.data),b.file?.type||"application/pdf");
    if(b.record_id&&b.tableId){const t=await types(env,b.tableId); await update(env,b.tableId,b.record_id,{"Payment Receipt":t["Payment Receipt"]===15?larkUrl(fileUrl,"Payment Receipt"):fileUrl});}
    return json({ok:true,url:fileUrl});
  }
  if(p==="/api/update-status" && req.method==="POST"){const b=await readBody(req); await update(env,b.tableId,b.record_id,{Status:b.status}); return json({ok:true});}
  if(p==="/api/delete-order" && req.method==="POST"){const b=await readBody(req); await del(env,b.tableId,b.record_id); return json({ok:true});}
  if(p==="/api/portal-notes") return json({ok:true,notes:await list(env,env.PORTAL_NOTES_TABLE_ID)});
  return json({error:"API not found",path:p},404);
}
export async function onRequest(context){
  try{return await handle(context.request,context.env)}
  catch(e){return json({error:e.message||String(e)},500)}
}
