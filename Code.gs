/**
 * Armedias ISP Software — client app backend (Code.gs)
 * © Armedias. All rights reserved.
 *
 * Multi-company: every client ISP has its OWN Google Sheet (created from the Master Console).
 * Each request runs inside a company context (CTX) that api() sets after checking the login token,
 * so one company can never read or write another company's data.
 * Client management (create clients, credentials, status, stats) lives in Master.gs.
 */

// ============== Configuration ==============
var APP_NAME = 'Armedias ISP Software';
var USERS_SHEET = 'Users';
var LOGS_SHEET = 'Logs';
var ROLES_SHEET = 'Roles';
var ASSETS_FOLDER_NAME = 'Armedias ISP — Assets';
var SESSION_TTL = 21600; // 6h sliding (seconds)

// per-request company context: { tid, tenant, ss, user, tz }
var CTX = null;
function db_() { if (!CTX || !CTX.ss) throw new Error('No company context'); return CTX.ss; }
function enterTenant_(tenant, user) {
  CTX = { tid: tenant.tenant_id, tenant: tenant, ss: SpreadsheetApp.openById(tenant.spreadsheet_id), user: user || null };
}

// ============== RBAC Config ==============
var ROLE_C = { KEY:0, LABEL:1, COLOR:2, SORT:3, SUPER:4, HIDDEN:5, PERMS:6 };

var RBAC_PAGES = [
  { key:'dashboard',     label:'Dashboard',         group:'General' },
  { key:'customers',     label:'Customers',         group:'Operations' },
  { key:'areas',         label:'Areas',             group:'Operations' },
  { key:'packages',      label:'Packages',          group:'Operations' },
  { key:'equipment',     label:'Equipment',         group:'Operations' },
  { key:'leads',         label:'Leads',             group:'Operations' },
  { key:'complaints',    label:'Complaints',        group:'Support' },
  { key:'calls',         label:'Call Logs',         group:'Support' },
  { key:'invoices',      label:'Invoices',          group:'Billing' },
  { key:'payments',      label:'Payments',          group:'Billing' },
  { key:'expenses',      label:'Expenses',          group:'Billing' },
  { key:'vendors',       label:'Vendors',           group:'Billing' },
  { key:'banks',         label:'Bank Accounts',     group:'Billing' },
  { key:'collections',   label:'Collection Runs',   group:'Recovery' },
  { key:'recovery',      label:'Recovery Board',    group:'Recovery' },
  { key:'areabalance',   label:'Area Balances',     group:'Recovery' },
  { key:'reports',       label:'Reports',           group:'Recovery' },
  { key:'notifications', label:'Notifications',     group:'System' },
  { key:'users',         label:'Staff / Users',     group:'System' },
  { key:'logs',          label:'Activity Logs',     group:'System' },
  { key:'settings',      label:'Settings',          group:'System' },
  { key:'about',         label:'About App',         group:'System' },
  { key:'allocations',      label:'Payment Allocations', group:'Records' },
  { key:'expense_payments', label:'Expense Payments',    group:'Records' },
  { key:'attachments',      label:'Complaint Files',     group:'Records' },
  { key:'documents',        label:'Customer Documents',  group:'Records' },
  { key:'visits',           label:'Collection Visits',   group:'Records' }
];

var RBAC_ROLE_DEFS = [
  { key:'super_admin', label:'Super Admin', color:'#6a1b9a', is_super:1, hidden_signup:1 },
  { key:'admin',       label:'Admin',       color:'#0074D9', is_super:0, hidden_signup:1 },
  { key:'accountant',  label:'Accountant',  color:'#34a853', is_super:0, hidden_signup:0 },
  { key:'collector',   label:'Collector',   color:'#fb8c00', is_super:0, hidden_signup:0 }
];

var RBAC_EDIT_ROLES = ['super_admin'];

var RBAC_GRANTS = {
  dashboard:     { admin:'v',    accountant:'v',   collector:'v'   },
  customers:     { admin:'vaed', accountant:'ve',  collector:'v'   },
  areas:         { admin:'vaed', accountant:'v',   collector:'v'   },
  packages:      { admin:'vaed', accountant:'v',   collector:'v'   },
  equipment:     { admin:'vaed', accountant:'v',   collector:'v'   },
  leads:         { admin:'vaed', accountant:'',    collector:'vae' },
  complaints:    { admin:'vaed', accountant:'v',   collector:'vae' },
  calls:         { admin:'vaed', accountant:'',    collector:'vae' },
  invoices:      { admin:'vaed', accountant:'vae', collector:'v'   },
  payments:      { admin:'vaed', accountant:'vae', collector:'va'  },
  expenses:      { admin:'vaed', accountant:'vae', collector:''    },
  vendors:       { admin:'vaed', accountant:'vae', collector:''    },
  banks:         { admin:'',     accountant:'vae', collector:''    },
  collections:   { admin:'vaed', accountant:'ve',  collector:'vae' },
  recovery:      { admin:'v',    accountant:'v',   collector:'v'   },
  areabalance:   { admin:'v',    accountant:'v',   collector:'v'   },
  reports:       { admin:'v',    accountant:'v',   collector:''    },
  notifications: { admin:'vaed', accountant:'ve',  collector:'ve'  },
  users:         { admin:'vaed', accountant:'',    collector:''    },
  logs:          { admin:'v',    accountant:'',    collector:''    },
  settings:      { admin:'ve',   accountant:'',    collector:''    },
  about:         { admin:'v',    accountant:'v',   collector:'v'   },
  allocations:     { admin:'vae', accountant:'vae', collector:'v'   },
  expense_payments:{ admin:'vae', accountant:'vae', collector:''    },
  attachments:     { admin:'va',  accountant:'v',   collector:'va'  },
  documents:       { admin:'va',  accountant:'v',   collector:'va'  },
  visits:          { admin:'vae', accountant:'v',   collector:'vae' }
};

function rbacDefaultPerms_(roleKey) {
  var perms = {};
  var set = function(k,v,a,e,d){ perms[k] = { v:v?1:0, a:a?1:0, e:e?1:0, d:d?1:0 }; };
  RBAC_PAGES.forEach(function(p){ set(p.key,0,0,0,0); });
  if (roleKey === 'super_admin') { RBAC_PAGES.forEach(function(p){ set(p.key,1,1,1,1); }); return perms; }
  RBAC_PAGES.forEach(function(p){
    var g = (RBAC_GRANTS[p.key] || {})[roleKey] || '';
    set(p.key, g.indexOf('v')!==-1, g.indexOf('a')!==-1, g.indexOf('e')!==-1, g.indexOf('d')!==-1);
  });
  return perms;
}

// ============== Web App Entry Point ==============
// <app url>            → client login (index.html)
// <app url>?master     → Armedias Master Console (master.html)
function doGet(e) {
  var p = (e && e.parameter) || {};
  var isMaster = Object.prototype.hasOwnProperty.call(p, 'master');
  var t = HtmlService.createTemplateFromFile(isMaster ? 'master' : 'index');
  t.appUrlJson = JSON.stringify(ScriptApp.getService().getUrl() || '');
  return t.evaluate()
    .setTitle(isMaster ? APP_NAME + ' — Master Console' : APP_NAME)
    .setSandboxMode(HtmlService.SandboxMode.IFRAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ============== Sessions ==============
function newToken_() { return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, ''); }
function okToken_(t) { return /^[a-f0-9]{64}$/.test(String(t || '')); }
function sessPut_(token, obj) { CacheService.getScriptCache().put('S:' + token, JSON.stringify(obj), SESSION_TTL); }
function sessGet_(token) {
  if (!okToken_(token)) return null;
  var raw = CacheService.getScriptCache().get('S:' + token);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}
function sessDrop_(token) { if (okToken_(token)) CacheService.getScriptCache().remove('S:' + token); }

// functions the browser may call through api(); value = position of the "caller" argument,
// which is always overwritten with the logged-in user from the session (never trusted from the browser)
var API_CALLER = {
  getAllUsers:0, addUser:1, updateUser:2, deleteUser:1, updateMyAccount:0, getDashboardStats:0,
  uploadProfileImage:2, updateUserSettings:0, getUserSettings:0, getMyPermissions:0, getRbacMatrix:0,
  toggleRbac:4, getLogs:0, tblRead:0, tblInsert:0, tblUpdate:0, tblDelete:0, recalcAllBalances:0,
  getLookups:0, getCustomerDues:0, convertLead:0, generateMonthlyInvoices:0, getRecovery:0,
  getAreaBalances:0, getArrearsReport:0, getPeriodReport:0, getActionCenter:0, getPendingCounts:0,
  getCustomer360:0, getUserActivity:0, resetUserPassword:0, getSettings:0, saveSettings:0,
  childRead:0, childInsert:0, childDelete:0
};

function api(token, fn, args) {
  try {
    var s = sessGet_(token);
    if (!s) return { success:false, authExpired:true, message:'Session expired. Please log in again.' };
    var t = tenantByCode_(s.t);
    var bad = tenantBlock_(t);
    if (bad) { sessDrop_(token); return { success:false, authExpired:true, message:bad }; }
    if (!Object.prototype.hasOwnProperty.call(API_CALLER, fn)) return { success:false, message:'Unknown action' };
    enterTenant_(t, s.u);
    if (!userRole_(s.u)) { sessDrop_(token); return { success:false, authExpired:true, message:'Your account is inactive.' }; }
    sessPut_(token, s); // sliding expiry
    args = Array.prototype.slice.call(args || []);
    var idx = API_CALLER[fn];
    while (args.length <= idx) args.push(null);
    args[idx] = s.u;
    return globalThis[fn].apply(null, args);
  } catch (e) {
    return { success:false, message:'Error: ' + (e && e.message ? e.message : e) };
  }
}

function logout(token) { sessDrop_(token); return { success:true }; }

// ============== Authentication ==============
function authenticateUser(companyId, username, password) {
  try {
    username = String(username || '').trim(); password = String(password || '');
    var t = tenantByCode_(companyId, true);
    var bad = tenantBlock_(t); if (bad) return { success:false, message:bad };
    if (!username || !password) return { success:false, message:'Username and password are required' };
    enterTenant_(t, null);
    var sheet = db_().getSheetByName(USERS_SHEET);
    if (!sheet) return { success:false, message:'Company database is not set up. Please contact Armedias.' };
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) !== username) continue;
      if (Number(data[i][15]) === 1) { addLog(username, 'Login Failed', 'Account removed'); return { success:false, message:'Username not found' }; }
      if (data[i][4] !== 'Active') { addLog(username, 'Login Failed', 'Account is inactive'); return { success:false, message:'Account is inactive. Please contact administrator.' }; }
      if (password !== String(data[i][2])) { addLog(username, 'Login Failed', 'Invalid password'); return { success:false, message:'Invalid password' }; }
      sheet.getRange(i + 1, 17).setValue(nowIso()); // LastLogin
      addLog(username, 'Login Success', 'User logged in successfully');
      var token = newToken_();
      sessPut_(token, { t: t.tenant_id, u: username });
      touchTenantLogin_(t.tenant_id, username);
      return {
        success: true, token: token,
        companyId: t.tenant_id, companyName: t.company_name, daysLeft: daysLeft_(t.expiry_date),
        username: username, email: data[i][1], role: data[i][3],
        profileImage: data[i][5] || '', themeMode: data[i][6] || 'light', customColors: data[i][7] || '',
        permissions: rbacPermsFor_(data[i][3]), canEditRbac: canEditRbac_(data[i][3])
      };
    }
    return { success:false, message:'Username not found' };
  } catch (error) {
    return { success:false, message:'Error: ' + error.toString() };
  }
}

