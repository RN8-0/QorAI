// ═══════════════════════════════════════
//  COMPAIR ADMIN WEB
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
  refreshDashboard();
}

function showLoginScreen() {
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('appContainer').style.display = 'none';
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
      <p>Bu hesap admin paneline erisemiyor: <strong>${email}</strong>.</p>
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

// Admin auth callback (email/password)
window._adminLoginCallback = async (userInfo, err) => {
  document.getElementById('loginLoading').style.display = 'none';
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

// ── NAV ──
function showView(name){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(n=>n.classList.remove('active'));
  document.getElementById(name+'View')?.classList.add('active');
  document.querySelector(`[data-view="${name}"]`)?.classList.add('active');
  if(name==='dashboard')refreshDashboard();
  if(name==='products'&&!allProducts.length)loadProducts();
  if(name==='users')loadUsers();
  if(name==='appcontrol')loadAppConfig();
  if(name==='algorithm')loadAlgorithmConfig();
  if(name==='scraper'){checkProxy();ensureProxyPolling();populateScraperCategories()}
  if(name==='activitylog')loadActivityLog();
}

// ── TOAST ──
function toast(msg,type='i',dur=4000){
  const c=document.getElementById('toastContainer');if(!c)return;
  const t=document.createElement('div');t.className='toast '+type;
  const icons={s:'✅',e:'❌',w:'⚠️',i:'ℹ️'};
  t.innerHTML=`<span>${icons[type]||'ℹ️'}</span><span style="flex:1">${msg}</span><button class="toast-x" onclick="this.parentElement.classList.add('removing');setTimeout(()=>this.parentElement.remove(),250)">✕</button>`;
  c.appendChild(t);setTimeout(()=>{if(t.parentElement){t.classList.add('removing');setTimeout(()=>t.remove(),250)}},dur);
}

// ═══════════════════════════════════════
//  DASHBOARD
// ═══════════════════════════════════════

let catChart=null,trendChart=null;

async function refreshDashboard(){
  try{
    const [userDocs,compDocs]=await Promise.all([pbGetAll('users',{sort:'id'}),pbGetAll('comparisons',{sort:'id'})]);
    const users=userDocs.map(d=>({uid:d.id,...d.data()}));
    const cSnap={size:compDocs.length};

    // Load 500 recent products for charts
    const sRes=await pbGetList('products',1,500,{sort:'-scrapedAt'});
    const sampleProducts=sRes.items;
    dashSampleProducts=sampleProducts;

    // Don't show sample count as total — wait for real count
    document.getElementById('dashTotalProducts').textContent='...';
    anim('dashTotalUsers',users.length);
    anim('dashTotalComparisons',cSnap.size||0);

    // Background: count all products and update (once, no flickering)
    countAllProductsInBackground();

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

    // Categories — quick render from sample, real data will come from background counter
    const sampleCats={};sampleProducts.forEach(p=>{if(p.category)sampleCats[p.category]=(sampleCats[p.category]||0)+1});
    updateCategoryChart(sampleCats);

    // Daily trend (from sample)
    const daily=[];for(let i=29;i>=0;i--){const d=new Date(Date.now()-i*864e5);const k=d.toISOString().split('T')[0];const c2=sampleProducts.filter(p=>p.scrapedAt&&new Date(p.scrapedAt).toISOString().split('T')[0]===k).length;daily.push({d:k.slice(5),c:c2})}
    const tCtx=document.getElementById('dailyTrendChart');
    if(tCtx){if(trendChart)trendChart.destroy();trendChart=new Chart(tCtx,{type:'line',data:{labels:daily.map(x=>x.d),datasets:[{data:daily.map(x=>x.c),borderColor:'#7c3aed',backgroundColor:'rgba(124,58,237,.08)',fill:true,tension:.4,pointRadius:2,borderWidth:2}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{color:getCSS('--border')},ticks:{color:getCSS('--text3'),font:{size:10},maxTicksLimit:8}},y:{grid:{color:getCSS('--border')},ticks:{color:getCSS('--text3'),font:{size:10},beginAtZero:true}}}}})}

    // Recent (from sample)
    const rEl=document.getElementById('dashRecentProducts');
    if(rEl)rEl.innerHTML=sampleProducts.slice(0,8).map(p=>`<div class="recent-row" onclick="showView('products');setTimeout(()=>openProduct('${p.id}'),300)">${p.images?.[0]?`<img class="recent-img" src="${p.images[0]}" onerror="this.style.display='none'">`:`<div class="recent-img" style="display:flex;align-items:center;justify-content:center;font-size:14px">📦</div>`}<div class="recent-info"><div class="recent-name">${p.name||''}</div><div class="recent-meta">${p.brand||''} · ${p.category||''}</div></div>${p.techScore?`<span class="badge badge-green">${p.techScore}</span>`:''}</div>`).join('')||'<div class="placeholder">No products</div>';

    // Brands — sample-based initially, background counter replaces with real data
    const brands={};sampleProducts.forEach(p=>{if(p.brand)brands[p.brand]=(brands[p.brand]||0)+1});
    updateTopBrands(brands);

    // Insights — initial with sample, background counter will replace
    updateInsights(totalProductCount||sampleProducts.length,typeof CompairCategories!=='undefined'?CompairCategories.getAll().length:Object.keys(sampleCats).length);
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
    pbSetDoc('app_config','stats',{productCount:total,categoryCounts:catCounts,brandCounts:brandCounts,updatedAt:new Date().toISOString()}).catch(()=>{});
  }catch(e){console.error('Count error:',e)}
  _bgCountRunning=false;
}

function updateTopBrands(brandCounts){
  const bSorted=Object.entries(brandCounts).sort((a,b)=>b[1]-a[1]).slice(0,10);
  const bEl=document.getElementById('dashTopBrands');
  if(!bEl||!bSorted.length)return;
  const mx=bSorted[0][1];
  bEl.innerHTML=bSorted.map(([b,c],i)=>`<div class="brand-row"><span class="brand-num">${i+1}</span><span class="brand-name">${b}</span><div class="brand-bar"><div class="brand-bar-fill" style="width:${Math.round(c/mx*100)}%"></div></div><span class="brand-count">${c}</span></div>`).join('');
}

function updateInsights(totalCount,totalCats){
  const iEl=document.getElementById('dashAiInsights');
  if(!iEl)return;
  const ins=[];
  const pc=totalCount||totalProductCount||0;
  const catCount=totalCats||(typeof CompairCategories!=='undefined'?CompairCategories.getAll().length:0);
  if(pc)ins.push(`<div class="insight-item"><div class="insight-label">VERİTABANI</div>📊 ${pc.toLocaleString()} ürün, ${catCount} kategori</div>`);
  const scores=(dashSampleProducts||[]).map(p=>p.techScore||0).filter(s=>s>0);
  if(scores.length)ins.push(`<div class="insight-item"><div class="insight-label">KALİTE</div>⭐ Ort. puan: ${(scores.reduce((a,b)=>a+b,0)/scores.length).toFixed(1)}/100</div>`);
  const userCount=parseInt(document.getElementById('dashTotalUsers')?.textContent?.replace(/,/g,'')||'0');
  ins.push(`<div class="insight-item"><div class="insight-label">KULLANICILAR</div>👥 ${userCount} kullanıcı</div>`);
  iEl.innerHTML=ins.join('')||'<div class="placeholder">Veri yok</div>';
}

function updateCategoryChart(catCounts){
  const cCtx=document.getElementById('categoryChart');
  if(!cCtx)return;
  if(catChart)catChart.destroy();

  // Group by CompairCategories groups (13 groups instead of 42 individual categories)
  const groupData={};
  const catToGroup={};
  const groupCatDetails={};
  if(typeof CompairCategories!=='undefined'&&CompairCategories.groups){
    CompairCategories.groups.forEach(g=>{
      groupCatDetails[g.name]=[];
      g.categories.forEach(c=>{catToGroup[c.id]=g.name});
    });
  }
  for(const [catId,count] of Object.entries(catCounts)){
    const group=catToGroup[catId]||'Diğer';
    groupData[group]=(groupData[group]||0)+count;
    if(!groupCatDetails[group])groupCatDetails[group]=[];
    const catName=(typeof CompairCategories!=='undefined'&&CompairCategories.getById)?
      (CompairCategories.getById(catId)?.name||catId):catId;
    groupCatDetails[group].push({name:catName,count});
  }

  const entries=Object.entries(groupData).filter(e=>e[1]>0).sort((a,b)=>b[1]-a[1]);
  if(!entries.length)return;

  // Update card title with total category count
  const totalCats=Object.keys(catCounts).length;
  const titleEl=cCtx.closest('.card')?.querySelector('.card-title');
  if(titleEl)titleEl.textContent=`Kategori Dağılımı (${totalCats} kategori)`;

  const cl=['#7c3aed','#22c55e','#f59e0b','#ef4444','#3b82f6','#8b5cf6','#ec4899','#14b8a6','#f97316','#06b6d4','#a855f7','#10b981','#e879f9','#94a3b8'];
  catChart=new Chart(cCtx,{type:'doughnut',data:{labels:entries.map(x=>x[0]),datasets:[{data:entries.map(x=>x[1]),backgroundColor:cl.slice(0,entries.length),borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'right',labels:{color:getCSS('--text2'),font:{size:11},usePointStyle:true,padding:6}},tooltip:{callbacks:{label:function(ctx){
    const total=ctx.dataset.data.reduce((a,b)=>a+b,0);
    const pct=((ctx.parsed/total)*100).toFixed(1);
    const group=ctx.label;
    const details=groupCatDetails[group]||[];
    const detailStr=details.sort((a,b)=>b.count-a.count).slice(0,5).map(d=>`${d.name}: ${d.count}`).join(', ');
    return[`${group}: ${ctx.parsed.toLocaleString()} (${pct}%)`,detailStr];
  }}}},cutout:'60%'}});
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
  g.innerHTML='<div class="placeholder"><div class="spinner" style="margin:0 auto 8px"></div>Ürünler yükleniyor...</div>';
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
  }catch(e){g.innerHTML='<div class="placeholder" style="color:var(--red)">Hata: '+e.message+'</div>'}
}

