/**
 * AR Medias CRM — Master Console backend (Master.gs)
 * © Armedias. All rights reserved.
 *
 * Lives in the spreadsheet this script is bound to:
 *   Tenants     – one row per client company (Company ID, plan, expiry, status, their sheet id, stats)
 *   MasterLogs  – everything you do in the Master Console
 * Each client's own data lives in a separate spreadsheet created in the Drive folder below.
 */

var MASTER_TENANTS = 'Tenants';
var MASTER_LOGS = 'MasterLogs';
var TENANT_FOLDER_NAME = 'Armedias ISP — Client Databases';   // keep this name: your existing client sheets live in this Drive folder
var MASTER_DEFAULT_USER = 'master';
var MASTER_DEFAULT_PASS = 'Armedias@123';   // used ONLY on first login; you are forced to change it
// Your own client login address (e.g. 'https://isp.armedias.com'). Leave '' to use the Google script link.
// Used in the login details you copy/WhatsApp to clients and in approval emails.
var PUBLIC_LOGIN_URL = 'https://crm.armedias.com/app';
// Public address of bill / receipt links sent to customers (see domain-hosting/b). Leave '' to use the Google script link.
var PUBLIC_DOC_URL = 'https://crm.armedias.com/b';
// Self sign-up: true = instant free trial (no approval) · TRIAL_DAYS = length of the trial (sign-up day counts as day 1)
var AUTO_TRIAL = true;
var TRIAL_DAYS = 3;
// plan presets used by the Master Console (0 = unlimited)
var PLAN_LIMITS = { 'Trial': { users:0, customers:0 }, 'Small Business': { users:3, customers:1000 }, 'Enterprise': { users:0, customers:0 } };
function addMonthsDays_(ymd, days) { var p = String(ymd).split('-'); return Utilities.formatDate(new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]) + Number(days)), masterTz_(), 'yyyy-MM-dd'); }
function loginUrl_() { return PUBLIC_LOGIN_URL || ScriptApp.getService().getUrl(); }
var T_COLS = ['tenant_id','company_name','owner_name','phone','email','city','address','spreadsheet_id','plan','monthly_fee',
              'max_customers','max_users','start_date','expiry_date','status','notes','admin_username','created_at','updated_at',
              'last_login','last_login_user','stats_json','stats_at','is_deleted'];

// ============== Master spreadsheet ==============
function masterSs_() {
  var id = PropertiesService.getScriptProperties().getProperty('MASTER_SS_ID');
  if (id) return SpreadsheetApp.openById(id);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  PropertiesService.getScriptProperties().setProperty('MASTER_SS_ID', ss.getId());
  return ss;
}
function masterSheet_(name, header) {
  var ss = masterSs_(), sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, header.length).setValues([header]).setBackground('#2B2F36').setFontColor('#D4AF37').setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}
function tenantsSheet_() { return masterSheet_(MASTER_TENANTS, T_COLS); }
function mlog_(action, tenant, details) {
  try { masterSheet_(MASTER_LOGS, ['Timestamp','Action','Company','Details']).appendRow([nowIso(), action, tenant || '', details || '']); } catch (e) {}
}

function normCode_(c) { return String(c || '').trim().toUpperCase(); }
var _mtz = null;
function masterTz_() { if (_mtz) return _mtz; try { _mtz = masterSs_().getSpreadsheetTimeZone(); } catch (e) { _mtz = 'Asia/Karachi'; } return _mtz; }
function mToday_() { return Utilities.formatDate(new Date(), masterTz_(), 'yyyy-MM-dd'); }
function cellStr_(v) { return (v instanceof Date) ? Utilities.formatDate(v, masterTz_(), 'yyyy-MM-dd') : String(v == null ? '' : v); }
function addMonths_(ymd, months) {
  var p = String(ymd).split('-'), d = new Date(Number(p[0]), Number(p[1]) - 1 + Number(months), Number(p[2]));
  return Utilities.formatDate(d, masterTz_(), 'yyyy-MM-dd');
}
function daysLeft_(exp) {
  exp = cellStr_(exp); if (!/^\d{4}-\d{2}-\d{2}$/.test(exp)) return null;
  return Math.round((new Date(exp + 'T00:00:00Z') - new Date(mToday_() + 'T00:00:00Z')) / 86400000);
}

