/**
 * متابعة المتروكات — مراسي (Google Apps Script)
 * البيانات في Google Sheet، والصور في فولدرات خاصة على Google Drive.
 *
 * ⚙️ SETUP_CODE: كود بيتطلب مرة واحدة بس علشان تعمل أول حساب "المكتب الرئيسي".
 *    غيّره لأي كلمة تختارها قبل ما تعمل Deploy.
 */
const SETUP_CODE = 'CHANGE-ME';

const TZ = 'Africa/Cairo';
const TOKEN_DAYS = 30;

const ENTRIES_SHEET = 'القيود';
const PATROLS_SHEET = 'المرور الدوري';
const AUDITS_SHEET = 'زيارات إعمار';
const EDITS_SHEET = 'سجل التعديلات';
const USERS_SHEET = 'المستخدمين';
const LISTS_SHEET = 'القوائم';
const SETTINGS_SHEET = 'الإعدادات';
const VISITS_SHEET = 'لقطات الكاميرات';

const E_HEADERS = ['رقم القيد', 'رقم الوحدة', 'القطاع', 'الصنف', 'الكمية', 'ملاحظات فرد الأمن', 'فرد الأمن', 'حساب فرد الأمن', 'تاريخ الحصر',
  'حالة المشرف', 'المشرف', 'تاريخ المراجعة', 'حالة المطابقة', 'تاريخ المطابقة',
  'الحالة الميدانية', 'آخر مرور', 'آخر مرور بواسطة', 'آخر تعديل', 'محذوف', 'صورة (Drive ID)'];
const EC = {}; E_HEADERS.forEach(function (h, i) { EC[h] = i; });
const P_HEADERS = ['رقم القيد', 'الوحدة', 'القطاع', 'الصنف', 'التاريخ', 'بواسطة', 'الحساب', 'الدور', 'الشركة', 'الحالة'];
const A_HEADERS = ['التاريخ', 'مشرف أمن إعمار', 'الحساب', 'القطاع', 'الوحدة', 'التقييم', 'ملاحظات'];
const L_HEADERS = ['التاريخ', 'الحساب', 'رقم القيد', 'الحقل', 'من', 'إلى'];
const U_HEADERS = ['اسم المستخدم', 'الاسم', 'الدور', 'الشركة', 'نشط', 'آخر دخول', 'تاريخ الإنشاء', 'الإيميل', 'salt', 'hash', 'ver', 'القطاعات'];
const LIST_HEADERS = ['القائمة', 'القيمة', 'نشط', 'صورة (Drive ID)', 'مصغّرة', 'الشركة'];
const V_HEADERS = ['المفتاح', 'اليوم', 'الوحدة', 'القطاع', 'الشخص', 'حساب الشخص', 'الدور', 'لقطة الكاميرا (Drive ID)', 'رفعها', 'تاريخ الرفع', 'ملاحظات'];

const ROLES = {
  sec_sup: 'مشرف الأمن', general_supervisor: 'المشرف العام', shift_officer: 'ظابط الوردية',
  emaar: 'مشرف أمن إعمار', cctv: 'مراقب CCTV', admin: 'المكتب الرئيسي'
};
// الأدوار القديمة بتتحوّل تلقائيًا للجديدة.
const OLD_ROLES = { guard: 'sec_sup', supervisor: 'sec_sup', company_manager: 'shift_officer',
  'فرد الأمن': 'sec_sup', 'المشرف': 'sec_sup', 'مدير شركة الأمن': 'shift_officer' };
// الأدوار اللي بتدخل الوحدات (ومراقب الكاميرات بيرفعلها لقطات).
const VISITORS = ['sec_sup', 'general_supervisor', 'shift_officer', 'emaar', 'admin'];
const SUP = { pending: 'قيد المراجعة', approved: 'معتمد', rejected: 'مرفوض' };
const HO = { waiting: 'بانتظار المطابقة', done: 'تمت المطابقة', none: '—' };
const FIELD = ['موجود', 'مفقود', 'تالف'];
const RATINGS = ['ملتزم', 'يحتاج متابعة', 'غير ملتزم'];

// الصلاحيات: المكتب الرئيسي بيتحكم فيها من التطبيق (دي القيم الافتراضية بس).
const PERMS = {
  add: 'تسجيل حصر جديد',
  review: 'اعتماد القيود القديمة (قيد المراجعة)',
  patrol: 'المرور الدوري',
  dash: 'لوحة المتابعة والتنبيهات',
  viewAll: 'كل القيود والبحث',
  events: 'جولات المرور',
  auditsView: 'عرض زيارات التدقيق',
  audit: 'تسجيل زيارة تدقيق',
  export: 'تحميل Excel',
  edit: 'تعديل ومسح القيود',
  cctv: 'رفع لقطات الكاميرات (CCTV)'
};
const DEFAULT_CAN = {
  add: ['sec_sup'],
  review: [],
  patrol: ['sec_sup', 'general_supervisor', 'shift_officer', 'emaar'],
  dash: ['general_supervisor', 'shift_officer', 'emaar'],
  viewAll: ['general_supervisor', 'shift_officer', 'emaar'],
  events: ['general_supervisor', 'emaar'],
  auditsView: ['general_supervisor', 'shift_officer', 'emaar'],
  audit: ['emaar'],
  export: ['emaar'],
  edit: [],
  cctv: ['cctv']
};
const PERMS_KEY = 'الصلاحيات (الأدوار الجديدة)';

const DEFAULT_SECTORS = ['1-AREZZO', 'VERONA', 'ISOLA', 'VENETO', 'VERDI', 'VECTORIA', 'BLANCA 1', 'BLANCA 2', 'BLANCA 4-3', 'VALENCIA',
  'SAFI 2-1', 'CELIA', 'CATANIA 1', 'CATANIA 2', 'MARINA R1', 'MARINA R2', 'GREEK', 'SALERNO', 'LEA', 'FAYA', 'SKAYA', 'RIVA GREEK', 'ALTIA'];
const DEFAULT_ITEMS = ['لوحة رقم الوحدة', 'باب غرفة السيول', 'انتركم', 'بوابة لاند سكيب حديد او خشب', 'ابليك', 'كشاف سقف', 'كشاف علوي', 'جهاز تكييف',
  'طابات تكيف النحاس', 'لوحة ري', 'لوحة كهرباء', 'دلفه سلك شباك وتراس', 'مروحه سقف', 'برجوله', 'طبق دش', 'ماتور مياه', 'خرطوم مياه', 'حنفيه',
  'غطاء غرف الري', 'غطاء غرف الصرف', 'فيشه كهرباء', 'مفتاح كهرباء', 'كشاف حربه لاند سكيب', 'كشاف عمودي صغير', 'كشاف عمودي كبير', 'كشاف صغير',
  'كشاف كوره', 'اطقم انتريه', 'مكنسة', 'مساحة', 'جردل بلاستك', 'جردل قمامه', 'سلسه حديد', 'قفل', 'كاميرات مراقبه', 'شريط ليد', 'لعب اطفال',
  'بيم باجز', 'براوز', 'فاظه كبيره', 'فاظه صغيره', 'كرسي خشب', 'كرسي بلاستك', 'سلم خشب', 'سلم حديد', 'كوره', 'شباشب', 'مشايات ارضيه', 'سجاده',
  'بوتاجاز', 'خلاط حوض', 'خلاط شور', 'ماتور نافوره', 'ماتور شلال', 'ماتور حمام سباحه', 'حوض بار استلستين', 'كشاف دفن في الرخام', 'جولف كار',
  'غطاء جولف كار', 'بطاريه للجولف كار', 'كاسيت الجولف كار', 'بيتش كار', 'دراجة هوائية', 'دراجه ناريه', 'اسكوتر كهرباء', 'جيت سكى', 'جلايد'];