// ============== Forgot / reset password via OTP ==============
function ensureUserOtpCol_(sheet) {
  var lastCol = sheet.getLastColumn();
  var hdr = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var idx = hdr.indexOf('OTP');
  if (idx === -1) { sheet.getRange(1, lastCol + 1).setValue('OTP'); idx = lastCol; }
  return idx;
}
function maskEmail_(e) {
  e = String(e || ''); var at = e.indexOf('@'); if (at < 1) return e;
  var n = e.slice(0, at); return n.charAt(0) + '***' + (n.length > 1 ? n.charAt(n.length - 1) : '') + e.slice(at);
}

function forgotPassword(companyId, identifier) {
  try {
    var t = tenantByCode_(companyId, true);
    var bad = tenantBlock_(t); if (bad) return { success:false, message:bad };
    if (!identifier) return { success:false, message:'Enter your username or email' };
    enterTenant_(t, null);
    var sheet = db_().getSheetByName(USERS_SHEET);
    if (!sheet) return { success:false, message:'Users sheet not found' };
    var otpCol = ensureUserOtpCol_(sheet);
    var data = sheet.getDataRange().getValues(), id = String(identifier).toLowerCase();
    for (var i = 1; i < data.length; i++) {
      if (Number(data[i][15]) === 1) continue;
      if (String(data[i][0]).toLowerCase() === id || String(data[i][1]).toLowerCase() === id) {
        var code = '' + Math.floor(100000 + Math.random() * 900000);
        sheet.getRange(i + 1, otpCol + 1).setValue(code + '|' + (Date.now() + 15 * 60 * 1000));
        var email = data[i][1];
        if (email) { try { MailApp.sendEmail(email, t.company_name + ' — Password Reset OTP', 'Your OTP is: ' + code + '\n\nIt is valid for 15 minutes. If you did not request this, ignore this email.\n\n— ' + APP_NAME); } catch (e) {} }
        addLog(data[i][0], 'Forgot Password', 'OTP generated');
        return { success:true, message: email ? ('OTP sent to ' + maskEmail_(email)) : 'OTP generated (no email on file — ask admin)', username: data[i][0] };
      }
    }
    return { success:false, message:'No account found for that username/email' };
  } catch (e) { return { success:false, message:'Error: ' + e.toString() }; }
}

function resetPasswordWithOtp(companyId, identifier, otp, newPassword) {
  try {
    var t = tenantByCode_(companyId, true);
    var bad = tenantBlock_(t); if (bad) return { success:false, message:bad };
    if (!newPassword || String(newPassword).length < 4) return { success:false, message:'Password must be at least 4 characters' };
    enterTenant_(t, null);
    var sheet = db_().getSheetByName(USERS_SHEET);
    if (!sheet) return { success:false, message:'Users sheet not found' };
    var otpCol = ensureUserOtpCol_(sheet);
    var data = sheet.getDataRange().getValues(), id = String(identifier).toLowerCase();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]).toLowerCase() === id || String(data[i][1]).toLowerCase() === id) {
        var stored = String(data[i][otpCol] || '');
        if (!stored) return { success:false, message:'No OTP requested. Use Forgot Password first.' };
        var parts = stored.split('|'), code = parts[0], exp = Number(parts[1] || 0);
        if (Date.now() > exp) return { success:false, message:'OTP expired. Request a new one.' };
        if (String(otp).trim() !== code) return { success:false, message:'Invalid OTP' };
        sheet.getRange(i + 1, 3).setValue(newPassword);
        sheet.getRange(i + 1, otpCol + 1).setValue('');
        sheet.getRange(i + 1, 11).setValue(nowIso());
        addLog(data[i][0], 'Password Reset', 'Via OTP');
        return { success:true, message:'Password reset! You can log in now.' };
      }
    }
    return { success:false, message:'Account not found' };
  } catch (e) { return { success:false, message:'Error: ' + e.toString() }; }
}

// ============== Users (staff) ==============
function getAllUsers(callerUser) {
  try {
    if (!gate_(callerUser, 'users', 'v')) return { success:false, message:'Access denied' };
    var sheet = db_().getSheetByName(USERS_SHEET);
    if (!sheet) return { success:false, message:'Users sheet not found' };
    var data = sheet.getDataRange().getValues(), users = [];
    for (var i = 1; i < data.length; i++) {
      if (Number(data[i][15]) === 1) continue;
      users.push({
        Username: String(data[i][0]), Email: data[i][1], Role: data[i][3], Status: data[i][4],
        Name: data[i][12] || '', Phone: data[i][13] || '', AreaId: data[i][14] || '',
        LastLogin: isoIfDate_(data[i][16]) || '', CreatedAt: isoIfDate_(data[i][8]), CreatedBy: data[i][9],
        UpdatedAt: isoIfDate_(data[i][10]), UpdatedBy: data[i][11]
      });
    }
    return { success:true, data:users };
  } catch (error) { return { success:false, message:'Error: ' + error.toString() }; }
}

function addUser(userData, currentUser) {
  try {
    if (!gate_(currentUser, 'users', 'a')) return { success:false, message:'Access denied' };
    var sheet = db_().getSheetByName(USERS_SHEET);
    if (!sheet) return { success:false, message:'Users sheet not found' };
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) if (String(data[i][0]) === String(userData.Username)) return { success:false, message:'Username already exists' };
    var maxU = num(CTX.tenant && CTX.tenant.max_users);
    if (maxU > 0) {
      var live = 0; for (var j = 1; j < data.length; j++) if (Number(data[j][15]) !== 1) live++;
      if (live >= maxU) return { success:false, message:'Your plan allows ' + maxU + ' staff users. Contact Armedias to upgrade.' };
    }
    var ts = nowIso();
    sheet.appendRow([userData.Username, userData.Email, userData.Password, userData.Role || 'collector', userData.Status || 'Active',
      '', 'light', '', ts, currentUser, ts, currentUser, userData.Name || '', userData.Phone || '', userData.AreaId || '', 0, '', '']);
    addLog(currentUser, 'User Added', 'Added user: ' + userData.Username);
    return { success:true, message:'User added successfully!' };
  } catch (error) { return { success:false, message:'Error: ' + error.toString() }; }
}

function updateUser(username, userData, currentUser) {
  try {
    if (!gate_(currentUser, 'users', 'e')) return { success:false, message:'Access denied' };
    var sheet = db_().getSheetByName(USERS_SHEET);
    if (!sheet) return { success:false, message:'Users sheet not found' };
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) !== String(username)) continue;
      sheet.getRange(i + 1, 2).setValue(userData.Email);
      if (userData.Password && String(userData.Password).trim() !== '') sheet.getRange(i + 1, 3).setValue(userData.Password);
      sheet.getRange(i + 1, 4).setValue(userData.Role);
      sheet.getRange(i + 1, 5).setValue(userData.Status);
      if (userData.Name !== undefined)   sheet.getRange(i + 1, 13).setValue(userData.Name);
      if (userData.Phone !== undefined)  sheet.getRange(i + 1, 14).setValue(userData.Phone);
      if (userData.AreaId !== undefined) sheet.getRange(i + 1, 15).setValue(userData.AreaId);
      sheet.getRange(i + 1, 11).setValue(nowIso());
      sheet.getRange(i + 1, 12).setValue(currentUser);
      addLog(currentUser, 'User Updated', 'Updated user: ' + username);
      return { success:true, message:'User updated successfully!' };
    }
    return { success:false, message:'User not found' };
  } catch (error) { return { success:false, message:'Error: ' + error.toString() }; }
}

function deleteUser(username, currentUser) {
  try {
    if (!gate_(currentUser, 'users', 'd')) return { success:false, message:'Access denied' };
    var sheet = db_().getSheetByName(USERS_SHEET);
    if (!sheet) return { success:false, message:'Users sheet not found' };
    if (username === currentUser) return { success:false, message:'You cannot delete your own account' };
    var cr = roleByKey_(userRole_(currentUser)), callerIsSuper = !!(cr && cr.is_super);
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) !== String(username)) continue;
      var tr = roleByKey_(data[i][3]);
      if (tr && tr.is_super && !callerIsSuper) return { success:false, message:'Only a Super Admin can remove a Super Admin account' };
      sheet.getRange(i + 1, 16).setValue(1);
      addLog(currentUser, 'User Deleted', 'Deleted user: ' + username);
      return { success:true, message:'User deleted successfully!' };
    }
    return { success:false, message:'User not found' };
  } catch (error) { return { success:false, message:'Error: ' + error.toString() }; }
}

function updateMyAccount(username, formData) {
  try {
    var sheet = db_().getSheetByName(USERS_SHEET);
    if (!sheet) return { success:false, message:'Users sheet not found' };
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) !== String(username)) continue;
      if (String(formData.CurrentPassword) !== String(data[i][2])) return { success:false, message:'Current password is incorrect' };
      sheet.getRange(i + 1, 2).setValue(formData.Email);
      if (formData.NewPassword && String(formData.NewPassword).trim() !== '') sheet.getRange(i + 1, 3).setValue(formData.NewPassword);
      sheet.getRange(i + 1, 11).setValue(nowIso());
      sheet.getRange(i + 1, 12).setValue(username);
      addLog(username, 'Profile Updated', 'Updated own profile');
      return { success:true, message:'Account updated successfully!' };
    }
    return { success:false, message:'User not found' };
  } catch (error) { return { success:false, message:'Error: ' + error.toString() }; }
}

// ============== Dashboard Stats ==============
function getDashboardStats(callerUser) {
  try {
    if (!gate_(callerUser, 'dashboard', 'v')) return { success:false, message:'Access denied' };
    var month = monthStr_();
    var custs = readObjs_('Customers'), invs = readObjs_('Invoices'), pays = readObjs_('Payments');
    var comps = readObjs_('Complaints'), leads = readObjs_('Leads');
    var collectedThisMonth = pays.filter(function(p){ return ymd_(p.payment_date).slice(0,7) === month; }).reduce(function(s,p){ return s + num(p.amount); }, 0);
    var invoicedThisMonth  = invs.filter(function(i){ return String(i.billing_month).slice(0,7) === month; }).reduce(function(s,i){ return s + num(i.total); }, 0);
    var withDues = custs.filter(function(c){ return num(c.current_balance) > 0.009; });
    var outstanding = withDues.reduce(function(s,c){ return s + num(c.current_balance); }, 0);
    var arrears = custs.reduce(function(s,c){ return s + Math.max(0, num(c.previous_balance)); }, 0);
    var last6 = [];
    for (var m = 5; m >= 0; m--) {
      var key = monthBack_(m);
      var sum = pays.filter(function(p){ return ymd_(p.payment_date).slice(0,7) === key; }).reduce(function(s,p){ return s + num(p.amount); }, 0);
      var bill = invs.filter(function(i){ return String(i.billing_month).slice(0,7) === key; }).reduce(function(s,i){ return s + num(i.total); }, 0);
      last6.push({ month:key, total:round2(sum), invoiced:round2(bill) });
    }
    return { success:true, data:{
      totalCustomers: custs.length,
      activeConnections: custs.filter(function(c){ return c.connection_status === 'active'; }).length,
      suspended: custs.filter(function(c){ return c.connection_status === 'suspended'; }).length,
      invoicedThisMonth: round2(invoicedThisMonth), collectedThisMonth: round2(collectedThisMonth),
      outstanding: round2(outstanding), previousArrears: round2(arrears), defaulters: withDues.length,
      openComplaints: comps.filter(function(c){ return c.status === 'open' || c.status === 'in_progress'; }).length,
      activeLeads: leads.filter(function(l){ return ['new','contacted','quoted','negotiating'].indexOf(l.status) !== -1; }).length,
      last6: last6
    }};
  } catch (error) { return { success:false, message:'Error: ' + error.toString() }; }
}

