import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { supabase, missingEnv } from './supabaseClient';
import { SITE, STATUS_HELP, STATUS_LABELS } from './site.config';

function clean(value){ return String(value || '').trim(); }
function labelStatus(status){ return STATUS_LABELS[status || 'new'] || status || 'Received'; }
function helpStatus(status){ return STATUS_HELP[status || 'new'] || 'Your request is being reviewed.'; }
function formatDate(value){ return value ? new Date(value).toLocaleString([], { dateStyle:'medium', timeStyle:'short' }) : '—'; }
function initials(email){ return clean(email).slice(0,2).toUpperCase() || 'CL'; }

function App(){
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if(missingEnv){ 
      setLoading(false); 
      return; 
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  if(missingEnv){
    return (
      <ShellNotice 
        title="Missing Supabase keys" 
        text="Create .env.local with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then run npm run dev again." 
      />
    );
  }

  if(loading){
    return <ShellNotice title="Loading portal" text="Checking your login session..." />;
  }

  return session ? <Portal session={session} /> : <Auth />;
}

function ShellNotice({ title, text }){
  return (
    <main className="auth-wrap">
      <section className="auth-card">
        <img src={SITE.logo} className="auth-logo" alt="RE IMAGE logo" />
        <div className="kicker">{SITE.portalName}</div>
        <h1>{title}</h1>
        <p className="muted">{text}</p>
      </section>
    </main>
  );
}

function Auth(){
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e){
    e.preventDefault();

    setBusy(true);
    setError(false);
    setNotice(mode === 'login' ? 'Signing in...' : 'Creating account...');

    const payload = { email: clean(email), password };

    const result = mode === 'login'
      ? await supabase.auth.signInWithPassword(payload)
      : await supabase.auth.signUp(payload);

    setBusy(false);

    if(result.error){
      setError(true);
      setNotice(result.error.message);
      return;
    }

    if(mode === 'signup'){
      setNotice('Account created. Check your email if Supabase confirmation is enabled.');
    }
  }

  async function resetPassword(){
    if(!clean(email)){
      setError(true);
      setNotice('Enter your email first, then press reset password.');
      return;
    }

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(clean(email), {
      redirectTo: window.location.origin
    });

    setError(!!resetError);
    setNotice(resetError ? resetError.message : 'Password reset email sent.');
  }

  return (
    <main className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <img src={SITE.logo} className="auth-logo" alt="RE IMAGE logo" />
        <div className="kicker">{SITE.portalName}</div>

        <h1>{mode === 'login' ? 'Client Login' : 'Create Client Account'}</h1>
        <p className="muted">Submit service requests, track status, and message the RE IMAGE team.</p>

        <label>Email</label>
        <input
          className="input"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          placeholder="client@email.com"
        />

        <label>Password</label>
        <input
          className="input"
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          placeholder="Password"
          minLength="6"
        />

        <button className="btn btn-primary full" disabled={busy}>
          {mode === 'login' ? 'Log In' : 'Create Account'}
        </button>

        {notice && <div className={`notice show ${error ? 'error' : ''}`}>{notice}</div>}

        <div className="auth-links">
          <button
            type="button"
            onClick={() => {
              setMode(mode === 'login' ? 'signup' : 'login');
              setNotice('');
              setError(false);
            }}
          >
            {mode === 'login' ? 'Need an account?' : 'Already have an account?'}
          </button>

          <button type="button" onClick={resetPassword}>Reset password</button>
        </div>
      </form>
    </main>
  );
}