// all rows as objects (+ _row = sheet row number)
function tenantRows_() {
  var sh = tenantsSheet_(), data = sh.getDataRange().getValues(), out = [];
  if (data.length < 2) return out;
  var head = data[0];
  for (var i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    var o = { _row: i + 1 };
    head.forEach(function(h, c){ o[h] = cellStr_(data[i][c]); });
    out.push(o);
  }
  return out;
}
function writeTenant_(t) {
  var sh = tenantsSheet_(), row = t._row || (sh.getLastRow() + 1);
  var rg = sh.getRange(row, 1, 1, T_COLS.length);
  rg.setNumberFormat('@'); // keep phones like 0300… and dates as plain text
  rg.setValues([T_COLS.map(function(k){ return t[k] == null ? '' : String(t[k]); })]);
  t._row = row;
  CacheService.getScriptCache().remove('T:' + t.tenant_id);
  return t;
}

// cached lookup used on every client request
function tenantByCode_(code, fresh) {
  code = normCode_(code); if (!code) return null;
  var c = CacheService.getScriptCache(), k = 'T:' + code;
  if (!fresh) { var raw = c.get(k); if (raw) { try { return JSON.parse(raw); } catch (e) {} } }
  var t = tenantRows_().filter(function(x){ return x.tenant_id === code; })[0] || null;
  if (t) { var lite = {}; Object.keys(t).forEach(function(key){ if (key !== 'stats_json') lite[key] = t[key]; }); c.put(k, JSON.stringify(lite), 120); return lite; }
  return null;
}
// reason a company cannot sign in right now (null = OK)
function tenantBlock_(t) {
  if (!t || t.is_deleted === '1') return 'Company ID not found. Please check and try again.';
  if (t.status === 'pending') return 'Your account is waiting for approval by Armedias. We will contact you soon.';
  if (!t.spreadsheet_id) return 'Company ID not found. Please check and try again.';
  if (t.status === 'suspended') return 'This account has been suspended. Please contact Armedias.';
  var d = daysLeft_(t.expiry_date);
  if (d !== null && d < 0) return t.plan === 'Trial'
    ? 'Your free trial has ended. Choose a plan to continue — your data is safe and waiting for you.'
    : 'Your subscription ended on ' + t.expiry_date + '. Renew your plan to continue — your data is safe.';
  return null;
}
function touchTenantLogin_(code, user) {
  try {
    var t = tenantRows_().filter(function(x){ return x.tenant_id === code; })[0]; if (!t) return;
    var sh = tenantsSheet_(), c1 = T_COLS.indexOf('last_login') + 1;
    sh.getRange(t._row, c1, 1, 2).setNumberFormat('@').setValues([[nowIso(), user]]);
  } catch (e) {}
}

// ============== Master authentication ==============
function hash_(s, salt) {
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '|' + s, Utilities.Charset.UTF_8));
}
function masterCreds_() {
  var p = PropertiesService.getScriptProperties(), all = p.getProperties();
  if (!all.MASTER_HASH) {
    var salt = Utilities.getUuid();
    p.setProperties({ MASTER_USER: MASTER_DEFAULT_USER, MASTER_SALT: salt, MASTER_HASH: hash_(MASTER_DEFAULT_PASS, salt), MASTER_MUST_CHANGE: '1' });
    all = p.getProperties();
  }
  return all;
}
function masterLogin(user, pass) {
  try {
    var cr = masterCreds_();
    if (rlCount_('MASTER') >= 10) return { success:false, message:'Too many wrong attempts. Please wait 15 minutes.' };
    if (String(user || '').trim() !== cr.MASTER_USER || hash_(String(pass || ''), cr.MASTER_SALT) !== cr.MASTER_HASH) {
      rlBump_('MASTER');
      mlog_('Master Login Failed', '', 'user: ' + String(user || '').slice(0, 40));
      return { success:false, message:'Invalid username or password' };
    }
    rlClear_('MASTER');
    tenantsSheet_(); // make sure master sheets exist
    var token = newToken_();
    CacheService.getScriptCache().put('M:' + token, '1', SESSION_TTL);
    mlog_('Master Login', '', '');
    return { success:true, token:token, mustChange: cr.MASTER_MUST_CHANGE === '1', user: cr.MASTER_USER,
             appUrl: loginUrl_() };
  } catch (e) { return { success:false, message:'Error: ' + e }; }
}
function masterLogout(token) { if (okToken_(token)) CacheService.getScriptCache().remove('M:' + token); return { success:true }; }

// Master Console calls go through here: mapi(token, 'overview', [])
var M_API = ['overview','createTenant','approveTenant','rejectTenant','updateTenant','setStatus','extend','tenantDetail','refreshStats','refreshAll',
             'resetUserPassword','setUserStatus','deleteTenant','logs','changePassword','clearData'];
