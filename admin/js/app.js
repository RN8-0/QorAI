// ═══════════════════════════════════════
//  QOR AI ADMIN WEB
// ═══════════════════════════════════════

// PocketBase client initialized in pb_client.js
let _currentAdminEmail = '';
const ADMIN_EMAIL_STORAGE_KEY = 'admin_email';

// ── ADMIN AUTH ──

async function checkAdmin(_email) {
  try {
    const pb = getPb();
    return pb.authStore.isValid;
  } catch (_) {}
  return false;
}

function showAdminApp(email) {
  _currentAdminEmail = _normalizeEmail(email);
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appContainer').style.display = '';
  document.getElementById('sidebarUser').textContent = _currentAdminEmail;
  const unauthEl = document.getElementById('unauthScreen');
  if (unauthEl) unauthEl.style.display = 'none';
  initSupportInbox().catch((error) => {
    console.warn('support inbox init failed:', error);
  });
  refreshDashboard();
}

function showLoginScreen() {
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('appContainer').style.display = 'none';
  if (typeof setLoginButtonState === 'function') setLoginButtonState(false);
}

function showUnauthorized(email) {
  sessionStorage.removeItem(ADMIN_EMAIL_STORAGE_KEY);
  try { getPb().authStore.clear(); } catch (_) {}
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appContainer').style.display = 'none';
  let el = document.getElementById('unauthScreen');
  if (!el) {
    el = document.createElement('div');
    el.id = 'unauthScreen';
    el.className = 'unauth-screen';
    el.innerHTML = `<div class="unauth-card">
      <div style="font-size:48px;margin-bottom:16px">🚫</div>
      <h2>Access Denied</h2>
      <p>Bu hesap admin paneline erisemiyor: <strong>${escHtml(email)}</strong>.</p>
      <button class="btn btn-primary" onclick="logoutAdmin()" style="margin-right:8px">Sign Out</button>
    </div>`;
    document.body.appendChild(el);
  }
  el.style.display = 'flex';
}

function logoutAdmin() {
  _currentAdminEmail = '';
  sessionStorage.removeItem(ADMIN_EMAIL_STORAGE_KEY);
  getPb().authStore.clear();
  disposeSupportInbox().catch(() => {});
  showLoginScreen();
  const unauthEl = document.getElementById('unauthScreen');
  if (unauthEl) unauthEl.style.display = 'none';
}

function logout() { logoutAdmin(); }

// Session restore: if previously logged in, restore session
document.addEventListener('DOMContentLoaded', () => {
  const savedEmail = _normalizeEmail(sessionStorage.getItem(ADMIN_EMAIL_STORAGE_KEY));
  document.getElementById('loginLoading').style.display = 'flex';
  checkAdmin(savedEmail).then(isAdm => {
    document.getElementById('loginLoading').style.display = 'none';
    if (isAdm) {
      showAdminApp(savedEmail);
      return;
    }
    sessionStorage.removeItem(ADMIN_EMAIL_STORAGE_KEY);
    getPb().authStore.clear();
    showLoginScreen();
  }).catch(() => {
    document.getElementById('loginLoading').style.display = 'none';
    sessionStorage.removeItem(ADMIN_EMAIL_STORAGE_KEY);
    getPb().authStore.clear();
    showLoginScreen();
  });
});

// Admin auth callback (GitHub OAuth)
window._adminLoginCallback = async (userInfo, err) => {
  document.getElementById('loginLoading').style.display = 'none';
  if (typeof setLoginButtonState === 'function') setLoginButtonState(false);
  if (err || !userInfo) {
    document.getElementById('loginError').textContent = err || 'Login failed';
    return;
  }
  try {
    const isAdm = await checkAdmin(userInfo.email);
    if (!isAdm) { showUnauthorized(userInfo.email); return; }
    sessionStorage.setItem(ADMIN_EMAIL_STORAGE_KEY, _normalizeEmail(userInfo.email));
    showAdminApp(userInfo.email);
  } catch (e) {
    document.getElementById('loginError').textContent = 'Error: ' + e.message;
    console.error('Admin auth callback error:', e);
  }
};

// ── THEME ──
(function(){const t=localStorage.getItem('theme');if(t==='light'){document.documentElement.setAttribute('data-theme','light');const i=document.getElementById('themeIcon');const l=document.getElementById('themeLabel');if(i)i.textContent='☀️';if(l)l.textContent='Light'}})();
function toggleTheme(){const c=document.documentElement.getAttribute('data-theme');const n=c==='light'?'':'light';if(n)document.documentElement.setAttribute('data-theme','light');else document.documentElement.removeAttribute('data-theme');document.getElementById('themeIcon').textContent=n?'☀️':'🌙';document.getElementById('themeLabel').textContent=n?'Light':'Dark';localStorage.setItem('theme',n||'dark')}

function escHtml(value){
  return String(value ?? '')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

function escJs(value){
  return String(value ?? '')
    .replace(/\\/g,'\\\\')
    .replace(/'/g,"\\'")
    .replace(/\r?\n/g,' ');
}

function safeUrl(value){
  const raw = String(value ?? '').trim();
  if(!raw) return '';
  try{
    const parsed = new URL(raw, window.location.origin);
    if(parsed.protocol === 'http:' || parsed.protocol === 'https:') return escHtml(parsed.href);
  }catch(_){}
  return '';
}

function safeInitial(value,fallback='?'){
  const raw = String(value ?? '').trim();
  return escHtml((raw ? raw.charAt(0) : fallback).toUpperCase());
}

function userAvatarHtml(user){
  const photo = safeUrl(user.photoURL);
  if(photo) return `<img src="${photo}" alt="">`;
  return safeInitial(user.displayName || user.email);
}

// ── NAV ──
function showView(name){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(n=>n.classList.remove('active'));
  document.getElementById(name+'View')?.classList.add('active');
  document.querySelector(`[data-view="${name}"]`)?.classList.add('active');
  if(name==='dashboard')refreshDashboard();
  if(name==='products'&&!allProducts.length)loadProducts();
  if(name==='users')loadUsers();
  if(name==='userinsights'){loadUsers();loadStoredSegmentAnalysis();}
  if(name==='algorithm')loadAlgorithmConfig();
  if(name==='prompts')loadAiPromptManager();
  if(name==='scraper'){checkProxy();ensureProxyPolling();populateScraperCategories()}
  if(name==='activitylog')loadActivityLog();
  if(name==='notifications')loadNotificationsView();
  if(name==='support')initSupportInbox({ forceReload: true });
  if(name==='settings')loadRemoteConfig();
}

// ── TOAST ──
function toast(msg,type='i',dur=4000){
  const c=document.getElementById('toastContainer');if(!c)return;
  const t=document.createElement('div');t.className='toast '+type;
  const icons={s:'✅',e:'❌',w:'⚠️',i:'ℹ️'};
  const iconEl=document.createElement('span');iconEl.textContent=icons[type]||'ℹ️';
  const textEl=document.createElement('span');textEl.style.flex='1';textEl.textContent=String(msg ?? '');
  const closeBtn=document.createElement('button');closeBtn.className='toast-x';closeBtn.textContent='✕';
  closeBtn.addEventListener('click',()=>{t.classList.add('removing');setTimeout(()=>t.remove(),250);});
  t.append(iconEl,textEl,closeBtn);
  c.appendChild(t);setTimeout(()=>{if(t.parentElement){t.classList.add('removing');setTimeout(()=>t.remove(),250)}},dur);
}

// ═══════════════════════════════════════
//  DASHBOARD
// ═══════════════════════════════════════

let catChart=null,trendChart=null;
let userPlanChart=null,userPersonaChart=null,userInterestChart=null;
let userBehaviorChart=null,userInterestBreakdownChart=null,userQuizTypeChart=null,userAnalysisCategoryChart=null;
let activityActionChart=null,allActivityLogs=[];
let _segmentAnalysisReport=null;

const ALGORITHM_WEIGHT_FIELDS=['weightPersonalFit','weightExpert','weightCommunity','weightPricePerf'];
const ALGORITHM_BEHAVIOR_FIELDS=['boostCategoryView','boostSearch','boostQuiz','boostCompare','boostEcosystem','boostBudget'];

function safeArray(value){return Array.isArray(value)?value:[]}
function safeMap(value){return value&&typeof value==='object'&&!Array.isArray(value)?value:{}}
function safeNumber(value,fallback=0){const parsed=Number(value);return Number.isFinite(parsed)?parsed:fallback}
function qCoinPeriodKey(date=new Date()){return `${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}`}
function formatQCoinAmount(value){const amount=Math.round(safeNumber(value)*10)/10;return Number.isInteger(amount)?String(amount):amount.toFixed(1).replace(/\.0$/,'')}
const ADMIN_PREMIUM_PRODUCTS={monthly:'aylik_abonelik',yearly:'yillik_abonelik'};

let _freeDailyAiCreditLimit=10;
let _activeUserModalUid='';

function premiumDetails(user){return safeMap(safeMap(user.userSubscriptionDetails).premium)}
function premiumPlanKey(user){
  const details=premiumDetails(user);
  const productId=String(details.productId||details.activeProductId||'').trim();
  const planType=String(details.planType||'').trim().toLowerCase();
  if(planType==='monthly'||productId===ADMIN_PREMIUM_PRODUCTS.monthly)return 'monthly';
  if(planType==='yearly'||productId===ADMIN_PREMIUM_PRODUCTS.yearly)return 'yearly';
  return user.isPremium?'premium':'free';
}
function premiumPlanLabel(plan){
  switch(plan){
    case 'monthly': return 'Monthly';
    case 'yearly': return 'Yearly';
    case 'premium': return 'Premium';
    default: return 'Free';
  }
}
function premiumPlanDescription(plan){
  switch(plan){
    case 'monthly': return 'Aylık Premium';
    case 'yearly': return 'Yıllık Premium';
    case 'premium': return 'Premium';
    default: return 'Free';
  }
}
function premiumBadgeHtml(user,large=false){
  const plan=premiumPlanKey(user);
  if(plan==='free')return `<span class="badge badge-ghost"${large?' style="font-size:12px;padding:6px 12px"':''}>Free</span>`;
  const label=plan==='monthly'?'Premium Monthly':plan==='yearly'?'Premium Yearly':'Premium';
  return `<span class="badge badge-premium"${large?' style="font-size:12px;padding:6px 12px"':''}>${label}</span>`;
}
function formatIsoDate(value){
  const dt=parseDateValue(value);
  return dt?dt.toLocaleDateString('tr-TR',{day:'numeric',month:'long',year:'numeric'}):'—';
}
function buildPremiumPayload(user,plan){
  const existingDetails={...safeMap(user.userSubscriptionDetails)};
  if(plan==='free'){
    delete existingDetails.premium;
    return {isPremium:false,userSubscriptionDetails:existingDetails};
  }
  const current=premiumDetails(user);
  const now=new Date();
  const keepStart=plan===premiumPlanKey(user)&&current.startedAt;
  const startedAt=keepStart?String(current.startedAt):now.toISOString();
  const startDate=parseDateValue(startedAt)||now;
  const expiresAt=new Date(startDate.getTime()+(plan==='yearly'?365:30)*864e5).toISOString();
  existingDetails.premium={
    ...current,
    productId:plan==='yearly'?ADMIN_PREMIUM_PRODUCTS.yearly:ADMIN_PREMIUM_PRODUCTS.monthly,
    activeProductId:plan==='yearly'?ADMIN_PREMIUM_PRODUCTS.yearly:ADMIN_PREMIUM_PRODUCTS.monthly,
    planType:plan,
    startedAt,
    expiresAt,
    source:'admin',
    updatedAt:new Date().toISOString(),
  };
  return {isPremium:true,userSubscriptionDetails:existingDetails};
}

function normalizeAdminAiProfile(raw){
  const data=safeMap(raw);
  return {
    persona:String(data.persona||'').trim(),
    summary:String(data.summary||'').trim(),
    retentionRisk:String(data.retentionRisk||'').trim(),
    monetizationSignal:String(data.monetizationSignal||'').trim(),
    premiumRecommendation:String(data.premiumRecommendation||'').trim(),
    qCoinAction:String(data.qCoinAction||'').trim(),
    nextActions:safeArray(data.nextActions).map(item=>String(item||'').trim()).filter(Boolean).slice(0,4),
    watchouts:safeArray(data.watchouts).map(item=>String(item||'').trim()).filter(Boolean).slice(0,3),
    generatedAt:String(data.generatedAt||'').trim(),
    model:String(data.model||'qor-ai').trim(),
  };
}
function renderAdminAiProfileCard(profile,uid){
  const p=normalizeAdminAiProfile(profile);
  const hasContent=!!(p.summary||p.persona||p.retentionRisk||p.premiumRecommendation||p.qCoinAction||p.nextActions.length);
  const generated=p.generatedAt?formatDateTimeLabel(p.generatedAt):'Not generated yet';
  return `<div class="card" style="margin:0 0 16px;padding:14px"><div class="card-title"><span>🧠 Qor AI User Portrait</span><button class="btn btn-primary btn-sm" onclick="generateUserDeepSeekProfile('${escJs(uid)}')">${hasContent?'Refresh':'Generate'}</button></div>${hasContent?`<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:12px"><div><span style="color:var(--text2)">Persona:</span> <b>${escHtml(p.persona||'—')}</b></div><div><span style="color:var(--text2)">Generated:</span> <b>${escHtml(generated)}</b></div><div style="grid-column:1/-1;line-height:1.6;color:var(--text1)">${escHtml(p.summary||'—')}</div><div><span style="color:var(--text2)">Retention Risk:</span> <b>${escHtml(p.retentionRisk||'—')}</b></div><div><span style="color:var(--text2)">Monetization:</span> <b>${escHtml(p.monetizationSignal||'—')}</b></div><div><span style="color:var(--text2)">Premium Recommendation:</span> <b>${escHtml(p.premiumRecommendation||'—')}</b></div><div><span style="color:var(--text2)">Q Coin Action:</span> <b>${escHtml(p.qCoinAction||'—')}</b></div>${p.nextActions.length?`<div style="grid-column:1/-1"><div style="color:var(--text2);margin-bottom:6px">Recommended next actions</div><div style="display:flex;flex-wrap:wrap;gap:6px">${p.nextActions.map(item=>`<span class="feature-pill ghost">${escHtml(item)}</span>`).join('')}</div></div>`:''}${p.watchouts.length?`<div style="grid-column:1/-1"><div style="color:var(--text2);margin-bottom:6px">Watchouts</div><div style="display:flex;flex-wrap:wrap;gap:6px">${p.watchouts.map(item=>`<span class="feature-pill">${escHtml(item)}</span>`).join('')}</div></div>`:''}</div>`:`<div style="color:var(--text2);font-size:12px;line-height:1.6">Qor AI will interpret this user's profile, behavior, Q Coin state, and premium conversion potential, then generate a short admin action plan.</div>`}</div>`;
}
async function callDeepSeekAdminJson(messages,{maxTokens=1200,temperature=0.4}={}){
  const token=getPb().authStore.token;
  const response=await fetch(`${PB_URL}/api/ai/deepseek`,{
    method:'POST',
    headers:{'Content-Type':'application/json',Authorization:token},
    body:JSON.stringify({model:'deepseek-chat',messages,max_tokens:maxTokens,temperature,response_format:{type:'json_object'}}),
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data.error){throw new Error(data.message||data.error||'Qor AI request failed');}
  const content=data.choices?.[0]?.message?.content||'{}';
  try{return JSON.parse(content);}catch(_){
    const match=String(content).match(/\{[\s\S]*\}/);
    if(match)return JSON.parse(match[0]);
    throw new Error('Qor AI response could not be parsed');
  }
}
function normalizeSegmentAnalysis(raw){
  const data=safeMap(raw);
  return {
    summary:String(data.summary||'').trim(),
    generatedAt:String(data.generatedAt||'').trim(),
    segments:safeArray(data.segments).map(item=>({
      name:String(item?.name||'Segment').trim(),
      size:String(item?.size||'').trim(),
      description:String(item?.description||'').trim(),
      premiumPotential:String(item?.premiumPotential||'').trim(),
      qCoinAction:String(item?.qCoinAction||'').trim(),
      recommendedCampaign:String(item?.recommendedCampaign||'').trim(),
    })).filter(item=>item.name||item.description).slice(0,6),
    actions:safeArray(data.actions||data.recommendedActions).map(item=>String(item||'').trim()).filter(Boolean).slice(0,6),
    risks:safeArray(data.risks||data.watchouts).map(item=>String(item||'').trim()).filter(Boolean).slice(0,4),
  };
}
function buildBulkSegmentPayload(users){
  const planSplit={free:0,monthly:0,yearly:0,premium:0};
  const personas={},budgets={},ecosystems={},countries={},languages={},topInterestCounts={},clusterCounts={};
  let avgCompleteness=0,avgRemainingQ=0,premiumUsers=0,quizUsers=0,analysisUsers=0;
  users.forEach(user=>{
    const plan=premiumPlanKey(user);
    planSplit[plan]=(planSplit[plan]||0)+1;
    if(plan!=='free')premiumUsers++;
    const persona=classifyUserPersona(user);personas[persona]=(personas[persona]||0)+1;
    const budget=String(user.budgetRange||'mid');budgets[budget]=(budgets[budget]||0)+1;
    const ecosystem=String(user.ecosystem||'mixed');ecosystems[ecosystem]=(ecosystems[ecosystem]||0)+1;
    const country=String(user.country||'Unknown');countries[country]=(countries[country]||0)+1;
    const language=String(user.language||'Unknown');languages[language]=(languages[language]||0)+1;
    const topInterest=collectUserInterestScores(user)[0]?.[0]||String(user.primaryCategory||'general');
    topInterestCounts[topInterest]=(topInterestCounts[topInterest]||0)+1;
    const clusterKey=[persona,budget,ecosystem,topInterest].join(' • ');
    clusterCounts[clusterKey]=(clusterCounts[clusterKey]||0)+1;
    const snapshot=getUserQCoinSnapshot(user);
    avgRemainingQ+=snapshot.remaining;
    avgCompleteness+=computeProfileCompleteness(user);
    if(safeArray(user.quizHistory).length)quizUsers++;
    if(safeArray(user.analyzedProducts).length)analysisUsers++;
  });
  const safeAvg=(total)=>users.length?Math.round(total/users.length):0;
  return {
    generatedAt:new Date().toISOString(),
    totals:{users:users.length,premiumUsers,quizCoverage:users.length?Math.round(quizUsers/users.length*100):0,analysisCoverage:users.length?Math.round(analysisUsers/users.length*100):0,avgCompleteness:safeAvg(avgCompleteness),avgRemainingQ:safeAvg(avgRemainingQ)},
    planSplit,
    personas:Object.entries(personas).sort((a,b)=>b[1]-a[1]).slice(0,6),
    budgets:Object.entries(budgets).sort((a,b)=>b[1]-a[1]).slice(0,6),
    ecosystems:Object.entries(ecosystems).sort((a,b)=>b[1]-a[1]).slice(0,6),
    countries:Object.entries(countries).sort((a,b)=>b[1]-a[1]).slice(0,8),
    languages:Object.entries(languages).sort((a,b)=>b[1]-a[1]).slice(0,6),
    topInterests:Object.entries(topInterestCounts).sort((a,b)=>b[1]-a[1]).slice(0,8),
    topClusters:Object.entries(clusterCounts).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([name,count])=>({name,count})),
  };
}
function renderStoredSegmentAnalysis(){
  const meta=document.getElementById('deepSeekSegmentMeta');
  const content=document.getElementById('deepSeekSegmentContent');
  if(!meta||!content)return;
  if(!_segmentAnalysisReport){
    meta.textContent='No saved segment analysis yet.';
    content.innerHTML='<div class="placeholder">Qor AI will segment users and generate actionable admin recommendations.</div>';
    return;
  }
  const report=normalizeSegmentAnalysis(_segmentAnalysisReport);
  meta.textContent=report.generatedAt?`Last generated: ${formatDateTimeLabel(report.generatedAt)}`:'Segment analysis is ready';
  content.innerHTML=`${report.summary?`<div class="card" style="margin:0 0 12px;padding:14px;line-height:1.7">${escHtml(report.summary)}</div>`:''}<div class="grid-3 intelligence-chart-grid" style="margin-bottom:12px">${report.segments.map(segment=>`<div class="card" style="margin:0;padding:14px"><div class="card-title"><span>${escHtml(segment.name)}</span><span style="font-size:11px;color:var(--text3)">${escHtml(segment.size||'')}</span></div><div style="font-size:12px;line-height:1.6;color:var(--text1);margin-bottom:10px">${escHtml(segment.description||'')}</div><div class="feature-pill-row"><span class="feature-pill">Premium: ${escHtml(segment.premiumPotential||'—')}</span><span class="feature-pill ghost">Q Coin: ${escHtml(segment.qCoinAction||'—')}</span></div><div style="font-size:11px;color:var(--text2);margin-top:10px">Campaign: <b>${escHtml(segment.recommendedCampaign||'—')}</b></div></div>`).join('')}</div><div class="grid-2 intelligence-detail-grid"><div class="card"><div class="card-title">Recommended Actions</div><div class="insight-stack">${report.actions.length?report.actions.map(item=>`<div class="insight-item">${escHtml(item)}</div>`).join(''):'<div class="placeholder">No recommendation</div>'}</div></div><div class="card"><div class="card-title">Risks / Watchouts</div><div class="insight-stack">${report.risks.length?report.risks.map(item=>`<div class="insight-item">${escHtml(item)}</div>`).join(''):'<div class="placeholder">No risk note</div>'}</div></div></div>`;
}
async function loadStoredSegmentAnalysis(){
  const meta=document.getElementById('deepSeekSegmentMeta');
  const content=document.getElementById('deepSeekSegmentContent');
  if(meta)meta.textContent='Loading saved segment analysis...';
  if(content)content.innerHTML='<div class="placeholder">Loading...</div>';
  try{
    const doc=await pbGetDoc('app_config','admin_user_segment_analysis');
    const raw=doc.exists?(doc.data()?.value||doc.data()):null;
    _segmentAnalysisReport=raw?normalizeSegmentAnalysis(raw):null;
  }catch(e){
    _segmentAnalysisReport=null;
    if(meta)meta.textContent='Segment analysis could not be loaded';
    if(content)content.innerHTML=`<div style="color:var(--red)">Error: ${escHtml(e.message||String(e))}</div>`;
    return;
  }
  renderStoredSegmentAnalysis();
}
async function generateBulkDeepSeekSegments(){
  if(!allUsers.length){toast('Load users first','w');return}
  const meta=document.getElementById('deepSeekSegmentMeta');
  const content=document.getElementById('deepSeekSegmentContent');
  if(meta)meta.textContent='Qor AI is generating segment analysis...';
  if(content)content.innerHTML='<div style="text-align:center;padding:30px;color:var(--text3)"><div class="spinner"></div><div style="margin-top:8px">Calculating segments...</div></div>';
  try{
    const payload=buildBulkSegmentPayload(allUsers);
    const raw=await callDeepSeekAdminJson([
      {role:'system',content:'Qor AI admin paneli icin calisan bir buyume ve retention stratejisti ol. Sadece JSON object dondur. JSON anahtarlari: summary, segments, actions, risks. segments dizisi icindeki her nesnede name, size, description, premiumPotential, qCoinAction, recommendedCampaign alanlari olsun. Tum metinler Turkce olsun.'},
      {role:'user',content:`Su agregasyonlara gore kullanici segmentlerini cikar ve admin onerileri uret:\n${JSON.stringify(payload)}`}
    ],{maxTokens:1800,temperature:0.35});
    _segmentAnalysisReport={...normalizeSegmentAnalysis(raw),generatedAt:new Date().toISOString()};
    await pbSetDoc('app_config','admin_user_segment_analysis',{key:'admin_user_segment_analysis',value:_segmentAnalysisReport,updatedAt:new Date().toISOString()});
    renderStoredSegmentAnalysis();
    logActivity('deepseek_segment_analysis','Bulk Qor AI segment analysis generated',{userCount:allUsers.length});
    toast('Segment analysis is ready','s');
  }catch(e){
    if(meta)meta.textContent='Qor AI segment analysis failed';
    if(content)content.innerHTML=`<div style="color:var(--red);padding:20px">Error: ${escHtml(e.message||String(e))}</div>`;
    toast('Qor AI segment analysis error: '+(e.message||e),'e');
  }
}

async function getPublicConfigMap(){
  try{
    await pbEnsureAuth();
    const result=await getPb().collection('public_config').getList(1,200,{$autoCancel:false});
    const configMap={};
    result.items.forEach(item=>{if(item.key)configMap[item.key]=item.value});
    return configMap;
  }catch(_){
    const result=await pbGetList('public_config',1,200,{});
    const configMap={};
    result.items.forEach(item=>{if(item.key)configMap[item.key]=item.value});
    return configMap;
  }
}

async function syncPublicConfigValue(key,value){
  try{
    const pb=getPb();
    const result=await pb.collection('public_config').getList(1,1,{filter:`key="${_escapeFilterValue(key)}"`,$autoCancel:false});
    const existing=result.items[0];
    if(existing)await pb.collection('public_config').update(existing.id,{value,key},{$autoCancel:false});
    else await pb.collection('public_config').create({key,value},{$autoCancel:false});
  }catch(e){
    console.warn('[public_config] sync failed',key,e);
    throw e;
  }
}

async function loadQCoinConfig(){
  try{
    const configMap=await getPublicConfigMap();
    _freeDailyAiCreditLimit=Math.max(0,safeNumber(configMap.free_daily_ai_credit_limit,10));
  }catch(_){
    _freeDailyAiCreditLimit=10;
  }
  const input=document.getElementById('usersDailyQCoinInput');
  if(input)input.value=String(_freeDailyAiCreditLimit);
  const hint=document.getElementById('usersQCoinHint');
  if(hint)hint.textContent=`Global daily pool is ${formatQCoinAmount(_freeDailyAiCreditLimit)} Q. You can add personal extra Q or reset the balance from the user detail view.`;
  return _freeDailyAiCreditLimit;
}

function getUserQCoinSnapshot(user){
  const periodKey=String(user.dailyAiCreditsDate||'').trim();
  const todayKey=qCoinPeriodKey();
  const base=Math.max(0,_freeDailyAiCreditLimit);
  const extra=Math.max(0,safeNumber(user.bonusQCoins));
  const total=base+extra;
  const used=periodKey===todayKey?Math.max(0,safeNumber(user.dailyAiCreditsUsed)):0;
  const remaining=Math.max(0,total-used);
  return{base,extra,total,used,remaining,periodKey:periodKey||todayKey};
}
async function generateUserDeepSeekProfile(uid){
  const u=allUsers.find(x=>x.uid===uid);if(!u)return;
  const analysisEl=document.getElementById('analysisContent');
  if(analysisEl)analysisEl.innerHTML='<div style="text-align:center;padding:30px;color:var(--text3)"><div class="spinner"></div><div style="margin-top:8px">Preparing Qor AI user profile...</div></div>';
  try{
    const [rvRes,compRes]=await Promise.all([
      pbGetList('recently_viewed',1,12,{filter:`userId="${uid}"`,sort:'-created'}),
      pbGetList('comparisons',1,12,{filter:`userId="${uid}"`,sort:'-created'})
    ]);
    const snapshot=getUserQCoinSnapshot(u);
    const payload={
      profile:{
        uid:u.uid,email:u.email,displayName:u.displayName,country:u.country,language:u.language,ecosystem:u.ecosystem,budgetRange:u.budgetRange,usageIntent:u.usageIntent,primaryCategory:u.primaryCategory,profession:u.profession,ageRange:u.ageRange,gender:u.gender,
        priorities:safeArray(u.priorities),interestCategories:safeArray(u.interestCategories),currentDevices:safeArray(u.currentDevices),subscriptions:safeArray(u.subscriptions),profileVector:safeMap(u.profileVector),persona:classifyUserPersona(u),
      },
      engagement:{
        comparisons:getUserComparisonCount(u),favorites:safeArray(u.favorites).length,quizSessions:safeArray(u.quizHistory).length,analysisCount:safeArray(u.analyzedProducts).length,searchCount:safeArray(u.searchHistory).length,
        recentViewed:rvRes.items.map(item=>item.productName||item.productId||'').filter(Boolean),
        recentComparisons:compRes.items.map(item=>item.title||item.productIds||item.id),
      },
      premium:{plan:premiumPlanKey(u),details:premiumDetails(u),isPremium:u.isPremium},
      qCoin:{remaining:snapshot.remaining,total:snapshot.total,used:snapshot.used,extra:snapshot.extra},
      adminContext:{goal:'Understand the user, retention risk, premium upsell potential, and Q Coin action'}
    };
    const result=await callDeepSeekAdminJson([
      {role:'system',content:'Act as a user intelligence assistant for the Qor AI admin panel. Return only a JSON object. JSON keys: persona, summary, retentionRisk, monetizationSignal, premiumRecommendation, qCoinAction, nextActions, watchouts. All text must be English. nextActions max 4 short items, watchouts max 3 short items.'},
      {role:'user',content:`Analyze this user and suggest admin actions:\n${JSON.stringify(payload)}`}
    ]);
    const profile={...normalizeAdminAiProfile(result),generatedAt:new Date().toISOString(),model:'qor-ai'};
    await pbUpdateDoc('users',uid,{adminAiProfile:profile});
    u.adminAiProfile=profile;
    logActivity('user_deepseek_profile',`Qor AI user analysis generated: ${uid}`,{userId:uid});
    openUserDetail(uid);
    const analysisTab=[...document.querySelectorAll('#userModalBody .user-tab')].find(btn=>btn.dataset.tab==='analysis');
    if(analysisTab)analysisTab.click();
    toast('Qor AI user profile is ready','s');
  }catch(e){
    if(analysisEl)analysisEl.innerHTML=`<div style="color:var(--red);padding:20px">Qor AI error: ${escHtml(e.message||String(e))}</div>`;
    toast('Qor AI error: '+(e.message||e),'e');
  }
}
function parseDateValue(...values){for(const value of values){if(!value)continue;const dt=new Date(value);if(!Number.isNaN(dt.getTime()))return dt}return null}
function formatDateLabel(value){const dt=parseDateValue(value);return dt?dt.toLocaleDateString('en-US',{day:'numeric',month:'long',year:'numeric'}):'—'}
function formatDateTimeLabel(value){const dt=parseDateValue(value);return dt?dt.toLocaleDateString('en-US',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—'}
function getUserComparisonCount(user){return Number(user.comparisonsCount||user.comparisonCount||safeArray(user.comparisonHistory).length||0)}
function getUserLastActive(user){return parseDateValue(user.lastActive,user.updatedAt,user.updated,user.createdAt,user.created)}

function computeProfileCompleteness(user){
  const checks=[
    !!String(user.displayName||'').trim(),
    !!String(user.email||'').trim(),
    !!String(user.photoURL||'').trim(),
    safeArray(user.priorities).length>0,
    safeArray(user.currentDevices).length>0,
    safeArray(user.interestCategories).length>0,
    !!String(user.ageRange||'').trim(),
    !!String(user.profession||'').trim(),
    !!String(user.usageIntent||'').trim(),
    !!String(user.primaryCategory||'').trim(),
    safeMap(user.profileVector)&&Object.keys(safeMap(user.profileVector)).length>0,
    safeArray(user.quizHistory).length>0,
  ];
  const done=checks.filter(Boolean).length;
  return Math.round(done/checks.length*100);
}

function collectUserInterestScores(user){
  const scores={};
  const add=(label,amount=1)=>{
    const key=String(label||'').trim().toLowerCase();
    if(!key)return;
    scores[key]=(scores[key]||0)+amount;
  };
  safeArray(user.interestCategories).forEach(label=>add(label,3));
  Object.entries(safeMap(user.categoryViewCounts)).forEach(([label,count])=>add(label,Number(count)||0));
  Object.entries(safeMap(user.categoryVisitCounts)).forEach(([label,count])=>add(label,(Number(count)||0)*0.8));
  safeArray(user.quizHistory).forEach(entry=>{add(entry.category,1.3);add(entry.type,0.8);add(entry.mode,0.6)});
  safeArray(user.analyzedProducts).forEach(entry=>add(entry.category,1.2));
  if(user.primaryCategory)add(user.primaryCategory,2.5);
  return Object.entries(scores).sort((a,b)=>b[1]-a[1]);
}

function classifyUserPersona(user){
  const comparisonCount=getUserComparisonCount(user);
  const analysisCount=safeArray(user.analyzedProducts).length;
  const searchCount=safeArray(user.searchHistory).length;
  const favoriteCount=safeArray(user.favorites).length;
  const quizCount=safeArray(user.quizHistory).length;
  if(user.isPremium&&(comparisonCount+analysisCount)>=14)return 'Premium Power';
  if(comparisonCount>=12||analysisCount>=15)return 'Analyst';
  if(searchCount>=10||quizCount>=6)return 'Explorer';
  if(favoriteCount>=5||comparisonCount>=4)return 'Focused Buyer';
  return 'New User';
}

function buildUserNarrative(user){
  const persona=classifyUserPersona(user);
  const interests=collectUserInterestScores(user).slice(0,3).map(([label])=>label).join(', ');
  const budget=String(user.budgetRange||'mid');
  const ecosystem=String(user.ecosystem||'mixed');
  const summaryBits=[persona,'budget:'+budget,'ecosystem:'+ecosystem];
  if(interests)summaryBits.push('focus:'+interests);
  return summaryBits.join(' • ');
}

function resetChart(name){
  const current={userPlanChart,userPersonaChart,userInterestChart,userBehaviorChart,userInterestBreakdownChart,userQuizTypeChart,userAnalysisCategoryChart,activityActionChart}[name];
  if(current){current.destroy();}
  if(name==='userPlanChart')userPlanChart=null;
  if(name==='userPersonaChart')userPersonaChart=null;
  if(name==='userInterestChart')userInterestChart=null;
  if(name==='userBehaviorChart')userBehaviorChart=null;
  if(name==='userInterestBreakdownChart')userInterestBreakdownChart=null;
  if(name==='userQuizTypeChart')userQuizTypeChart=null;
  if(name==='userAnalysisCategoryChart')userAnalysisCategoryChart=null;
  if(name==='activityActionChart')activityActionChart=null;
}

function mountChart(name,canvas,config){
  if(!canvas||typeof Chart==='undefined')return null;
  resetChart(name);
  const chart=new Chart(canvas,config);
  if(name==='userPlanChart')userPlanChart=chart;
  if(name==='userPersonaChart')userPersonaChart=chart;
  if(name==='userInterestChart')userInterestChart=chart;
  if(name==='userBehaviorChart')userBehaviorChart=chart;
  if(name==='userInterestBreakdownChart')userInterestBreakdownChart=chart;
  if(name==='userQuizTypeChart')userQuizTypeChart=chart;
  if(name==='userAnalysisCategoryChart')userAnalysisCategoryChart=chart;
  if(name==='activityActionChart')activityActionChart=chart;
  return chart;
}

function chartTextColor(){return getCSS('--text2')||'#a1a1aa'}
function chartGridColor(){return getCSS('--border')||'#27272a'}
function chartPalette(){return ['#7c3aed','#3b82f6','#22c55e','#f59e0b','#ef4444','#06b6d4','#ec4899','#14b8a6']}

function renderRankBars(targetId,entries){
  const el=document.getElementById(targetId);
  if(!el)return;
  if(!entries.length){el.innerHTML='<div class="placeholder">No data</div>';return}
  const max=entries[0][1]||1;
  el.innerHTML=entries.map(([label,value])=>`<div class="rank-bar-item"><div class="rank-bar-label">${escHtml(label)}</div><div class="rank-bar-track"><div class="rank-bar-fill" style="width:${Math.max(8,Math.round(value/max*100))}%"></div></div><div class="rank-bar-value">${value}</div></div>`).join('');
}

function renderUserIntelligence(){
  const users=allUsers||[];
  const updatedEl=document.getElementById('userIntelligenceUpdatedAt');
  if(updatedEl)updatedEl.textContent=users.length?('Updated '+new Date().toLocaleTimeString('tr-TR')):'';
  if(!users.length){
    ['uiTotalUsers','uiQuizCoverage','uiAnalysisCoverage','uiAvgCompleteness'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent='0'});
    renderRankBars('userCountryBars',[]);
    const insightEl=document.getElementById('userIntelligenceInsights');if(insightEl)insightEl.innerHTML='<div class="placeholder">No user data</div>';
    resetChart('userPlanChart');resetChart('userPersonaChart');resetChart('userInterestChart');
    renderStoredSegmentAnalysis();
    return;
  }

  const planSplit={Free:0,Monthly:0,Yearly:0,Premium:0};
  const personas={};
  const interests={};
  const countries={};
  const languages={};
  const budgets={};
  const ecosystems={};
  let quizUsers=0,analysisUsers=0,completenessTotal=0;

  users.forEach(user=>{
    const planLabel=premiumPlanLabel(premiumPlanKey(user));
    planSplit[planLabel]=(planSplit[planLabel]||0)+1;
    const persona=classifyUserPersona(user);
    personas[persona]=(personas[persona]||0)+1;
    collectUserInterestScores(user).slice(0,5).forEach(([label,value])=>{interests[label]=(interests[label]||0)+value});
    const country=String(user.country||'Unknown');countries[country]=(countries[country]||0)+1;
    const lang=String(user.language||'Unknown');languages[lang]=(languages[lang]||0)+1;
    const budget=String(user.budgetRange||'mid');budgets[budget]=(budgets[budget]||0)+1;
    const ecosystem=String(user.ecosystem||'mixed');ecosystems[ecosystem]=(ecosystems[ecosystem]||0)+1;
    if(safeArray(user.quizHistory).length)quizUsers++;
    if(safeArray(user.analyzedProducts).length)analysisUsers++;
    completenessTotal+=computeProfileCompleteness(user);
  });

  const avgCompleteness=Math.round(completenessTotal/users.length);
  const setText=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=value};
  setText('uiTotalUsers',String(users.length));
  setText('uiQuizCoverage',`${Math.round(quizUsers/users.length*100)}%`);
  setText('uiAnalysisCoverage',`${Math.round(analysisUsers/users.length*100)}%`);
  setText('uiAvgCompleteness',`${avgCompleteness}%`);

  const countryEntries=Object.entries(countries).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const interestEntries=Object.entries(interests).sort((a,b)=>b[1]-a[1]).slice(0,8);
  renderRankBars('userCountryBars',countryEntries);

  const insightEl=document.getElementById('userIntelligenceInsights');
  if(insightEl){
    const topPersona=Object.entries(personas).sort((a,b)=>b[1]-a[1])[0];
    const topBudget=Object.entries(budgets).sort((a,b)=>b[1]-a[1])[0];
    const topEco=Object.entries(ecosystems).sort((a,b)=>b[1]-a[1])[0];
    const topLang=Object.entries(languages).sort((a,b)=>b[1]-a[1])[0];
    insightEl.innerHTML=[
      `<div class="insight-item"><div class="insight-label">PERSONA</div>${topPersona?`${escHtml(topPersona[0])} users lead with ${topPersona[1]} profiles.`:'No persona signal yet.'}</div>`,
      `<div class="insight-item"><div class="insight-label">INTEREST</div>${interestEntries[0]?`${escHtml(interestEntries[0][0])} is the strongest shared interest cluster.`:'Interest data is still building.'}</div>`,
      `<div class="insight-item"><div class="insight-label">BUDGET</div>${topBudget?`${escHtml(topBudget[0])} budget band appears most often.`:'Budget preference data is limited.'}</div>`,
      `<div class="insight-item"><div class="insight-label">ECOSYSTEM</div>${topEco?`${escHtml(topEco[0])} ecosystem currently dominates the audience.`:'Ecosystem preference is not clear yet.'}</div>`,
      `<div class="insight-item"><div class="insight-label">LANGUAGE</div>${topLang?`${escHtml(topLang[0])} is the most active app language among users.`:'Language signal unavailable.'}</div>`,
    ].join('');
  }

  mountChart('userPlanChart',document.getElementById('userPlanChart'),{
    type:'doughnut',
    data:{labels:Object.keys(planSplit),datasets:[{data:Object.values(planSplit),backgroundColor:['#334155','#3b82f6','#7c3aed','#f59e0b'],borderWidth:0}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:chartTextColor()}}}}
  });

  mountChart('userPersonaChart',document.getElementById('userPersonaChart'),{
    type:'doughnut',
    data:{labels:Object.keys(personas),datasets:[{data:Object.values(personas),backgroundColor:chartPalette(),borderWidth:0}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:chartTextColor()}}}}
  });

  mountChart('userInterestChart',document.getElementById('userInterestChart'),{
    type:'bar',
    data:{labels:interestEntries.map(([label])=>label),datasets:[{data:interestEntries.map(([,value])=>Number(value.toFixed?value.toFixed(1):value)),backgroundColor:'#7c3aed',borderRadius:8}]},
    options:{responsive:true,maintainAspectRatio:false,indexAxis:'y',plugins:{legend:{display:false}},scales:{x:{grid:{color:chartGridColor()},ticks:{color:chartTextColor()}},y:{grid:{display:false},ticks:{color:chartTextColor()}}}}
  });

  renderStoredSegmentAnalysis();
}