const DEFAULT_COMPANIES = ['فورسيز', 'ليدز'];
const KIND = { sector: 'قطاع', item: 'صنف', company: 'شركة' };

// ================================================================ web app

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('متابعة المتروكات')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** شغّلها من المحرر بعد أي تحديث: بتجهز الشيت والفولدرات. */
function setup() {
  const ss = ss_();
  entriesSheet_(); patrolsSheet_(); auditsSheet_(); editsSheet_(); usersSheet_(); listsSheet_(); settingsSheet_();
  folder_('PHOTOS_FOLDER', 'متروكات - صور القيود');
  folder_('CCTV_FOLDER', CCTV_FOLDER_NAME); visitsSheet_();
  const keep = [ENTRIES_SHEET, PATROLS_SHEET, AUDITS_SHEET, EDITS_SHEET, USERS_SHEET, LISTS_SHEET, SETTINGS_SHEET];
  ss.getSheets().forEach(function (s) {
    if (keep.indexOf(s.getName()) < 0 && s.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(s);
  });
  Logger.log('الشيت جاهز: ' + ss.getUrl());
  Logger.log(needsSetup() ? 'لسه مفيش حساب للمكتب الرئيسي: افتح التطبيق واعمل أول حساب بـ SETUP_CODE.' : 'حسابات المكتب الرئيسي موجودة.');
}

function ss_() {
  let ss = null;
  try { ss = SpreadsheetApp.getActive(); } catch (e) {}
  if (ss) return ss;
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  ss = SpreadsheetApp.create('متابعة المتروكات');
  props.setProperty('SHEET_ID', ss.getId());
  return ss;
}

function folder_(key, name) {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty(key);
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  const f = DriveApp.createFolder(name);
  props.setProperty(key, f.getId());
  return f;
}

// ================================================================ sheets

const _sheets = {};
function ensureSheet_(name, headers, init) {
  if (_sheets[name]) return _sheets[name];
  const ss = ss_();
  let sh = ss.getSheetByName(name);
  const style = function (r) { r.setFontWeight('bold').setBackground('#16233F').setFontColor('#FFFFFF'); };
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, sh.getMaxRows(), headers.length).setNumberFormat('@');
    style(sh.getRange(1, 1, 1, headers.length).setValues([headers]));
    sh.setFrozenRows(1);
    sh.setRightToLeft(true);
    if (init) init(sh);
  } else {
    const w = sh.getLastColumn();
    if (w < headers.length) style(sh.getRange(1, w + 1, 1, headers.length - w).setValues([headers.slice(w)]));
  }
  _sheets[name] = sh;
  return sh;
}
function entriesSheet_() { return ensureSheet_(ENTRIES_SHEET, E_HEADERS, function (sh) { sh.hideColumns(EC['حساب فرد الأمن'] + 1, 1); sh.hideColumns(EC['صورة (Drive ID)'] + 1, 1); }); }
function patrolsSheet_() { return ensureSheet_(PATROLS_SHEET, P_HEADERS); }
function auditsSheet_() { return ensureSheet_(AUDITS_SHEET, A_HEADERS); }
function editsSheet_() { return ensureSheet_(EDITS_SHEET, L_HEADERS); }
function usersSheet_() { return ensureSheet_(USERS_SHEET, U_HEADERS, function (sh) { sh.hideColumns(9, 3); }); }
function listsSheet_() {
  return ensureSheet_(LISTS_SHEET, LIST_HEADERS, function (sh) {
    const rows = DEFAULT_SECTORS.map(function (v) { return [KIND.sector, v, 'نعم', '', '', '']; })
      .concat(DEFAULT_ITEMS.map(function (v) { return [KIND.item, v, 'نعم', '', '', '']; }))
      .concat(DEFAULT_COMPANIES.map(function (v) { return [KIND.company, v, 'نعم', '', '', '']; }));
    sh.getRange(2, 1, rows.length, LIST_HEADERS.length).setValues(rows);
    sh.hideColumns(4, 2);
  });
}
function visitsSheet_() { return ensureSheet_(VISITS_SHEET, V_HEADERS, function (sh) { sh.hideColumns(1, 1); sh.hideColumns(8, 1); }); }
function settingsSheet_() {
  return ensureSheet_(SETTINGS_SHEET, ['الإعداد', 'القيمة'], function (sh) { sh.getRange(2, 1, 1, 2).setValues([['أيام المرور الدوري', '7']]); });
}

function fmt_(x) { return x instanceof Date ? Utilities.formatDate(x, TZ, 'yyyy-MM-dd HH:mm') : x; }
function values_(sh, width, from) {
  const last = sh.getLastRow();
  const start = Math.max(2, from || 2);
  if (last < start) return [];
  return sh.getRange(start, 1, last - start + 1, width).getValues().map(function (r) { return r.map(fmt_); });
}

function overdueDays_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('overdue');
  if (hit) return Number(hit);
  let n = 7;
  values_(settingsSheet_(), 2).forEach(function (r) { if (String(r[0]).trim() === 'أيام المرور الدوري') n = Number(r[1]) || 7; });
  cache.put('overdue', String(n), 300);
  return n;
}

// ================================================================ users & auth

function users_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('users');
  if (hit) return JSON.parse(hit);
  const out = [];
  const sh = usersSheet_(), fix = [];
  values_(sh, U_HEADERS.length).forEach(function (r, i) {
    if (!r[0]) return;
    if (String(r[2]).trim() !== ROLES[roleKey_(r[2])]) fix.push([i + 2, ROLES[roleKey_(r[2])]]);
    out.push({ row: i + 2, username: String(r[0]).trim().toLowerCase(), name: String(r[1]), role: roleKey_(r[2]), company: String(r[3] || ''),
      active: String(r[4]).trim() !== 'لا', lastLogin: String(r[5] || ''), created: String(r[6] || ''), email: String(r[7] || '').trim(),
      salt: String(r[8]), hash: String(r[9]), ver: Number(r[10]) || 1,
      sectors: String(r[11] || '').split(/\s*،\s*/).map(function (x) { return x.trim(); }).filter(String) });
  });
  // الأدوار القديمة: نكتب الاسم الجديد في الشيت مرة واحدة.
  fix.forEach(function (f) { try { sh.getRange(f[0], 3).setValue(f[1]); } catch (e) {} });
  cache.put('users', JSON.stringify(out), 300);
  return out;
}
function dropCache_(k) { CacheService.getScriptCache().remove(k); }
function findUser_(username) {
  username = String(username || '').trim().toLowerCase();
  return users_().filter(function (u) { return u.username === username; })[0] || null;
}
function roleKey_(v) {
  v = String(v || '').trim();
  for (const k in ROLES) if (k === v || ROLES[k] === v) return k;
  return OLD_ROLES[v] || 'sec_sup';
}
function publicUser_(u) {
  return { username: u.username, name: u.name, role: u.role, roleLabel: ROLES[u.role], company: u.company, active: u.active,
    lastLogin: u.lastLogin, created: u.created, email: u.email, sectors: u.role === 'admin' ? [] : (u.sectors || []) };
}