// ============== File Upload ==============
function getAssetsFolder_() {
  var folders = DriveApp.getFoldersByName(ASSETS_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  var folder = DriveApp.createFolder(ASSETS_FOLDER_NAME);
  folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return folder;
}

function uploadProfileImage(base64Data, filename, username) {
  try {
    db_(); // must be inside a logged-in company context
    var folder = getAssetsFolder_();
    var base64String = String(base64Data).split(',')[1] || base64Data;
    var blob = Utilities.newBlob(Utilities.base64Decode(base64String), 'image/jpeg', filename);
    var file = folder.createFile(blob);
    file.setName(CTX.tid + '_' + username + '_' + new Date().getTime() + '_' + filename);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    var fileId = file.getId();
    addLog(username, 'Profile Image Uploaded', 'Uploaded profile image: ' + file.getName());
    return { success:true, fileId:fileId, fileUrl:'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w400', fileName:file.getName() };
  } catch (error) { return { success:false, message:'Upload error: ' + error.toString() }; }
}

function updateUserSettings(username, settings) {
  try {
    var sheet = db_().getSheetByName(USERS_SHEET);
    if (!sheet) return { success:false, message:'Users sheet not found' };
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) !== String(username)) continue;
      if (settings.profileImage !== undefined) sheet.getRange(i + 1, 6).setValue(settings.profileImage);
      if (settings.themeMode !== undefined)    sheet.getRange(i + 1, 7).setValue(settings.themeMode);
      if (settings.customColors !== undefined) sheet.getRange(i + 1, 8).setValue(settings.customColors);
      sheet.getRange(i + 1, 11).setValue(nowIso());
      sheet.getRange(i + 1, 12).setValue(username);
      addLog(username, 'Settings Updated', 'Updated user settings');
      return { success:true, message:'Settings updated successfully!' };
    }
    return { success:false, message:'User not found' };
  } catch (error) { return { success:false, message:'Error: ' + error.toString() }; }
}

function getUserSettings(username) {
  try {
    var sheet = db_().getSheetByName(USERS_SHEET);
    if (!sheet) return { success:false, message:'Users sheet not found' };
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(username)) {
        return { success:true, settings:{ profileImage:data[i][5] || '', themeMode:data[i][6] || 'light', customColors:data[i][7] || '' } };
      }
    }
    return { success:false, message:'User not found' };
  } catch (error) { return { success:false, message:'Error: ' + error.toString() }; }
}

// ============== Activity log ==============
function addLog(user, action, details) {
  try {
    var sheet = db_().getSheetByName(LOGS_SHEET);
    if (sheet) sheet.appendRow([nowIso(), user, action, details]);
  } catch (error) { Logger.log('Error adding log: ' + error.toString()); }
}

// ============== RBAC Backend ==============
function ensureRbac_(ss) {
  ss = ss || db_();
  var sh = ss.getSheetByName(ROLES_SHEET);
  if (!sh) {
    sh = ss.insertSheet(ROLES_SHEET);
    sh.appendRow(['role_key','label','color','sort_order','is_super','hidden_signup','permissions']);
    sh.getRange(1, 1, 1, 7).setBackground('#33383d').setFontColor('white').setFontWeight('bold');
    RBAC_ROLE_DEFS.forEach(function(r, i){
      sh.appendRow([r.key, r.label, r.color, i, r.is_super, r.hidden_signup, JSON.stringify(rbacDefaultPerms_(r.key))]);
    });
  }
  return sh;
}

function readRoles_() {
  if (CTX && CTX.roles) return CTX.roles;
  var data = ensureRbac_().getDataRange().getValues(), out = [];
  for (var i = 1; i < data.length; i++) {
    var r = data[i]; if (!r[ROLE_C.KEY]) continue;
    var perms = {}; try { perms = JSON.parse(r[ROLE_C.PERMS] || '{}'); } catch (e) {}
    out.push({ key:r[ROLE_C.KEY], label:r[ROLE_C.LABEL], color:r[ROLE_C.COLOR], sort:Number(r[ROLE_C.SORT])||0,
               is_super:Number(r[ROLE_C.SUPER])?1:0, hidden_signup:Number(r[ROLE_C.HIDDEN])?1:0, perms:perms });
  }
  out.sort(function(a,b){ return a.sort - b.sort; });
  if (CTX) CTX.roles = out;
  return out;
}
function roleByKey_(key){ var a = readRoles_(); for (var i=0;i<a.length;i++) if (a[i].key===key) return a[i]; return null; }
function canEditRbac_(role){ return RBAC_EDIT_ROLES.indexOf(role) !== -1; }
function rbacPermsFor_(role){ var r = roleByKey_(role); return r ? r.perms : rbacDefaultPerms_(role); }
function hasPerm_(role, page, perm){ var r = roleByKey_(role); return !!(r && r.perms && r.perms[page] && r.perms[page][perm || 'v']); }

// role of an ACTIVE, non-removed user in the current company (null otherwise)
function userRole_(username) {
  if (CTX && CTX.roleOf && Object.prototype.hasOwnProperty.call(CTX.roleOf, username)) return CTX.roleOf[username];
  var sh = db_().getSheetByName(USERS_SHEET);
  if (!sh) return null;
  var data = sh.getDataRange().getValues(), role = null;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) !== String(username)) continue;
    role = (Number(data[i][15]) === 1 || data[i][4] !== 'Active') ? null : data[i][3];
    break;
  }
  if (CTX) { CTX.roleOf = CTX.roleOf || {}; CTX.roleOf[username] = role; }
  return role;
}
function gate_(username, page, perm) { return hasPerm_(userRole_(username), page, perm); }

function getMyPermissions(callerUser) {
  var role = userRole_(callerUser);
  return { success:true, perms: rbacPermsFor_(role), canEdit: canEditRbac_(role) };
}

function getRbacMatrix(callerUser) {
  if (!canEditRbac_(userRole_(callerUser))) return { success:false, message:'Access denied' };
  var roles = readRoles_(), perms = {};
  roles.forEach(function(r){ perms[r.key] = r.perms; });
  return { success:true, pages:RBAC_PAGES,
    roles: roles.map(function(r){ return { key:r.key, label:r.label, color:r.color, is_super:r.is_super }; }),
    perms: perms };
}

function toggleRbac(roleKey, pageKey, perm, value, callerUser) {
  if (!canEditRbac_(userRole_(callerUser))) return { success:false, message:'Access denied' };
  if (['v','a','e','d'].indexOf(perm) === -1) return { success:false, message:'Bad permission' };
  var sh = ensureRbac_(), data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][ROLE_C.KEY] !== roleKey) continue;
    if (Number(data[i][ROLE_C.SUPER]) === 1) return { success:false, message:'Super Admin (owner) permissions are locked' };
    var p = {}; try { p = JSON.parse(data[i][ROLE_C.PERMS] || '{}'); } catch (e) {}
    if (!p[pageKey]) p[pageKey] = { v:0, a:0, e:0, d:0 };
    p[pageKey][perm] = value ? 1 : 0;
    if (perm === 'v' && !value) { p[pageKey].a = 0; p[pageKey].e = 0; p[pageKey].d = 0; }
    if (perm !== 'v' && value) p[pageKey].v = 1;
    sh.getRange(i + 1, ROLE_C.PERMS + 1).setValue(JSON.stringify(p));
    addLog(callerUser, 'Permissions Updated', roleKey + ' · ' + pageKey + ' · ' + perm + '=' + (value ? 1 : 0));
    return { success:true, message:'Saved' };
  }
  return { success:false, message:'Role not found' };
}

function getLogs(callerUser) {
  if (!gate_(callerUser, 'logs', 'v')) return { success:false, message:'Access denied' };
  var sh = db_().getSheetByName(LOGS_SHEET);
  if (!sh) return { success:true, data:[] };
  var data = sh.getDataRange().getValues(), out = [];
  for (var i = 1; i < data.length; i++) out.push({ Timestamp:isoIfDate_(data[i][0]), User:data[i][1], Action:data[i][2], Details:data[i][3] });
  out.reverse();
  return { success:true, data:out };
}

// ============== Generic Table Engine ==============
var TBL = {
  areas:        { sheet:'Areas',          cols:['name','city','description','status'] },
  packages:     { sheet:'Packages',       cols:['name','speed_mbps','price','billing_cycle','description','status'] },
  customers:    { sheet:'Customers',      cols:['customer_code','full_name','phone','email','cnic','address','area_id','package_id','installation_date','monthly_due_day','ip_address','mac_address','connection_status','opening_balance','notes','previous_balance','current_balance'] },
  invoices:     { sheet:'Invoices',       cols:['invoice_number','customer_id','package_id','billing_month','amount','discount','tax','total','previous_balance','due_date','status','paid_amount','balance'] },
  payments:     { sheet:'Payments',       cols:['receipt_number','slip_code','invoice_id','customer_id','amount','payment_method','payment_date','collected_by','reference_number','notes'] },
  expenses:     { sheet:'Expenses',       cols:['expense_date','category','description','amount','paid_by','receipt_image','notes'] },
  vendors:      { sheet:'Vendors',        cols:['vendor_code','vendor_name','contact_person','phone','email','address','city','opening_balance','current_balance','status','notes'] },
  banks:        { sheet:'BankAccounts',   cols:['account_name','account_title','bank_name','branch_name','account_number','iban','account_type','currency','opening_balance','current_balance','is_default','status','notes'] },
  complaints:   { sheet:'Complaints',     cols:['ticket_number','customer_id','subject','description','priority','status','assigned_to','resolution','resolved_at'] },
  calls:        { sheet:'CallLogs',       cols:['customer_id','invoice_id','called_by','call_date','outcome','promised_date','notes'] },
  leads:        { sheet:'Leads',          cols:['full_name','phone','alternate_phone','email','address','area_id','package_interested_id','source','status','priority','owner_user_id','expected_install_date','quote_amount','next_followup_date','notes'] },
  equipment:    { sheet:'Equipment',      cols:['type','brand','model','serial','mac','status','assigned_to_customer_id','assigned_at','purchase_cost','purchase_date','vendor_name','location','notes'] },
  collections:  { sheet:'CollectionRuns', cols:['collector_user_id','collection_date','opening_balance','total_collected_cash','total_collected_online','total_expenses_paid','closing_balance','deposited_to_bank_amount','deposit_date','deposit_reference','status','notes'] },
  notifications:{ sheet:'Notifications',  cols:['user_id','title','message','type','is_read','link'] }
};

var TBL_HOOKS = {
  customers:  { code:{ field:'customer_code',  prefix:'CUS' } },
  invoices:   { code:{ field:'invoice_number', prefix:'INV' },
                pre:function(o){ if (o.previous_balance === undefined || o.previous_balance === '' || o.previous_balance === null) { var c = custById_(o.customer_id); o.previous_balance = c ? round2(num(c.current_balance)) : 0; } },
                compute:function(o){ o.total = round2(num(o.amount) - num(o.discount) + num(o.tax)); } },
  payments:   { code:{ field:'receipt_number', prefix:'RCP' } },
  vendors:    { code:{ field:'vendor_code',    prefix:'VEN' } },
  complaints: { code:{ field:'ticket_number',  prefix:'TKT' } },
  collections:{ compute:function(o){ o.closing_balance = round2(num(o.opening_balance) + num(o.total_collected_cash) + num(o.total_collected_online) - num(o.total_expenses_paid) - num(o.deposited_to_bank_amount)); } }
};

var TBL_UNIQUE = {
  payments:   [ { n:'reference_number', l:'Payment ID / Reference', ref:'receipt_number' }, { n:'slip_code', l:'Slip Code', ref:'receipt_number' } ],
  customers:  [ { n:'customer_code', l:'Customer Code', ref:'full_name' } ],
  invoices:   [ { n:'invoice_number', l:'Invoice #', ref:'invoice_number' } ],
  vendors:    [ { n:'vendor_code', l:'Vendor Code', ref:'vendor_name' } ],
  complaints: [ { n:'ticket_number', l:'Ticket #', ref:'ticket_number' } ],
  equipment:  [ { n:'serial', l:'Serial #', ref:'serial' } ]
};