function mapi(token, fn, args) {
  try {
    if (!okToken_(token) || !CacheService.getScriptCache().get('M:' + token)) return { success:false, authExpired:true, message:'Session expired. Please log in again.' };
    CacheService.getScriptCache().put('M:' + token, '1', SESSION_TTL);
    if (M_API.indexOf(fn) === -1) return { success:false, message:'Unknown action' };
    return globalThis['m_' + fn + '_'].apply(null, Array.prototype.slice.call(args || []));
  } catch (e) { return { success:false, message:'Error: ' + (e && e.message ? e.message : e) }; }
}

// ============== Master actions ==============
function publicTenant_(t) {
  var stats = {}; try { stats = JSON.parse(t.stats_json || '{}'); } catch (e) {}
  var d = daysLeft_(t.expiry_date);
  var state = t.status === 'pending' ? 'pending' : (t.status === 'suspended' ? 'suspended' : (d !== null && d < 0 ? 'expired' : 'active'));
  var o = {}; T_COLS.forEach(function(k){ if (k !== 'stats_json') o[k] = t[k]; });
  o.stats = stats; o.days_left = d; o.state = state;
  o.business_type = stats.business_type || (state === 'pending' ? bizType_(PropertiesService.getScriptProperties().getProperty('BT:' + t.tenant_id)) : 'isp');
  o.sheet_url = t.spreadsheet_id ? 'https://docs.google.com/spreadsheets/d/' + t.spreadsheet_id + '/edit' : '';
  return o;
}

function m_overview_() {
  var rows = tenantRows_().filter(function(t){ return t.is_deleted !== '1'; }).map(publicTenant_);
  var k = { total: rows.length, active:0, suspended:0, expired:0, pending:0, expiring:0, trial:0, customers:0, mrr:0 };
  rows.forEach(function(t){
    k[t.state]++;
    if (t.state === 'active' && t.days_left !== null && t.days_left <= 7) k.expiring++;
    if (t.state === 'active' && t.plan === 'Trial') k.trial++;
    k.customers += num(t.stats.customers);
    if (t.state === 'active') k.mrr += num(t.monthly_fee);
  });
  rows.sort(function(a, b){ return String(b.created_at).localeCompare(String(a.created_at)); });
  return { success:true, data:{ tenants: rows, kpis: k, appUrl: loginUrl_(), appEmail: appEmail_(), planLimits: PLAN_LIMITS } };
}

function cleanTenantFields_(t, d) {
  ['company_name','owner_name','phone','email','city','address','plan','notes'].forEach(function(k){ if (d[k] !== undefined) t[k] = String(d[k] || '').trim(); });
  ['monthly_fee','max_customers','max_users'].forEach(function(k){ if (d[k] !== undefined) t[k] = String(num(d[k])); });
  ['start_date','expiry_date'].forEach(function(k){ if (d[k] !== undefined) t[k] = /^\d{4}-\d{2}-\d{2}$/.test(String(d[k])) ? String(d[k]) : ''; });
  if (d.status !== undefined && ['active','suspended'].indexOf(d.status) !== -1 && t.status !== 'pending') t.status = d.status;
  return t;
}

function m_createTenant_(d) {
  d = d || {};
  var code = normCode_(d.tenant_id);
  if (!/^[A-Z][A-Z0-9]{2,19}$/.test(code)) return { success:false, message:'Company ID must be 3–20 letters/numbers and start with a letter (e.g. FASTNET).' };
  if (!String(d.company_name || '').trim()) return { success:false, message:'Company name is required' };
  var user = String(d.admin_username || '').trim(), pass = String(d.admin_password || '');
  if (!/^[A-Za-z0-9._-]{3,30}$/.test(user)) return { success:false, message:'Login username must be 3–30 characters (letters, numbers, . _ -)' };
  if (pass.length < 6) return { success:false, message:'Login password must be at least 6 characters' };

  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) { return { success:false, message:'System is busy, please try again' }; }
  try {
    if (tenantRows_().some(function(t){ return t.tenant_id === code; })) return { success:false, message:'Company ID "' + code + '" is already used' };

    var start = /^\d{4}-\d{2}-\d{2}$/.test(String(d.start_date)) ? d.start_date : mToday_();
    var t = cleanTenantFields_({ tenant_id: code, status:'active', start_date:start }, d);
    if (!t.expiry_date) t.expiry_date = addMonths_(start, Math.max(1, num(d.months) || 1));
    t.admin_username = user; t.created_at = nowIso(); t.updated_at = t.created_at; t.is_deleted = '0';

    var ss;
    try { ss = provisionTenant_(t, user, pass, !!d.demo, d.timezone, bizType_(d.business_type), d.sheet_url); }
    catch (e) { return { success:false, message:e.message }; }
    writeTenant_(t);
    mlog_('Client Created', code, t.company_name + ' · owner login: ' + user + (d.demo ? ' · with demo data' : ''));
    return { success:true, message:'Client created', tenant_id:code, admin_username:user, admin_password:pass,
             appUrl: loginUrl_(), sheet_url: ss.getUrl() };
  } finally { lock.releaseLock(); }
}

