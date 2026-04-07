// ═══════════════════════════════════════
//  COMPAIR ADMIN WEB
// ═══════════════════════════════════════

firebase.initializeApp({
  apiKey: 'AIzaSyA_YqZli9PSPeCzYl2x9FBv5SYK-m0kpEg',
  authDomain: 'compair-99b6e.firebaseapp.com',
  projectId: 'compair-99b6e',
  storageBucket: 'compair-99b6e.firebasestorage.app',
  messagingSenderId: '510980756238',
  appId: '1:510980756238:web:b21d1e3613561d7c69fd5f'
});

const db = firebase.firestore();
const auth = firebase.auth();

// ── ADMIN AUTH ──

async function checkAdmin(user) {
  try {
    const doc = await db.collection('app_config').doc('admins').get();
    if (!doc.exists) return false;
    const emails = doc.data().emails || [];
    return emails.includes(user.email);
  } catch (e) {
    console.error('Admin check failed:', e);
    return false;
  }
}

function showUnauthorized(email) {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appContainer').style.display = 'none';
  // Create unauthorized screen
  let el = document.getElementById('unauthScreen');
  if (!el) {
    el = document.createElement('div');
    el.id = 'unauthScreen';
    el.className = 'unauth-screen';
    el.innerHTML = `<div class="unauth-card">
      <div style="font-size:48px;margin-bottom:16px">🚫</div>
      <h2>Access Denied</h2>
      <p>The account <strong>${email}</strong> is not authorized to access the admin panel.</p>
      <button class="btn btn-primary" onclick="auth.signOut()" style="margin-right:8px">Sign Out</button>
    </div>`;
    document.body.appendChild(el);
  }
  el.style.display = 'flex';
}

// Don't persist auth across sessions — require explicit login each time
auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);

auth.onAuthStateChanged(async user => {
  // Always hide loading
  document.getElementById('loginLoading').style.display = 'none';

  const unauthEl = document.getElementById('unauthScreen');
  if (unauthEl) unauthEl.style.display = 'none';

  if (user) {
    try {
      const isAdm = await checkAdmin(user);
      if (!isAdm) { showUnauthorized(user.email); return; }

      document.getElementById('loginScreen').style.display = 'none';
      document.getElementById('appContainer').style.display = '';
      document.getElementById('sidebarUser').textContent = user.email;
      refreshDashboard();
    } catch (e) {
      console.error('Auth error:', e);
      document.getElementById('loginError').textContent = 'Error: ' + e.message;
      document.getElementById('loginScreen').style.display = 'flex';
    }
  } else {
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('appContainer').style.display = 'none';
  }
});

async function loginWithGoogle() {
  document.getElementById('loginError').textContent = '';
  document.getElementById('loginLoading').style.display = 'flex';
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const result = await auth.signInWithPopup(provider);
    console.log('Google login success:', result.user.email);
  } catch (e) {
    document.getElementById('loginLoading').style.display = 'none';
    const msg = e.message || '';
    if (msg.includes('unauthorized-domain')) {
      document.getElementById('loginError').textContent = 'Domain not authorized. Go to Firebase Console > Authentication > Settings > Authorized domains and add: ' + window.location.hostname;
    } else if (msg.includes('popup-closed') || msg.includes('cancelled')) {
      document.getElementById('loginError').textContent = 'Login cancelled';
    } else {
      document.getElementById('loginError').textContent = msg.replace('Firebase: ', '');
    }
    console.error('Google login error:', e);
  }
}

function logout() { auth.signOut(); }

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
  if(name==='scraper'){checkProxy();populateScraperCategories()}
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
    let users;
    const [uSnap,cSnap]=await Promise.all([db.collection('users').get(),db.collection('comparisons').get()]);
    users=uSnap.docs.map(d=>({uid:d.id,...d.data()}));

    // Load 500 recent products for charts
    const sSnap=await db.collection('products').orderBy('scrapedAt','desc').limit(500).get();
    const sampleProducts=sSnap.docs.map(d=>({id:d.id,...d.data()}));
    dashSampleProducts=sampleProducts;

    // Don't show sample count as total — wait for real count
    document.getElementById('dashTotalProducts').textContent='...';
    anim('dashTotalUsers',users.length);
    anim('dashTotalComparisons',cSnap.size);

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