function num(v){ return Number(v) || 0; }
function round2(n){ return Math.round((Number(n)||0) * 100) / 100; }
function nowIso(){ return new Date().toISOString(); }
function pad_(n, w){ n = String(n); while (n.length < (w||5)) n = '0' + n; return n; }
function isoIfDate_(v){ return (v instanceof Date) ? v.toISOString() : v; }
function ymd_(v){ return String(isoIfDate_(v) || '').slice(0, 10); }

// company timezone (from its spreadsheet) — never toISOString() a local-midnight Date
function tz_(){
  if (CTX && CTX.ss) { if (!CTX.tz) { try { CTX.tz = CTX.ss.getSpreadsheetTimeZone(); } catch (e) {} } if (CTX.tz) return CTX.tz; }
  return Session.getScriptTimeZone() || 'Asia/Karachi';
}
function todayStr_(){ return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd'); }
function monthStr_(d){ return Utilities.formatDate(d || new Date(), tz_(), 'yyyy-MM'); }
function monthBack_(n){ var d = new Date(); return monthStr_(new Date(d.getFullYear(), d.getMonth() - n, 15)); }
function colIdx_(head){ var m = {}; head.forEach(function(h, i){ m[h] = i; }); return m; }

function sheetHead_(sh, key){
  var w = sh.getLastColumn();
  if (!w) return tblHeader_(key);
  var h = sh.getRange(1, 1, 1, w).getValues()[0];
  return (h && h[0]) ? h : tblHeader_(key);
}

function uniqueErr_(key, head, data, obj, excludeId){
  var spec = TBL_UNIQUE[key]; if (!spec) return null;
  var idc = head.indexOf('id'), dc = head.indexOf('is_deleted');
  for (var f = 0; f < spec.length; f++){
    var col = head.indexOf(spec[f].n); if (col === -1) continue;
    var val = String(obj[spec[f].n] == null ? '' : obj[spec[f].n]).trim();
    if (!val) continue;
    for (var i = 1; i < data.length; i++){
      if (dc !== -1 && Number(data[i][dc]) === 1) continue;
      if (excludeId != null && String(data[i][idc]) === String(excludeId)) continue;
      if (String(data[i][col]).trim().toLowerCase() !== val.toLowerCase()) continue;
      var rc = head.indexOf(spec[f].ref);
      return { success:false, duplicate:true, field:spec[f].n,
               message:spec[f].l + ' "' + val + '" is already used on ' + ((rc !== -1 && data[i][rc]) ? data[i][rc] : ('record #' + data[i][idc])) + '. Duplicates are not allowed.' };
    }
  }
  return null;
}

function custById_(id){
  var rows = readObjs_('Customers');
  for (var i = 0; i < rows.length; i++) if (String(rows[i].id) === String(id)) return rows[i];
  return null;
}

function tblSheet_(key){ var t = TBL[key]; if (!t) return null; return db_().getSheetByName(t.sheet); }
function tblHeader_(key){ return ['id'].concat(TBL[key].cols, ['is_deleted','created_at','updated_at']); }

function readObjs_(sheetName){
  var sh = db_().getSheetByName(sheetName);
  if (!sh) return [];
  var data = sh.getDataRange().getValues();
  if (data.length < 2) return [];
  var head = data[0], di = head.indexOf('is_deleted'), out = [];
  for (var i = 1; i < data.length; i++) {
    if (di !== -1 && Number(data[i][di]) === 1) continue;
    var o = {};
    for (var c = 0; c < head.length; c++) o[head[c]] = isoIfDate_(data[i][c]);
    out.push(o);
  }
  return out;
}

function tblRead(caller, key){
  if (!gate_(caller, key, 'v')) return { success:false, message:'Access denied' };
  if (!TBL[key]) return { success:false, message:'Unknown table' };
  return { success:true, data: readObjs_(TBL[key].sheet) };
}

function tblNextId_(sh, head){
  var data = sh.getDataRange().getValues(), idc = head.indexOf('id'), mx = 0;
  for (var i = 1; i < data.length; i++){ var n = Number(data[i][idc]); if (n > mx) mx = n; }
  return mx + 1;
}

function tblAfterWrite_(key){
  if (['payments','invoices','customers'].indexOf(key) === -1) return;
  try { recalcBalances_(); } catch (e) { Logger.log('recalc failed: ' + e); }
}

function tblInsert(caller, key, obj){
  if (!gate_(caller, key, 'a')) return { success:false, message:'Access denied' };
  var sh = tblSheet_(key); if (!sh) return { success:false, message:'Sheet missing' };
  obj = obj || {};
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { return { success:false, message:'System is busy, please try again' }; }
  var id;
  try {
    var data = sh.getDataRange().getValues(), head = sheetHead_(sh, key), hook = TBL_HOOKS[key] || {};
    // plan limit set by Armedias in the Master Console (0 = unlimited)
    var maxC = num(CTX.tenant && CTX.tenant.max_customers);
    if (key === 'customers' && maxC > 0) {
      var di = head.indexOf('is_deleted'), live = 0;
      for (var r = 1; r < data.length; r++) if (Number(data[r][di]) !== 1) live++;
      if (live >= maxC) return { success:false, message:'Your plan allows ' + maxC + ' customers. Contact Armedias to upgrade.' };
    }
    var idc = head.indexOf('id'), mx = 0;
    for (var i = 1; i < data.length; i++){ var n = Number(data[i][idc]); if (n > mx) mx = n; }
    id = mx + 1;
    var ts = nowIso();
    if (hook.code && !obj[hook.code.field]) obj[hook.code.field] = hook.code.prefix + '-' + pad_(id);
    if (hook.pre) hook.pre(obj);
    if (hook.compute) hook.compute(obj);
    var dup = uniqueErr_(key, head, data, obj, null); if (dup) return dup;
    sh.appendRow(head.map(function(h){
      if (h === 'id') return id;
      if (h === 'is_deleted') return 0;
      if (h === 'created_at' || h === 'updated_at') return ts;
      return (obj[h] !== undefined && obj[h] !== null) ? obj[h] : '';
    }));
  } finally { lock.releaseLock(); }
  addLog(caller, key + ' Added', '#' + id);
  tblAfterWrite_(key);
  return { success:true, message:'Saved successfully!', id:id };
}

function tblUpdate(caller, key, id, obj){
  if (!gate_(caller, key, 'e')) return { success:false, message:'Access denied' };
  var sh = tblSheet_(key); if (!sh) return { success:false, message:'Sheet missing' };
  obj = obj || {};
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { return { success:false, message:'System is busy, please try again' }; }
  try {
    var data = sh.getDataRange().getValues(), head = data[0], idc = head.indexOf('id'), hook = TBL_HOOKS[key] || {};
    for (var i = 1; i < data.length; i++){
      if (String(data[i][idc]) !== String(id)) continue;
      var row = {}; head.forEach(function(h, c){ row[h] = isoIfDate_(data[i][c]); });
      Object.keys(obj).forEach(function(k){ if (head.indexOf(k) !== -1) row[k] = obj[k]; });
      if (hook.compute) hook.compute(row);
      var dup = uniqueErr_(key, head, data, row, id); if (dup) return dup;
      row.id = data[i][idc]; row.updated_at = nowIso();
      row.created_at = isoIfDate_(data[i][head.indexOf('created_at')]);
      row.is_deleted = data[i][head.indexOf('is_deleted')];
      sh.getRange(i + 1, 1, 1, head.length).setValues([head.map(function(h){ return (row[h] !== undefined && row[h] !== null) ? row[h] : ''; })]);
      addLog(caller, key + ' Updated', '#' + id);
      tblAfterWrite_(key);
      return { success:true, message:'Updated successfully!' };
    }
  } finally { lock.releaseLock(); }
  return { success:false, message:'Record not found' };
}

function tblDelete(caller, key, id){
  if (!gate_(caller, key, 'd')) return { success:false, message:'Access denied' };
  var sh = tblSheet_(key); if (!sh) return { success:false, message:'Sheet missing' };
  var data = sh.getDataRange().getValues(), head = data[0], idc = head.indexOf('id'), di = head.indexOf('is_deleted');
  for (var i = 1; i < data.length; i++){
    if (String(data[i][idc]) === String(id)){
      sh.getRange(i+1, di+1).setValue(1);
      addLog(caller, key + ' Deleted', '#' + id);
      tblAfterWrite_(key);
      return { success:true, message:'Deleted successfully!' };
    }
  }
  return { success:false, message:'Record not found' };
}

// ============== Balance Ledger Engine ==============
function recalcBalances_(){
  var ss = db_();
  var cs = ss.getSheetByName(TBL.customers.sheet), is = ss.getSheetByName(TBL.invoices.sheet), ps = ss.getSheetByName(TBL.payments.sheet);
  if (!cs || !is || !ps) return;
  var cv = cs.getDataRange().getValues(), iv = is.getDataRange().getValues(), pv = ps.getDataRange().getValues();
  if (cv.length < 1 || iv.length < 1 || pv.length < 1) return;
  var cH = colIdx_(cv[0]), iH = colIdx_(iv[0]), pH = colIdx_(pv[0]);
  if ([cH.opening_balance, cH.previous_balance, cH.current_balance, iH.status, iH.paid_amount, iH.balance, pH.amount, pH.payment_date].some(function(x){ return x === undefined; })) return;
  var iAdj = (iH.paid_amount === iH.status + 1 && iH.balance === iH.status + 2);
  var cAdj = (cH.current_balance === cH.previous_balance + 1);
  var put = function(sh, rows, cols, adj, startCol){
    if (!rows.length) return;
    if (adj) { sh.getRange(2, startCol + 1, rows.length, cols.length).setValues(rows); return; }
    cols.forEach(function(c, j){ sh.getRange(2, c + 1, rows.length, 1).setValues(rows.map(function(r){ return [r[j]]; })); });
  };

  var today = todayStr_(), month = monthStr_();
  var paidInv = {}, paidCust = {}, paidPrev = {};
  for (var p = 1; p < pv.length; p++){
    if (Number(pv[p][pH.is_deleted]) === 1) continue;
    var amt = num(pv[p][pH.amount]);
    var inv = String(pv[p][pH.invoice_id] || ''); if (inv) paidInv[inv] = (paidInv[inv] || 0) + amt;
    var pc  = String(pv[p][pH.customer_id] || ''); if (!pc) continue;
    paidCust[pc] = (paidCust[pc] || 0) + amt;
    var pm = ymd_(pv[p][pH.payment_date]).slice(0, 7);
    if (pm && pm < month) paidPrev[pc] = (paidPrev[pc] || 0) + amt;
  }

  var billed = {}, billedPrev = {}, iOut = [];
  for (var r = 1; r < iv.length; r++){
    var total = round2(num(iv[r][iH.total])), iid = String(iv[r][iH.id]);
    var paid = round2(paidInv[iid] || 0), bal = round2(total - paid);
    var st = paid <= 0.009 ? 'unpaid' : (bal > 0.009 ? 'partial' : 'paid');
    var due = ymd_(iv[r][iH.due_date]);
    if (st !== 'paid' && due && due < today) st = 'overdue';
    iOut.push([st, paid, bal < 0 ? 0 : bal]);
    if (Number(iv[r][iH.is_deleted]) === 1) continue;
    var cid = String(iv[r][iH.customer_id] || '');
    billed[cid] = (billed[cid] || 0) + total;
    var bm = String(isoIfDate_(iv[r][iH.billing_month]) || '').slice(0, 7);
    if (bm && bm < month) billedPrev[cid] = (billedPrev[cid] || 0) + total;
  }
  put(is, iOut, [iH.status, iH.paid_amount, iH.balance], iAdj, iH.status);

  var cOut = [];
  for (var c = 1; c < cv.length; c++){
    var key = String(cv[c][cH.id]), open = num(cv[c][cH.opening_balance]);
    var totalBal = round2(open + (billed[key] || 0) - (paidCust[key] || 0));
    var prev = round2(open + (billedPrev[key] || 0) - (paidPrev[key] || 0));
    cOut.push([prev < 0 ? 0 : prev, totalBal]);
  }
  put(cs, cOut, [cH.previous_balance, cH.current_balance], cAdj, cH.previous_balance);
}

function recalcAllBalances(caller){
  if (!gate_(caller, 'invoices', 'e') && !gate_(caller, 'settings', 'e')) return { success:false, message:'Access denied' };
  recalcBalances_();
  addLog(caller, 'Balances Recalculated', 'Full ledger rebuild');
  return { success:true, message:'All balances recalculated.' };
}

// ============== Lookups ==============
function lookupList_(key, labelCols){
  var sh = tblSheet_(key); if (!sh) return [];
  var data = sh.getDataRange().getValues(); if (data.length < 2) return [];
  var head = data[0], idc = head.indexOf('id'), di = head.indexOf('is_deleted');
  var idx = labelCols.map(function(c){ return head.indexOf(c); });
  var out = [];
  for (var i = 1; i < data.length; i++){
    if (di !== -1 && Number(data[i][di]) === 1) continue;
    var label = idx.map(function(j){ return j !== -1 ? data[i][j] : ''; }).filter(String).join(' · ');
    out.push({ id: data[i][idc], label: label });
  }
  return out;
}
function userLookup_(){
  var sh = db_().getSheetByName(USERS_SHEET);
  if (!sh) return [];
  var data = sh.getDataRange().getValues(), out = [];
  for (var i = 1; i < data.length; i++) { if (Number(data[i][15]) === 1) continue; out.push({ id: String(data[i][0]), label: data[i][0] + ' (' + data[i][3] + ')' }); }
  return out;
}
function customerLookup_(){
  return readObjs_('Customers').map(function(c){
    return { id:c.id, label:(c.customer_code ? c.customer_code + ' · ' : '') + (c.full_name || ''), name:c.full_name || '',
             phone:c.phone || '', area_id:c.area_id || '', package_id:c.package_id || '',
             balance:round2(num(c.current_balance)), previous:round2(num(c.previous_balance)), status:c.connection_status || '' };
  });
}
function packageLookup_(){
  return readObjs_('Packages').map(function(p){
    return { id:p.id, label:(p.name || '') + ' · ' + num(p.speed_mbps) + ' Mbps · Rs ' + num(p.price),
             name:p.name || '', speed:num(p.speed_mbps), price:round2(num(p.price)), cycle:p.billing_cycle || 'monthly' };
  });
}
function openInvoiceLookup_(){
  return readObjs_('Invoices').filter(function(i){ return num(i.balance) > 0.009; }).map(function(i){
    return { id:i.id, label:i.invoice_number + ' · ' + i.billing_month + ' · Rs ' + round2(num(i.balance)) + ' due',
             customer_id:i.customer_id, balance:round2(num(i.balance)), total:round2(num(i.total)), due_date:ymd_(i.due_date) };
  });
}
function getLookups(caller){
  var role = userRole_(caller); if (!role) return { success:false, message:'Access denied' };
  var perms = rbacPermsFor_(role), vis = function(p){ return !!(perms && perms[p] && perms[p].v); };
  return { success:true, data:{
    areas:     lookupList_('areas', ['name','city']),
    packages:  packageLookup_(),
    customers: vis('customers') ? customerLookup_() : [],
    invoices:  vis('invoices') ? openInvoiceLookup_() : [],
    vendors:   vis('vendors') ? lookupList_('vendors', ['vendor_name']) : [],
    banks:     vis('banks') ? lookupList_('banks', ['bank_name','account_number']) : [],
    users:     userLookup_(),
    company:   settingsMap_()
  }};
}

// ============== Dues at point of collection ==============
function getCustomerDues(caller, customerId){
  if (!gate_(caller, 'customers', 'v')) return { success:false, message:'Access denied' };
  var c = custById_(customerId); if (!c) return { success:false, message:'Customer not found' };
  var pkg = null, pkgs = readObjs_('Packages');
  for (var i = 0; i < pkgs.length; i++) if (String(pkgs[i].id) === String(c.package_id)) { pkg = pkgs[i]; break; }
  var month = monthStr_(), today = todayStr_();
  var invs = readObjs_('Invoices').filter(function(x){ return String(x.customer_id) === String(customerId); });
  var open = invs.filter(function(x){ return num(x.balance) > 0.009; })
                 .sort(function(a, b){ return String(ymd_(a.due_date)).localeCompare(String(ymd_(b.due_date))); })
                 .map(function(x){ return { id:x.id, invoice_number:x.invoice_number, billing_month:x.billing_month, total:round2(num(x.total)),
                                            paid:round2(num(x.paid_amount)), balance:round2(num(x.balance)), due_date:ymd_(x.due_date), status:x.status,
                                            days_overdue: ymd_(x.due_date) && ymd_(x.due_date) < today ? Math.round((new Date(today) - new Date(ymd_(x.due_date))) / 86400000) : 0 }; });
  var thisMonth = invs.filter(function(x){ return String(x.billing_month).slice(0, 7) === month; }).reduce(function(s, x){ return s + num(x.total); }, 0);
  var pays = readObjs_('Payments').filter(function(x){ return String(x.customer_id) === String(customerId); })
                 .sort(function(a, b){ return String(ymd_(b.payment_date)).localeCompare(String(ymd_(a.payment_date))); });
  var areas = readObjs_('Areas'), area = '';
  for (var a = 0; a < areas.length; a++) if (String(areas[a].id) === String(c.area_id)) { area = areas[a].name + (areas[a].city ? ' · ' + areas[a].city : ''); break; }
  return { success:true, data:{
    customer:{ id:c.id, code:c.customer_code, name:c.full_name, phone:c.phone, address:c.address, area:area, area_id:c.area_id, status:c.connection_status, due_day:c.monthly_due_day },
    pkg: pkg ? { name:pkg.name, speed:num(pkg.speed_mbps), price:round2(num(pkg.price)), cycle:pkg.billing_cycle } : null,
    opening_balance: round2(num(c.opening_balance)), previous_balance: round2(num(c.previous_balance)),
    month_charges: round2(thisMonth), total_payable: round2(num(c.current_balance)), open_invoices: open,
    recent_payments: pays.slice(0, 5).map(function(p){ return { receipt_number:p.receipt_number, slip_code:p.slip_code, amount:round2(num(p.amount)), payment_date:ymd_(p.payment_date), payment_method:p.payment_method }; }),
    billing_month: month
  }};
}

// ============== Quick Actions ==============
function convertLead(caller, leadId){
  if (!gate_(caller, 'customers', 'a')) return { success:false, message:'Access denied' };
  var leads = readObjs_('Leads'), lead = null;
  for (var i = 0; i < leads.length; i++) if (String(leads[i].id) === String(leadId)) { lead = leads[i]; break; }
  if (!lead) return { success:false, message:'Lead not found' };
  if (lead.status === 'won') return { success:false, message:'Lead already converted' };
  var res = tblInsert(caller, 'customers', {
    full_name:lead.full_name, phone:lead.phone, email:lead.email || '', cnic:'', address:lead.address || '',
    area_id:lead.area_id || '', package_id:lead.package_interested_id || '', installation_date:todayStr_(),
    monthly_due_day:1, ip_address:'', mac_address:'', connection_status:'active', opening_balance:0, notes:'Converted from lead #' + lead.id
  });
  if (!res.success) return res;
  tblUpdate(caller, 'leads', leadId, { status:'won' });
  return { success:true, message:'Lead converted (customer CUS-' + pad_(res.id) + ')', customerId:res.id };
}

function generateMonthlyInvoices(caller, month){
  if (!gate_(caller, 'invoices', 'a')) return { success:false, message:'Access denied' };
  month = /^\d{4}-\d{2}$/.test(String(month || '')) ? month : monthStr_();
  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) { return { success:false, message:'System is busy, please try again' }; }
  var count = 0, skipped = 0;
  try {
    var custs = readObjs_('Customers').filter(function(c){ return c.connection_status === 'active'; });
    var pkg = {}; readObjs_('Packages').forEach(function(p){ pkg[String(p.id)] = p; });
    var has = {}; readObjs_('Invoices').forEach(function(i){ if (String(i.billing_month) === String(month)) has[String(i.customer_id)] = 1; });
    var sh = tblSheet_('invoices'), head = sheetHead_(sh, 'invoices'), id = tblNextId_(sh, head), ts = nowIso(), out = [];
    custs.forEach(function(c){
      if (has[String(c.id)]) { skipped++; return; }
      var p = pkg[String(c.package_id)], amt = p ? round2(num(p.price)) : 0;
      var day = Math.min(28, Math.max(1, Number(c.monthly_due_day) || 10));
      var o = { invoice_number:'INV-' + pad_(id), customer_id:c.id, package_id:c.package_id, billing_month:month,
                amount:amt, discount:0, tax:0, total:amt, previous_balance:round2(num(c.current_balance)),
                due_date:month + '-' + pad_(day, 2), status:'unpaid', paid_amount:0, balance:amt };
      out.push(head.map(function(h){ if (h === 'id') return id; if (h === 'is_deleted') return 0; if (h === 'created_at' || h === 'updated_at') return ts; return o[h] !== undefined ? o[h] : ''; }));
      id++; count++;
    });
    if (out.length) sh.getRange(sh.getLastRow() + 1, 1, out.length, head.length).setValues(out);
  } finally { lock.releaseLock(); }
  recalcBalances_();
  addLog(caller, 'Invoices Generated', month + ' · ' + count + ' created, ' + skipped + ' skipped');
  return { success:true, count:count, skipped:skipped, message:'Generated ' + count + ' invoice(s) for ' + month + (skipped ? ' · ' + skipped + ' already billed' : '') };
}