function renderUserOverviewCharts(uid){
  const user=allUsers.find(entry=>entry.uid===uid);if(!user)return;
  const behaviorData={
    Views:safeArray(user.productViewHistory).length,
    Searches:safeArray(user.searchHistory).length,
    Comparisons:getUserComparisonCount(user),
    Quizzes:safeArray(user.quizHistory).length,
    AI:safeArray(user.analyzedProducts).length,
    Favorites:safeArray(user.favoriteHistory).length||safeArray(user.favorites).length,
  };
  const interestEntries=collectUserInterestScores(user).slice(0,6);

  mountChart('userBehaviorChart',document.getElementById('userBehaviorChartCanvas'),{
    type:'bar',
    data:{labels:Object.keys(behaviorData),datasets:[{data:Object.values(behaviorData),backgroundColor:['#3b82f6','#06b6d4','#7c3aed','#8b5cf6','#22c55e','#f59e0b'],borderRadius:10}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{color:chartTextColor()}},y:{grid:{color:chartGridColor()},ticks:{color:chartTextColor()},beginAtZero:true}}}
  });

  mountChart('userInterestBreakdownChart',document.getElementById('userInterestBreakdownChartCanvas'),{
    type:'doughnut',
    data:{labels:interestEntries.map(([label])=>label),datasets:[{data:interestEntries.map(([,value])=>value),backgroundColor:chartPalette(),borderWidth:0}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:chartTextColor()}}}}
  });
}

function renderUserQuizChart(quizSessions){
  const grouped={};
  quizSessions.forEach(session=>{const label=String(session.type||session.mode||session.category||'quiz');grouped[label]=(grouped[label]||0)+1});
  const entries=Object.entries(grouped);
  mountChart('userQuizTypeChart',document.getElementById('userQuizTypeChartCanvas'),{
    type:'bar',
    data:{labels:entries.map(([label])=>label),datasets:[{data:entries.map(([,value])=>value),backgroundColor:'#8b5cf6',borderRadius:10}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{color:chartTextColor()}},y:{grid:{color:chartGridColor()},ticks:{color:chartTextColor()},beginAtZero:true}}}
  });
}

function renderUserAnalysisChart(items){
  const grouped={};
  items.forEach(item=>{const label=String(item.category||item.mode||'analysis');grouped[label]=(grouped[label]||0)+1});
  const entries=Object.entries(grouped).sort((a,b)=>b[1]-a[1]).slice(0,6);
  mountChart('userAnalysisCategoryChart',document.getElementById('userAnalysisCategoryChartCanvas'),{
    type:'bar',
    data:{labels:entries.map(([label])=>label),datasets:[{data:entries.map(([,value])=>value),backgroundColor:'#22c55e',borderRadius:10}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{color:chartTextColor()}},y:{grid:{color:chartGridColor()},ticks:{color:chartTextColor()},beginAtZero:true}}}
  });
}

function normalizeConfigData(data){
  if (!data || typeof data !== 'object') return {};
  if (data.value && typeof data.value === 'object' && !Array.isArray(data.value)) {
    return { ...data.value, key: data.key };
  }
  return data;
}