// ---- "Bring your own Google Sheet": the client's data lives in THEIR Drive ----
function appEmail_() { try { return Session.getEffectiveUser().getEmail(); } catch (e) { return ''; } }
function sheetIdFromUrl_(u) {
  u = String(u || '').trim(); var m = u.match(/\/d\/([a-zA-Z0-9_-]{20,})/);
  return m ? m[1] : (/^[a-zA-Z0-9_-]{25,}$/.test(u) ? u : '');
}
// open the client's sheet and make sure it is EMPTY (we never overwrite anyone's data)
function clientSheet_(url) {
  var id = sheetIdFromUrl_(url);
  if (!id) throw new Error('That does not look like a Google Sheets link.');
  if (tenantRows_().some(function(x){ return x.spreadsheet_id === id; })) throw new Error('That sheet is already used by another client.');
  var ss; try { ss = SpreadsheetApp.openById(id); } catch (e) { throw new Error('Cannot open that sheet. Ask the client to share it with ' + appEmail_() + ' as Editor, then try again.'); }
  var used = ss.getSheets().some(function(sh){ return sh.getLastRow() > 0 || sh.getLastColumn() > 0; });
  if (used) throw new Error('That sheet already contains data. To protect the client\'s data, ask them to share a NEW, empty Google Sheet.');
  return ss;
}

// create the client's database — in your Drive folder, or inside the client's own empty sheet (sheetUrl)
function provisionTenant_(t, user, pass, demo, tz, btype, sheetUrl) {
  var ss;
  if (sheetUrl) {
    ss = clientSheet_(sheetUrl);
    try { ss.rename(APP_NAME + ' — ' + t.company_name + ' (' + t.tenant_id + ')'); } catch (e) {}
  } else {
    ss = SpreadsheetApp.create(APP_NAME + ' — ' + t.company_name + ' (' + t.tenant_id + ')');
    var folders = DriveApp.getFoldersByName(TENANT_FOLDER_NAME);
    var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(TENANT_FOLDER_NAME);
    DriveApp.getFileById(ss.getId()).moveTo(folder);
  }
  try { ss.setSpreadsheetTimeZone(tz || masterTz_()); } catch (e) {}
  t.spreadsheet_id = ss.getId();
  buildTenantDb_(ss, { tid: t.tenant_id, tenant: t, demo: !!demo, business_type: btype,
    admin: { username:user, password:pass, email:t.email, name:t.owner_name, phone:t.phone },
    company: { name:t.company_name, phone:t.phone, whatsapp:t.phone } });
  return ss;
}

