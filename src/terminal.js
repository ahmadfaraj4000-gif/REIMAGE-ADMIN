import { createProject, openProjects } from './contract-projects.js';
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
export async function renderTerminal(view, client){
 const root=document.getElementById('contentArea');
 root.innerHTML=`<section class="terminal-panel ${view==='orders'?'orders-panel':''}">${view==='orders'?'<header class="orders-heading"><span class="pos-eyebrow">PAYMENT HISTORY</span><h2>Successful orders</h2><p>Live payments · RE IMAGE Business Solutions</p></header>':''}<div id="terminal-body"></div></section>`;
 if (view === 'orders') {
   const projects = document.createElement('button');
   projects.className = 'btn btn-light';
   projects.textContent = 'Project orders';
   projects.onclick = () => openProjects(client);
   root.querySelector('.orders-heading').append(projects);
 }
 const body=root.querySelector('#terminal-body');
 if(!token){body.innerHTML='<p>Connect your Terminal account to access live orders and send payments to your reader.</p><button class="btn btn-primary" id="terminal-login">Connect Terminal account</button>';body.querySelector('button').onclick=()=>login(view);return;}
 try{
 if(view==='orders'){
 const rows=(await request(`/v1/admin/tenants/${tenant}/payments`)).filter(p=>p.state==='SUCCEEDED').sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
 body.innerHTML=`<div class="orders-summary"><div><span>Successful payments</span><strong>${rows.length}</strong></div><div><span>Total collected</span><strong>${money(rows.reduce((s,p)=>s+p.amount,0))}</strong></div></div><div class="orders-table-wrap" tabindex="0" role="region" aria-label="Successful payments table"><table class="terminal-table"><thead><tr><th>Date</th><th>Order</th><th>Paid</th><th>Method</th><th>Received</th><th>Change</th><th>Status</th></tr></thead><tbody>${rows.map(p=>`<tr><td>${esc(new Date(p.createdAt).toLocaleString())}</td><td>${esc(p.orderId)}</td><td>${money(p.amount)}</td><td>${p.paymentMethod==='cash'?'Cash':'Card'}</td><td>${p.paymentMethod==='cash'?money(p.cashReceived):'—'}</td><td>${p.paymentMethod==='cash'?money(p.changeDue):'—'}</td><td>Paid${p.orderSynced?'':' · syncing order'}</td></tr>`).join('')||'<tr class="orders-empty"><td colspan="7"><h3>No successful payments yet</h3><p>Completed card payments and confirmed cash sales will appear here.</p></td></tr>'}</tbody></table></div>`;return;
 }
 let waiting;
 if(pending){
   if(pending.paymentId)waiting=await request(`/v1/payment-requests/${pending.paymentId}`);
   else if(pending.orderId)waiting=(await request(`/v1/admin/tenants/${tenant}/payments`)).find(p=>p.orderId===pending.orderId);
   if((!pending.orderId&&!pending.paymentId)||(waiting&&['SUCCEEDED','CANCELED','EXPIRED'].includes(waiting.state))){pending=null;sessionStorage.removeItem('terminal.pending');}
   else if(waiting){pending.paymentId=waiting.id;sessionStorage.setItem('terminal.pending',JSON.stringify(pending));}
 }
 const business=await request('/v1/tenants/current');
 const devices=(await request(`/v1/admin/tenants/${tenant}/devices`)).filter(d=>d.active);
 body.innerHTML=`<form id="terminal-form" class="pos-layout"><div class="pos-menu"><div class="pos-heading"><div><span class="pos-eyebrow">RE IMAGE / POINT OF SALE</span><h2>New sale</h2><p>Tap a product to add it to the cart.</p></div><span class="pos-live">● Live</span></div><div class="pos-modes"><button type="button" id="pos-products-mode" aria-pressed="true">Products</button><button type="button" id="pos-custom-mode" aria-pressed="false">Custom amount</button></div><div id="pos-custom" hidden><label>Amount (USD)<input name="customAmount" inputmode="numeric" value="0.00" placeholder="0.00" aria-label="Custom amount in dollars"></label><p>Enter the final amount to collect. Minimum $0.50.</p></div><div class="pos-category">Business systems <span>3 products</span></div><div class="pos-grid">${products.map((p,i)=>`<button type="button" class="pos-product pos-product-${i}" data-add="${p.id}"><span class="pos-product-name">${esc(p.name)}</span><span class="pos-product-description">${['Your business online','Bookings, orders & payments','Portals & connected workflows'][i]}</span><span class="pos-product-bottom"><strong>${money(p.price)}</strong><span class="pos-add" aria-hidden="true"></span></span><span class="pos-product-meta">One-time setup</span></button>`).join('')}</div><div class="pos-quote"><span>Enterprise</span><p>Custom scope, custom quote. Choose Custom amount above to collect an approved quote.</p><span class="pos-quote-tag">By quote</span></div><div class="pos-help">Keep the reader-connected phone open in RE IMAGE Terminal.</div></div><aside class="pos-cart"><div class="pos-cart-heading"><h2>Current order <span id="pos-count">0</span></h2><button type="button" class="pos-clear" id="pos-clear">Clear</button></div>${products.map(p=>`<input type="hidden" name="${p.id}" value="0">`).join('')}<div id="pos-lines" class="pos-lines"></div><div class="pos-cart-footer"><details class="pos-discount"><summary>Add discount</summary><div class="pos-discount-fields"><select name="kind" aria-label="Discount type"><option value="fixed">Amount ($)</option><option value="percent">Percent (%)</option></select><input name="discount" inputmode="numeric" value="0.00" aria-label="Discount value"></div></details><div class="pos-summary"><div><span>Subtotal</span><span id="pos-subtotal">$0.00</span></div><div id="pos-discount-row" hidden><span>Discount</span><span id="pos-discount-value"></span></div><div class="pos-total"><span>Total</span><strong id="terminal-total">$0.00</strong></div></div><button class="btn btn-light" id="pos-project" type="button">Create project from cart</button><div class="pos-modes" aria-label="Payment method"><button type="button" id="pos-card-method" aria-pressed="true">Card reader</button><button type="button" id="pos-cash-method" aria-pressed="false">Cash</button></div><div id="pos-cash-fields" hidden><label class="pos-terminal-label">Location<select name="cashLocation">${business.locations.map(l=>`<option value="${esc(l.id)}">${esc(l.name)}</option>`).join('')}</select></label><label class="pos-terminal-label">Cash received ($)<input name="cashReceived" inputmode="numeric" value="0.00" autocomplete="off"></label><div class="pos-cash-change"><span id="pos-change-label">Change due</span><strong id="pos-change">$0.00</strong></div><p>Count the cash, then confirm receipt to record this sale.</p><div id="pos-cash-review" hidden></div><button type="button" class="pos-charge" id="pos-cash-confirm" hidden>Confirm cash received</button><button type="button" class="pos-clear" id="pos-cash-back" hidden>Back to edit</button></div><label class="pos-terminal-label" id="pos-reader-field">Send payment to<select name="device" required aria-label="Reader-connected terminal">${devices.map(d=>`<option value="${esc(d.id)}">${esc(d.name)} · ${esc(d.locationId)}</option>`).join('')||'<option value="">No approved terminal</option>'}</select></label><button class="pos-charge" id="pos-charge" type="submit" disabled>Charge <span id="pos-charge-total">$0.00</span><span>→</span></button><p class="pos-charge-note">Real payment · Customer taps or inserts at reader</p><p role="status" id="terminal-status"></p><button type="button" class="pos-cancel" id="pos-cancel" hidden>Cancel payment</button><button type="button" class="pos-clear" id="pos-new" hidden>Start new sale</button></div></aside></form>`;
 const form=body.querySelector('form'), status=body.querySelector('#terminal-status');
 let customMode=false, cashMode=false, cashReview=false, reviewedCash;
 let cashAttempt=JSON.parse(sessionStorage.getItem('terminal.cashAttempt')||'null');
 const cashFields=body.querySelector('#pos-cash-fields'), cashConfirm=body.querySelector('#pos-cash-confirm'), cashBack=body.querySelector('#pos-cash-back');
 function cashPreview(amount){
   const received=Math.round(Number(form.elements.namedItem('cashReceived').value)*100);
   body.querySelector('#pos-change-label').textContent=received<amount?'Still due':'Change due';
   body.querySelector('#pos-change').textContent=money(Math.abs(received-amount));
   return received;
 }
 function method(cash){if(locked||cashReview)return;cashMode=cash;body.querySelector('.pos-help').textContent=cash?'Cash sales are saved to Orders after you confirm receipt.':'Keep the reader-connected phone open in RE IMAGE Terminal.';cashFields.hidden=!cash;body.querySelector('#pos-reader-field').hidden=cash;form.elements.namedItem('device').required=!cash;body.querySelector('#pos-card-method').setAttribute('aria-pressed',String(!cash));body.querySelector('#pos-cash-method').setAttribute('aria-pressed',String(cash));body.querySelector('.pos-charge-note').textContent=cash?'Cash sale · Recorded after confirmation':'Real payment · Customer taps or inserts at reader';body.querySelector('#pos-charge').innerHTML=(cash?'Review cash payment':'Charge <span id="pos-charge-total">$0.00</span><span>→</span>');preview();}
 body.querySelector('#pos-card-method').onclick=()=>method(false);body.querySelector('#pos-cash-method').onclick=()=>method(true);
 cashBack.onclick=()=>{if(cashAttempt)return;cashReview=false;locked=false;for(const el of form.elements)el.disabled=false;cashConfirm.hidden=true;cashBack.hidden=true;body.querySelector('#pos-cash-review').hidden=true;body.querySelector('#pos-charge').hidden=false;preview();};
 cashConfirm.onclick=async()=>{
   if(cashConfirm.disabled)return;
   if(!cashAttempt){cashAttempt=reviewedCash;sessionStorage.setItem('terminal.cashAttempt',JSON.stringify(cashAttempt));}
   cashConfirm.disabled=true;cashBack.hidden=true;status.textContent='Recording cash payment…';
   try{const sale=await request('/v1/cash-sales',cashAttempt);sessionStorage.removeItem('terminal.cashAttempt');cashAttempt=null;cashConfirm.hidden=true;status.textContent=`Cash payment recorded: ${money(sale.amount)}. Give ${money(sale.changeDue)} change. See Orders.`;body.querySelector('#pos-new').hidden=false;body.querySelector('#pos-new').disabled=false;}catch(error){status.textContent=`${error.message}. Retry confirmation to safely check and record this same sale.`;cashConfirm.textContent='Retry cash confirmation';cashConfirm.disabled=false;}
 };


 function values(){const data=new FormData(form);if(customMode){const raw=String(data.get('customAmount')).trim();if(!/^\d{1,6}(\.\d{0,2})?$/.test(raw))throw Error('Enter a valid dollar amount.');const amount=Math.round(Number(raw)*100);if(amount<50||amount>99999999)throw Error('Enter $0.50–$999,999.99.');return {items:[],subtotal:amount,amount,customAmount:amount,device:devices.find(d=>d.id===data.get('device'))};}const items=products.map(p=>({id:p.id,quantity:Number(data.get(p.id))})).filter(p=>p.quantity>0);const subtotal=items.reduce((s,i)=>s+products.find(p=>p.id===i.id).price*i.quantity,0);const raw=String(data.get('discount')).trim();if(!/^\d{1,6}(\.\d{1,2})?$/.test(raw))throw Error('Enter a valid discount.');const kind=data.get('kind'),value=kind==='fixed'?Math.round(Number(raw)*100):Number(raw);if(kind==='percent'&&(!Number.isInteger(value)||value>100))throw Error('Use a whole percentage from 0 to 100.');const discount=kind==='fixed'?value:Math.round(subtotal*value/100);return {items,subtotal,amount:subtotal-discount,discount:value?{kind,value}:undefined,device:devices.find(d=>d.id===data.get('device'))};}
 body.querySelector('#pos-project').onclick = () => {
   if (locked || pending || customMode) return;
   try {
     createProject(client, values(), id => {
       body.querySelector('#pos-clear').click();
       status.textContent = 'Project draft saved. Find it in Orders under Project orders. Order ' + id;
     });
   } catch (error) { status.textContent = error.message; }
 };
 let locked=false;
 function preview(){
  const items=products.map(p=>({...p,quantity:Number(form.elements.namedItem(p.id).value)})).filter(p=>p.quantity>0);
  body.querySelector('#pos-project').disabled = locked || !!pending || customMode || !items.length;
  body.querySelector('#pos-count').textContent=items.reduce((n,p)=>n+p.quantity,0);
  body.querySelector('#pos-lines').innerHTML=items.length?items.map(p=>`<div class="pos-line"><div class="pos-line-top"><strong>${esc(p.name)}</strong><strong>${money(p.price*p.quantity)}</strong></div><div class="pos-line-bottom"><span>${money(p.price)} each</span><div class="pos-stepper"><button type="button" data-step="${p.id}" data-delta="-1" aria-label="Remove one ${p.name}" ${locked?'disabled':''}><span class="pos-minus-mark" aria-hidden="true"></span></button><span>${p.quantity}</span><button type="button" data-step="${p.id}" data-delta="1" aria-label="Add one ${p.name}" ${locked||p.quantity>=50?'disabled':''}><span class="pos-plus-mark" aria-hidden="true"></span></button></div></div></div>`).join(''):'<div class="pos-empty"><h3>Your cart is empty</h3><p>Choose a product to start a sale.</p></div>';
  if(customMode){body.querySelector('#pos-count').textContent='1';body.querySelector('#pos-lines').innerHTML='<div class="pos-line"><strong>Custom amount</strong><p>One-time payment</p></div>';}
  body.querySelectorAll('[data-add]').forEach(b=>{b.disabled=locked||Number(form.elements.namedItem(b.dataset.add).value)>=50;b.classList.toggle('is-added',Number(form.elements.namedItem(b.dataset.add).value)>0);});
  try{const v=values();body.querySelector('#terminal-total').textContent=money(v.amount);if(body.querySelector('#pos-charge-total'))body.querySelector('#pos-charge-total').textContent=money(v.amount);body.querySelector('#pos-subtotal').textContent=money(v.subtotal);body.querySelector('#pos-discount-row').hidden=!v.discount;body.querySelector('#pos-discount-value').textContent='−'+money(v.subtotal-v.amount);body.querySelector('#pos-charge').disabled=locked||!!pending||(!customMode&&!v.items.length)||(!cashMode&&!v.device)||(cashMode&&cashPreview(v.amount)<v.amount)||v.amount<50;if(!locked&&!pending)status.textContent=v.items.length&&v.amount<50?'Discount must leave at least $0.50 to charge.':'';}catch(e){status.textContent=e.message;body.querySelector('#pos-charge').disabled=true;}
 }
 function mode(custom){if(locked)return;customMode=custom;body.querySelector('#pos-custom').hidden=!custom;body.querySelector('.pos-grid').hidden=custom;body.querySelector('.pos-category').hidden=custom;body.querySelector('.pos-discount').hidden=custom;body.querySelector('#pos-products-mode').setAttribute('aria-pressed',String(!custom));body.querySelector('#pos-custom-mode').setAttribute('aria-pressed',String(custom));preview();}
 body.querySelector('#pos-products-mode').onclick=()=>mode(false);body.querySelector('#pos-custom-mode').onclick=()=>mode(true);
 const cancelButton=body.querySelector('#pos-cancel');
 function showCancel(){cancelButton.hidden=!pending?.paymentId;cancelButton.disabled=false;}
 cancelButton.onclick=async()=>{if(!pending?.paymentId||!confirm('Cancel the payment waiting at the reader? This does not refund a completed payment.'))return;cancelButton.disabled=true;try{const p=await request(`/v1/payment-requests/${pending.paymentId}/cancel`,{});if(['CANCELED','EXPIRED','SUCCEEDED'].includes(p.state)){pending=null;sessionStorage.removeItem('terminal.pending');locked=false;for(const el of form.elements)el.disabled=false;preview();showCancel();status.textContent=p.state==='SUCCEEDED'?'Payment already completed. It was not canceled or refunded.':'Payment canceled. You can start a new sale.';}else{status.textContent='Cancellation is not confirmed. Check payment status before trying another charge.';showCancel();}}catch(e){status.textContent=e.message;showCancel();}};
 showCancel();
 const isCurrencyInput=el=>el instanceof HTMLInputElement&&(el.name==='customAmount'||el.name==='cashReceived'||(el.name==='discount'&&form.elements.namedItem('kind').value==='fixed'));
 const moveCurrencyCaret=el=>{const move=()=>{if(document.activeElement===el)el.setSelectionRange(el.value.length,el.value.length);};move();requestAnimationFrame(move);};
 for(const event of ['focusin','click','pointerup'])form.addEventListener(event,e=>{if(isCurrencyInput(e.target))moveCurrencyCaret(e.target);});
 const currencyDigits=value=>(Number(value.replace(/\D/g,'').slice(-8)||'0')/100).toFixed(2);
 form.oninput=e=>{if(e.target.name==='customAmount'||e.target.name==='cashReceived'||(e.target.name==='discount'&&form.elements.namedItem('kind').value==='fixed')){e.target.value=currencyDigits(e.target.value);moveCurrencyCaret(e.target);}preview();};
 form.elements.namedItem('kind').onchange=()=>{form.elements.namedItem('discount').value=form.elements.namedItem('kind').value==='fixed'?'0.00':'0';preview();};
 form.addEventListener('click',e=>{if(locked)return;const add=e.target.closest('[data-add]'),step=e.target.closest('[data-step]');if(add||step){const id=add?add.dataset.add:step.dataset.step;const input=form.elements.namedItem(id);input.value=Math.max(0,Math.min(50,Number(input.value)+(add?1:Number(step.dataset.delta))));preview();}if(e.target.closest('#pos-clear')){products.forEach(p=>form.elements.namedItem(p.id).value=0);form.elements.namedItem('discount').value=form.elements.namedItem('kind').value==='fixed'?'0.00':'0';preview();}});
 body.querySelector('#pos-new').onclick=()=>renderTerminal('products', client);
 preview();
 if(cashAttempt){method(true);locked=true;for(const el of form.elements)el.disabled=true;body.querySelector('#pos-charge').hidden=true;cashConfirm.hidden=false;cashConfirm.disabled=false;cashConfirm.textContent='Retry cash confirmation';form.elements.namedItem('cashReceived').value=(cashAttempt.cashReceived/100).toFixed(2);const c=cashAttempt.checkout;const subtotal=c.customAmount??c.items.reduce((sum,i)=>sum+products.find(p=>p.id===i.id).price*i.quantity,0);const total=subtotal-(c.discount?(c.discount.kind==='fixed'?c.discount.value:Math.round(subtotal*c.discount.value/100)):0);body.querySelector('#terminal-total').textContent=money(total);cashPreview(total);status.textContent='A cash confirmation needs checking. Retry safely before starting another sale.';}
 if(pending){status.textContent=waiting ? `${money(waiting.amount)} is ${waiting.state.toLowerCase().replaceAll('_',' ')} on the reader. Finish or cancel it on the phone before sending another charge.` : 'Checking an earlier order. No second payment will be sent.';body.querySelector('#pos-charge').disabled=true;const check=document.createElement('button');check.type='button';check.className='pos-clear';check.textContent='Check payment status';check.onclick=()=>renderTerminal('products', client);status.after(check);}
 form.onsubmit=async e=>{e.preventDefault();if(pending||locked)return;try{const v=values();if(cashMode){const received=cashPreview(v.amount);if(v.amount<50||received<v.amount)throw Error('Cash received must cover the total.');reviewedCash={requestId:crypto.randomUUID(),locationId:form.elements.namedItem('cashLocation').value,checkout:customMode?{customAmount:v.amount}:{items:v.items,...(v.discount?{discount:v.discount}:{})},cashReceived:received,confirmed:true};cashReview=true;locked=true;for(const el of form.elements)el.disabled=true;const review=body.querySelector('#pos-cash-review');review.hidden=false;review.textContent=`Sale ${money(v.amount)} · Received ${money(received)} · Give ${money(received-v.amount)} change.`;cashConfirm.hidden=false;cashConfirm.disabled=false;cashBack.hidden=false;cashBack.disabled=false;body.querySelector('#pos-charge').hidden=true;status.textContent='Confirm only after you have received and counted the cash.';return;}if((!customMode&&!v.items.length)||(!cashMode&&!v.device)||(cashMode&&cashPreview(v.amount)<v.amount)||v.amount<50)throw Error('Choose products and a terminal. The final total must be at least $0.50.');if(!confirm(`Send a live ${money(v.amount)} charge to ${v.device.name}?`))return;locked=true;pending={};sessionStorage.setItem('terminal.pending',JSON.stringify(pending));for(const el of form.elements)el.disabled=true;status.textContent='Sending order…';const order=await request('/v1/demo/orders',{locationId:v.device.locationId,...(customMode?{customAmount:v.customAmount}:{items:v.items,...(v.discount?{discount:v.discount}:{})})});pending.orderId=order.id;sessionStorage.setItem('terminal.pending',JSON.stringify(pending));let p=await request('/v1/payment-requests',{orderId:order.id,deviceId:v.device.id,locationId:v.device.locationId,displayAmount:v.amount});pending.paymentId=p.id;sessionStorage.setItem('terminal.pending',JSON.stringify(pending));showCancel();const deadline=Date.now()+180000;while(!['SUCCEEDED','FAILED','CANCELED','EXPIRED','REQUIRES_RECONCILIATION'].includes(p.state)&&Date.now()<deadline){status.textContent=`${money(p.amount)} · ${p.state.replaceAll('_',' ')}. Follow the reader prompts.`;await new Promise(r=>setTimeout(r,1800));p=await request(`/v1/payment-requests/${p.id}`);if(pending?.paymentId!==p.id)return;}status.textContent=p.state==='SUCCEEDED'?'Payment successful. See Orders for the paid order.':`Payment ${p.state.replaceAll('_',' ')}. Check the phone before retrying.`;if(['SUCCEEDED','CANCELED','EXPIRED'].includes(p.state)){pending=null;sessionStorage.removeItem('terminal.pending');showCancel();body.querySelector('#pos-new').hidden=false;body.querySelector('#pos-new').disabled=false;}}catch(e){status.textContent=`${e.message}${pending?' Check the phone and Orders before retrying.':''}`;}};
 }catch(e){body.textContent=e.message;}
}