async function refreshDashboard(){
  try{
    const [userDocs,compDocs,statsDoc]=await Promise.all([
      pbGetAll('users',{sort:'id'}),
      pbGetAll('comparisons',{sort:'id'}),
      pbGetDoc('public_config','stats').catch(()=>({exists:false,data:()=>null}))
    ]);
    const users=userDocs.map(d=>({uid:d.id,...d.data()}));
    const cSnap={size:compDocs.length};
    const stats=statsDoc?.exists?normalizeConfigData(statsDoc.data()):{};
    const statsProductCount=Number(stats.productCount)||0;
    const statsCategoryCounts=stats.categoryCounts&&typeof stats.categoryCounts==='object'?stats.categoryCounts:null;
    const statsBrandCounts=stats.brandCounts&&typeof stats.brandCounts==='object'?stats.brandCounts:null;
    const statsUpdatedAt=stats.updatedAt?new Date(stats.updatedAt).getTime():0;

    // Load 500 recent products for charts
    const sRes=await pbGetList('products',1,500,{sort:'-scrapedAt'});
    const sampleProducts=sRes.items;
    dashSampleProducts=sampleProducts;

    totalProductCount=statsProductCount||0;
    document.getElementById('dashTotalProducts').textContent=statsProductCount?statsProductCount.toLocaleString():'...';
    anim('dashTotalUsers',users.length);
    anim('dashTotalComparisons',cSnap.size||0);

    // Refresh expensive product aggregates only when missing or stale.
    if(!statsProductCount||!statsCategoryCounts||!statsBrandCounts||!statsUpdatedAt||(Date.now()-statsUpdatedAt)>6*3600*1000){
      countAllProductsInBackground();
    }

    const scores=sampleProducts.map(p=>p.techScore||0).filter(s=>s>0);
    document.getElementById('dashAvgScore').textContent=scores.length?(scores.reduce((a,b)=>a+b,0)/scores.length).toFixed(1):'—';

    const week=new Date(Date.now()-7*864e5);
    const recent=sampleProducts.filter(p=>p.scrapedAt&&new Date(p.scrapedAt)>week).length;
    const te=document.getElementById('dashProductsTrend');
    if(te&&recent>0)te.textContent='+'+recent+' bu hafta';

    const prem=users.filter(u=>u.isPremium).length;
    const ue=document.getElementById('dashUsersTrend');
    if(ue)ue.textContent=users.length?Math.round(prem/users.length*100)+'% premium':'';

    document.getElementById('dashLastUpdated').textContent='Güncellendi '+new Date().toLocaleTimeString();

    const sampleCats={};sampleProducts.forEach(p=>{if(p.category)sampleCats[p.category]=(sampleCats[p.category]||0)+1});
    // Flicker fix: only render if we have full stats; otherwise show loading state until background count completes
    if(statsCategoryCounts&&Object.keys(statsCategoryCounts).length>=2){
      updateCategoryChart(statsCategoryCounts);
    } else {
      const cCtx=document.getElementById('categoryChart');
      if(cCtx){
        if(catChart){catChart.destroy();catChart=null;}
        const p=cCtx.parentElement;
        if(p&&!p.querySelector('.chart-loading')){
          const ld=document.createElement('div');
          ld.className='chart-loading';
          ld.style.cssText='position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--text3);font-size:13px;';
          ld.innerHTML='⏳ Calculating category distribution...';
          p.style.position='relative';
          p.appendChild(ld);
        }
      }
    }

    // Daily trend (from sample)
    const daily=[];for(let i=29;i>=0;i--){const d=new Date(Date.now()-i*864e5);const k=d.toISOString().split('T')[0];const c2=sampleProducts.filter(p=>p.scrapedAt&&new Date(p.scrapedAt).toISOString().split('T')[0]===k).length;daily.push({d:k.slice(5),c:c2})}
    const tCtx=document.getElementById('dailyTrendChart');
    if(tCtx){if(trendChart)trendChart.destroy();trendChart=new Chart(tCtx,{type:'line',data:{labels:daily.map(x=>x.d),datasets:[{data:daily.map(x=>x.c),borderColor:'#7c3aed',backgroundColor:'rgba(124,58,237,.08)',fill:true,tension:.4,pointRadius:2,borderWidth:2}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{color:getCSS('--border')},ticks:{color:getCSS('--text3'),font:{size:10},maxTicksLimit:8}},y:{grid:{color:getCSS('--border')},ticks:{color:getCSS('--text3'),font:{size:10},beginAtZero:true}}}}})}

    // Recent (from sample)
    const rEl=document.getElementById('dashRecentProducts');
    if(rEl)rEl.innerHTML=sampleProducts.slice(0,8).map(p=>{const id=escJs(p.id);const img=safeUrl(p.images?.[0]);const name=escHtml(p.name||'');const brand=escHtml(p.brand||'');const category=escHtml(p.category||'');const score=Number(p.techScore)||0;return`<div class="recent-row" onclick="showView('products');setTimeout(()=>openProduct('${id}'),300)">${img?`<img class="recent-img" src="${img}" onerror="this.style.display='none'">`:`<div class="recent-img" style="display:flex;align-items:center;justify-content:center;font-size:14px">📦</div>`}<div class="recent-info"><div class="recent-name">${name}</div><div class="recent-meta">${brand} · ${category}</div></div>${score?`<span class="badge badge-green">${score}</span>`:''}</div>`;}).join('')||'<div class="placeholder">No products</div>';

    const brands={};sampleProducts.forEach(p=>{if(p.brand)brands[p.brand]=(brands[p.brand]||0)+1});
    updateTopBrands(statsBrandCounts&&Object.keys(statsBrandCounts).length?statsBrandCounts:brands);

    const totalCats=statsCategoryCounts&&Object.keys(statsCategoryCounts).length?Object.keys(statsCategoryCounts).length:Object.keys(sampleCats).length;
    updateInsights(statsProductCount||sampleProducts.length,totalCats);
  }catch(e){console.error(e);toast('Dashboard error: '+e.message,'e')}
}

function anim(id,target){const el=document.getElementById(id);if(!el)return;const start=parseInt(el.textContent.replace(/,/g,''))||0;if(start===target){el.textContent=target.toLocaleString();return}const t0=performance.now();(function step(now){const p=Math.min((now-t0)/500,1);el.textContent=Math.round(start+(target-start)*(1-Math.pow(1-p,3))).toLocaleString();if(p<1)requestAnimationFrame(step)})(t0)}
function getCSS(v){return getComputedStyle(document.documentElement).getPropertyValue(v).trim()}

// Background product counter
let _bgCountRunning=false;
async function countAllProductsInBackground(){
  if(_bgCountRunning)return;
  _bgCountRunning=true;
  try{
    const firstRes=await pbGetList('products',1,1,{});
    const total=firstRes.totalItems;
    totalProductCount=total;
    dashProductTotal=total;
    document.getElementById('dashTotalProducts').textContent=total.toLocaleString();
    const el=document.getElementById('productCount');
    if(el)el.textContent=total.toLocaleString();

    // Fetch all pages for per-category/brand breakdown
    const catCounts={};const brandCounts={};
    const totalPages=Math.ceil(total/500);
    for(let page=1;page<=totalPages;page++){
      const res=await pbGetList('products',page,500,{});
      res.items.forEach(p=>{
        if(p.category)catCounts[p.category]=(catCounts[p.category]||0)+1;
        if(p.brand)brandCounts[p.brand]=(brandCounts[p.brand]||0)+1;
      });
      if(res.items.length<500)break;
    }
    updateCategoryChart(catCounts);
    updateTopBrands(brandCounts);
    updateInsights(total,Object.keys(catCounts).length);
    pbSetDoc('public_config','stats',{productCount:total,categoryCounts:catCounts,brandCounts:brandCounts,updatedAt:new Date().toISOString()}).catch(()=>{});
  }catch(e){console.error('Count error:',e)}
  _bgCountRunning=false;
}

function updateTopBrands(brandCounts){
  const bSorted=Object.entries(brandCounts).sort((a,b)=>b[1]-a[1]).slice(0,10);
  const bEl=document.getElementById('dashTopBrands');
  if(!bEl||!bSorted.length)return;
  const mx=bSorted[0][1];
  bEl.innerHTML=bSorted.map(([b,c],i)=>`<div class="brand-row"><span class="brand-num">${i+1}</span><span class="brand-name">${escHtml(b)}</span><div class="brand-bar"><div class="brand-bar-fill" style="width:${Math.round(c/mx*100)}%"></div></div><span class="brand-count">${c}</span></div>`).join('');
}

function updateInsights(totalCount,totalCats){
  const iEl=document.getElementById('dashAiInsights');
  if(!iEl)return;
  const ins=[];
  const pc=totalCount||totalProductCount||0;
  const catCount=totalCats||(typeof QorAiCategories!=='undefined'?QorAiCategories.getAll().length:0);
  if(pc)ins.push(`<div class="insight-item"><div class="insight-label">DATABASE</div>📊 ${pc.toLocaleString()} products, ${catCount} categories</div>`);
  const scores=(dashSampleProducts||[]).map(p=>p.techScore||0).filter(s=>s>0);
  if(scores.length)ins.push(`<div class="insight-item"><div class="insight-label">QUALITY</div>⭐ Avg. score: ${(scores.reduce((a,b)=>a+b,0)/scores.length).toFixed(1)}/100</div>`);
  const userCount=parseInt(document.getElementById('dashTotalUsers')?.textContent?.replace(/,/g,'')||'0');
  ins.push(`<div class="insight-item"><div class="insight-label">USERS</div>👥 ${userCount} users</div>`);
  iEl.innerHTML=ins.join('')||'<div class="placeholder">No data</div>';
}

function updateCategoryChart(catCounts){
  const cCtx=document.getElementById('categoryChart');
  if(!cCtx)return;
  // Remove loading indicator if any
  const parent=cCtx.parentElement;
  if(parent){const ld=parent.querySelector('.chart-loading');if(ld)ld.remove();}
  if(catChart)catChart.destroy();

  // Map category IDs to display names
  const catIdToName={};
  if(typeof QorAiCategories!=='undefined'&&QorAiCategories.groups){
    QorAiCategories.groups.forEach(g=>{g.categories.forEach(c=>{catIdToName[c.id]=c.name})});
  }

  // Show ALL individual categories sorted by count
  const entries=Object.entries(catCounts).filter(e=>e[1]>0).sort((a,b)=>b[1]-a[1]);
  if(!entries.length)return;

  const totalCats=entries.length;
  const titleEl=cCtx.closest('.card')?.querySelector('.card-title');
  if(titleEl)titleEl.textContent=`CATEGORY DISTRIBUTION (${totalCats} CATEGORIES)`;

  // Generate distinct colors for up to 50 categories
  const cl=['#7c3aed','#22c55e','#f59e0b','#ef4444','#3b82f6','#8b5cf6','#ec4899','#14b8a6','#f97316','#06b6d4',
    '#a855f7','#10b981','#e879f9','#64748b','#dc2626','#16a34a','#d97706','#2563eb','#7e22ce','#15803d',
    '#b45309','#1d4ed8','#6d28d9','#047857','#92400e','#1e40af','#581c87','#065f46','#78350f','#1e3a8a',
    '#4c1d95','#064e3b','#c026d3','#0284c7','#ca8a04','#b91c1c','#0891b2','#7c2d12','#4338ca','#0f766e',
    '#a21caf','#0369a1','#9a3412','#4d7c0f','#be123c','#0e7490','#854d0e','#6366f1','#84cc16','#f43f5e'];

  // Set canvas height based on number of categories (22px per bar)
  const barH=22;
  const newH=Math.max(300,totalCats*barH+60);
  cCtx.style.height=newH+'px';
  cCtx.parentElement.style.overflowY='auto';
  cCtx.parentElement.style.maxHeight='580px';

  catChart=new Chart(cCtx,{
    type:'bar',
    data:{
      labels:entries.map(([id])=>catIdToName[id]||id),
      datasets:[{
        data:entries.map(x=>x[1]),
        backgroundColor:entries.map((_,i)=>cl[i%cl.length]),
        borderRadius:3,
        borderWidth:0
      }]
    },
    options:{
      indexAxis:'y',
      responsive:true,
      maintainAspectRatio:false,
      plugins:{
        legend:{display:false},
        tooltip:{callbacks:{label:ctx=>{
          const total=ctx.dataset.data.reduce((a,b)=>a+b,0);
          const pct=((ctx.parsed.x/total)*100).toFixed(1);
          return`${ctx.parsed.x.toLocaleString()} products (${pct}%)`;
        }}}
      },
      scales:{
        x:{grid:{color:'rgba(255,255,255,0.05)'},ticks:{color:getCSS('--text2'),font:{size:10}}},
        y:{grid:{display:false},ticks:{color:getCSS('--text2'),font:{size:11}}}
      }
    }
  });
}

// ═══════════════════════════════════════
//  PRODUCTS — Server-side Firestore pagination
// ═══════════════════════════════════════
let allProducts=[],filteredProducts=[],displayProducts=[],currentPage=1,selectedIds=new Set(),viewMode='grid';
let dashSampleProducts=null,dashProductTotal=0;
let totalProductCount=0;
const PER=50;

async function loadProducts(){
  const g=document.getElementById('productGrid');
  g.innerHTML='<div class="placeholder"><div class="spinner" style="margin:0 auto 8px"></div>Loading products...</div>';
  try{
    // Load first page IMMEDIATELY — no counting, no blocking
    currentPage=1;
    await loadPage();
    // Show cached count if available
    if(totalProductCount){
      document.getElementById('productCount').textContent=totalProductCount.toLocaleString();
    }
    // Populate filters from categories.js if available, otherwise from loaded data
    populateFiltersFromData();
  }catch(e){g.innerHTML='<div class="placeholder" style="color:var(--red)">Error: '+escHtml(e.message)+'</div>'}
}

function populateFiltersFromData(){
  // Use QorAiCategories if available (from categories.js)
  let cats=[],brands=[];
  if(typeof QorAiCategories!=='undefined'&&QorAiCategories.getAll){
    cats=QorAiCategories.getAll().map(c=>({id:c.id,name:c.name}));
  }
  if(typeof QorAiBrands!=='undefined'&&Array.isArray(QorAiBrands)){
    brands=QorAiBrands.map(b=>typeof b==='string'?b:b.name||b).sort();
  }
  // Supplement from sample data if available
  if(dashSampleProducts&&dashSampleProducts.length){
    const sampleCats=[...new Set(dashSampleProducts.map(p=>p.category).filter(Boolean))];
    sampleCats.forEach(c=>{if(!cats.find(x=>x.id===c))cats.push({id:c,name:c})});
    const sampleBrands=[...new Set(dashSampleProducts.map(p=>p.brand).filter(Boolean))];
    brands=[...new Set([...brands,...sampleBrands])].sort();
  }
  // Supplement from current page
  if(allProducts.length){
    const pageCats=[...new Set(allProducts.map(p=>p.category).filter(Boolean))];
    pageCats.forEach(c=>{if(!cats.find(x=>x.id===c))cats.push({id:c,name:c})});
    const pageBrands=[...new Set(allProducts.map(p=>p.brand).filter(Boolean))];
    brands=[...new Set([...brands,...pageBrands])].sort();
  }
  cats.sort((a,b)=>a.name.localeCompare(b.name));
  const bf=document.getElementById('brandFilter');
  const cf=document.getElementById('categoryFilter');
  if(bf)bf.innerHTML='<option value="">All Brands</option>'+brands.map(b=>`<option>${escHtml(b)}</option>`).join('');
  if(cf)cf.innerHTML='<option value="">All Categories</option>'+cats.map(c=>`<option value="${escHtml(c.id)}">${escHtml(c.name)}</option>`).join('');
}

function buildQuery(){
  const brand=document.getElementById('brandFilter')?.value||'';
  const cat=document.getElementById('categoryFilter')?.value||'';
  const sort=document.getElementById('sortFilter')?.value||'newest';
  const filters=[];
  if(brand)filters.push(`brand="${brand.replace(/"/g,'\\"')}"`);
  if(cat)filters.push(`category="${cat.replace(/"/g,'\\"')}"`);
  const filter=filters.join(' && ');
  let pbSort;
  switch(sort){
    case'newest':pbSort='-scrapedAt';break;
    case'oldest':pbSort='scrapedAt';break;
    case'name-az':pbSort='name';break;
    case'score-high':pbSort='-techScore';break;
    default:pbSort='id';
  }
  return{filter,sort:pbSort};
}

async function loadPage(direction){
  const g=document.getElementById('productGrid');
  try{
    const {filter,sort}=buildQuery();

    if(direction==='next')currentPage++;
    else if(direction==='prev'&&currentPage>1)currentPage--;

    const result=await pbGetList('products',currentPage,PER,{filter,sort});

    if(result.empty&&direction==='next'){currentPage--;toast('Last page','i');return}
    if(result.empty){
      g.innerHTML='<div class="placeholder">No products found. Try changing the filters.</div>';
      document.getElementById('pagination').innerHTML='';
      return;
    }

    allProducts=result.items;
    displayProducts=allProducts;

    totalProductCount=result.totalItems||totalProductCount;

    // Client-side search filter
    const searchQ=(document.getElementById('searchInput')?.value||'').toLowerCase();
    if(searchQ){
      displayProducts=allProducts.filter(p=>
        (p.name||'').toLowerCase().includes(searchQ)||
        (p.brand||'').toLowerCase().includes(searchQ)||
        (p.category||'').toLowerCase().includes(searchQ)
      );
    }

    renderProductsPage();
  }catch(e){
    g.innerHTML='<div class="placeholder" style="color:var(--red)">Error: '+escHtml(e.message)+'</div>';
    console.error('loadPage error:',e);
  }
}

function renderProductsPage(){
  const g=document.getElementById('productGrid');
  if(!displayProducts.length){g.innerHTML='<div class="placeholder">No products found</div>';document.getElementById('pagination').innerHTML='';return}
  g.innerHTML=displayProducts.map(p=>{
    const s=p.techScore||0,sc=s>=75?'#22c55e':s>=50?'#f59e0b':'#ef4444';
    const id=escJs(p.id);
    const image=safeUrl(p.imageUrl||(p.images?.[0])||'');
    const brand=escHtml(p.brand||'');
    const name=escHtml(p.name||'');
    const category=escHtml(p.category||'');
    return`<div class="product-card${selectedIds.has(p.id)?' selected':''}" onclick="handleCardClick(event,'${id}')"><input type="checkbox" class="product-checkbox" ${selectedIds.has(p.id)?'checked':''} onclick="event.stopPropagation();toggleSel('${id}')"><div style="position:relative">${image?`<img class="product-img" src="${image}" alt="" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`:''}<div class="product-img-ph" style="display:${image?'none':'flex'}">📱</div>${s>0?`<div class="score-badge" style="border-color:${sc};color:${sc}">${s}</div>`:''}</div><div class="product-info"><div class="product-brand">${brand}</div><div class="product-name">${name}</div><div class="product-meta"><span class="product-price">${p.price?p.price.toLocaleString()+' TL':''}</span><span>${category}</span></div></div></div>`;
  }).join('');

  const pEl=document.getElementById('pagination');
  const totalPages=totalProductCount?Math.ceil(totalProductCount/PER):0;
  const hasNext=currentPage<totalPages||displayProducts.length>=PER;
  const hasPrev=currentPage>1;
  let h='';
  if(hasPrev||hasNext){
    h+=`<button class="pg-btn" ${hasPrev?'':`disabled`} onclick="prevPage()">◀ Previous</button>`;
    h+=`<span class="pg-btn" style="cursor:default;font-weight:600">Page ${currentPage}</span>`;
    h+=`<button class="pg-btn" ${hasNext?'':`disabled`} onclick="nextPage()">Next ▶</button>`;
    if(totalProductCount)h+=`<span class="pg-btn" style="cursor:default;opacity:.6;font-size:12px">${totalProductCount.toLocaleString()} products</span>`;
  }
  pEl.innerHTML=h;
}

async function nextPage(){await loadPage('next');scrollTop()}
async function prevPage(){await loadPage('prev');scrollTop()}