// ============== Public sign-up (waits for your approval) ==============
function signupCompany(d) {
  try {
    d = d || {};
    var c = CacheService.getScriptCache(), n = Number(c.get('SU:count') || 0);
    if (n >= 20) return { success:false, message:'Too many sign-ups right now. Please try again in an hour.' };
    var code = normCode_(d.tenant_id), user = String(d.admin_username || '').trim(), pass = String(d.admin_password || '');
    if (!String(d.company_name || '').trim()) return { success:false, message:'Company name is required' };
    if (!String(d.owner_name || '').trim()) return { success:false, message:'Your name is required' };
    if (!/^[0-9+\-\s]{7,20}$/.test(String(d.phone || '').trim())) return { success:false, message:'Please enter a valid phone / WhatsApp number' };
    if (!/^[A-Z][A-Z0-9]{2,19}$/.test(code)) return { success:false, message:'Company ID must be 3–20 letters/numbers and start with a letter (e.g. FASTNET).' };
    if (!/^[A-Za-z0-9._-]{3,30}$/.test(user)) return { success:false, message:'Username must be 3–30 characters (letters, numbers, . _ -)' };
    if (pass.length < 6) return { success:false, message:'Password must be at least 6 characters' };
    var ph10 = String(d.phone || '').replace(/\D/g, '').slice(-10), em = String(d.email || '').trim().toLowerCase();
    var t, lock = LockService.getScriptLock();
    try { lock.waitLock(20000); } catch (e) { return { success:false, message:'System is busy, please try again' }; }
    try {   // quick: only reserve the Company ID here — the database is built after the lock is released
      var rows = tenantRows_();
      if (rows.some(function(x){ return x.tenant_id === code; })) return { success:false, message:'Company ID "' + code + '" is already taken. Please choose another.' };
      if (AUTO_TRIAL && rows.some(function(x){ return x.is_deleted !== '1' && ((ph10.length === 10 && String(x.phone).replace(/\D/g, '').slice(-10) === ph10) || (em && String(x.email).toLowerCase() === em)); }))
        return { success:false, message:'A business with this phone number or email is already registered. Please sign in, or contact AR Medias.' };
      t = cleanTenantFields_({ tenant_id: code, status:'pending', start_date: mToday_(), plan:'', monthly_fee:'0', max_customers:'0', max_users:'0' },
        { company_name:d.company_name, owner_name:d.owner_name, phone:d.phone, email:d.email, city:d.city, address:d.address });
      t.admin_username = user; t.notes = 'Signed up online'; t.created_at = nowIso(); t.updated_at = t.created_at; t.is_deleted = '0';
      writeTenant_(t);
      if (!AUTO_TRIAL) {
        PropertiesService.getScriptProperties().setProperty('PW:' + code, pass); // used once at approval, then deleted
        PropertiesService.getScriptProperties().setProperty('BT:' + code, bizType_(d.business_type));
      }
    } finally { lock.releaseLock(); }
    c.put('SU:count', String(n + 1), 3600);
    var owner = Session.getEffectiveUser().getEmail();

    if (AUTO_TRIAL) {   // instant free trial: build their database now, active for TRIAL_DAYS days
      try { provisionTenant_(t, user, pass, !!d.demo, '', bizType_(d.business_type)); }
      catch (e) { t.is_deleted = '1'; t.notes = 'Sign-up failed: ' + e.message; writeTenant_(t); return { success:false, message:'Could not create your account right now. Please try again in a minute.' }; }
      t.status = 'active'; t.plan = 'Trial'; t.expiry_date = addMonthsDays_(mToday_(), TRIAL_DAYS - 1); t.updated_at = nowIso(); t.notes = 'Self sign-up · free trial';
      writeTenant_(t);
      mlog_('Trial Started', code, d.company_name + ' · ' + d.owner_name + ' · ' + d.phone + ' · until ' + t.expiry_date);
      try { MailApp.sendEmail(owner, APP_NAME + ' — New free trial: ' + d.company_name, 'A new business started a ' + TRIAL_DAYS + '-day free trial.\n\nCompany: ' + d.company_name + '\nCompany ID: ' + code +
        '\nOwner: ' + d.owner_name + '\nPhone: ' + d.phone + '\nEmail: ' + (d.email || '-') + '\nCity: ' + (d.city || '-') + '\nTrial ends: ' + t.expiry_date + '\n\nSee it in your Master Console.'); } catch (e) {}
      return { success:true, trial:true, companyId:code, message:'Your ' + TRIAL_DAYS + '-day free trial is ready!' };
    }
    mlog_('Sign-up Request', code, d.company_name + ' · ' + d.owner_name + ' · ' + d.phone);
    try {
      MailApp.sendEmail(owner, APP_NAME + ' — New sign-up: ' + d.company_name,
        'New company is waiting for approval.\n\nCompany: ' + d.company_name + '\nCompany ID: ' + code + '\nOwner: ' + d.owner_name +
        '\nPhone: ' + d.phone + '\nEmail: ' + (d.email || '-') + '\nCity: ' + (d.city || '-') + '\n\nOpen your Master Console to approve or reject.');
    } catch (e) {}
    return { success:true, message:'Thank you! Your request has been sent to AR Medias. You will be able to log in as soon as your account is approved.' };
  } catch (e) { return { success:false, message:'Error: ' + e }; }
}

function m_approveTenant_(code, d) {
  d = d || {};
  var t = findTenant_(code); if (!t) return { success:false, message:'Client not found' };
  if (t.status !== 'pending') return { success:false, message:'This client is not pending' };
  var props = PropertiesService.getScriptProperties(), pass = props.getProperty('PW:' + t.tenant_id);
  if (!pass) return { success:false, message:'Sign-up password missing — reject and create the client manually.' };
  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) { return { success:false, message:'System is busy, please try again' }; }
  try {
    var start = mToday_();
    cleanTenantFields_(t, { plan:d.plan, monthly_fee:d.monthly_fee, max_customers:d.max_customers, max_users:d.max_users });
    t.start_date = start;
    t.expiry_date = addMonths_(start, Math.max(1, num(d.months) || 1));
    t.status = 'active'; t.updated_at = nowIso();
    try { provisionTenant_(t, t.admin_username, pass, !!d.demo, d.timezone, bizType_(d.business_type || props.getProperty('BT:' + t.tenant_id)), d.sheet_url); }
    catch (e) { return { success:false, message:e.message }; }
    writeTenant_(t);
    props.deleteProperty('PW:' + t.tenant_id); props.deleteProperty('BT:' + t.tenant_id);
  } finally { lock.releaseLock(); }
  mlog_('Sign-up Approved', t.tenant_id, t.company_name + ' · until ' + t.expiry_date);
  if (t.email) {
    try {
      MailApp.sendEmail(t.email, APP_NAME + ' — Your account is approved',
        'Hello ' + (t.owner_name || '') + ',\n\nYour ' + APP_NAME + ' account for ' + t.company_name + ' is now active.\n\nCompany ID: ' + t.tenant_id +
        '\nUsername: ' + t.admin_username + '\nPassword: the one you chose when signing up\n\nLogin: ' + loginUrl_() + '\n\n— Armedias');
    } catch (e) {}
  }
  return { success:true, message:'Approved — ' + t.company_name + ' can log in now', tenant_id:t.tenant_id, admin_username:t.admin_username, phone:t.phone, company:t.company_name };
}