function getRecovery(caller){
  if (!gate_(caller, 'recovery', 'v')) return { success:false, message:'Access denied' };
  var custs = readObjs_('Customers'), invs = readObjs_('Invoices'), today = todayStr_();
  var oldest = {}, cnt = {};
  invs.forEach(function(i){
    if (num(i.balance) <= 0.009) return;
    var k = String(i.customer_id); cnt[k] = (cnt[k] || 0) + 1;
    var d = ymd_(i.due_date); if (d && (!oldest[k] || d < oldest[k])) oldest[k] = d;
  });
  var pkg = {}; readObjs_('Packages').forEach(function(p){ pkg[String(p.id)] = p; });
  var out = [];
  custs.forEach(function(c){
    var bal = round2(num(c.current_balance)); if (bal <= 0.009) return;
    var o = oldest[String(c.id)];
    var days = o ? Math.max(0, Math.round((new Date(today) - new Date(o)) / 86400000)) : 0;
    var p = pkg[String(c.package_id)];
    out.push({ id:c.id, customer_code:c.customer_code, full_name:c.full_name, phone:c.phone, address:c.address,
               area_id:c.area_id, package_id:c.package_id, package:p ? p.name : '', speed:p ? num(p.speed_mbps) : 0,
               monthly_fee:p ? round2(num(p.price)) : 0, connection_status:c.connection_status,
               previous_balance:round2(num(c.previous_balance)), outstanding:bal,
               invoices:cnt[String(c.id)] || 0, days_overdue:days, oldest_due:o || '' });
  });
  out.sort(function(a, b){ return (b.days_overdue * 1e6 + b.outstanding) - (a.days_overdue * 1e6 + a.outstanding); });
  return { success:true, data:out };
}