async function serverSearch(){
  const q=(document.getElementById('searchInput')?.value||'').trim();
  if(!q){currentPage=1;await loadPage();return}
  const g=document.getElementById('productGrid');
  g.innerHTML='<div class="placeholder"><div class="spinner" style="margin:0 auto 8px"></div>Searching...</div>';
  try{
    const esc=q.replace(/"/g,'\\"');
    // Search by name, brand, category or slug-style id
    const filter=`name~"${esc}" || brand~"${esc}" || category~"${esc}" || id~"${esc.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'')}"`;
    const result=await pbGetList('products',1,500,{filter,sort:'-techScore'});
    const qLow=q.toLowerCase();
    // Sort: exact name match first, then starts-with, then contains, then rest by techScore
    const sorted=result.items.slice().sort((a,b)=>{
      const an=(a.name||'').toLowerCase(); const bn=(b.name||'').toLowerCase();
      const ae=an===qLow; const be=bn===qLow;
      if(ae&&!be)return -1; if(be&&!ae)return 1;
      const as=an.startsWith(qLow); const bs=bn.startsWith(qLow);
      if(as&&!bs)return -1; if(bs&&!as)return 1;
      const ac=an.includes(qLow); const bc=bn.includes(qLow);
      if(ac&&!bc)return -1; if(bc&&!ac)return 1;
      return (b.techScore||0)-(a.techScore||0);
    });
    displayProducts=sorted;
    allProducts=sorted;
    renderProductsPage();
    document.getElementById('productCount').textContent=result.totalItems+' results';
    if(!sorted.length)toast('No results for "'+q+'"','i');
  }catch(e){g.innerHTML='<div class="placeholder" style="color:var(--red)">Search error: '+escHtml(e.message)+'</div>'}
}

function filterProducts(){
  currentPage=1;
  loadPage();
}
function pDate(p){return p.scrapedAt?new Date(p.scrapedAt).getTime():p.updatedAt?new Date(p.updatedAt).getTime():0}

// Old renderProducts replaced by renderProductsPage above
function scrollTop(){document.querySelector('.main-content').scrollTo(0,0)}
function handleCardClick(e,id){if(e.target.type==='checkbox')return;if(selectedIds.size>0){toggleSel(id);return}openProduct(id)}
function toggleSel(id){if(selectedIds.has(id))selectedIds.delete(id);else selectedIds.add(id);renderProductsPage();const bar=document.getElementById('selectionBar');if(selectedIds.size>0){bar.style.display='flex';document.getElementById('selectionCount').textContent=selectedIds.size+' selected'}else bar.style.display='none'}
function selectAll(){displayProducts.forEach(p=>selectedIds.add(p.id));renderProductsPage();document.getElementById('selectionBar').style.display='flex';document.getElementById('selectionCount').textContent=selectedIds.size+' selected'}
function deselectAll(){selectedIds.clear();renderProductsPage();document.getElementById('selectionBar').style.display='none'}
async function deleteSelected(){if(!selectedIds.size||!confirm(`Delete ${selectedIds.size} selected products?`))return;try{await Promise.all([...selectedIds].map(id=>pbDeleteDoc('products',id)));logActivity('product_delete',`${selectedIds.size} products bulk deleted`);allProducts=allProducts.filter(p=>!selectedIds.has(p.id));totalProductCount-=selectedIds.size;selectedIds.clear();loadPage();toast('Deleted','s')}catch(e){toast('Error: '+e.message,'e')}document.getElementById('selectionBar').style.display='none'}
function toggleViewMode(){viewMode=viewMode==='grid'?'list':'grid';const g=document.getElementById('productGrid');g.classList.toggle('list-view',viewMode==='list');renderProductsPage()}

// Search debounce — server-side search with cancellation
let sTimer;
document.addEventListener('DOMContentLoaded',()=>{const si=document.getElementById('searchInput');if(si)si.addEventListener('input',()=>{clearTimeout(sTimer);sTimer=setTimeout(serverSearch,800)})});

// ── PRODUCT MODAL ──
const SEC_ICONS={'Display':'🖥️','Battery':'🔋','Camera':'📸','Core Hardware':'⚙️','Performance':'⚡','Memory':'💾','Storage':'💿','Design':'📐','Network':'📡','Connectivity':'🔌','Operating System':'💻','Audio':'🔊','Features':'✨','Sensors':'📡','Processor':'🧠','Power':'⚡','General':'ℹ️'};

function openProduct(id){
  const p=allProducts.find(x=>x.id===id);if(!p)return;
  document.getElementById('modalTitle').textContent=p.name;
  const body=document.getElementById('modalBody');
  const imgs=(p.images?.length?p.images:(p.imageUrl?[p.imageUrl]:[])).map(safeUrl).filter(Boolean);
  const sections=p.specSections&&Object.keys(p.specSections).length?p.specSections:null;
  const safeId=escJs(p.id);
  const safeBrand=escHtml(p.brand||'');
  const safeName=escHtml(p.name||'');
  const safeCategory=escHtml(p.category||'');
  const safeSourceUrl=safeUrl(p.sourceUrl);
  let bricks='';
  function fmtSpecVal(s){
    if(s==='Yes'||s==='Var')return'<span class="yes">✓ Yes</span>';
    if(s==='No'||s==='Yok')return'<span class="no">✗ No</span>';
    // Split multi-value specs on newlines into separate lines
    if(s.includes('\n')){
      return s.split('\n').filter(Boolean).map(line=>`<div class="pm-v-line">${escHtml(line.trim())}</div>`).join('');
    }
    return escHtml(s);
  }
  function specRow(k,v){
    const s=String(v),y=s==='Yes'||s==='Var',n=s==='No'||s==='Yok';
    return`<tr><td class="pm-k">${escHtml(k)}</td><td class="pm-v${y?' yes':n?' no':''}">${fmtSpecVal(s)}</td></tr>`;
  }
  if(sections){bricks=Object.entries(sections).map(([sn,sd])=>{if(!sd||typeof sd!=='object')return'';const rows=Object.entries(sd).filter(([,v])=>v!=null&&String(v).trim());if(!rows.length)return'';return`<div class="pm-brick"><div class="pm-brick-head"><span>${SEC_ICONS[sn]||'📋'}</span>${escHtml(sn)}</div><table class="pm-spec-tbl"><tbody>${rows.map(([k,v])=>specRow(k,v)).join('')}</tbody></table></div>`}).join('')}else{const flat=p.specs||{};const rows=Object.entries(flat).filter(([,v])=>v!=null&&String(v).trim());if(rows.length)bricks=`<div class="pm-brick"><div class="pm-brick-head"><span>📋</span>Specifications</div><table class="pm-spec-tbl"><tbody>${rows.map(([k,v])=>specRow(k,v)).join('')}</tbody></table></div>`}
  const sc=p.techScore||0,scc=sc>=75?'#22c55e':sc>=50?'#f59e0b':'#ef4444';
  // Build category options for edit form
  const catOpts=(typeof QorAiCategories!=='undefined'&&QorAiCategories.getAll)?QorAiCategories.getAll().map(c=>`<option value="${escHtml(c.id)}"${c.id===p.category?' selected':''}>${escHtml(c.name)}</option>`).join(''):'';
  body.innerHTML=`<div class="pm-hero"><div class="pm-img-area">${imgs[0]?`<img class="pm-main-img" id="pmMainImg" src="${imgs[0]}" onerror="this.style.display='none'">`:''}${imgs.length>0?`<div class="pm-thumbs">${imgs.map((u,i)=>`<div class="pm-thumb-wrap" style="position:relative;display:inline-block"><img class="pm-thumb${i===0?' active':''}" src="${u}" onclick="document.getElementById('pmMainImg').src='${escJs(u)}';document.querySelectorAll('.pm-thumb').forEach(t=>t.classList.remove('active'));this.classList.add('active')"><button title="Delete image" onclick="event.stopPropagation();deleteProductImage('${safeId}','${escJs(u)}')" style="position:absolute;top:2px;right:2px;background:rgba(220,38,38,.95);color:#fff;border:none;width:18px;height:18px;border-radius:50%;cursor:pointer;font-size:11px;line-height:1;display:flex;align-items:center;justify-content:center;padding:0">×</button></div>`).join('')}</div>`:''}</div><div class="pm-info"><div class="pm-brand">${safeBrand}</div><div class="pm-name">${safeName}</div><div class="pm-chips"><span class="pm-chip"><b>${p.specsCount||Object.keys(p.specs||{}).length}</b> specs</span><span class="pm-chip">${safeCategory}</span>${p.scrapedAt?`<span class="pm-chip">${new Date(p.scrapedAt).toLocaleDateString()}</span>`:''}</div>${sc>0?`<div class="pm-score"><div class="pm-score-circle"><svg viewBox="0 0 36 36" class="pm-score-svg"><circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="3"/><circle cx="18" cy="18" r="15.9" fill="none" stroke="${scc}" stroke-width="3" stroke-dasharray="${sc} ${100-sc}" stroke-dashoffset="25" stroke-linecap="round"/></svg><div class="pm-score-num" style="color:${scc}">${sc}</div></div></div>`:''}<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-sm btn-primary" onclick="toggleEditForm('${safeId}')">✏️ Edit</button>${safeSourceUrl?`<button class="btn btn-sm" onclick="rescrapeProduct('${safeId}')" style="background:#0891b2;color:#fff">🔄 Re-scrape</button>`:''}<button class="btn btn-danger btn-sm" onclick="deleteProduct('${safeId}');closeModal()">Delete</button>${safeSourceUrl?`<a href="${safeSourceUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-sm">Source</a>`:''}</div></div></div>
  <div id="editFormContainer" style="display:none;margin:16px 0">
    <div class="card" style="margin:0;border:1px solid var(--accent)">
      <div class="card-title">✏️ Edit Product</div>
      <div class="form-grid">
        <div class="form-field"><label>Name</label><input class="input" id="editName" value="${escHtml(p.name||'')}"></div>
        <div class="form-field"><label>Brand</label><input class="input" id="editBrand" value="${escHtml(p.brand||'')}"></div>
        <div class="form-field"><label>Category</label><select class="input" id="editCategory">${catOpts}</select></div>
        <div class="form-field"><label>Price (TL)</label><input class="input" type="number" id="editPrice" value="${p.price_raw||''}"></div>
        <div class="form-field"><label>Tech Score</label><input class="input" type="number" id="editScore" value="${p.techScore||''}" min="0" max="100"></div>
        <div class="form-field"><label>Image URL</label><input class="input" id="editImageUrl" value="${escHtml(p.imageUrl||p.images?.[0]||'')}"></div>
      </div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="btn btn-primary btn-sm" onclick="saveProductEdit('${safeId}')">💾 Save</button>
        <button class="btn btn-ghost btn-sm" onclick="toggleEditForm()">Cancel</button>
      </div>
    </div>
  </div>
  <div class="pm-masonry">${bricks||'<div class="placeholder">No specs</div>'}</div>`;
  const ov=document.getElementById('modalOverlay');ov.style.display='flex';
}
function toggleEditForm(){const el=document.getElementById('editFormContainer');if(el)el.style.display=el.style.display==='none'?'':'none'}
function closeModal(){document.getElementById('modalOverlay').style.display='none'}
async function saveProductEdit(id){
  const updates={};
  const name=document.getElementById('editName')?.value?.trim();
  const brand=document.getElementById('editBrand')?.value?.trim();
  const category=document.getElementById('editCategory')?.value;
  const price=parseFloat(document.getElementById('editPrice')?.value);
  const score=parseInt(document.getElementById('editScore')?.value);
  const imageUrl=document.getElementById('editImageUrl')?.value?.trim();
  if(name)updates.name=name;
  if(brand)updates.brand=brand;
  if(category)updates.category=category;
  if(!isNaN(price)&&price>0)updates.price_raw=price;
  if(!isNaN(score)&&score>=0&&score<=100)updates.techScore=score;
  if(imageUrl){updates.imageUrl=imageUrl;const existing=allProducts.find(p=>p.id===id)?.images||[];if(!existing.includes(imageUrl))updates.images=[...existing,imageUrl]}
  updates.updatedAt=serverTimestamp();
  updates.updatedBy=_currentAdminEmail||'admin';
  try{
    await pbUpdateDoc('products',id,updates);
    logActivity('product_edit',`Product edited: ${name||id}`,{productId:id,changes:Object.keys(updates)});
    const mem=allProducts.find(p=>p.id===id);
    if(mem)Object.assign(mem,{name,brand,category,price_raw:price,techScore:score});
    toast('Product updated','s');closeModal();renderProductsPage();
  }catch(e){toast('Error: '+e.message,'e')}
}
// Delete a single image URL from a product (modal thumbnail × button)
async function deleteProductImage(id, url) {
  if (!confirm('Delete this image?')) return;
  try {
    const p = allProducts.find(x => x.id === id);
    if (!p) { toast('Product not found', 'e'); return; }
    const imgs = (p.images || []).filter(u => u !== url);
    const updates = { images: imgs, updatedAt: serverTimestamp(), updatedBy: _currentAdminEmail || 'admin' };
    if (p.imageUrl === url) updates.imageUrl = imgs[0] || '';
    await pbUpdateDoc('products', id, updates);
    p.images = imgs;
    if (updates.imageUrl !== undefined) p.imageUrl = updates.imageUrl;
    logActivity('product_image_delete', `Image deleted: ${p.name || id}`, { productId: id, url });
    toast('Image deleted', 's');
    openProduct(id); // re-render modal
    renderProductsPage();
  } catch (e) { toast('Error: ' + e.message, 'e'); }
}

// Re-scrape a single product on demand (modal "🔄 Yeniden Scrape" button)
async function rescrapeProduct(id) {
  const p = allProducts.find(x => x.id === id);
  if (!p || !p.sourceUrl) { toast('No source URL', 'e'); return; }
  if (typeof checkProxy === 'function' && !(await checkProxy())) { toast('Start the proxy first (Scraper tab)', 'e'); return; }
  toast('🔄 Re-scraping…', 'i');
  try {
    const html = await proxyFetch(p.sourceUrl);
    if (!html) { toast('Page could not be loaded (404?)', 'e'); return; }
    const fresh = await scrapeProductDetail(html, p.sourceUrl, p.category);
    if (!fresh || !fresh.name || (fresh.specsCount || 0) === 0) {
      toast('Invalid scrape result', 'e'); return;
    }
    const changes = {};
    const fields = ['name','brand','price_raw','imageUrl','specsCount','variantGroup','specs','specSections','keySpecs','images','_originalSpecs','_originalSections','_originalKeySpecs','_originalName'];
    for (const f of fields) {
      if (fresh[f] !== undefined && JSON.stringify(fresh[f]) !== JSON.stringify(p[f])) changes[f] = fresh[f];
    }
    if (!Object.keys(changes).length) { toast('No fields changed', 'i'); return; }
    changes.updatedAt = serverTimestamp();
    changes.updatedBy = _currentAdminEmail || 'admin';
    await pbUpdateDoc('products', id, changes);
    Object.assign(p, changes);
    logActivity('product_rescrape', `Re-scraped: ${p.name}`, { productId: id, changedFields: Object.keys(changes) });
    toast(`✅ Updated (${Object.keys(changes).length - 2} fields)`, 's');
    openProduct(id);
    renderProductsPage();
  } catch (e) { toast('Scrape error: ' + e.message, 'e'); }
}

async function deleteProduct(id){if(!confirm('Delete this product?'))return;try{await pbDeleteDoc('products',id);logActivity('product_delete',`Product deleted: ${id}`);allProducts=allProducts.filter(p=>p.id!==id);totalProductCount--;loadPage();toast('Deleted','s')}catch(e){toast('Error: '+e.message,'e')}}

// ═══════════════════════════════════════
//  USERS
// ═══════════════════════════════════════
let allUsers=[],filteredUsers=[],userPage=1;const UPER=50;

async function loadUsers(){
  try{const [items]=await Promise.all([pbGetAll('users',{sort:'-created'}),loadQCoinConfig()]);allUsers=items.map(d=>({uid:d.id,...d.data()}));const prem=allUsers.filter(u=>u.isPremium).length;const active=allUsers.filter(u=>{const la=getUserLastActive(u);return la&&la>new Date(Date.now()-30*864e5)}).length;
  document.getElementById('usTotalCount').textContent=allUsers.length;document.getElementById('usPremiumCount').textContent=prem;document.getElementById('usFreeCount').textContent=allUsers.length-prem;document.getElementById('usActiveCount').textContent=active;document.getElementById('usersCount').textContent=allUsers.length;
  const countries=[...new Set(allUsers.map(u=>u.country).filter(Boolean))].sort();document.getElementById('userCountryFilter').innerHTML='<option value="">All Countries</option>'+countries.map(c=>`<option>${escHtml(c)}</option>`).join('');
  filterUsers();renderUserIntelligence()}catch(e){toast('Users error: '+String(e.message || e),'e')}
}

async function saveUsersDailyQCoin(){
  const input=document.getElementById('usersDailyQCoinInput');
  const nextValue=Math.max(0,safeNumber(input?.value,0));
  try{
    await syncPublicConfigValue('free_daily_ai_credit_limit',nextValue);
    await loadQCoinConfig();
    renderUsers();
    if(_activeUserModalUid)openUserDetail(_activeUserModalUid);
    logActivity('qcoin_daily_pool_update',`Daily Q Coin pool updated: ${nextValue}`,{dailyQCoinPool:nextValue});
    toast(`Daily pool saved as ${formatQCoinAmount(nextValue)} Q`,'s');
  }catch(e){toast('Error: '+e.message,'e')}
}

async function resetAllUserExtraQCoins(){
  if(!allUsers.length){toast('Load users first','w');return}
  if(!confirm('Reset extra Q Coin balances for all users?'))return;
  try{
    await Promise.all(allUsers.map(u=>pbUpdateDoc('users',u.uid,{bonusQCoins:0})));
    allUsers.forEach(u=>{u.bonusQCoins=0});
    renderUsers();
    if(_activeUserModalUid)openUserDetail(_activeUserModalUid);
    logActivity('qcoin_bulk_extra_reset',`All user extra Q Coin balances reset`,{userCount:allUsers.length});
    toast('All extra Q Coin balances reset','s');
  }catch(e){toast('Error: '+e.message,'e')}
}

function filterUsers(){
  const q=(document.getElementById('userSearchInput')?.value||'').toLowerCase();
  const tf=document.getElementById('userTypeFilter')?.value||'';
  const cf=document.getElementById('userCountryFilter')?.value||'';
  const sort=document.getElementById('userSortFilter')?.value||'newest';
  filteredUsers=allUsers.filter(u=>{if(q&&!u.displayName?.toLowerCase().includes(q)&&!u.email?.toLowerCase().includes(q))return false;if(tf==='premium'&&!u.isPremium)return false;if(tf==='free'&&u.isPremium)return false;if(cf&&u.country!==cf)return false;return true});
  filteredUsers.sort((a,b)=>{switch(sort){case'newest':return uDate(b)-uDate(a);case'oldest':return uDate(a)-uDate(b);case'name':return(a.displayName||'').localeCompare(b.displayName||'');default:return 0}});
  userPage=1;renderUsers();
}
function uDate(u){return u.createdAt?new Date(u.createdAt).getTime():0}

function renderUsers(){
  const list=document.getElementById('userList'),start=(userPage-1)*UPER,page=filteredUsers.slice(start,start+UPER);
  if(!page.length){list.innerHTML='<div class="placeholder">No users</div>';return}
  let h='<div class="user-hdr"><span></span><span>User</span><span>Country</span><span>Status</span><span>Joined</span></div>';
  h+=page.map(u=>{const av=userAvatarHtml(u);const j=formatDateLabel(u.createdAt||u.created||u.updated);const qSnapshot=getUserQCoinSnapshot(u);const qLabel=u.isPremium?'Premium Q':`${formatQCoinAmount(qSnapshot.remaining)} Q`;return`<div class="user-row" onclick="openUserDetail('${escJs(u.uid)}')"><div class="user-avatar">${av}</div><div><div class="user-name">${escHtml(u.displayName||'Anonymous')}</div><div class="user-email">${escHtml(u.email||'')}</div><div style="font-size:11px;color:var(--text2);margin-top:3px">Q Coin: <b style="color:var(--text1)">${escHtml(qLabel)}</b></div></div><span style="font-size:12px">${escHtml(u.country||'—')}</span><span>${premiumBadgeHtml(u)}</span><span style="font-size:11px;color:var(--text2)">${j}</span></div>`}).join('');
  list.innerHTML=h;
  const total=Math.ceil(filteredUsers.length/UPER),pe=document.getElementById('userPagination');
  if(total<=1){pe.innerHTML='';return}
  let ph=`<button class="pg-btn" ${userPage===1?'disabled':''} onclick="userPage--;renderUsers()">Prev</button>`;
  for(let i=Math.max(1,userPage-3);i<=Math.min(total,userPage+3);i++)ph+=`<button class="pg-btn${i===userPage?' active':''}" onclick="userPage=${i};renderUsers()">${i}</button>`;
  ph+=`<button class="pg-btn" ${userPage===total?'disabled':''} onclick="userPage++;renderUsers()">Next</button>`;pe.innerHTML=ph;
}

function openUserDetail(uid){
  const u=allUsers.find(x=>x.uid===uid);if(!u)return;
  _activeUserModalUid=uid;
  document.getElementById('userModalTitle').textContent=u.displayName||'User';
  const b=document.getElementById('userModalBody');
  const safeUid=escJs(uid);
  const j=parseDateValue(u.createdAt,u.created);
  const la=getUserLastActive(u);
  const jStr=j?j.toLocaleDateString('en-US',{day:'numeric',month:'long',year:'numeric'}):'—';
  const laStr=la?la.toLocaleDateString('en-US',{day:'numeric',month:'long',year:'numeric'}):'—';

  // Engagement analysis
  const daysSinceJoin=j?Math.floor((Date.now()-j.getTime())/864e5):0;
  const daysSinceActive=la?Math.floor((Date.now()-la.getTime())/864e5):999;
  const compCount=getUserComparisonCount(u);
  const favCount=u.favorites?.length||u.favoriteCount||0;
  const analysisCount=safeArray(u.analyzedProducts).length;
  const quizCount=safeArray(u.quizHistory).length;
  const searchCount=safeArray(u.searchHistory).length;
  const completeness=computeProfileCompleteness(u);
  const persona=classifyUserPersona(u);
  const topInterests=collectUserInterestScores(u).slice(0,5);
  const narrative=buildUserNarrative(u);
  const qSnapshot=getUserQCoinSnapshot(u);
  const aiProfile=normalizeAdminAiProfile(u.adminAiProfile);
  const premiumPlan=premiumPlanKey(u);
  const premiumInfo=premiumDetails(u);
  const currentQLabel=u.isPremium?'∞':formatQCoinAmount(qSnapshot.remaining);
  const totalQLabel=u.isPremium?'∞':formatQCoinAmount(qSnapshot.total);
  const usedQLabel=u.isPremium?'0':formatQCoinAmount(qSnapshot.used);
  const extraQLabel=u.isPremium?'∞':formatQCoinAmount(qSnapshot.extra);

  // Activity status
  let activityStatus,actColor;
  if(daysSinceActive<=1){activityStatus='Active';actColor='#22c55e'}
  else if(daysSinceActive<=7){activityStatus='Active this week';actColor='#f59e0b'}
  else if(daysSinceActive<=30){activityStatus='Active this month';actColor='#f97316'}
  else{activityStatus='Inactive';actColor='#ef4444'}

  // User type analysis
  let userType='New User';
  if(compCount>=20||analysisCount>=20)userType='Power User';
  else if(compCount>=5)userType='Active User';
  else if(daysSinceJoin>=7&&compCount===0)userType='Passive User';

  const engRate=daysSinceJoin>0?Math.min(100,Math.round(compCount/daysSinceJoin*100)):0;

  b.innerHTML=`
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px">
      <div class="user-avatar" style="width:56px;height:56px;font-size:20px">${userAvatarHtml(u)}</div>
      <div style="flex:1">
        <div style="font-size:16px;font-weight:700">${escHtml(u.displayName||'Anonymous')}</div>
        <div style="font-size:12px;color:var(--text2)">${escHtml(u.email||'')}</div>
        <div style="font-size:11px;color:${actColor};margin-top:2px">${activityStatus}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn btn-sm btn-ghost" onclick="openUserSupportChat('${safeUid}')" title="Open conversation with user" style="font-size:18px;padding:6px 10px">💬</button>
        <div>${premiumBadgeHtml(u,true)}</div>
      </div>
    </div>
    <div class="card" style="margin:0 0 16px;padding:16px;background:linear-gradient(135deg,rgba(124,58,237,.16),rgba(59,130,246,.10));border-color:rgba(124,58,237,.18)">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap">
        <div>
          <div style="font-size:11px;color:var(--text2);text-transform:uppercase;font-weight:700;margin-bottom:6px">AI Persona</div>
          <div style="font-size:22px;font-weight:800;letter-spacing:-.4px">${escHtml(persona)}</div>
          <div class="chart-note">${escHtml(narrative)}</div>
        </div>
        <div class="feature-pill-row">
            ${topInterests.length?topInterests.map(([label,value])=>`<span class="feature-pill">${escHtml(label)} · ${Math.round(value)}</span>`).join(''):'<span class="feature-pill ghost">No strong category signal yet</span>'}
        </div>
      </div>
    </div>
    <!-- Tab Navigation -->
    <div style="display:flex;gap:0;border-bottom:2px solid var(--border);margin-bottom:16px">
      <button class="user-tab active" data-tab="overview" onclick="switchUserTab(this,'${safeUid}')">📊 Overview</button>
      <button class="user-tab" data-tab="behavior" onclick="switchUserTab(this,'${safeUid}')">🎯 Behavior</button>
      <button class="user-tab" data-tab="quizzes" onclick="switchUserTab(this,'${safeUid}')">🧠 Quiz</button>
      <button class="user-tab" data-tab="analysis" onclick="switchUserTab(this,'${safeUid}')">🤖 AI Analysis</button>
      <button class="user-tab" data-tab="profile" onclick="switchUserTab(this,'${safeUid}')">👤 Profile</button>
    </div>
    <!-- Overview Tab -->
    <div class="user-tab-panel active" data-panel="overview">
      <div class="metric-grid-compact">
        <div class="metric-tile"><div class="metric-tile-value">${jStr}</div><div class="metric-tile-label">Join Date</div></div>
        <div class="metric-tile"><div class="metric-tile-value">${laStr}</div><div class="metric-tile-label">Last Activity</div></div>
        <div class="metric-tile"><div class="metric-tile-value">${completeness}%</div><div class="metric-tile-label">Profile Score</div></div>
        <div class="metric-tile"><div class="metric-tile-value">${engRate}%</div><div class="metric-tile-label">Engagement</div></div>
        <div class="metric-tile"><div class="metric-tile-value">${compCount}</div><div class="metric-tile-label">Comparisons</div></div>
        <div class="metric-tile"><div class="metric-tile-value">${analysisCount}</div><div class="metric-tile-label">AI Analyses</div></div>
        <div class="metric-tile"><div class="metric-tile-value">${quizCount}</div><div class="metric-tile-label">Quiz Sessions</div></div>
        <div class="metric-tile"><div class="metric-tile-value">${searchCount}</div><div class="metric-tile-label">Searches</div></div>
      </div>
      <div class="card" style="margin:0 0 16px;padding:14px">
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;font-weight:700;margin-bottom:10px">🪙 Q Coin Management</div>
        <div class="metric-grid-compact" style="margin-bottom:12px">
          <div class="metric-tile"><div class="metric-tile-value">${currentQLabel}</div><div class="metric-tile-label">Current Q</div></div>
          <div class="metric-tile"><div class="metric-tile-value">${totalQLabel}</div><div class="metric-tile-label">Daily Total</div></div>
          <div class="metric-tile"><div class="metric-tile-value">${usedQLabel}</div><div class="metric-tile-label">Used Today</div></div>
          <div class="metric-tile"><div class="metric-tile-value">${extraQLabel}</div><div class="metric-tile-label">Extra Q</div></div>
        </div>
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap">
          <div style="font-size:12px;color:var(--text2)">Global daily pool: <b>${formatQCoinAmount(_freeDailyAiCreditLimit)} Q</b>${u.isPremium?' · <span style="color:#f59e0b">Premium (unlimited)</span>':''}</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary btn-sm" onclick="showAddQCoinModal('${safeUid}')">Add Extra Q</button><button class="btn btn-ghost btn-sm" onclick="showResetQCoinModal('${safeUid}')">Reset Q Coin</button></div>
        </div>
      </div>
      <div class="card" style="margin:0 0 16px;padding:14px">
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;font-weight:700;margin-bottom:10px">⭐ Premium Management</div>
        <div class="form-grid" style="align-items:end;margin-bottom:12px">
          <div class="form-field">
            <label>Plan</label>
            <select class="input" id="userPremiumPlanSelect_${safeUid}">
              <option value="free" ${premiumPlan==='free'?'selected':''}>Free</option>
              <option value="monthly" ${premiumPlan==='monthly'?'selected':''}>Monthly</option>
              <option value="yearly" ${premiumPlan==='yearly'?'selected':''}>Yearly</option>
            </select>
          </div>
          <div class="form-field">
            <label>Current Status</label>
            <div class="metric-tile" style="padding:10px">
              <div style="font-size:12px"><span style="color:var(--text2)">Plan:</span> <b>${escHtml(premiumPlanLabel(premiumPlan))}</b></div>
              <div style="font-size:12px;margin-top:4px"><span style="color:var(--text2)">Start:</span> <b>${escHtml(formatIsoDate(premiumInfo.startedAt))}</b></div>
              <div style="font-size:12px;margin-top:4px"><span style="color:var(--text2)">End:</span> <b>${escHtml(formatIsoDate(premiumInfo.expiresAt))}</b></div>
            </div>
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-primary" onclick="saveUserPremiumPlan('${safeUid}')">Apply Plan</button>
          ${u.isPremium?`<button class="btn btn-ghost" onclick="saveUserPremiumPlan('${safeUid}','free')">Cancel Premium</button>`:''}
        </div>
      </div>
      ${renderAdminAiProfileCard(aiProfile,safeUid)}
      <div class="user-overview-grid">
        <div class="card" style="margin:0;padding:14px">
          <div style="font-size:10px;color:var(--text3);text-transform:uppercase;font-weight:700;margin-bottom:8px">📊 Behavior Distribution</div>
          <div class="chart-shell" style="height:260px"><canvas id="userBehaviorChartCanvas"></canvas></div>
          <div class="chart-note">Shows the balance between views, searches, comparisons, quiz, and AI usage.</div>
        </div>
        <div class="card" style="margin:0;padding:14px">
          <div style="font-size:10px;color:var(--text3);text-transform:uppercase;font-weight:700;margin-bottom:8px">🧲 Interest Map</div>
          <div class="chart-shell" style="height:260px"><canvas id="userInterestBreakdownChartCanvas"></canvas></div>
          <div class="chart-note">Dominant interests inferred from category, analysis, and quiz history.</div>
        </div>
      </div>
      <div class="card" style="margin:16px 0 16px;padding:14px">
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;font-weight:700;margin-bottom:8px">📊 User Analysis</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px">
          <div><span style="color:var(--text2)">User Type:</span> <b>${escHtml(userType)}</b></div>
          <div><span style="color:var(--text2)">Membership Age:</span> <b>${daysSinceJoin} days</b></div>
          <div><span style="color:var(--text2)">Engagement Rate:</span> <b>${engRate}%</b></div>
          <div><span style="color:var(--text2)">Favorites:</span> <b>${favCount}</b></div>
          ${u.deviceInfo?`<div><span style="color:var(--text2)">Device:</span> <b>${escHtml(u.deviceInfo)}</b></div>`:''}
          ${u.appVersion?`<div><span style="color:var(--text2)">App:</span> <b>v${escHtml(u.appVersion)}</b></div>`:''}
          ${u.platform?`<div><span style="color:var(--text2)">Platform:</span> <b>${escHtml(u.platform)}</b></div>`:''}
          ${u.language?`<div><span style="color:var(--text2)">Language:</span> <b>${escHtml(u.language)}</b></div>`:''}
        </div>
      </div>
      <div id="userSupportPreview_${safeUid}"><div class="card" style="margin:0 0 16px;padding:14px"><div style="font-size:10px;color:var(--text3);text-transform:uppercase;font-weight:700;margin-bottom:12px">💬 Contact Us History</div><div style="color:var(--text3);font-size:12px">Loading...</div></div></div>
      <div style="display:flex;gap:8px"><button class="btn btn-danger" onclick="deleteUser('${safeUid}')">Delete</button></div>
    </div>
    <!-- Behavior Tab -->
    <div class="user-tab-panel" data-panel="behavior" style="display:none">
      <div id="behaviorContent" style="text-align:center;padding:30px;color:var(--text3)">
        <div class="spinner"></div>
        <div style="margin-top:8px">Loading behavior data...</div>
      </div>
    </div>
    <!-- Quiz Tab -->
    <div class="user-tab-panel" data-panel="quizzes" style="display:none">
      <div id="quizContent" style="text-align:center;padding:30px;color:var(--text3)">
        <div class="spinner"></div>
        <div style="margin-top:8px">Loading quiz data...</div>
      </div>
    </div>
    <!-- Analysis Tab -->
    <div class="user-tab-panel" data-panel="analysis" style="display:none">
      <div id="analysisContent" style="text-align:center;padding:30px;color:var(--text3)">
        <div class="spinner"></div>
        <div style="margin-top:8px">Loading analysis history...</div>
      </div>
    </div>
    <!-- Profile Tab -->
    <div class="user-tab-panel" data-panel="profile" style="display:none">
      <div id="profileContent" style="text-align:center;padding:30px;color:var(--text3)">
        <div class="spinner"></div>
        <div style="margin-top:8px">Loading profile data...</div>
      </div>
    </div>`;
  document.getElementById('userModal').style.display='flex';
  setTimeout(()=>renderUserOverviewCharts(uid),0);
  setTimeout(()=>loadUserSupportPreview(uid),0);
}

function switchUserTab(btn, uid){
  // Deactivate all tabs and panels
  btn.parentElement.querySelectorAll('.user-tab').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
  const panel=btn.dataset.tab;
  const modal=btn.closest('.modal-body')||document.getElementById('userModalBody');
  modal.querySelectorAll('.user-tab-panel').forEach(p=>{
    p.style.display=p.dataset.panel===panel?'block':'none';
    if(p.dataset.panel===panel)p.classList.add('active');else p.classList.remove('active');
  });
  // Load data on first click
  if(panel==='behavior')loadUserBehavior(uid);
  if(panel==='quizzes')loadUserQuizzes(uid);
  if(panel==='analysis')loadUserAnalysis(uid);
  if(panel==='profile')loadUserProfile(uid);
}

async function loadUserBehavior(uid){
  const el=document.getElementById('behaviorContent');
  if(el.dataset.loaded)return;
  try{
    const u=allUsers.find(x=>x.uid===uid)||{};
    const [rvRes,compRes]=await Promise.all([
      pbGetList('recently_viewed',1,20,{filter:`userId="${uid}"`,sort:'-created'}),
      pbGetList('comparisons',1,20,{filter:`userId="${uid}"`,sort:'-created'})
    ]);
    const views=rvRes.items;
    const comps=compRes.items;
    const catInterests=collectUserInterestScores(u).slice(0,8).map(([cat,count])=>({cat,count}));
    const prefWeights=Object.entries(safeMap(u.quizPreferenceCounts)).map(([key,value])=>({pref:key.replace(/:/g,' → '),count:Number(value)||0})).sort((a,b)=>b.count-a.count).slice(0,10);
    const comparisonHistory=safeArray(u.comparisonHistory);

    let html=`<div class="form-grid" style="margin-bottom:16px">
      <div class="card" style="margin:0;padding:14px"><div style="font-size:10px;color:var(--text3);text-transform:uppercase;font-weight:700">Product Views</div><div style="font-size:20px;font-weight:700;margin-top:4px;color:#22c55e">${views.length}</div></div>
      <div class="card" style="margin:0;padding:14px"><div style="font-size:10px;color:var(--text3);text-transform:uppercase;font-weight:700">Comparisons</div><div style="font-size:20px;font-weight:700;margin-top:4px;color:#f59e0b">${Math.max(comps.length,comparisonHistory.length)}</div></div>
    </div>`;

    if(catInterests.length){
      html+=`<div class="card" style="margin:0 0 16px;padding:14px"><div style="font-size:10px;color:var(--text3);text-transform:uppercase;font-weight:700;margin-bottom:10px">🎯 Category Interests</div><div style="display:flex;flex-wrap:wrap;gap:6px">`;
      for(const ci of catInterests)html+=`<span style="background:var(--primary);color:#fff;padding:4px 10px;border-radius:12px;font-size:11px;font-weight:600">${escHtml(ci.cat)} (${ci.count})</span>`;
      html+=`</div></div>`;
    }

    if(prefWeights.length){
      const maxW=prefWeights[0]?.count||1;
      html+=`<div class="card" style="margin:0 0 16px;padding:14px"><div style="font-size:10px;color:var(--text3);text-transform:uppercase;font-weight:700;margin-bottom:10px">⚖️ Preference Weights</div>`;
      for(const pw of prefWeights){const pct=Math.round(pw.count/maxW*100);html+=`<div style="margin-bottom:6px"><div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px"><span>${escHtml(pw.pref)}</span><span style="color:var(--text3)">${pw.count}</span></div><div style="background:var(--bg3);border-radius:4px;height:6px"><div style="background:var(--primary);border-radius:4px;height:6px;width:${pct}%"></div></div></div>`;}
      html+=`</div>`;
    }

    if(views.length){
      html+=`<div class="card" style="margin:0 0 16px;padding:14px"><div style="font-size:10px;color:var(--text3);text-transform:uppercase;font-weight:700;margin-bottom:10px">👁️ Recently Viewed Products</div><div style="max-height:200px;overflow-y:auto">`;
      views.forEach(v=>{const date=v.created?new Date(v.created).toLocaleDateString('en-US'):'—';html+=`<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border);font-size:11px"><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(v.productId||v.productName||'—')}</span><span style="color:var(--text3);margin-left:8px;white-space:nowrap">${date}</span></div>`;});
      html+=`</div></div>`;
    }

    if(!catInterests.length&&!views.length&&!comps.length){
      html+=`<div style="text-align:center;padding:30px;color:var(--text3)"><div style="font-size:32px;margin-bottom:8px">📭</div><div>No behavior data yet</div></div>`;
    }

    el.innerHTML=html;
    el.dataset.loaded='1';
  }catch(e){
    el.innerHTML=`<div style="color:var(--red);padding:20px">Error: ${escHtml(e.message)}</div>`;
  }
}

async function loadUserQuizzes(uid){
  const el=document.getElementById('quizContent');
  if(el.dataset.loaded)return;
  try{
    const u=allUsers.find(x=>x.uid===uid)||{};
    const newQuizHistory=u.quizHistory||[];
    const answerHistory=safeArray(u.quizAnswerHistory).slice().sort((a,b)=>(String(b.timestamp||b.created||'')).localeCompare(String(a.timestamp||a.created||'')));
    const latestTrackedAnswers=safeArray(answerHistory[0]?.answeredQuestions);
    const onboardingEntries=buildUserOnboardingEntries(u,latestTrackedAnswers);

    if(!newQuizHistory.length&&!onboardingEntries.length&&!answerHistory.length){
      el.innerHTML=`<div style="text-align:center;padding:30px;color:var(--text3)"><div style="font-size:32px;margin-bottom:8px">🧠</div><div>No quiz data yet.</div></div>`;
      el.dataset.loaded='1';
      return;
    }

    newQuizHistory.sort((a,b)=>(b.timestamp||'').localeCompare(a.timestamp||''));
    const scores=newQuizHistory.map(q=>Number(q.score)||0).filter(Boolean);
    const avgScore=scores.length?Math.round(scores.reduce((sum,value)=>sum+value,0)/scores.length):0;
    let html='';

    if(onboardingEntries.length){
      html+=`<div class="card" style="margin:0 0 16px;padding:14px"><div style="font-size:10px;color:var(--text3);text-transform:uppercase;font-weight:700;margin-bottom:12px">🧠 Onboarding Quiz Summary</div>${renderUserSummaryGrid(onboardingEntries,'No onboarding answers saved yet.')}</div>`;
    }

    if(latestTrackedAnswers.length){
      html+=`<div class="card" style="margin:0 0 16px;padding:14px"><div style="font-size:10px;color:var(--text3);text-transform:uppercase;font-weight:700;margin-bottom:12px">📝 Latest Quiz Answers</div>${latestTrackedAnswers.map(answer=>`<div style="margin-bottom:6px;font-size:11px"><span style="color:var(--text2)">${escHtml(answer.question||answer.label||'Question')}</span><span style="color:var(--primary);font-weight:600;margin-left:6px">${escHtml(answer.answer||answer.selectedOption||answer.value||'—')}</span></div>`).join('')}</div>`;
    }

    if(newQuizHistory.length){
      html+=`<div class="metric-grid-compact"><div class="metric-tile"><div class="metric-tile-value">${newQuizHistory.length}</div><div class="metric-tile-label">Sessions</div></div><div class="metric-tile"><div class="metric-tile-value">${avgScore||'—'}</div><div class="metric-tile-label">Average Score</div></div><div class="metric-tile"><div class="metric-tile-value">${safeArray(newQuizHistory.filter(q=>q.mode==='compare')).length}</div><div class="metric-tile-label">Compare Quizzes</div></div><div class="metric-tile"><div class="metric-tile-value">${safeArray(newQuizHistory.filter(q=>q.type==='subscription'||q.mode==='subscription')).length}</div><div class="metric-tile-label">Subscription Quizzes</div></div></div><div class="card" style="margin:0 0 16px;padding:14px"><div style="font-size:10px;color:var(--text3);text-transform:uppercase;font-weight:700;margin-bottom:8px">🧠 Quiz Distribution</div><div class="chart-shell" style="height:220px"><canvas id="userQuizTypeChartCanvas"></canvas></div></div>`;
    }

    for(const d of newQuizHistory){
      const date=d.timestamp?new Date(d.timestamp).toLocaleDateString('tr-TR',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
      const score=d.score?Math.round(d.score):'—';
      const scoreColor=score>=80?'#22c55e':score>=60?'#f59e0b':'#ef4444';
      const answers=d.answers||[];
      const questions=safeArray(d.questions);
      const mode=d.mode==='onboarding'?'Onboarding':d.mode==='compare'?'Compare':'Single';
      const status=d.status==='generated'?'Generated':d.status==='completed'?'Completed':'Saved';
      html+=`<div class="card" style="margin:0 0 12px;padding:14px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><div><div style="font-size:12px;font-weight:700">${escHtml(d.category||'Quiz Session')} <span style="font-size:10px;color:var(--text3);font-weight:400">${mode} · ${escHtml(status)}</span></div><div style="font-size:10px;color:var(--text3)">${date}</div></div><div style="background:${scoreColor}20;color:${scoreColor};padding:4px 10px;border-radius:8px;font-size:12px;font-weight:700">${score==='—'?'—':score+'%'}</div></div>`;
      if(d.productUrl)html+=`<div style="font-size:10px;color:var(--primary);margin-bottom:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(d.productUrl)}</div>`;
      if(d.productUrls&&d.productUrls.length)for(const url of d.productUrls)html+=`<div style="font-size:10px;color:var(--primary);margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(url)}</div>`;
      if(questions.length){
        html+=`<div style="border-top:1px solid var(--border);padding-top:8px;margin-top:4px">`;
        for(const q of questions)html+=`<div style="margin-bottom:7px;font-size:11px"><div style="color:var(--text2);font-weight:600">${escHtml(q.question||'—')}</div>${safeArray(q.options).length?`<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">${safeArray(q.options).map(opt=>`<span class="feature-pill ghost">${escHtml(opt)}</span>`).join('')}</div>`:''}</div>`;
        html+=`</div>`;
      }
      if(d.groupedAnswers&&Object.keys(safeMap(d.groupedAnswers)).length){
        html+=`<div style="border-top:1px solid var(--border);padding-top:8px;margin-top:4px">`;
        for(const [group,items] of Object.entries(safeMap(d.groupedAnswers))){
          html+=`<div style="font-size:10px;color:var(--text3);text-transform:uppercase;font-weight:700;margin:8px 0 4px">${escHtml(group.replace(/[_-]+/g,' '))}</div>`;
          for(const a of safeArray(items))html+=`<div style="margin-bottom:4px;font-size:11px"><span style="color:var(--text2)">${escHtml(a.question||'—')}</span><span style="color:var(--primary);font-weight:600;margin-left:6px">${escHtml(a.answer||a.selectedOption||'—')}</span></div>`;
        }
        html+=`</div>`;
      }
      if(answers.length){
        html+=`<div style="border-top:1px solid var(--border);padding-top:8px;margin-top:4px">`;
        for(const a of answers)html+=`<div style="margin-bottom:4px;font-size:11px"><span style="color:var(--text2)">${escHtml(a.question||'—')}</span><span style="color:var(--primary);font-weight:600;margin-left:6px">${escHtml(a.answer||a.selectedOption||'—')}</span></div>`;
        html+=`</div>`;
      }
      html+=`</div>`;
    }
    el.innerHTML=html;
    el.dataset.loaded='1';
    if(newQuizHistory.length)setTimeout(()=>renderUserQuizChart(newQuizHistory),0);
  }catch(e){
    el.innerHTML=`<div style="color:var(--red);padding:20px">Error: ${escHtml(e.message)}</div>`;
  }
}
function closeUserModal(){_activeUserModalUid='';document.getElementById('userModal').style.display='none'}

function formatUserFieldValue(value){
  if(value==null)return '';
  const text=String(value).trim();
  if(!text)return '';
  return text.replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim();
}

function formatUserFieldList(values){
  return safeArray(values)
    .map(item=>formatUserFieldValue(item))
    .filter(item=>item&&item.toLowerCase()!=='none');
}

function buildUserOnboardingEntries(user,trackedAnswers=[]){
  const entries=[];
  const seenLabels=new Set();
  const pushValue=(label,value)=>{
    const text=formatUserFieldValue(value);
    if(text){
      entries.push({label,value:text});
      seenLabels.add(label.toLowerCase());
    }
  };
  const pushList=(label,values)=>{
    const items=formatUserFieldList(values);
    if(items.length){
      entries.push({label,value:items.join(', ')});
      seenLabels.add(label.toLowerCase());
    }
  };
  pushValue('Ecosystem',user.ecosystem);
  pushValue('Budget',user.budgetRange);
  pushValue('Age Range',user.ageRange);
  pushValue('Profession',user.profession);
  pushValue('Gender',user.gender);
  pushValue('Usage Intent',user.usageIntent);
  pushValue('Primary Category',user.primaryCategory);
  pushValue('Language',user.language);
  pushValue('Country',user.country);
  pushValue('Currency',user.currency);
  pushList('Interest Categories',user.interestCategories);
  pushList('Decision Priorities',user.priorities);
  pushList('Current Devices',user.currentDevices);
  pushList('Subscriptions',user.subscriptions);
  safeArray(trackedAnswers).forEach(answer=>{
    const label=formatUserFieldValue(answer.question||answer.label||answer.field);
    const value=formatUserFieldValue(answer.answer||answer.selectedOption||answer.value);
    if(!label||!value)return;
    if(seenLabels.has(label.toLowerCase()))return;
    entries.push({label,value});
    seenLabels.add(label.toLowerCase());
  });
  return entries;
}

function renderUserSummaryGrid(entries,emptyText='No data specified'){
  if(!entries.length)return `<div style="color:var(--text3);font-size:12px">${escHtml(emptyText)}</div>`;
  return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:12px">${entries.map(entry=>`<div><span style="color:var(--text2)">${escHtml(entry.label)}:</span> <b>${escHtml(entry.value)}</b></div>`).join('')}</div>`;
}

function renderUserSupportHistory(messages){
  const items=safeArray(messages).slice().sort((a,b)=>String(b.repliedAt||b.created||'').localeCompare(String(a.repliedAt||a.created||'')));
  if(!items.length){
    return `<div class="card" style="margin:0 0 16px;padding:14px"><div style="font-size:10px;color:var(--text3);text-transform:uppercase;font-weight:700;margin-bottom:12px">💬 Contact Us History</div><div style="color:var(--text3);font-size:12px">No Contact Us messages for this user.</div></div>`;
  }
  return `<div class="card" style="margin:0 0 16px;padding:14px"><div style="font-size:10px;color:var(--text3);text-transform:uppercase;font-weight:700;margin-bottom:12px">💬 Contact Us History</div>${items.map(item=>{
    const created=(item.created||item.repliedAt)?new Date(item.created||item.repliedAt).toLocaleString('en-US'):'—';
    const replied=item.repliedAt?new Date(item.repliedAt).toLocaleString('en-US'):'';
    const isAdminMessage=item.status==='admin_message';
    const status=isAdminMessage
      ? '<span class="badge" style="background:rgba(59,130,246,.15);color:#60a5fa">Admin message</span>'
      : item.status==='replied'
      ? '<span class="badge" style="background:rgba(34,197,94,.15);color:#22c55e">Replied</span>'
      : '<span class="badge" style="background:rgba(245,158,11,.15);color:#f59e0b">Open</span>';
    const messageBody=isAdminMessage?(item.message||''):(item.message||'');
    return `<div style="padding:12px 0;border-top:1px solid var(--border)"><div style="display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:8px"><div style="font-size:12px;color:var(--text2)">${created}</div>${status}</div>${isAdminMessage?`<div style="margin-top:2px;padding:10px;border-radius:10px;background:rgba(59,130,246,.08);border:1px solid rgba(59,130,246,.16)"><div style="font-size:10px;color:var(--text3);text-transform:uppercase;font-weight:700;margin-bottom:6px">Support message${replied?` · ${replied}`:''}</div><div style="font-size:12px;color:var(--text1);line-height:1.6;white-space:pre-wrap">${escHtml(messageBody)}</div></div>`:`<div style="font-size:12px;color:var(--text1);line-height:1.6;white-space:pre-wrap">${escHtml(messageBody)}</div>${item.adminReply?`<div style="margin-top:10px;padding:10px;border-radius:10px;background:rgba(124,58,237,.08);border:1px solid rgba(124,58,237,.16)"><div style="font-size:10px;color:var(--text3);text-transform:uppercase;font-weight:700;margin-bottom:6px">Admin reply${replied?` · ${replied}`:''}</div><div style="font-size:12px;color:var(--text1);line-height:1.6;white-space:pre-wrap">${escHtml(item.adminReply)}</div></div>`:''}`}</div>`;
  }).join('')}</div>`;
}

async function loadUserSupportPreview(uid){
  const el=document.getElementById(`userSupportPreview_${uid}`);
  if(!el)return;
  try{
    const supportRes=await pbGetList('support_messages',1,5,{filter:`userId="${uid}"`,sort:'-created'});
    el.innerHTML=renderUserSupportHistory(safeArray(supportRes.items));
  }catch(e){
    el.innerHTML=`<div class="card" style="margin:0 0 16px;padding:14px"><div style="font-size:10px;color:var(--text3);text-transform:uppercase;font-weight:700;margin-bottom:12px">💬 Contact Us History</div><div style="color:var(--red);font-size:12px">History could not be loaded: ${escHtml(e.message||String(e))}</div></div>`;
  }
}

async function sendUserSupportMessage(uid){
  const u=allUsers.find(x=>x.uid===uid);
  if(!u){toast('User not found','e');return}
  const textarea=document.getElementById(`userSupportMessage_${uid}`);
  const button=document.getElementById(`userSupportSendBtn_${uid}`);
  const text=(textarea?.value||'').trim();
  if(!text){toast('Message cannot be empty','w');return}

  const email=String(u.email||u.googleEmail||'').trim().toLowerCase();
  if(!email){toast('This user has no registered email','e');return}

  const displayName=String(u.displayName||u.name||email.split('@')[0]||'User').trim();
  if(button){button.disabled=true;button.textContent='Sending...';}

  try{
    const supportRecord=await pbAddDoc('support_messages',{
      userId:uid,
      displayName,
      email,
      message:text,
      status:'admin_message',
      adminReply:'',
      repliedAt:new Date().toISOString(),
    });
    await getPb().collection('notifications').create({
      recipientId:uid,
      senderId:'admin',
      senderName:'Qor AI Support',
      type:'transactional',
      title:'New message from Qor AI Support',
      body:text,
      referenceId:supportRecord.id,
      read:false,
    });
    if(textarea)textarea.value='';
    const profileEl=document.getElementById('profileContent');
    if(profileEl)profileEl.dataset.loaded='';
    await loadUserSupportPreview(uid);
    await loadUserProfile(uid);
    toast('Message sent to user','s');
  }catch(e){
    toast('Message could not be sent: '+(e.message||e),'e');
  }finally{
    if(button){button.disabled=false;button.textContent='Send Message';}
  }
}

async function loadUserAnalysis(uid){
  const el=document.getElementById('analysisContent');
  if(el.dataset.loaded)return;
  try{
    const u=allUsers.find(x=>x.uid===uid)||{};
    const analyzedProducts=safeArray(u.analyzedProducts);
    const aiProfileHtml=renderAdminAiProfileCard(u.adminAiProfile,uid);

    if(!analyzedProducts.length){
      el.innerHTML=`${aiProfileHtml}<div style="text-align:center;padding:30px;color:var(--text3)"><div style="font-size:32px;margin-bottom:8px">🤖</div><div>No in-app AI analysis yet.</div></div>`;
      el.dataset.loaded='1';
      return;
    }

    // Sort by timestamp descending
    analyzedProducts.sort((a,b)=>(b.timestamp||'').localeCompare(a.timestamp||''));
    const scores=analyzedProducts.map(item=>Number(item.score)||0).filter(Boolean);
    const avgScore=scores.length?Math.round(scores.reduce((sum,value)=>sum+value,0)/scores.length):0;

    let html=`${aiProfileHtml}<div class="metric-grid-compact"><div class="metric-tile"><div class="metric-tile-value">${analyzedProducts.length}</div><div class="metric-tile-label">Analyses</div></div><div class="metric-tile"><div class="metric-tile-value">${avgScore||'—'}</div><div class="metric-tile-label">Avg Match</div></div><div class="metric-tile"><div class="metric-tile-value">${safeArray(analyzedProducts.filter(item=>item.mode==='compare')).length}</div><div class="metric-tile-label">Compare AI</div></div><div class="metric-tile"><div class="metric-tile-value">${safeArray(analyzedProducts.filter(item=>item.mode==='subscription')).length}</div><div class="metric-tile-label">Subs AI</div></div></div><div class="card" style="margin:0 0 16px;padding:14px"><div style="font-size:10px;color:var(--text3);text-transform:uppercase;font-weight:700;margin-bottom:8px">🤖 Analysis Categories</div><div class="chart-shell" style="height:220px"><canvas id="userAnalysisCategoryChartCanvas"></canvas></div></div>`;

    for(const p of analyzedProducts){
      const date=p.timestamp?new Date(p.timestamp).toLocaleDateString('en-US',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
      const score=p.score?Math.round(p.score):'—';
      const scoreColor=score>=80?'#22c55e':score>=60?'#f59e0b':'#ef4444';
      const mode=p.mode==='compare'?'Compare':'Single Analysis';

      html+=`<div class="card" style="margin:0 0 12px;padding:14px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <div style="flex:1">
            <div style="font-size:12px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(p.title||'Unknown Product')}</div>
            <div style="font-size:10px;color:var(--text3)">${date} · ${mode}</div>
          </div>
          <div style="background:${scoreColor}20;color:${scoreColor};padding:4px 10px;border-radius:8px;font-size:12px;font-weight:700">${score}%</div>
        </div>
        ${p.category?`<span style="background:var(--bg3);padding:2px 8px;border-radius:8px;font-size:10px">${escHtml(p.category)}</span>`:''}
        ${p.url?`<div style="font-size:10px;color:var(--primary);margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(p.url)}</div>`:''}
        ${p.verdict?`<div style="font-size:11px;color:var(--text2);margin-top:6px;line-height:1.4">${escHtml(p.verdict.substring(0,150))}${p.verdict.length>150?'...':''}</div>`:''}
      </div>`;
    }

    el.innerHTML=html;
    el.dataset.loaded='1';
    setTimeout(()=>renderUserAnalysisChart(analyzedProducts),0);
  }catch(e){
    el.innerHTML=`<div style="color:var(--red);padding:20px">Error: ${escHtml(e.message)}</div>`;
  }
}

async function loadUserProfile(uid){
  const el=document.getElementById('profileContent');
  if(el.dataset.loaded)return;
  try{
    const u=allUsers.find(x=>x.uid===uid);
    if(!u){el.innerHTML='User not found';return;}
    const safeUid=escJs(uid);
    const supportRes=await pbGetList('support_messages',1,50,{filter:`userId="${uid}"`,sort:'-created'});
    const supportMessages=safeArray(supportRes.items);
    const answerHistory=safeArray(u.quizAnswerHistory).slice().sort((a,b)=>(String(b.timestamp||b.created||'')).localeCompare(String(a.timestamp||a.created||'')));
    const latestTrackedAnswers=safeArray(answerHistory[0]?.answeredQuestions);
    const onboardingEntries=buildUserOnboardingEntries(u,latestTrackedAnswers);

    let html=`<div class="card" style="margin:0 0 16px;padding:14px">
      <div style="font-size:10px;color:var(--text3);text-transform:uppercase;font-weight:700;margin-bottom:12px">👤 Profile Summary</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:12px">
        <div><span style="color:var(--text2)">Ecosystem:</span> <b>${escHtml(u.ecosystem||'Not specified')}</b></div>
        <div><span style="color:var(--text2)">Budget:</span> <b>${escHtml(u.budgetRange||'Not specified')}</b></div>
        <div><span style="color:var(--text2)">Age Range:</span> <b>${escHtml(u.ageRange||'Not specified')}</b></div>
        <div><span style="color:var(--text2)">Profession:</span> <b>${escHtml(u.profession||'Not specified')}</b></div>
        <div><span style="color:var(--text2)">Gender:</span> <b>${escHtml(u.gender||'Not specified')}</b></div>
        <div><span style="color:var(--text2)">Language:</span> <b>${escHtml(u.language||'—')}</b></div>
        <div><span style="color:var(--text2)">Country:</span> <b>${escHtml(u.country||'—')}</b></div>
        <div><span style="color:var(--text2)">Usage:</span> <b>${escHtml(u.usageIntent||'Not specified')}</b></div>
      </div>
    </div>`;

    if(onboardingEntries.length){
      html+=`<div class="card" style="margin:0 0 16px;padding:14px"><div style="font-size:10px;color:var(--text3);text-transform:uppercase;font-weight:700;margin-bottom:12px">🧠 Onboarding Quiz Answers</div>${renderUserSummaryGrid(onboardingEntries,'Onboarding answers are not visible yet.')}</div>`;
    }

  html+=renderUserSupportHistory(supportMessages);
  // Contact shortcut
  html+=`<div class="card" style="margin:0 0 16px;padding:14px"><div style="display:flex;justify-content:space-between;align-items:center"><div><div style="font-size:10px;color:var(--text3);text-transform:uppercase;font-weight:700;margin-bottom:4px">💬 Contact Us Conversation</div><div style="font-size:12px;color:var(--text2)">${supportMessages.length > 0 ? supportMessages.length + ' conversation records' : 'No conversation yet'}</div></div><button class="btn btn-primary" onclick="openUserSupportChat('${safeUid}')">💬 Open Chat</button></div></div>`;

    // Priorities
    const priorities=u.priorities||[];
    if(priorities.length){
      html+=`<div class="card" style="margin:0 0 16px;padding:14px">
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;font-weight:700;margin-bottom:10px">🎯 Priorities</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">`;
      for(const p of priorities){
        html+=`<span style="background:var(--primary);color:#fff;padding:4px 10px;border-radius:12px;font-size:11px;font-weight:600">${escHtml(p)}</span>`;
      }
      html+=`</div></div>`;
    }

    // Current Devices
    const devices=u.currentDevices||[];
    if(devices.length){
      html+=`<div class="card" style="margin:0 0 16px;padding:14px">
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;font-weight:700;margin-bottom:10px">📱 Current Devices</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">`;
      for(const d of devices){
        html+=`<span style="background:var(--bg3);padding:4px 10px;border-radius:12px;font-size:11px">${escHtml(d)}</span>`;
      }
      html+=`</div></div>`;
    }

    // Interest Categories
    const interests=u.interestCategories||[];
    if(interests.length){
      html+=`<div class="card" style="margin:0 0 16px;padding:14px">
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;font-weight:700;margin-bottom:10px">📂 Interest Categories</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">`;
      for(const c of interests){
        html+=`<span style="background:#8b5cf620;color:#8b5cf6;padding:4px 10px;border-radius:12px;font-size:11px;font-weight:600">${escHtml(c)}</span>`;
      }
      html+=`</div></div>`;
    }

    // Subscriptions
    const subs=u.subscriptions||[];
    if(subs.length){
      html+=`<div class="card" style="margin:0 0 16px;padding:14px">
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;font-weight:700;margin-bottom:10px">🔔 Subscriptions</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">`;
      for(const s of subs){
        html+=`<span style="background:var(--bg3);padding:4px 10px;border-radius:12px;font-size:11px">${escHtml(s)}</span>`;
      }
      html+=`</div></div>`;
    }

    const profileVectorEntries=Object.entries(safeMap(u.profileVector)).sort((a,b)=>Number(b[1]||0)-Number(a[1]||0)).slice(0,8);
    if(profileVectorEntries.length){
      html+=`<div class="card" style="margin:0 0 16px;padding:14px">
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;font-weight:700;margin-bottom:10px">📈 Profile Vector</div>
        <div class="rank-bar-list">${profileVectorEntries.map(([key,value])=>`<div class="rank-bar-item"><div class="rank-bar-label">${escHtml(key)}</div><div class="rank-bar-track"><div class="rank-bar-fill" style="width:${Math.max(8,Math.round(Number(value)*100))}%"></div></div><div class="rank-bar-value">${Number(value).toFixed(2)}</div></div>`).join('')}</div>
      </div>`;
    }

    el.innerHTML=html;
    el.dataset.loaded='1';
  }catch(e){
    el.innerHTML=`<div style="color:var(--red);padding:20px">Error: ${escHtml(e.message)}</div>`;
  }
}
async function saveUserPremiumPlan(uid,forcedPlan){
  const u=allUsers.find(x=>x.uid===uid);if(!u)return;
  const select=document.getElementById(`userPremiumPlanSelect_${uid}`);
  const plan=(forcedPlan||select?.value||'free').toLowerCase();
  const payload=buildPremiumPayload(u,plan);
  try{
    await pbUpdateDoc('users',uid,payload);
    u.isPremium=payload.isPremium;
    u.userSubscriptionDetails=payload.userSubscriptionDetails;
    logActivity(payload.isPremium?'user_premium_enable':'user_premium_disable',`Premium plan updated: ${uid}`,{userId:uid,plan});
    openUserDetail(uid);renderUsers();toast(plan==='free'?'Premium canceled':`Premium plan updated to ${premiumPlanLabel(plan)}`,'s');
  }catch(e){toast('Error: '+e.message,'e')}
}
async function togglePremium(uid,v){return saveUserPremiumPlan(uid,v?'yearly':'free')}
async function addQCoinsToUser(uid){
  const u=allUsers.find(x=>x.uid===uid);if(!u)return;
  const raw=prompt('Extra Q amount to add','5');
  if(raw==null)return;
  const amount=safeNumber(String(raw).replace(',','.'));
  if(amount<=0){toast('Invalid Q amount','w');return}
  const snapshot=getUserQCoinSnapshot(u);
  const nextBonus=snapshot.extra+amount;
  try{
    await pbUpdateDoc('users',uid,{bonusQCoins:nextBonus,dailyAiCreditsDate:u.dailyAiCreditsDate||qCoinPeriodKey()});
    u.bonusQCoins=nextBonus;
    u.dailyAiCreditsDate=u.dailyAiCreditsDate||qCoinPeriodKey();
    logActivity('user_qcoin_add',`Extra Q added: ${uid}`,{userId:uid,amount});
    openUserDetail(uid);renderUsers();toast(`${formatQCoinAmount(amount)} Q added`,'s');
  }catch(e){toast('Error: '+e.message,'e')}
}

async function resetUserQCoins(uid){
  const u=allUsers.find(x=>x.uid===uid);if(!u)return;
  const snapshot=getUserQCoinSnapshot(u);
  if(!confirm(`Reset this user's Q Coin balance to 0?\nCurrent balance: ${formatQCoinAmount(snapshot.remaining)} Q`))return;
  const todayKey=qCoinPeriodKey();
  try{
    await pbUpdateDoc('users',uid,{bonusQCoins:0,dailyAiCreditsUsed:snapshot.total,dailyAiCreditsDate:todayKey});
    u.bonusQCoins=0;
    u.dailyAiCreditsUsed=snapshot.total;
    u.dailyAiCreditsDate=todayKey;
    logActivity('user_qcoin_reset',`Q Coin reset: ${uid}`,{userId:uid});
    openUserDetail(uid);renderUsers();toast('Q Coin balance reset','s');
  }catch(e){toast('Error: '+e.message,'e')}
}

// Custom modal wrappers for Q Coin actions.
function showAddQCoinModal(uid){
  const u=allUsers.find(x=>x.uid===uid);if(!u)return;
  const snapshot=getUserQCoinSnapshot(u);
  // Remove any previous instance.
  document.getElementById('_qcoinAddModal')?.remove();
  const overlay=document.createElement('div');
  overlay.id='_qcoinAddModal';
  overlay.style.cssText='position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:16px';
  overlay.innerHTML=`<div style="background:var(--surface-1,#1a1a1a);border:1px solid var(--border,#333);border-radius:16px;padding:24px;min-width:300px;max-width:420px;width:100%">
    <div style="font-size:16px;font-weight:700;color:var(--text);margin-bottom:16px">🪙 Add Extra Q</div>
    <div style="font-size:13px;color:var(--text2);margin-bottom:12px">User: <b>${escHtml(u.displayName||u.email||uid)}</b><br>Current Extra Q: <b>${formatQCoinAmount(snapshot.extra)}</b></div>
    <input id="_qcoinAddInput" type="number" min="0.5" step="0.5" value="5" style="width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--border,#444);background:var(--surface-2,#111);color:var(--text);font-size:15px;margin-bottom:16px">
    <div style="display:flex;gap:10px;justify-content:flex-end">
      <button class="btn btn-ghost" onclick="document.getElementById('_qcoinAddModal')?.remove()">Cancel</button>
      <button class="btn btn-primary" onclick="_confirmAddQCoins('${escJs(uid)}')">Add</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.remove()});
  setTimeout(()=>document.getElementById('_qcoinAddInput')?.focus(),50);
}

async function _confirmAddQCoins(uid){
  const raw=(document.getElementById('_qcoinAddInput')?.value||'').replace(',','.');
  const amount=safeNumber(raw);
  document.getElementById('_qcoinAddModal')?.remove();
  if(amount<=0){toast('Invalid Q amount','w');return}
  await addQCoinsToUser_internal(uid,amount);
}

async function addQCoinsToUser_internal(uid,amount){
  const u=allUsers.find(x=>x.uid===uid);if(!u)return;
  const snapshot=getUserQCoinSnapshot(u);
  const nextBonus=snapshot.extra+amount;
  try{
    await pbUpdateDoc('users',uid,{bonusQCoins:nextBonus,dailyAiCreditsDate:u.dailyAiCreditsDate||qCoinPeriodKey()});
    u.bonusQCoins=nextBonus;
    u.dailyAiCreditsDate=u.dailyAiCreditsDate||qCoinPeriodKey();
    logActivity('user_qcoin_add',`Extra Q added: ${uid}`,{userId:uid,amount});
    openUserDetail(uid);renderUsers();toast(`${formatQCoinAmount(amount)} Q added`,'s');
  }catch(e){toast('Error: '+e.message,'e')}
}

function showResetQCoinModal(uid){
  const u=allUsers.find(x=>x.uid===uid);if(!u)return;
  const snapshot=getUserQCoinSnapshot(u);
  document.getElementById('_qcoinResetModal')?.remove();
  const overlay=document.createElement('div');
  overlay.id='_qcoinResetModal';
  overlay.style.cssText='position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:16px';
  overlay.innerHTML=`<div style="background:var(--surface-1,#1a1a1a);border:1px solid var(--border,#333);border-radius:16px;padding:24px;min-width:300px;max-width:420px;width:100%">
    <div style="font-size:16px;font-weight:700;color:var(--text);margin-bottom:16px">⚠️ Reset Q Coin</div>
    <div style="font-size:13px;color:var(--text2);margin-bottom:20px">User: <b>${escHtml(u.displayName||u.email||uid)}</b><br>This cannot be undone. Current balance: <b style="color:var(--amber,#f59e0b)">${formatQCoinAmount(snapshot.remaining)} Q</b></div>
    <div style="display:flex;gap:10px;justify-content:flex-end">
      <button class="btn btn-ghost" onclick="document.getElementById('_qcoinResetModal')?.remove()">Cancel</button>
      <button class="btn" style="background:#ef4444;color:#fff" onclick="_confirmResetQCoins('${escJs(uid)}')">Reset</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.remove()});
}

async function _confirmResetQCoins(uid){
  document.getElementById('_qcoinResetModal')?.remove();
  await resetUserQCoins_internal(uid);
}

async function resetUserQCoins_internal(uid){
  const u=allUsers.find(x=>x.uid===uid);if(!u)return;
  const snapshot=getUserQCoinSnapshot(u);
  const todayKey=qCoinPeriodKey();
  try{
    await pbUpdateDoc('users',uid,{bonusQCoins:0,dailyAiCreditsUsed:snapshot.total,dailyAiCreditsDate:todayKey});
    u.bonusQCoins=0;
    u.dailyAiCreditsUsed=snapshot.total;
    u.dailyAiCreditsDate=todayKey;
    logActivity('user_qcoin_reset',`Q Coin reset: ${uid}`,{userId:uid});
    openUserDetail(uid);renderUsers();toast('Q Coin balance reset','s');
  }catch(e){toast('Error: '+e.message,'e')}
}

async function deleteUser(uid){
  if(!confirm('Delete this user? This will permanently remove their account.'))return;
  try{
    await pbDeleteDoc('users',uid);
    allUsers=allUsers.filter(u=>u.uid!==uid);closeUserModal();filterUsers();toast('User deleted','s');
    logActivity('user_delete',`User deleted: ${uid}`);
  }catch(e){toast('Error: '+e.message,'e')}
}

// ═══════════════════════════════════════
//  ALGORITHM
// ═══════════════════════════════════════
function updateAlgoLabel(input){const id=input.id.replace(/^(weight|boost)/,'label');const el=document.getElementById(id);if(el)el.textContent=input.value+'%';updateAlgorithmHealth()}

function updateAlgorithmHealth(){
  const weightSum=ALGORITHM_WEIGHT_FIELDS.reduce((sum,id)=>sum+(parseInt(document.getElementById(id)?.value||'0',10)||0),0);
  const behaviorSum=ALGORITHM_BEHAVIOR_FIELDS.reduce((sum,id)=>sum+(parseInt(document.getElementById(id)?.value||'0',10)||0),0);
  const disabledCount=(_disabledCategories||[]).length;
  const cacheHours=parseInt(document.getElementById('cacheDuration')?.value||'0',10)||0;
  const setText=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=value};
  setText('algoWeightSum',`${weightSum}%`);
  setText('algoBehaviorSum',`${behaviorSum}%`);
  setText('algoDisabledCategories',String(disabledCount));
  setText('algoCacheHours',`${cacheHours}h`);
  const note=document.getElementById('algorithmHealthNote');
  if(note){
    if(weightSum!==100)note.textContent=`Weight sum is ${weightSum}%. Recommendation models stay easier to reason about when this total is 100%.`;
    else if(disabledCount>10)note.textContent=`${disabledCount} categories are disabled. Home feed breadth may shrink noticeably.`;
    else note.textContent='Configuration looks balanced. Discovery, conversion and cache controls are within healthy limits.';
  }
}

function normalizeAlgorithmWeights(){
  const values=ALGORITHM_WEIGHT_FIELDS.map(id=>parseInt(document.getElementById(id)?.value||'0',10)||0);
  const sum=values.reduce((acc,value)=>acc+value,0)||1;
  let normalized=values.map(value=>Math.round(value/sum*100));
  const drift=100-normalized.reduce((acc,value)=>acc+value,0);
  normalized[0]=(normalized[0]||0)+drift;
  ALGORITHM_WEIGHT_FIELDS.forEach((id,index)=>{const el=document.getElementById(id);if(el){el.value=normalized[index];updateAlgoLabel(el)}});
  updateAlgorithmHealth();
}

function applyAlgorithmPreset(name){
  const presets={
    balanced:{weightPersonalFit:40,weightExpert:25,weightCommunity:20,weightPricePerf:15,boostCategoryView:12,boostSearch:8,boostQuiz:15,boostCompare:10,boostEcosystem:18,boostBudget:15},
    discovery:{weightPersonalFit:32,weightExpert:20,weightCommunity:28,weightPricePerf:20,boostCategoryView:18,boostSearch:15,boostQuiz:11,boostCompare:8,boostEcosystem:12,boostBudget:10},
    conversion:{weightPersonalFit:48,weightExpert:22,weightCommunity:12,weightPricePerf:18,boostCategoryView:10,boostSearch:9,boostQuiz:18,boostCompare:16,boostEcosystem:20,boostBudget:17},
  };
  const preset=presets[name]||presets.balanced;
  Object.entries(preset).forEach(([id,value])=>{const el=document.getElementById(id);if(el){el.value=value;updateAlgoLabel(el)}});
  updateAlgorithmHealth();
}

async function loadAlgorithmConfig(){try{const d=await pbGetDoc('public_config','algorithm');if(!d.exists){updateAlgorithmHealth();return;}const c=d.data();['weightPersonalFit','weightExpert','weightCommunity','weightPricePerf','boostCategoryView','boostSearch','boostQuiz','boostCompare','boostEcosystem','boostBudget','minYear','maxPerBrand','trendingCount','newArrivalsCount','productsPerCategory','cacheDuration'].forEach(f=>{const el=document.getElementById(f);if(el&&c[f]!==undefined){el.value=c[f];updateAlgoLabel(el)}});if(c.brandBlacklist!==undefined)document.getElementById('brandBlacklist').value=c.brandBlacklist||'';if(c.brandBoost!==undefined)document.getElementById('brandBoost').value=c.brandBoost||'';loadPinnedProducts(c.pinnedProducts||[]);loadHiddenProducts(c.hiddenProducts||[]);loadCategoryToggles(c.disabledCategories||[]);updateAlgorithmHealth()}catch(e){console.error(e);updateAlgorithmHealth()}}

async function saveAlgorithmConfig(){
  const c={};['weightPersonalFit','weightExpert','weightCommunity','weightPricePerf','boostCategoryView','boostSearch','boostQuiz','boostCompare','boostEcosystem','boostBudget','minYear','maxPerBrand','trendingCount','newArrivalsCount','productsPerCategory','cacheDuration'].forEach(f=>{const el=document.getElementById(f);if(el)c[f]=parseInt(el.value)||0});
  c.brandBlacklist=document.getElementById('brandBlacklist').value;c.brandBoost=document.getElementById('brandBoost').value;
  c.pinnedProducts=_pinnedProducts||[];c.hiddenProducts=_hiddenProducts||[];c.disabledCategories=_disabledCategories||[];
  c.updatedAt=serverTimestamp();
  try{await pbSetDoc('public_config','algorithm',c);updateAlgorithmHealth();toast('Saved','s');logActivity('algorithm_update','Algorithm config updated')}catch(e){toast('Error: '+e.message,'e')}
}

// ═══════════════════════════════════════
//  FEED MANAGEMENT
// ═══════════════════════════════════════

let _pinnedProducts = [];
let _hiddenProducts = [];
let _disabledCategories = [];

const ALL_CATEGORIES = [
  'smartphones','laptops','tablets','headphones','smartwatches','gpus','monitors',
  'keyboards','mice','cameras','speakers','tvs','gamepads','desktops','consoles',
  'earphones','drones','printers','routers','webcams','action-cameras','soundbars',
  'microphones','projectors','robot-vacuums','smart-rings','vr-headsets','dashcams',
  'cpus','motherboards','ram','ssd','psu','cases','coolers','e-readers','gimbals',
  'tripods','lenses','media-players'
];

function loadPinnedProducts(list) {
  _pinnedProducts = list || [];
  renderPinnedProducts();
}

function renderPinnedProducts() {
  const el = document.getElementById('pinnedProductsList');
  if (!el) return;
  if (_pinnedProducts.length === 0) { el.innerHTML = '<span class="text-muted">No pinned products</span>'; return; }
  el.innerHTML = _pinnedProducts.map(id =>
    `<span class="tag tag-green" style="cursor:pointer" onclick="removePinnedProduct('${escJs(id)}')">${escHtml(id)} ✕</span>`
  ).join('');
}

function addPinnedProduct() {
  const input = document.getElementById('pinnedProductId');
  const id = (input.value || '').trim().toLowerCase();
  if (!id) return;
  if (_pinnedProducts.includes(id)) { toast('Already pinned', 'w'); return; }
  if (_pinnedProducts.length >= 10) { toast('Max 10 pinned products', 'w'); return; }
  _pinnedProducts.push(id);
  input.value = '';
  renderPinnedProducts();
  toast('Pinned: ' + id, 's');
}

function removePinnedProduct(id) {
  _pinnedProducts = _pinnedProducts.filter(p => p !== id);
  renderPinnedProducts();
}

function loadHiddenProducts(list) {
  _hiddenProducts = list || [];
  renderHiddenProducts();
}

function renderHiddenProducts() {
  const el = document.getElementById('hiddenProductsList');
  if (!el) return;
  if (_hiddenProducts.length === 0) { el.innerHTML = '<span class="text-muted">No hidden products</span>'; return; }
  el.innerHTML = _hiddenProducts.map(id =>
    `<span class="tag tag-red" style="cursor:pointer" onclick="removeHiddenProduct('${escJs(id)}')">${escHtml(id)} ✕</span>`
  ).join('');
}

function addHiddenProduct() {
  const input = document.getElementById('hiddenProductId');
  const id = (input.value || '').trim().toLowerCase();
  if (!id) return;
  if (_hiddenProducts.includes(id)) { toast('Already hidden', 'w'); return; }
  _hiddenProducts.push(id);
  input.value = '';
  renderHiddenProducts();
  toast('Hidden: ' + id, 's');
}

function removeHiddenProduct(id) {
  _hiddenProducts = _hiddenProducts.filter(p => p !== id);
  renderHiddenProducts();
}

function loadCategoryToggles(disabledList) {
  _disabledCategories = disabledList || [];
  const el = document.getElementById('categoryToggles');
  if (!el) return;
  el.innerHTML = ALL_CATEGORIES.map(cat => {
    const checked = !_disabledCategories.includes(cat);
    return `<label style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:4px 0">
      <input type="checkbox" ${checked ? 'checked' : ''} onchange="toggleCategory('${escJs(cat)}', this.checked)">
      <span style="font-size:13px">${escHtml(cat)}</span>
    </label>`;
  }).join('');
}

function toggleCategory(cat, enabled) {
  if (enabled) {
    _disabledCategories = _disabledCategories.filter(c => c !== cat);
  } else {
    if (!_disabledCategories.includes(cat)) _disabledCategories.push(cat);
  }
  updateAlgorithmHealth();
}

function selectAllCategories() {
  _disabledCategories = [];
  loadCategoryToggles([]);
  updateAlgorithmHealth();
}

function deselectAllCategories() {
  _disabledCategories = [...ALL_CATEGORIES];
  loadCategoryToggles([...ALL_CATEGORIES]);
  updateAlgorithmHealth();
}

async function previewFeedStats() {
  const el = document.getElementById('feedStatsPreview');
  if (!el) return;
  el.innerHTML = '<div class="spinner" style="margin:8px auto"></div>';
  try {
    const counts = {};
    let total = 0;
    for (const cat of ALL_CATEGORIES) {
      const cnt = await pbCountWhere('products', `category="${cat}"`);
      counts[cat] = cnt;
      total += cnt;
    }
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const empty = sorted.filter(([, c]) => c === 0).map(([n]) => escHtml(n));
    el.innerHTML = `
      <div style="background:var(--card-bg);border:1px solid var(--border);border-radius:8px;padding:12px;font-size:13px">
        <strong>📊 Feed Statistics</strong><br>
        <span>Total products: <b>${total.toLocaleString()}</b></span><br>
        <span>Categories with products: <b>${sorted.filter(([,c])=>c>0).length}</b> / ${ALL_CATEGORIES.length}</span><br>
        ${empty.length > 0 ? `<span style="color:var(--red)">Empty categories: ${empty.join(', ')}</span><br>` : ''}
        <div style="margin-top:8px;max-height:200px;overflow-y:auto">
          ${sorted.filter(([,c])=>c>0).map(([n,c]) =>
            `<div style="display:flex;justify-content:space-between;padding:2px 0;border-bottom:1px solid var(--border)">
              <span>${escHtml(n)}</span><span><b>${c}</b></span>
            </div>`
          ).join('')}
        </div>
      </div>`;
  } catch (e) {
    el.innerHTML = `<span style="color:var(--red)">Error: ${escHtml(e.message)}</span>`;
  }
}

async function clearAllUserCaches() {
  if (!confirm('This will force all users to reload their home feed on next app open. Continue?')) return;
  try {
    // Bump the cache version in public_config so the app knows to refresh
    await pbSetDoc('public_config','algorithm',{
      cacheVersion: Date.now(),
      updatedAt: serverTimestamp()
    });
    toast('Cache invalidated — users will see fresh feed on next open', 's');
    logActivity('cache_clear', 'Cleared all user feed caches');
  } catch (e) {
    toast('Error: ' + e.message, 'e');
  }
}

// ═══════════════════════════════════════
//  ACTIVITY LOG
// ═══════════════════════════════════════
async function logActivity(action,detail,meta={}){
  try{
    await pbAddDoc('admin_logs',{
      action,detail,...meta,
      admin:_currentAdminEmail||'unknown',
      timestamp:serverTimestamp()
    });
  }catch(e){console.warn('Log error:',e)}
}

function bucketActivityAction(action){
  const value=String(action||'').toLowerCase();
  if(value.includes('product'))return 'product';
  if(value.includes('user'))return 'user';
  if(value.includes('algorithm')||value.includes('cache'))return 'algorithm';
  if(value.includes('scrape')||value.includes('import')||value.includes('export'))return 'scraper';
  return 'system';
}

function renderActivityLog(){
  const el=document.getElementById('activityLogList');
  if(!el)return;
  const query=(document.getElementById('activitySearchInput')?.value||'').trim().toLowerCase();
  const type=(document.getElementById('activityTypeFilter')?.value||'').trim();
  const logs=(allActivityLogs||[]).filter(log=>{
    if(type&&log.bucket!==type)return false;
    if(query&&!`${log.detail||''} ${log.action||''} ${log.admin||''}`.toLowerCase().includes(query))return false;
    return true;
  });

  const total=(allActivityLogs||[]).length;
  const today=(allActivityLogs||[]).filter(log=>{
    const dt=parseDateValue(log.timestamp,log.created);
    if(!dt)return false;
    return dt>new Date(Date.now()-864e5);
  }).length;
  const admins=new Set((allActivityLogs||[]).map(log=>log.admin).filter(Boolean)).size;
  const actionCounts={};
  (allActivityLogs||[]).forEach(log=>{const label=String(log.action||'system');actionCounts[label]=(actionCounts[label]||0)+1});
  const topAction=Object.entries(actionCounts).sort((a,b)=>b[1]-a[1])[0];
  const setText=(id,value)=>{const node=document.getElementById(id);if(node)node.textContent=value};
  setText('activityTotal',String(total));
  setText('activityToday',String(today));
  setText('activityAdmins',String(admins));
  setText('activityTopAction',topAction?topAction[0]:'—');

  const groupedByBucket={};
  (allActivityLogs||[]).forEach(log=>{groupedByBucket[log.bucket]=(groupedByBucket[log.bucket]||0)+1});
  const bucketEntries=Object.entries(groupedByBucket);
  mountChart('activityActionChart',document.getElementById('activityActionChart'),{
    type:'doughnut',
    data:{labels:bucketEntries.map(([label])=>label),datasets:[{data:bucketEntries.map(([,value])=>value),backgroundColor:chartPalette(),borderWidth:0}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:chartTextColor()}}}}
  });

  if(!logs.length){el.innerHTML='<div class="audit-empty">No records match this filter. Activity Log keeps the audit trail for product, user, algorithm, import/export, scraper, and system changes.</div>';return}
  const actionIcons={product_edit:'✏️',product_delete:'🗑️',product_add:'➕',user_delete:'👤',user_premium_enable:'⭐',user_premium_disable:'⭐',bulk_category:'📂',bulk_brand:'🏷️',export:'📤',import:'📥',algorithm_update:'🧠',cache_clear:'🧹'};
  el.innerHTML=logs.map(l=>{
    const ts=formatDateTimeLabel(l.timestamp||l.created);
    const icon=actionIcons[l.action]||'📋';
    return`<div class="log-row"><span class="log-icon">${icon}</span><div class="log-info"><div class="log-detail">${escHtml(l.detail||l.action)}</div><div class="log-meta">${escHtml(l.admin||'system')} · ${ts} · ${escHtml(l.bucket)}</div></div></div>`;
  }).join('');
}