function hash_(salt, pw) {
  let h = String(pw);
  for (let i = 0; i < 50; i++) h = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '|' + h, Utilities.Charset.UTF_8));
  return h;
}
function secret_() {
  const p = PropertiesService.getScriptProperties();
  let s = p.getProperty('TOKEN_SECRET');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); p.setProperty('TOKEN_SECRET', s); }
  return s;
}
function sign_(payload) { return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(payload, secret_())); }
function makeToken_(u) {
  const p = u.username + '|' + (Date.now() + TOKEN_DAYS * 864e5) + '|' + u.ver;
  return Utilities.base64EncodeWebSafe(p) + '.' + sign_(p);
}

/** بيرجع المستخدم أو بيرمي AUTH. need اختياري: صلاحية (أو أكتر) من PERMS، أو ['admin']. */
function auth_(token, need) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) throw new Error('AUTH');
  let p;
  try { p = Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString(); } catch (e) { throw new Error('AUTH'); }
  if (sign_(p) !== parts[1]) throw new Error('AUTH');
  const f = p.split('|');
  if (Number(f[1]) < Date.now()) throw new Error('AUTH');
  const u = findUser_(f[0]);
  if (!u || !u.active || String(u.ver) !== f[2]) throw new Error('AUTH');
  if (need) {
    const list = [].concat(need);
    const ok = list.some(function (k) { return k === 'admin' ? u.role === 'admin' : can_(u, k); });
    if (!ok) throw new Error('مش مسموح لحسابك بالعملية دي.');
  }
  return u;
}

// ---------------------------------------------------------------- permissions & sectors

function perms_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('perms');
  if (hit) return JSON.parse(hit);
  let saved = null;
  values_(settingsSheet_(), 2).forEach(function (r) { if (String(r[0]).trim() === PERMS_KEY) { try { saved = JSON.parse(String(r[1])); } catch (e) {} } });
  const out = {};
  Object.keys(PERMS).forEach(function (k) {
    const list = saved && Array.isArray(saved[k]) ? saved[k] : DEFAULT_CAN[k];
    out[k] = list.filter(function (r) { return ROLES[r] && r !== 'admin'; });
  });
  cache.put('perms', JSON.stringify(out), 300);
  return out;
}
/** المكتب الرئيسي معاه كل الصلاحيات دايمًا. */
function can_(u, k) { return u.role === 'admin' || (perms_()[k] || []).indexOf(u.role) >= 0; }

/** القطاعات المسموحة للمستخدم، أو null = كل القطاعات. */
function scope_(u) {
  if (u.role === 'admin') return null;
  if (u.role === 'shift_officer') {   // ظابط الوردية: قطاعات شركته بس
    const sc = lists_().sectorCompany;
    return Object.keys(sc).filter(function (k) { return u.company && sc[k] === u.company; });
  }
  return !u.sectors || !u.sectors.length ? null : u.sectors;
}
function inScope_(u, sector) { const s = scope_(u); return !s || s.indexOf(String(sector)) >= 0; }
function scopedEntries_(u) { return entries_().filter(function (e) { return inScope_(u, e.sector); }); }
function mustScope_(u, sector) { if (!inScope_(u, sector)) throw new Error('القطاع ده مش ضمن القطاعات بتاعتك.'); }

function savePerms(token, map) {
  auth_(token, ['admin']);
  const out = {};
  Object.keys(PERMS).forEach(function (k) {
    out[k] = (map && Array.isArray(map[k]) ? map[k] : []).filter(function (r) { return ROLES[r] && r !== 'admin'; });
  });
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const sh = settingsSheet_();
    let r = -1;
    values_(sh, 1).forEach(function (x, i) { if (String(x[0]).trim() === PERMS_KEY) r = i + 2; });
    if (r > 0) sh.getRange(r, 2).setValue(JSON.stringify(out)); else sh.appendRow([PERMS_KEY, JSON.stringify(out)]);
    dropCache_('perms');
  } finally { lock.releaseLock(); }
  return adminData(token);
}

function lists_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('lists');
  if (hit) return JSON.parse(hit);
  const out = { sectors: [], items: [], companies: [], all: [], sectorCompany: {} };
  values_(listsSheet_(), LIST_HEADERS.length).forEach(function (r, i) {
    const kind = String(r[0]).trim(), val = String(r[1]).trim(), on = String(r[2]).trim() !== 'لا';
    if (!val) return;
    const k = kind === KIND.sector ? 'sector' : kind === KIND.company ? 'company' : 'item';
    const comp = k === 'sector' ? String(r[5] || '').trim() : '';
    out.all.push({ kind: k, value: val, active: on, hasPhoto: !!String(r[3] || '').trim(), row: i + 2, company: comp });
    if (comp) out.sectorCompany[val] = comp;
    if (on) out[k === 'sector' ? 'sectors' : k === 'company' ? 'companies' : 'items'].push(val);
  });
  cache.put('lists', JSON.stringify(out), 300);
  return out;
}

function boot_(u) {
  const l = lists_();
  const can = {};
  Object.keys(PERMS).forEach(function (k) { can[k] = can_(u, k); });
  return { me: publicUser_(u), can: can, sectors: l.sectors.filter(function (s) { return inScope_(u, s); }), items: l.items, companies: l.companies,
    overdueDays: overdueDays_(), sup: SUP, ho: HO, ratings: RATINGS };
}

// ---------------------------------------------------------------- login

function needsSetup() { return !users_().some(function (u) { return u.role === 'admin' && u.active; }); }

function setupAdmin(code, username, name, password, email) {
  if (SETUP_CODE === 'CHANGE-ME') throw new Error('غيّر SETUP_CODE في أول ملف Code.gs واعمل Deploy بنسخة جديدة الأول.');
  if (String(code || '').trim() !== SETUP_CODE) throw new Error('كود التفعيل غلط.');
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    if (!needsSetup()) throw new Error('حساب المكتب الرئيسي معمول قبل كده. سجّل دخول.');
    writeUser_({ username: username, name: name, role: 'admin', active: true, password: password, email: email }, true);
  } finally { lock.releaseLock(); }
  return login(username, password);
}

function login(username, password) {
  username = String(username || '').trim().toLowerCase();
  const cache = CacheService.getScriptCache(), key = 'fail:' + username;
  const fails = Number(cache.get(key)) || 0;
  if (fails >= 5) throw new Error('محاولات كتير غلط. استنى ١٠ دقايق وجرّب تاني.');
  const u = findUser_(username);
  if (!u || !u.active || hash_(u.salt, password) !== u.hash) {
    cache.put(key, String(fails + 1), 600);
    throw new Error(u && !u.active ? 'الحساب ده متوقف. كلّم المكتب الرئيسي.' : 'اسم المستخدم أو كلمة السر غلط.');
  }
  cache.remove(key);
  try { usersSheet_().getRange(u.row, 6).setValue(stamp_(new Date())); dropCache_('users'); } catch (e) {}
  const out = boot_(u); out.token = makeToken_(u);
  return out;
}

