import './styles.css';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const app = document.getElementById('app');

let supabase;
let session = null;
let requests = [];
let requestMessages = {};
let selectedId = null;
let activeView = 'list';
let filters = { search: '', service: 'all', status: 'all' };
let calViewDate = new Date();
let selectedCalDate = new Date().toISOString().slice(0,10);

let invoiceMode = 'edit';
let invoiceData = null;
let invoiceItems = [];


const STATUS_OPTIONS = ['new', 'contacted', 'closed', 'spam'];

async function init(){
  invoiceData = createBlankInvoice();
  invoiceItems = [createInvoiceItem('Website Design / Development')];
  if(!SUPABASE_URL || !SUPABASE_ANON_KEY){
    app.innerHTML = `
      <div class="login-wrap">
        <div class="login-card">
          <div class="kicker">Missing .env</div>
          <h1>Supabase keys missing</h1>
          <p class="muted">Create a .env file in this admin folder using .env.example.</p>
        </div>
      </div>`;
    return;
  }

  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const { data } = await supabase.auth.getSession();
  session = data.session;

  supabase.auth.onAuthStateChange((_event, newSession) => {
    session = newSession;
    render();
  });

  render();
}

function render(){
  session ? renderAdmin() : renderLogin();
}

function renderLogin(){
  app.innerHTML = `
    <div class="login-wrap">
      <form class="login-card" id="loginForm">
        <img class="login-logo" src="/logo.png" alt="RE IMAGE logo" onerror="this.style.display='none'">
        <div class="kicker">Admin Portal</div>
        <h1>RE IMAGE Dashboard</h1>
        <p class="muted">Log in with your Supabase Auth admin account.</p>

        <div class="form-group">
          <label>Email</label>
          <input class="input" id="email" type="email" required placeholder="reimagbs@gmail.com">
        </div>

        <div class="form-group">
          <label>Password</label>
          <input class="input" id="password" type="password" required placeholder="Password">
        </div>

        <button class="btn btn-primary" style="width:100%;margin-top:1rem;" type="submit">Log In</button>
        <div class="notice" id="loginNotice"></div>
      </form>
    </div>`;

  document.getElementById('loginForm').addEventListener('submit', handleLogin);
}

async function handleLogin(e){
  e.preventDefault();

  const notice = document.getElementById('loginNotice');
  notice.className = 'notice show';
  notice.textContent = 'Signing in...';

  const { error } = await supabase.auth.signInWithPassword({
    email: document.getElementById('email').value.trim(),
    password: document.getElementById('password').value
  });

  if(error){
    notice.className = 'notice show error';
    notice.textContent = error.message;
  }
}

async function renderAdmin(){
  app.innerHTML = `
    <div class="admin-shell">
      <header class="topbar">
        <div class="brand">
          <img src="/logo.png" alt="RE IMAGE logo" onerror="this.style.display='none'">
          <span>Admin Portal</span>
        </div>

        <div class="top-actions">
          <span class="admin-email">${escapeHtml(session.user.email || '')}</span>
          <button class="btn btn-light" id="refreshBtn">Refresh</button>
          <button class="btn btn-light" id="signOutBtn">Sign Out</button>
        </div>
      </header>

      <main class="main">
        <div id="stats"></div>

        <div class="tabs">
          <button class="tab ${activeView === 'list' ? 'active' : ''}" data-view="list">List View</button>
          <button class="tab ${activeView === 'calendar' ? 'active' : ''}" data-view="calendar">Calendar View</button>
          <button class="tab ${activeView === 'messages' ? 'active' : ''}" data-view="messages">Messages</button>
          <button class="tab ${activeView === 'invoice' ? 'active' : ''}" data-view="invoice">Invoices</button>
        </div>

        ${activeView === 'invoice' ? '' : `
          <div class="toolbar">
            <input class="input" id="searchInput" placeholder="Search name, email, business, message..." value="${escapeAttr(filters.search)}">
            <select id="serviceFilter"></select>
            <select id="statusFilter"></select>
            <button class="btn btn-primary" id="applyFiltersBtn">Apply</button>
          </div>
        `}

        <div id="contentArea"></div>
      </main>
    </div>`;

  bindTopEvents();
  await loadRequests();
}

function bindTopEvents(){
  document.getElementById('signOutBtn').addEventListener('click', () => supabase.auth.signOut());
  document.getElementById('refreshBtn').addEventListener('click', loadRequests);

  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      activeView = btn.dataset.view;
      renderAdmin();
    });
  });

  const applyFiltersBtn = document.getElementById('applyFiltersBtn');

  if(applyFiltersBtn){
    applyFiltersBtn.addEventListener('click', () => {
      filters.search = document.getElementById('searchInput').value.trim();
      filters.service = document.getElementById('serviceFilter').value;
      filters.status = document.getElementById('statusFilter').value;
      renderContent();
    });
  }
}

async function loadRequests(){
  const area = document.getElementById('contentArea');

  if(area){
    area.innerHTML = '<div class="table-card"><div class="detail-body muted">Loading submissions...</div></div>';
  }

  const { data, error } = await supabase
    .from('start_requests')
    .select('*')
    .order('created_at', { ascending:false });

  if(error){
    area.innerHTML = `
      <div class="table-card">
        <div class="detail-body notice show error">${escapeHtml(error.message)}</div>
      </div>`;
    return;
  }

  requests = data || [];

  if(!selectedId && requests.length){
    selectedId = requests[0].id;
  }

  await loadAllMessages();

  renderStats();
  populateFilters();
  renderContent();
}

async function loadAllMessages(){
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .order('created_at', { ascending:true });

  if(error){
    console.error('Messages load failed:', error);
    requestMessages = {};
    return;
  }

  requestMessages = {};

  (data || []).forEach(m => {
    if(!requestMessages[m.request_id]){
      requestMessages[m.request_id] = [];
    }

    requestMessages[m.request_id].push(m);
  });
}

function populateFilters(){
  const service = document.getElementById('serviceFilter');
  const status = document.getElementById('statusFilter');

  if(service) service.innerHTML = serviceOptions();
  if(status) status.innerHTML = statusOptions();
}

function renderStats(){
  document.getElementById('stats').innerHTML = `
    <section class="stats">
      <div class="stat-card">
        <span>Total Submissions</span>
        <strong>${requests.length}</strong>
      </div>

      <div class="stat-card">
        <span>New Leads</span>
        <strong>${requests.filter(r => (r.status || 'new') === 'new').length}</strong>
      </div>

      <div class="stat-card">
        <span>Consultations</span>
        <strong>${requests.filter(r => r.service_choice === 'Consultation').length}</strong>
      </div>

      <div class="stat-card">
        <span>Booked Slots</span>
        <strong>${requests.filter(r => r.consultation_date && r.consultation_time).length}</strong>
      </div>
    </section>`;
}