function populateFiltersFromData(){
  // Use CompairCategories if available (from categories.js)
  let cats=[],brands=[];
  if(typeof CompairCategories!=='undefined'&&CompairCategories.getAll){
    cats=CompairCategories.getAll().map(c=>({id:c.id,name:c.name}));
  }
  if(typeof CompairBrands!=='undefined'&&Array.isArray(CompairBrands)){
    brands=CompairBrands.map(b=>typeof b==='string'?b:b.name||b).sort();
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
  if(bf)bf.innerHTML='<option value="">Tüm Markalar</option>'+brands.map(b=>`<option>${b}</option>`).join('');
  if(cf)cf.innerHTML='<option value="">Tüm Kategoriler</option>'+cats.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
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

    if(result.empty&&direction==='next'){currentPage--;toast('Son sayfa','i');return}
    if(result.empty){
      g.innerHTML='<div class="placeholder">Ürün bulunamadı. Filtreleri değiştirmeyi deneyin.</div>';
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
    g.innerHTML='<div class="placeholder" style="color:var(--red)">Hata: '+e.message+'</div>';
    console.error('loadPage error:',e);
  }
}

function renderProductsPage(){
  const g=document.getElementById('productGrid');
  if(!displayProducts.length){g.innerHTML='<div class="placeholder">Ürün bulunamadı</div>';document.getElementById('pagination').innerHTML='';return}
  g.innerHTML=displayProducts.map(p=>{
    const s=p.techScore||0,sc=s>=75?'#22c55e':s>=50?'#f59e0b':'#ef4444';
    return`<div class="product-card${selectedIds.has(p.id)?' selected':''}" onclick="handleCardClick(event,'${p.id}')"><input type="checkbox" class="product-checkbox" ${selectedIds.has(p.id)?'checked':''} onclick="event.stopPropagation();toggleSel('${p.id}')"><div style="position:relative"><img class="product-img" src="${p.imageUrl||(p.images?.[0])||''}" alt="" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="product-img-ph" style="display:none">📱</div>${s>0?`<div class="score-badge" style="border-color:${sc};color:${sc}">${s}</div>`:''}</div><div class="product-info"><div class="product-brand">${p.brand||''}</div><div class="product-name">${p.name||''}</div><div class="product-meta"><span class="product-price">${p.price?p.price.toLocaleString()+' TL':''}</span><span>${p.category||''}</span></div></div></div>`;
  }).join('');

  const pEl=document.getElementById('pagination');
  const totalPages=totalProductCount?Math.ceil(totalProductCount/PER):0;
  const hasNext=currentPage<totalPages||displayProducts.length>=PER;
  const hasPrev=currentPage>1;
  let h='';
  if(hasPrev||hasNext){
    h+=`<button class="pg-btn" ${hasPrev?'':`disabled`} onclick="prevPage()">◀ Önceki</button>`;
    h+=`<span class="pg-btn" style="cursor:default;font-weight:600">Sayfa ${currentPage}</span>`;
    h+=`<button class="pg-btn" ${hasNext?'':`disabled`} onclick="nextPage()">Sonraki ▶</button>`;
    if(totalProductCount)h+=`<span class="pg-btn" style="cursor:default;opacity:.6;font-size:12px">${totalProductCount.toLocaleString()} ürün</span>`;
  }
  pEl.innerHTML=h;
}

async function nextPage(){await loadPage('next');scrollTop()}
async function prevPage(){await loadPage('prev');scrollTop()}

async function serverSearch(){
  const q=(document.getElementById('searchInput')?.value||'').trim();
  if(!q){currentPage=1;await loadPage();return}
  const g=document.getElementById('productGrid');
  g.innerHTML='<div class="placeholder"><div class="spinner" style="margin:0 auto 8px"></div>Aranıyor...</div>';
  try{
    const esc=q.replace(/"/g,'\\"');
    const filter=`name~"${esc}" || brand~"${esc}" || category~"${esc}" || id~"${esc.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'')}"`;
    const result=await pbGetList('products',1,200,{filter,sort:'-techScore'});
    displayProducts=result.items;
    allProducts=result.items;
    renderProductsPage();
    document.getElementById('productCount').textContent=result.totalItems+' sonuç';
    if(!result.items.length)toast('"'+q+'" için sonuç bulunamadı','i');
  }catch(e){g.innerHTML='<div class="placeholder" style="color:var(--red)">Arama hatası: '+e.message+'</div>'}
}

function filterProducts(){
  currentPage=1;
  loadPage();
}
function pDate(p){return p.scrapedAt?new Date(p.scrapedAt).getTime():p.updatedAt?new Date(p.updatedAt).getTime():0}

// Old renderProducts replaced by renderProductsPage above
function scrollTop(){document.querySelector('.main-content').scrollTo(0,0)}
function handleCardClick(e,id){if(e.target.type==='checkbox')return;if(selectedIds.size>0){toggleSel(id);return}openProduct(id)}
function toggleSel(id){if(selectedIds.has(id))selectedIds.delete(id);else selectedIds.add(id);renderProductsPage();const bar=document.getElementById('selectionBar');if(selectedIds.size>0){bar.style.display='flex';document.getElementById('selectionCount').textContent=selectedIds.size+' seçildi'}else bar.style.display='none'}
function selectAll(){displayProducts.forEach(p=>selectedIds.add(p.id));renderProductsPage();document.getElementById('selectionBar').style.display='flex';document.getElementById('selectionCount').textContent=selectedIds.size+' seçildi'}
function deselectAll(){selectedIds.clear();renderProductsPage();document.getElementById('selectionBar').style.display='none'}
async function deleteSelected(){if(!selectedIds.size||!confirm(selectedIds.size+' ürünü silmek istediğinize emin misiniz?'))return;try{await Promise.all([...selectedIds].map(id=>pbDeleteDoc('products',id)));logActivity('product_delete',`${selectedIds.size} ürün toplu silindi`);allProducts=allProducts.filter(p=>!selectedIds.has(p.id));totalProductCount-=selectedIds.size;selectedIds.clear();loadPage();toast('Silindi','s')}catch(e){toast('Hata: '+e.message,'e')}document.getElementById('selectionBar').style.display='none'}
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
  const imgs=p.images?.length?p.images:(p.imageUrl?[p.imageUrl]:[]);
  const sections=p.specSections&&Object.keys(p.specSections).length?p.specSections:null;
  let bricks='';
  function fmtSpecVal(s){
    if(s==='Yes'||s==='Var')return'<span class="yes">✓ Yes</span>';
    if(s==='No'||s==='Yok')return'<span class="no">✗ No</span>';
    // Split multi-value specs on newlines into separate lines
    if(s.includes('\n')){
      return s.split('\n').filter(Boolean).map(line=>`<div class="pm-v-line">${line.trim()}</div>`).join('');
    }
    return s;
  }
  function specRow(k,v){
    const s=String(v),y=s==='Yes'||s==='Var',n=s==='No'||s==='Yok';
    return`<tr><td class="pm-k">${k}</td><td class="pm-v${y?' yes':n?' no':''}">${fmtSpecVal(s)}</td></tr>`;
  }
  if(sections){bricks=Object.entries(sections).map(([sn,sd])=>{if(!sd||typeof sd!=='object')return'';const rows=Object.entries(sd).filter(([,v])=>v!=null&&String(v).trim());if(!rows.length)return'';return`<div class="pm-brick"><div class="pm-brick-head"><span>${SEC_ICONS[sn]||'📋'}</span>${sn}</div><table class="pm-spec-tbl"><tbody>${rows.map(([k,v])=>specRow(k,v)).join('')}</tbody></table></div>`}).join('')}else{const flat=p.specs||{};const rows=Object.entries(flat).filter(([,v])=>v!=null&&String(v).trim());if(rows.length)bricks=`<div class="pm-brick"><div class="pm-brick-head"><span>📋</span>Specifications</div><table class="pm-spec-tbl"><tbody>${rows.map(([k,v])=>specRow(k,v)).join('')}</tbody></table></div>`}
  const sc=p.techScore||0,scc=sc>=75?'#22c55e':sc>=50?'#f59e0b':'#ef4444';
  // Build category options for edit form
  const catOpts=(typeof CompairCategories!=='undefined'&&CompairCategories.getAll)?CompairCategories.getAll().map(c=>`<option value="${c.id}"${c.id===p.category?' selected':''}>${c.name}</option>`).join(''):'';
  body.innerHTML=`<div class="pm-hero"><div class="pm-img-area"><img class="pm-main-img" id="pmMainImg" src="${imgs[0]||''}" onerror="this.style.display='none'">${imgs.length>1?`<div class="pm-thumbs">${imgs.map((u,i)=>`<img class="pm-thumb${i===0?' active':''}" src="${u}" onclick="document.getElementById('pmMainImg').src='${u}';document.querySelectorAll('.pm-thumb').forEach(t=>t.classList.remove('active'));this.classList.add('active')">`).join('')}</div>`:''}</div><div class="pm-info"><div class="pm-brand">${p.brand||''}</div><div class="pm-name">${p.name||''}</div><div class="pm-chips"><span class="pm-chip"><b>${p.specsCount||Object.keys(p.specs||{}).length}</b> specs</span><span class="pm-chip">${p.category||''}</span>${p.scrapedAt?`<span class="pm-chip">${new Date(p.scrapedAt).toLocaleDateString()}</span>`:''}</div>${sc>0?`<div class="pm-score"><div class="pm-score-circle"><svg viewBox="0 0 36 36" class="pm-score-svg"><circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="3"/><circle cx="18" cy="18" r="15.9" fill="none" stroke="${scc}" stroke-width="3" stroke-dasharray="${sc} ${100-sc}" stroke-dashoffset="25" stroke-linecap="round"/></svg><div class="pm-score-num" style="color:${scc}">${sc}</div></div></div>`:''}<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-sm btn-primary" onclick="toggleEditForm('${p.id}')">✏️ Düzenle</button><button class="btn btn-danger btn-sm" onclick="deleteProduct('${p.id}');closeModal()">Sil</button>${p.sourceUrl?`<a href="${p.sourceUrl}" target="_blank" class="btn btn-sm">Kaynak</a>`:''}</div></div></div>
  <div id="editFormContainer" style="display:none;margin:16px 0">
    <div class="card" style="margin:0;border:1px solid var(--accent)">
      <div class="card-title">✏️ Ürün Düzenle</div>
      <div class="form-grid">
        <div class="form-field"><label>Ad</label><input class="input" id="editName" value="${(p.name||'').replace(/"/g,'&quot;')}"></div>
        <div class="form-field"><label>Marka</label><input class="input" id="editBrand" value="${(p.brand||'').replace(/"/g,'&quot;')}"></div>
        <div class="form-field"><label>Kategori</label><select class="input" id="editCategory">${catOpts}</select></div>
        <div class="form-field"><label>Fiyat (TL)</label><input class="input" type="number" id="editPrice" value="${p.price_raw||''}"></div>
        <div class="form-field"><label>Tech Score</label><input class="input" type="number" id="editScore" value="${p.techScore||''}" min="0" max="100"></div>
        <div class="form-field"><label>Görsel URL</label><input class="input" id="editImageUrl" value="${(p.imageUrl||p.images?.[0]||'').replace(/"/g,'&quot;')}"></div>
      </div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="btn btn-primary btn-sm" onclick="saveProductEdit('${p.id}')">💾 Kaydet</button>
        <button class="btn btn-ghost btn-sm" onclick="toggleEditForm()">İptal</button>
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
    logActivity('product_edit',`Ürün düzenlendi: ${name||id}`,{productId:id,changes:Object.keys(updates)});
    const mem=allProducts.find(p=>p.id===id);
    if(mem)Object.assign(mem,{name,brand,category,price_raw:price,techScore:score});
    toast('Ürün güncellendi','s');closeModal();renderProductsPage();
  }catch(e){toast('Hata: '+e.message,'e')}
}
async function deleteProduct(id){if(!confirm('Bu ürünü silmek istediğinize emin misiniz?'))return;try{await pbDeleteDoc('products',id);logActivity('product_delete',`Ürün silindi: ${id}`);allProducts=allProducts.filter(p=>p.id!==id);totalProductCount--;loadPage();toast('Silindi','s')}catch(e){toast('Hata: '+e.message,'e')}}

// ═══════════════════════════════════════
//  USERS
// ═══════════════════════════════════════
let allUsers=[],filteredUsers=[],userPage=1;const UPER=50;

async function loadUsers(){
  try{const items=await pbGetAll('users',{sort:'id'});allUsers=items.map(d=>({uid:d.id,...d.data()}));const prem=allUsers.filter(u=>u.isPremium).length;const active=allUsers.filter(u=>{const la=u.lastActive?new Date(u.lastActive):null;return la&&la>new Date(Date.now()-30*864e5)}).length;
  document.getElementById('usTotalCount').textContent=allUsers.length;document.getElementById('usPremiumCount').textContent=prem;document.getElementById('usFreeCount').textContent=allUsers.length-prem;document.getElementById('usActiveCount').textContent=active;document.getElementById('usersCount').textContent=allUsers.length;
  const countries=[...new Set(allUsers.map(u=>u.country).filter(Boolean))].sort();document.getElementById('userCountryFilter').innerHTML='<option value="">All Countries</option>'+countries.map(c=>`<option>${c}</option>`).join('');
  filterUsers()}catch(e){toast('Users error: '+e.message,'e')}
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
  h+=page.map(u=>{const av=u.photoURL?`<img src="${u.photoURL}">`:(u.displayName||u.email||'?').charAt(0).toUpperCase();const j=u.createdAt?new Date(u.createdAt).toLocaleDateString():'';return`<div class="user-row" onclick="openUserDetail('${u.uid}')"><div class="user-avatar">${av}</div><div><div class="user-name">${u.displayName||'Anonymous'}</div><div class="user-email">${u.email||''}</div></div><span style="font-size:12px">${u.country||'—'}</span><span>${u.isPremium?'<span class="badge badge-premium">Premium</span>':'<span class="badge badge-ghost">Free</span>'}</span><span style="font-size:11px;color:var(--text2)">${j}</span></div>`}).join('');
  list.innerHTML=h;
  const total=Math.ceil(filteredUsers.length/UPER),pe=document.getElementById('userPagination');
  if(total<=1){pe.innerHTML='';return}
  let ph=`<button class="pg-btn" ${userPage===1?'disabled':''} onclick="userPage--;renderUsers()">Prev</button>`;
  for(let i=Math.max(1,userPage-3);i<=Math.min(total,userPage+3);i++)ph+=`<button class="pg-btn${i===userPage?' active':''}" onclick="userPage=${i};renderUsers()">${i}</button>`;
  ph+=`<button class="pg-btn" ${userPage===total?'disabled':''} onclick="userPage++;renderUsers()">Next</button>`;pe.innerHTML=ph;
}

function openUserDetail(uid){
  const u=allUsers.find(x=>x.uid===uid);if(!u)return;
  document.getElementById('userModalTitle').textContent=u.displayName||'Kullanıcı';
  const b=document.getElementById('userModalBody');
  const j=u.createdAt?new Date(u.createdAt):'';
  const la=u.lastActive?new Date(u.lastActive):'';
  const jStr=j?j.toLocaleDateString('tr-TR',{day:'numeric',month:'long',year:'numeric'}):'—';
  const laStr=la?la.toLocaleDateString('tr-TR',{day:'numeric',month:'long',year:'numeric'}):'—';

  // Engagement analysis
  const daysSinceJoin=j?Math.floor((Date.now()-j.getTime())/864e5):0;
  const daysSinceActive=la?Math.floor((Date.now()-la.getTime())/864e5):999;
  const compCount=u.comparisonCount||0;
  const favCount=u.favorites?.length||u.favoriteCount||0;

  // Activity status
  let activityStatus,actColor;
  if(daysSinceActive<=1){activityStatus='🟢 Aktif';actColor='#22c55e'}
  else if(daysSinceActive<=7){activityStatus='🟡 Bu hafta aktif';actColor='#f59e0b'}
  else if(daysSinceActive<=30){activityStatus='🟠 Bu ay aktif';actColor='#f97316'}
  else{activityStatus='🔴 İnaktif';actColor='#ef4444'}

  // User type analysis
  let userType='Yeni Kullanıcı';
  if(compCount>=20)userType='Power User';
  else if(compCount>=5)userType='Aktif Kullanıcı';
  else if(daysSinceJoin>=7&&compCount===0)userType='Pasif Kullanıcı';

  const engRate=daysSinceJoin>0?Math.min(100,Math.round(compCount/daysSinceJoin*100)):0;

  b.innerHTML=`
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px">
      <div class="user-avatar" style="width:56px;height:56px;font-size:20px">${u.photoURL?`<img src="${u.photoURL}">`:(u.displayName||'?').charAt(0).toUpperCase()}</div>
      <div style="flex:1">
        <div style="font-size:16px;font-weight:700">${u.displayName||'Anonim'}</div>
        <div style="font-size:12px;color:var(--text2)">${u.email||''}</div>
        <div style="font-size:11px;color:${actColor};margin-top:2px">${activityStatus}</div>
      </div>
      <div>${u.isPremium?'<span class="badge badge-premium" style="font-size:12px;padding:6px 12px">Premium</span>':'<span class="badge badge-ghost" style="font-size:12px;padding:6px 12px">Free</span>'}</div>
    </div>
    <!-- Tab Navigation -->
    <div style="display:flex;gap:0;border-bottom:2px solid var(--border);margin-bottom:16px">
      <button class="user-tab active" data-tab="overview" onclick="switchUserTab(this,'${uid}')">📊 Genel</button>
      <button class="user-tab" data-tab="behavior" onclick="switchUserTab(this,'${uid}')">🎯 Davranış</button>
      <button class="user-tab" data-tab="quizzes" onclick="switchUserTab(this,'${uid}')">🧠 Quiz</button>
      <button class="user-tab" data-tab="analysis" onclick="switchUserTab(this,'${uid}')">🤖 AI Analiz</button>
      <button class="user-tab" data-tab="profile" onclick="switchUserTab(this,'${uid}')">👤 Profil</button>
    </div>
    <!-- Overview Tab -->
    <div class="user-tab-panel active" data-panel="overview">
      <div class="form-grid" style="margin-bottom:16px">
        <div class="card" style="margin:0;padding:14px"><div style="font-size:10px;color:var(--text3);text-transform:uppercase;font-weight:700">Kayıt Tarihi</div><div style="font-size:14px;font-weight:700;margin-top:4px">${jStr}</div></div>
        <div class="card" style="margin:0;padding:14px"><div style="font-size:10px;color:var(--text3);text-transform:uppercase;font-weight:700">Son Aktivite</div><div style="font-size:14px;font-weight:700;margin-top:4px">${laStr}</div></div>
        <div class="card" style="margin:0;padding:14px"><div style="font-size:10px;color:var(--text3);text-transform:uppercase;font-weight:700">Ülke</div><div style="font-size:14px;font-weight:700;margin-top:4px">${u.country||'—'}</div></div>
        <div class="card" style="margin:0;padding:14px"><div style="font-size:10px;color:var(--text3);text-transform:uppercase;font-weight:700">Karşılaştırma</div><div style="font-size:14px;font-weight:700;margin-top:4px">${compCount}</div></div>
      </div>
      <div class="card" style="margin:0 0 16px;padding:14px">
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;font-weight:700;margin-bottom:8px">📊 Kullanıcı Analizi</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px">
          <div><span style="color:var(--text2)">Kullanıcı Tipi:</span> <b>${userType}</b></div>
          <div><span style="color:var(--text2)">Üyelik Süresi:</span> <b>${daysSinceJoin} gün</b></div>
          <div><span style="color:var(--text2)">Etkileşim Oranı:</span> <b>${engRate}%</b></div>
          <div><span style="color:var(--text2)">Favoriler:</span> <b>${favCount}</b></div>
          ${u.deviceInfo?`<div><span style="color:var(--text2)">Cihaz:</span> <b>${u.deviceInfo}</b></div>`:''}
          ${u.appVersion?`<div><span style="color:var(--text2)">Uygulama:</span> <b>v${u.appVersion}</b></div>`:''}
          ${u.platform?`<div><span style="color:var(--text2)">Platform:</span> <b>${u.platform}</b></div>`:''}
          ${u.language?`<div><span style="color:var(--text2)">Dil:</span> <b>${u.language}</b></div>`:''}
        </div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn ${u.isPremium?'btn-ghost':'btn-primary'}" onclick="togglePremium('${u.uid}',${!u.isPremium})">${u.isPremium?'Premium Kaldır':'Premium Yap'}</button>
        <button class="btn btn-danger" onclick="deleteUser('${u.uid}')">Sil</button>
      </div>
    </div>
    <!-- Behavior Tab -->
    <div class="user-tab-panel" data-panel="behavior" style="display:none">
      <div id="behaviorContent" style="text-align:center;padding:30px;color:var(--text3)">
        <div class="spinner"></div>
        <div style="margin-top:8px">Davranış verileri yükleniyor...</div>
      </div>
    </div>
    <!-- Quiz Tab -->
    <div class="user-tab-panel" data-panel="quizzes" style="display:none">
      <div id="quizContent" style="text-align:center;padding:30px;color:var(--text3)">
        <div class="spinner"></div>
        <div style="margin-top:8px">Quiz verileri yükleniyor...</div>
      </div>
    </div>
    <!-- Analysis Tab -->
    <div class="user-tab-panel" data-panel="analysis" style="display:none">
      <div id="analysisContent" style="text-align:center;padding:30px;color:var(--text3)">
        <div class="spinner"></div>
        <div style="margin-top:8px">Analiz geçmişi yükleniyor...</div>
      </div>
    </div>
    <!-- Profile Tab -->
    <div class="user-tab-panel" data-panel="profile" style="display:none">
      <div id="profileContent" style="text-align:center;padding:30px;color:var(--text3)">
        <div class="spinner"></div>
        <div style="margin-top:8px">Profil verisi yükleniyor...</div>
      </div>
    </div>`;
  document.getElementById('userModal').style.display='flex';
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
    const [rvRes,compRes]=await Promise.all([
      pbGetList('recently_viewed',1,20,{filter:`user="${uid}"`,sort:'-created'}),
      pbGetList('comparisons',1,20,{filter:`user="${uid}"`,sort:'-created'})
    ]);
    const views=rvRes.items;
    const comps=compRes.items;
    const u=allUsers.find(x=>x.uid===uid)||{};
    const prefData=u.quizPreferences||{};
    const catInterests=Object.entries(prefData).filter(([k])=>k.startsWith('cat_')).map(([k,v])=>({cat:k.replace('cat_',''),count:v})).sort((a,b)=>b.count-a.count);
    const prefWeights=Object.entries(prefData).filter(([k])=>k.startsWith('pref_')).map(([k,v])=>({pref:k.replace('pref_','').replace(/_/g,' '),count:v})).sort((a,b)=>b.count-a.count).slice(0,10);

    let html=`<div class="form-grid" style="margin-bottom:16px">
      <div class="card" style="margin:0;padding:14px"><div style="font-size:10px;color:var(--text3);text-transform:uppercase;font-weight:700">Ürün Görüntüleme</div><div style="font-size:20px;font-weight:700;margin-top:4px;color:#22c55e">${views.length}</div></div>
      <div class="card" style="margin:0;padding:14px"><div style="font-size:10px;color:var(--text3);text-transform:uppercase;font-weight:700">Karşılaştırma</div><div style="font-size:20px;font-weight:700;margin-top:4px;color:#f59e0b">${comps.length}</div></div>
    </div>`;

    if(catInterests.length){
      html+=`<div class="card" style="margin:0 0 16px;padding:14px"><div style="font-size:10px;color:var(--text3);text-transform:uppercase;font-weight:700;margin-bottom:10px">🎯 Kategori İlgi Alanları</div><div style="display:flex;flex-wrap:wrap;gap:6px">`;
      for(const ci of catInterests)html+=`<span style="background:var(--primary);color:#fff;padding:4px 10px;border-radius:12px;font-size:11px;font-weight:600">${ci.cat} (${ci.count})</span>`;
      html+=`</div></div>`;
    }

    if(prefWeights.length){
      const maxW=prefWeights[0]?.count||1;
      html+=`<div class="card" style="margin:0 0 16px;padding:14px"><div style="font-size:10px;color:var(--text3);text-transform:uppercase;font-weight:700;margin-bottom:10px">⚖️ Tercih Ağırlıkları</div>`;
      for(const pw of prefWeights){const pct=Math.round(pw.count/maxW*100);html+=`<div style="margin-bottom:6px"><div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px"><span>${pw.pref}</span><span style="color:var(--text3)">${pw.count}</span></div><div style="background:var(--bg3);border-radius:4px;height:6px"><div style="background:var(--primary);border-radius:4px;height:6px;width:${pct}%"></div></div></div>`;}
      html+=`</div>`;
    }

    if(views.length){
      html+=`<div class="card" style="margin:0 0 16px;padding:14px"><div style="font-size:10px;color:var(--text3);text-transform:uppercase;font-weight:700;margin-bottom:10px">👁️ Son Görüntülenen Ürünler</div><div style="max-height:200px;overflow-y:auto">`;
      views.forEach(v=>{const date=v.created?new Date(v.created).toLocaleDateString('tr-TR'):'—';html+=`<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border);font-size:11px"><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${v.productName||v.product||'—'}</span><span style="color:var(--text3);margin-left:8px;white-space:nowrap">${date}</span></div>`;});
      html+=`</div></div>`;
    }

    if(!catInterests.length&&!views.length&&!comps.length){
      html+=`<div style="text-align:center;padding:30px;color:var(--text3)"><div style="font-size:32px;margin-bottom:8px">📭</div><div>Henüz davranış verisi yok</div></div>`;
    }

    el.innerHTML=html;
    el.dataset.loaded='1';
  }catch(e){
    el.innerHTML=`<div style="color:var(--red);padding:20px">Hata: ${e.message}</div>`;
  }
}