async function loadActivityLog(){
  const el=document.getElementById('activityLogList');
  if(!el)return;
  el.innerHTML='<div class="placeholder"><div class="spinner" style="margin:0 auto 8px"></div>Loading...</div>';
  try{
    const result=await pbGetList('admin_logs',1,150,{sort:'-timestamp'});
    allActivityLogs=result.items.map(item=>({...item,bucket:bucketActivityAction(item.action)}));
    renderActivityLog();
  }catch(e){allActivityLogs=[];resetChart('activityActionChart');el.innerHTML='<div class="audit-empty">The activity log collection cannot be read right now. This screen is the admin audit center; check the collection rules or permissions.</div>'}
}

// ═══════════════════════════════════════
//  EXPORT / IMPORT
// ═══════════════════════════════════════
async function exportProductsJSON(){
  toast('JSON export is starting...','i');
  try{
    let all=[];let page=1;
    while(true){
      const result=await getPb().collection('products').getList(page,1000,{sort:'id'});
      all.push(...result.items);
      if(page>=result.totalPages)break;
      page++;
    }
    const blob=new Blob([JSON.stringify(all,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download=`qorai-products-${new Date().toISOString().split('T')[0]}.json`;
    a.click();URL.revokeObjectURL(url);
    logActivity('export',`JSON export: ${all.length} products`);
    toast(`${all.length} products exported as JSON`,'s');
  }catch(e){toast('Export error: '+e.message,'e')}
}

async function exportProductsCSV(){
  toast('CSV export is starting...','i');
  try{
    let all=[];let page=1;
    while(true){
      const result=await getPb().collection('products').getList(page,1000,{sort:'id'});
      all.push(...result.items);
      if(page>=result.totalPages)break;
      page++;
    }
    const fields=['id','name','brand','category','techScore','price_raw','specsCount','scrapedAt','sourceUrl','imageUrl'];
    const header=fields.join(',');
    const rows=all.map(p=>fields.map(f=>{const v=p[f]??'';return typeof v==='string'&&(v.includes(',')||v.includes('"'))?`"${v.replace(/"/g,'""')}"`:v}).join(','));
    const csv=header+'\n'+rows.join('\n');
    const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download=`qorai-products-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();URL.revokeObjectURL(url);
    logActivity('export',`CSV export: ${all.length} products`);
    toast(`${all.length} products exported as CSV`,'s');
  }catch(e){toast('Export error: '+e.message,'e')}
}

async function importProducts(){
  const input=document.createElement('input');input.type='file';input.accept='.json';
  input.onchange=async(e)=>{
    const file=e.target.files[0];if(!file)return;
    try{
      const text=await file.text();
      const products=JSON.parse(text);
      if(!Array.isArray(products)){toast('Invalid JSON format','e');return}
      if(!confirm(`${products.length} products will be imported. Continue?`))return;
      toast('Import is starting...','i');
      let added=0,failed=0;
      // Write in parallel chunks of 50
      for(let i=0;i<products.length;i+=50){
        const chunk=products.slice(i,i+50);
        await Promise.all(chunk.map(async p=>{
          if(!p.id||!p.name){failed++;return}
          const clean={...p};
          delete clean._originalName;delete clean._originalSpecs;
          delete clean._originalSections;delete clean._originalKeySpecs;
          await pbSetDoc('products',p.id,clean);
          added++;
        }));
      }
      logActivity('import',`JSON import: ${added} products added/updated, ${failed} failed`);
      toast(`Import complete: ${added} products`,'s');
      loadProducts();
    }catch(e){toast('Import error: '+e.message,'e')}
  };
  input.click();
}

// ═══════════════════════════════════════
//  BULK OPERATIONS
// ═══════════════════════════════════════
async function bulkChangeCategory(){
  if(!selectedIds.size){toast('Select products first','w');return}
  const cats=(typeof QorAiCategories!=='undefined'&&QorAiCategories.getAll)?QorAiCategories.getAll():[];
  const catHtml=cats.map(c=>`<option value="${escHtml(c.id)}">${escHtml(c.name)}</option>`).join('');
  const modal=document.createElement('div');
  modal.className='modal-backdrop';modal.style.display='flex';
  modal.innerHTML=`<div class="modal-box" style="max-width:400px"><div class="modal-head"><h2>Change Category</h2><button class="modal-x" onclick="this.closest('.modal-backdrop').remove()">✕</button></div><div class="modal-body"><p style="margin-bottom:12px">Choose a new category for ${selectedIds.size} products:</p><select class="input" id="bulkCatSelect">${catHtml}</select><div style="display:flex;gap:8px;margin-top:16px"><button class="btn btn-primary" id="bulkCatConfirm">Apply</button><button class="btn btn-ghost" onclick="this.closest('.modal-backdrop').remove()">Cancel</button></div></div></div>`;
  document.body.appendChild(modal);
  document.getElementById('bulkCatConfirm').onclick=async()=>{
    const newCat=document.getElementById('bulkCatSelect').value;
    if(!newCat)return;
    try{
      await Promise.all([...selectedIds].map(id=>pbUpdateDoc('products',id,{category:newCat,updatedAt:serverTimestamp()})));
      allProducts.forEach(p=>{if(selectedIds.has(p.id))p.category=newCat});
      logActivity('bulk_category',`${selectedIds.size} product categories changed to "${newCat}"`);
      toast(`${selectedIds.size} products updated`,'s');
      modal.remove();deselectAll();renderProductsPage();
    }catch(e){toast('Error: '+String(e.message || e),'e')}
  };
}

async function bulkChangeBrand(){
  if(!selectedIds.size){toast('Select products first','w');return}
  const brands=(typeof QorAiBrands!=='undefined')?QorAiBrands:[];
  const brandHtml=brands.map(b=>`<option>${escHtml(b)}</option>`).join('');
  const modal=document.createElement('div');
  modal.className='modal-backdrop';modal.style.display='flex';
  modal.innerHTML=`<div class="modal-box" style="max-width:400px"><div class="modal-head"><h2>Change Brand</h2><button class="modal-x" onclick="this.closest('.modal-backdrop').remove()">✕</button></div><div class="modal-body"><p style="margin-bottom:12px">Choose a new brand for ${selectedIds.size} products:</p><select class="input" id="bulkBrandSelect">${brandHtml}</select><div style="display:flex;gap:8px;margin-top:16px"><button class="btn btn-primary" id="bulkBrandConfirm">Apply</button><button class="btn btn-ghost" onclick="this.closest('.modal-backdrop').remove()">Cancel</button></div></div></div>`;
  document.body.appendChild(modal);
  document.getElementById('bulkBrandConfirm').onclick=async()=>{
    const newBrand=document.getElementById('bulkBrandSelect').value;
    if(!newBrand)return;
    try{
      await Promise.all([...selectedIds].map(id=>pbUpdateDoc('products',id,{brand:newBrand,updatedAt:serverTimestamp()})));
      allProducts.forEach(p=>{if(selectedIds.has(p.id))p.brand=newBrand});
      logActivity('bulk_brand',`${selectedIds.size} product brands changed to "${newBrand}"`);
      toast(`${selectedIds.size} products updated`,'s');
      modal.remove();deselectAll();renderProductsPage();
    }catch(e){toast('Error: '+e.message,'e')}
  };
}

// ═══════════════════════════════════════
//  BROKEN IMAGE DETECTION
// ═══════════════════════════════════════
async function scanBrokenImages(){
  toast('Broken image scan is starting...','i');
  const el=document.getElementById('brokenImageResults');
  if(el)el.innerHTML='<div class="placeholder"><div class="spinner" style="margin:0 auto 8px"></div>Scanning...</div>';
  try{
    const products=allProducts.length?allProducts:[];
    if(!products.length){toast('Open the Products page first','w');return}
    const broken=[];
    let checked=0;
    for(const p of products.slice(0,200)){
      const img=p.imageUrl||p.images?.[0];
      if(!img)continue;
      checked++;
      try{
        const res=await fetch(img,{method:'HEAD',mode:'no-cors',signal:AbortSignal.timeout(5000)});
      }catch{
        broken.push(p);
      }
    }
    if(el){
      if(!broken.length){
        el.innerHTML=`<div class="placeholder" style="color:var(--green)">✅ ${checked} images checked, no issues</div>`;
      }else{
        el.innerHTML=`<div style="margin-bottom:8px;color:var(--amber)">⚠️ ${broken.length}/${checked} broken images found:</div>`+
          broken.map(p=>`<div class="log-row"><span class="log-icon">🖼️</span><div class="log-info"><div class="log-detail">${escHtml(p.name||p.id)}</div><div class="log-meta">${escHtml(p.category||'')} · ${escHtml(p.brand||'')}</div></div></div>`).join('');
      }
    }
    toast(`Scan complete: ${broken.length} broken images`,'i');
  }catch(e){toast('Error: '+e.message,'e')}
}

// ═══════════════════════════════════════
//  PRICE HISTORY (simple view)
// ═══════════════════════════════════════
async function loadPriceHistory(productId){
  // Price history subcollections not available in PocketBase
  return null;
}

// ═══════════════════════════════════════
//  REMOTE CONFIG (Settings)
// ═══════════════════════════════════════

const RC_KEYS = [
  { id: 'rc_show_paywall_on_start',            key: 'show_paywall_on_start',            type: 'bool',   def: false },
  { id: 'rc_feature_link_paste_enabled',       key: 'feature_link_paste_enabled',       type: 'bool',   def: true  },
  { id: 'rc_ai_comparison_limit_free',         key: 'ai_comparison_limit_free',         type: 'int',    def: 3     },
  { id: 'rc_free_daily_ai_credit_limit',       key: 'free_daily_ai_credit_limit',       type: 'int',    def: 10    },
  { id: 'rc_free_ai_question_limit',           key: 'free_ai_question_limit',           type: 'int',    def: 15    },
  { id: 'rc_free_link_paste_limit',            key: 'free_link_paste_limit',            type: 'int',    def: 3     },
  { id: 'rc_free_subscription_analysis_limit',key: 'free_subscription_analysis_limit', type: 'int',    def: 2     },
  { id: 'rc_premium_price_display',           key: 'premium_price_display',            type: 'string', def: '₺199.99 / year' },
  { id: 'rc_gemini_api_key',                  key: 'gemini_api_key',                   type: 'string', def: '' },
  { id: 'rc_deepseek_api_key',                key: 'deepseek_api_key',                 type: 'string', def: '' },
  { id: 'rc_typesense_host',                  key: 'typesense_host',                   type: 'string', def: '' },
  { id: 'rc_typesense_api_key',               key: 'typesense_api_key',                type: 'string', def: '' },
  { id: 'rc_scraper_frequency',               key: 'scraper_frequency',                type: 'string', def: 'manual' },
  { id: 'rc_scraper_max_products',            key: 'scraper_max_products',             type: 'int',    def: 200 },
  { id: 'rc_scraper_channels',                key: 'scraper_channels',                 type: 'int',    def: 3 },
  { id: 'rc_scraper_auto_map_categories',     key: 'scraper_auto_map_categories',      type: 'bool',   def: true },
  { id: 'rc_maintenance_mode',                key: 'maintenance_mode',                 type: 'bool',   def: false },
  { id: 'rc_admin_readonly',                  key: 'admin_readonly',                   type: 'bool',   def: false },
  { id: 'rc_maintenance_message',             key: 'maintenance_message',              type: 'string', def: '' },
];

const AI_PROMPT_DEFS = [
  {key:'gemini_chat_system',group:'Qor AI Chat',title:'Qor AI Chat System Prompt',desc:'Main chat behavior that understands page/product context and uses web plus database context.',def:`You are Qor AI, a premium product advisor inside the Qor mobile app. Treat Authoritative Page Context and Qor Live Product Context as the live app state and strongest source. If a product appears in page context or database matches, treat it as a real current Qor catalog item; do not claim it has not launched or does not exist based on older knowledge. Use current web research for release timing, availability, reviews, prices, and market news. Answer in the user's language, be concise, specific, and practical. Identify the open screen/product from route/page context when asked. Never invent specs, prices, or availability. Never mention backend providers, model names, API names, or internal tooling; if asked what powers you, answer as Qor AI. Address the person directly as you/sen/siz, not as "the user" or "kullanıcı".`},
  {key:'deepseek_chat_system',group:'Qor AI Chat',title:'Qor AI Chat Helper System Prompt',desc:'System prompt for text-only chat behavior.',def:`You are Qor AI, a concise product advisor. Use the user profile, language, country, priorities, current app context, and Qor Live Product Context. If database/page context contains a product, treat it as current app data and do not contradict it with older knowledge. Give direct, helpful answers with concrete product reasoning. Never mention backend providers, model names, API names, or internal tooling. Address the person directly as you/sen/siz, not as "the user" or "kullanıcı".`},
  {key:'qor_ai_chat_guardrails',group:'Qor AI Chat',title:'Negative Prompt / Scope Rules',desc:'Live guardrail prompt that limits AI responses for harmful, out-of-scope, or non-product requests.',def:`## SCOPE AND NEGATIVE PROMPT RULES
- Qor AI is a shopping and product advisor. Help with products, subscriptions, buying decisions, comparisons, specs, compatibility, prices, availability, reviews, and product-related research.
- If the user asks for something unrelated to products or shopping, politely decline in one short sentence and redirect them to a product-related question.
- Do not answer unrelated requests such as general homework, coding tasks, legal/medical/financial advice, politics, personal data extraction, or creative writing unless the request is directly connected to choosing, comparing, using, or buying a product.
- Never provide harmful, illegal, unsafe, hateful, sexual, or privacy-invasive instructions. Redirect to safe product guidance when possible.
- Keep refusals brief; do not lecture. Offer a product-focused alternative.
- Never reveal or name backend model providers, internal model names, API vendors, prompt keys, or implementation details. If asked what powers you, answer as Qor AI.
- Speak directly to the person using "you" in English and "sen" or "siz" in Turkish; avoid phrases like "the user" or "kullanıcı" when addressing them.`},
  {key:'gemini_link_research',group:'Link Analysis',title:'Link Research Prompt',desc:'Web research when URL/ASIN/ISBN or metadata is missing.',def:`Research the provided product URL using current web results. Identify the exact product, matched URL, product title, identifier match, price if visible, and short evidence. Prefer official/store result and identifier confirmation. Return compact evidence that can be parsed by the app. Never mention backend providers or internal tools.`},
  {key:'deepseek_link_analysis_system',group:'Link Analysis',title:'Link Analysis Prompt',desc:'Main prompt that extracts product metadata, category, score, and short analysis from a link.',def:`You are Qor AI's product link analysis engine. Analyze the URL and supplied metadata against the person's profile. Return only valid JSON with title, image_url, price, site_name, score, analysis, category, and is_product. Be strict: if it is not a purchasable product, mark is_product false. Write analysis in the user's language and make it specific to the product and profile. Never mention backend providers or internal tools.`},
  {key:'gemini_link_analysis_system',group:'Link Analysis',title:'Qor AI Link Analysis Prompt',desc:'Web-supported link analysis prompt.',def:`You are Qor AI's web-grounded link analysis engine. Use URL metadata and research evidence to identify the exact product, category, price hints, compatibility score, and personalized analysis. Return only valid JSON. Do not fabricate data; use uncertainty when evidence is weak. Never mention backend providers or internal tools.`},
  {key:'gemini_quiz_single_system',group:'Link Quiz',title:'Single Link Quiz Prompt',desc:'Personal quiz generated for single-product link analysis.',def:`Generate a complex personalized product quiz for one product. Ask 6-8 high-signal questions that reveal usage intent, performance expectations, lifestyle constraints, owned-device context, risk tolerance, and must-have features. Each question must have exactly 4 options. Never ask generic brand or budget-only questions. Return only valid JSON with questions.`},
  {key:'gemini_quiz_compare_system',group:'Link Quiz',title:'Comparison Quiz Prompt',desc:'Quiz prompt for comparing multiple links/products.',def:`Generate a complex comparison quiz for multiple products. Ask 6-8 questions that expose decision criteria, trade-off tolerance, usage scenarios, feature priorities, ecosystem constraints, and upgrade intent. Each question must have exactly 4 options. The questions must help choose between the listed products. Return only valid JSON with questions.`},
  {key:'deepseek_quiz_generation_system',group:'Link Quiz',title:'Qor AI Link Quiz Prompt',desc:'Link quiz generation.',def:`You are Qor AI's quiz generation engine. Generate a personalized product quiz for the given category, product title, and URL. Ask practical, category-specific questions with exactly 4 options each. Return valid JSON only.`},
  {key:'gemini_enhanced_link_research',group:'Product Deep Analysis',title:'Product Review Research Prompt',desc:'Review/forum/expert research phase after link analysis.',def:`Research the product using current web knowledge. Find user reviews, Reddit/forum opinions, expert reviews, common pros/cons, known issues, and current pricing signals. Keep it concise, factual, and product-specific.`},
  {key:'gemini_enhanced_link_analysis_system',group:'Product Deep Analysis',title:'Enhanced Link Deep Analysis Prompt',desc:'Advanced compatibility analysis with quiz, profile, and web research.',def:`You are Qor AI's enhanced product compatibility analyst. Combine base product analysis, quiz answers, user profile, and web research. Return only valid JSON with enhancedScore, factors, verdict, prosForUser, consForUser, and alternatives. Be specific, personalized, and honest about trade-offs.`},
  {key:'deepseek_enhanced_link_analysis_system',group:'Product Deep Analysis',title:'Qor AI Enhanced Link Analysis Prompt',desc:'Advanced product link analysis.',def:`You are Qor AI's detailed product compatibility analyst. Use product metadata, quiz answers, and user profile to produce a personalized compatibility report. Return only valid JSON with score, factors, verdict, pros, cons, and alternatives. Avoid generic statements.`},
  {key:'gemini_subscription_research',group:'Subscription Analysis',title:'Subscription Research Prompt',desc:'Reddit/forum/review research for subscription services.',def:`Research each listed subscription service individually. Identify category, recent community opinions, Trustpilot/forum sentiment, key features, strengths, limitations, and recent updates. Do not include pricing or billing details. Output a labeled per-service summary.`},
  {key:'gemini_subscription_analysis',group:'Subscription Analysis',title:'Subscription Analysis Prompt',desc:'JSON prompt for subscription compatibility scores and recommendations.',def:`You are Qor AI's subscription intelligence analyst. Analyze the listed subscription services using user profile, quiz answers, and research data. Return only valid JSON matching the app schema. All text must be in the selected language. Never mention price, cost, monthly fees, yearly fees, discounts, or billing.`},
  {key:'deepseek_subscription_quiz_system',group:'Subscription Analysis',title:'Subscription Quiz Prompt',desc:'Short personal quiz before subscription analysis.',def:`You are Qor AI's subscription quiz engine. Generate 4-5 personalized questions to understand service usage habits, content preferences, lifestyle expectations, and feature priorities. Never ask about budget. Return valid JSON only.`},
  {key:'product_review_analysis',group:'Product Detail Premium',title:'Product Review Prompt',desc:'User reviews and community sentiment analysis on product detail.',def:`You are a senior technology product analyst. Analyze public user reviews, forums, professional review sites, YouTube long-term reviews, and community feedback for the product. Return only valid JSON with summary, satisfaction, praised, and criticized. Be specific, cite real-world observations, and write in the selected language.`},
  {key:'product_deep_analysis',group:'Product Detail Premium',title:'Product Deep Analysis Prompt',desc:'Single-product technical strengths, weaknesses, and verdict analysis.',def:`You are a senior tech product analyst. Analyze the exact product and return only valid JSON with overallScore, strengths, weaknesses, pros, cons, and verdict. Use concrete technical/category evidence, realistic varied scores, and language matching the selected app language.`},
  {key:'product_smart_alternatives',group:'Product Detail Premium',title:'Smart Alternatives Prompt',desc:'Realistic alternative products for a single product.',def:`Return only valid JSON with exactly 5 realistic alternative products. Each alternative must include full product name, advantage, tradeoff, priceComparison, bestFor, and whyBetter. Use concrete differences such as performance, battery, camera, software, build quality, or price band.`},
  {key:'product_buying_advisor',group:'Product Detail Premium',title:'Buying Advisor Prompt',desc:'Who should buy, who should avoid, and purchase advice.',def:`Return only valid JSON with whoShouldBuy, whoShouldAvoid, reasonsToBuy, reasonsToSkip, proTips, valueRating, and ratingExplanation. Be specific, honest, and product-focused. Write all user-facing text in the selected app language.`},
  {key:'product_price_prediction',group:'Product Detail Premium',title:'Price Prediction Prompt',desc:'Price trend and buy/wait decision for a single product.',def:`Predict price trend for the specific product using current year, category replacement cycles, price tier, release timing, brand cadence, and visible product context. Return only valid JSON with trend, trendPercentage, bestTimeToBuy, expectedDrop, buyOrWait, and reasoning.`},
  {key:'product_match_score',group:'Product Detail Premium',title:'Personal Match Prompt',desc:'Product match score using profile, quiz, and signal weights.',def:`Perform a detailed user-product compatibility analysis. Score the product 40-100 for this specific user profile. Return only valid JSON with matchScore, reason, topMatchFactors, and missingFactors. Use profile signals, quizSignals, product specs, techScore, price, country/currency, and behavioral signals. Be specific and honest.`},
  {key:'compare_deep_analysis',group:'Compare Premium',title:'Compare Deep Analysis Prompt',desc:'Detailed AI analysis on the comparison screen.',def:`Compare all listed products as a senior tech analyst. Return only valid JSON with winner, products, categories, verdict, and recommendation. Include every product in every section. Use concrete specs and avoid invented gaps.`},
  {key:'compare_smart_alternatives',group:'Compare Premium',title:'Compare Smart Alternatives Prompt',desc:'Alternative suggestions close to the compared products.',def:`Suggest 3-5 realistic alternatives compatible with the same buying intent, segment, and category. Return only valid JSON. Explain concrete trade-offs, price band, and where each alternative beats the compared set.`},
  {key:'compare_buying_advisor',group:'Compare Premium',title:'Compare Buying Advisor Prompt',desc:'Personal purchase advice for a comparison.',def:`Act as a personal tech shopping advisor. Return only valid JSON with recommended product, best_for, match_points, caution_points, per_product, and final_verdict. Address the user directly and tie advice to concrete product context.`},
  {key:'compare_price_prediction',group:'Compare Premium',title:'Compare Price Prediction Prompt',desc:'Price trend prediction for compared products.',def:`Predict price trends for all listed products using release cadence, segment competition, historical depreciation, specs, and availability uncertainty. Return only valid JSON with one item per product. Differentiate similar products only when evidence supports it.`},
];

let _aiPromptConfig = {};

function _promptEditorId(key){return 'prompt_editor_'+key.replace(/[^a-zA-Z0-9_]/g,'_')}

function _populatePromptGroupFilter(){
  const sel=document.getElementById('promptGroupFilter');
  if(!sel||sel.dataset.ready==='1')return;
  const groups=[...new Set(AI_PROMPT_DEFS.map(def=>def.group))].sort();
  sel.innerHTML='<option value="">All Categories</option>'+groups.map(group=>`<option value="${escHtml(group)}">${escHtml(group)}</option>`).join('');
  sel.dataset.ready='1';
}

function renderAiPromptManager(){
  _populatePromptGroupFilter();
  const list=document.getElementById('aiPromptList');
  if(!list)return;
  list.innerHTML=AI_PROMPT_DEFS.map(def=>{
    const saved=String(_aiPromptConfig[def.key]||'');
    const value=saved||def.def;
    const dirty=!!saved;
    return `<div class="card prompt-editor-card" data-prompt-card="1" data-group="${escHtml(def.group)}" data-search="${escHtml((def.group+' '+def.title+' '+def.key+' '+def.desc).toLowerCase())}">
      <div class="prompt-editor-head">
        <div><div class="prompt-group">${escHtml(def.group)}</div><h3>${escHtml(def.title)}</h3><p>${escHtml(def.desc)}</p></div>
        <div class="prompt-editor-actions"><span class="badge ${dirty?'badge-green':'badge-muted'}">${dirty?'Server override':'Code default'}</span><button class="btn btn-sm btn-ghost" onclick="resetPromptEditorToDefault('${def.key}')">Default</button></div>
      </div>
      <div class="prompt-key">${escHtml(def.key)}</div>
      <textarea class="input prompt-textarea" id="${_promptEditorId(def.key)}" rows="10" data-key="${escHtml(def.key)}">${escHtml(value)}</textarea>
    </div>`;
  }).join('');
  filterAiPromptCards();
  const status=document.getElementById('aiPromptStatus');
  if(status){
    const overrideCount=Object.keys(_aiPromptConfig).filter(key=>String(_aiPromptConfig[key]||'').trim()).length;
    status.textContent=`${AI_PROMPT_DEFS.length} prompt entries listed · ${overrideCount} server overrides active`;
  }
}

function filterAiPromptCards(){
  const q=String(document.getElementById('promptSearchInput')?.value||'').trim().toLowerCase();
  const group=String(document.getElementById('promptGroupFilter')?.value||'').trim();
  document.querySelectorAll('[data-prompt-card="1"]').forEach(card=>{
    const matchesText=!q||String(card.dataset.search||'').includes(q);
    const matchesGroup=!group||card.dataset.group===group;
    card.style.display=matchesText&&matchesGroup?'':'none';
  });
}

async function loadAiPromptManager(){
  const list=document.getElementById('aiPromptList');
  if(list)list.innerHTML='<div class="placeholder">Loading prompts...</div>';
  try{
    const configMap=await getPublicConfigMap();
    _aiPromptConfig=safeMap(configMap.ai_prompts);
    renderAiPromptManager();
  }catch(e){
    if(list)list.innerHTML=`<div class="placeholder" style="color:var(--red)">Prompts could not be loaded: ${escHtml(e.message||e)}</div>`;
    toast('Prompts could not be loaded: '+(e.message||e),'e');
  }
}

function collectAiPromptEditors(){
  const prompts={};
  for(const def of AI_PROMPT_DEFS){
    const el=document.getElementById(_promptEditorId(def.key));
    if(!el)continue;
    const value=String(el.value||'').trim();
    if(value&&value!==String(def.def||'').trim())prompts[def.key]=value;
  }
  return prompts;
}

async function saveAiPromptManager(){
  try{
    const prompts=collectAiPromptEditors();
    await syncPublicConfigValue('ai_prompts',prompts);
    _aiPromptConfig=prompts;
    renderAiPromptManager();
    logActivity('ai_prompts_update',`AI prompts updated (${Object.keys(prompts).length} overrides)`);
    toast('AI prompts saved to server','s');
  }catch(e){
    toast('Prompt save error: '+(e.message||e),'e');
  }
}

function resetPromptEditorToDefault(key){
  const def=AI_PROMPT_DEFS.find(item=>item.key===key);
  const el=def?document.getElementById(_promptEditorId(key)):null;
  if(el&&def)el.value=def.def;
}

function resetAllPromptEditorsToDefaults(){
  AI_PROMPT_DEFS.forEach(def=>resetPromptEditorToDefault(def.key));
  toast('Code defaults loaded into editors. Save to write them to the server.','i');
}

async function loadRemoteConfig() {
  try {
    const configMap = await getPublicConfigMap();
    _freeDailyAiCreditLimit = Math.max(0, safeNumber(configMap.free_daily_ai_credit_limit, 10));
    for (const def of RC_KEYS) {
      const el = document.getElementById(def.id);
      if (!el) continue;
      const val = configMap[def.key] !== undefined ? configMap[def.key] : def.def;
      el.value = String(val);
    }
  } catch(e) {
    console.error('loadRemoteConfig error:', e);
    toast('Config could not be loaded: ' + e.message, 'e');
  }
}

async function saveRemoteConfig() {
  try {
    const promises = [];
    for (const def of RC_KEYS) {
      const el = document.getElementById(def.id);
      if (!el) continue;
      let val;
      if (def.type === 'bool')       val = el.value === 'true';
      else if (def.type === 'int')   val = parseInt(el.value) || 0;
      else                           val = el.value;
      promises.push(syncPublicConfigValue(def.key, val));
    }
    await Promise.all(promises);
    await loadQCoinConfig();
    if (allUsers.length) {
      renderUsers();
      if (_activeUserModalUid) openUserDetail(_activeUserModalUid);
    }
    logActivity('settings_update', 'Remote config updated');
    toast('Settings saved', 's');
  } catch(e) {
    toast('Save error: ' + e.message, 'e');
  }
}

// ═══════════════════════════════════════
//  SUBSCRIPTION SERVICES
// ═══════════════════════════════════════

let _allSubServices = [];

async function loadSubscriptionServices() {
  const el = document.getElementById('subServicesList');
  if (!el) return;
  el.innerHTML = '<div class="placeholder"><div class="spinner" style="margin:0 auto 8px"></div>Loading...</div>';
  try {
    const result = await pbGetList('subscription_services', 1, 200, { sort: 'category,name' });
    _allSubServices = result.items || [];
    renderSubServices();
  } catch(e) {
    el.innerHTML = '<div class="card"><div class="placeholder" style="color:var(--red)">Error: ' + escHtml(e.message) + '</div></div>';
  }
}

function renderSubServices() {
  const el = document.getElementById('subServicesList');
  if (!el) return;
  if (!_allSubServices.length) {
    el.innerHTML = '<div class="card"><div class="placeholder">No services yet. Start with "+ Add Service".</div></div>';
    return;
  }
  const groups = {};
  _allSubServices.forEach(s => {
    const cat = s.category || 'other';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(s);
  });
  let html = '';
  for (const [cat, services] of Object.entries(groups).sort()) {
    html += `<div class="card" style="margin-bottom:16px">
      <div class="card-title" style="text-transform:capitalize">${escHtml(cat)}</div>
      <div class="form-grid">`;
    services.forEach(s => {
      const id = escJs(s.id);
      const name = escHtml(s.name || '—');
      const logo = safeUrl(s.logo || s.logoUrl || '');
      const isActive = s.isActive !== false;
      html += `<div class="product-card" style="padding:14px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
          ${logo ? `<img src="${logo}" alt="" style="width:36px;height:36px;object-fit:contain;border-radius:6px">` : '<div style="width:36px;height:36px;background:var(--bg3);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:18px">📦</div>'}
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;font-size:13px">${name}</div>
            <div style="font-size:10px;color:var(--text3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(s.website || '')}</div>
          </div>
          <span class="tag ${isActive ? 'tag-green' : ''}" style="${!isActive ? 'background:var(--bg3);color:var(--text2)' : ''}">${isActive ? 'Active' : 'Passive'}</span>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-sm btn-ghost" onclick="openSubServiceModal('${id}')">✏️ Edit</button>
          <button class="btn btn-sm btn-danger" onclick="deleteSubService('${id}')">Delete</button>
        </div>
      </div>`;
    });
    html += `</div></div>`;
  }
  el.innerHTML = html;
}

function openSubServiceModal(id) {
  const s = id ? _allSubServices.find(x => x.id === id) : null;
  const title = s ? ('Edit Service: ' + escHtml(s.name || '')) : 'Add New Service';
  const cats = ['streaming','music','cloud','productivity','gaming','vpn','other'];
  const catOpts = cats.map(c => `<option value="${c}"${(s?.category||'other')===c?' selected':''}>${c}</option>`).join('');
  const body = `
    <div class="form-grid">
      <div class="form-field"><label>Service Name *</label>
        <input class="input" id="ssName" placeholder="Netflix" value="${escHtml(s?.name||'')}"></div>
      <div class="form-field"><label>Category</label>
        <select class="input" id="ssCategory">${catOpts}</select></div>
      <div class="form-field"><label>Logo URL</label>
        <input class="input" id="ssLogo" placeholder="https://..." value="${escHtml(s?.logo||s?.logoUrl||'')}"></div>
      <div class="form-field"><label>Website</label>
        <input class="input" id="ssWebsite" placeholder="https://..." value="${escHtml(s?.website||s?.websiteUrl||'')}"></div>
      <div class="form-field"><label>Affiliate URL</label>
        <input class="input" id="ssAffiliateUrl" placeholder="https://..." value="${escHtml(s?.affiliateUrl||'')}"></div>
      <div class="form-field"><label>Status</label>
        <select class="input" id="ssIsActive">
          <option value="true"${s?.isActive!==false?' selected':''}>Active</option>
          <option value="false"${s?.isActive===false?' selected':''}>Passive</option>
        </select></div>
    </div>
    <div class="form-field" style="margin-top:12px"><label>Description</label>
      <textarea class="input" id="ssDescription" rows="2">${escHtml(s?.description||'')}</textarea></div>
    <div class="form-field" style="margin-top:12px"><label>Platforms (comma-separated: ios,android,web)</label>
      <input class="input" id="ssPlatforms" value="${escHtml((s?.platforms||[]).join(','))}"></div>
    <div style="margin-top:20px;display:flex;gap:8px;justify-content:flex-end">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveSubService(${id?`'${escJs(id)}'`:'null'})">💾 Save</button>
    </div>`;
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = body;
  document.getElementById('modalOverlay').style.display = 'flex';
}

async function saveSubService(id) {
  const name = document.getElementById('ssName')?.value?.trim();
  if (!name) { toast('Service name is required', 'w'); return; }
  const data = {
    name,
    category:    document.getElementById('ssCategory')?.value || 'other',
    logo:        document.getElementById('ssLogo')?.value?.trim() || '',
    website:     document.getElementById('ssWebsite')?.value?.trim() || '',
    affiliateUrl:document.getElementById('ssAffiliateUrl')?.value?.trim() || '',
    isActive:    document.getElementById('ssIsActive')?.value === 'true',
    description: document.getElementById('ssDescription')?.value?.trim() || '',
    platforms:   (document.getElementById('ssPlatforms')?.value||'').split(',').map(p=>p.trim()).filter(Boolean),
  };
  try {
    if (id) {
      await pbUpdateDoc('subscription_services', id, data);
      logActivity('sub_service_update', `Service updated: ${name}`);
      toast('Service updated', 's');
    } else {
      await pbAddDoc('subscription_services', data);
      logActivity('sub_service_add', `Service added: ${name}`);
      toast('Service added', 's');
    }
    closeModal();
    loadSubscriptionServices();
  } catch(e) {
    toast('Error: ' + e.message, 'e');
  }
}

async function deleteSubService(id) {
  const s = _allSubServices.find(x => x.id === id);
  if (!confirm(`Delete service "${s?.name || id}"?`)) return;
  try {
    await pbDeleteDoc('subscription_services', id);
    logActivity('sub_service_delete', `Service deleted: ${s?.name || id}`);
    toast('Service deleted', 's');
    loadSubscriptionServices();
  } catch(e) {
    toast('Error: ' + e.message, 'e');
  }
}