function whoami(token) { return boot_(auth_(token)); }

function changeMyPassword(token, oldPw, newPw) {
  const u = auth_(token);
  if (hash_(u.salt, oldPw) !== u.hash) throw new Error('كلمة السر الحالية غلط.');
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try { writeUser_({ username: u.username, name: u.name, role: u.role, company: u.company, active: true, password: newPw, email: u.email, sectors: u.sectors }, false); }
  finally { lock.releaseLock(); }
  return makeToken_(findUser_(u.username));
}

// ---------------------------------------------------------------- admin: users, lists, settings

function adminData(token) {
  auth_(token, ['admin']);
  const l = lists_();
  return { users: users_().map(publicUser_), roles: ROLES, lists: l.all.map(function (x) { const o = Object.assign({}, x); delete o.row; return o; }),
    companies: l.companies, sectorCompany: l.sectorCompany, sectors: l.all.filter(function (x) { return x.kind === 'sector'; }).map(function (x) { return x.value; }),
    overdueDays: overdueDays_(), perms: perms_(), permLabels: PERMS };
}

function saveUser(token, d) {
  const me = auth_(token, ['admin']);
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const target = findUser_(d.username);
    if (!d.isNew && target && target.role === 'admin' && (roleKey_(d.role) !== 'admin' || d.active === false)) lastAdminGuard_(target);
    writeUser_(d, !!d.isNew);
  } finally { lock.releaseLock(); }
  return adminData(token);
}

function deleteUser(token, username) {
  const me = auth_(token, ['admin']);
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const t = findUser_(username);
    if (!t) throw new Error('المستخدم مش موجود.');
    if (t.username === me.username) throw new Error('مينفعش تمسح حسابك.');
    if (t.role === 'admin') lastAdminGuard_(t);
    usersSheet_().deleteRow(t.row);
    dropCache_('users');
  } finally { lock.releaseLock(); }
  return adminData(token);
}

function lastAdminGuard_(target) {
  const others = users_().filter(function (u) { return u.role === 'admin' && u.active && u.username !== target.username; });
  if (!others.length) throw new Error('لازم يفضل حساب واحد على الأقل للمكتب الرئيسي شغال.');
}

function writeUser_(d, isNew) {
  const username = String(d.username || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) throw new Error('اسم المستخدم لازم يكون ٣ حروف على الأقل، إنجليزي صغير أو أرقام (مثال: ahmed.g1).');
  const name = clean_(d.name) || username;
  const role = roleKey_(d.role);
  const active = d.active !== false;
  const company = role === 'shift_officer' ? clean_(d.company) : '';
  if (role === 'shift_officer' && !company) throw new Error('اختار الشركة لظابط الوردية.');
  const email = String(d.email || '').trim().toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('الإيميل مش مظبوط.');
  const existing = findUser_(username);
  if (isNew && existing) throw new Error('اسم المستخدم ده موجود قبل كده.');
  if (!isNew && !existing) throw new Error('المستخدم مش موجود.');
  const pw = String(d.password || '');
  if ((isNew || pw) && pw.length < 6) throw new Error('كلمة السر لازم تبقى ٦ حروف أو أرقام على الأقل.');
  const known = lists_().all.filter(function (x) { return x.kind === 'sector'; }).map(function (x) { return x.value; });
  let sectors = d.sectors === undefined && existing ? existing.sectors : (Array.isArray(d.sectors) ? d.sectors : []);
  sectors = role === 'admin' || role === 'shift_officer' ? [] : sectors.map(function (x) { return String(x).trim(); }).filter(function (x, i, a) { return known.indexOf(x) >= 0 && a.indexOf(x) === i; });
  let salt = existing ? existing.salt : '', hash = existing ? existing.hash : '', ver = existing ? existing.ver : 1;
  if (pw) { salt = Utilities.getUuid(); hash = hash_(salt, pw); if (existing) ver++; }
  if (existing && existing.active && !active) ver++;
  if (existing && existing.role !== role) ver++;
  const row = [username, name, ROLES[role], company, active ? 'نعم' : 'لا', existing ? existing.lastLogin : '', existing ? existing.created : stamp_(new Date()),
    d.email === undefined && existing ? existing.email : email, salt, hash, String(ver), sectors.join(' ، ')];
  const sh = usersSheet_();
  if (existing) sh.getRange(existing.row, 1, 1, row.length).setValues([row]); else sh.appendRow(row);
  dropCache_('users');
}

function saveListValue(token, kind, value, active) {
  auth_(token, ['admin']);
  value = clean_(value);
  if (!value) throw new Error('اكتب القيمة.');
  if (!KIND[kind]) throw new Error('قائمة غير صحيحة.');
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const sh = listsSheet_();
    const hit = lists_().all.filter(function (x) { return x.kind === kind && x.value === value; })[0];
    if (hit) sh.getRange(hit.row, 3).setValue(active === false ? 'لا' : 'نعم');
    else sh.appendRow([KIND[kind], value, 'نعم', '', '', '']);
    dropCache_('lists');
  } finally { lock.releaseLock(); }
  return adminData(token);
}

/** الشركة المسؤولة عن القطاع (ظابط الوردية بيشوف قطاعات شركته). */
function saveSectorCompany(token, sector, company) {
  auth_(token, ['admin']);
  const l = lists_();
  company = clean_(company);
  if (company && l.companies.indexOf(company) < 0) throw new Error('اختار شركة من القايمة.');
  const hit = l.all.filter(function (x) { return x.kind === 'sector' && x.value === sector; })[0];
  if (!hit) throw new Error('القطاع ده مش موجود.');
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try { listsSheet_().getRange(hit.row, 6).setValue(company); dropCache_('lists'); } finally { lock.releaseLock(); }
  return adminData(token);
}

function saveOverdueDays(token, days) {
  auth_(token, ['admin']);
  days = Math.round(Number(days));
  if (!(days >= 1 && days <= 90)) throw new Error('اكتب عدد أيام من ١ لـ ٩٠.');
  const sh = settingsSheet_();
  let r = -1;
  values_(sh, 1).forEach(function (x, i) { if (String(x[0]).trim() === 'أيام المرور الدوري') r = i + 2; });
  if (r > 0) sh.getRange(r, 2).setValue(String(days)); else sh.appendRow(['أيام المرور الدوري', String(days)]);
  dropCache_('overdue');
  return adminData(token);
}


// ================================================================ entries

function rowToEntry_(r, row) {
  return {
    row: row, id: String(r[EC['رقم القيد']]), unit: String(r[EC['رقم الوحدة']]), sector: String(r[EC['القطاع']]), item: String(r[EC['الصنف']]),
    qty: Number(r[EC['الكمية']]) || 0, notes: String(r[EC['ملاحظات فرد الأمن']] || ''),
    guardName: String(r[EC['فرد الأمن']]), guardUser: String(r[EC['حساب فرد الأمن']] || ''), guardDate: String(r[EC['تاريخ الحصر']] || ''),
    supStatus: String(r[EC['حالة المشرف']] || SUP.pending), supName: String(r[EC['المشرف']] || ''), supDate: String(r[EC['تاريخ المراجعة']] || ''),
    hoStatus: String(r[EC['حالة المطابقة']] || HO.waiting), hoDate: String(r[EC['تاريخ المطابقة']] || ''),
    flag: String(r[EC['الحالة الميدانية']] || ''), lastCheck: String(r[EC['آخر مرور']] || ''), lastCheckBy: String(r[EC['آخر مرور بواسطة']] || ''),
    edited: String(r[EC['آخر تعديل']] || ''), hasPhoto: !!String(r[EC['صورة (Drive ID)']] || '').trim(), photoId: String(r[EC['صورة (Drive ID)']] || '')
  };
}
function liveRow_(r) { return r[EC['رقم القيد']] && !String(r[EC['محذوف']] || '').trim(); }

