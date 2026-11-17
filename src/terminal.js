const apiUrl = 'https://1cav33av9h.execute-api.us-east-1.amazonaws.com';
const domain = 'https://reimage-production-456823161092.auth.us-east-1.amazoncognito.com';
const clientId = '2m6a65dtadb5fmb50hklcvgbns';
const tenant = 'reimage-live';
const money = n => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n/100);
const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let token, pending = sessionStorage.getItem('terminal.pending') ? JSON.parse(sessionStorage.getItem('terminal.pending')) : null;
const products = [{id:'foundation',name:'Foundation',price:99900},{id:'business-hub',name:'Business Hub',price:189900},{id:'operations',name:'Operations',price:249900}];
const b64 = a => btoa(String.fromCharCode(...a)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
async function login(view){
 const verifier=b64(crypto.getRandomValues(new Uint8Array(32))), state=crypto.randomUUID();
 sessionStorage.setItem('terminal.pkce',JSON.stringify({verifier,state,view}));
 const challenge=b64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
 location.assign(`${domain}/oauth2/authorize?`+new URLSearchParams({client_id:clientId,response_type:'code',scope:'openid email profile',redirect_uri:location.origin+'/',state,code_challenge:challenge,code_challenge_method:'S256'}));
}
export async function terminalCallback(){
 const q=new URLSearchParams(location.search), saved=sessionStorage.getItem('terminal.pkce');
 if(!q.has('code')||!saved)return null;
 sessionStorage.removeItem('terminal.pkce');history.replaceState({},'',location.pathname);
 const p=JSON.parse(saved);if(p.state!==q.get('state'))throw Error('Invalid payment sign-in state');
 const r=await fetch(`${domain}/oauth2/token`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,grant_type:'authorization_code',code:q.get('code'),code_verifier:p.verifier,redirect_uri:location.origin+'/'})});
 if(!r.ok)throw Error('Payment sign-in failed. Try again.');
 const t=await r.json(); token={...t,expires:Date.now()+t.expires_in*1000};return p.view;
}
async function access(){
 if(!token)throw Error('Connect your Terminal account first.');
 if(token.expires<Date.now()+60000){
 const r=await fetch(`${domain}/oauth2/token`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,grant_type:'refresh_token',refresh_token:token.refresh_token})});
 if(!r.ok){token=null;throw Error('Payment sign-in expired. Reconnect your Terminal account.');}
 const t=await r.json();token={...t,refresh_token:t.refresh_token||token.refresh_token,expires:Date.now()+t.expires_in*1000};
 }return token.access_token;
}
async function request(path,body){
 const r=await fetch(apiUrl+path,{method:body?'POST':'GET',headers:{authorization:`Bearer ${await access()}`,'x-tenant-id':tenant,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});
 const d=await r.json();if(!r.ok)throw Error((d.code||'Request failed').replaceAll('_',' '));return d;
}
export function clearTerminal(){token=null;}
export async function renderTerminal(view){
 const root=document.getElementById('contentArea');
 root.innerHTML=`<section class="terminal-panel"><h2>${view==='orders'?'Successful orders':'Products & reader checkout'}</h2><p>Live payments · RE IMAGE Business Solutions</p><div id="terminal-body"></div></section>`;
 const body=root.querySelector('#terminal-body');
 if(!token){body.innerHTML='<p>Connect your Terminal account to access live orders and send payments to your reader.</p><button class="btn btn-primary" id="terminal-login">Connect Terminal account</button>';body.querySelector('button').onclick=()=>login(view);return;}
 try{
 if(view==='orders'){
 const rows=(await request(`/v1/admin/tenants/${tenant}/payments`)).filter(p=>p.state==='SUCCEEDED').sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
 body.innerHTML=`<p>${rows.length} successful payments · ${money(rows.reduce((s,p)=>s+p.amount,0))} collected</p><div style="overflow:auto"><table class="terminal-table"><thead><tr><th>Date</th><th>Order</th><th>Paid</th><th>Status</th></tr></thead><tbody>${rows.map(p=>`<tr><td>${esc(new Date(p.createdAt).toLocaleString())}</td><td>${esc(p.orderId)}</td><td>${money(p.amount)}</td><td>Paid${p.orderSynced?'':' · syncing order'}</td></tr>`).join('')||'<tr><td colspan="4">No successful Terminal payments yet.</td></tr>'}</tbody></table></div>`;return;
 }
 if(pending?.paymentId){const prior=await request(`/v1/payment-requests/${pending.paymentId}`);if(['SUCCEEDED','CANCELED','EXPIRED'].includes(prior.state)){pending=null;sessionStorage.removeItem('terminal.pending');}}
 const devices=(await request(`/v1/admin/tenants/${tenant}/devices`)).filter(d=>d.active);
 body.innerHTML=`<p>Keep RE IMAGE Terminal open on the reader-connected phone. The iPad sends the order to that phone.</p><form id="terminal-form"><div class="terminal-products">${products.map(p=>`<label>${esc(p.name)} · ${money(p.price)}<input class="input" type="number" min="0" max="50" step="1" value="0" name="${p.id}" aria-label="${p.name} quantity"></label>`).join('')}</div><p>Enterprise is quote-only. Use the phone’s Custom amount checkout for an approved quote.</p><label>Reader-connected terminal<select class="input" name="device" required>${devices.map(d=>`<option value="${esc(d.id)}">${esc(d.name)} · ${esc(d.locationId)}</option>`).join('')}</select></label><div class="terminal-products"><label>Discount type<select class="input" name="kind"><option value="fixed">Dollar amount</option><option value="percent">Percentage</option></select></label><label>Discount<input class="input" name="discount" inputmode="decimal" value="0"></label></div><h3 id="terminal-total"></h3><button class="btn btn-primary" type="submit" ${devices.length?'':'disabled'}>Send to reader</button><p role="status" id="terminal-status"></p></form>`;
 const form=body.querySelector('form'), status=body.querySelector('#terminal-status');
 function values(){const data=new FormData(form);const items=products.map(p=>({id:p.id,quantity:Number(data.get(p.id))})).filter(p=>p.quantity>0);const subtotal=items.reduce((s,i)=>s+products.find(p=>p.id===i.id).price*i.quantity,0);const raw=String(data.get('discount')).trim();if(!/^\d{1,6}(\.\d{1,2})?$/.test(raw))throw Error('Enter a valid discount.');const kind=data.get('kind'),value=kind==='fixed'?Math.round(Number(raw)*100):Number(raw);if(kind==='percent'&&(!Number.isInteger(value)||value>100))throw Error('Use a whole percentage from 0 to 100.');const discount=kind==='fixed'?value:Math.round(subtotal*value/100);return {items,subtotal,amount:subtotal-discount,discount:value?{kind,value}:undefined,device:devices.find(d=>d.id===data.get('device'))};}
 function preview(){try{const v=values();body.querySelector('#terminal-total').textContent=`Total: ${money(v.amount)} · real charge`;status.textContent='';}catch(e){status.textContent=e.message;}}
 form.oninput=preview;preview();
 if(pending){status.textContent='An earlier checkout is pending. Check Orders or the phone before starting another payment.';form.querySelector('button').disabled=true;}
 form.onsubmit=async e=>{e.preventDefault();if(pending)return;try{const v=values();if(!v.items.length||!v.device||v.amount<50)throw Error('Choose products and a terminal. The final total must be at least $0.50.');if(!confirm(`Send a live ${money(v.amount)} charge to ${v.device.name}?`))return;pending={};sessionStorage.setItem('terminal.pending',JSON.stringify(pending));for(const el of form.elements)el.disabled=true;status.textContent='Sending order…';const order=await request('/v1/demo/orders',{locationId:v.device.locationId,items:v.items,...(v.discount?{discount:v.discount}:{})});pending.orderId=order.id;sessionStorage.setItem('terminal.pending',JSON.stringify(pending));let p=await request('/v1/payment-requests',{orderId:order.id,deviceId:v.device.id,locationId:v.device.locationId,displayAmount:v.amount});pending.paymentId=p.id;sessionStorage.setItem('terminal.pending',JSON.stringify(pending));const deadline=Date.now()+180000;while(!['SUCCEEDED','FAILED','CANCELED','EXPIRED','REQUIRES_RECONCILIATION'].includes(p.state)&&Date.now()<deadline){status.textContent=`${money(p.amount)} · ${p.state.replaceAll('_',' ')}. Follow the reader prompts.`;await new Promise(r=>setTimeout(r,1800));p=await request(`/v1/payment-requests/${p.id}`);}status.textContent=p.state==='SUCCEEDED'?'Payment successful. See Orders for the paid order.':`Payment ${p.state.replaceAll('_',' ')}. Check the phone before retrying.`;if(['SUCCEEDED','CANCELED','EXPIRED'].includes(p.state)){pending=null;sessionStorage.removeItem('terminal.pending');}}catch(e){status.textContent=`${e.message}${pending?' Check the phone and Orders before retrying.':''}`;}};
 }catch(e){body.textContent=e.message;}
}
