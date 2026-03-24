/* ============================================================
   SUPABASE HELPERS
   ============================================================ */
var _adminToken = null;

function _sbHeaders(useAdmin) {
  var token = (useAdmin && _adminToken) ? _adminToken : SUPABASE_KEY;
  return {
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };
}

async function sbFetch(path, opts, useAdmin) {
  var res = await fetch(SUPABASE_URL + '/rest/v1/' + path, Object.assign({
    headers: _sbHeaders(useAdmin)
  }, opts || {}));
  if (!res.ok) { var e = await res.text(); throw new Error(e); }
  var text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function sbRpc(fnName, params) {
  var res = await fetch(SUPABASE_URL + '/rest/v1/rpc/' + fnName, {
    method: 'POST',
    headers: _sbHeaders(false),
    body: JSON.stringify(params || {})
  });
  if (!res.ok) { var e = await res.text(); throw new Error(e); }
  var text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function getTicketCounts()     { return await sbRpc('get_ticket_counts'); }
async function getTicketByCode(code) { var r = await sbRpc('get_ticket_by_code', { p_code: code }); return r && r[0]; }
async function insertTicket(t)       { return await sbRpc('submit_ticket', { p_name: t.name, p_email: t.email, p_phone: t.phone, p_qty: t.qty }); }
async function getCapacity()         { var r = await sbFetch('config?key=eq.capacity&select=value'); return r && r.length ? parseInt(r[0].value) : 80; }

async function getTickets()          { return await sbFetch('tickets?order=request_date.desc', null, true); }
async function updateTicket(code, d) { return await sbFetch('tickets?code=eq.'+code, { method:'PATCH', body:JSON.stringify(d) }, true); }
async function deleteTicket(code)    { return await sbFetch('tickets?code=eq.'+code, { method:'DELETE' }, true); }
async function setCapacity(n)        { return await sbFetch('config?key=eq.capacity', { method:'PATCH', body:JSON.stringify({value:String(n)}) }, true); }
async function getConfigValue(key, def) {
  try { var r = await sbFetch('config?key=eq.'+key+'&select=value'); return r && r.length ? r[0].value : def; }
  catch(e) { return def; }
}
async function upsertConfigValue(key, value) {
  var res = await fetch(SUPABASE_URL+'/rest/v1/config', {
    method: 'POST',
    headers: Object.assign({}, _sbHeaders(true), {'Prefer': 'resolution=merge-duplicates'}),
    body: JSON.stringify({key: key, value: String(value)})
  });
  if(!res.ok){ var e = await res.text(); throw new Error(e); }
}

async function insertPresencialTicket(t) {
  return await sbFetch('tickets', {
    method: 'POST',
    body: JSON.stringify({
      code: t.code, name: t.name, email: t.email, phone: '',
      qty: t.qty, total: t.total,
      status: 'presencial', source: 'presencial',
      request_date: t.request_date, confirmed_date: t.confirmed_date
    })
  }, true);
}

async function sendTicketEmail(ticket) {
  var res = await fetch(SUPABASE_URL + '/functions/v1/send-ticket-email', {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + _adminToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      code: ticket.code,
      name: ticket.name,
      email: ticket.email,
      qty: ticket.qty,
      total: ticket.total
    })
  });
  if (!res.ok) {
    var errText = await res.text();
    throw new Error(errText);
  }
  return await res.json();
}

async function loginAdmin(email, password) {
  var res = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email, password: password })
  });
  if (!res.ok) return false;
  var data = await res.json();
  _adminToken = data.access_token;
  sessionStorage.setItem('admin_token', _adminToken);
  return true;
}

function logoutAdmin() {
  _adminToken = null;
  sessionStorage.removeItem('admin_token');
}

function restoreAdminSession() {
  var token = sessionStorage.getItem('admin_token');
  if (token) { _adminToken = token; return true; }
  return false;
}

function getAdminEmail() {
  if (!_adminToken) return null;
  try {
    return JSON.parse(atob(_adminToken.split('.')[1])).email || null;
  } catch(e) { return null; }
}

async function manageAdmins(action, params) {
  var res = await fetch(SUPABASE_URL + '/functions/v1/manage-admins', {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + _adminToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(Object.assign({ action: action }, params || {}))
  });
  var data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Erro');
  return data;
}