function Portal({ session }){
  const [requests, setRequests] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');

  const selected = useMemo(() => {
    return requests.find(r => r.id === selectedId) || requests[0] || null;
  }, [requests, selectedId]);

  async function load(){
    setLoading(true);
    setNotice('');

    const { data, error } = await supabase
      .from('start_requests')
      .select('*')
      .or(`customer_id.eq.${session.user.id},email.eq.${session.user.email}`)
      .order('created_at', { ascending:false });

    if(error){
      setNotice(error.message);
      setRequests([]);
    } else {
      setRequests(data || []);
      if(!selectedId && data?.[0]){
        setSelectedId(data[0].id);
      }
    }

    setLoading(false);
  }

  async function loadMessages(requestId){
    if(!requestId){
      setMessages([]);
      return;
    }

    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('request_id', requestId)
      .order('created_at', { ascending:true });

    if(error){
      console.error('Message load failed:', error);
      setMessages([]);
      return;
    }

    setMessages(data || []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadMessages(selected?.id);
  }, [selected?.id]);

  async function signOut(){
    await supabase.auth.signOut();
  }

  return (
    <div className="portal-shell">
      <header className="topbar">
        <div className="brand">
          <img src={SITE.logo} alt="RE IMAGE logo" />
          <span>{SITE.portalName}</span>
        </div>

        <div className="top-actions">
          <span className="avatar">{initials(session.user.email)}</span>
          <span className="email">{session.user.email}</span>
          <button className="btn btn-light" onClick={load}>Refresh</button>
          <button className="btn btn-light" onClick={signOut}>Sign Out</button>
        </div>
      </header>

      <main className="main">
        <section className="hero-panel">
          <div>
            <div className="kicker">Client dashboard</div>
            <h1>Track your requests</h1>
            <p className="muted">Submit a new request, view current status, and keep messages attached to each project.</p>
          </div>

          <RequestForm session={session} onCreated={load} />
        </section>

        {notice && <div className="notice show error">{notice}</div>}

        <section className="dashboard-grid">
          <div className="requests-card">
            <div className="card-head">
              <h2>My Requests</h2>
              <span>{requests.length} total</span>
            </div>

            {loading ? (
              <p className="muted pad">Loading requests...</p>
            ) : requests.length === 0 ? (
              <p className="muted pad">No requests yet. Submit one above to test the portal.</p>
            ) : (
              requests.map(r => (
                <button
                  key={r.id}
                  className={`request-row ${selected?.id === r.id ? 'active' : ''}`}
                  onClick={() => setSelectedId(r.id)}
                >
                  <strong>{r.service_choice || 'Service Request'}</strong>
                  <span>{r.business_name || r.email}</span>
                  <em className={`status status-${r.status || 'new'}`}>{labelStatus(r.status)}</em>
                </button>
              ))
            )}
          </div>

          <div className="detail-card">
            {selected ? (
              <RequestDetail
                request={selected}
                messages={messages}
                session={session}
                onMessageSent={() => loadMessages(selected.id)}
              />
            ) : (
              <p className="muted pad">Select a request to view details.</p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function RequestForm({ session, onCreated }){
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    first_name:'',
    last_name:'',
    phone:'',
    business_name:'',
    service_choice:SITE.services[0],
    message:''
  });
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  function update(key, value){
    setForm(prev => ({ ...prev, [key]: value }));
  }

  async function submit(e){
    e.preventDefault();

    setBusy(true);
    setNotice('Submitting request...');

    const row = {
      customer_id: session.user.id,
      email: session.user.email,
      first_name: clean(form.first_name),
      last_name: clean(form.last_name),
      phone: clean(form.phone),
      business_name: clean(form.business_name),
      service_choice: clean(form.service_choice),
      message: clean(form.message),
      status: 'new'
    };

    const { error } = await supabase
      .from('start_requests')
      .insert(row);

    setBusy(false);

    if(error){
      setNotice(error.message);
      return;
    }

    setNotice('Request submitted. It now appears in your admin portal too.');
    setForm({
      first_name:'',
      last_name:'',
      phone:'',
      business_name:'',
      service_choice:SITE.services[0],
      message:''
    });

    onCreated();
  }

  if(!open){
    return (
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        Submit New Request
      </button>
    );
  }

  return (
    <form className="quick-form" onSubmit={submit}>
      <div className="form-grid">
        <input
          className="input"
          placeholder="First name"
          value={form.first_name}
          onChange={e => update('first_name', e.target.value)}
          required
        />

        <input
          className="input"
          placeholder="Last name"
          value={form.last_name}
          onChange={e => update('last_name', e.target.value)}
        />

        <input
          className="input"
          placeholder="Phone"
          value={form.phone}
          onChange={e => update('phone', e.target.value)}
        />

        <input
          className="input"
          placeholder="Business name"
          value={form.business_name}
          onChange={e => update('business_name', e.target.value)}
        />

        <select
          className="input"
          value={form.service_choice}
          onChange={e => update('service_choice', e.target.value)}
        >
          {SITE.services.map(s => <option key={s}>{s}</option>)}
        </select>
      </div>

      <textarea
        className="input"
        placeholder="Tell us what you need..."
        value={form.message}
        onChange={e => update('message', e.target.value)}
        required
      />

      <div className="action-row">
        <button className="btn btn-primary" disabled={busy}>Send Request</button>
        <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
      </div>

      {notice && <div className="notice show">{notice}</div>}
    </form>
  );
}

function RequestDetail({ request, messages, session, onMessageSent }){
  const [reply, setReply] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function sendMessage(e){
    e.preventDefault();

    const messageText = clean(reply);

    if(!messageText){
      setError(true);
      setNotice('Type a message first.');
      return;
    }

    setBusy(true);
    setError(false);
    setNotice('Sending message...');

    const { error: insertError } = await supabase
      .from('messages')
      .insert({
        request_id: request.id,
        sender_id: session.user.id,
        sender_role: 'customer',
        message: messageText
      });

    setBusy(false);

    if(insertError){
      setError(true);
      setNotice(insertError.message);
      return;
    }

    setReply('');
    setError(false);
    setNotice('Message sent.');
    onMessageSent();
  }

  return (
    <>
      <div className="card-head">
        <div>
          <h2>{request.service_choice || 'Request'}</h2>
          <p className="muted">Submitted {formatDate(request.created_at)}</p>
        </div>

        <em className={`status status-${request.status || 'new'}`}>
          {labelStatus(request.status)}
        </em>
      </div>

      <div className="status-box">
        <strong>{labelStatus(request.status)}</strong>
        <span>{helpStatus(request.status)}</span>
      </div>

      <div className="info-grid">
        <div>
          <span>Business</span>
          <strong>{request.business_name || '—'}</strong>
        </div>

        <div>
          <span>Email</span>
          <strong>{request.email || session.user.email}</strong>
        </div>

        <div>
          <span>Phone</span>
          <strong>{request.phone || '—'}</strong>
        </div>

        <div>
          <span>Last Updated</span>
          <strong>{formatDate(request.updated_at || request.created_at)}</strong>
        </div>
      </div>

      <label>Original Request</label>
      <div className="message-box">{request.message || 'No message provided.'}</div>

      <div className="messages-head">
        <h3>Messages</h3>
        <span>{messages.length}</span>
      </div>

      <div className="thread">
        {messages.length === 0 ? (
          <p className="muted">No replies yet. Send a message below.</p>
        ) : (
          messages.map(m => (
            <div
              key={m.id}
              className={`bubble ${m.sender_role === 'customer' ? 'mine' : 'theirs'}`}
            >
              <strong>{m.sender_role === 'customer' ? 'You' : 'RE IMAGE'}</strong>
              <p>{m.message}</p>
              <span>{formatDate(m.created_at)}</span>
            </div>
          ))
        )}
      </div>

      <form onSubmit={sendMessage} className="reply-form">
        <textarea
          className="input"
          placeholder="Write a reply..."
          value={reply}
          onChange={e => setReply(e.target.value)}
        />

        <button className="btn btn-primary" disabled={busy}>
          Send Message
        </button>
      </form>

      {notice && <div className={`notice show ${error ? 'error' : ''}`}>{notice}</div>}
    </>
  );
}

createRoot(document.getElementById('root')).render(<App />);