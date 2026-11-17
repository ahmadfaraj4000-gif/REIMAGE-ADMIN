const apiUrl = 'https://1cav33av9h.execute-api.us-east-1.amazonaws.com';
const domain = 'https://reimage-production-456823161092.auth.us-east-1.amazoncognito.com';
const clientId = '2m6a65dtadb5fmb50hklcvgbns';
const tenant = 'reimage-live';
const money = n => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n/100);
const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let token = JSON.parse(sessionStorage.getItem('terminal.auth') || 'null'), refreshing, pending = sessionStorage.getItem('terminal.pending') ? JSON.parse(sessionStorage.getItem('terminal.pending')) : null;
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
 const t=await r.json(); token={...t,expires:Date.now()+t.expires_in*1000};sessionStorage.setItem('terminal.auth',JSON.stringify(token));return p.view;
}
async function access(){
 if(!token)throw Error('Connect your Terminal account first.');
 if(token.expires<Date.now()+60000){
  if(!refreshing)refreshing=(async()=>{
   const r=await fetch(`${domain}/oauth2/token`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,grant_type:'refresh_token',refresh_token:token.refresh_token})});
   if(!r.ok){token=null;sessionStorage.removeItem('terminal.auth');throw Error('Payment sign-in expired. Reconnect your Terminal account.');}
   const t=await r.json();token={...t,refresh_token:t.refresh_token||token.refresh_token,expires:Date.now()+t.expires_in*1000};sessionStorage.setItem('terminal.auth',JSON.stringify(token));
  })().finally(()=>{refreshing=null});
  await refreshing;
 }return token.access_token;
}
async function request(path,body){
 const r=await fetch(apiUrl+path,{method:body?'POST':'GET',headers:{authorization:`Bearer ${await access()}`,'x-tenant-id':tenant,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});
 const d=await r.json();if(!r.ok)throw Error((d.code||'Request failed').replaceAll('_',' '));return d;
}
export function clearTerminal(){token=null;sessionStorage.removeItem('terminal.auth');}
export async function renderTerminal(view){
 const root=document.getElementById('contentArea');
 root.innerHTML=`<section class="terminal-panel">${view==='orders'?'<h2>Successful orders</h2><p>Live payments · RE IMAGE Business Solutions</p>':''}<div id="terminal-body"></div></section>`;
 const body=root.querySelector('#terminal-body');
 if(!token){body.innerHTML='<p>Connect your Terminal account to access live orders and send payments to your reader.</p><button class="btn btn-primary" id="terminal-login">Connect Terminal account</button>';body.querySelector('button').onclick=()=>login(view);return;}
 try{
 if(view==='orders'){
 const rows=(await request(`/v1/admin/tenants/${tenant}/payments`)).filter(p=>p.state==='SUCCEEDED').sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
 body.innerHTML=`<p>${rows.length} successful payments · ${money(rows.reduce((s,p)=>s+p.amount,0))} collected</p><div style="overflow:auto"><table class="terminal-table"><thead><tr><th>Date</th><th>Order</th><th>Paid</th><th>Status</th></tr></thead><tbody>${rows.map(p=>`<tr><td>${esc(new Date(p.createdAt).toLocaleString())}</td><td>${esc(p.orderId)}</td><td>${money(p.amount)}</td><td>Paid${p.orderSynced?'':' · syncing order'}</td></tr>`).join('')||'<tr><td colspan="4">No successful Terminal payments yet.</td></tr>'}</tbody></table></div>`;return;
 }
 let waiting;
 if(pending){
   if(pending.paymentId)waiting=await request(`/v1/payment-requests/${pending.paymentId}`);
   else if(pending.orderId)waiting=(await request(`/v1/admin/tenants/${tenant}/payments`)).find(p=>p.orderId===pending.orderId);
   if((!pending.orderId&&!pending.paymentId)||(waiting&&['SUCCEEDED','CANCELED','EXPIRED'].includes(waiting.state))){pending=null;sessionStorage.removeItem('terminal.pending');}
   else if(waiting){pending.paymentId=waiting.id;sessionStorage.setItem('terminal.pending',JSON.stringify(pending));}
 }
 const devices=(await request(`/v1/admin/tenants/${tenant}/devices`)).filter(d=>d.active);
 body.innerHTML=`<form id="terminal-form" class="pos-layout"><div class="pos-menu"><div class="pos-heading"><div><span class="pos-eyebrow">RE IMAGE / POINT OF SALE</span><h2>New sale</h2><p>Tap a product to add it to the cart.</p></div><span class="pos-live">● Live</span></div><div class="pos-category">Business systems <span>3 products</span></div><div class="pos-grid">${products.map((p,i)=>`<button type="button" class="pos-product pos-product-${i}" data-add="${p.id}"><span class="pos-product-name">${esc(p.name)}</span><span class="pos-product-description">${['Your business online','Bookings, orders & payments','Portals & connected workflows'][i]}</span><span class="pos-product-bottom"><strong>${money(p.price)}</strong><span class="pos-add" aria-hidden="true"></span></span><span class="pos-product-meta">One-time setup</span></button>`).join('')}</div><div class="pos-quote"><span>Enterprise</span><p>Custom scope, custom quote. Collect approved quotes through Custom amount on your phone.</p><span class="pos-quote-tag">By quote</span></div><div class="pos-help">Keep the reader-connected phone open in RE IMAGE Terminal.</div></div><aside class="pos-cart"><div class="pos-cart-heading"><h2>Current order <span id="pos-count">0</span></h2><button type="button" class="pos-clear" id="pos-clear">Clear</button></div>${products.map(p=>`<input type="hidden" name="${p.id}" value="0">`).join('')}<div id="pos-lines" class="pos-lines"></div><div class="pos-cart-footer"><details class="pos-discount"><summary>Add discount</summary><div class="pos-discount-fields"><select name="kind" aria-label="Discount type"><option value="fixed">Amount ($)</option><option value="percent">Percent (%)</option></select><input name="discount" inputmode="decimal" value="0" aria-label="Discount value"></div></details><div class="pos-summary"><div><span>Subtotal</span><span id="pos-subtotal">$0.00</span></div><div id="pos-discount-row" hidden><span>Discount</span><span id="pos-discount-value"></span></div><div class="pos-total"><span>Total</span><strong id="terminal-total">$0.00</strong></div></div><label class="pos-terminal-label">Send payment to<select name="device" required aria-label="Reader-connected terminal">${devices.map(d=>`<option value="${esc(d.id)}">${esc(d.name)} · ${esc(d.locationId)}</option>`).join('')||'<option value="">No approved terminal</option>'}</select></label><button class="pos-charge" id="pos-charge" type="submit" disabled>Charge <span id="pos-charge-total">$0.00</span><span>→</span></button><p class="pos-charge-note">Real payment · Customer taps or inserts at reader</p><p role="status" id="terminal-status"></p><button type="button" class="pos-clear" id="pos-new" hidden>Start new sale</button></div></aside></form>`;
 const form=body.querySelector('form'), status=body.querySelector('#terminal-status');
 function values(){const data=new FormData(form);const items=products.map(p=>({id:p.id,quantity:Number(data.get(p.id))})).filter(p=>p.quantity>0);const subtotal=items.reduce((s,i)=>s+products.find(p=>p.id===i.id).price*i.quantity,0);const raw=String(data.get('discount')).trim();if(!/^\d{1,6}(\.\d{1,2})?$/.test(raw))throw Error('Enter a valid discount.');const kind=data.get('kind'),value=kind==='fixed'?Math.round(Number(raw)*100):Number(raw);if(kind==='percent'&&(!Number.isInteger(value)||value>100))throw Error('Use a whole percentage from 0 to 100.');const discount=kind==='fixed'?value:Math.round(subtotal*value/100);return {items,subtotal,amount:subtotal-discount,discount:value?{kind,value}:undefined,device:devices.find(d=>d.id===data.get('device'))};}
 let locked=false;
 function preview(){
  const items=products.map(p=>({...p,quantity:Number(form.elements.namedItem(p.id).value)})).filter(p=>p.quantity>0);
  body.querySelector('#pos-count').textContent=items.reduce((n,p)=>n+p.quantity,0);
  body.querySelector('#pos-lines').innerHTML=items.length?items.map(p=>`<div class="pos-line"><div class="pos-line-top"><strong>${esc(p.name)}</strong><strong>${money(p.price*p.quantity)}</strong></div><div class="pos-line-bottom"><span>${money(p.price)} each</span><div class="pos-stepper"><button type="button" data-step="${p.id}" data-delta="-1" aria-label="Remove one ${p.name}" ${locked?'disabled':''}><span class="pos-minus-mark" aria-hidden="true"></span></button><span>${p.quantity}</span><button type="button" data-step="${p.id}" data-delta="1" aria-label="Add one ${p.name}" ${locked||p.quantity>=50?'disabled':''}><span class="pos-plus-mark" aria-hidden="true"></span></button></div></div></div>`).join(''):'<div class="pos-empty"><h3>Your cart is empty</h3><p>Choose a product to start a sale.</p></div>';
  body.querySelectorAll('[data-add]').forEach(b=>{b.disabled=locked||Number(form.elements.namedItem(b.dataset.add).value)>=50;b.classList.toggle('is-added',Number(form.elements.namedItem(b.dataset.add).value)>0);});
  try{const v=values();body.querySelector('#terminal-total').textContent=money(v.amount);body.querySelector('#pos-charge-total').textContent=money(v.amount);body.querySelector('#pos-subtotal').textContent=money(v.subtotal);body.querySelector('#pos-discount-row').hidden=!v.discount;body.querySelector('#pos-discount-value').textContent='−'+money(v.subtotal-v.amount);body.querySelector('#pos-charge').disabled=locked||!!pending||!v.items.length||!v.device||v.amount<50;if(!locked&&!pending)status.textContent=v.items.length&&v.amount<50?'Discount must leave at least $0.50 to charge.':'';}catch(e){status.textContent=e.message;body.querySelector('#pos-charge').disabled=true;}
 }
 form.oninput=preview;
 form.addEventListener('click',e=>{if(locked)return;const add=e.target.closest('[data-add]'),step=e.target.closest('[data-step]');if(add||step){const id=add?add.dataset.add:step.dataset.step;const input=form.elements.namedItem(id);input.value=Math.max(0,Math.min(50,Number(input.value)+(add?1:Number(step.dataset.delta))));preview();}if(e.target.closest('#pos-clear')){products.forEach(p=>form.elements.namedItem(p.id).value=0);form.elements.namedItem('discount').value='0';preview();}});
 body.querySelector('#pos-new').onclick=()=>renderTerminal('products');
 preview();
 if(pending){status.textContent=waiting ? `${money(waiting.amount)} is ${waiting.state.toLowerCase().replaceAll('_',' ')} on the reader. Finish or cancel it on the phone before sending another charge.` : 'Checking an earlier order. No second payment will be sent.';body.querySelector('#pos-charge').disabled=true;const check=document.createElement('button');check.type='button';check.className='pos-clear';check.textContent='Check payment status';check.onclick=()=>renderTerminal('products');status.after(check);}
 form.onsubmit=async e=>{e.preventDefault();if(pending)return;try{const v=values();if(!v.items.length||!v.device||v.amount<50)throw Error('Choose products and a terminal. The final total must be at least $0.50.');if(!confirm(`Send a live ${money(v.amount)} charge to ${v.device.name}?`))return;locked=true;pending={};sessionStorage.setItem('terminal.pending',JSON.stringify(pending));for(const el of form.elements)el.disabled=true;status.textContent='Sending order…';const order=await request('/v1/demo/orders',{locationId:v.device.locationId,items:v.items,...(v.discount?{discount:v.discount}:{})});pending.orderId=order.id;sessionStorage.setItem('terminal.pending',JSON.stringify(pending));let p=await request('/v1/payment-requests',{orderId:order.id,deviceId:v.device.id,locationId:v.device.locationId,displayAmount:v.amount});pending.paymentId=p.id;sessionStorage.setItem('terminal.pending',JSON.stringify(pending));const deadline=Date.now()+180000;while(!['SUCCEEDED','FAILED','CANCELED','EXPIRED','REQUIRES_RECONCILIATION'].includes(p.state)&&Date.now()<deadline){status.textContent=`${money(p.amount)} · ${p.state.replaceAll('_',' ')}. Follow the reader prompts.`;await new Promise(r=>setTimeout(r,1800));p=await request(`/v1/payment-requests/${p.id}`);}status.textContent=p.state==='SUCCEEDED'?'Payment successful. See Orders for the paid order.':`Payment ${p.state.replaceAll('_',' ')}. Check the phone before retrying.`;if(['SUCCEEDED','CANCELED','EXPIRED'].includes(p.state)){pending=null;sessionStorage.removeItem('terminal.pending');body.querySelector('#pos-new').hidden=false;body.querySelector('#pos-new').disabled=false;}}catch(e){status.textContent=`${e.message}${pending?' Check the phone and Orders before retrying.':''}`;}};
 }catch(e){body.textContent=e.message;}
}
