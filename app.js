import './styles.css';
import { createClient } from '@supabase/supabase-js';
import QRCode from 'qrcode';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const QR_REDIRECT_BASE_URL = (import.meta.env.VITE_QR_REDIRECT_BASE_URL || `${SUPABASE_URL}/functions/v1/qr-redirect`).replace(/\/+$/,'');
const ADMIN_EMAILS = ['reimagbs@gmail.com', 'reimagebs@gmail.com'];

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
let qrData = {
  fileName: 'reimage-qr-code',
  colorDark: '#0c1f2e',
  colorLight: '#ffffff',
  size: 1000,
  margin: 3
};
let dynamicQrCodes = [];
let selectedDynamicQrId = null;
let salesApplications = [];
let salesmanProfiles = [];
let salesLeads = [];
let salesInvoiceRequests = [];
let salesQrRequests = [];
let salesExamAttempts = [];
let selectedSalesApplicationId = null;
let crmClients = [];
let crmProjects = [];
let crmPotentialLeads = [];
let crmAppointments = [];
let videoSubmissions = [];

const DEFAULT_INVOICE_SERVICE = 'Static Website + SEO';

const STATUS_OPTIONS = ['new', 'contacted', 'closed', 'spam'];

async function init(){
  invoiceData = createBlankInvoice();
  invoiceItems = [createInvoiceItem(DEFAULT_INVOICE_SERVICE)];
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
          <input class="input" id="email" type="email" required placeholder="reimagebs@gmail.com">
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
          <button class="tab ${activeView === 'sales' ? 'active' : ''}" data-view="sales">Sales Team</button>
          <button class="tab ${activeView === 'crm' ? 'active' : ''}" data-view="crm">CRM Sender</button>
          <button class="tab ${activeView === 'video' ? 'active' : ''}" data-view="video">Video Send</button>
          <button class="tab ${activeView === 'invoice' ? 'active' : ''}" data-view="invoice">Invoices</button>
          <button class="tab ${activeView === 'qr' ? 'active' : ''}" data-view="qr">QR Codes</button>
        </div>

        ${['invoice','qr','sales','crm','video'].includes(activeView) ? '' : `
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

  if(activeView === 'invoice'){
    renderStats();
    renderInvoiceView();
    return;
  }

  if(activeView === 'qr'){
    renderStats();
    await renderQrView();
    return;
  }

  if(activeView === 'sales'){
    renderStats();
    await renderSalesTeamView();
    return;
  }

  if(activeView === 'video'){
    renderStats();
    await renderVideoSendView();
    return;
  }

  await loadRequests();
}

function bindTopEvents(){
  document.getElementById('signOutBtn').addEventListener('click', () => supabase.auth.signOut());
  document.getElementById('refreshBtn').addEventListener('click', () => {
    if(activeView === 'invoice'){
      renderInvoiceView();
    } else if(activeView === 'qr'){
      renderQrView();
    } else if(activeView === 'sales'){
      renderSalesTeamView();
    } else if(activeView === 'crm'){
      renderCrmSenderView();
    } else if(activeView === 'video'){
      renderVideoSendView();
    } else {
      loadRequests();
    }
  });

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
  } else if(activeView === 'qr'){
    renderQrView();
  } else if(activeView === 'crm'){
    renderCrmSenderView();
  } else if(activeView === 'video'){
    renderVideoSendView();
  } else {
    renderListView();
  }
}

async function renderVideoSendView(){
  const area = document.getElementById('contentArea');
  area.innerHTML = '<div class="table-card"><div class="detail-body muted">Loading synced clients and recent video submissions...</div></div>';

  try{
    await loadVideoReferenceData();
  } catch(error){
    area.innerHTML = `
      <div class="table-card">
        <div class="detail-body notice show error">${escapeHtml(error.message || 'Could not load video sender data.')}</div>
      </div>`;
    return;
  }

  area.innerHTML = `
    <section class="video-sender-layout">
      <div class="table-card">
        <div class="table-head">
          <h2>Send videos to Video Manager</h2>
          <span class="muted">Editor pulls these from the Python app on his laptop</span>
        </div>

        <form class="video-send-form" id="videoSendForm">
          <label>Client
            <select id="videoClient" required>
              <option value="">Choose synced client</option>
              ${crmClients.map(client => `<option value="${client.crm_id}" data-name="${escapeAttr(client.business_name || '')}">${escapeHtml(client.business_name || 'Client')}</option>`).join('')}
            </select>
          </label>

          <label>Due Date
            <input class="input" id="videoDueDate" type="date" value="${escapeAttr(defaultVideoDueDate())}" readonly>
          </label>

          <label class="wide">Videos
            <input class="input" id="videoFiles" type="file" accept="video/*" multiple required>
          </label>

          <label class="wide">Notes for Editor
            <textarea id="videoNotes" placeholder="Explain the idea, edit direction, priorities, export needs, reference links, or anything your editor needs."></textarea>
          </label>

          <div class="video-selected wide" id="videoSelectedFiles">
            <span class="muted">No videos selected yet.</span>
          </div>

          <div class="crm-send-actions wide">
            <button class="btn btn-primary" type="submit" id="videoSendBtn">Send to Video Manager</button>
            <button class="btn btn-light" type="button" id="videoClearBtn">Clear</button>
          </div>

          <div class="notice" id="videoNotice"></div>
        </form>
      </div>

      <div class="table-card">
        <div class="table-head">
          <h2>Recent video sends</h2>
          <span class="muted">${videoSubmissions.length} synced</span>
        </div>

        <div class="table-wrap video-submissions-table">
          <table>
            <thead>
              <tr>
                <th>Created</th>
                <th>Client</th>
                <th>Due</th>
                <th>Files</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${videoSubmissions.map(item => `
                <tr>
                  <td>${formatDateTime(item.created_at)}</td>
                  <td><strong>${escapeHtml(item.client_name || 'Client')}</strong><br><span class="muted">${escapeHtml(item.submitted_by_email || '')}</span></td>
                  <td>${escapeHtml(item.due_date || '—')}</td>
                  <td>${Array.isArray(item.files) ? item.files.length : 0}</td>
                  <td>${escapeHtml(titleCase(item.status || 'new'))}</td>
                </tr>
              `).join('') || `<tr><td colspan="5" class="muted">No videos sent yet.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    </section>`;

  const form = document.getElementById('videoSendForm');
  const fileInput = document.getElementById('videoFiles');
  const clear = document.getElementById('videoClearBtn');
  form.addEventListener('submit', submitVideoSend);
  fileInput.addEventListener('change', renderSelectedVideoFiles);
  clear.addEventListener('click', () => {
    form.reset();
    renderSelectedVideoFiles();
    showVideoNotice('Form cleared.');
  });
  renderSelectedVideoFiles();
}

async function loadVideoReferenceData(){
  const [clientsResult, submissionsResult] = await Promise.all([
    supabase.from('crm_clients').select('*').order('business_name', { ascending:true }),
    supabase.from('video_submissions').select('*').order('created_at', { ascending:false }).limit(20)
  ]);

  if(clientsResult.error) throw clientsResult.error;
  if(submissionsResult.error) throw submissionsResult.error;

  crmClients = clientsResult.data || [];
  videoSubmissions = submissionsResult.data || [];
}

function renderSelectedVideoFiles(){
  const target = document.getElementById('videoSelectedFiles');
  const input = document.getElementById('videoFiles');
  if(!target || !input) return;
  const files = Array.from(input.files || []);
  target.innerHTML = files.length ? files.map(file => `
    <div class="video-file-pill">
      <strong>${escapeHtml(file.name)}</strong>
      <span>${formatBytes(file.size)} · ${escapeHtml(file.type || 'video file')}</span>
    </div>
  `).join('') : '<span class="muted">No videos selected yet.</span>';
}

async function submitVideoSend(e){
  e.preventDefault();
  const btn = document.getElementById('videoSendBtn');
  const clientSelect = document.getElementById('videoClient');
  const fileInput = document.getElementById('videoFiles');
  const clientCrmId = Number(clientSelect.value || 0) || null;
  const clientName = clientSelect.selectedOptions[0]?.dataset.name || '';
  const files = Array.from(fileInput.files || []);
  const sentDate = todayIso();
  const dueDate = defaultVideoDueDate(sentDate);
  const clientSlug = slugFilePart(clientName || 'client');

  if(!clientCrmId || !clientName){
    showVideoNotice('Choose a synced client first.', true);
    return;
  }

  if(!files.length){
    showVideoNotice('Choose at least one video file.', true);
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Uploading...';

  const submissionId = crypto.randomUUID();
  const uploaded = [];
  const uploadedPaths = [];

  for(const [index, file] of files.entries()){
    const displayName = videoFileName(clientSlug, sentDate, index + 1, file.name);
    const path = `${clientCrmId}/${submissionId}/${displayName}`;
    showVideoNotice(`Uploading ${index + 1} of ${files.length}: ${displayName}`);

    const { data, error } = await supabase.storage
      .from('video-submissions')
      .upload(path, file, {
        cacheControl: '3600',
        contentType: file.type || 'video/mp4',
        upsert: false
      });

    if(error){
      btn.disabled = false;
      btn.textContent = 'Send to Video Manager';
      showVideoNotice(error.message, true);
      return;
    }

    uploaded.push({
      name: displayName,
      original_name: file.name,
      size: file.size,
      type: file.type,
      storage_path: data.path,
      uploaded_at: new Date().toISOString()
    });
    uploadedPaths.push(data.path);
  }

  showVideoNotice('Saving video job for editor...');
  const { error } = await supabase.from('video_submissions').insert([{
    client_crm_id: clientCrmId,
    client_name: clientName,
    notes: document.getElementById('videoNotes').value.trim(),
    due_date: dueDate,
    status: 'new',
    files: uploaded,
    submitted_by: session.user.id,
    submitted_by_email: session.user.email
  }]);

  btn.disabled = false;
  btn.textContent = 'Send to Video Manager';

  if(error){
    if(uploadedPaths.length){
      await supabase.storage.from('video-submissions').remove(uploadedPaths);
    }
    showVideoNotice(`Could not save video job: ${error.message}`, true);
    return;
  }

  e.target.reset();
  renderSelectedVideoFiles();
  await renderVideoSendView();
  showVideoNotice('Sent to Video Manager. Your editor can sync it from the Python app.');
}

function showVideoNotice(message, isError = false){
  const notice = document.getElementById('videoNotice');
  if(!notice) return;
  notice.textContent = message;
  notice.className = `notice show${isError ? ' error' : ''}`;
}

function todayIso(){
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(iso, days){
  const [year, month, day] = String(iso).split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function defaultVideoDueDate(baseIso = todayIso()){
  return addDaysIso(baseIso, 5);
}

function slugFilePart(value){
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'client';
}

function fileExtension(name){
  const match = String(name || '').match(/\.([a-zA-Z0-9]{1,12})$/);
  return match ? `.${match[1].toLowerCase()}` : '';
}

function videoFileName(clientSlug, sentDate, index, originalName){
  const ext = fileExtension(originalName) || '.mp4';
  return `${clientSlug}-${sentDate}-video-${String(index).padStart(2, '0')}${ext}`;
}


async function renderCrmSenderView(){
  const area = document.getElementById('contentArea');
  area.innerHTML = '<div class="table-card"><div class="detail-body muted">Loading CRM clients, projects, and potential leads...</div></div>';

  try{
    await loadCrmReferenceData();
  } catch(error){
    area.innerHTML = `
      <div class="table-card">
        <div class="detail-body notice show error">${escapeHtml(error.message || 'Could not load CRM reference data.')}</div>
      </div>`;
    return;
  }

  area.innerHTML = `
    <section class="crm-sender-layout">
      <div class="table-card">
        <div class="table-head">
          <h2>Send appointment to Client Management</h2>
          <span class="muted">Shows on the CRM appointment calendar and 48-hour reminders</span>
        </div>

        <form class="crm-send-form" id="crmAppointmentForm">
          <label>Client
            <select id="appointmentClient" required>
              <option value="">Choose synced client</option>
              ${crmClients.map(client => `<option value="${client.crm_id}" data-name="${escapeAttr(client.business_name || '')}">${escapeHtml(client.business_name || 'Client')}</option>`).join('')}
            </select>
          </label>

          <label>Appointment Name
            <input class="input" id="appointmentTitle" placeholder="Consultation, follow-up, project meeting" required>
          </label>

          <label>Date
            <input class="input" id="appointmentDate" type="date" required>
          </label>

          <label>Time
            <input class="input" id="appointmentTime" type="time" required>
          </label>

          <label class="wide">Notes
            <textarea id="appointmentNotes" placeholder="Call details, meeting link, address, or anything to remember"></textarea>
          </label>

          <div class="crm-send-actions wide">
            <button class="btn btn-primary" type="submit" id="crmAppointmentSendBtn">Send Appointment to CRM</button>
            <button class="btn btn-light" type="button" id="crmAppointmentClearBtn">Clear</button>
          </div>

          <div class="notice" id="crmAppointmentNotice"></div>
        </form>
      </div>

      <div class="table-card">
        <div class="table-head">
          <h2>Send new lead to Client Management</h2>
          <span class="muted">Lands in the CRM Potential Leads tab first</span>
        </div>

        <form class="crm-send-form" id="crmLeadForm">
          <label>Lead Name
            <input class="input" id="leadName" placeholder="Person's name" required>
          </label>

          <label>Company
            <input class="input" id="leadCompany" placeholder="Business or organization">
          </label>

          <label>Phone
            <input class="input" id="leadPhone" type="tel" placeholder="Phone number">
          </label>

          <label>Email
            <input class="input" id="leadEmail" type="email" placeholder="Email address">
          </label>

          <label class="wide">Potential Project
            <textarea id="leadProject" placeholder="Website, marketing, CRM, automation, maintenance, or other project details" required></textarea>
          </label>

          <label class="wide">Notes
            <textarea id="leadNotes" placeholder="Budget, timeline, source, next step, or extra context"></textarea>
          </label>

          <div class="crm-send-actions wide">
            <button class="btn btn-primary" type="submit" id="crmLeadSendBtn">Send Lead to CRM</button>
            <button class="btn btn-light" type="button" id="crmLeadClearBtn">Clear</button>
          </div>

          <div class="notice" id="crmLeadNotice"></div>
        </form>
      </div>

      <div class="table-card">
        <div class="table-head">
          <h2>Send work to Client Management</h2>
          <span class="muted">Uses synced CRM clients and projects for accurate routing</span>
        </div>

        <form class="crm-send-form" id="crmWorkForm">
          <label>Client
            <select id="crmClient" required>
              <option value="">Choose synced client</option>
              ${crmClients.map(client => `<option value="${client.crm_id}" data-name="${escapeAttr(client.business_name || '')}">${escapeHtml(client.business_name || 'Client')}</option>`).join('')}
            </select>
          </label>

          <label>Project
            <select id="crmProject">
              <option value="">Choose client first</option>
            </select>
          </label>

          <label>Task or Ticket
            <select id="crmItemType">
              <option value="task">Task</option>
              <option value="ticket">Ticket</option>
            </select>
          </label>

          <label class="wide">Title
            <input class="input" id="crmTitle" placeholder="What needs to be done" required>
          </label>

          <label>Due Date
            <input class="input" id="crmDueDate" type="date">
          </label>

          <label>Priority
            <select id="crmPriority">
              <option>Medium</option>
              <option>Low</option>
              <option>High</option>
              <option>Urgent</option>
            </select>
          </label>

          <label class="wide">Notes
            <textarea id="crmNotes" placeholder="Extra context, links, request details, or follow-up notes"></textarea>
          </label>

          <div class="crm-send-actions wide">
            <button class="btn btn-primary" type="submit" id="crmSendBtn">Send to CRM</button>
            <button class="btn btn-light" type="button" id="crmClearBtn">Clear</button>
          </div>

          <div class="notice" id="crmNotice"></div>
        </form>
      </div>

      <div class="table-card">
        <div class="table-head">
          <h2>Recent potential leads</h2>
          <span class="muted">${crmPotentialLeads.length} synced</span>
        </div>

        <div class="table-wrap crm-leads-table">
          <table>
            <thead>
              <tr>
                <th>Created</th>
                <th>Lead</th>
                <th>Company</th>
                <th>Phone</th>
                <th>Project</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${crmPotentialLeads.map(lead => `
                <tr>
                  <td>${formatDateTime(lead.created_at)}</td>
                  <td><strong>${escapeHtml(lead.lead_name || '')}</strong><br><span class="muted">${escapeHtml(lead.email || '')}</span></td>
                  <td>${escapeHtml(lead.company || '')}</td>
                  <td>${escapeHtml(lead.phone || '')}</td>
                  <td>${escapeHtml(lead.potential_project || '')}</td>
                  <td>${escapeHtml(lead.status || 'pending')}</td>
                </tr>
              `).join('') || `<tr><td colspan="6" class="muted">No potential leads sent yet.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    </section>`;

  const form = document.getElementById('crmWorkForm');
  const leadForm = document.getElementById('crmLeadForm');
  const appointmentForm = document.getElementById('crmAppointmentForm');
  const clear = document.getElementById('crmClearBtn');
  const leadClear = document.getElementById('crmLeadClearBtn');
  const appointmentClear = document.getElementById('crmAppointmentClearBtn');
  const clientSelect = document.getElementById('crmClient');
  form.addEventListener('submit', submitCrmWork);
  leadForm.addEventListener('submit', submitCrmLead);
  appointmentForm.addEventListener('submit', submitCrmAppointment);
  clientSelect.addEventListener('change', updateCrmProjectOptions);
  clear.addEventListener('click', () => {
    form.reset();
    document.getElementById('crmPriority').value = 'Medium';
    updateCrmProjectOptions();
    showCrmNotice('Form cleared.');
  });
  leadClear.addEventListener('click', () => {
    leadForm.reset();
    showCrmLeadNotice('Lead form cleared.');
  });
  appointmentClear.addEventListener('click', () => {
    appointmentForm.reset();
    showCrmAppointmentNotice('Appointment form cleared.');
  });
  updateCrmProjectOptions();
}

async function loadCrmReferenceData(){
  const [clientsResult, projectsResult, leadsResult, appointmentsResult] = await Promise.all([
    supabase.from('crm_clients').select('*').order('business_name', { ascending:true }),
    supabase.from('crm_projects').select('*').order('client_name', { ascending:true }).order('title', { ascending:true }),
    supabase.from('crm_potential_leads').select('*').order('created_at', { ascending:false }).limit(20),
    supabase.from('crm_appointments').select('*').order('appointment_date', { ascending:true }).order('appointment_time', { ascending:true }).limit(30)
  ]);

  if(clientsResult.error) throw clientsResult.error;
  if(projectsResult.error) throw projectsResult.error;
  if(leadsResult.error) console.warn('Potential leads load failed:', leadsResult.error);
  if(appointmentsResult.error) console.warn('Appointments load failed:', appointmentsResult.error);

  crmClients = clientsResult.data || [];
  crmProjects = projectsResult.data || [];
  crmPotentialLeads = leadsResult.error ? [] : (leadsResult.data || []);
  crmAppointments = appointmentsResult.error ? [] : (appointmentsResult.data || []);
}

function updateCrmProjectOptions(){
  const clientSelect = document.getElementById('crmClient');
  const projectSelect = document.getElementById('crmProject');
  if(!clientSelect || !projectSelect) return;
  const clientId = Number(clientSelect.value || 0);
  const projects = crmProjects.filter(project => Number(project.client_crm_id) === clientId);
  projectSelect.innerHTML = `<option value="">${clientId ? 'No project / ticket only' : 'Choose client first'}</option>` + projects.map(project => `
    <option value="${project.crm_id}" data-title="${escapeAttr(project.title || '')}">
      Project #${project.crm_id} - ${escapeHtml(project.title || 'Project')} ${project.status ? `(${escapeHtml(project.status)})` : ''}
    </option>
  `).join('');
}

async function submitCrmWork(e){
  e.preventDefault();
  const btn = document.getElementById('crmSendBtn');
  const clientSelect = document.getElementById('crmClient');
  const projectSelect = document.getElementById('crmProject');
  const itemType = document.getElementById('crmItemType').value;
  const clientCrmId = Number(clientSelect.value || 0) || null;
  const projectCrmId = Number(projectSelect.value || 0) || null;
  const clientName = clientSelect.selectedOptions[0]?.dataset.name || '';
  const projectName = projectSelect.selectedOptions[0]?.dataset.title || '';
  const payload = {
    client_crm_id: clientCrmId,
    project_crm_id: projectCrmId,
    client_name: clientName,
    project_name: projectName,
    item_type: itemType,
    title: document.getElementById('crmTitle').value.trim(),
    due_date: document.getElementById('crmDueDate').value || null,
    priority: document.getElementById('crmPriority').value,
    notes: document.getElementById('crmNotes').value.trim(),
    source: 'reimage_admin_portal'
  };

  if(!payload.client_crm_id || !payload.client_name || !payload.title){
    showCrmNotice('Client and title are required.', true);
    return;
  }

  if(payload.item_type === 'task' && !payload.project_crm_id){
    showCrmNotice('Tasks must be tied to a synced project. Use Ticket if there is no project.', true);
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Sending...';
  const { error } = await supabase.from('crm_remote_inbox').insert([payload]);
  btn.disabled = false;
  btn.textContent = 'Send to CRM';

  if(error){
    showCrmNotice(error.message, true);
    return;
  }

  e.target.reset();
  document.getElementById('crmPriority').value = 'Medium';
  updateCrmProjectOptions();
  showCrmNotice('Sent. Open Website Inbox in Client Management and sync it.');
}

async function submitCrmLead(e){
  e.preventDefault();
  const btn = document.getElementById('crmLeadSendBtn');
  const payload = {
    lead_name: document.getElementById('leadName').value.trim(),
    company: document.getElementById('leadCompany').value.trim(),
    phone: document.getElementById('leadPhone').value.trim(),
    email: document.getElementById('leadEmail').value.trim(),
    potential_project: document.getElementById('leadProject').value.trim(),
    notes: document.getElementById('leadNotes').value.trim(),
    source: 'reimage_admin_portal'
  };

  if(!payload.lead_name || !payload.potential_project){
    showCrmLeadNotice('Lead name and potential project are required.', true);
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Sending...';
  const { error } = await supabase.from('crm_potential_leads').insert([payload]);
  btn.disabled = false;
  btn.textContent = 'Send Lead to CRM';

  if(error){
    showCrmLeadNotice(error.message, true);
    return;
  }

  e.target.reset();
  await renderCrmSenderView();
  showCrmLeadNotice('Lead sent. It will appear under Potential Leads in Client Management.');
}

async function submitCrmAppointment(e){
  e.preventDefault();
  const btn = document.getElementById('crmAppointmentSendBtn');
  const clientSelect = document.getElementById('appointmentClient');
  const clientCrmId = Number(clientSelect.value || 0) || null;
  const payload = {
    client_crm_id: clientCrmId,
    client_name: clientSelect.selectedOptions[0]?.dataset.name || '',
    title: document.getElementById('appointmentTitle').value.trim(),
    appointment_date: document.getElementById('appointmentDate').value || null,
    appointment_time: document.getElementById('appointmentTime').value || null,
    notes: document.getElementById('appointmentNotes').value.trim(),
    source: 'reimage_admin_portal'
  };

  if(!payload.client_crm_id || !payload.client_name || !payload.title || !payload.appointment_date || !payload.appointment_time){
    showCrmAppointmentNotice('Client, appointment name, date, and time are required.', true);
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Sending...';
  const { error } = await supabase.from('crm_appointments').insert([payload]);
  btn.disabled = false;
  btn.textContent = 'Send Appointment to CRM';

  if(error){
    showCrmAppointmentNotice(error.message, true);
    return;
  }

  e.target.reset();
  showCrmAppointmentNotice('Appointment sent. It will appear in Client Management after appointment sync.');
}

function showCrmNotice(message, isError = false){
  const notice = document.getElementById('crmNotice');
  if(!notice) return;
  notice.textContent = message;
  notice.className = `notice show${isError ? ' error' : ''}`;
}

function showCrmLeadNotice(message, isError = false){
  const notice = document.getElementById('crmLeadNotice');
  if(!notice) return;
  notice.textContent = message;
  notice.className = `notice show${isError ? ' error' : ''}`;
}

function showCrmAppointmentNotice(message, isError = false){
  const notice = document.getElementById('crmAppointmentNotice');
  if(!notice) return;
  notice.textContent = message;
  notice.className = `notice show${isError ? ' error' : ''}`;
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
   QR CODE GENERATOR
========================= */

async function renderQrView(){
  await loadDynamicQrCodes();

  const selectedDynamic = selectedDynamicQr();

  document.getElementById('contentArea').innerHTML = `
    <section class="qr-module">
      <div class="qr-actions">
        <div>
          <div class="kicker">No Subscription QR Tools</div>
          <h2>QR Code Generator</h2>
          <p class="muted">Dynamic codes use your redirect link so the destination can be edited later.</p>
        </div>

        <div class="qr-action-buttons">
          <button class="btn btn-secondary" id="qrResetBtn">Reset Style</button>
          <button class="btn btn-light" id="qrSvgBtn">Download SVG</button>
          <button class="btn btn-primary" id="qrPngBtn">Download PNG</button>
        </div>
      </div>

      <div class="qr-workspace">
        <div class="qr-editor-stack">
          ${dynamicQrHtml(selectedDynamic)}
          ${qrStyleHtml()}
        </div>

        <aside class="qr-preview-card">
          <div class="qr-preview-head">
            <div>
              <div class="kicker">Dynamic Preview</div>
              <h3>Scannable Code</h3>
            </div>
            <span class="qr-mode-pill dynamic">dynamic</span>
          </div>

          <div class="qr-canvas-wrap">
            <canvas id="qrCanvas" width="420" height="420" aria-label="Generated QR code"></canvas>
          </div>

          <label class="qr-preview-label">QR Encodes Redirect URL</label>
          <p class="muted qr-current-url" id="qrCurrentUrl">${escapeHtml(currentQrPayload())}</p>
        </aside>
      </div>
    </section>`;

  bindQrEvents();

  if(selectedDynamic){
    generateQrCode(true);
  } else {
    clearQrCanvas();
    const label = document.getElementById('qrCurrentUrl');
    if(label) label.textContent = '';
  }
}

function dynamicQrHtml(selected){
  return `
    <div class="qr-dynamic-layout">
      <form class="qr-form" id="qrDynamicForm">
        <div class="qr-form-head">
          <div>
            <div class="kicker">Dynamic QR</div>
            <h3>${selected ? 'Edit Redirect' : 'Create Redirect'}</h3>
          </div>
          <button class="btn btn-secondary" type="button" id="newDynamicQrBtn">New</button>
        </div>

        <div class="qr-form-grid">
          <div>
            <label for="dynamicQrTitle">Name</label>
            <input class="input" id="dynamicQrTitle" required value="${escapeAttr(selected?.title || '')}" placeholder="Spring postcard">
          </div>

          <div>
            <label for="dynamicQrSlug">Short Slug</label>
            <input class="input" id="dynamicQrSlug" required value="${escapeAttr(selected?.slug || '')}" placeholder="spring-postcard">
          </div>

          <div class="wide">
            <label for="dynamicQrDestination">Editable Destination URL</label>
            <input class="input" id="dynamicQrDestination" type="url" required value="${escapeAttr(selected?.destination_url || '')}" placeholder="https://yourwebsite.com/current-offer">
          </div>

          <div>
            <label for="dynamicQrActive">Status</label>
            <select id="dynamicQrActive">
              <option value="true" ${selected?.is_active !== false ? 'selected' : ''}>Active</option>
              <option value="false" ${selected?.is_active === false ? 'selected' : ''}>Paused</option>
            </select>
          </div>
        </div>

        <div class="qr-redirect-box">
          <span>Permanent QR Link</span>
          <strong id="dynamicQrRedirect">${escapeHtml(selected ? dynamicQrUrl(selected.slug) : `${QR_REDIRECT_BASE_URL}/your-slug`)}</strong>
        </div>

        <div class="action-row">
          <button class="btn btn-primary" type="submit">${selected ? 'Save Dynamic QR' : 'Create Dynamic QR'}</button>
          ${selected ? `<button class="btn btn-danger" type="button" id="deleteDynamicQrBtn">Delete</button>` : ''}
        </div>

        <div class="notice" id="qrNotice"></div>
      </form>

      <div class="qr-list-card">
        <div class="qr-form-head">
          <div>
            <div class="kicker">Saved Redirects</div>
            <h3>Dynamic Codes</h3>
          </div>
        </div>

        <div class="qr-dynamic-list">
          ${
            dynamicQrCodes.length
              ? dynamicQrCodes.map(code => dynamicQrRow(code)).join('')
              : `<div class="empty-detail">No dynamic QR codes yet.</div>`
          }
        </div>
      </div>
    </div>`;
}

function qrStyleHtml(){
  return `
    <form class="qr-form qr-style-form" id="qrStyleForm">
      <div class="qr-form-head">
        <div>
          <div class="kicker">Code Style</div>
          <h3>Download Settings</h3>
        </div>
      </div>

      <div class="qr-form-grid">
        <div>
          <label for="qrFileName">File Name</label>
          <input class="input" id="qrFileName" value="${escapeAttr(qrData.fileName)}" placeholder="business-card-qr">
        </div>

        <div>
          <label for="qrSize">PNG Size</label>
          <select id="qrSize">
            ${[600,800,1000,1400,2000].map(size => `
              <option value="${size}" ${Number(qrData.size) === size ? 'selected' : ''}>${size} px</option>
            `).join('')}
          </select>
        </div>

        <div>
          <label for="qrColorDark">Code Color</label>
          <input class="input" id="qrColorDark" type="color" value="${escapeAttr(qrData.colorDark)}">
        </div>

        <div>
          <label for="qrColorLight">Background</label>
          <input class="input" id="qrColorLight" type="color" value="${escapeAttr(qrData.colorLight)}">
        </div>
      </div>
    </form>`;
}

function dynamicQrRow(code){
  return `
    <button class="qr-dynamic-row ${selectedDynamicQrId === code.id ? 'active' : ''}" data-dynamic-id="${escapeAttr(code.id)}">
      <span>
        <strong>${escapeHtml(code.title)}</strong>
        <em>${escapeHtml(dynamicQrUrl(code.slug))}</em>
      </span>
      <small>${code.is_active ? 'Active' : 'Paused'} &middot; ${Number(code.scan_count || 0)} scans</small>
    </button>`;
}

function bindQrEvents(){
  const dynamicForm = document.getElementById('qrDynamicForm');
  if(dynamicForm){
    dynamicForm.addEventListener('submit', saveDynamicQr);
  }

  const newDynamicQrBtn = document.getElementById('newDynamicQrBtn');
  if(newDynamicQrBtn){
    newDynamicQrBtn.addEventListener('click', clearDynamicQrForm);
  }

  const deleteDynamicQrBtn = document.getElementById('deleteDynamicQrBtn');
  if(deleteDynamicQrBtn){
    deleteDynamicQrBtn.addEventListener('click', deleteDynamicQr);
  }

  document.querySelectorAll('.qr-dynamic-row').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedDynamicQrId = btn.dataset.dynamicId;
      renderQrView();
    });
  });

  ['qrFileName','qrSize','qrColorDark','qrColorLight','dynamicQrSlug'].forEach(id => {
    const input = document.getElementById(id);
    if(!input) return;

    input.addEventListener('input', () => {
      updateQrDataFromForm();
      updateDynamicRedirectPreview();
      generateQrCode(true);
    });

    input.addEventListener('change', () => {
      updateQrDataFromForm();
      updateDynamicRedirectPreview();
      generateQrCode(true);
    });
  });

  document.getElementById('qrResetBtn').addEventListener('click', () => {
    qrData = {
      ...qrData,
      fileName: 'reimage-qr-code',
      colorDark: '#0c1f2e',
      colorLight: '#ffffff',
      size: 1000,
      margin: 3
    };
    renderQrView();
  });

  document.getElementById('qrPngBtn').addEventListener('click', downloadQrPng);
  document.getElementById('qrSvgBtn').addEventListener('click', downloadQrSvg);
}

function updateQrDataFromForm(){
  const fileName = document.getElementById('qrFileName');
  const dark = document.getElementById('qrColorDark');
  const light = document.getElementById('qrColorLight');
  const size = document.getElementById('qrSize');

  qrData = {
    ...qrData,
    fileName: fileName ? sanitizeFileName(fileName.value.trim() || 'qr-code') : qrData.fileName,
    colorDark: dark ? dark.value : qrData.colorDark,
    colorLight: light ? light.value : qrData.colorLight,
    size: size ? Number(size.value) : qrData.size
  };
}

async function loadDynamicQrCodes(){
  const { data, error } = await supabase
    .from('dynamic_qr_codes')
    .select('*')
    .order('created_at', { ascending:false });

  if(error){
    dynamicQrCodes = [];
    console.error('Dynamic QR load failed:', error);
    return;
  }

  dynamicQrCodes = data || [];
}

async function saveDynamicQr(e){
  e.preventDefault();
  updateQrDataFromForm();

  const notice = document.getElementById('qrNotice');
  const selected = selectedDynamicQr();
  const payload = {
    title: document.getElementById('dynamicQrTitle').value.trim(),
    slug: slugify(document.getElementById('dynamicQrSlug').value.trim()),
    destination_url: document.getElementById('dynamicQrDestination').value.trim(),
    is_active: document.getElementById('dynamicQrActive').value === 'true'
  };

  if(!payload.title || !payload.slug){
    showQrError('Add a name and short slug first.');
    return;
  }

  if(!isValidQrUrl(payload.destination_url)){
    showQrError('Enter a full destination URL that starts with http:// or https://.');
    return;
  }

  notice.className = 'notice show';
  notice.textContent = selected ? 'Saving dynamic QR...' : 'Creating dynamic QR...';

  const query = selected
    ? supabase.from('dynamic_qr_codes').update(payload).eq('id', selected.id).select().single()
    : supabase.from('dynamic_qr_codes').insert([{ ...payload, created_by: session.user.id }]).select().single();

  const { data, error } = await query;

  if(error){
    notice.className = 'notice show error';
    notice.textContent = error.message;
    return;
  }

  selectedDynamicQrId = data.id;
  qrData.fileName = sanitizeFileName(data.slug);
  await renderQrView();
}

async function deleteDynamicQr(){
  const selected = selectedDynamicQr();
  if(!selected || !confirm(`Delete dynamic QR "${selected.title}"? Printed codes for this slug will stop working.`)) return;

  const notice = document.getElementById('qrNotice');
  notice.className = 'notice show';
  notice.textContent = 'Deleting dynamic QR...';

  const { error } = await supabase
    .from('dynamic_qr_codes')
    .delete()
    .eq('id', selected.id);

  if(error){
    notice.className = 'notice show error';
    notice.textContent = error.message;
    return;
  }

  selectedDynamicQrId = null;
  await renderQrView();
}

function clearDynamicQrForm(){
  if(hasUnsavedDynamicQrChanges() && !confirmClearQr()) return;

  selectedDynamicQrId = null;
  qrData.fileName = 'reimage-qr-code';
  renderQrView();
}

function hasUnsavedDynamicQrChanges(){
  const selected = selectedDynamicQr();
  const title = document.getElementById('dynamicQrTitle')?.value.trim() || '';
  const slug = slugify(document.getElementById('dynamicQrSlug')?.value || '');
  const destination = document.getElementById('dynamicQrDestination')?.value.trim() || '';
  const isActive = document.getElementById('dynamicQrActive')?.value !== 'false';

  if(!selected){
    return Boolean(title || destination || (slug && slug !== 'qr-code'));
  }

  return (
    title !== (selected.title || '') ||
    slug !== (selected.slug || '') ||
    destination !== (selected.destination_url || '') ||
    isActive !== (selected.is_active !== false)
  );
}

function confirmClearQr(){
  return confirm('You have unsaved QR details. Click Cancel to save first, or OK to clear them.');
}

function clearQrCanvas(){
  const canvas = document.getElementById('qrCanvas');
  if(!canvas) return;

  const ctx = canvas.getContext('2d');
  if(ctx){
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

async function generateQrCode(quiet = false){
  const canvas = document.getElementById('qrCanvas');
  const notice = document.getElementById('qrNotice');
  const urlLabel = document.getElementById('qrCurrentUrl');
  const payload = currentQrPayload();

  if(!canvas) return false;

  if(!isValidQrUrl(payload)){
    if(!quiet) showQrError();
    return false;
  }

  try{
    await QRCode.toCanvas(canvas, payload, qrOptions(420));

    if(urlLabel){
      urlLabel.textContent = payload;
    }

    if(!quiet && notice){
      notice.className = 'notice show';
      notice.textContent = 'QR code generated.';
    }

    return true;
  } catch(error){
    showQrError(error.message || 'QR generation failed.');
    return false;
  }
}

async function downloadQrPng(){
  updateQrDataFromForm();

  if(!selectedDynamicQr()){
    showQrError('Select a saved dynamic QR code before downloading.');
    return;
  }

  const payload = currentQrPayload();

  if(!isValidQrUrl(payload)){
    showQrError();
    return;
  }

  try{
    const dataUrl = await QRCode.toDataURL(payload, qrOptions(qrData.size));
    downloadDataUrl(dataUrl, `${downloadQrFileName()}.png`);
  } catch(error){
    showQrError(error.message);
  }
}

async function downloadQrSvg(){
  updateQrDataFromForm();

  if(!selectedDynamicQr()){
    showQrError('Select a saved dynamic QR code before downloading.');
    return;
  }

  const payload = currentQrPayload();

  if(!isValidQrUrl(payload)){
    showQrError();
    return;
  }

  try{
    const svg = await QRCode.toString(payload, {
      ...qrOptions(qrData.size),
      type: 'svg'
    });

    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    downloadDataUrl(URL.createObjectURL(blob), `${downloadQrFileName()}.svg`, true);
  } catch(error){
    showQrError(error.message);
  }
}

function currentQrPayload(){
  const selected = selectedDynamicQr();
  const slugInput = document.getElementById('dynamicQrSlug');
  const slug = slugInput?.value || selected?.slug || 'your-slug';

  return dynamicQrUrl(slug);
}

function selectedDynamicQr(){
  return dynamicQrCodes.find(code => code.id === selectedDynamicQrId) || null;
}

function dynamicQrUrl(slug){
  return `${QR_REDIRECT_BASE_URL}/${slugify(slug || 'your-slug')}`;
}

function updateDynamicRedirectPreview(){
  const preview = document.getElementById('dynamicQrRedirect');
  if(!preview) return;

  const slug = document.getElementById('dynamicQrSlug')?.value || selectedDynamicQr()?.slug || 'your-slug';
  preview.textContent = dynamicQrUrl(slug);
}

function downloadQrFileName(){
  const selected = selectedDynamicQr();
  const slug = selected?.slug || document.getElementById('dynamicQrSlug')?.value || qrData.fileName;
  return sanitizeFileName(slug);
}

function qrOptions(width){
  return {
    errorCorrectionLevel: 'H',
    type: 'image/png',
    width,
    margin: qrData.margin,
    color: {
      dark: qrData.colorDark,
      light: qrData.colorLight
    }
  };
}

function showQrError(message = 'Enter a full URL that starts with http:// or https://.'){
  const notice = document.getElementById('qrNotice');

  notice.className = 'notice show error';
  notice.textContent = message;
}

function isValidQrUrl(value){
  try{
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol);
  } catch(_error){
    return false;
  }
}

function downloadDataUrl(href, fileName, revoke = false){
  const link = document.createElement('a');
  link.href = href;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();

  if(revoke){
    URL.revokeObjectURL(href);
  }
}

function sanitizeFileName(value){
  return String(value || 'qr-code')
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'qr-code';
}

function slugify(value){
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '') || 'qr-code';
}


/* =========================
   INVOICE GENERATOR
========================= */

const INVOICE_SERVICES = [
  {
    name: 'Static Website + SEO',
    category: 'Website Development',
    defaultRate: 449,
    billingCycle: 'one-time',
    quantityLabel: 'Project',
    description: 'Clean static website with mobile-friendly design, Google/Bing indexing, sitemap, robots.txt, llms.txt, basic SEO, analytics, contact forms, and launch setup.'
  },
  {
    name: 'Website Hosting / Maintenance',
    category: 'Website Development',
    defaultRate: 29.99,
    billingCycle: 'monthly',
    quantityLabel: 'Month',
    description: 'Monthly website hosting, maintenance, basic support, and uptime care.'
  },
  {
    name: 'Dynamic Website with QR & Status Page',
    category: 'Website Development',
    defaultRate: 599,
    billingCycle: 'one-time',
    quantityLabel: 'Project',
    description: 'Dynamic website with QR-code landing pages, link hub, customer-facing status pages, order tracking, service progress tracking, and appointment status updates.'
  },
  {
    name: 'Dynamic Website with Payments & Scripted Chatbot',
    category: 'Website Development',
    defaultRate: 999,
    billingCycle: 'one-time',
    quantityLabel: 'Project',
    description: 'Dynamic website with customer accounts, secure user logins, Stripe or Square payment integration, online payments, booking, scripted chatbot, and customer intake forms.'
  },
  {
    name: 'Business Portal Suite',
    category: 'Website Development',
    defaultRate: 1299,
    billingCycle: 'one-time',
    quantityLabel: 'Project',
    description: 'Custom business portal suite with admin portal, client portal, user management, subscriptions, inventory, integrations, custom invoices, order dashboards, and reporting tools.'
  },
  {
    name: 'Portal Suite Monthly Hosting / Maintenance',
    category: 'Website Development',
    defaultRate: 49.99,
    billingCycle: 'monthly',
    quantityLabel: 'Month',
    description: 'Monthly hosting, maintenance, and support for portal, database, and business system infrastructure.'
  },
  {
    name: 'AI Automation Suite',
    category: 'Website Development',
    defaultRate: 1699,
    billingCycle: 'one-time',
    quantityLabel: 'Project',
    description: 'AI automation suite with workflow automation, lead capture, email/SMS follow-ups, Google Sheets or CRM integration, reminders, internal notifications, support workflows, invoice automation, APIs, and webhooks.'
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
    name: 'Custom Work',
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

function createInvoiceItem(serviceName = DEFAULT_INVOICE_SERVICE){
  const service = INVOICE_SERVICES.find(s => s.name === serviceName) || INVOICE_SERVICES[0];
  const isCustomService = service.category === 'Custom';

  return {
    id: crypto.randomUUID(),
    service: service.name,
    description: isCustomService ? '' : service.description,
    quantity: 1,
    rate: isCustomService ? '' : String(service.defaultRate),
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
        description: service && service.category === 'Custom' ? '' : service ? service.description : item.description,
        rate: service && service.category === 'Custom' ? '' : service ? String(service.defaultRate) : item.rate,
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

function addInvoiceItem(serviceName = DEFAULT_INVOICE_SERVICE){
  invoiceItems = [...invoiceItems, createInvoiceItem(serviceName)];
  renderInvoiceView();
}

function removeInvoiceItem(id){
  invoiceItems = invoiceItems.filter(item => item.id !== id);

  if(invoiceItems.length === 0){
    invoiceItems = [createInvoiceItem(DEFAULT_INVOICE_SERVICE)];
  }

  renderInvoiceView();
}

function clearReimageInvoice(){
  if(!confirm('Clear this invoice draft?')) return;

  invoiceData = createBlankInvoice();
  invoiceItems = [createInvoiceItem(DEFAULT_INVOICE_SERVICE)];
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
  const customService = isCustomInvoiceService(item);

  return `
    <div class="ri-service-row ${customService ? 'is-custom' : ''}" data-item-id="${escapeAttr(item.id)}">
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

      <input class="input" placeholder="${customService ? 'Describe the custom work' : 'Service description'}" value="${escapeAttr(item.description)}" data-item-field="description">
      <input class="input" type="number" min="0" step="0.01" value="${escapeAttr(item.quantity)}" data-item-field="quantity" title="${escapeAttr(item.quantityLabel || 'Quantity')}">
      <input class="input" type="number" min="0" step="0.01" placeholder="${customService ? 'Price' : 'Rate'}" value="${escapeAttr(item.rate)}" data-item-field="rate" title="${customService ? 'Custom price' : 'Rate'}">
      <strong data-item-total="${escapeAttr(item.id)}">${invoiceMoney(Number(item.quantity || 0) * Number(item.rate || 0))}</strong>
      <button class="btn btn-danger" data-remove-item="${escapeAttr(item.id)}">Remove</button>
    </div>`;
}

function isCustomInvoiceService(item){
  const service = INVOICE_SERVICES.find(option => option.name === item.service);
  return service && service.category === 'Custom';
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
          <p>reimagebs@gmail.com</p>
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
  if(addBtn) addBtn.addEventListener('click', () => addInvoiceItem());

  document.querySelectorAll('[data-invoice-field]').forEach(input => {
    input.addEventListener('input', () => updateInvoiceField(input.dataset.invoiceField, input.value));
    input.addEventListener('change', () => updateInvoiceField(input.dataset.invoiceField, input.value));
  });

  document.querySelectorAll('.ri-service-row').forEach(row => {
    const id = row.dataset.itemId;

    row.querySelectorAll('[data-item-field]').forEach(input => {
      input.addEventListener('input', () => {
        updateInvoiceItem(id, input.dataset.itemField, input.value);
        updateInvoiceItemTotal(row, id);
      });
      input.addEventListener('change', () => updateInvoiceItem(id, input.dataset.itemField, input.value));
    });
  });

  document.querySelectorAll('[data-remove-item]').forEach(btn => {
    btn.addEventListener('click', () => removeInvoiceItem(btn.dataset.removeItem));
  });
}

function updateInvoiceItemTotal(row, id){
  const total = row.querySelector(`[data-item-total="${id}"]`);
  const item = invoiceItems.find(invoiceItem => invoiceItem.id === id);

  if(total && item){
    total.textContent = invoiceMoney(Number(item.quantity || 0) * Number(item.rate || 0));
  }
}

/* =========================
   SALES TEAM ADMIN
========================= */

async function renderSalesTeamView(){
  const area = document.getElementById('contentArea');
  area.innerHTML = '<div class="table-card"><div class="detail-body muted">Loading sales team data...</div></div>';

  const [apps, profiles, leads, invoices, qrs, examAttempts] = await Promise.all([
    supabase.from('sales_applications').select('*').order('submitted_at', { ascending:false }),
    supabase.from('salesman_profiles').select('*').order('created_at', { ascending:false }),
    supabase.from('sales_leads').select('*').order('updated_at', { ascending:false }),
    supabase.from('invoice_requests').select('*').order('created_at', { ascending:false }),
    supabase.from('qr_code_requests').select('*').order('created_at', { ascending:false }),
    supabase.from('sales_exam_attempts').select('*').order('started_at', { ascending:false })
  ]);

  const firstError = [apps, profiles, leads, invoices, qrs, examAttempts].find(result => result.error)?.error;
  if(firstError){
    area.innerHTML = `
      <div class="table-card">
        <div class="detail-body notice show error">${escapeHtml(firstError.message)}</div>
        <div class="detail-body muted">Make sure supabase/sql/salesman_portal.sql has been run.</div>
      </div>`;
    return;
  }

  salesApplications = apps.data || [];
  salesmanProfiles = profiles.data || [];
  salesLeads = leads.data || [];
  salesInvoiceRequests = invoices.data || [];
  salesQrRequests = qrs.data || [];
  salesExamAttempts = examAttempts.data || [];

  if(!selectedSalesApplicationId && salesApplications.length){
    selectedSalesApplicationId = salesApplications[0].id;
  }

  renderSalesTeamContent();
}

function renderSalesTeamContent(){
  const area = document.getElementById('contentArea');
  const selected = salesApplications.find(appItem => appItem.id === selectedSalesApplicationId) || salesApplications[0] || null;
  const activeProfiles = salesmanProfiles.filter(profile => ['active_salesman','testing','onboarding','accepted'].includes(profile.status));
  const pendingRequests = [...salesInvoiceRequests, ...salesQrRequests].filter(request => !['completed','closed'].includes(request.status || 'pending'));
  const sessionEmail = String(session?.user?.email || '').toLowerCase();
  const adminEmailWarning = ADMIN_EMAILS.includes(sessionEmail) ? '' : `
    <div class="admin-warning">
      <strong>Sales data may be hidden by Supabase RLS.</strong>
      <span>You are signed in as ${escapeHtml(session?.user?.email || 'unknown')}. The sales admin policies currently allow ${ADMIN_EMAILS.map(escapeHtml).join(' or ')}.</span>
    </div>`;

  area.innerHTML = `
    ${adminEmailWarning}
    <div class="sales-admin-grid">
      <section class="table-card">
        <div class="table-head">
          <div>
            <div class="kicker">Sales Pipeline</div>
            <h2>Applications</h2>
          </div>
          <span class="badge badge-new">${salesApplications.length} total</span>
        </div>
        <div class="sales-pipeline">
          ${['pending_review','accepted','onboarding','testing','active_salesman'].map(status => `
            <div><strong>${titleCase(status)}</strong><span>${salesApplications.filter(appItem => appItem.status === status).length}</span></div>
          `).join('')}
        </div>
        <div class="sales-list">
          ${salesApplications.length ? salesApplications.map(appItem => salesApplicationRow(appItem, selected)).join('') : '<div class="detail-body muted">No sales applications yet.</div>'}
        </div>
      </section>

      <section class="detail-card">
        <div class="detail-head">
          <h2>${selected ? escapeHtml(selected.full_name || 'Applicant') : 'No Applicant'}</h2>
          ${selected ? salesStatusBadge(selected.status) : ''}
        </div>
        <div class="detail-body">
          ${selected ? salesApplicationDetail(selected) : '<div class="empty-detail">Select an application.</div>'}
        </div>
      </section>
    </div>

    <div class="sales-admin-grid sales-admin-bottom">
      <section class="table-card">
        <div class="table-head"><h2>Active / Approved Salesmen</h2></div>
        <div class="sales-list">
          ${activeProfiles.length ? activeProfiles.map(profile => `
            <div class="sales-row">
              <strong>${escapeHtml(profile.full_name || profile.email || 'Salesman')}</strong>
              <span>${escapeHtml(profile.email || '')}</span>
              <small>${titleCase(profile.status)} · ${profile.commission_rate || 20}% commission</small>
            </div>
          `).join('') : '<div class="detail-body muted">No approved salesmen yet.</div>'}
        </div>
      </section>

      <section class="table-card">
        <div class="table-head"><h2>Open Sales Requests</h2><span class="badge badge-contacted">${pendingRequests.length} pending</span></div>
        <div class="sales-list">
          ${pendingRequests.length ? pendingRequests.map(request => salesRequestRow(request)).join('') : '<div class="detail-body muted">No open invoice or QR requests.</div>'}
        </div>
      </section>
    </div>
  `;

  bindSalesTeamEvents();
}

function salesApplicationRow(appItem, selected){
  return `
    <button class="sales-row ${selected && selected.id === appItem.id ? 'active' : ''}" data-sales-application-id="${escapeAttr(appItem.id)}">
      <strong>${escapeHtml(appItem.full_name || 'Applicant')}</strong>
      <span>${escapeHtml(appItem.email || '')}</span>
      <small>${titleCase(appItem.status || 'pending_review')} · ${formatDateTime(appItem.submitted_at)}</small>
    </button>`;
}

function salesApplicationDetail(appItem){
  const profile = salesmanProfiles.find(profileItem => profileItem.user_id === appItem.user_id);
  const assigned = profile ? salesLeads.filter(lead => lead.assigned_salesman_id === profile.id) : [];
  const examAttempt = salesExamAttempts.find(attempt => attempt.user_id === appItem.user_id);
  const examExpiredInProgress = examAttempt?.status === 'in_progress' && examAttempt?.expires_at && new Date(examAttempt.expires_at).getTime() <= Date.now();
  const examNeedsReset = examAttempt && !examAttempt.passed && (['submitted','timed_out'].includes(examAttempt.status) || examExpiredInProgress);

  return `
    <div class="detail-grid">
      <div class="info-box"><span>Email</span><strong>${escapeHtml(appItem.email || '—')}</strong></div>
      <div class="info-box"><span>Phone</span><strong>${escapeHtml(appItem.phone || '—')}</strong></div>
      <div class="info-box"><span>City / State</span><strong>${escapeHtml(appItem.city_state || '—')}</strong></div>
      <div class="info-box"><span>Test Score</span><strong>${examAttempt?.score ? `${escapeHtml(examAttempt.score)}%` : appItem.test_score ? `${escapeHtml(appItem.test_score)}%` : '—'}</strong></div>
    </div>

    <div class="message-box">
      <strong>Exam Attempt</strong><br>
      Status: ${titleCase(examAttempt?.status || 'not_started')}<br>
      Started: ${examAttempt?.started_at ? formatDateTime(examAttempt.started_at) : '—'}<br>
      Expires: ${examAttempt?.expires_at ? formatDateTime(examAttempt.expires_at) : '—'}<br>
      Passed: ${examAttempt?.passed ? 'Yes' : 'No'}
      ${examNeedsReset ? '<div class="action-row"><button class="btn btn-primary" data-reinstate-exam="' + escapeAttr(appItem.user_id || '') + '">Reinstate Exam</button></div>' : ''}
    </div>

    <div class="message-box"><strong>Sales Experience</strong><br>${escapeHtml(appItem.sales_experience || '—')}</div>
    <div class="message-box"><strong>Why Join</strong><br>${escapeHtml(appItem.why_join || '—')}</div>
    <div class="message-box"><strong>Industries</strong><br>${escapeHtml(appItem.industries || '—')}</div>
    <div class="message-box"><strong>Availability</strong><br>${escapeHtml(appItem.availability || '—')}</div>

    <label>Internal Notes</label>
    <textarea class="input" id="salesAdminNotes">${escapeHtml(appItem.admin_notes || '')}</textarea>

    <div class="action-row">
      <button class="btn btn-primary" data-sales-action="accepted" data-id="${escapeAttr(appItem.id)}">Accept</button>
      <button class="btn btn-secondary" data-sales-action="active_salesman" data-id="${escapeAttr(appItem.id)}">Activate</button>
      <button class="btn btn-danger" data-sales-action="rejected" data-id="${escapeAttr(appItem.id)}">Reject</button>
      <button class="btn btn-danger" data-sales-action="suspended" data-id="${escapeAttr(appItem.id)}">Suspend</button>
      <button class="btn btn-light" id="saveSalesNotesBtn" data-id="${escapeAttr(appItem.id)}">Save Notes</button>
    </div>

    <div class="sales-assignment">
      <h3>Assign Lead</h3>
      <div class="detail-grid">
        <input class="input" id="leadBusinessName" placeholder="Business name">
        <input class="input" id="leadContactName" placeholder="Contact person">
        <input class="input" id="leadPhone" placeholder="Phone">
        <input class="input" id="leadEmail" placeholder="Email">
        <input class="input" id="leadIndustry" placeholder="Industry">
        <input class="input" id="leadService" placeholder="Service interested in">
        <input class="input" id="leadValue" type="number" placeholder="Estimated deal value">
        <input class="input" id="leadFollowUp" type="date">
      </div>
      <textarea class="input" id="leadNotes" placeholder="Admin notes"></textarea>
      <button class="btn btn-primary" id="assignLeadBtn" data-profile-id="${escapeAttr(profile?.id || '')}">Assign Lead</button>
    </div>

    <div class="message-box"><strong>Assigned Leads</strong><br>${assigned.length ? assigned.map(lead => `${escapeHtml(lead.business_name)} — ${titleCase(lead.status || 'new')}`).join('<br>') : 'No assigned leads yet.'}</div>
  `;
}

function salesRequestRow(request){
  const isInvoice = 'service_package' in request;
  return `
    <div class="sales-row">
      <strong>${escapeHtml(request.client_name || 'Client')}</strong>
      <span>${isInvoice ? `Invoice · ${escapeHtml(request.service_package || '')}` : `QR · ${escapeHtml(request.destination_url || '')}`}</span>
      <small>${titleCase(request.status || 'pending')} · ${formatDateTime(request.created_at)}</small>
      <div class="action-row">
        <button class="btn btn-light" data-request-table="${isInvoice ? 'invoice_requests' : 'qr_code_requests'}" data-request-id="${escapeAttr(request.id)}" data-request-status="in_progress">In Progress</button>
        <button class="btn btn-primary" data-request-table="${isInvoice ? 'invoice_requests' : 'qr_code_requests'}" data-request-id="${escapeAttr(request.id)}" data-request-status="completed">Complete</button>
      </div>
    </div>`;
}

function bindSalesTeamEvents(){
  document.querySelectorAll('[data-sales-application-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedSalesApplicationId = btn.dataset.salesApplicationId;
      renderSalesTeamContent();
    });
  });

  document.querySelectorAll('[data-sales-action]').forEach(btn => {
    btn.addEventListener('click', () => updateSalesApplicationStatus(btn.dataset.id, btn.dataset.salesAction));
  });

  const saveNotesBtn = document.getElementById('saveSalesNotesBtn');
  if(saveNotesBtn){
    saveNotesBtn.addEventListener('click', () => saveSalesAdminNotes(saveNotesBtn.dataset.id));
  }

  const assignLeadBtn = document.getElementById('assignLeadBtn');
  if(assignLeadBtn){
    assignLeadBtn.addEventListener('click', () => assignSalesLead(assignLeadBtn.dataset.profileId));
  }

  document.querySelectorAll('[data-reinstate-exam]').forEach(btn => {
    btn.addEventListener('click', () => reinstateSalesExam(btn.dataset.reinstateExam));
  });

  document.querySelectorAll('[data-request-table]').forEach(btn => {
    btn.addEventListener('click', () => updateSalesRequestStatus(btn.dataset.requestTable, btn.dataset.requestId, btn.dataset.requestStatus));
  });
}

async function reinstateSalesExam(userId){
  if(!userId){
    alert('This applicant does not have a linked portal user yet.');
    return;
  }

  const { error } = await supabase
    .from('sales_exam_attempts')
    .update({
      status: 'admin_reset',
      locked_reason: null,
      reset_by: session.user.email,
      reset_at: new Date().toISOString()
    })
    .eq('user_id', userId)
    .in('status', ['submitted','timed_out','in_progress']);

  if(error){
    alert(error.message);
    return;
  }

  await renderSalesTeamView();
}

async function updateSalesApplicationStatus(id, status){
  const appItem = salesApplications.find(item => String(item.id) === String(id));
  const updates = {
    status,
    reviewed_at: new Date().toISOString(),
    reviewed_by: session.user.email
  };

  await supabase.from('sales_applications').update(updates).eq('id', id);

  if(appItem?.user_id){
    await supabase.from('salesman_profiles').upsert({
      user_id: appItem.user_id,
      full_name: appItem.full_name,
      email: appItem.email,
      phone: appItem.phone,
      city_state: appItem.city_state,
      status,
      commission_rate: 20
    }, { onConflict: 'user_id' });
  }

  await renderSalesTeamView();
}

async function saveSalesAdminNotes(id){
  await supabase
    .from('sales_applications')
    .update({ admin_notes: document.getElementById('salesAdminNotes').value })
    .eq('id', id);
  await renderSalesTeamView();
}

async function assignSalesLead(profileId){
  if(!profileId){
    alert('Accept or activate the applicant before assigning leads.');
    return;
  }

  await supabase.from('sales_leads').insert({
    assigned_salesman_id: profileId,
    business_name: document.getElementById('leadBusinessName').value,
    contact_name: document.getElementById('leadContactName').value,
    phone: document.getElementById('leadPhone').value,
    email: document.getElementById('leadEmail').value,
    industry: document.getElementById('leadIndustry').value,
    service_interest: document.getElementById('leadService').value,
    estimated_value: Number(document.getElementById('leadValue').value || 0),
    next_follow_up: document.getElementById('leadFollowUp').value || null,
    admin_notes: document.getElementById('leadNotes').value,
    status: 'new',
    created_by_admin: session.user.email
  });

  await renderSalesTeamView();
}

async function updateSalesRequestStatus(table, id, status){
  const payload = {
    status,
    completed_at: status === 'completed' ? new Date().toISOString() : null
  };
  await supabase.from(table).update(payload).eq('id', id);
  await renderSalesTeamView();
}

function salesStatusBadge(status = 'pending_review'){
  return `<span class="badge badge-${status === 'rejected' || status === 'suspended' ? 'spam' : status === 'active_salesman' ? 'closed' : 'contacted'}">${titleCase(status)}</span>`;
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
    'Website Development',
    'Static Website + SEO',
    'Dynamic Website with QR & Status Page',
    'Dynamic Website with Payments & Scripted Chatbot',
    'Business Portal Suite',
    'AI Automation Suite',
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

function formatBytes(bytes){
  const size = Number(bytes || 0);
  if(size < 1024) return `${size} B`;
  if(size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if(size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`;
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