function m_rejectTenant_(code) {
  var t = findTenant_(code); if (!t) return { success:false, message:'Client not found' };
  if (t.status !== 'pending') return { success:false, message:'Only pending sign-ups can be rejected' };
  t.is_deleted = '1'; t.updated_at = nowIso();
  writeTenant_(t);
  PropertiesService.getScriptProperties().deleteProperty('PW:' + t.tenant_id);
  PropertiesService.getScriptProperties().deleteProperty('BT:' + t.tenant_id);
  mlog_('Sign-up Rejected', t.tenant_id, t.company_name);
  return { success:true, message:'Sign-up rejected' };
}

function findTenant_(code) {
  code = normCode_(code);
  return tenantRows_().filter(function(x){ return x.tenant_id === code && x.is_deleted !== '1'; })[0] || null;
}

function m_updateTenant_(code, d) {
  var t = findTenant_(code); if (!t) return { success:false, message:'Client not found' };
  cleanTenantFields_(t, d || {});
  if (!t.company_name) return { success:false, message:'Company name is required' };
  if (d && d.business_type && t.spreadsheet_id) {
    enterTenant_(t, 'Armedias');
    var sh = db_().getSheetByName('Settings'), sd = sh.getDataRange().getValues(), row = 0;
    for (var i = 1; i < sd.length; i++) if (sd[i][0] === 'business_type') row = i + 1;
    if (row) sh.getRange(row, 2).setValue(bizType_(d.business_type)); else sh.appendRow(['business_type', bizType_(d.business_type)]);
    CTX = null;
  }
  t.updated_at = nowIso();
  writeTenant_(t);
  mlog_('Client Updated', t.tenant_id, Object.keys(d || {}).join(', '));
  return { success:true, message:'Saved' };
}

function m_setStatus_(code, status) {
  if (['active','suspended'].indexOf(status) === -1) return { success:false, message:'Bad status' };
  var t = findTenant_(code); if (!t) return { success:false, message:'Client not found' };
  if (!t.spreadsheet_id) return { success:false, message:'Approve this sign-up first' };
  t.status = status; t.updated_at = nowIso();
  writeTenant_(t);
  mlog_(status === 'active' ? 'Client Activated' : 'Client Suspended', t.tenant_id, '');
  return { success:true, message: status === 'active' ? 'Client activated' : 'Client suspended — their staff can no longer log in' };
}

function m_extend_(code, months) {
  months = Math.max(1, Math.min(36, num(months) || 1));
  var t = findTenant_(code); if (!t) return { success:false, message:'Client not found' };
  if (!t.spreadsheet_id) return { success:false, message:'Approve this sign-up first' };
  var base = (t.expiry_date && t.expiry_date > mToday_()) ? t.expiry_date : mToday_();
  t.expiry_date = addMonths_(base, months); t.updated_at = nowIso();
  writeTenant_(t);
  mlog_('Subscription Extended', t.tenant_id, '+' + months + ' month(s) → ' + t.expiry_date);
  return { success:true, message:'Extended to ' + t.expiry_date };
}