function getAreaBalances(caller){
  if (!gate_(caller, 'areabalance', 'v')) return { success:false, message:'Access denied' };
  var areas = readObjs_('Areas'), custs = readObjs_('Customers'), invs = readObjs_('Invoices'), pays = readObjs_('Payments');
  var month = monthStr_();
  var areaOf = {}; custs.forEach(function(c){ areaOf[String(c.id)] = String(c.area_id || ''); });
  var billed = {}, billedMonth = {}, collected = {}, collectedMonth = {};
  invs.forEach(function(i){
    var a = areaOf[String(i.customer_id)] || '';
    billed[a] = (billed[a] || 0) + num(i.total);
    if (String(i.billing_month).slice(0, 7) === month) billedMonth[a] = (billedMonth[a] || 0) + num(i.total);
  });
  pays.forEach(function(p){
    var a = areaOf[String(p.customer_id)] || '';
    collected[a] = (collected[a] || 0) + num(p.amount);
    if (ymd_(p.payment_date).slice(0, 7) === month) collectedMonth[a] = (collectedMonth[a] || 0) + num(p.amount);
  });
  var agg = {};
  custs.forEach(function(c){
    var a = String(c.area_id || ''); if (!agg[a]) agg[a] = { customers:0, active:0, suspended:0, disconnected:0, outstanding:0, defaulters:0, opening:0 };
    var g = agg[a]; g.customers++;
    if (c.connection_status === 'active') g.active++;
    else if (c.connection_status === 'suspended') g.suspended++;
    else if (c.connection_status === 'disconnected') g.disconnected++;
    var bal = round2(num(c.current_balance));
    g.opening += num(c.opening_balance);
    if (bal > 0.009) { g.outstanding += bal; g.defaulters++; }
  });
  var out = areas.map(function(a){
    var g = agg[String(a.id)] || { customers:0, active:0, suspended:0, disconnected:0, outstanding:0, defaulters:0, opening:0 };
    var b = round2(billed[String(a.id)] || 0), col = round2(collected[String(a.id)] || 0);
    return { area_id:a.id, area:a.name, city:a.city || '', status:a.status,
             customers:g.customers, active:g.active, suspended:g.suspended, disconnected:g.disconnected,
             defaulters:g.defaulters, billed:b, collected:col, outstanding:round2(g.outstanding),
             billed_month:round2(billedMonth[String(a.id)] || 0), collected_month:round2(collectedMonth[String(a.id)] || 0),
             collection_pct: b > 0 ? Math.round((col / b) * 1000) / 10 : 0 };
  });
  out.sort(function(x, y){ return y.outstanding - x.outstanding; });
  var t = out.reduce(function(s, r){ s.customers += r.customers; s.active += r.active; s.defaulters += r.defaulters;
    s.billed += r.billed; s.collected += r.collected; s.outstanding += r.outstanding;
    s.billed_month += r.billed_month; s.collected_month += r.collected_month; return s; },
    { customers:0, active:0, defaulters:0, billed:0, collected:0, outstanding:0, billed_month:0, collected_month:0 });
  t.billed = round2(t.billed); t.collected = round2(t.collected); t.outstanding = round2(t.outstanding);
  t.billed_month = round2(t.billed_month); t.collected_month = round2(t.collected_month);
  t.collection_pct = t.billed > 0 ? Math.round((t.collected / t.billed) * 1000) / 10 : 0;
  return { success:true, data:{ areas:out, totals:t, month:month } };
}

function getArrearsReport(caller, opts){
  if (!gate_(caller, 'recovery', 'v')) return { success:false, message:'Access denied' };
  opts = opts || {};
  var r = getRecovery(caller); if (!r.success) return r;
  var areaId = String(opts.areaId || ''), minBal = num(opts.minBalance), minDays = num(opts.minDays);
  var areas = {}; readObjs_('Areas').forEach(function(a){ areas[String(a.id)] = a.name + (a.city ? ' · ' + a.city : ''); });
  var rows = r.data.filter(function(x){
    if (areaId && String(x.area_id) !== areaId) return false;
    if (minBal && x.outstanding < minBal) return false;
    if (minDays && x.days_overdue < minDays) return false;
    if (opts.status && x.connection_status !== opts.status) return false;
    return true;
  }).map(function(x){ x.area = areas[String(x.area_id)] || '—'; return x; });
  var totals = rows.reduce(function(s, x){ s.previous += x.previous_balance; s.outstanding += x.outstanding; s.invoices += x.invoices; return s; }, { previous:0, outstanding:0, invoices:0 });
  return { success:true, data:{ rows:rows, totals:{ previous:round2(totals.previous), outstanding:round2(totals.outstanding), invoices:totals.invoices, customers:rows.length },
           company:settingsMap_(), area:areaId ? (areas[areaId] || '') : 'All Areas', generated:todayStr_(), month:monthStr_() } };
}

function getPeriodReport(caller, year, month){
  if (!gate_(caller, 'reports', 'v')) return { success:false, message:'Access denied' };
  year = String(year || todayStr_().slice(0, 4));
  var invs = readObjs_('Invoices'), pays = readObjs_('Payments'), exps = readObjs_('Expenses'), custs = readObjs_('Customers');
  var inv = {}, col = {}, exp = {}, invN = {}, payN = {}, newC = {};
  invs.forEach(function(i){ var m = String(i.billing_month).slice(0, 7); if (m.slice(0, 4) !== year) return; inv[m] = (inv[m] || 0) + num(i.total); invN[m] = (invN[m] || 0) + 1; });
  pays.forEach(function(p){ var m = ymd_(p.payment_date).slice(0, 7); if (m.slice(0, 4) !== year) return; col[m] = (col[m] || 0) + num(p.amount); payN[m] = (payN[m] || 0) + 1; });
  exps.forEach(function(e){ var m = ymd_(e.expense_date).slice(0, 7); if (m.slice(0, 4) !== year) return; exp[m] = (exp[m] || 0) + num(e.amount); });
  custs.forEach(function(c){ var m = ymd_(c.installation_date).slice(0, 7); if (m.slice(0, 4) === year) newC[m] = (newC[m] || 0) + 1; });
  var months = [];
  for (var i = 1; i <= 12; i++){
    var m = year + '-' + pad_(i, 2);
    var iv = round2(inv[m] || 0), cv = round2(col[m] || 0), ev = round2(exp[m] || 0);
    months.push({ month:m, label:['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][i - 1],
                  invoiced:iv, collected:cv, expenses:ev, net:round2(cv - ev), outstanding:round2(iv - cv),
                  invoices:invN[m] || 0, payments:payN[m] || 0, new_customers:newC[m] || 0,
                  recovery_pct: iv > 0 ? Math.round((cv / iv) * 1000) / 10 : 0 });
  }
  var tot = months.reduce(function(s, r){ s.invoiced += r.invoiced; s.collected += r.collected; s.expenses += r.expenses;
    s.invoices += r.invoices; s.payments += r.payments; s.new_customers += r.new_customers; return s; },
    { invoiced:0, collected:0, expenses:0, invoices:0, payments:0, new_customers:0 });
  tot.invoiced = round2(tot.invoiced); tot.collected = round2(tot.collected); tot.expenses = round2(tot.expenses);
  tot.net = round2(tot.collected - tot.expenses); tot.outstanding = round2(tot.invoiced - tot.collected);
  tot.recovery_pct = tot.invoiced > 0 ? Math.round((tot.collected / tot.invoiced) * 1000) / 10 : 0;
  var byArea = [];
  if (month && /^\d{4}-\d{2}$/.test(String(month))){
    var areaOf = {}; custs.forEach(function(c){ areaOf[String(c.id)] = String(c.area_id || ''); });
    var ai = {}, ac = {};
    invs.forEach(function(x){ if (String(x.billing_month).slice(0, 7) !== month) return; var a = areaOf[String(x.customer_id)] || ''; ai[a] = (ai[a] || 0) + num(x.total); });
    pays.forEach(function(x){ if (ymd_(x.payment_date).slice(0, 7) !== month) return; var a = areaOf[String(x.customer_id)] || ''; ac[a] = (ac[a] || 0) + num(x.amount); });
    byArea = readObjs_('Areas').map(function(a){
      var iv2 = round2(ai[String(a.id)] || 0), cv2 = round2(ac[String(a.id)] || 0);
      return { area_id:a.id, area:a.name, city:a.city || '', invoiced:iv2, collected:cv2, outstanding:round2(iv2 - cv2),
               recovery_pct: iv2 > 0 ? Math.round((cv2 / iv2) * 1000) / 10 : 0 };
    }).sort(function(x, y){ return y.invoiced - x.invoiced; });
  }
  return { success:true, data:{ year:year, month:month || '', months:months, totals:tot, byArea:byArea, company:settingsMap_() } };
}

function getActionCenter(caller){
  if (!gate_(caller, 'dashboard', 'v')) return { success:false, message:'Access denied' };
  var today = todayStr_();
  var invs = readObjs_('Invoices'), custs = readObjs_('Customers'), comps = readObjs_('Complaints'), calls = readObjs_('CallLogs'), leads = readObjs_('Leads'), pays = readObjs_('Payments');
  var cmap = {}; custs.forEach(function(c){ cmap[String(c.id)] = c; });
  var overdue = invs.filter(function(i){ return num(i.balance) > 0.009 && ymd_(i.due_date) && ymd_(i.due_date) <= today; })
    .map(function(i){ var c = cmap[String(i.customer_id)] || {}; return { id:i.id, invoice_number:i.invoice_number, customer:c.full_name || ('#' + i.customer_id), phone:c.phone || '', customer_id:i.customer_id, total:round2(num(i.balance)), invoiced:round2(num(i.total)), due_date:ymd_(i.due_date) }; })
    .sort(function(a, b){ return String(a.due_date).localeCompare(String(b.due_date)); }).slice(0, 15);
  var followups = [];
  calls.forEach(function(cl){ if (cl.outcome === 'promised' && cl.promised_date && ymd_(cl.promised_date) <= today){ var c = cmap[String(cl.customer_id)] || {}; followups.push({ type:'Promise', who:c.full_name || ('#' + cl.customer_id), phone:c.phone || '', date:ymd_(cl.promised_date) }); } });
  leads.forEach(function(l){ if (l.next_followup_date && ymd_(l.next_followup_date) <= today && ['new','contacted','quoted','negotiating'].indexOf(l.status) !== -1) followups.push({ type:'Lead', who:l.full_name, phone:l.phone, date:ymd_(l.next_followup_date) }); });
  var openComplaints = comps.filter(function(x){ return x.status === 'open' || x.status === 'in_progress'; })
    .map(function(x){ var c = cmap[String(x.customer_id)] || {}; return { id:x.id, ticket:x.ticket_number, subject:x.subject, priority:x.priority, customer:c.full_name || ('#' + x.customer_id) }; }).slice(0, 15);
  var collectedToday = pays.filter(function(p){ return ymd_(p.payment_date) === today; }).reduce(function(s, p){ return s + num(p.amount); }, 0);
  return { success:true, data:{ overdue:overdue, followups:followups.slice(0, 15), openComplaints:openComplaints, collectedToday:round2(collectedToday) } };
}

function getPendingCounts(caller){
  try {
    var role = userRole_(caller);
    if (!role) return { success:false, message:'Access denied' };
    var perms = rbacPermsFor_(role);
    var vis = function(pg){ return !!(perms && perms[pg] && perms[pg].v); };
    var today = todayStr_(), out = {};
    if (vis('complaints')) out.complaints = readObjs_('Complaints').filter(function(c){ return c.status === 'open' || c.status === 'in_progress'; }).length;
    var invs = (vis('invoices') || vis('recovery')) ? readObjs_('Invoices') : null;
    if (vis('invoices')) out.invoices = invs.filter(function(i){ return num(i.balance) > 0.009; }).length;
    if (vis('recovery')) out.recovery = invs.filter(function(i){ return num(i.balance) > 0.009 && ymd_(i.due_date) && ymd_(i.due_date) <= today; }).length;
    if (vis('leads'))    out.leads = readObjs_('Leads').filter(function(l){ return ['new','contacted','quoted','negotiating'].indexOf(l.status) !== -1; }).length;
    if (vis('calls'))    out.calls = readObjs_('CallLogs').filter(function(c){ return c.outcome === 'promised' && c.promised_date && ymd_(c.promised_date) <= today; }).length;
    return { success:true, data:out };
  } catch (error) { return { success:false, message:'Error: ' + error.toString() }; }
}

function getCustomer360(caller, customerId){
  if (!gate_(caller, 'customers', 'v')) return { success:false, message:'Access denied' };
  var cust = custById_(customerId);
  if (!cust) return { success:false, message:'Customer not found' };
  var by = function(sheet, field){ return readObjs_(sheet).filter(function(r){ return String(r[field]) === String(customerId); }); };
  var invs = by('Invoices', 'customer_id'), pays = by('Payments', 'customer_id');
  var pending = invs.filter(function(i){ return num(i.balance) > 0.009; }).sort(function(a, b){ return String(ymd_(a.due_date)).localeCompare(String(ymd_(b.due_date))); });
  var billed = invs.reduce(function(s, i){ return s + num(i.total); }, 0);
  var paid   = pays.reduce(function(s, p){ return s + num(p.amount); }, 0);
  var pkg = null; readObjs_('Packages').forEach(function(p){ if (String(p.id) === String(cust.package_id)) pkg = p; });
  var area = ''; readObjs_('Areas').forEach(function(a){ if (String(a.id) === String(cust.area_id)) area = a.name + (a.city ? ' · ' + a.city : ''); });
  var today = todayStr_(), oldest = pending.length ? ymd_(pending[0].due_date) : '';
  return { success:true, data:{
    customer:cust, pkg: pkg ? { name:pkg.name, speed:num(pkg.speed_mbps), price:round2(num(pkg.price)), cycle:pkg.billing_cycle } : null,
    area:area, invoices:invs, payments:pays, pending:pending,
    complaints:by('Complaints', 'customer_id'), equipment:by('Equipment', 'assigned_to_customer_id'),
    documents:by('CustomerDocuments', 'customer_id'), calls:by('CallLogs', 'customer_id'),
    totals:{ opening:round2(num(cust.opening_balance)), billed:round2(billed), paid:round2(paid),
      previous:round2(num(cust.previous_balance)), outstanding:round2(num(cust.current_balance)),
      invoices:invs.length, pending:pending.length,
      days_overdue: oldest && oldest < today ? Math.round((new Date(today) - new Date(oldest)) / 86400000) : 0 }
  }};
}

function getUserActivity(caller, username){
  if (!gate_(caller, 'users', 'v')) return { success:false, message:'Access denied' };
  var sh = db_().getSheetByName(LOGS_SHEET);
  if (!sh) return { success:true, data:[] };
  var data = sh.getDataRange().getValues(), out = [];
  for (var i = 1; i < data.length; i++){
    if (String(data[i][1]) !== String(username)) continue;
    out.push({ Timestamp:isoIfDate_(data[i][0]), User:data[i][1], Action:data[i][2], Details:data[i][3] });
  }
  out.reverse();
  return { success:true, data:out };
}

function resetUserPassword(caller, username, newPwd){
  if (!gate_(caller, 'users', 'e')) return { success:false, message:'Access denied' };
  if (!newPwd) return { success:false, message:'Password required' };
  var sh = db_().getSheetByName(USERS_SHEET);
  if (!sh) return { success:false, message:'Users sheet not found' };
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++){
    if (String(data[i][0]) === String(username)){
      sh.getRange(i+1, 3).setValue(newPwd);
      sh.getRange(i+1, 11).setValue(nowIso());
      sh.getRange(i+1, 12).setValue(caller);
      addLog(caller, 'Password Reset', 'Reset password for: ' + username);
      return { success:true, message:'Password reset for ' + username };
    }
  }
  return { success:false, message:'User not found' };
}