/** كل القيود (غير الممسوحة)، الأحدث الأول. */
function entries_() {
  const out = [];
  const rows = values_(entriesSheet_(), E_HEADERS.length);
  for (let i = rows.length - 1; i >= 0; i--) if (liveRow_(rows[i])) out.push(rowToEntry_(rows[i], i + 2));
  return out;
}
function rowOfId_(sh, id) {
  id = String(id || '').trim();
  if (!id || sh.getLastRow() < 2) return 0;
  const hit = sh.getRange(2, 1, sh.getLastRow() - 1, 1).createTextFinder(id).matchEntireCell(true).findNext();
  return hit ? hit.getRow() : 0;
}
function entry_(id) {
  const sh = entriesSheet_(), row = rowOfId_(sh, id);
  if (!row) return null;
  const r = sh.getRange(row, 1, 1, E_HEADERS.length).getValues()[0].map(fmt_);
  return liveRow_(r) ? rowToEntry_(r, row) : null;
}
function clientEntry_(e) {
  const o = Object.assign({}, e); delete o.row; delete o.photoId;
  o.verified = e.hoStatus === HO.done;
  o.daysSince = daysSince_(e.lastCheck || e.hoDate);
  o.overdue = o.verified && o.daysSince !== null && o.daysSince > overdueDays_();
  return o;
}
function daysSince_(stamp) {
  const m = String(stamp || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const t = dayKey_(new Date()).split('-').map(Number);
  return Math.round((Date.UTC(t[0], t[1] - 1, t[2]) - Date.UTC(+m[1], +m[2] - 1, +m[3])) / 864e5);
}

function nextId_() {
  const props = PropertiesService.getScriptProperties();
  let n = Number(props.getProperty('ENTRY_SEQ'));
  if (!n) {
    n = 0;
    values_(entriesSheet_(), 1).forEach(function (r) { const k = Number(String(r[0]).replace(/\D/g, '')); if (k > n) n = k; });
  }
  let id;
  do { n++; id = 'MT-' + ('000000' + n).slice(-6); } while (rowOfId_(entriesSheet_(), id));
  props.setProperty('ENTRY_SEQ', String(n));
  return id;
}

function addEntry(token, d, photo) {
  const u = auth_(token, 'add');
  const l = lists_();
  const unit = clean_(d.unit).toUpperCase(), sector = clean_(d.sector), item = clean_(d.item), qty = Math.round(Number(d.qty));
  if (!unit) throw new Error('اكتب رقم الوحدة.');
  if (l.sectors.indexOf(sector) < 0) throw new Error('اختار القطاع.');
  mustScope_(u, sector);
  if (l.items.indexOf(item) < 0) throw new Error('اختار الصنف.');
  if (!(qty >= 1 && qty <= 9999)) throw new Error('اكتب الكمية (رقم من ١ أو أكتر).');
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const id = nextId_();
    const photoId = photo ? savePhoto_(photo, 'PHOTOS_FOLDER', 'متروكات - صور القيود', id) : '';
    const now = stamp_(new Date());
    const row = new Array(E_HEADERS.length).fill('');
    row[EC['رقم القيد']] = id; row[EC['رقم الوحدة']] = unit; row[EC['القطاع']] = sector; row[EC['الصنف']] = item; row[EC['الكمية']] = String(qty);
    row[EC['ملاحظات فرد الأمن']] = clean_(d.notes, 1000); row[EC['فرد الأمن']] = u.name; row[EC['حساب فرد الأمن']] = u.username;
    // مشرف الأمن هو اللي بيسجّل، فالقيد بيتعتمد ويدخل المرور الدوري على طول.
    row[EC['تاريخ الحصر']] = "'" + now; row[EC['حالة المشرف']] = SUP.approved; row[EC['المشرف']] = u.name; row[EC['تاريخ المراجعة']] = "'" + now;
    row[EC['حالة المطابقة']] = HO.done; row[EC['تاريخ المطابقة']] = "'" + now;
    row[EC['صورة (Drive ID)']] = photoId;
    entriesSheet_().appendRow(row);
    return { id: id };
  } finally { lock.releaseLock(); }
}

/** آخر قيود مشرف الأمن ده. */
function myEntries(token) {
  const u = auth_(token);
  return entries_().filter(function (e) { return e.guardUser === u.username; }).slice(0, 40).map(clientEntry_);
}

function reviewList(token) {
  const u = auth_(token, 'review');
  const all = scopedEntries_(u);
  return {
    pending: all.filter(function (e) { return e.supStatus === SUP.pending; }).slice(0, 300).map(clientEntry_),
    done: all.filter(function (e) { return e.supStatus !== SUP.pending && e.supDate; })
      .sort(function (a, b) { return a.supDate < b.supDate ? 1 : -1; }).slice(0, 20).map(clientEntry_)
  };
}

/** اعتماد المشرف = المطابقة النهائية (زي النموذج التجريبي). */
function review(token, id, approve) {
  const u = auth_(token, 'review');
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const e = entry_(id);
    if (!e) throw new Error('القيد ده مش موجود.');
    mustScope_(u, e.sector);
    if (e.supStatus !== SUP.pending) throw new Error('القيد ده اتراجع قبل كده (' + e.supStatus + ').');
    const sh = entriesSheet_(), now = stamp_(new Date());
    const set = function (h, v) { sh.getRange(e.row, EC[h] + 1).setValue(v); };
    set('حالة المشرف', approve ? SUP.approved : SUP.rejected); set('المشرف', u.name); set('تاريخ المراجعة', "'" + now);
    set('حالة المطابقة', approve ? HO.done : HO.none); set('تاريخ المطابقة', approve ? "'" + now : '');
  } finally { lock.releaseLock(); }
  return reviewList(token);
}

/** العناصر المعتمدة للمرور عليها، الأقدم مرور الأول. */
function patrolList(token, sector, unit, mineOnly) {
  const u = auth_(token, 'patrol');
  if (!sector) throw new Error('اختار القطاع الأول.');
  mustScope_(u, sector);
  unit = String(unit || '').trim().toLowerCase();
  const list = entries_().filter(function (e) {
    return e.hoStatus === HO.done && e.sector === sector && (!unit || e.unit.toLowerCase().indexOf(unit) >= 0) && (!mineOnly || e.guardUser === u.username);
  }).map(clientEntry_);
  list.sort(function (a, b) { return (b.daysSince === null ? 1e9 : b.daysSince) - (a.daysSince === null ? 1e9 : a.daysSince); });
  return list.slice(0, 300);
}

