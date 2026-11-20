const usd = cents => (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'})[c]);

function openDialog(heading) {
  const dialog = document.createElement('dialog');
  dialog.className = 'contract-dialog';
  dialog.setAttribute('aria-labelledby', 'contract-dialog-title');
  dialog.innerHTML = `<header><h2 id="contract-dialog-title">${heading}</h2><button type="button" class="btn btn-light">Close</button></header><div class="contract-body"></div>`;
  document.getElementById('contentArea').append(dialog);
  dialog.querySelector('button').onclick = () => dialog.close();
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  dialog.showModal();
  return dialog;
}

export function createProject(client, cart, onSaved) {
  const dialog = openDialog('Create project draft');
  const id = crypto.randomUUID();
  const body = dialog.querySelector('.contract-body');
  body.innerHTML = `<form class="contract-form">
    <label>Customer name<input class="input" name="name" maxlength="160" required></label>
    <label>Customer email<input class="input" type="email" name="email" maxlength="254" required></label>
    <label>Project name<input class="input" name="title" maxlength="200" required></label>
    <label>Scope and timeline<textarea class="input" name="scope" maxlength="4000" required></textarea></label>
    <label>Payment terms<select class="input" name="count"><option value="2">50% deposit and balance</option><option value="3">3 payments · autopay required</option><option value="4">4 payments · autopay required</option></select></label>
    <div class="contract-schedule"></div><p>Amounts are before tax. Saving a draft does not send an agreement or collect payment.</p>
    <button class="btn btn-primary" type="submit">Save project draft</button><p role="status"></p></form>`;
  const form = body.querySelector('form');
  const count = form.elements.count;
  function schedule() {
    const payments = Number(count.value);
    const regular = Math.floor(cart.amount / payments);
    const fields = form.querySelector('.contract-schedule');
    const dates = Array.from(fields.querySelectorAll('input'), input => input.value);
    fields.innerHTML = `<p>After discount · ${usd(cart.amount)}</p><p>At signing · ${usd(regular)}</p>` +
      Array.from({length: payments - 1}, (_, i) => {
        const amount = i === payments - 2 ? cart.amount - regular * (payments - 1) : regular;
        return `<label>Payment ${i + 2} · ${usd(amount)}<input class="input" name="date" type="date" value="${dates[i] || ''}" required></label>`;
      }).join('');
  }
  count.onchange = schedule;
  schedule();
  form.onsubmit = async event => {
    event.preventDefault();
    const data = new FormData(form);
    const input = Object.fromEntries(['name','email','title','scope'].map(key => [key, data.get(key)]));
    Object.assign(input, { dates: data.getAll('date'), items: cart.items, discount_cents: cart.subtotal - cart.amount });
    const controls = Array.from(dialog.querySelectorAll('button,input,select,textarea'));
    controls.forEach(el => el.disabled = true);
    dialog.oncancel = event => event.preventDefault();
    try {
      const { error } = await client.rpc('create_contract_draft', { p_id: id, p_input: input });
      if (error) throw error;
      dialog.close();
      onSaved(id);
    } catch (error) {
      form.querySelector('[role=status]').textContent = error.message;
    } finally {
      controls.forEach(el => el.disabled = false);
      dialog.oncancel = null;
    }
  };
}

export function openProjects(client) {
  const dialog = openDialog('Project orders');
  const body = dialog.querySelector('.contract-body');
  body.innerHTML = `<form class="contract-search"><label>Customer, email, project or order number<input class="input" type="search" name="query"></label><button class="btn btn-primary">Search</button></form><div role="status"></div><div class="contract-results"></div><button type="button" class="btn btn-light" hidden>Show more</button>`;
  const form = body.querySelector('form');
  const results = body.querySelector('.contract-results');
  const status = body.querySelector('[role=status]');
  const more = body.lastElementChild;
  let generation = 0;
  let offset = 0;
  let term = '';
  async function load(reset) {
    const run = ++generation;
    if (reset) { term = form.elements.query.value.trim(); offset = 0; results.replaceChildren(); }
    more.hidden = true;
    status.textContent = 'Loading projects…';
    try {
      const {data, error} = await client.rpc('search_contract_drafts', {p_query:term, p_offset:offset});
      if (run !== generation) return;
      if (error) throw error;
      const page = data.slice(0, 25);
      for (const project of page) {
        const row = document.createElement('details');
        row.innerHTML = `<summary>${escape(project.title)} · ${escape(project.customer_name)} · ${usd(project.subtotal_cents-project.discount_cents)}</summary>
          <p>Order ${escape(project.id)} · ${project.agreement ? (project.agreement.signed_at ? 'Signed' : 'Awaiting signature') : 'Draft · Agreement not sent'}</p>
          <p>${escape(project.customer_email)}</p><p>${escape(project.scope)}</p>
          <ul>${project.items.map(i => `<li>${i.quantity} × ${escape(i.name)} at ${usd(i.price)}</li>`).join('')}</ul>
          <p>Subtotal ${usd(project.subtotal_cents)} · Discount ${usd(project.discount_cents)} · Tax pending</p>
          <p>${project.autopay_required ? 'Autopay authorization required' : 'Deposit and balance'}</p>
          <ol>${project.schedule.map(i => `<li>${escape(i.due_date || 'At signing')} · ${usd(i.pretax_cents)} before tax</li>`).join('')}</ol>`;
        if (project.agreement) {
          const link = document.createElement('a');
          link.href = 'https://login.reimagebs.com/?agreement=' + encodeURIComponent(project.agreement.id);
          link.textContent = 'View agreement';
          row.append(link);
        } else {
          const prepare = document.createElement('button');
          prepare.className = 'btn btn-light';
          prepare.textContent = 'Prepare agreement';
          prepare.onclick = () => prepareAgreement(client, project, () => load(true));
          row.append(prepare);
        }
        results.append(row);
      }
      offset += page.length;
      status.textContent = offset ? '' : 'No matching projects.';
      more.hidden = data.length <= 25;
    } catch (error) {
      if (run === generation) status.textContent = error.message;
    }
  }
  form.onsubmit = event => { event.preventDefault(); load(true); };
  more.onclick = () => load(false);
  load(true);
}

function prepareAgreement(client, project, onIssued) {
  const dialog = openDialog('Prepare agreement');
  const body = dialog.querySelector('.contract-body');
  body.innerHTML = `<form class="contract-form"><label>Approved template version<input class="input" name="version" maxlength="120" required></label>
    <label>Approved project terms<textarea class="input" name="terms" rows="8" maxlength="80000" required></textarea></label>
    <button class="btn btn-light">Preview agreement</button></form><pre class="contract-preview"></pre>
    <button type="button" class="btn btn-primary" hidden>Queue signing invitation</button><p role="status"></p>`;
  const form = body.querySelector('form');
  const send = body.querySelector('[type=button]');
  const preview = body.querySelector('pre');
  const status = body.querySelector('[role=status]');
  let revision = 0;
  form.oninput = () => { revision++; preview.textContent = ''; send.hidden = true; status.textContent = ''; };
  async function issue(previewOnly) {
    const current = revision;
    const payload = {p_project:project.id,p_version:form.elements.version.value,p_terms:form.elements.terms.value,p_preview:previewOnly};
    send.disabled = true;
    try {
      const {data,error} = await client.rpc('issue_project_agreement',payload);
      if (error) throw error;
      if (!previewOnly) { dialog.close(); onIssued(); return; }
      if (current !== revision) return;
      preview.textContent = data.document;
      send.hidden = project.tax_cents == null;
      status.textContent = send.hidden ? 'Finalize project tax before sending.' : '';
    } catch (error) { status.textContent = error.message; }
    finally { send.disabled = false; }
  }
  form.onsubmit = event => { event.preventDefault(); issue(true); };
  send.onclick = () => issue(false);
}