// ============== Company settings (key/value) ==============
function settingsMap_(){
  var sh = db_().getSheetByName('Settings');
  var out = { company_name:(CTX.tenant && CTX.tenant.company_name) || 'My ISP', currency:'PKR', support_phone:'', whatsapp_number:'', invoice_prefix:'INV', late_fee_pct:'0' };
  if (!sh) return out;
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) if (data[i][0]) out[data[i][0]] = data[i][1];
  return out;
}
function getSettings(caller){
  if (!gate_(caller, 'settings', 'v')) return { success:false, message:'Access denied' };
  return { success:true, data:settingsMap_() };
}
function saveSettings(caller, obj){
  if (!gate_(caller, 'settings', 'e')) return { success:false, message:'Access denied' };
  var sh = db_().getSheetByName('Settings');
  if (!sh) return { success:false, message:'Settings sheet missing' };
  var data = sh.getDataRange().getValues(), idx = {};
  for (var i = 1; i < data.length; i++) idx[data[i][0]] = i + 1;
  Object.keys(obj || {}).forEach(function(k){ if (idx[k]) sh.getRange(idx[k], 2).setValue(obj[k]); else sh.appendRow([k, obj[k]]); });
  addLog(caller, 'Settings Updated', Object.keys(obj || {}).join(', '));
  return { success:true, message:'Settings saved successfully!' };
}

// ============== Child-Entity Engine ==============
var CHILD = {
  allocations:     { sheet:'PaymentAllocations',   page:'allocations',      parentCol:'payment_id' },
  expense_payments:{ sheet:'ExpensePayments',      page:'expense_payments', parentCol:'expense_id' },
  attachments:     { sheet:'ComplaintAttachments', page:'attachments',      parentCol:'complaint_id' },
  documents:       { sheet:'CustomerDocuments',    page:'documents',        parentCol:'customer_id' },
  visits:          { sheet:'CollectionVisits',     page:'visits',           parentCol:'collection_run_id' }
};
function childSheet_(key){ var c = CHILD[key]; return c ? db_().getSheetByName(c.sheet) : null; }

function childRead(caller, key, parentId){
  var c = CHILD[key]; if (!c) return { success:false, message:'Unknown table' };
  if (!gate_(caller, c.page, 'v')) return { success:false, message:'Access denied' };
  return { success:true, data: readObjs_(c.sheet).filter(function(r){ return String(r[c.parentCol]) === String(parentId); }) };
}

function childInsert(caller, key, parentId, obj){
  var c = CHILD[key]; if (!c) return { success:false, message:'Unknown table' };
  if (!gate_(caller, c.page, 'a')) return { success:false, message:'Access denied' };
  var sh = childSheet_(key); if (!sh) return { success:false, message:'Sheet missing' };
  obj = obj || {};
  var head = sh.getDataRange().getValues()[0], id = tblNextId_(sh, head), ts = nowIso();
  obj[c.parentCol] = parentId;
  sh.appendRow(head.map(function(h){
    if (h === 'id') return id;
    if (h === 'is_deleted') return 0;
    if (h === 'created_at' || h === 'uploaded_at') return ts;
    if (h === 'uploaded_by' || h === 'created_by_user_id') return obj[h] ? obj[h] : caller;
    return (obj[h] !== undefined && obj[h] !== null) ? obj[h] : '';
  }));
  addLog(caller, key + ' Added', c.parentCol + ' #' + parentId);
  return { success:true, message:'Saved successfully!', id:id };
}

function childDelete(caller, key, id){
  var c = CHILD[key]; if (!c) return { success:false, message:'Unknown table' };
  if (!gate_(caller, c.page, 'a')) return { success:false, message:'Access denied' };
  var sh = childSheet_(key); if (!sh) return { success:false, message:'Sheet missing' };
  var data = sh.getDataRange().getValues(), head = data[0], idc = head.indexOf('id'), di = head.indexOf('is_deleted');
  for (var i = 1; i < data.length; i++){
    if (String(data[i][idc]) === String(id)){
      sh.getRange(i+1, di+1).setValue(1);
      addLog(caller, key + ' Removed', '#' + id);
      return { success:true, message:'Removed' };
    }
  }
  return { success:false, message:'Record not found' };
}