function patrol(token, id, status) {
  const u = auth_(token, 'patrol');
  if (FIELD.indexOf(status) < 0) throw new Error('حالة غير صحيحة.');
  let e;
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    e = entry_(id);
    if (!e) throw new Error('القيد ده مش موجود.');
    mustScope_(u, e.sector);
    if (e.hoStatus !== HO.done) throw new Error('القيد ده لسه ما اتعتمدش.');
    const now = stamp_(new Date());
    patrolsSheet_().appendRow([e.id, e.unit, e.sector, e.item, "'" + now, u.name, u.username, ROLES[u.role], u.company || '', status]);
    const sh = entriesSheet_();
    sh.getRange(e.row, EC['الحالة الميدانية'] + 1).setValue(status === 'موجود' ? '' : status);
    sh.getRange(e.row, EC['آخر مرور'] + 1).setValue("'" + now);
    sh.getRange(e.row, EC['آخر مرور بواسطة'] + 1).setValue(u.name + ' (' + ROLES[u.role] + ')');
  } finally { lock.releaseLock(); }
  if (status !== 'موجود') alertMissing_(e, status, u);
  return { ok: true };
}

/** إيميل فوري للمكتب الرئيسي والمشرفين (اللي عليهم إيميل) لما حاجة تتسجل مفقودة أو تالفة. */
function alertMissing_(e, status, u) {
  try {
    let to = users_().filter(function (x) { return x.active && x.email && (x.role === 'admin' || x.role === 'general_supervisor') && inScope_(x, e.sector); }).map(function (x) { return x.email; });
    if (!to.length) { try { to = [Session.getEffectiveUser().getEmail()]; } catch (err) {} }
    if (!to.length || !to[0]) return;
    const body = '<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif">' +
      '<h3 style="color:#A93D28">⚠ بلاغ: ' + esc_(e.item) + ' — ' + esc_(status) + '</h3>' +
      '<p>الوحدة <b>' + esc_(e.unit) + '</b> (' + esc_(e.sector) + ') · الكمية ' + e.qty + ' · قيد ' + esc_(e.id) + '</p>' +
      '<p>سجّله: ' + esc_(u.name) + ' (' + esc_(ROLES[u.role]) + (u.company ? ' — ' + esc_(u.company) : '') + ') · ' + stamp_(new Date()) + '</p>' +
      '<p>افتح تطبيق متابعة المتروكات للمتابعة.</p></div>';
    MailApp.sendEmail({ to: to.join(','), subject: '⚠ متروكات: ' + e.item + ' ' + status + ' — وحدة ' + e.unit, htmlBody: body,
      body: e.item + ' — ' + status + ' — وحدة ' + e.unit + ' (' + e.sector + ')' });
  } catch (err) {}
}

function myPatrols(token) {
  const u = auth_(token, 'patrol');
  const sh = patrolsSheet_(), last = sh.getLastRow();
  const rows = values_(sh, P_HEADERS.length, Math.max(2, last - 1999));
  return rows.reverse().filter(function (r) { return r[6] === u.username; }).slice(0, 30).map(function (r) { return patrolObj_(r); });
}
function patrolObj_(r, row) {
  return { id: String(r[0]), unit: String(r[1]), sector: String(r[2]), item: String(r[3]), date: String(r[4]), by: String(r[5]), role: String(r[7]), company: String(r[8] || ''), status: String(r[9]),
    user: String(r[6] || ''), row: row || 0 };
}

function patrolEvents(token, limit) {
  const u = auth_(token, 'events');
  const sh = patrolsSheet_(), last = sh.getLastRow();
  limit = Math.min(Number(limit) || 40, 500);
  const span = scope_(u) ? limit * 10 : limit, from = Math.max(2, last - span + 1);
  const cams = camMap_();
  return values_(sh, P_HEADERS.length, from).map(function (r, i) { return patrolObj_(r, from + i); }).reverse()
    .filter(function (p) { return inScope_(u, p.sector); }).slice(0, limit).map(function (p) { return withCam_(p, p.date, p.unit, p.user, cams); });
}

/** لوحة المتابعة: الأرقام، الالتزام، التوزيع، والتنبيهات. */
function dashboard(token) {
  const u = auth_(token, 'dash');
  const all = scopedEntries_(u).map(clientEntry_);
  const verified = all.filter(function (e) { return e.verified; });
  const overdue = verified.filter(function (e) { return e.overdue; });
  const flagged = all.filter(function (e) { return e.flag; });
  const bySector = {};
  all.forEach(function (e) { bySector[e.sector] = (bySector[e.sector] || 0) + 1; });
  return {
    total: all.length,
    pending: all.filter(function (e) { return e.supStatus === SUP.pending; }).length,
    approved: all.filter(function (e) { return e.supStatus === SUP.approved; }).length,
    rejected: all.filter(function (e) { return e.supStatus === SUP.rejected; }).length,
    verified: verified.length, flagged: flagged.length, overdueCount: overdue.length,
    coverage: verified.length ? Math.round((verified.length - overdue.length) / verified.length * 100) : null,
    overdueDays: overdueDays_(),
    bySector: Object.keys(bySector).map(function (k) { return { k: k, n: bySector[k] }; }).sort(function (a, b) { return b.n - a.n; }),
    flaggedList: flagged.slice(0, 60),
    overdueList: overdue.sort(function (a, b) { return b.daysSince - a.daysSince; }).slice(0, 60)
  };
}

function matches_(e, f) {
  f = f || {};
  if (f.sector && e.sector !== f.sector) return false;
  if (f.status) {
    if (f.status === 'flagged') { if (!e.flag) return false; }
    else if (e.supStatus !== f.status && e.hoStatus !== f.status && e.flag !== f.status) return false;
  }
  if (f.q) {
    const q = String(f.q).toLowerCase();
    if ([e.id, e.unit, e.sector, e.item, e.guardName].join(' ').toLowerCase().indexOf(q) < 0) return false;
  }
  return true;
}
function searchEntries(token, f, offset) {
  const u = auth_(token, 'viewAll');
  const rows = scopedEntries_(u).filter(function (e) { return matches_(e, f); });
  offset = Number(offset) || 0;
  return { total: rows.length, items: rows.slice(offset, offset + 50).map(clientEntry_) };
}

function getEntry(token, id) {
  const u = auth_(token);
  const e = entry_(id);
  if (!e) throw new Error('القيد ده مش موجود.');
  mustSee_(u, e);
  const psh = patrolsSheet_();
  let checks = psh.getLastRow() < 2 ? [] : psh.getRange(2, 1, psh.getLastRow() - 1, 1).createTextFinder(e.id).matchEntireCell(true).findAll()
    .map(function (c) { return patrolObj_(psh.getRange(c.getRow(), 1, 1, P_HEADERS.length).getValues()[0].map(fmt_), c.getRow()); }).reverse();
  let edits = [];
  if (u.role === 'admin') {
    const esh = editsSheet_();
    edits = esh.getLastRow() < 2 ? [] : esh.getRange(2, 3, esh.getLastRow() - 1, 1).createTextFinder(e.id).matchEntireCell(true).findAll()
      .map(function (c) { const r = esh.getRange(c.getRow(), 1, 1, L_HEADERS.length).getValues()[0].map(fmt_); return { at: r[0], by: r[1], field: r[3], from: r[4], to: r[5] }; }).reverse();
  }
  const cams = camMap_();
  checks = checks.map(function (c) { return withCam_(c, c.date, c.unit, c.user, cams); });
  return { entry: withCam_(clientEntry_(e), e.guardDate, e.unit, e.guardUser, cams), checks: checks, edits: edits };
}