/* ============================================================
   QR CODE GENERATOR (inline, no external deps)
   ============================================================ */
function generateQR(el, text, size) {
  size = size || 180;
  var canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  var ctx = canvas.getContext('2d');
  var N = 25, cells = buildQRCells(text, N);
  var cell = Math.floor(size / N);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#0d0d0d';
  for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) if (cells[r*N+c]) ctx.fillRect(c*cell, r*cell, cell, cell);
  el.innerHTML = ''; el.appendChild(canvas);
}

function buildQRCells(text, N) {
  var cells = new Array(N*N).fill(0);
  function finder(row, col) {
    for (var r=0;r<7;r++) for (var c=0;c<7;c++) {
      var on = (r===0||r===6||c===0||c===6||(r>=2&&r<=4&&c>=2&&c<=4));
      if (row+r<N&&col+c<N) cells[(row+r)*N+(col+c)] = on ? 1 : 0;
    }
  }
  finder(0,0); finder(0,N-7); finder(N-7,0);
  for (var i=8;i<N-8;i++) { cells[6*N+i]=i%2===0?1:0; cells[i*N+6]=i%2===0?1:0; }
  var used = new Array(N*N).fill(false);
  for(var r=0;r<9;r++) for(var c=0;c<9;c++) used[r*N+c]=true;
  for(var r=0;r<9;r++) for(var c=N-8;c<N;c++) used[r*N+c]=true;
  for(var r=N-8;r<N;r++) for(var c=0;c<9;c++) used[r*N+c]=true;
  for(var i=8;i<N-8;i++){used[6*N+i]=true;used[i*N+6]=true;}
  var bits = [];
  for(var i=0;i<text.length;i++){var code=text.charCodeAt(i);for(var b=7;b>=0;b--)bits.push((code>>b)&1);}
  while(bits.length<500) bits=bits.concat(bits);
  var bi=0;
  for(var r=0;r<N;r++) for(var c=0;c<N;c++) if(!used[r*N+c]){cells[r*N+c]=bits[bi%bits.length];bi++;}
  return cells;
}

/* ============================================================
   UI HELPERS
   ============================================================ */
function setEl(id, v)  { var e=document.getElementById(id); if(e) e.textContent=v; }
function setBar(id, p) { var e=document.getElementById(id); if(e) e.style.width=Math.min(100,Math.max(0,p))+'%'; }
function qs(sel)       { return document.querySelector(sel); }

function showLoad(msg) {
  var el=document.getElementById('loading');
  if(el){ el.classList.add('show'); setEl('loading-text', msg||'A carregar...'); }
}
function hideLoad() {
  var el=document.getElementById('loading');
  if(el) el.classList.remove('show');
}

var _toastTimer;
function toast(msg, type) {
  clearTimeout(_toastTimer);
  var el=document.getElementById('toast');
  if(!el) return;
  el.textContent=msg; el.className='toast '+(type||'')+' show';
  _toastTimer=setTimeout(function(){ el.classList.remove('show'); }, 3500);
}

/* ============================================================
   RATE LIMITING (client-side)
   ============================================================ */
var RL = {
  check: function(key, max, windowMs) {
    if(CFG.devMode) return true;
    var now = Date.now();
    var stored;
    try { stored = JSON.parse(localStorage.getItem('rl_'+key) || '[]'); } catch(e) { stored = []; }
    var recent = stored.filter(function(t){ return now - t < windowMs; });
    if(recent.length >= max) {
      var waitSec = Math.ceil((windowMs - (now - recent[0])) / 1000);
      toast('⚠ Demasiadas tentativas. Aguarda '+waitSec+'s.','err');
      return false;
    }
    recent.push(now);
    try { localStorage.setItem('rl_'+key, JSON.stringify(recent)); } catch(e){}
    return true;
  }
};

/* ============================================================
   SECURE CODE GENERATION
   ============================================================ */
function genCode(prefix) {
  var chars = '0123456789abcdefghijklmnopqrstuvwxyz';
  var arr = new Uint8Array(10);
  window.crypto.getRandomValues(arr);
  var code = '';
  for (var i = 0; i < arr.length; i++) code += chars[arr[i] % 36];
  return (prefix||'TC')+'-'+code;
}

function today() {
  return new Date().toISOString().split('T')[0];
}