function renderContent(){
  if(activeView === 'calendar'){
    renderCalendarView();
  } else if(activeView === 'messages'){
    renderMessagesView();
  } else if(activeView === 'invoice'){
    renderInvoiceView();
  } else {
    renderListView();
  }
}

function filteredRequests(){
  const s = filters.search.toLowerCase();

  return requests.filter(r => {
    const blob = `
      ${r.first_name || ''}
      ${r.last_name || ''}
      ${r.email || ''}
      ${r.phone || ''}
      ${r.business_name || ''}
      ${r.message || ''}
    `.toLowerCase();

    return (
      (!s || blob.includes(s)) &&
      (filters.service === 'all' || r.service_choice === filters.service) &&
      (filters.status === 'all' || (r.status || 'new') === filters.status)
    );
  });
}

function renderListView(){
  const rows = filteredRequests();
  const selected = requests.find(r => r.id === selectedId) || rows[0];

  document.getElementById('contentArea').innerHTML = `
    <section class="leads-layout">
      <div class="table-card">
        <div class="table-head">
          <h2>Start With Us Submissions</h2>
          <span class="muted">${rows.length} showing</span>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Created</th>
                <th>Customer</th>
                <th>Business</th>
                <th>Service</th>
                <th>Consultation</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              ${rows.map(r => `
                <tr data-id="${r.id}" class="${selected && selected.id === r.id ? 'active' : ''}">
                  <td>${formatDateTime(r.created_at)}</td>
                  <td>
                    <strong>${escapeHtml(fullName(r))}</strong><br>
                    <span class="muted">${escapeHtml(r.email || '')}</span>
                  </td>
                  <td>${escapeHtml(r.business_name || '')}</td>
                  <td>${escapeHtml(r.service_choice || '')}</td>
                  <td>${consultationLabel(r)}</td>
                  <td>${statusBadge(r.status)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <aside class="detail-card" id="detailCard">
        ${detailHtml(selected)}
      </aside>
    </section>`;

  document.querySelectorAll('tr[data-id]').forEach(row => {
    row.addEventListener('click', () => {
      selectedId = Number(row.dataset.id);
      renderListView();
    });
  });

  bindDetailEvents();
}

function detailHtml(r){
  if(!r){
    return `<div class="empty-detail">No submission selected.</div>`;
  }

  const msgs = requestMessages[r.id] || [];
  const lastMsg = msgs[msgs.length - 1];

  return `
    <div class="detail-head">
      <h2>${escapeHtml(fullName(r))}</h2>
      ${statusBadge(r.status)}
    </div>

    <div class="detail-body">
      <div class="detail-grid">
        <div class="info-box">
          <span>Email</span>
          <a href="mailto:${escapeAttr(r.email || '')}">${escapeHtml(r.email || '')}</a>
        </div>

        <div class="info-box">
          <span>Phone</span>
          <a href="tel:${escapeAttr(r.phone || '')}">${escapeHtml(r.phone || 'Not provided')}</a>
        </div>

        <div class="info-box">
          <span>Business</span>
          <strong>${escapeHtml(r.business_name || '')}</strong>
        </div>

        <div class="info-box">
          <span>Service</span>
          <strong>${escapeHtml(r.service_choice || '')}</strong>
        </div>

        <div class="info-box">
          <span>Submitted</span>
          <strong>${formatDateTime(r.created_at)}</strong>
        </div>

        <div class="info-box">
          <span>Consultation</span>
          <strong>${consultationLabel(r)}</strong>
        </div>
      </div>

      <label>Original Customer Message</label>
      <div class="message-box">${escapeHtml(r.message || 'No message provided.')}</div>

      ${
        lastMsg
          ? `
            <label>Latest Portal Message</label>
            <div class="message-box">
              <strong>${lastMsg.sender_role === 'admin' ? 'RE IMAGE' : 'Customer'}:</strong>
              ${escapeHtml(lastMsg.message)}
            </div>
          `
          : ''
      }

      <div class="form-group">
        <label>Status</label>
        <select id="statusEdit">
          ${STATUS_OPTIONS.map(s => `
            <option value="${s}" ${(r.status || 'new') === s ? 'selected' : ''}>
              ${titleCase(s)}
            </option>
          `).join('')}
        </select>
      </div>

      <div class="form-group">
        <label>Admin Notes</label>
        <textarea id="notesEdit" placeholder="Internal notes...">${escapeHtml(r.admin_notes || '')}</textarea>
      </div>

      <div class="action-row">
        <button class="btn btn-primary" id="saveDetailBtn" data-id="${r.id}">Save Changes</button>
        <button class="btn btn-secondary" id="openMessagesBtn" data-id="${r.id}">Open Messages</button>
        <button class="btn btn-danger" id="deleteDetailBtn" data-id="${r.id}">Delete</button>
      </div>

      <div class="notice" id="detailNotice"></div>
    </div>`;
}

function bindDetailEvents(){
  const saveBtn = document.getElementById('saveDetailBtn');

  if(saveBtn){
    saveBtn.addEventListener('click', async () => {
      const id = Number(saveBtn.dataset.id);
      const notice = document.getElementById('detailNotice');

      notice.className = 'notice show';
      notice.textContent = 'Saving...';

      const { error } = await supabase
        .from('start_requests')
        .update({
          status: document.getElementById('statusEdit').value,
          admin_notes: document.getElementById('notesEdit').value
        })
        .eq('id', id);

      if(error){
        notice.className = 'notice show error';
        notice.textContent = error.message;
        return;
      }

      await loadRequests();
    });
  }

  const del = document.getElementById('deleteDetailBtn');

  if(del){
    del.addEventListener('click', async () => {
      if(!confirm('Delete this submission?')) return;

      const { error } = await supabase
        .from('start_requests')
        .delete()
        .eq('id', Number(del.dataset.id));

      if(error){
        alert(error.message);
      } else {
        selectedId = null;
        await loadRequests();
      }
    });
  }

  const openMessagesBtn = document.getElementById('openMessagesBtn');

  if(openMessagesBtn){
    openMessagesBtn.addEventListener('click', async () => {
      selectedId = Number(openMessagesBtn.dataset.id);
      activeView = 'messages';
      await renderAdmin();
    });
  }
}

/* =========================
   MESSAGES PAGE
========================= */

function renderMessagesView(){
  const rows = filteredRequests();
  const selected = requests.find(r => r.id === selectedId) || rows[0] || null;

  if(selected && selected.id !== selectedId){
    selectedId = selected.id;
  }

  document.getElementById('contentArea').innerHTML = `
    <section class="messages-page">
      <div class="messages-sidebar">
        <div class="messages-top">
          <div>
            <div class="kicker">Client Portal</div>
            <h2>Messages</h2>
          </div>
          <span class="muted">${rows.length} threads</span>
        </div>

        <div class="messages-list">
          ${
            rows.length
              ? rows.map(r => messageThreadRow(r, selected)).join('')
              : `<div class="empty-detail">No message threads yet.</div>`
          }
        </div>
      </div>

      <div class="messages-panel">
        ${selected ? messageThreadPanel(selected) : `<div class="empty-detail">Select a conversation.</div>`}
      </div>
    </section>`;

  document.querySelectorAll('.message-thread-row').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedId = Number(btn.dataset.id);
      renderMessagesView();
    });
  });

  const sendBtn = document.getElementById('sendMessagePageBtn');

  if(sendBtn){
    sendBtn.addEventListener('click', sendMessageFromMessagesPage);
  }

  const infoBtn = document.getElementById('messageInfoBtn');

  if(infoBtn){
    infoBtn.addEventListener('click', () => {
      const r = requests.find(item => item.id === Number(infoBtn.dataset.id));
      if(r) openClientInfoModal(r);
    });
  }

  const openRequestBtn = document.getElementById('openRequestFromMessagesBtn');

  if(openRequestBtn){
    openRequestBtn.addEventListener('click', async () => {
      selectedId = Number(openRequestBtn.dataset.id);
      activeView = 'list';
      await renderAdmin();
    });
  }
}

function messageThreadRow(r, selected){
  const msgs = requestMessages[r.id] || [];
  const last = msgs[msgs.length - 1];

  const customerName = fullName(r);
  const preview = last ? last.message : r.message || 'No messages yet.';
  const lastTime = last ? formatDateTime(last.created_at) : formatDateTime(r.created_at);

  return `
    <button class="message-thread-row ${selected && selected.id === r.id ? 'active' : ''}" data-id="${r.id}">
      <div class="thread-row-main">
        <strong>${escapeHtml(customerName)}</strong>
        <span>${escapeHtml(r.business_name || r.email || '')}</span>
      </div>

      <p>${escapeHtml(preview)}</p>

      <div class="thread-row-meta">
        <em>${escapeHtml(r.service_choice || 'Request')}</em>
        <small>${lastTime}</small>
      </div>
    </button>`;
}

function messageThreadPanel(r){
  const msgs = requestMessages[r.id] || [];

  return `
    <div class="message-panel-head">
      <div>
        <div class="kicker">${escapeHtml(r.service_choice || 'Request')}</div>
        <h2>${escapeHtml(fullName(r))}</h2>
        <p class="muted">
          ${escapeHtml(r.business_name || '')}
          ${r.email ? '• ' + escapeHtml(r.email) : ''}
        </p>
      </div>

      <div class="message-panel-actions">
        <button class="btn btn-secondary" id="messageInfoBtn" data-id="${r.id}">Info</button>
        <button class="btn btn-secondary" id="openRequestFromMessagesBtn" data-id="${r.id}">Open Request</button>
      </div>
    </div>

    <div class="message-thread-box">
      ${
        msgs.length
          ? msgs.map(m => `
              <div class="chat-bubble ${m.sender_role === 'admin' ? 'admin' : 'customer'}">
                <strong>${m.sender_role === 'admin' ? 'RE IMAGE' : escapeHtml(fullName(r))}</strong>
                <p>${escapeHtml(m.message)}</p>
                <span>${formatDateTime(m.created_at)}</span>
              </div>
            `).join('')
          : `<div class="empty-detail">No portal messages yet. Send the first reply below.</div>`
      }
    </div>

    <div class="message-reply-box">
      <label>Reply To Client</label>
      <textarea id="messagePageReply" placeholder="Type your message to ${escapeAttr(fullName(r))}..."></textarea>
      <button class="btn btn-primary" id="sendMessagePageBtn" data-id="${r.id}">Send Message</button>
      <div class="notice" id="messagePageNotice"></div>
    </div>`;
}

async function sendMessageFromMessagesPage(){
  const btn = document.getElementById('sendMessagePageBtn');
  const textarea = document.getElementById('messagePageReply');
  const notice = document.getElementById('messagePageNotice');

  const requestId = Number(btn.dataset.id);
  const message = textarea.value.trim();

  if(!message){
    notice.className = 'notice show error';
    notice.textContent = 'Type a message first.';
    return;
  }

  notice.className = 'notice show';
  notice.textContent = 'Sending...';

  const { error } = await supabase
    .from('messages')
    .insert([{
      request_id: requestId,
      sender_id: session.user.id,
      sender_role: 'admin',
      message
    }]);

  if(error){
    notice.className = 'notice show error';
    notice.textContent = error.message;
    return;
  }

  textarea.value = '';
  notice.textContent = 'Message sent.';

  await loadAllMessages();
  renderMessagesView();
}

function openClientInfoModal(r){
  closeCalendarRequestModal();

  const modal = document.createElement('div');
  modal.className = 'request-modal-backdrop';
  modal.id = 'requestModalBackdrop';

  modal.innerHTML = `
    <div class="request-modal" role="dialog" aria-modal="true" aria-label="Client information">
      <div class="request-modal-head">
        <div>
          <div class="kicker">Client Info</div>
          <h2>${escapeHtml(fullName(r))}</h2>
        </div>

        <button class="modal-close" id="modalCloseBtn" aria-label="Close modal">×</button>
      </div>

      <div class="request-modal-body">
        <div class="modal-status-row">
          ${statusBadge(r.status)}
          <span>${formatDateTime(r.created_at)}</span>
        </div>

        <div class="detail-grid modal-detail-grid">
          <div class="info-box">
            <span>Email</span>
            <a href="mailto:${escapeAttr(r.email || '')}">${escapeHtml(r.email || '')}</a>
          </div>

          <div class="info-box">
            <span>Phone</span>
            <a href="tel:${escapeAttr(r.phone || '')}">${escapeHtml(r.phone || 'Not provided')}</a>
          </div>

          <div class="info-box">
            <span>Business</span>
            <strong>${escapeHtml(r.business_name || '')}</strong>
          </div>

          <div class="info-box">
            <span>Service</span>
            <strong>${escapeHtml(r.service_choice || '')}</strong>
          </div>

          <div class="info-box">
            <span>Consultation</span>
            <strong>${consultationLabel(r)}</strong>
          </div>

          <div class="info-box">
            <span>Submitted</span>
            <strong>${formatDateTime(r.created_at)}</strong>
          </div>
        </div>

        <label>Original Customer Message</label>
        <div class="message-box">${escapeHtml(r.message || 'No message provided.')}</div>

        <label>Admin Notes</label>
        <div class="message-box">${escapeHtml(r.admin_notes || 'No admin notes yet.')}</div>

        <div class="action-row">
          <button class="btn btn-primary" id="modalOpenRequestBtn" data-id="${r.id}">Open Request</button>
          <button class="btn btn-secondary" id="modalCloseSecondaryBtn">Close</button>
        </div>
      </div>
    </div>`;

  document.body.appendChild(modal);
  document.body.classList.add('modal-open');

  document.getElementById('modalCloseBtn').addEventListener('click', closeCalendarRequestModal);
  document.getElementById('modalCloseSecondaryBtn').addEventListener('click', closeCalendarRequestModal);

  document.getElementById('modalOpenRequestBtn').addEventListener('click', async () => {
    selectedId = r.id;
    activeView = 'list';
    closeCalendarRequestModal();
    await renderAdmin();
  });

  modal.addEventListener('click', e => {
    if(e.target === modal) closeCalendarRequestModal();
  });

  document.addEventListener('keydown', handleModalEscape);
}

/* =========================
   CALENDAR VIEW
========================= */

function renderCalendarView(){
  const consults = filteredRequests().filter(r => r.consultation_date && r.consultation_time);

  const monthItems = consults.filter(r => {
    const d = parseLocalDate(r.consultation_date);
    return d.getMonth() === calViewDate.getMonth() && d.getFullYear() === calViewDate.getFullYear();
  });

  const currentMonthLabel = calViewDate.toLocaleDateString('en-US', {
    month:'long',
    year:'numeric'
  });

  document.getElementById('contentArea').innerHTML = `
    <section class="crm-calendar-shell">
      <div class="crm-calendar-top">
        <div>
          <div class="kicker">Dashboard</div>
          <h2>Calendar</h2>
        </div>

        <div class="calendar-top-actions">
          <button class="btn btn-secondary" id="calendarTodayBtn">Today</button>
          <button class="btn btn-primary" id="calendarRefreshBtn">Refresh</button>
        </div>
      </div>

      <div class="calendar-legend">
        <span><i class="legend-dot badge-new-dot"></i>New</span>
        <span><i class="legend-dot badge-contacted-dot"></i>Contacted</span>
        <span><i class="legend-dot badge-closed-dot"></i>Closed</span>
        <span><i class="legend-dot badge-spam-dot"></i>Spam</span>
      </div>

      <div class="crm-month-card">
        <div class="crm-month-nav">
          <div class="month-controls">
            <button class="month-arrow" id="prevMonth" aria-label="Previous month">‹</button>
            <button class="month-arrow" id="nextMonth" aria-label="Next month">›</button>
            <button class="today-pill" id="todayPill">today</button>
          </div>

          <div class="crm-month-title">${currentMonthLabel}</div>
          <div class="month-count">${monthItems.length} consultation${monthItems.length === 1 ? '' : 's'}</div>
        </div>

        <div class="crm-calendar-grid" id="crmCalendarGrid"></div>
      </div>
    </section>`;

  document.getElementById('prevMonth').addEventListener('click', () => {
    calViewDate.setMonth(calViewDate.getMonth() - 1);
    renderCalendarView();
  });

  document.getElementById('nextMonth').addEventListener('click', () => {
    calViewDate.setMonth(calViewDate.getMonth() + 1);
    renderCalendarView();
  });

  document.getElementById('todayPill').addEventListener('click', goCalendarToday);
  document.getElementById('calendarTodayBtn').addEventListener('click', goCalendarToday);
  document.getElementById('calendarRefreshBtn').addEventListener('click', loadRequests);

  renderCrmMonthCalendar(consults);

  function goCalendarToday(){
    calViewDate = new Date();
    selectedCalDate = new Date().toISOString().slice(0,10);
    renderCalendarView();
  }
}

function renderCrmMonthCalendar(consults){
  const grid = document.getElementById('crmCalendarGrid');
  const y = calViewDate.getFullYear();
  const m = calViewDate.getMonth();

  const firstOfMonth = new Date(y, m, 1);
  const start = new Date(y, m, 1 - firstOfMonth.getDay());
  const todayIso = new Date().toISOString().slice(0,10);

  const grouped = consults.reduce((acc, r) => {
    if(!acc[r.consultation_date]){
      acc[r.consultation_date] = [];
    }

    acc[r.consultation_date].push(r);
    return acc;
  }, {});

  Object.keys(grouped).forEach(date => {
    grouped[date].sort((a,b) => timeToMinutes(a.consultation_time) - timeToMinutes(b.consultation_time));
  });

  grid.innerHTML = `
    ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => `<div class="crm-dow">${d}</div>`).join('')}
  `;

  for(let i = 0; i < 42; i++){
    const dt = new Date(start);
    dt.setDate(start.getDate() + i);

    const iso = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
    const isOtherMonth = dt.getMonth() !== m;
    const isToday = iso === todayIso;
    const items = grouped[iso] || [];

    grid.insertAdjacentHTML('beforeend', `
      <div class="crm-day ${isOtherMonth ? 'other-month' : ''} ${isToday ? 'today-cell' : ''}" data-date="${iso}">
        <div class="crm-day-number">${dt.getDate()}</div>

        <div class="crm-day-events">
          ${items.map(r => `
            <button class="crm-event event-${escapeAttr(r.status || 'new')}" data-id="${r.id}" title="${escapeAttr(fullName(r))}">
              <span>${escapeHtml(r.consultation_time || '')}</span>
              <strong>${escapeHtml(fullName(r))}</strong>
            </button>
          `).join('')}
        </div>
      </div>`);
  }

  document.querySelectorAll('.crm-event').forEach(eventBtn => {
    eventBtn.addEventListener('click', e => {
      e.stopPropagation();

      const request = requests.find(r => r.id === Number(eventBtn.dataset.id));

      if(request){
        openCalendarRequestModal(request);
      }
    });
  });
}

function timeToMinutes(time){
  if(!time) return 9999;

  const match = String(time).match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);

  if(!match) return 9999;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const period = match[3].toUpperCase();

  if(period === 'PM' && hours !== 12) hours += 12;
  if(period === 'AM' && hours === 12) hours = 0;

  return hours * 60 + minutes;
}

function openCalendarRequestModal(r){
  closeCalendarRequestModal();

  const modal = document.createElement('div');
  modal.className = 'request-modal-backdrop';
  modal.id = 'requestModalBackdrop';

  modal.innerHTML = `
    <div class="request-modal" role="dialog" aria-modal="true" aria-label="Submission details">
      <div class="request-modal-head">
        <div>
          <div class="kicker">Consultation Details</div>
          <h2>${escapeHtml(fullName(r))}</h2>
        </div>

        <button class="modal-close" id="modalCloseBtn" aria-label="Close modal">×</button>
      </div>

      <div class="request-modal-body">
        <div class="modal-status-row">
          ${statusBadge(r.status)}
          <span>${formatDateTime(r.created_at)}</span>
        </div>

        <div class="detail-grid modal-detail-grid">
          <div class="info-box">
            <span>Email</span>
            <a href="mailto:${escapeAttr(r.email || '')}">${escapeHtml(r.email || '')}</a>
          </div>

          <div class="info-box">
            <span>Phone</span>
            <a href="tel:${escapeAttr(r.phone || '')}">${escapeHtml(r.phone || 'Not provided')}</a>
          </div>

          <div class="info-box">
            <span>Business</span>
            <strong>${escapeHtml(r.business_name || '')}</strong>
          </div>

          <div class="info-box">
            <span>Service</span>
            <strong>${escapeHtml(r.service_choice || '')}</strong>
          </div>

          <div class="info-box">
            <span>Consultation Date</span>
            <strong>${formatDateOnly(r.consultation_date)}</strong>
          </div>

          <div class="info-box">
            <span>Consultation Time</span>
            <strong>${escapeHtml(r.consultation_time || '—')}</strong>
          </div>
        </div>

        <label>Customer Message</label>
        <div class="message-box">${escapeHtml(r.message || 'No message provided.')}</div>

        <div class="form-group">
          <label for="modalStatusEdit">Status</label>
          <select id="modalStatusEdit">
            ${STATUS_OPTIONS.map(s => `
              <option value="${s}" ${(r.status || 'new') === s ? 'selected' : ''}>
                ${titleCase(s)}
              </option>
            `).join('')}
          </select>
        </div>

        <div class="form-group">
          <label for="modalNotesEdit">Admin Notes</label>
          <textarea id="modalNotesEdit" placeholder="Internal notes...">${escapeHtml(r.admin_notes || '')}</textarea>
        </div>

        <div class="action-row">
          <button class="btn btn-primary" id="modalSaveBtn" data-id="${r.id}">Save Changes</button>
          <button class="btn btn-secondary" id="modalViewListBtn" data-id="${r.id}">Open In List View</button>
          <button class="btn btn-danger" id="modalDeleteBtn" data-id="${r.id}">Delete</button>
        </div>

        <div class="notice" id="modalNotice"></div>
      </div>
    </div>`;

  document.body.appendChild(modal);
  document.body.classList.add('modal-open');

  document.getElementById('modalCloseBtn').addEventListener('click', closeCalendarRequestModal);

  modal.addEventListener('click', e => {
    if(e.target === modal) closeCalendarRequestModal();
  });

  document.addEventListener('keydown', handleModalEscape);

  document.getElementById('modalSaveBtn').addEventListener('click', async () => {
    const notice = document.getElementById('modalNotice');
    notice.className = 'notice show';
    notice.textContent = 'Saving...';

    const { error } = await supabase
      .from('start_requests')
      .update({
        status: document.getElementById('modalStatusEdit').value,
        admin_notes: document.getElementById('modalNotesEdit').value
      })
      .eq('id', r.id);

    if(error){
      notice.className = 'notice show error';
      notice.textContent = error.message;
      return;
    }

    notice.textContent = 'Saved.';

    await loadRequests();
    closeCalendarRequestModal();
    renderAdmin();
  });

  document.getElementById('modalViewListBtn').addEventListener('click', () => {
    selectedId = r.id;
    activeView = 'list';
    closeCalendarRequestModal();
    renderAdmin();
  });

  document.getElementById('modalDeleteBtn').addEventListener('click', async () => {
    if(!confirm('Delete this submission?')) return;

    const { error } = await supabase
      .from('start_requests')
      .delete()
      .eq('id', r.id);

    if(error){
      alert(error.message);
      return;
    }

    selectedId = null;
    closeCalendarRequestModal();
    await loadRequests();
  });
}

function closeCalendarRequestModal(){
  const modal = document.getElementById('requestModalBackdrop');

  if(modal) modal.remove();

  document.body.classList.remove('modal-open');
  document.removeEventListener('keydown', handleModalEscape);
}

function handleModalEscape(e){
  if(e.key === 'Escape'){
    closeCalendarRequestModal();
  }
}


/* =========================
   INVOICE GENERATOR
========================= */

const INVOICE_SERVICES = [
  {
    name: 'Website Starter',
    category: 'Website Development',
    defaultRate: 99,
    billingCycle: 'one-time',
    quantityLabel: 'Project',
    description: 'Starter website setup.'
  },
  {
    name: 'Website Monthly Hosting / Maintenance',
    category: 'Website Development',
    defaultRate: 29.99,
    billingCycle: 'monthly',
    quantityLabel: 'Month',
    description: 'Monthly website hosting, maintenance, and basic support.'
  },
  {
    name: 'Website Development Package',
    category: 'Website Development',
    defaultRate: 249.99,
    billingCycle: 'one-time',
    quantityLabel: 'Project',
    description: 'Website development package.'
  },
  {
    name: 'Website Add-On / Extra Page',
    category: 'Website Development',
    defaultRate: 49,
    billingCycle: 'one-time',
    quantityLabel: 'Item',
    description: 'Website add-on, extra page, or small upgrade.'
  },
  {
    name: 'Professional Reel',
    category: 'Social Media Management',
    defaultRate: 149,
    billingCycle: 'one-time',
    quantityLabel: 'Reel',
    description: 'Professionally shot reel with researched hook, caption, and call to action.'
  },
  {
    name: '3-Reel Content Package',
    category: 'Social Media Management',
    defaultRate: 399,
    billingCycle: 'one-time',
    quantityLabel: 'Package',
    description: 'Three professional reels for social media content.'
  },
  {
    name: 'Account Management Support',
    category: 'Social Media Management',
    defaultRate: 99,
    billingCycle: 'weekly',
    quantityLabel: 'Week',
    description: 'Weekly social media account management support using owner-provided content.'
  },
  {
    name: 'AI Receptionist Phone',
    category: 'AI Receptionists',
    defaultRate: 99,
    billingCycle: 'monthly',
    quantityLabel: 'Month',
    description: 'AI phone receptionist for common questions, lead collection, and customer routing.'
  },
  {
    name: 'AI Web Receptionist Starter',
    category: 'AI Receptionists',
    defaultRate: 99,
    billingCycle: 'monthly',
    quantityLabel: 'Month',
    description: 'Starter web receptionist plan with 2,000 AI replies/month, 20 replies per conversation, 1 business profile, 1 website, and lead capture.'
  },
  {
    name: 'AI Web Receptionist Growth',
    category: 'AI Receptionists',
    defaultRate: 149,
    billingCycle: 'monthly',
    quantityLabel: 'Month',
    description: 'Growth web receptionist plan with up to 5,000 AI replies/month for higher website traffic and more customer questions.'
  },
  {
    name: 'AI Receptionist + Automations Pro',
    category: 'AI Receptionists',
    defaultRate: 249,
    billingCycle: 'monthly',
    quantityLabel: 'Month',
    description: 'Pro AI receptionist plan with up to 10,000 AI replies/month plus automation support for intake, follow-up, routing, and lead handling.'
  },
  {
    name: 'AI Automation',
    category: 'AI Automation',
    defaultRate: 249,
    billingCycle: 'weekly',
    quantityLabel: 'Week',
    description: 'Custom automation setup and ongoing optimization tailored to the business.'
  },
  {
    name: 'Growth Foundation',
    category: 'Package',
    defaultRate: 399,
    billingCycle: 'weekly',
    quantityLabel: 'Week',
    description: 'Growth foundation package for small businesses building a stronger online presence.'
  },
  {
    name: 'Full Scale System',
    category: 'Package',
    defaultRate: 699,
    billingCycle: 'weekly',
    quantityLabel: 'Week',
    description: 'Full scale system package for website, intake, operations, automation, and support.'
  },
  {
    name: 'Consultation',
    category: 'Strategy',
    defaultRate: 0,
    billingCycle: 'one-time',
    quantityLabel: 'Session',
    description: 'Consultation or custom quote.'
  },
  {
    name: 'Custom Service',
    category: 'Custom',
    defaultRate: 0,
    billingCycle: 'custom',
    quantityLabel: 'Qty',
    description: 'Custom marketing, website, branding, or automation service.'
  }
];




const BILLING_OPTIONS = ['one-time', 'weekly', 'monthly', 'hourly', 'custom'];

function billingLabel(value){
  const labels = {
    'one-time': 'One-time',
    weekly: 'Per week',
    monthly: 'Per month',
    hourly: 'Per hour',
    custom: 'Custom'
  };
  return labels[value] || titleCase(value || 'custom');
}

function createBlankInvoice(){
  return {
    invoiceNumber: `RI-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`,
    invoiceDate: new Date().toISOString().slice(0,10),
    dueDate: new Date().toISOString().slice(0,10),
    clientName: '',
    clientBusiness: '',
    clientEmail: '',
    clientPhone: '',
    clientAddress: '',
    taxRate: '6.35',
    discount: '',
    amountPaid: '',
    notes: 'Thank you for choosing RE IMAGE Business Solutions. Payment is due according to the agreed project terms.',
    terms: 'Services are billed according to the scope listed above. Monthly services are billed per month, weekly services are billed per week, and one-time services are billed per project unless otherwise stated. Additional revisions, rush work, add-ons, ad spend, software subscriptions, or third-party costs may be billed separately unless included in writing.'
  };
}

function createInvoiceItem(serviceName = 'Website Development'){
  const service = INVOICE_SERVICES.find(s => s.name === serviceName) || INVOICE_SERVICES[0];

  return {
    id: crypto.randomUUID(),
    service: service.name,
    description: service.description,
    quantity: 1,
    rate: String(service.defaultRate),
    billingCycle: service.billingCycle,
    quantityLabel: service.quantityLabel
  };
}

function invoiceMoney(value){
  const number = Number(value || 0);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(Number.isFinite(number) ? number : 0);
}

function invoiceTotals(){
  const subtotal = invoiceItems.reduce((sum, item) => {
    return sum + Number(item.quantity || 0) * Number(item.rate || 0);
  }, 0);

  const discount = Number(invoiceData.discount || 0);
  const taxableAmount = Math.max(0, subtotal - discount);
  const tax = taxableAmount * (Number(invoiceData.taxRate || 0) / 100);
  const total = taxableAmount + tax;
  const amountPaid = Number(invoiceData.amountPaid || 0);
  const balanceDue = Math.max(0, total - amountPaid);

  return { subtotal, discount, tax, total, amountPaid, balanceDue };
}

function updateInvoiceField(field, value){
  invoiceData[field] = value;

  if(invoiceMode === 'preview'){
    renderInvoiceView();
  }
}

function updateInvoiceItem(id, field, value){
  let serviceChanged = false;

  invoiceItems = invoiceItems.map(item => {
    if(item.id !== id) return item;

    if(field === 'service'){
      const service = INVOICE_SERVICES.find(s => s.name === value);
      serviceChanged = true;

      return {
        ...item,
        service: value,
        description: service ? service.description : item.description,
        rate: service ? String(service.defaultRate) : item.rate,
        billingCycle: service ? service.billingCycle : item.billingCycle,
        quantityLabel: service ? service.quantityLabel : item.quantityLabel
      };
    }

    return { ...item, [field]: value };
  });

  if(serviceChanged || invoiceMode === 'preview'){
    renderInvoiceView();
  }
}

function addInvoiceItem(serviceName = 'Website Development'){
  invoiceItems = [...invoiceItems, createInvoiceItem(serviceName)];
  renderInvoiceView();
}

function removeInvoiceItem(id){
  invoiceItems = invoiceItems.filter(item => item.id !== id);

  if(invoiceItems.length === 0){
    invoiceItems = [createInvoiceItem('Website Development')];
  }

  renderInvoiceView();
}

function clearReimageInvoice(){
  invoiceData = createBlankInvoice();
  invoiceItems = [createInvoiceItem('Website Development')];
  invoiceMode = 'edit';
  renderInvoiceView();
}

function printReimageInvoice(){
  invoiceMode = 'preview';
  renderInvoiceView();
  setTimeout(() => window.print(), 80);
}

function renderInvoiceView(){
  const area = document.getElementById('contentArea');
  const totals = invoiceTotals();

  area.innerHTML = `
    <section class="ri-invoice-module">
      <div class="ri-invoice-actions no-print">
        <div>
          <div class="kicker">Invoices</div>
          <h2>Marketing Invoice Generator</h2>
          <p class="muted">Choose services from pricing presets, confirm weekly/monthly/one-time billing, preview, then print or save as PDF.</p>
        </div>

        <div class="ri-invoice-action-buttons">
          <button class="btn ${invoiceMode === 'edit' ? 'btn-primary' : 'btn-secondary'}" id="invoiceEditBtn">Edit</button>
          <button class="btn ${invoiceMode === 'preview' ? 'btn-primary' : 'btn-secondary'}" id="invoicePreviewBtn">Preview</button>
          <button class="btn btn-light" id="invoiceClearBtn">Clear</button>
          <button class="btn btn-primary" id="invoicePrintBtn">Print / Save PDF</button>
        </div>
      </div>

      <div class="ri-invoice-view ${invoiceMode === 'edit' ? 'show-edit' : 'show-preview'}">
        <div class="ri-invoice-form no-print">
          ${invoiceFormHtml()}
        </div>

        ${invoicePreviewHtml(totals)}
      </div>
    </section>`;

  bindInvoiceEvents();
}

function invoiceFormHtml(){
  return `
    <div class="ri-form-card">
      <h3>Invoice Details</h3>
      <div class="ri-form-grid">
        <label>Invoice #<input class="input" value="${escapeAttr(invoiceData.invoiceNumber)}" data-invoice-field="invoiceNumber"></label>
        <label>Invoice Date<input class="input" type="date" value="${escapeAttr(invoiceData.invoiceDate)}" data-invoice-field="invoiceDate"></label>
        <label>Due Date<input class="input" type="date" value="${escapeAttr(invoiceData.dueDate)}" data-invoice-field="dueDate"></label>
        <label>CT Tax %<input class="input" type="number" step="0.01" value="${escapeAttr(invoiceData.taxRate)}" data-invoice-field="taxRate"></label>
      </div>
    </div>

    <div class="ri-form-card">
      <h3>Client</h3>
      <div class="ri-form-grid">
        <label>Client Name<input class="input" value="${escapeAttr(invoiceData.clientName)}" data-invoice-field="clientName"></label>
        <label>Business Name<input class="input" value="${escapeAttr(invoiceData.clientBusiness)}" data-invoice-field="clientBusiness"></label>
        <label>Email<input class="input" value="${escapeAttr(invoiceData.clientEmail)}" data-invoice-field="clientEmail"></label>
        <label>Phone<input class="input" value="${escapeAttr(invoiceData.clientPhone)}" data-invoice-field="clientPhone"></label>
        <label class="wide">Address<input class="input" value="${escapeAttr(invoiceData.clientAddress)}" data-invoice-field="clientAddress"></label>
      </div>
    </div>

    <div class="ri-form-card">
      <div class="ri-section-row">
        <div>
          <h3>Services</h3>
          <p class="muted">Presets fill the rate and billing type automatically. You can still edit price, quantity, and billing cycle.</p>
        </div>
        <button class="btn btn-secondary" id="addInvoiceServiceBtn">+ Add Service</button>
      </div>

      <div class="ri-service-editor">
        ${invoiceItems.map(item => invoiceItemEditorHtml(item)).join('')}
      </div>
    </div>

    <div class="ri-form-card">
      <h3>Adjustments</h3>
      <div class="ri-form-grid">
        <label>Discount<input class="input" type="number" step="0.01" value="${escapeAttr(invoiceData.discount)}" data-invoice-field="discount"></label>
        <label>Amount Paid<input class="input" type="number" step="0.01" value="${escapeAttr(invoiceData.amountPaid)}" data-invoice-field="amountPaid"></label>
      </div>
    </div>

    <div class="ri-form-card">
      <h3>Notes / Terms</h3>
      <label>Notes<textarea data-invoice-field="notes">${escapeHtml(invoiceData.notes)}</textarea></label>
      <label>Terms<textarea data-invoice-field="terms">${escapeHtml(invoiceData.terms)}</textarea></label>
    </div>`;
}

function invoiceItemEditorHtml(item){
  return `
    <div class="ri-service-row" data-item-id="${escapeAttr(item.id)}">
      <select data-item-field="service" title="Service preset">
        ${INVOICE_SERVICES.map(service => `
          <option value="${escapeAttr(service.name)}" ${item.service === service.name ? 'selected' : ''}>${escapeHtml(service.name)} — ${billingLabel(service.billingCycle)}</option>
        `).join('')}
      </select>

      <select data-item-field="billingCycle" title="Billing cycle">
        ${BILLING_OPTIONS.map(option => `
          <option value="${escapeAttr(option)}" ${item.billingCycle === option ? 'selected' : ''}>${billingLabel(option)}</option>
        `).join('')}
      </select>

      <input class="input" placeholder="Service description" value="${escapeAttr(item.description)}" data-item-field="description">
      <input class="input" type="number" min="0" step="0.01" value="${escapeAttr(item.quantity)}" data-item-field="quantity" title="Quantity / months / weeks / hours">
      <input class="input" type="number" min="0" step="0.01" value="${escapeAttr(item.rate)}" data-item-field="rate" title="Rate">
      <strong>${invoiceMoney(Number(item.quantity || 0) * Number(item.rate || 0))}</strong>
      <button class="btn btn-danger" data-remove-item="${escapeAttr(item.id)}">Remove</button>
    </div>`;
}

function invoicePreviewHtml(totals){
  return `
    <article class="ri-invoice-preview print-area">
      <header class="ri-paper-header">
        <div class="ri-paper-brand">
          <img src="/logo.png" alt="RE IMAGE Business Solutions logo" onerror="this.style.display='none'">
          <div>
            <h1>RE IMAGE</h1>
            <p>Business Solutions</p>
          </div>
        </div>

        <div class="ri-paper-meta">
          <h2>Invoice</h2>
          <p><strong>Invoice #:</strong> ${escapeHtml(invoiceData.invoiceNumber || '—')}</p>
          <p><strong>Date:</strong> ${formatDateOnly(invoiceData.invoiceDate)}</p>
          <p><strong>Due:</strong> ${formatDateOnly(invoiceData.dueDate)}</p>
        </div>
      </header>

      <section class="ri-paper-info-grid">
        <div>
          <h3>Bill To</h3>
          <p><strong>${escapeHtml(invoiceData.clientName || 'Client Name')}</strong></p>
          <p>${escapeHtml(invoiceData.clientBusiness || 'Business Name')}</p>
          <p>${escapeHtml(invoiceData.clientEmail || 'Client email')}</p>
          <p>${escapeHtml(invoiceData.clientPhone || 'Client phone')}</p>
          <p>${escapeHtml(invoiceData.clientAddress || 'Client address')}</p>
        </div>

        <div>
          <h3>From</h3>
          <p><strong>RE IMAGE Business Solutions</strong></p>
          <p>Marketing • Websites • Branding • Automation</p>
          <p>Connecticut, USA</p>
          <p>+1 (860) 718-5928</p>
          <p>reimagbs@gmail.com</p>
        </div>

        <div>
          <h3>Project Summary</h3>
          <p>${invoiceItems.length} service${invoiceItems.length === 1 ? '' : 's'} selected</p>
          <p>Tax: CT ${escapeHtml(invoiceData.taxRate || '0')}%</p>
          <p>Payment terms: Due by invoice date unless otherwise agreed.</p>
        </div>
      </section>

      <table class="ri-invoice-table">
        <thead>
          <tr>
            <th>Service</th>
            <th>Billing</th>
            <th>Description</th>
            <th>Qty</th>
            <th>Rate</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          ${invoiceItems.map(item => `
            <tr>
              <td>${escapeHtml(item.service)}</td>
              <td>${escapeHtml(billingLabel(item.billingCycle))}</td>
              <td>${escapeHtml(item.description || '—')}</td>
              <td>${escapeHtml(item.quantity || '0')}</td>
              <td>${invoiceMoney(item.rate)}</td>
              <td>${invoiceMoney(Number(item.quantity || 0) * Number(item.rate || 0))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <section class="ri-paper-bottom">
        <div class="ri-paper-notes">
          <h3>Notes</h3>
          <p>${escapeHtml(invoiceData.notes)}</p>
          <h3>Terms</h3>
          <p>${escapeHtml(invoiceData.terms)}</p>
        </div>

        <div class="ri-paper-totals">
          <div><span>Subtotal</span><strong>${invoiceMoney(totals.subtotal)}</strong></div>
          <div><span>Discount</span><strong>-${invoiceMoney(totals.discount)}</strong></div>
          <div><span>CT Tax (${escapeHtml(invoiceData.taxRate || '0')}%)</span><strong>${invoiceMoney(totals.tax)}</strong></div>
          <div><span>Total</span><strong>${invoiceMoney(totals.total)}</strong></div>
          <div><span>Paid</span><strong>${invoiceMoney(totals.amountPaid)}</strong></div>
          <div class="ri-balance-row"><span>Balance Due</span><strong>${invoiceMoney(totals.balanceDue)}</strong></div>
        </div>
      </section>

      <footer class="ri-paper-footer">
        <p>Thank you for trusting RE IMAGE Business Solutions.</p>
      </footer>
    </article>`;
}

function bindInvoiceEvents(){
  const editBtn = document.getElementById('invoiceEditBtn');
  const previewBtn = document.getElementById('invoicePreviewBtn');
  const clearBtn = document.getElementById('invoiceClearBtn');
  const printBtn = document.getElementById('invoicePrintBtn');
  const addBtn = document.getElementById('addInvoiceServiceBtn');

  if(editBtn) editBtn.addEventListener('click', () => { invoiceMode = 'edit'; renderInvoiceView(); });
  if(previewBtn) previewBtn.addEventListener('click', () => { invoiceMode = 'preview'; renderInvoiceView(); });
  if(clearBtn) clearBtn.addEventListener('click', clearReimageInvoice);
  if(printBtn) printBtn.addEventListener('click', printReimageInvoice);
  if(addBtn) addBtn.addEventListener('click', () => addInvoiceItem('Website Development'));

  document.querySelectorAll('[data-invoice-field]').forEach(input => {
  input.addEventListener('change', () => updateInvoiceField(input.dataset.invoiceField, input.value));
});

  document.querySelectorAll('.ri-service-row').forEach(row => {
    const id = row.dataset.itemId;

    row.querySelectorAll('[data-item-field]').forEach(input => {
      input.addEventListener('change', () => updateInvoiceItem(id, input.dataset.itemField, input.value));
    });
  });

  document.querySelectorAll('[data-remove-item]').forEach(btn => {
    btn.addEventListener('click', () => removeInvoiceItem(btn.dataset.removeItem));
  });
}

/* =========================
   HELPERS
========================= */

function serviceOptions(){
  const services = [
    'all',
    'Consultation',
    'Growth Foundation',
    'Full Scale System',
    'Social Media Management',
    'Website Development',
    'AI Automation',
    'General Question'
  ];

  return services.map(s => `
    <option value="${escapeAttr(s)}" ${filters.service === s ? 'selected' : ''}>
      ${s === 'all' ? 'All Services' : escapeHtml(s)}
    </option>
  `).join('');
}

function statusOptions(){
  return ['all', ...STATUS_OPTIONS].map(s => `
    <option value="${s}" ${filters.status === s ? 'selected' : ''}>
      ${s === 'all' ? 'All Statuses' : titleCase(s)}
    </option>
  `).join('');
}

function statusBadge(status = 'new'){
  const s = status || 'new';
  return `<span class="badge badge-${escapeAttr(s)}">${escapeHtml(titleCase(s))}</span>`;
}

function consultationLabel(r){
  return r && r.consultation_date
    ? `${formatDateOnly(r.consultation_date)} ${r.consultation_time || ''}`
    : '—';
}

function parseLocalDate(iso){
  const [y,m,d] = String(iso).split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDateOnly(iso){
  return iso
    ? parseLocalDate(iso).toLocaleDateString('en-US', {
        month:'short',
        day:'numeric',
        year:'numeric'
      })
    : '—';
}

function formatDateTime(value){
  return value
    ? new Date(value).toLocaleString('en-US', {
        month:'short',
        day:'numeric',
        year:'numeric',
        hour:'numeric',
        minute:'2-digit'
      })
    : '—';
}

function fullName(r){
  return `${r.first_name || ''} ${r.last_name || ''}`.trim() || 'Unknown';
}

function titleCase(s){
  return String(s || '')
    .replace(/_/g,' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function escapeHtml(v){
  return String(v ?? '').replace(/[&<>"']/g, m => ({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#039;'
  }[m]));
}

function escapeAttr(v){
  return escapeHtml(v).replace(/"/g,'&quot;');
}

init();