/** مين يقدر يفتح القيد: لازم يكون في قطاعاته، واللي معندوش صلاحية عرض بيشوف قيوده أو المعتمد بس. */
function mustSee_(u, e) {
  const deny = function () { throw new Error('مش مسموح لحسابك تشوف القيد ده.'); };
  if (!inScope_(u, e.sector) && e.guardUser !== u.username) deny();
  if (['viewAll', 'dash', 'review', 'edit', 'events', 'cctv'].some(function (k) { return can_(u, k); })) return;
  if (e.guardUser !== u.username && e.hoStatus !== HO.done) deny();
}
function entryPhoto(token, id) {
  const u = auth_(token);
  const e = entry_(id);
  if (!e || !e.photoId) return '';
  mustSee_(u, e);
  return 'data:image/jpeg;base64,' + Utilities.base64Encode(DriveApp.getFileById(e.photoId).getBlob().getBytes());
}

/** تعديل كامل من المكتب الرئيسي، وكل تغيير بيتسجل في سجل التعديلات. */
function updateEntry(token, id, d) {
  const u = auth_(token, 'edit');
  const l = lists_();
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const e = entry_(id);
    if (!e) throw new Error('القيد ده مش موجود.');
    mustScope_(u, e.sector);
    const next = {
      'رقم الوحدة': clean_(d.unit).toUpperCase(), 'القطاع': clean_(d.sector), 'الصنف': clean_(d.item), 'الكمية': String(Math.round(Number(d.qty))),
      'ملاحظات فرد الأمن': clean_(d.notes, 1000), 'حالة المشرف': d.supStatus, 'حالة المطابقة': d.hoStatus, 'الحالة الميدانية': d.flag || ''
    };
    if (!next['رقم الوحدة']) throw new Error('اكتب رقم الوحدة.');
    if (!(Number(next['الكمية']) >= 1)) throw new Error('اكتب الكمية.');
    if (next['القطاع'] !== e.sector && l.sectors.indexOf(next['القطاع']) < 0) throw new Error('اختار القطاع.');
    mustScope_(u, next['القطاع']);
    if (next['الصنف'] !== e.item && l.items.indexOf(next['الصنف']) < 0) throw new Error('اختار الصنف.');
    if ([SUP.pending, SUP.approved, SUP.rejected].indexOf(next['حالة المشرف']) < 0) throw new Error('حالة المشرف غير صحيحة.');
    if ([HO.waiting, HO.done, HO.none].indexOf(next['حالة المطابقة']) < 0) throw new Error('حالة المطابقة غير صحيحة.');
    if (['', 'مفقود', 'تالف'].indexOf(next['الحالة الميدانية']) < 0) throw new Error('الحالة الميدانية غير صحيحة.');
    const cur = { 'رقم الوحدة': e.unit, 'القطاع': e.sector, 'الصنف': e.item, 'الكمية': String(e.qty), 'ملاحظات فرد الأمن': e.notes,
      'حالة المشرف': e.supStatus, 'حالة المطابقة': e.hoStatus, 'الحالة الميدانية': e.flag };
    const sh = entriesSheet_(), now = stamp_(new Date()), log = editsSheet_();
    let changed = 0;
    Object.keys(next).forEach(function (h) {
      if (String(next[h]) === String(cur[h])) return;
      sh.getRange(e.row, EC[h] + 1).setValue(next[h]);
      log.appendRow(["'" + now, u.username, e.id, h, String(cur[h]), String(next[h])]);
      changed++;
    });
    if (next['حالة المطابقة'] === HO.done && e.hoStatus !== HO.done) sh.getRange(e.row, EC['تاريخ المطابقة'] + 1).setValue("'" + now);
    if (changed) sh.getRange(e.row, EC['آخر تعديل'] + 1).setValue(u.username + ' ' + now);
  } finally { lock.releaseLock(); }
  return getEntry(token, id);
}

function deleteEntry(token, id) {
  const u = auth_(token, 'edit');
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const e = entry_(id);
    if (!e) throw new Error('القيد ده مش موجود.');
    mustScope_(u, e.sector);
    const now = stamp_(new Date());
    entriesSheet_().getRange(e.row, EC['محذوف'] + 1).setValue(u.username + ' ' + now);
    editsSheet_().appendRow(["'" + now, u.username, e.id, 'مسح القيد', '', 'محذوف']);
  } finally { lock.releaseLock(); }
  return { ok: true };
}

// ================================================================ Emaar audits

function addAudit(token, d) {
  const u = auth_(token, 'audit');
  const sector = clean_(d.sector), rating = RATINGS.indexOf(d.rating) >= 0 ? d.rating : '';
  if (lists_().sectors.indexOf(sector) < 0) throw new Error('اختار القطاع.');
  mustScope_(u, sector);
  if (!rating) throw new Error('اختار التقييم.');
  auditsSheet_().appendRow(["'" + stamp_(new Date()), u.name, u.username, sector, clean_(d.unit).toUpperCase(), rating, clean_(d.notes, 1000)]);
  return listAudits(token);
}
function listAudits(token) {
  const u = auth_(token, ['auditsView', 'audit']);
  const sh = auditsSheet_(), last = sh.getLastRow();
  return values_(sh, A_HEADERS.length, Math.max(2, last - (scope_(u) ? 1999 : 199))).reverse()
    .filter(function (r) { return inScope_(u, r[3]); }).slice(0, 200)
    .map(function (r) { return { date: String(r[0]), by: String(r[1]), sector: String(r[3]), unit: String(r[4]), rating: String(r[5]), notes: String(r[6]) }; });
}

// ================================================================ CCTV

const CCTV_FOLDER_NAME = 'متروكات - لقطات الكاميرات';

/*
 * زيارة الوحدة = كل اللي عمله شخص واحد في وحدة واحدة في نفس اليوم (تسجيل بنود أو مرور عليها).
 * مراقب الكاميرات بيرفع لقطة واحدة للزيارة كلها، مش لكل بند.
 */
function visitKey_(date, unit, user) { return String(date || '').slice(0, 10) + '|' + String(unit || '').trim().toUpperCase() + '|' + String(user || '').trim().toLowerCase(); }

function camMap_() {
  const out = {};
  values_(visitsSheet_(), V_HEADERS.length).forEach(function (r, i) {
    const id = String(r[7] || '').trim();
    if (r[0] && id) out[String(r[0])] = { row: i + 2, id: id, by: String(r[8] || ''), at: String(r[9] || ''), note: String(r[10] || '') };
  });
  return out;
}
function withCam_(o, date, unit, user, cams) {
  const k = visitKey_(date, unit, user), c = cams[k];
  o.camKey = k; o.hasCam = !!c; o.camBy = c ? c.by : ''; o.camAt = c ? c.at : ''; o.camNote = c ? c.note : '';
  return o;
}