// live numbers from the client's own spreadsheet
function computeStats_(t) {
  enterTenant_(t, 'Armedias');
  var month = monthStr_();
  var custs = readObjs_('Customers'), invs = readObjs_('Invoices'), pays = readObjs_('Payments'), comps = readObjs_('Complaints');
  var us = db_().getSheetByName(USERS_SHEET), ud = us ? us.getDataRange().getValues() : [], users = 0, activeUsers = 0;
  for (var i = 1; i < ud.length; i++) { if (Number(ud[i][15]) === 1) continue; users++; if (ud[i][4] === 'Active') activeUsers++; }
  var lg = db_().getSheetByName(LOGS_SHEET), lastAct = '';
  if (lg && lg.getLastRow() > 1) lastAct = isoIfDate_(lg.getRange(lg.getLastRow(), 1).getValue());
  try { var hashed = hashPlainPasswords_(); if (hashed) addLog('Armedias', 'Security', hashed + ' staff password(s) secured (hashed)'); } catch (e) {}
  var s = {
    customers: custs.length,
    active: custs.filter(function(c){ return c.connection_status === 'active'; }).length,
    suspended: custs.filter(function(c){ return c.connection_status === 'suspended'; }).length,
    users: users, active_users: activeUsers,
    billed_month: round2(invs.filter(function(x){ return String(x.billing_month).slice(0, 7) === month; }).reduce(function(a, x){ return a + num(x.total); }, 0)),
    collected_month: round2(pays.filter(function(x){ return ymd_(x.payment_date).slice(0, 7) === month; }).reduce(function(a, x){ return a + num(x.amount); }, 0)),
    outstanding: round2(custs.reduce(function(a, c){ return a + Math.max(0, num(c.current_balance)); }, 0)),
    open_complaints: comps.filter(function(c){ return c.status === 'open' || c.status === 'in_progress'; }).length,
    last_activity: lastAct, month: month, business_type: bizType_(settingsMap_().business_type)
  };
  CTX = null;
  t.stats_json = JSON.stringify(s); t.stats_at = nowIso();
  writeTenant_(t);
  return s;
}

function m_refreshStats_(code) {
  var t = findTenant_(code); if (!t || !t.spreadsheet_id) return { success:false, message:'Client not found' };
  return { success:true, data: computeStats_(t) };
}

function m_refreshAll_() {
  var started = Date.now(), done = 0, failed = [];
  tenantRows_().filter(function(t){ return t.is_deleted !== '1' && t.spreadsheet_id; }).forEach(function(t){
    if (Date.now() - started > 270000) return; // stay inside the 6-min limit
    try { computeStats_(t); done++; } catch (e) { failed.push(t.tenant_id); }
  });
  return { success:true, message:'Stats refreshed for ' + done + ' client(s)' + (failed.length ? ' · failed: ' + failed.join(', ') : '') };
}

function m_tenantDetail_(code) {
  var t = findTenant_(code); if (!t) return { success:false, message:'Client not found' };
  if (!t.spreadsheet_id) return { success:false, message:'This client is not approved yet' };
  var stats = computeStats_(t);
  enterTenant_(t, 'Armedias');
  var us = db_().getSheetByName(USERS_SHEET), ud = us ? us.getDataRange().getValues() : [], users = [];
  for (var i = 1; i < ud.length; i++) {
    if (Number(ud[i][15]) === 1) continue;
    users.push({ username:String(ud[i][0]), name:ud[i][12] || '', email:ud[i][1] || '', role:ud[i][3], status:ud[i][4], last_login:isoIfDate_(ud[i][16]) || '' });
  }
  var lg = db_().getSheetByName(LOGS_SHEET), logs = [];
  if (lg && lg.getLastRow() > 1) {
    var n = Math.min(50, lg.getLastRow() - 1), rows = lg.getRange(lg.getLastRow() - n + 1, 1, n, 4).getValues();
    rows.reverse().forEach(function(r){ logs.push({ ts:isoIfDate_(r[0]), user:r[1], action:r[2], details:r[3] }); });
  }
  CTX = null;
  var out = publicTenant_(t); out.stats = stats;
  try { var own = DriveApp.getFileById(t.spreadsheet_id).getOwner(); out.storage_owner = own ? own.getEmail() : ''; } catch (e) { out.storage_owner = ''; }
  out.own_drive = !!out.storage_owner && out.storage_owner !== appEmail_();
  return { success:true, data:{ tenant: out, users: users, logs: logs } };
}

function m_resetUserPassword_(code, username, newPass) {
  if (String(newPass || '').length < 6) return { success:false, message:'Password must be at least 6 characters' };
  var t = findTenant_(code); if (!t) return { success:false, message:'Client not found' };
  enterTenant_(t, 'Armedias');
  var sh = db_().getSheetByName(USERS_SHEET), data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) !== String(username)) continue;
    sh.getRange(i + 1, 3).setNumberFormat('@').setValue(pwHash_(String(newPass)));
    sh.getRange(i + 1, 11).setValue(nowIso());
    sh.getRange(i + 1, 12).setValue('Armedias');
    addLog('Armedias', 'Password Reset', 'Reset by Armedias for: ' + username);
    CTX = null;
    mlog_('Client Password Reset', t.tenant_id, username);
    return { success:true, message:'Password updated for ' + username };
  }
  CTX = null;
  return { success:false, message:'User not found' };
}