// Background product counter — always does a fresh count (no stale cache)
let _bgCountRunning=false;
async function countAllProductsInBackground(){
  if(_bgCountRunning)return;
  _bgCountRunning=true;
  try{
    // Always do a fresh count to avoid stale cache issues
    let cnt=0,lastD=null;
    const catCounts={};
    const brandCounts={};
    while(true){
      let q=db.collection('products').orderBy('__name__').limit(1000);
      if(lastD)q=q.startAfter(lastD);
      const snap=await q.get();
      if(snap.empty)break;
      cnt+=snap.size;
      snap.docs.forEach(d=>{
        const data=d.data();
        if(data.category)catCounts[data.category]=(catCounts[data.category]||0)+1;
        if(data.brand)brandCounts[data.brand]=(brandCounts[data.brand]||0)+1;
      });
      lastD=snap.docs[snap.docs.length-1];
      document.getElementById('dashTotalProducts').textContent=cnt.toLocaleString();
      if(snap.size<1000)break;
    }
    totalProductCount=cnt;
    dashProductTotal=cnt;
    document.getElementById('dashTotalProducts').textContent=cnt.toLocaleString();
    const el=document.getElementById('productCount');
    if(el)el.textContent=cnt.toLocaleString();
    // Update category chart with REAL data from all products
    updateCategoryChart(catCounts);
    // Update top brands with REAL data
    updateTopBrands(brandCounts);
    // Update insights with REAL data
    updateInsights(cnt,Object.keys(catCounts).length);
    // Cache for faster initial load next time
    db.collection('app_config').doc('stats').set({productCount:cnt,categoryCounts:catCounts,brandCounts:brandCounts,updatedAt:new Date().toISOString()},{merge:true}).catch(()=>{});
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
let lastDoc=null,firstDoc=null,pageStack=[],totalProductCount=0;
const PER=50;

async function loadProducts(){
  const g=document.getElementById('productGrid');
  g.innerHTML='<div class="placeholder"><div class="spinner" style="margin:0 auto 8px"></div>Ürünler yükleniyor...</div>';
  try{
    // Load first page IMMEDIATELY — no counting, no blocking
    currentPage=1;pageStack=[];lastDoc=null;firstDoc=null;
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

function buildQuery(simpleSort){
  let q=db.collection('products');
  const brand=document.getElementById('brandFilter')?.value||'';
  const cat=document.getElementById('categoryFilter')?.value||'';
  const sort=document.getElementById('sortFilter')?.value||'newest';

  if(brand)q=q.where('brand','==',brand);
  if(cat)q=q.where('category','==',cat);

  if(simpleSort){
    q=q.orderBy('__name__');
  }else{
    switch(sort){
      case'newest':q=q.orderBy('scrapedAt','desc');break;
      case'oldest':q=q.orderBy('scrapedAt','asc');break;
      case'name-az':q=q.orderBy('name','asc');break;
      case'score-high':q=q.orderBy('techScore','desc');break;
      default:q=q.orderBy('__name__');
    }
  }
  return q;
}

async function loadPage(direction){
  const g=document.getElementById('productGrid');
  try{
    let q=buildQuery();

    if(direction==='next'&&lastDoc){
      q=q.startAfter(lastDoc);
    }else if(direction==='prev'&&pageStack.length>1){
      pageStack.pop();
      const prevFirst=pageStack[pageStack.length-1];
      q=q.startAt(prevFirst);
    }

    q=q.limit(PER);
    const snap=await q.get();

    if(snap.empty&&direction==='next'){toast('Son sayfa','i');return}
    if(snap.empty){
      g.innerHTML='<div class="placeholder">Ürün bulunamadı. Filtreleri değiştirmeyi deneyin.</div>';
      document.getElementById('pagination').innerHTML='';
      return;
    }

    allProducts=snap.docs.map(d=>({id:d.id,...d.data()}));
    displayProducts=allProducts;

    firstDoc=snap.docs[0];
    lastDoc=snap.docs[snap.docs.length-1];
    if(direction!=='prev'){pageStack.push(firstDoc)}

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
    if((e.code===9||e.message?.includes('index'))&&!direction){
      // Index missing — retry with __name__ sort, then apply client-side sort
      console.warn('Index error, retrying with simple sort + client-side sort...');
      try{
        let q2=buildQuery(true);
        q2=q2.limit(PER*4); // fetch more for better client-side sort
        const snap2=await q2.get();
        if(!snap2.empty){
          allProducts=snap2.docs.map(d=>({id:d.id,...d.data()}));
          // Apply client-side sort matching the dropdown
          const sort=document.getElementById('sortFilter')?.value||'newest';
          allProducts.sort((a,b)=>{
            switch(sort){
              case'newest':return(pDate(b)-pDate(a));
              case'oldest':return(pDate(a)-pDate(b));
              case'name-az':return(a.name||'').localeCompare(b.name||'');
              case'score-high':return(b.techScore||0)-(a.techScore||0);
              default:return 0;
            }
          });
          allProducts=allProducts.slice(0,PER);
          displayProducts=allProducts;
          firstDoc=snap2.docs[0];
          lastDoc=snap2.docs[snap2.docs.length-1];
          pageStack.push(firstDoc);
          renderProductsPage();
          return;
        }
      }catch(e2){console.error('Fallback also failed:',e2)}
    }
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
  const hasNext=displayProducts.length>=PER;
  const hasPrev=pageStack.length>1;
  let h='';
  if(hasPrev||hasNext){
    h+=`<button class="pg-btn" ${hasPrev?'':`disabled`} onclick="prevPage()">◀ Önceki</button>`;
    h+=`<span class="pg-btn" style="cursor:default;font-weight:600">Sayfa ${currentPage}</span>`;
    h+=`<button class="pg-btn" ${hasNext?'':`disabled`} onclick="nextPage()">Sonraki ▶</button>`;
    if(totalProductCount)h+=`<span class="pg-btn" style="cursor:default;opacity:.6;font-size:12px">${totalProductCount.toLocaleString()} ürün</span>`;
  }
  pEl.innerHTML=h;
}

async function nextPage(){currentPage++;await loadPage('next');scrollTop()}
async function prevPage(){if(currentPage>1){currentPage--;await loadPage('prev');scrollTop()}}

async function serverSearch(){
  const q=(document.getElementById('searchInput')?.value||'').trim();
  if(!q){currentPage=1;pageStack=[];lastDoc=null;firstDoc=null;await loadPage();return}
  // Cancel any previous search
  if(searchAbort)searchAbort.cancelled=true;
  const thisSearch={cancelled:false};
  searchAbort=thisSearch;
  const g=document.getElementById('productGrid');
  g.innerHTML='<div class="placeholder"><div class="spinner" style="margin:0 auto 8px"></div>Aranıyor...</div>';
  try{
    const ql=q.toLowerCase();
    const slug=ql.replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'');
    const seen=new Set();
    const results=[];

    // Strategy 1: Parallel ID prefix queries (fast — uses primary index)
    const idQueries=[];
    // Direct slug prefix
    idQueries.push(db.collection('products').orderBy('__name__').startAt(slug).endAt(slug+'\uf8ff').limit(50).get());
    // Brand-slug prefix for top brands
    const brands=(typeof CompairBrands!=='undefined'?CompairBrands:[]).map(b=>typeof b==='string'?b:b.name||'');
    for(const brand of brands){
      const bs=brand.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'');
      if(!bs)continue;
      const combined=bs+'-'+slug;
      idQueries.push(db.collection('products').orderBy('__name__').startAt(combined).endAt(combined+'\uf8ff').limit(50).get());
    }

    const snaps=await Promise.all(idQueries);
    if(thisSearch.cancelled)return;
    for(const snap of snaps){
      for(const doc of snap.docs){
        if(!seen.has(doc.id)){
          seen.add(doc.id);
          results.push({id:doc.id,...doc.data()});
        }
      }
    }

    // Strategy 2: If few results, do a limited scan for substring match
    if(results.length<10&&!thisSearch.cancelled){
      let query2=db.collection('products').orderBy('__name__').limit(2000);
      let scanned=0;
      while(results.length<50&&scanned<8000&&!thisSearch.cancelled){
        const snap2=await query2.get();
        if(thisSearch.cancelled)return;
        if(snap2.empty)break;
        scanned+=snap2.size;
        for(const doc of snap2.docs){
          if(seen.has(doc.id))continue;
          const d=doc.data();
          if(doc.id.includes(slug)||(d.name||'').toLowerCase().includes(ql)||(d.brand||'').toLowerCase().includes(ql)){
            seen.add(doc.id);
            results.push({id:doc.id,...d});
          }
        }
        if(snap2.size<2000)break;
        query2=db.collection('products').orderBy('__name__').startAfter(snap2.docs[snap2.docs.length-1]).limit(2000);
      }
    }

    if(thisSearch.cancelled)return;

    // Sort results — exact ID match first, then by name
    results.sort((a,b)=>{
      const aExact=a.id.startsWith(slug)?0:1;
      const bExact=b.id.startsWith(slug)?0:1;
      if(aExact!==bExact)return aExact-bExact;
      return(a.name||'').localeCompare(b.name||'');
    });

    displayProducts=results;
    allProducts=results;
    renderProductsPage();
    document.getElementById('productCount').textContent=results.length+' sonuç';
    if(!results.length)toast('"'+q+'" için sonuç bulunamadı','i');
  }catch(e){if(!thisSearch.cancelled)g.innerHTML='<div class="placeholder" style="color:var(--red)">Arama hatası: '+e.message+'</div>'}
}

function filterProducts(){
  currentPage=1;pageStack=[];lastDoc=null;firstDoc=null;
  loadPage();
}
function pDate(p){return p.scrapedAt?new Date(p.scrapedAt).getTime():p.updatedAt?.seconds?p.updatedAt.seconds*1e3:0}

// Old renderProducts replaced by renderProductsPage above
function scrollTop(){document.querySelector('.main-content').scrollTo(0,0)}
function handleCardClick(e,id){if(e.target.type==='checkbox')return;if(selectedIds.size>0){toggleSel(id);return}openProduct(id)}
function toggleSel(id){if(selectedIds.has(id))selectedIds.delete(id);else selectedIds.add(id);renderProductsPage();const bar=document.getElementById('selectionBar');if(selectedIds.size>0){bar.style.display='flex';document.getElementById('selectionCount').textContent=selectedIds.size+' seçildi'}else bar.style.display='none'}
function selectAll(){displayProducts.forEach(p=>selectedIds.add(p.id));renderProductsPage();document.getElementById('selectionBar').style.display='flex';document.getElementById('selectionCount').textContent=selectedIds.size+' seçildi'}
function deselectAll(){selectedIds.clear();renderProductsPage();document.getElementById('selectionBar').style.display='none'}
async function deleteSelected(){if(!selectedIds.size||!confirm(selectedIds.size+' ürünü silmek istediğinize emin misiniz?'))return;const b=db.batch();selectedIds.forEach(id=>b.delete(db.collection('products').doc(id)));try{await b.commit();logActivity('product_delete',`${selectedIds.size} ürün toplu silindi`);allProducts=allProducts.filter(p=>!selectedIds.has(p.id));totalProductCount-=selectedIds.size;selectedIds.clear();loadPage();toast('Silindi','s')}catch(e){toast('Hata: '+e.message,'e')}document.getElementById('selectionBar').style.display='none'}
function toggleViewMode(){viewMode=viewMode==='grid'?'list':'grid';const g=document.getElementById('productGrid');g.classList.toggle('list-view',viewMode==='list');renderProductsPage()}

// Search debounce — server-side search with cancellation
let sTimer,searchAbort=null;
document.addEventListener('DOMContentLoaded',()=>{const si=document.getElementById('searchInput');if(si)si.addEventListener('input',()=>{clearTimeout(sTimer);if(searchAbort){searchAbort.cancelled=true}sTimer=setTimeout(serverSearch,800)})});

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
  if(imageUrl){updates.imageUrl=imageUrl;updates.images=firebase.firestore.FieldValue.arrayUnion(imageUrl)}
  updates.updatedAt=firebase.firestore.FieldValue.serverTimestamp();
  updates.updatedBy=auth.currentUser?.email||'admin';
  try{
    await db.collection('products').doc(id).update(updates);
    logActivity('product_edit',`Ürün düzenlendi: ${name||id}`,{productId:id,changes:Object.keys(updates)});
    const mem=allProducts.find(p=>p.id===id);
    if(mem)Object.assign(mem,{name,brand,category,price_raw:price,techScore:score});
    toast('Ürün güncellendi','s');closeModal();renderProductsPage();
  }catch(e){toast('Hata: '+e.message,'e')}
}
async function deleteProduct(id){if(!confirm('Bu ürünü silmek istediğinize emin misiniz?'))return;try{await db.collection('products').doc(id).delete();logActivity('product_delete',`Ürün silindi: ${id}`);allProducts=allProducts.filter(p=>p.id!==id);totalProductCount--;loadPage();toast('Silindi','s')}catch(e){toast('Hata: '+e.message,'e')}}

// ═══════════════════════════════════════
//  USERS
// ═══════════════════════════════════════
let allUsers=[],filteredUsers=[],userPage=1;const UPER=50;

async function loadUsers(){
  try{const snap=await db.collection('users').get();allUsers=snap.docs.map(d=>({uid:d.id,...d.data()}));const prem=allUsers.filter(u=>u.isPremium).length;const active=allUsers.filter(u=>{const la=u.lastActive?.seconds?new Date(u.lastActive.seconds*1e3):null;return la&&la>new Date(Date.now()-30*864e5)}).length;
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
function uDate(u){return u.createdAt?.seconds?u.createdAt.seconds*1e3:0}

function renderUsers(){
  const list=document.getElementById('userList'),start=(userPage-1)*UPER,page=filteredUsers.slice(start,start+UPER);
  if(!page.length){list.innerHTML='<div class="placeholder">No users</div>';return}
  let h='<div class="user-hdr"><span></span><span>User</span><span>Country</span><span>Status</span><span>Joined</span></div>';
  h+=page.map(u=>{const av=u.photoURL?`<img src="${u.photoURL}">`:(u.displayName||u.email||'?').charAt(0).toUpperCase();const j=u.createdAt?.seconds?new Date(u.createdAt.seconds*1e3).toLocaleDateString():'';return`<div class="user-row" onclick="openUserDetail('${u.uid}')"><div class="user-avatar">${av}</div><div><div class="user-name">${u.displayName||'Anonymous'}</div><div class="user-email">${u.email||''}</div></div><span style="font-size:12px">${u.country||'—'}</span><span>${u.isPremium?'<span class="badge badge-premium">Premium</span>':'<span class="badge badge-ghost">Free</span>'}</span><span style="font-size:11px;color:var(--text2)">${j}</span></div>`}).join('');
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
  const j=u.createdAt?.seconds?new Date(u.createdAt.seconds*1e3):'';
  const la=u.lastActive?.seconds?new Date(u.lastActive.seconds*1e3):'';
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
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px">
      <div class="user-avatar" style="width:56px;height:56px;font-size:20px">${u.photoURL?`<img src="${u.photoURL}">`:(u.displayName||'?').charAt(0).toUpperCase()}</div>
      <div style="flex:1">
        <div style="font-size:16px;font-weight:700">${u.displayName||'Anonim'}</div>
        <div style="font-size:12px;color:var(--text2)">${u.email||''}</div>
        <div style="font-size:11px;color:${actColor};margin-top:2px">${activityStatus}</div>
      </div>
      <div>${u.isPremium?'<span class="badge badge-premium" style="font-size:12px;padding:6px 12px">Premium</span>':'<span class="badge badge-ghost" style="font-size:12px;padding:6px 12px">Free</span>'}</div>
    </div>
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
    </div>`;
  document.getElementById('userModal').style.display='flex';
}
function closeUserModal(){document.getElementById('userModal').style.display='none'}
async function togglePremium(uid,v){try{await db.collection('users').doc(uid).update({isPremium:v});const u=allUsers.find(x=>x.uid===uid);if(u)u.isPremium=v;openUserDetail(uid);loadUsers();toast(v?'Upgraded':'Downgraded','s')}catch(e){toast('Error: '+e.message,'e')}}
async function deleteUser(uid){
  if(!confirm('Delete this user? This will remove their account from both Firestore and Firebase Authentication.'))return;
  try{
    const fn=firebase.app().functions('europe-west1');
    const del=fn.httpsCallable('deleteUserAccount');
    await del({uid});
    allUsers=allUsers.filter(u=>u.uid!==uid);closeUserModal();filterUsers();toast('User fully deleted','s');
  }catch(e){toast('Error: '+e.message,'e')}
}

// ═══════════════════════════════════════
//  APP CONTROL
// ═══════════════════════════════════════
async function loadAppConfig(){try{const d=await db.collection('app_config').doc('main').get();if(!d.exists)return;const c=d.data();const f=['adsEnabled','adBannerUnitId','adInterstitialUnitId','adRewardedUnitId','adFrequency','adsPremiumFree','homeBannerTitle','homeBannerSubtitle','homeFeaturedCategories','homeFeaturedCount','maintenanceEnabled','maintenanceMessage','appMinVersion','appForceUpdate','appLatestVersion','appUpdateUrl'];f.forEach(k=>{const el=document.getElementById(k);if(!el)return;if(el.type==='checkbox')el.checked=!!c[k];else el.value=c[k]||''})}catch(e){toast('Config error: '+e.message,'e')}}

async function saveAppConfig(){
  const c={};['adBannerUnitId','adInterstitialUnitId','adRewardedUnitId','homeBannerTitle','homeBannerSubtitle','homeFeaturedCategories','maintenanceMessage','appMinVersion','appLatestVersion','appUpdateUrl'].forEach(k=>{const el=document.getElementById(k);if(el)c[k]=el.value});
  ['adsEnabled','adsPremiumFree','maintenanceEnabled','appForceUpdate'].forEach(k=>{const el=document.getElementById(k);if(el)c[k]=el.checked});
  ['adFrequency','homeFeaturedCount'].forEach(k=>{const el=document.getElementById(k);if(el)c[k]=parseInt(el.value)||0});
  c.updatedAt=firebase.firestore.FieldValue.serverTimestamp();
  try{await db.collection('app_config').doc('main').set(c,{merge:true});toast('Saved','s')}catch(e){toast('Error: '+e.message,'e')}
}

async function sendPushNotification(){
  const title=document.getElementById('pushTitle').value,body=document.getElementById('pushBody').value,topic=document.getElementById('pushTopic').value;
  if(!title||!body){toast('Title & message required','w');return}
  try{await db.collection('notifications').add({title,body,topic,sentAt:firebase.firestore.FieldValue.serverTimestamp(),sentBy:auth.currentUser?.email||'admin'});toast('Notification queued','s');document.getElementById('pushTitle').value='';document.getElementById('pushBody').value='';document.getElementById('pushResult').innerHTML='<span style="color:var(--green)">Sent!</span>'}catch(e){toast('Error: '+e.message,'e')}
}

async function loadNotificationHistory(){
  try{const snap=await db.collection('notifications').orderBy('sentAt','desc').limit(50).get();const el=document.getElementById('notificationHistory');if(snap.empty){el.innerHTML='<p class="text-muted">No notifications yet</p>';return}
  el.innerHTML=snap.docs.map(d=>{const n=d.data();const dt=n.sentAt?.seconds?new Date(n.sentAt.seconds*1e3).toLocaleString():'—';return`<div class="notif-item"><div style="display:flex;justify-content:space-between;margin-bottom:3px"><strong style="font-size:13px">${n.title||''}</strong><span style="font-size:10px;color:var(--text3)">${dt}</span></div><div style="font-size:12px;color:var(--text2)">${n.body||''}</div><div style="font-size:10px;color:var(--text3);margin-top:2px">${n.topic||'all'} · ${n.sentBy||''}</div></div>`}).join('')}catch(e){toast('Error: '+e.message,'e')}
}

// ═══════════════════════════════════════
//  ALGORITHM
// ═══════════════════════════════════════
function updateAlgoLabel(input){const id=input.id.replace(/^(weight|boost)/,'label');const el=document.getElementById(id);if(el)el.textContent=input.value+'%'}

async function loadAlgorithmConfig(){try{const d=await db.collection('app_config').doc('algorithm').get();if(!d.exists)return;const c=d.data();['weightPersonalFit','weightExpert','weightCommunity','weightPricePerf','boostCategoryView','boostSearch','boostQuiz','boostCompare','boostEcosystem','boostBudget','minYear','maxPerBrand','trendingCount','newArrivalsCount'].forEach(f=>{const el=document.getElementById(f);if(el&&c[f]!==undefined){el.value=c[f];updateAlgoLabel(el)}});if(c.brandBlacklist)document.getElementById('brandBlacklist').value=c.brandBlacklist;if(c.brandBoost)document.getElementById('brandBoost').value=c.brandBoost}catch(e){console.error(e)}}

async function saveAlgorithmConfig(){
  const c={};['weightPersonalFit','weightExpert','weightCommunity','weightPricePerf','boostCategoryView','boostSearch','boostQuiz','boostCompare','boostEcosystem','boostBudget','minYear','maxPerBrand','trendingCount','newArrivalsCount'].forEach(f=>{const el=document.getElementById(f);if(el)c[f]=parseInt(el.value)||0});
  c.brandBlacklist=document.getElementById('brandBlacklist').value;c.brandBoost=document.getElementById('brandBoost').value;
  c.updatedAt=firebase.firestore.FieldValue.serverTimestamp();
  try{await db.collection('app_config').doc('algorithm').set(c,{merge:true});toast('Saved','s')}catch(e){toast('Error: '+e.message,'e')}
}

// ═══════════════════════════════════════
//  ACTIVITY LOG
// ═══════════════════════════════════════
async function logActivity(action,detail,meta={}){
  try{
    await db.collection('admin_logs').add({
      action,detail,...meta,
      admin:auth.currentUser?.email||'unknown',
      timestamp:firebase.firestore.FieldValue.serverTimestamp()
    });
  }catch(e){console.warn('Log error:',e)}
}

let activityLogPage=1;
async function loadActivityLog(){
  const el=document.getElementById('activityLogList');
  if(!el)return;
  el.innerHTML='<div class="placeholder"><div class="spinner" style="margin:0 auto 8px"></div>Yükleniyor...</div>';
  try{
    const snap=await db.collection('admin_logs').orderBy('timestamp','desc').limit(100).get();
    if(snap.empty){el.innerHTML='<div class="placeholder">Henüz aktivite yok</div>';return}
    const logs=snap.docs.map(d=>({id:d.id,...d.data()}));
    const actionIcons={product_edit:'✏️',product_delete:'🗑️',product_add:'➕',user_delete:'👤',user_premium:'⭐',bulk_category:'📂',bulk_brand:'🏷️',export:'📤',import:'📥'};
    el.innerHTML=logs.map(l=>{
      const ts=l.timestamp?.seconds?new Date(l.timestamp.seconds*1e3).toLocaleString('tr-TR'):'—';
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
    let all=[];let lastD=null;
    while(true){
      let q=db.collection('products').orderBy('__name__').limit(1000);
      if(lastD)q=q.startAfter(lastD);
      const snap=await q.get();
      if(snap.empty)break;
      snap.docs.forEach(d=>all.push({id:d.id,...d.data()}));
      lastD=snap.docs[snap.docs.length-1];
      if(snap.size<1000)break;
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
    let all=[];let lastD=null;
    while(true){
      let q=db.collection('products').orderBy('__name__').limit(1000);
      if(lastD)q=q.startAfter(lastD);
      const snap=await q.get();
      if(snap.empty)break;
      snap.docs.forEach(d=>all.push({id:d.id,...d.data()}));
      lastD=snap.docs[snap.docs.length-1];
      if(snap.size<1000)break;
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
      let added=0,updated=0,failed=0;
      // Batch write in chunks of 500
      for(let i=0;i<products.length;i+=500){
        const batch=db.batch();
        const chunk=products.slice(i,i+500);
        for(const p of chunk){
          if(!p.id||!p.name){failed++;continue}
          const ref=db.collection('products').doc(p.id);
          // Remove Firestore-incompatible fields
          const clean={...p};
          delete clean._originalName;delete clean._originalSpecs;
          delete clean._originalSections;delete clean._originalKeySpecs;
          batch.set(ref,clean,{merge:true});
          added++;
        }
        await batch.commit();
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
      const batch=db.batch();
      selectedIds.forEach(id=>batch.update(db.collection('products').doc(id),{category:newCat,updatedAt:firebase.firestore.FieldValue.serverTimestamp()}));
      await batch.commit();
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
      const batch=db.batch();
      selectedIds.forEach(id=>batch.update(db.collection('products').doc(id),{brand:newBrand,updatedAt:firebase.firestore.FieldValue.serverTimestamp()}));
      await batch.commit();
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
  try{
    const snap=await db.collection('products').doc(productId).collection('price_history').orderBy('date','desc').limit(30).get();
    if(snap.empty)return null;
    return snap.docs.map(d=>d.data());
  }catch{return null}
}