/** كل زيارات الوحدات من يوم since لحد النهارده. */
function visits_(since) {
  const roleOf = {};
  users_().forEach(function (x) { roleOf[x.username] = x; });
  const map = {}, order = [];
  const touch = function (date, unit, sector, user, name, role, company) {
    const k = visitKey_(date, unit, user);
    let v = map[k];
    if (!v) {
      v = map[k] = { key: k, day: String(date).slice(0, 10), unit: String(unit).toUpperCase(), sector: sector, user: user, by: name, role: role, company: company,
        first: date, last: date, added: [], checked: 0, missing: 0, damaged: 0 };
      order.push(v);
    }
    if (date < v.first) v.first = date;
    if (date > v.last) v.last = date;
    return v;
  };
  entries_().forEach(function (e) {
    if (String(e.guardDate).slice(0, 10) < since) return;
    const x = roleOf[e.guardUser];
    const v = touch(e.guardDate, e.unit, e.sector, e.guardUser, e.guardName, x ? ROLES[x.role] : ROLES.sec_sup, x ? x.company : '');
    v.added.push(e.item + (e.qty > 1 ? ' × ' + e.qty : ''));
  });
  const sh = patrolsSheet_(), last = sh.getLastRow();
  values_(sh, P_HEADERS.length, Math.max(2, last - 9999)).forEach(function (r) {
    if (String(r[4]).slice(0, 10) < since) return;
    const v = touch(String(r[4]), r[1], String(r[2]), String(r[6]), String(r[5]), String(r[7]), String(r[8] || ''));
    v.checked++;
    if (r[9] === 'مفقود') v.missing++;
    if (r[9] === 'تالف') v.damaged++;
  });
  return order;
}

function cctvFeed(token, f) {
  const u = auth_(token, 'cctv');
  f = f || {};
  const days = Math.min(Math.max(Number(f.days) || 3, 1), 31);
  const since = dayKey_(new Date(Date.now() - (days - 1) * 864e5));
  const unit = String(f.unit || '').trim().toUpperCase(), sector = String(f.sector || ''), missing = !!f.missing;
  const cams = camMap_();
  const out = visits_(since).filter(function (v) {
    return inScope_(u, v.sector) && (!sector || v.sector === sector) && (!unit || v.unit.indexOf(unit) >= 0);
  }).map(function (v) { return withCam_(v, v.day, v.unit, v.user, cams); });
  out.sort(function (a, b) { return a.last < b.last ? 1 : a.last > b.last ? -1 : 0; });
  const done = out.filter(function (x) { return x.hasCam; }).length;
  const list = missing ? out.filter(function (x) { return !x.hasCam; }) : out;
  return { total: out.length, done: done, shown: list.length, items: list.slice(0, 200) };
}

function saveCctv(token, key, photo, note) {
  const u = auth_(token, 'cctv');
  if (!photo) throw new Error('اختار صورة اللقطة.');
  const v = visits_(String(key || '').slice(0, 10)).filter(function (x) { return x.key === key; })[0];
  if (!v) throw new Error('الزيارة دي مش موجودة. حدّث الصفحة.');
  mustScope_(u, v.sector);
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const old = camMap_()[key];
    const id = savePhoto_(photo, 'CCTV_FOLDER', CCTV_FOLDER_NAME, v.day + '_' + v.unit + '_' + v.user);
    if (!id) throw new Error('الصورة مش مقروءة. جرّب صورة تانية.');
    const row = [key, v.day, v.unit, v.sector, v.by, v.user, v.role, id, u.name + ' (' + ROLES[u.role] + ')', "'" + stamp_(new Date()), clean_(note, 300)];
    const sh = visitsSheet_();
    if (old) sh.getRange(old.row, 1, 1, row.length).setValues([row]); else sh.appendRow(row);
    if (old) { try { DriveApp.getFileById(old.id).setTrashed(true); } catch (err) {} }
  } finally { lock.releaseLock(); }
  return { ok: true };
}

function cctvPhoto(token, key) {
  const u = auth_(token, ['cctv', 'viewAll', 'events', 'dash', 'edit']);
  const sh = visitsSheet_(), c = camMap_()[key];
  if (!c) return '';
  mustScope_(u, String(sh.getRange(c.row, 4).getValue()));
  return 'data:image/jpeg;base64,' + Utilities.base64Encode(DriveApp.getFileById(c.id).getBlob().getBytes());
}

// ================================================================ exports (CSV)

function exportEntries(token, f) {
  const u = auth_(token, 'export');
  const head = ['رقم القيد', 'رقم الوحدة', 'القطاع', 'الصنف', 'الكمية', 'فرد الأمن', 'تاريخ الحصر', 'حالة المشرف', 'اسم المشرف', 'تاريخ المراجعة',
    'حالة المطابقة', 'تاريخ المطابقة', 'الحالة الميدانية', 'آخر مرور', 'آخر مرور بواسطة', 'له صورة', 'ملاحظات مشرف الأمن', 'لقطة كاميرا لزيارة التسجيل'];
  const cams = camMap_();
  return [head].concat(scopedEntries_(u).filter(function (e) { return matches_(e, f); }).map(function (e) {
    return [e.id, e.unit, e.sector, e.item, e.qty, e.guardName, e.guardDate, e.supStatus, e.supName, e.supDate, e.hoStatus, e.hoDate,
      e.flag || 'سليم', e.lastCheck, e.lastCheckBy, e.hasPhoto ? 'نعم' : 'لا', e.notes, cams[visitKey_(e.guardDate, e.unit, e.guardUser)] ? 'نعم' : 'لا'];
  }));
}
function exportPatrols(token) {
  const u = auth_(token, 'export');
  const cams = camMap_();
  return [['رقم القيد', 'التاريخ', 'بواسطة', 'الدور', 'الشركة', 'الوحدة', 'القطاع', 'الصنف', 'الحالة', 'لقطة كاميرا للزيارة', 'رفعها', 'ملاحظات الكاميرا']].concat(
    values_(patrolsSheet_(), P_HEADERS.length).reverse().filter(function (r) { return inScope_(u, r[2]); }).map(function (r) {
      const c = cams[visitKey_(r[4], r[1], r[6])];
      return [r[0], r[4], r[5], r[7], r[8], r[1], r[2], r[3], r[9], c ? 'نعم' : 'لا', c ? c.by : '', c ? c.note : '']; }));
}
function exportAudits(token) {
  const u = auth_(token, 'export');
  return [['التاريخ', 'مشرف أمن إعمار', 'القطاع', 'الوحدة', 'التقييم', 'ملاحظات']].concat(
    values_(auditsSheet_(), A_HEADERS.length).reverse().filter(function (r) { return inScope_(u, r[3]); }).map(function (r) { return [r[0], r[1], r[3], r[4], r[5], r[6]]; }));
}

// ================================================================ helpers

function savePhoto_(dataUrl, folderKey, folderName, name) {
  const m = String(dataUrl || '').match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!m) return '';
  const bytes = Utilities.base64Decode(m[2]);
  if (bytes.length > 6 * 1024 * 1024) throw new Error('الصورة كبيرة قوي.');
  return folder_(folderKey, folderName).createFile(Utilities.newBlob(bytes, m[1], name + '.jpg')).getId();
}
function esc_(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function clean_(s, max) { return String(s == null ? '' : s).replace(/^[=+\-@]+/, '').trim().slice(0, max || 300); }
function pad_(n) { return (n < 10 ? '0' : '') + n; }
function dayKey_(d) { return Utilities.formatDate(d, TZ, 'yyyy-MM-dd'); }
function stamp_(d) { return Utilities.formatDate(d, TZ, 'yyyy-MM-dd HH:mm'); }