function m_setUserStatus_(code, username, status) {
  if (['Active','Inactive'].indexOf(status) === -1) return { success:false, message:'Bad status' };
  var t = findTenant_(code); if (!t) return { success:false, message:'Client not found' };
  enterTenant_(t, 'Armedias');
  var sh = db_().getSheetByName(USERS_SHEET), data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) !== String(username)) continue;
    sh.getRange(i + 1, 5).setValue(status);
    addLog('Armedias', 'User ' + status, 'Set by Armedias for: ' + username);
    CTX = null;
    mlog_('Client User ' + status, t.tenant_id, username);
    return { success:true, message:username + ' is now ' + status };
  }
  CTX = null;
  return { success:false, message:'User not found' };
}

// soft delete — the client's spreadsheet is kept in your Drive (nothing is destroyed)
function m_deleteTenant_(code) {
  var t = findTenant_(code); if (!t) return { success:false, message:'Client not found' };
  t.is_deleted = '1'; t.status = 'suspended'; t.updated_at = nowIso();
  writeTenant_(t);
  mlog_('Client Removed', t.tenant_id, 'Spreadsheet kept: ' + t.spreadsheet_id);
  return { success:true, message:'Client removed. Their spreadsheet is still in your Drive folder "' + TENANT_FOLDER_NAME + '".' };
}

function m_clearData_(code, confirmCode) {
  var t = findTenant_(code); if (!t || !t.spreadsheet_id) return { success:false, message:'Client not found' };
  if (normCode_(confirmCode) !== t.tenant_id) return { success:false, message:'Confirmation did not match the Company ID' };
  enterTenant_(t, 'Armedias');
  var n = clearBusinessData_(CTX.ss);
  addLog('Armedias', 'Data Cleared', 'All business records removed by Armedias (' + n + ' rows). Logins and settings kept.');
  CTX = null;
  computeStats_(t);
  mlog_('Client Data Cleared', t.tenant_id, n + ' rows removed');
  return { success:true, message:'Cleared ' + n + ' records. Logins and settings were kept.' };
}

function m_logs_() {
  var sh = masterSheet_(MASTER_LOGS, ['Timestamp','Action','Company','Details']), out = [];
  if (sh.getLastRow() < 2) return { success:true, data:out };
  var n = Math.min(300, sh.getLastRow() - 1), rows = sh.getRange(sh.getLastRow() - n + 1, 1, n, 4).getValues();
  rows.reverse().forEach(function(r){ out.push({ ts:isoIfDate_(r[0]), action:r[1], company:r[2], details:r[3] }); });
  return { success:true, data:out };
}

function m_changePassword_(oldPass, newPass, newUser) {
  var cr = masterCreds_();
  if (hash_(String(oldPass || ''), cr.MASTER_SALT) !== cr.MASTER_HASH) return { success:false, message:'Current password is incorrect' };
  if (String(newPass || '').length < 8) return { success:false, message:'New password must be at least 8 characters' };
  var salt = Utilities.getUuid(), user = String(newUser || '').trim() || cr.MASTER_USER;
  PropertiesService.getScriptProperties().setProperties({ MASTER_USER: user, MASTER_SALT: salt, MASTER_HASH: hash_(String(newPass), salt), MASTER_MUST_CHANGE: '0' });
  mlog_('Master Password Changed', '', 'user: ' + user);
  return { success:true, message:'Master login updated', user:user };
}

// ============== Run these from the Apps Script editor only ==============
function isOwner_() {
  try { var a = Session.getActiveUser().getEmail(), e = Session.getEffectiveUser().getEmail(); return !!a && a === e; } catch (x) { return false; }
}
// Forgot your master password? Select this function in the editor and press Run.
function resetMasterPassword() {
  if (!isOwner_()) throw new Error('Run this from the Apps Script editor.');
  ['MASTER_USER','MASTER_SALT','MASTER_HASH','MASTER_MUST_CHANGE'].forEach(function(k){ PropertiesService.getScriptProperties().deleteProperty(k); });
  masterCreds_();
  Logger.log('Master login reset to  ' + MASTER_DEFAULT_USER + ' / ' + MASTER_DEFAULT_PASS + '  (you will be asked to change it).');
}
// After a future update that adds columns: Run this once to upgrade every client's spreadsheet safely.
function upgradeAllTenants() {
  if (!isOwner_()) throw new Error('Run this from the Apps Script editor.');
  tenantRows_().filter(function(t){ return t.is_deleted !== '1' && t.spreadsheet_id; }).forEach(function(t){
    enterTenant_(t, 'Armedias');
    var added = upgradeSchema_(CTX.ss);
    Logger.log(t.tenant_id + ': ' + (added.length ? added.join(', ') : 'up to date'));
    CTX = null;
  });
}