// ============== New company database builder ==============
// Called by the Master Console when you create a client. Builds every sheet in a FRESH spreadsheet,
// seeds roles + the owner (Super Admin) login you chose, company settings, and optional demo data.
// opts = { tid, tenant, demo:bool, admin:{username,password,email,name,phone}, company:{name,phone,whatsapp} }
function buildTenantDb_(ss, opts) {
  var prev = CTX;
  CTX = { tid: opts.tid, tenant: opts.tenant || null, ss: ss, user: opts.admin.username };
  try {
    var temp = ss.insertSheet('__temp_' + new Date().getTime());
    ss.getSheets().forEach(function(sh){ if (sh.getSheetId() !== temp.getSheetId()) ss.deleteSheet(sh); });

    function mk(name, header){
      var sh = ss.insertSheet(name);
      sh.appendRow(header);
      sh.getRange(1, 1, 1, header.length).setBackground('#33383d').setFontColor('white').setFontWeight('bold');
      return sh;
    }
    function seed(key, obj, id, ts){
      var head = tblHeader_(key), hook = TBL_HOOKS[key] || {};
      if (hook.compute) hook.compute(obj);
      if (hook.code && !obj[hook.code.field]) obj[hook.code.field] = hook.code.prefix + '-' + pad_(id);
      ss.getSheetByName(TBL[key].sheet).appendRow(head.map(function(h){
        if (h === 'id') return id;
        if (h === 'is_deleted') return 0;
        if (h === 'created_at' || h === 'updated_at') return ts;
        return obj[h] !== undefined ? obj[h] : '';
      }));
    }
    function seedAll(key, list, ts){ list.forEach(function(o, i){ seed(key, o, i + 1, ts); }); }
    function ymd(n){ var d = new Date(); return Utilities.formatDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() - n), tz_(), 'yyyy-MM-dd'); }

    var ts = nowIso(), month = monthStr_(), A = opts.admin, co = opts.company || {};

    var usersSheet = mk(USERS_SHEET, ['Username','Email','Password','Role','Status','ProfileImage','ThemeMode','CustomColors','CreatedAt','CreatedBy','UpdatedAt','UpdatedBy','Name','Phone','AreaId','is_deleted','LastLogin','OTP']);
    usersSheet.getRange('A:A').setNumberFormat('@'); usersSheet.getRange('C:C').setNumberFormat('@'); usersSheet.getRange('N:N').setNumberFormat('@');
    var logsSheet  = mk(LOGS_SHEET, ['Timestamp','User','Action','Details']);
    ensureRbac_(ss);
    Object.keys(TBL).forEach(function(k){ mk(TBL[k].sheet, tblHeader_(k)); });
    mk('PaymentAllocations',   ['id','payment_id','invoice_id','amount','is_deleted','created_at']);
    mk('ExpensePayments',      ['id','expense_id','amount','payment_date','payment_method','reference','notes','created_by_user_id','is_deleted','created_at']);
    mk('ComplaintAttachments', ['id','complaint_id','file_path','original_name','file_size','uploaded_by','is_deleted','uploaded_at']);
    mk('CustomerDocuments',    ['id','customer_id','doc_type','file_path','original_name','file_size','uploaded_by','is_deleted','uploaded_at']);
    mk('CollectionVisits',     ['id','collection_run_id','customer_id','collector_user_id','visit_date','visit_time','outcome','amount_collected','payment_method','promised_amount','promised_date','payment_id','notes','is_deleted','created_at']);
    mk('Settings',             ['Key','Value']);

    // owner login (the credentials you give the client)
    usersSheet.appendRow([A.username, A.email || '', A.password, 'super_admin', 'Active', '', 'light', '', ts, 'Armedias', ts, 'Armedias', A.name || '', A.phone || '', '', 0, '', '']);

    var settingsSheet = ss.getSheetByName('Settings');
    [['company_name', co.name || ''], ['currency','PKR'], ['invoice_prefix','INV'], ['support_phone', co.phone || ''], ['whatsapp_number', co.whatsapp || co.phone || ''], ['late_fee_pct','0']]
      .forEach(function(kv){ settingsSheet.appendRow(kv); });
    settingsSheet.getRange('B:B').setNumberFormat('@');

    if (opts.demo) {
      // demo staff are created INACTIVE with random passwords — the owner can activate/reset them
      var AD = 'demo_admin', AC = 'demo_accounts', C1 = 'demo_collector1', C2 = 'demo_collector2';
      [[AD,'admin','Operations Lead'],[AC,'accountant','Finance Officer'],[C1,'collector','Field Agent One'],[C2,'collector','Field Agent Two']].forEach(function(u){
        usersSheet.appendRow([u[0], '', Utilities.getUuid().slice(0, 10), u[1], 'Inactive', '', 'light', '', ts, 'Armedias', ts, 'Armedias', u[2], '', '', 0, '', '']);
      });

      seedAll('areas', [
        { name:'North Zone', city:'City One', description:'Northern coverage', status:'active' },
        { name:'South Zone', city:'City One', description:'Southern coverage', status:'active' },
        { name:'East Block', city:'City Two', description:'Eastern coverage',  status:'active' },
        { name:'West Block', city:'City Two', description:'Western coverage',  status:'active' },
        { name:'Central',    city:'City One', description:'City center',       status:'active' }
      ], ts);

      var pkgPrice = [0, 1500, 2500, 4000, 8000, 15000];
      seedAll('packages', [
        { name:'Basic 10Mbps',     speed_mbps:10,  price:1500,  billing_cycle:'monthly', description:'Entry home plan',   status:'active' },
        { name:'Standard 25Mbps',  speed_mbps:25,  price:2500,  billing_cycle:'monthly', description:'Popular home plan', status:'active' },
        { name:'Premium 50Mbps',   speed_mbps:50,  price:4000,  billing_cycle:'monthly', description:'High-speed home',   status:'active' },
        { name:'Business 100Mbps', speed_mbps:100, price:8000,  billing_cycle:'monthly', description:'SME plan',          status:'active' },
        { name:'Fiber 200Mbps',    speed_mbps:200, price:15000, billing_cycle:'monthly', description:'Enterprise fiber',  status:'active' }
      ], ts);

      var custPkg  = [2,1,3,2,4,1,3,5,2,1];
      var custArea = [1,1,2,2,3,3,4,4,5,5];
      var custStat = ['active','active','active','active','suspended','active','active','disconnected','active','active'];
      var custOpen = [0, 0, 0, 0, 1500, 0, 2500, 6000, 0, 800];
      var custList = [];
      for (var ci = 0; ci < 10; ci++) custList.push({
        full_name:'Customer ' + (ci+1), phone:'0301-100000' + (ci+1), email:'customer' + (ci+1) + '@demo.com',
        cnic:'', address:'House ' + (ci+1) + ', Street ' + ((ci%5)+1), area_id:custArea[ci], package_id:custPkg[ci],
        installation_date:ymd(30 + ci*5), monthly_due_day:(ci%28)+1, ip_address:'10.0.0.' + (ci+1), mac_address:'',
        connection_status:custStat[ci], opening_balance:custOpen[ci], notes:'', previous_balance:0, current_balance:0
      });
      seedAll('customers', custList, ts);

      var invList = [];
      for (var ii = 0; ii < 10; ii++) invList.push({
        customer_id:ii+1, package_id:custPkg[ii], billing_month:month, amount:pkgPrice[custPkg[ii]],
        discount:0, tax:0, previous_balance:custOpen[ii], due_date:month + '-' + pad_((ii%28)+1, 2),
        status:'unpaid', paid_amount:0, balance:pkgPrice[custPkg[ii]]
      });
      seedAll('invoices', invList, ts);

      seedAll('payments', [
        { slip_code:'SLP-0001', invoice_id:1, customer_id:1, amount:pkgPrice[custPkg[0]],           payment_method:'cash',          payment_date:ymd(0), collected_by:C1, reference_number:'',         notes:'Full payment' },
        { slip_code:'SLP-0002', invoice_id:2, customer_id:2, amount:pkgPrice[custPkg[1]],           payment_method:'easypaisa',     payment_date:ymd(0), collected_by:C1, reference_number:'EP-1001',  notes:'' },
        { slip_code:'SLP-0003', invoice_id:3, customer_id:3, amount:pkgPrice[custPkg[2]],           payment_method:'bank_transfer', payment_date:ymd(3), collected_by:AC, reference_number:'TRX-2001', notes:'' },
        { slip_code:'SLP-0004', invoice_id:4, customer_id:4, amount:pkgPrice[custPkg[3]],           payment_method:'jazzcash',      payment_date:ymd(4), collected_by:C2, reference_number:'JC-3001',  notes:'' },
        { slip_code:'SLP-0005', invoice_id:5, customer_id:5, amount:round2(pkgPrice[custPkg[4]]/2), payment_method:'cash',          payment_date:ymd(1), collected_by:C1, reference_number:'',         notes:'Partial' },
        { slip_code:'SLP-0006', invoice_id:6, customer_id:6, amount:round2(pkgPrice[custPkg[5]]/2), payment_method:'cash',          payment_date:ymd(2), collected_by:C2, reference_number:'',         notes:'Partial' }
      ], ts);

      seedAll('expenses', [
        { expense_date:ymd(3), category:'bandwidth',   description:'Upstream bandwidth - monthly', amount:120000, paid_by:A.username, receipt_image:'', notes:'' },
        { expense_date:ymd(5), category:'salary',      description:'Staff salaries',               amount:85000,  paid_by:A.username, receipt_image:'', notes:'' },
        { expense_date:ymd(7), category:'rent',        description:'Office + tower rent',          amount:40000,  paid_by:A.username, receipt_image:'', notes:'' },
        { expense_date:ymd(2), category:'utilities',   description:'Electricity bill',             amount:18000,  paid_by:AC,         receipt_image:'', notes:'' },
        { expense_date:ymd(1), category:'maintenance', description:'Fiber splicing repair',        amount:9500,   paid_by:C1,         receipt_image:'', notes:'' }
      ], ts);

      seedAll('vendors', [
        { vendor_name:'Alpha Networks Supplier', contact_person:'Sales Desk', phone:'042-1000001', email:'alpha@demo.com', address:'Industrial Area', city:'City One', opening_balance:0, current_balance:50000, status:'active', notes:'Bandwidth provider' },
        { vendor_name:'Beta Hardware Trading',   contact_person:'Order Desk', phone:'042-1000002', email:'beta@demo.com',  address:'Tech Market',     city:'City Two', opening_balance:0, current_balance:0,     status:'active', notes:'Routers / ONUs' }
      ], ts);

      seedAll('banks', [
        { account_name:'Main Operating Account', account_title:co.name || 'Company', bank_name:'Demo Bank Ltd', branch_name:'Main Branch', account_number:'0001234567', iban:'PK00DEMO0001234567', account_type:'current', currency:'PKR', opening_balance:200000, current_balance:435000, is_default:1, status:'active', notes:'' },
        { account_name:'Field Cash Drawer',      account_title:co.name || 'Company', bank_name:'Cash',          branch_name:'',            account_number:'CASH-01',    iban:'',                   account_type:'cash',    currency:'PKR', opening_balance:0,      current_balance:15000,  is_default:0, status:'active', notes:'Daily collection cash' }
      ], ts);

      seedAll('complaints', [
        { customer_id:1, subject:'Slow speed in evening', description:'Speed drops after 8pm',         priority:'high',   status:'open',        assigned_to:C1, resolution:'',                   resolved_at:'' },
        { customer_id:3, subject:'No internet',           description:'Connection down since morning', priority:'urgent', status:'in_progress', assigned_to:C2, resolution:'',                   resolved_at:'' },
        { customer_id:5, subject:'Billing query',         description:'Asked about partial invoice',   priority:'low',    status:'resolved',    assigned_to:AC, resolution:'Explained pro-rata', resolved_at:ts }
      ], ts);

      seedAll('calls', [
        { customer_id:7, invoice_id:7, called_by:C1, call_date:ts, outcome:'promised',  promised_date:ymd(-3), notes:'Will pay in 3 days' },
        { customer_id:8, invoice_id:8, called_by:C2, call_date:ts, outcome:'no_answer', promised_date:'',      notes:'' }
      ], ts);

      seedAll('leads', [
        { full_name:'Lead One', phone:'0302-2000001', alternate_phone:'', email:'lead1@demo.com', address:'Block A', area_id:1, package_interested_id:2, source:'call',    status:'new',       priority:'high',   owner_user_id:C1, expected_install_date:ymd(-5), quote_amount:2500, next_followup_date:ymd(-2), notes:'' },
        { full_name:'Lead Two', phone:'0302-2000002', alternate_phone:'', email:'lead2@demo.com', address:'Block B', area_id:2, package_interested_id:3, source:'walk_in', status:'contacted', priority:'medium', owner_user_id:C2, expected_install_date:ymd(-7), quote_amount:4000, next_followup_date:ymd(-1), notes:'' }
      ], ts);

      seedAll('equipment', [
        { type:'router', brand:'GenericNet', model:'R-100',  serial:'SN-RT-0001', mac:'AA:BB:CC:00:00:01', status:'assigned', assigned_to_customer_id:1,  assigned_at:ts, purchase_cost:3500, purchase_date:ymd(120), vendor_name:'Beta Hardware Trading', location:'Customer Site',  notes:'' },
        { type:'router', brand:'GenericNet', model:'R-100',  serial:'SN-RT-0002', mac:'',                  status:'in_stock', assigned_to_customer_id:'', assigned_at:'', purchase_cost:3500, purchase_date:ymd(90),  vendor_name:'Beta Hardware Trading', location:'Main Warehouse', notes:'' }
      ], ts);

      seedAll('collections', [
        { collector_user_id:C1, collection_date:ymd(0), opening_balance:0, total_collected_cash:pkgPrice[custPkg[0]], total_collected_online:0, total_expenses_paid:0, deposited_to_bank_amount:0, deposit_date:'', deposit_reference:'', status:'open', notes:'' }
      ], ts);

      seedAll('notifications', [ { user_id:'', title:'Welcome', message:'Your ' + APP_NAME + ' dashboard is ready.', type:'info', is_read:0, link:'' } ], ts);
    }

    logsSheet.appendRow([nowIso(), 'Armedias', 'System Setup', 'Company database created' + (opts.demo ? ' with demo data' : '')]);
    ss.deleteSheet(temp);
    recalcBalances_();
    return { success:true };
  } finally {
    CTX = prev;
  }
}

// adds any missing columns to a company's sheets (no data loss) and rebuilds balances
function upgradeSchema_(ss) {
  var added = [], numeric = ['opening_balance','previous_balance','current_balance','paid_amount','balance'];
  Object.keys(TBL).forEach(function(key){
    var sh = ss.getSheetByName(TBL[key].sheet); if (!sh) return;
    var want = tblHeader_(key);
    var have = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] : [];
    for (var i = 0; i < want.length; i++){
      if (have.indexOf(want[i]) !== -1) continue;
      sh.insertColumnBefore(i + 1);
      sh.getRange(1, i + 1).setValue(want[i]).setBackground('#33383d').setFontColor('white').setFontWeight('bold');
      var n = sh.getLastRow() - 1;
      if (n > 0 && numeric.indexOf(want[i]) !== -1) sh.getRange(2, i + 1, n, 1).setValue(0);
      have.splice(i, 0, want[i]);
      added.push(TBL[key].sheet + '.' + want[i]);
    }
  });
  var us = ss.getSheetByName(USERS_SHEET); if (us) ensureUserOtpCol_(us);
  recalcBalances_();
  return added;
}