async function loadUserQuizzes(uid){
  const el=document.getElementById('quizContent');
  if(el.dataset.loaded)return;
  try{
    const u=allUsers.find(x=>x.uid===uid)||{};
    const newQuizHistory=u.quizHistory||[];

    if(!newQuizHistory.length){
      el.innerHTML=`<div style="text-align:center;padding:30px;color:var(--text3)"><div style="font-size:32px;margin-bottom:8px">🧠</div><div>Henüz quiz çözülmemiş</div></div>`;
      el.dataset.loaded='1';
      return;
    }

    newQuizHistory.sort((a,b)=>(b.timestamp||'').localeCompare(a.timestamp||''));
    let html=`<div style="font-size:12px;color:var(--text2);margin-bottom:12px">${newQuizHistory.length} quiz oturumu bulundu</div>`;

    for(const d of newQuizHistory){
      const date=d.timestamp?new Date(d.timestamp).toLocaleDateString('tr-TR',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
      const score=d.score?Math.round(d.score):'—';
      const scoreColor=score>=80?'#22c55e':score>=60?'#f59e0b':'#ef4444';
      const answers=d.answers||[];
      const mode=d.mode==='compare'?'🔀 Compare':'🔍 Single';
      html+=`<div class="card" style="margin:0 0 12px;padding:14px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><div><div style="font-size:12px;font-weight:700">${d.category||'AI Analiz'} <span style="font-size:10px;color:var(--text3);font-weight:400">${mode}</span></div><div style="font-size:10px;color:var(--text3)">${date}</div></div><div style="background:${scoreColor}20;color:${scoreColor};padding:4px 10px;border-radius:8px;font-size:12px;font-weight:700">${score}%</div></div>`;
      if(d.productUrl)html+=`<div style="font-size:10px;color:var(--primary);margin-bottom:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${d.productUrl}</div>`;
      if(d.productUrls&&d.productUrls.length)for(const url of d.productUrls)html+=`<div style="font-size:10px;color:var(--primary);margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${url}</div>`;
      if(answers.length){
        html+=`<div style="border-top:1px solid var(--border);padding-top:8px;margin-top:4px">`;
        for(const a of answers)html+=`<div style="margin-bottom:4px;font-size:11px"><span style="color:var(--text2)">${a.question||'—'}</span><span style="color:var(--primary);font-weight:600;margin-left:6px">${a.answer||a.selectedOption||'—'}</span></div>`;
        html+=`</div>`;
      }
      html+=`</div>`;
    }
    el.innerHTML=html;
    el.dataset.loaded='1';
  }catch(e){
    el.innerHTML=`<div style="color:var(--red);padding:20px">Hata: ${e.message}</div>`;
  }
}
function closeUserModal(){document.getElementById('userModal').style.display='none'}

async function loadUserAnalysis(uid){
  const el=document.getElementById('analysisContent');
  if(el.dataset.loaded)return;
  try{
    const userDocRef=await pbGetDoc('users',uid);
    const data=userDocRef.exists?userDocRef.data():{};
    const analyzedProducts=data.analyzedProducts||[];
    const quizHistory=data.quizHistory||[];

    if(!analyzedProducts.length){
      el.innerHTML=`<div style="text-align:center;padding:30px;color:var(--text3)"><div style="font-size:32px;margin-bottom:8px">🤖</div><div>Henüz AI analiz yapılmamış</div></div>`;
      el.dataset.loaded='1';
      return;
    }

    // Sort by timestamp descending
    analyzedProducts.sort((a,b)=>(b.timestamp||'').localeCompare(a.timestamp||''));

    let html=`<div style="font-size:12px;color:var(--text2);margin-bottom:12px">${analyzedProducts.length} ürün analiz edilmiş</div>`;

    for(const p of analyzedProducts){
      const date=p.timestamp?new Date(p.timestamp).toLocaleDateString('tr-TR',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
      const score=p.score?Math.round(p.score):'—';
      const scoreColor=score>=80?'#22c55e':score>=60?'#f59e0b':'#ef4444';
      const mode=p.mode==='compare'?'🔀 Karşılaştırma':'🔍 Tekil Analiz';

      html+=`<div class="card" style="margin:0 0 12px;padding:14px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <div style="flex:1">
            <div style="font-size:12px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.title||'Bilinmeyen Ürün'}</div>
            <div style="font-size:10px;color:var(--text3)">${date} · ${mode}</div>
          </div>
          <div style="background:${scoreColor}20;color:${scoreColor};padding:4px 10px;border-radius:8px;font-size:12px;font-weight:700">${score}%</div>
        </div>
        ${p.category?`<span style="background:var(--bg3);padding:2px 8px;border-radius:8px;font-size:10px">${p.category}</span>`:''}
        ${p.url?`<div style="font-size:10px;color:var(--primary);margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.url}</div>`:''}
        ${p.verdict?`<div style="font-size:11px;color:var(--text2);margin-top:6px;line-height:1.4">${p.verdict.substring(0,150)}${p.verdict.length>150?'...':''}</div>`:''}
      </div>`;
    }

    el.innerHTML=html;
    el.dataset.loaded='1';
  }catch(e){
    el.innerHTML=`<div style="color:var(--red);padding:20px">Hata: ${e.message}</div>`;
  }
}

async function loadUserProfile(uid){
  const el=document.getElementById('profileContent');
  if(el.dataset.loaded)return;
  try{
    const u=allUsers.find(x=>x.uid===uid);
    if(!u){el.innerHTML='Kullanıcı bulunamadı';return;}

    let html=`<div class="card" style="margin:0 0 16px;padding:14px">
      <div style="font-size:10px;color:var(--text3);text-transform:uppercase;font-weight:700;margin-bottom:12px">👤 Profil Özeti</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:12px">
        <div><span style="color:var(--text2)">Ekosistem:</span> <b>${u.ecosystem||'Belirtilmemiş'}</b></div>
        <div><span style="color:var(--text2)">Bütçe:</span> <b>${u.budgetRange||'Belirtilmemiş'}</b></div>
        <div><span style="color:var(--text2)">Yaş Aralığı:</span> <b>${u.ageRange||'Belirtilmemiş'}</b></div>
        <div><span style="color:var(--text2)">Meslek:</span> <b>${u.profession||'Belirtilmemiş'}</b></div>
        <div><span style="color:var(--text2)">Cinsiyet:</span> <b>${u.gender||'Belirtilmemiş'}</b></div>
        <div><span style="color:var(--text2)">Dil:</span> <b>${u.language||'—'}</b></div>
        <div><span style="color:var(--text2)">Ülke:</span> <b>${u.country||'—'}</b></div>
        <div><span style="color:var(--text2)">Kullanım:</span> <b>${u.usageIntent||'Belirtilmemiş'}</b></div>
      </div>
    </div>`;

    // Priorities
    const priorities=u.priorities||[];
    if(priorities.length){
      html+=`<div class="card" style="margin:0 0 16px;padding:14px">
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;font-weight:700;margin-bottom:10px">🎯 Öncelikler</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">`;
      for(const p of priorities){
        html+=`<span style="background:var(--primary);color:#fff;padding:4px 10px;border-radius:12px;font-size:11px;font-weight:600">${p}</span>`;
      }
      html+=`</div></div>`;
    }

    // Current Devices
    const devices=u.currentDevices||[];
    if(devices.length){
      html+=`<div class="card" style="margin:0 0 16px;padding:14px">
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;font-weight:700;margin-bottom:10px">📱 Mevcut Cihazlar</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">`;
      for(const d of devices){
        html+=`<span style="background:var(--bg3);padding:4px 10px;border-radius:12px;font-size:11px">${d}</span>`;
      }
      html+=`</div></div>`;
    }

    // Interest Categories
    const interests=u.interestCategories||[];
    if(interests.length){
      html+=`<div class="card" style="margin:0 0 16px;padding:14px">
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;font-weight:700;margin-bottom:10px">📂 İlgi Kategorileri</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">`;
      for(const c of interests){
        html+=`<span style="background:#8b5cf620;color:#8b5cf6;padding:4px 10px;border-radius:12px;font-size:11px;font-weight:600">${c}</span>`;
      }
      html+=`</div></div>`;
    }

    // Subscriptions
    const subs=u.subscriptions||[];
    if(subs.length){
      html+=`<div class="card" style="margin:0 0 16px;padding:14px">
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;font-weight:700;margin-bottom:10px">🔔 Abonelikler</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">`;
      for(const s of subs){
        html+=`<span style="background:var(--bg3);padding:4px 10px;border-radius:12px;font-size:11px">${s}</span>`;
      }
      html+=`</div></div>`;
    }

    el.innerHTML=html;
    el.dataset.loaded='1';
  }catch(e){
    el.innerHTML=`<div style="color:var(--red);padding:20px">Hata: ${e.message}</div>`;
  }
}
async function togglePremium(uid,v){try{await pbUpdateDoc('users',uid,{isPremium:v});const u=allUsers.find(x=>x.uid===uid);if(u)u.isPremium=v;openUserDetail(uid);loadUsers();toast(v?'Upgraded':'Downgraded','s')}catch(e){toast('Error: '+e.message,'e')}}
async function deleteUser(uid){
  if(!confirm('Delete this user? This will permanently remove their account.'))return;
  try{
    await pbDeleteDoc('users',uid);
    allUsers=allUsers.filter(u=>u.uid!==uid);closeUserModal();filterUsers();toast('User deleted','s');
    logActivity('user_delete',`User deleted: ${uid}`);
  }catch(e){toast('Error: '+e.message,'e')}
}

// ═══════════════════════════════════════
//  APP CONTROL
// ═══════════════════════════════════════
async function loadAppConfig(){try{const d=await pbGetDoc('app_config','main');if(!d.exists)return;const c=d.data();const f=['adsEnabled','adBannerUnitId','adInterstitialUnitId','adRewardedUnitId','adFrequency','adsPremiumFree','homeBannerTitle','homeBannerSubtitle','homeFeaturedCategories','homeFeaturedCount','maintenanceEnabled','maintenanceMessage','appMinVersion','appForceUpdate','appLatestVersion','appUpdateUrl'];f.forEach(k=>{const el=document.getElementById(k);if(!el)return;if(el.type==='checkbox')el.checked=!!c[k];else el.value=c[k]||''})}catch(e){toast('Config error: '+e.message,'e')}}

async function saveAppConfig(){
  const c={};['adBannerUnitId','adInterstitialUnitId','adRewardedUnitId','homeBannerTitle','homeBannerSubtitle','homeFeaturedCategories','maintenanceMessage','appMinVersion','appLatestVersion','appUpdateUrl'].forEach(k=>{const el=document.getElementById(k);if(el)c[k]=el.value});
  ['adsEnabled','adsPremiumFree','maintenanceEnabled','appForceUpdate'].forEach(k=>{const el=document.getElementById(k);if(el)c[k]=el.checked});
  ['adFrequency','homeFeaturedCount'].forEach(k=>{const el=document.getElementById(k);if(el)c[k]=parseInt(el.value)||0});
  c.updatedAt=serverTimestamp();
  try{await pbSetDoc('app_config','main',c);toast('Saved','s')}catch(e){toast('Error: '+e.message,'e')}
}

async function sendPushNotification(){
  const title=document.getElementById('pushTitle').value,body=document.getElementById('pushBody').value,topic=document.getElementById('pushTopic').value;
  if(!title||!body){toast('Title & message required','w');return}
  try{await pbAddDoc('notifications',{title,body,topic,sentAt:serverTimestamp(),sentBy:_currentAdminEmail||'admin'});toast('Notification queued','s');document.getElementById('pushTitle').value='';document.getElementById('pushBody').value='';document.getElementById('pushResult').innerHTML='<span style="color:var(--green)">Sent!</span>'}catch(e){toast('Error: '+e.message,'e')}
}

async function loadNotificationHistory(){
  try{const res=await pbGetList('notifications',1,50,{sort:'-sentAt'});const el=document.getElementById('notificationHistory');if(res.empty){el.innerHTML='<p class="text-muted">No notifications yet</p>';return}
  el.innerHTML=res.items.map(n=>{const dt=n.sentAt?new Date(n.sentAt).toLocaleString():'—';return`<div class="notif-item"><div style="display:flex;justify-content:space-between;margin-bottom:3px"><strong style="font-size:13px">${n.title||''}</strong><span style="font-size:10px;color:var(--text3)">${dt}</span></div><div style="font-size:12px;color:var(--text2)">${n.body||''}</div><div style="font-size:10px;color:var(--text3);margin-top:2px">${n.topic||'all'} · ${n.sentBy||''}</div></div>`}).join('')}catch(e){toast('Error: '+e.message,'e')}
}// ═══════════════════════════════════════
//  ALGORITHM
// ═══════════════════════════════════════
function updateAlgoLabel(input){const id=input.id.replace(/^(weight|boost)/,'label');const el=document.getElementById(id);if(el)el.textContent=input.value+'%'}

async function loadAlgorithmConfig(){try{const d=await pbGetDoc('app_config','algorithm');if(!d.exists)return;const c=d.data();['weightPersonalFit','weightExpert','weightCommunity','weightPricePerf','boostCategoryView','boostSearch','boostQuiz','boostCompare','boostEcosystem','boostBudget','minYear','maxPerBrand','trendingCount','newArrivalsCount','productsPerCategory','cacheDuration'].forEach(f=>{const el=document.getElementById(f);if(el&&c[f]!==undefined){el.value=c[f];updateAlgoLabel(el)}});if(c.brandBlacklist)document.getElementById('brandBlacklist').value=c.brandBlacklist;if(c.brandBoost)document.getElementById('brandBoost').value=c.brandBoost;loadPinnedProducts(c.pinnedProducts||[]);loadHiddenProducts(c.hiddenProducts||[]);loadCategoryToggles(c.disabledCategories||[])}catch(e){console.error(e)}}

async function saveAlgorithmConfig(){
  const c={};['weightPersonalFit','weightExpert','weightCommunity','weightPricePerf','boostCategoryView','boostSearch','boostQuiz','boostCompare','boostEcosystem','boostBudget','minYear','maxPerBrand','trendingCount','newArrivalsCount','productsPerCategory','cacheDuration'].forEach(f=>{const el=document.getElementById(f);if(el)c[f]=parseInt(el.value)||0});
  c.brandBlacklist=document.getElementById('brandBlacklist').value;c.brandBoost=document.getElementById('brandBoost').value;
  c.pinnedProducts=_pinnedProducts||[];c.hiddenProducts=_hiddenProducts||[];c.disabledCategories=_disabledCategories||[];
  c.updatedAt=serverTimestamp();
  try{await pbSetDoc('app_config','algorithm',c);toast('Saved','s');logActivity('algorithm_update','Algorithm config updated')}catch(e){toast('Error: '+e.message,'e')}
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
    `<span class="tag tag-green" style="cursor:pointer" onclick="removePinnedProduct('${id}')">${id} ✕</span>`
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
    `<span class="tag tag-red" style="cursor:pointer" onclick="removeHiddenProduct('${id}')">${id} ✕</span>`
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
      <input type="checkbox" ${checked ? 'checked' : ''} onchange="toggleCategory('${cat}', this.checked)">
      <span style="font-size:13px">${cat}</span>
    </label>`;
  }).join('');
}

function toggleCategory(cat, enabled) {
  if (enabled) {
    _disabledCategories = _disabledCategories.filter(c => c !== cat);
  } else {
    if (!_disabledCategories.includes(cat)) _disabledCategories.push(cat);
  }
}

function selectAllCategories() {
  _disabledCategories = [];
  loadCategoryToggles([]);
}

function deselectAllCategories() {
  _disabledCategories = [...ALL_CATEGORIES];
  loadCategoryToggles([...ALL_CATEGORIES]);
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
    const empty = sorted.filter(([, c]) => c === 0).map(([n]) => n);
    el.innerHTML = `
      <div style="background:var(--card-bg);border:1px solid var(--border);border-radius:8px;padding:12px;font-size:13px">
        <strong>📊 Feed Statistics</strong><br>
        <span>Total products: <b>${total.toLocaleString()}</b></span><br>
        <span>Categories with products: <b>${sorted.filter(([,c])=>c>0).length}</b> / ${ALL_CATEGORIES.length}</span><br>
        ${empty.length > 0 ? `<span style="color:var(--red)">Empty categories: ${empty.join(', ')}</span><br>` : ''}
        <div style="margin-top:8px;max-height:200px;overflow-y:auto">
          ${sorted.filter(([,c])=>c>0).map(([n,c]) =>
            `<div style="display:flex;justify-content:space-between;padding:2px 0;border-bottom:1px solid var(--border)">
              <span>${n}</span><span><b>${c}</b></span>
            </div>`
          ).join('')}
        </div>
      </div>`;
  } catch (e) {
    el.innerHTML = `<span style="color:var(--red)">Error: ${e.message}</span>`;
  }
}

async function clearAllUserCaches() {
  if (!confirm('This will force all users to reload their home feed on next app open. Continue?')) return;
  try {
    // Bump the cache version in app_config so the app knows to refresh
    await pbSetDoc('app_config','algorithm',{
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

let activityLogPage=1;
async function loadActivityLog(){
  const el=document.getElementById('activityLogList');
  if(!el)return;
  el.innerHTML='<div class="placeholder"><div class="spinner" style="margin:0 auto 8px"></div>Yükleniyor...</div>';
  try{
    const result=await pbGetList('admin_logs',1,100,{sort:'-timestamp'});
    if(!result.items.length){el.innerHTML='<div class="placeholder">Henüz aktivite yok</div>';return}
    const logs=result.items;
    const actionIcons={product_edit:'✏️',product_delete:'🗑️',product_add:'➕',user_delete:'👤',user_premium:'⭐',bulk_category:'📂',bulk_brand:'🏷️',export:'📤',import:'📥'};
    el.innerHTML=logs.map(l=>{
      const ts=l.timestamp?new Date(l.timestamp).toLocaleString('tr-TR'):'—';
      const icon=actionIcons[l.action]||'📋';
      return`<div class="log-row"><span class="log-icon">${icon}</span><div class="log-info"><div class="log-detail">${l.detail||l.action}</div><div class="log-meta">${l.admin||''} · ${ts}</div></div></div>`;
    }).join('');
  }catch(e){el.innerHTML='<div class="placeholder" style="color:var(--red)">Hata: '+e.message+'</div>'}
}

// ═══════════════════════════════════════
//  EXPORT / IMPORT
// ═══════════════════════════════════════
async function exportProductsJSON(){
  toast('JSON export başlıyor...','i');
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
    const a=document.createElement('a');a.href=url;a.download=`compair-products-${new Date().toISOString().split('T')[0]}.json`;
    a.click();URL.revokeObjectURL(url);
    logActivity('export',`JSON export: ${all.length} ürün`);
    toast(`${all.length} ürün JSON olarak dışa aktarıldı`,'s');
  }catch(e){toast('Export hatası: '+e.message,'e')}
}

async function exportProductsCSV(){
  toast('CSV export başlıyor...','i');
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
    const a=document.createElement('a');a.href=url;a.download=`compair-products-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();URL.revokeObjectURL(url);
    logActivity('export',`CSV export: ${all.length} ürün`);
    toast(`${all.length} ürün CSV olarak dışa aktarıldı`,'s');
  }catch(e){toast('Export hatası: '+e.message,'e')}
}

async function importProducts(){
  const input=document.createElement('input');input.type='file';input.accept='.json';
  input.onchange=async(e)=>{
    const file=e.target.files[0];if(!file)return;
    try{
      const text=await file.text();
      const products=JSON.parse(text);
      if(!Array.isArray(products)){toast('Geçersiz JSON formatı','e');return}
      if(!confirm(`${products.length} ürün içe aktarılacak. Devam edilsin mi?`))return;
      toast('İçe aktarma başlıyor...','i');
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
      logActivity('import',`JSON import: ${added} ürün eklendi/güncellendi, ${failed} başarısız`);
      toast(`İçe aktarma tamamlandı: ${added} ürün`,'s');
      loadProducts();
    }catch(e){toast('Import hatası: '+e.message,'e')}
  };
  input.click();
}

// ═══════════════════════════════════════
//  BULK OPERATIONS
// ═══════════════════════════════════════
async function bulkChangeCategory(){
  if(!selectedIds.size){toast('Önce ürün seçin','w');return}
  const cats=(typeof CompairCategories!=='undefined'&&CompairCategories.getAll)?CompairCategories.getAll():[];
  const catHtml=cats.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
  const modal=document.createElement('div');
  modal.className='modal-backdrop';modal.style.display='flex';
  modal.innerHTML=`<div class="modal-box" style="max-width:400px"><div class="modal-head"><h2>Kategori Değiştir</h2><button class="modal-x" onclick="this.closest('.modal-backdrop').remove()">✕</button></div><div class="modal-body"><p style="margin-bottom:12px">${selectedIds.size} ürün için yeni kategori seçin:</p><select class="input" id="bulkCatSelect">${catHtml}</select><div style="display:flex;gap:8px;margin-top:16px"><button class="btn btn-primary" id="bulkCatConfirm">Uygula</button><button class="btn btn-ghost" onclick="this.closest('.modal-backdrop').remove()">İptal</button></div></div></div>`;
  document.body.appendChild(modal);
  document.getElementById('bulkCatConfirm').onclick=async()=>{
    const newCat=document.getElementById('bulkCatSelect').value;
    if(!newCat)return;
    try{
      await Promise.all([...selectedIds].map(id=>pbUpdateDoc('products',id,{category:newCat,updatedAt:serverTimestamp()})));
      allProducts.forEach(p=>{if(selectedIds.has(p.id))p.category=newCat});
      logActivity('bulk_category',`${selectedIds.size} ürünün kategorisi "${newCat}" olarak değiştirildi`);
      toast(`${selectedIds.size} ürün güncellendi`,'s');
      modal.remove();deselectAll();renderProductsPage();
    }catch(e){toast('Hata: '+e.message,'e')}
  };
}

async function bulkChangeBrand(){
  if(!selectedIds.size){toast('Önce ürün seçin','w');return}
  const brands=(typeof CompairBrands!=='undefined')?CompairBrands:[];
  const brandHtml=brands.map(b=>`<option>${b}</option>`).join('');
  const modal=document.createElement('div');
  modal.className='modal-backdrop';modal.style.display='flex';
  modal.innerHTML=`<div class="modal-box" style="max-width:400px"><div class="modal-head"><h2>Marka Değiştir</h2><button class="modal-x" onclick="this.closest('.modal-backdrop').remove()">✕</button></div><div class="modal-body"><p style="margin-bottom:12px">${selectedIds.size} ürün için yeni marka seçin:</p><select class="input" id="bulkBrandSelect">${brandHtml}</select><div style="display:flex;gap:8px;margin-top:16px"><button class="btn btn-primary" id="bulkBrandConfirm">Uygula</button><button class="btn btn-ghost" onclick="this.closest('.modal-backdrop').remove()">İptal</button></div></div></div>`;
  document.body.appendChild(modal);
  document.getElementById('bulkBrandConfirm').onclick=async()=>{
    const newBrand=document.getElementById('bulkBrandSelect').value;
    if(!newBrand)return;
    try{
      await Promise.all([...selectedIds].map(id=>pbUpdateDoc('products',id,{brand:newBrand,updatedAt:serverTimestamp()})));
      allProducts.forEach(p=>{if(selectedIds.has(p.id))p.brand=newBrand});
      logActivity('bulk_brand',`${selectedIds.size} ürünün markası "${newBrand}" olarak değiştirildi`);
      toast(`${selectedIds.size} ürün güncellendi`,'s');
      modal.remove();deselectAll();renderProductsPage();
    }catch(e){toast('Hata: '+e.message,'e')}
  };
}

// ═══════════════════════════════════════
//  BROKEN IMAGE DETECTION
// ═══════════════════════════════════════
async function scanBrokenImages(){
  toast('Kırık görsel taraması başlıyor...','i');
  const el=document.getElementById('brokenImageResults');
  if(el)el.innerHTML='<div class="placeholder"><div class="spinner" style="margin:0 auto 8px"></div>Taranıyor...</div>';
  try{
    const products=allProducts.length?allProducts:[];
    if(!products.length){toast('Önce Products sayfasını açın','w');return}
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
        el.innerHTML=`<div class="placeholder" style="color:var(--green)">✅ ${checked} görsel kontrol edildi, sorun yok</div>`;
      }else{
        el.innerHTML=`<div style="margin-bottom:8px;color:var(--amber)">⚠️ ${broken.length}/${checked} kırık görsel bulundu:</div>`+
          broken.map(p=>`<div class="log-row"><span class="log-icon">🖼️</span><div class="log-info"><div class="log-detail">${p.name||p.id}</div><div class="log-meta">${p.category||''} · ${p.brand||''}</div></div></div>`).join('');
      }
    }
    toast(`Tarama tamamlandı: ${broken.length} kırık görsel`,'i');
  }catch(e){toast('Hata: '+e.message,'e')}
}

// ═══════════════════════════════════════
//  PRICE HISTORY (simple view)
// ═══════════════════════════════════════
async function loadPriceHistory(productId){
  // Price history subcollections not available in PocketBase
  return null;
}
