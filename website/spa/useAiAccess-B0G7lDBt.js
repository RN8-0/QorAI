import{pb as _,PB_URL as ce}from"./pocketbase-CdRYmAcS.js";import{e as ke,u as Se,d as Ee}from"./vendor-Bi2ZEaFz.js";import{ax as Ae,T as Te,as as Ne,I as te,z as Re}from"./index-CtEllatt.js";let z=null,ne=0;async function Ie(){const n=Date.now();if(z&&n-ne<5*60*1e3)return z;try{const t=await _.collection("public_config").getFirstListItem('key = "ai_prompts"'),e=t&&t.value;z=e&&typeof e=="object"?e:{}}catch{z={}}return ne=n,z}async function Y(n,t){try{const e=await Ie(),i=e?e[n]:null,r=(i==null?"":String(i)).trim();if(r.length>=40)return r}catch{}return t}const Oe=`${ce}/api/ai/gemini`,Ce="gemini-2.5-flash",Le=`${ce}/api/ai/deepseek`,$e="deepseek-chat",Ue=8192,qe={tr:"Turkish",en:"English",de:"German",es:"Spanish",fr:"French",it:"Italian",pt:"Portuguese",ru:"Russian",nl:"Dutch",pl:"Polish",sv:"Swedish",ja:"Japanese",ar:"Arabic"};function le(n="en"){const t=String(n||"en").slice(0,2).toLowerCase();return qe[t]||"English"}const Pe=`You are Qor AI — a friendly, sharp shopping and product advisor for ALL product categories (technology, audio, photo, home, fashion and more) on qorai.net.
- KEEP IT SHORT AND SCANNABLE. Lead with a one- or two-sentence direct answer, then at most 3-4 short bullets ONLY if they truly add value. No long essays, no restating the question, no filler. A simple question gets a simple 1-2 sentence reply.
- BE SPECIFIC, NOT GENERIC. When recommending, name real, current products/models (e.g. "Lenovo LOQ 15 (RTX 4060)") — NEVER answer with vague component advice like "look for an i7 with an RTX 4050". Give 2-3 concrete named picks, each with a one-line reason and, when the context provides it, an approximate current price. If you truly cannot name specific models, say so plainly instead of padding with generic advice.
- Any product, comparison, page, "QOR CATALOG DATA" or "LIVE WEB RESEARCH" context you are given is the CURRENT, live truth — trust it over your older memory. If a product appears there it EXISTS; NEVER say a product does not exist, is fake, or has not launched when it is in that context or in the web research.
- With QOR CATALOG DATA: answer from those exact Qor specs and the listed Qor price, and prefer recommending those on-site products (you may share their Qor page link). With LIVE WEB RESEARCH: use it for current launch status, specs, current prices and specific model names. If neither is given and you are unsure whether something exists or its current status, do NOT guess "not released" — say plainly what you are unsure about and what to check on the store/official page.
- Recommend with honest trade-offs: who it is for, who should skip it, and one or two alternatives when useful — briefly.
- Prices/availability change: never invent an exact price; use the Qor price or the LIVE WEB RESEARCH price when provided, otherwise say to check the local store.
- Plain text only: no Markdown headings (#, ##), no code fences, no tables, no raw JSON. Use short "Label:" lines and normal sentences or "- " bullets.
- Never mention backend providers, model names or internal tooling; if asked what powers you, answer as Qor AI.
- Address the person directly ("you" / "sen" / "siz"), never "the user".`;function ze(n="en",t="",e={}){const i=le(n),r=new Date().toISOString().slice(0,10),o=String(e.country||"").toUpperCase(),s=String(e.currency||"").toUpperCase(),a=o?`
- LOCAL MARKET: The person is in ${o}${s?` and shops in ${s}`:""}. Whenever you mention a price, budget or value, use ${s||"their local currency"} and that market's typical pricing — NEVER quote another country's currency (e.g. do not give Turkish Lira to a non-Turkish user, or USD to a Turkish user). If you don't know the local price, say it should be checked on the local store instead of guessing in the wrong currency.`:"";return`${Pe}
- TODAY'S DATE is ${r}. Your own training knowledge is older than this and is stale for recent products, launches, subscription plans and prices. NEVER say something "doesn't exist", "isn't out yet", "hasn't launched" or "is only a rumor" from your own memory — a phone/product that would normally ship by ${r} is already out. Trust the QOR CATALOG DATA and LIVE WEB RESEARCH context for what is real and current; if neither covers it, say you'd verify the latest status rather than asserting it is unreleased.
- SITE LANGUAGE: Reply only in ${i}. Keep official product and brand names as-is.
- If the person writes in another language, still answer in ${i} because the site language is ${i}.${a}
${t?`
QOR CATALOG / PAGE CONTEXT:
${t}`:""}`}const V=n=>new Promise(t=>setTimeout(t,n));function ue(n){return n===404||n===429||n===500||n===502||n===503||n===504}function he(n){return n===500||n===502||n===503||n===504}async function de(n,t,e=9e4){const i=new AbortController,r=setTimeout(()=>i.abort(),e),o={"Content-Type":"application/json"};try{_&&_.authStore&&_.authStore.token&&(o.Authorization=_.authStore.token)}catch{}try{return await fetch(n,{method:"POST",headers:o,body:JSON.stringify(t),signal:i.signal})}finally{clearTimeout(r)}}async function me({system:n,messages:t,maxOutputTokens:e,temperature:i,tools:r,jsonMode:o,timeoutMs:s}){var h,f,C,T,N;const a={temperature:i,maxOutputTokens:e,thinkingConfig:{thinkingBudget:0}};o&&(a.responseMimeType="application/json");const m={model:Ce,systemInstruction:{parts:[{text:n}]},contents:t.map(v=>({role:v.role==="assistant"?"model":v.role,parts:[{text:v.content}]})),generationConfig:a};Array.isArray(r)&&r.length&&(m.tools=r);const d=await de(Oe,m,s);if(!d.ok){const v=new Error(`gemini ${d.status}`);throw v.transient=ue(d.status),v.retryable=he(d.status),v}const p=await d.json(),c=(N=(T=(C=(f=(h=p==null?void 0:p.candidates)==null?void 0:h[0])==null?void 0:f.content)==null?void 0:C.parts)==null?void 0:T[0])==null?void 0:N.text;if(!c){const v=new Error("gemini empty");throw v.transient=!0,v}return c.trim()}async function _e({system:n,messages:t,maxOutputTokens:e,temperature:i,jsonMode:r,timeoutMs:o}){var p,c,h;const s={model:$e,messages:[{role:"system",content:n},...t],max_tokens:Math.min(e,Ue),temperature:i};r&&(s.response_format={type:"json_object"});const a=await de(Le,s,o);if(!a.ok){const f=new Error(`deepseek ${a.status}`);throw f.transient=ue(a.status),f.retryable=he(a.status),f}const m=await a.json();if(m&&m.error){const f=new Error(`deepseek ${m.error}`);throw f.transient=String(m.error)==="rate_limited",f}const d=(h=(c=(p=m==null?void 0:m.choices)==null?void 0:p[0])==null?void 0:c.message)==null?void 0:h.content;if(!d){const f=new Error("deepseek empty");throw f.transient=!0,f}return d.trim()}async function pe({system:n,messages:t,maxOutputTokens:e=4096,temperature:i=.7,jsonMode:r=!1,tools:o=null,timeoutMs:s=9e4,budgetMs:a=null}){const m=Date.now()+(a||s*2),d=()=>m-Date.now();let p;for(let c=0;c<2&&!(d()<=2e3);c++)try{return await me({system:n,messages:t,maxOutputTokens:e,temperature:i,tools:o,jsonMode:r,timeoutMs:Math.min(s,d())})}catch(h){if(p=h,!h.retryable||c===1)break;await V(1200)}for(let c=0;c<2&&!(d()<=2e3);c++)try{return await _e({system:n,messages:t,maxOutputTokens:e,temperature:i,jsonMode:r,timeoutMs:Math.min(s,d())})}catch(h){if(p=h,!h.retryable||c===1)break;await V(1200)}throw p||new Error("AI failed")}async function De({system:n,user:t,maxOutputTokens:e=4096,temperature:i=.2,timeoutMs:r=35e3}){let o;const s=[{role:"user",content:t}];for(let a=0;a<3;a++)try{return await me({system:n,messages:s,maxOutputTokens:e,temperature:i,tools:[{googleSearch:{}}],jsonMode:!1,timeoutMs:r})}catch(m){if(o=m,!m.transient||a===2)break;await V(700+a*500)}throw o||new Error("grounded search failed")}async function At(n,t={}){const e=n.map(i=>({role:i.role==="model"||i.role==="assistant"?"assistant":"user",content:i.text}));return pe({system:ze(t.language||t.lang||"en",t.context||"",{country:t.country||"",currency:t.currency||""}),messages:e,maxOutputTokens:4096,temperature:.68})}async function Me({system:n,user:t,maxOutputTokens:e=4096,temperature:i=.7,jsonMode:r=!1,tools:o=null,timeoutMs:s,budgetMs:a}){return pe({system:n,messages:[{role:"user",content:t}],maxOutputTokens:e,temperature:i,jsonMode:r,tools:o,timeoutMs:s,budgetMs:a})}async function x(n,t={}){const e=t.language||t.lang||"en",i=new Date().toISOString().slice(0,10);return De({system:`You are Qor AI's web research assistant. Current date: ${i}. You MUST use the provided Google Search grounding tool for product status, official specs, market availability, review/community sentiment, and price-cycle signals. Do not answer from model memory for launch status or availability. If search evidence is thin, say exactly what is uncertain instead of guessing. Reply in ${le(e)}. Summarize evidence, source types, current market status, and uncertainty. Do not invent quotes, exact prices, or review counts.`,user:n,maxOutputTokens:t.maxOutputTokens||4096,temperature:.2,timeoutMs:t.timeoutMs||35e3})}function F(n){return String(n||"").trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/i,"").replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/,\s*([}\]])/g,"$1").trim()}function xe(n){const t=String(n||""),e=t.indexOf("{");if(e<0)return"";let i=0,r=!1,o=!1;for(let s=e;s<t.length;s++){const a=t[s];if(o){o=!1;continue}if(a==="\\"){o=!0;continue}if(a==='"'){r=!r;continue}if(!r&&(a==="{"&&(i+=1),a==="}"&&(i-=1,i===0)))return t.slice(e,s+1)}return""}function je(n){const t=String(n||""),e=t.indexOf("{");if(e<0)return"";const i=[];let r=!1,o=!1,s=-1,a=null;for(let d=e;d<t.length;d++){const p=t[d];if(o){o=!1;continue}if(p==="\\"){o=!0;continue}if(p==='"'){r=!r;continue}r||(p==="{"||p==="["?i.push(p==="{"?"}":"]"):p==="}"||p==="]"?(i.pop(),s=d+1,a=[...i]):p===","&&(s=d,a=[...i]))}if(!i.length||s<0||!a)return"";let m=t.slice(e,s).replace(/,\s*$/,"");for(let d=a.length-1;d>=0;d--)m+=a[d];return m}function Fe(n){const t=F(n);try{return JSON.parse(t)}catch{}const e=F(xe(t));if(e)try{return JSON.parse(e)}catch{}const i=je(t);if(i)try{return JSON.parse(F(i))}catch{}throw new Error("AI JSON parse failed")}async function I({system:n,user:t,maxOutputTokens:e=4096,timeoutMs:i=7e4,budgetMs:r=15e4,temperature:o=.6}){const s=await Me({system:n,user:t,maxOutputTokens:e,temperature:o,jsonMode:!0,timeoutMs:i,budgetMs:r});return Fe(s)}const Ge={en:"English",tr:"Turkish",de:"German",fr:"French",es:"Spanish",pt:"Portuguese",it:"Italian",ja:"Japanese",ko:"Korean",zh:"Chinese",ar:"Arabic",ru:"Russian",hi:"Hindi",nl:"Dutch",pl:"Polish",sv:"Swedish"};function S(n){return Ge[String(n||"en").slice(0,2).toLowerCase()]||"English"}function ye(n){const t=String(n||"en").slice(0,2).toLowerCase();return t==="tr"?["Kullanım Uyumu","Performans","Kalite Uyumu","Özellik Seti","Ergonomi ve Taşınabilirlik","Güvenilirlik ve Risk","Topluluk Sinyali","Uzun Vadeli Değer"]:t==="de"?["Nutzungsfit","Leistung","Qualitätsfit","Funktionsumfang","Ergonomie und Mobilität","Zuverlässigkeit und Risiko","Community-Signal","Langzeitwert"]:["Usage Fit","Performance","Quality Fit","Feature Set","Ergonomics and Portability","Reliability and Risk","Community Signal","Long-term Value"]}function fe(n){const t=String(n||"en").slice(0,2).toLowerCase();return t==="tr"?[{key:"usage_fit",label:"Kullanım Uyumu",emoji:"🎯"},{key:"content_match",label:"İçerik Uyumu",emoji:"🎬"},{key:"feature_depth",label:"Özellik Derinliği",emoji:"🧩"},{key:"ecosystem_fit",label:"Ekosistem Uyumu",emoji:"🔗"},{key:"lifestyle_match",label:"Yaşam Tarzı Uyumu",emoji:"🏠"},{key:"community_signal",label:"Topluluk Sinyali",emoji:"🌐"},{key:"retention_value",label:"Uzun Vadeli Tutma Değeri",emoji:"🚀"},{key:"risk_balance",label:"Risk Dengesi",emoji:"🛡"}]:t==="de"?[{key:"usage_fit",label:"Nutzungsfit",emoji:"🎯"},{key:"content_match",label:"Inhaltsfit",emoji:"🎬"},{key:"feature_depth",label:"Funktionstiefe",emoji:"🧩"},{key:"ecosystem_fit",label:"Ökosystem-Fit",emoji:"🔗"},{key:"lifestyle_match",label:"Lifestyle-Fit",emoji:"🏠"},{key:"community_signal",label:"Community-Signal",emoji:"🌐"},{key:"retention_value",label:"Langzeitbindung",emoji:"🚀"},{key:"risk_balance",label:"Risikobalance",emoji:"🛡"}]:[{key:"usage_fit",label:"Usage Fit",emoji:"🎯"},{key:"content_match",label:"Content Match",emoji:"🎬"},{key:"feature_depth",label:"Feature Depth",emoji:"🧩"},{key:"ecosystem_fit",label:"Ecosystem Fit",emoji:"🔗"},{key:"lifestyle_match",label:"Lifestyle Match",emoji:"🏠"},{key:"community_signal",label:"Community Signal",emoji:"🌐"},{key:"retention_value",label:"Long-term Retention",emoji:"🚀"},{key:"risk_balance",label:"Risk Balance",emoji:"🛡"}]}function Ve(n){const t=S(n);return`You are Qor AI's link analysis engine. You receive a product URL, optional metadata, optional web research data, and a user profile. Your job is to identify the EXACT product and analyze it for the user.

CRITICAL — PRODUCT IDENTIFICATION (PRIORITY ORDER):
1. "webResearch" — If provided, this contains VERIFIED current web data (Google Search grounding) about the URL. This is your MOST RELIABLE source for product identification. USE IT.
2. The "productMetadata.title" field is your next most trusted source. If it contains a clear product name, YOU MUST USE IT as the product title. Do NOT override it with a different product.
3. The URL path segments (slugs, IDs, brand names) are your TERTIARY source.
4. ABSOLUTELY NEVER substitute, replace, or hallucinate a different product than what the research/metadata/URL indicates. This is the #1 unbreakable rule.
5. If productMetadata.title looks like a domain name (e.g. "trendyol.com"), ignore it and rely on webResearch or URL structure.
6. For Amazon ISBNs (all-numeric 10-digit IDs), this is a BOOK. Category = "books".
7. For Amazon ASINs (alphanumeric starting with 'B'): if webResearch is available, use its product name; otherwise, if NOT certain, set is_product to false rather than guessing.
8. If you cannot determine the product, set is_product to false. NEVER fabricate.
9. NON-PRODUCT PAGES: if the URL is a social-media post, a forum / Q&A thread (Quora, Reddit…), a video, a news article, a blog post, search results, or a store homepage / category listing rather than ONE specific product, set is_product to false and do NOT invent a product. A real product link points to a single purchasable item.

CATEGORY DETECTION:
- Detect the REAL category: books, smartphones, laptops, tablets, headphones, monitors, keyboards, clothing, home-appliances, gaming, toys, beauty, sports, furniture, kitchen, pet-supplies, etc.
- Do NOT default to "smartphones". Read the URL and metadata carefully.
- Products can be ANY category — not just technology. Books, clothing, kitchen items are all valid.

CATEGORY-AWARE ANALYSIS:
- For TECH products (smartphones, laptops, tablets, headphones): discuss specs, ecosystem compatibility, performance.
- For BOOKS: discuss content, author, genre, reading value. Do NOT mention "ecosystem compatibility" or "tech specs".
- For CLOTHING/FASHION: discuss material, style, sizing, brand quality. Do NOT mention tech specs.
- For HOME/KITCHEN: discuss functionality, durability, design. Do NOT force tech terminology.
- Adapt your analysis language to the product category naturally.

LANGUAGE: Write the "analysis" field in ${t}.

SCORING RULES:
- Score reflects how well this product fits the user (range: 20-95)
- For tech: consider ecosystem, budget, priorities
- For non-tech: consider budget, lifestyle, stated interests, practical value

Return valid JSON:
{
  "is_product": true,
  "score": 20-95,
  "analysis": "Detailed category-appropriate analysis in ${t}",
  "category": "product category in English lowercase",
  "title": "EXACT product name from metadata/URL — NEVER invented or substituted",
  "image_url": null,
  "price": "Price with currency if known, else null",
  "site_name": "Store name from URL domain"
}`}const Q=new Set(["p","dp","pd","gp","aw","d","product","products","urun","urunler","item","items","ref","detay","detail","details","ilan","ilanlar","listing","listings","ad","ads","offer","offers","sayfa","page","satilik","kiralik","sahibinden","index","default","view","show"]);function G(n){const t=String(n||"").trim().toLowerCase();if(!t||t.length<4)return!0;const e=t.split(/\s+/).filter(Boolean);return!!(!e.length||e.every(i=>Q.has(i))||e.length<=2&&e.some(i=>Q.has(i))||!/[a-zçğıöşü]{3,}/i.test(t))}function Qe(n){try{const t=new URL(n),e=t.pathname.split("/").map(s=>s.trim()).filter(Boolean);let i="";if(/amazon\./i.test(t.hostname)){const s=e.findIndex(a=>/^(dp|product)$/i.test(a));s>0&&(i=e[s-1])}const r=s=>Q.has(String(s).toLowerCase())||/^(ref|psc|qid|sr)[=_-]/i.test(s),o=/^(?:[a-z0-9]{10}|[a-f0-9]{16,}|[0-9]{8,})$/i;return i||(i=e.filter(a=>/[a-zçğıöşü]{3,}/i.test(a)&&!r(a)&&!o.test(a)).sort((a,m)=>m.replace(/[^a-zçğıöşü]/gi,"").length-a.replace(/[^a-zçğıöşü]/gi,"").length)[0]||""),i||(i=[...e].reverse().find(s=>/[a-z]/i.test(s)&&!r(s))||""),i=i.replace(/\.(html?|php|aspx?)$/i,"").replace(/[-_]+/g," "),i=i.replace(/\b(p|dp|pd|product|urun|item|ref|detay|ilan)\b/gi," ").replace(/\s+/g," ").trim(),i=i.replace(/\s+\d{5,}$/,"").trim(),i=i.replace(/\s+[A-Za-z]{2,}\d[A-Za-z0-9]{5,}$/,"").trim(),i.length<3?"":i.replace(/\b\w/g,s=>s.toUpperCase()).slice(0,80)}catch{return""}}function ie(n,t){const e=`${n||""} ${t||""}`.toLowerCase();return/(vasita|otomobil|arac|araba|\bauto\b|automobil|car|suv|pickup|kamyonet|motosiklet|motorcycle|ecoboost|tdi|tsi|dizel|benzin|hybrid|4x4|ranger|raptor|hilux|amarok)/.test(e)?"cars":/(emlak|konut|daire|villa|arsa|real-?estate|apartment|kiralik-?ev)/.test(e)?"real-estate":/(laptop|notebook|macbook|thinkpad|thinkbook|vivobook|zenbook|ultrabook|chromebook|legion|rog|tuf|omen|victus|ideapad|nebula)/.test(e)?"laptops":/(headphone|headset|kulaklik|earbud|airpods|buds|wh-|quietcomfort)/.test(e)?"headphones":/(tablet|ipad|galaxy-?tab|mediapad|matepad)/.test(e)?"tablets":/(phone|iphone|galaxy|pixel|xiaomi|redmi|smartphone|telefon)/.test(e)?"smartphones":/(monitor|display|oled|qled|ultrawide)/.test(e)?"monitors":/(keyboard|mouse|klavye|fare)/.test(e)?"keyboards":/(camera|kamera|objektif|lens|dslr|mirrorless)/.test(e)?"cameras":/(book|books|isbn|kindle|kitap)/.test(e)?"books":/(shoe|shirt|dress|jacket|pantolon|ayakkabi|giyim|tekstil)/.test(e)?"clothing":/(bisiklet|bicycle|scooter|skuter)/.test(e)?"bikes":/(kitchen|vacuum|robot|coffee|airfryer|home|mutfak|beyaz-?esya|buzdolabi|camasir)/.test(e)?"home-appliances":/(game|gaming|ps5|xbox|switch|konsol)/.test(e)?"gaming":"general"}function re({url:n,title:t,siteName:e,language:i}){const r=String(i||"en").slice(0,2).toLowerCase(),o=t||e||n;return r==="tr"?`"${o}" bağlantısı ürün sayfası olarak işlendi. Qor AI ürün adını bağlantı ve site bilgisinden çıkardı; canlı sayfa verisi alınamadığında değerlendirme, ürün adı/kategori sinyalleri ve profil cevapların üzerinden hazırlanır. Satın almadan önce satıcı sayfasındaki güncel fiyat, garanti ve teknik özellikleri de kontrol et.`:r==="de"?`"${o}" wurde als Produktlink verarbeitet. Qor AI hat das Produkt aus der URL und dem Shop-Signal erkannt; wenn keine Live-Seitendaten verfügbar sind, wird die Empfehlung aus Titel, Kategorie-Signalen und deinen Antworten erstellt. Prüfe vor dem Kauf trotzdem den aktuellen Preis, die Garantie und die technischen Daten auf der Verkäuferseite.`:`"${o}" was processed as a product link. Qor AI identified it from the URL and store signal; when live page data is unavailable, the recommendation is built from the title, category signals, and your answers. Check the seller page for current price, warranty, and specs before buying.`}const Ye=["quora.com","reddit.com","youtube.com","youtu.be","twitter.com","x.com","facebook.com","fb.com","fb.watch","instagram.com","tiktok.com","threads.net","wikipedia.org","fandom.com","medium.com","substack.com","linkedin.com","pinterest.com","github.com","gitlab.com","stackoverflow.com","stackexchange.com","google.com","bing.com","duckduckgo.com","yahoo.com","yandex.com","whatsapp.com","t.me","telegram.org","discord.com","discord.gg","twitch.tv","spotify.com","soundcloud.com","netflix.com","wikihow.com"];function He(n){let t;try{t=new URL(n)}catch{return!1}const e=t.hostname.replace(/^www\./,"").toLowerCase();return!(Ye.some(r=>e===r||e.endsWith("."+r))||!t.pathname.replace(/\/+$/,"")&&!t.search)}async function Tt(n,t,e={}){const i=Qe(n);let r="";try{r=new URL(n).hostname.replace(/^www\./,"")}catch{}if(!He(n))return{url:n,title:i||r||n,score:0,analysis:"",category:"",siteName:r,price:null,isProduct:!1};let o="";if(G(i)||/amazon\./i.test(r))try{const c=`Identify the EXACT product sold at this URL using Google Search.
URL: ${n}
`+(i?`Possible title from URL slug: ${i}
`:"")+(r?`Store: ${r}
`:"")+"Return the exact product name (brand + model + key variant), its category, and the current price with currency if visible. If you cannot confirm ONE specific product, say so explicitly — do not guess.";o=await x(c,{language:t,maxOutputTokens:768,timeoutMs:25e3})}catch{}let a=null;try{const c={url:n,productMetadata:i?{title:i,siteName:r}:{siteName:r},userProfile:e};o&&(c.webResearch=o),a=await I({system:await Y("gemini_link_analysis_system",Ve(t)),user:JSON.stringify(c),maxOutputTokens:1536})}catch{a={title:i||r||n,score:60,analysis:re({url:n,title:i,siteName:r,language:t}),category:ie(n,i),site_name:r,price:null,is_product:!0}}const m=String(a.title||"").trim(),p=!m||/erişim|hata|error|unknown|bilinmeyen/i.test(m)||G(m)?G(i)?m||r||n:i:m;return{url:n,title:p,score:Number(a.score)||0,analysis:String(a.analysis||re({url:n,title:p,siteName:r,language:t})),category:(()=>{const c=String(a.category||"").toLowerCase().trim();if(c&&c!=="general"&&c!=="other")return c;const h=ie(n,`${p} ${a.analysis||""}`);return h!=="general"?h:c||"general"})(),siteName:String(a.site_name||r||""),price:a.price||null,isProduct:a.is_product!==!1}}const Be=["laptops","smartphones","tablets","cameras","camera_lenses","monitors","headphones","gaming","gaming_consoles","tvs","desktops","smartwatches","drones","av_receivers","cpus","gpus"];function ge(n){const t=String(n||"").toLowerCase().trim().replace(/[\s-]+/g,"_");return t?Be.some(e=>t===e||t.includes(e)||e.includes(t)):!1}function We(n){return ge(n)?6:5}function Je(n){const t=Array.isArray(n)?n:[];return t.length>=3||t.some(e=>ge(e==null?void 0:e.category))?6:5}function Ke(n){return(Array.isArray(n)?n.length:0)>1?6:5}function H(){return`${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`}function Xe(n,t=5){const e=S(n),i=t-2;return`You are Qor AI's product quiz engine. Generate a focused personalized quiz
of EXACTLY ${t} questions to understand the user's needs for a specific product category.
Pick only the ${t} most decisive, highest-signal questions — the ones whose answers most
change whether this product is the right fit. No filler, no nice-to-have questions.

OUTPUT LANGUAGE — HARD REQUIREMENT: Write EVERY question and EVERY option in ${e}, and ONLY ${e}. This is the site's selected language and overrides everything else: even if the product name, specs, category, or user profile are written in another language, the quiz itself is still written in ${e}. Never mirror the language of the product context. Only official brand/product/model names and universal technical terms (RTX, USB-C, Wi-Fi…) may stay as-is.


PRODUCT TYPE — HARD RULE (the #1 failure to avoid):
- The item can be ANY category: a CAR, a house, a book, a bicycle, a coffee machine, a washing machine, clothing, a service, a tool — not just electronics.
- NEVER assume it is a phone, laptop or any screen device. Do NOT mention screens, battery life, keyboards, cameras, storage or apps unless the product context genuinely establishes that the item HAS them.
- Read the product context (name, category, store, base analysis) and write questions ONLY about the real item. If the category field is missing or says "general", infer the type from the product NAME and the base analysis text.
- If you genuinely cannot tell what the item is, ask neutral ownership questions about THIS item (how often it will be used, where, by whom, what would make it a regret) — never invent a device type.

QUESTION QUALITY BAR — these must be the DECISIVE questions an expert buyer of THIS category would ask, including the ones the buyer would NOT think of on their own:
- a tablet → viewing distance and one-handed weight, laminated screen for stylus work, ecosystem lock-in, how long they keep devices
- a car → the terrain and annual distance, towing/loading, fuel-cost tolerance, parking and city manoeuvring, how long they keep a vehicle
- a coffee machine → cups per day, milk drinks, counter space, cleaning appetite
- a book → why they are reading it, pace tolerance, prior familiarity with the subject
Derive the equivalent decisive angles for the ACTUAL category in front of you. Generic "what is your budget / which brand" questions are forbidden.

VARIATION — do not produce the same quiz twice: the user message carries a "variationSeed". Use it to choose a DIFFERENT set of decisive angles, a different opening scene, and a different ordering than the most obvious default. Two runs on the same product must not share a question.

Rules:
- Each question is a vivid everyday-life mini-scene of about 28-45 words (one rich sentence, or two short ones): set a relatable real-life moment with a little concrete detail, then ask. Make it noticeably longer and more descriptive than a one-liner, yet still natural and easy to read — never a dry label and never a dense paragraph.
- Questions must be relevant to the product CATEGORY.
- Ask EXACTLY ${t} questions — no more, no fewer. Spend them on the ${t} highest-signal trade-offs that decide the fit; drop anything lower-signal.
- Cover real use moments, environment, quality tolerance, ergonomics, ownership risk and long-term value.
- Each question reveals one concrete trade-off (comfort vs durability, speed vs battery, detail vs simplicity, portability vs capacity, privacy vs convenience).
- HARD RULE — do NOT name the product or brand in the OPTIONS, and mention the product name at most once in the whole quiz (otherwise say "this one" or the category). Options describe behaviors/priorities only, never a brand name.
- Each question has exactly 4 options; each option is a short, concrete everyday behavior or priority, not a one-word label.
- Vary the situations; do not repeat the same day, time, place, or routine across questions.
- Do not use markdown, bold markers, quotation marks, or headline-style labels. Add one or two fitting emojis to each question (matching the scene) so it feels lively and friendly.
- NEVER ask about budget or brand preference.
- ALL text must be in ${e}

PERSONALIZATION (read the userProfile JSON in the user message):
- This quiz is about THIS PRODUCT CATEGORY first. The clear majority of questions (at least ${i} of the ${t}) MUST be neutral, category-driven usage scenarios that ANY buyer of this product could relate to. Do NOT bend the scenarios around the user's job or hobby.
- AT MOST 1 question in the WHOLE quiz may quietly lean on the user's profession or hobbies for its scenario — and only when it genuinely fits the product category. Never force a profession/hobby context into a question where it does not naturally belong, and NEVER combine profession AND hobby in the same question, nor repeat the same job/hobby context across questions.
- For every other question, use ordinary everyday contexts that come from the product category itself (commuting, travel, home, general work, leisure, family), NOT the user's specific job or hobby.
- AT LEAST 1 question must quietly ground its everyday scene in the user's real signals (interestCategories, recentlyViewed, priorities, usageIntent, registrationQuizAnswers) so it feels personally relevant — chosen only where it naturally fits the category, and without ever reading the profile back to the user.
- You may lean lightly on recentlyViewed products/categories and interestCategories to pick realistic contexts, but keep the spotlight on the product decision, not the person.
- NEVER state or hint at what we already know about them. Do not write "as a doctor", "since you love gaming", or name their profession, hobby, budget or ecosystem. Infer silently and ask a question that UNCOVERS the trade-off — the user must never feel told about their own profile.
- userProfile.registrationQuizAnswers holds what the onboarding quiz already asked and answered — treat it like pastQuizQuestions: NEVER re-ask those facts.
- Do NOT ask anything already listed in userProfile.pastQuizQuestions, and do not re-ask facts we already hold (ecosystem, budgetRange, priorities, currentDevices, usageIntent). Spend the questions only on what is still unknown for THIS specific product decision.

Return valid JSON:
{
  "questions": [
    {"question": "...", "options": ["...", "...", "...", "..."]},
    ...
  ]
}`}async function Nt({category:n,productTitle:t,url:e,language:i,userProfile:r={},productContext:o="",siteName:s=""}){const a=We(n),m=await I({system:Xe(i,a),user:JSON.stringify({category:n||"unknown",productTitle:t,url:e,store:s,productContext:String(o||"").slice(0,1200),userProfile:r,variationSeed:H()}),maxOutputTokens:3072,temperature:.95});return(Array.isArray(m.questions)?m.questions:[]).map((p,c)=>({id:`q${c}`,text:String(p.question||""),options:Array.isArray(p.options)?p.options.map(String):[]})).filter(p=>p.text&&p.options.length>=2).slice(0,a)}function Ze(n,t=5){const e=S(n),i=t-2;return`You are Qor AI's comparison quiz engine. Generate a focused, high-signal quiz
of EXACTLY ${t} questions that helps choose between multiple product links. Pick only the
${t} most decisive trade-offs — the ones whose answers most change which product wins.
No filler questions.

OUTPUT LANGUAGE — HARD REQUIREMENT: Write EVERY question and EVERY option in ${e}, and ONLY ${e}. This is the site's selected language and overrides everything else: even if the product names, specs, categories, or user profile are in another language, the quiz itself is still written in ${e}. Never mirror the language of the product context. Only official brand/product/model names and universal technical terms (RTX, USB-C, Wi-Fi…) may stay as-is.


PRODUCT TYPE — HARD RULE (the #1 failure to avoid):
- The item can be ANY category: a CAR, a house, a book, a bicycle, a coffee machine, a washing machine, clothing, a service, a tool — not just electronics.
- NEVER assume it is a phone, laptop or any screen device. Do NOT mention screens, battery life, keyboards, cameras, storage or apps unless the product context genuinely establishes that the item HAS them.
- Read the product context (name, category, store, base analysis) and write questions ONLY about the real item. If the category field is missing or says "general", infer the type from the product NAME and the base analysis text.
- If you genuinely cannot tell what the item is, ask neutral ownership questions about THIS item (how often it will be used, where, by whom, what would make it a regret) — never invent a device type.

QUESTION QUALITY BAR — these must be the DECISIVE questions an expert buyer of THIS category would ask, including the ones the buyer would NOT think of on their own:
- a tablet → viewing distance and one-handed weight, laminated screen for stylus work, ecosystem lock-in, how long they keep devices
- a car → the terrain and annual distance, towing/loading, fuel-cost tolerance, parking and city manoeuvring, how long they keep a vehicle
- a coffee machine → cups per day, milk drinks, counter space, cleaning appetite
- a book → why they are reading it, pace tolerance, prior familiarity with the subject
Derive the equivalent decisive angles for the ACTUAL category in front of you. Generic "what is your budget / which brand" questions are forbidden.

VARIATION — do not produce the same quiz twice: the user message carries a "variationSeed". Use it to choose a DIFFERENT set of decisive angles, a different opening scene, and a different ordering than the most obvious default. Two runs on the same product must not share a question.

Rules:
- Each question is a vivid everyday-life mini-scene of about 28-45 words (one rich sentence, or two short ones): set a relatable real-life moment with a little concrete detail, then ask. Make it noticeably longer and more descriptive than a one-liner, yet still natural and easy to read — never a dry label and never a dense paragraph.
- The quiz must surface which trade-offs matter to the user, not ask generic shopping questions.
- Ask EXACTLY ${t} questions — no more, no fewer — the ${t} most decisive trade-offs that determine which product fits best, whether comparing two products or several.
- Cover real use moments, performance, quality, portability/ergonomics, durability, risk tolerance and long-term ownership.
- Each question exposes one real decision trade-off between the options' differing strengths.
- HARD RULE — NEVER name, write, or hint at any of the compared products or brands in the questions OR in the options. Not even once. The user must NOT be able to tell which option maps to which product. Describe only behaviors, situations and priorities.
- Each question has exactly 4 options; each option is a short, concrete everyday behavior or priority (no brand names, no model names) that silently maps to a different product's strength.
- Make the four options clearly distinct so the answer is meaningful.
- Vary the situations; do not repeat the same day, time, place, or routine across questions.
- Do not use markdown, bold markers, quotation marks, or headline-style labels. Add one or two fitting emojis to each question (matching the scene) so it feels lively and friendly.
- NEVER ask about budget or brand preference.
- ALL text must be in ${e}

PERSONALIZATION (read the userProfile JSON in the user message):
- This quiz is about choosing between THESE PRODUCTS first. The clear majority of questions (at least ${i} of the ${t}) MUST be neutral, category-driven trade-off scenarios that ANY buyer comparing these products could relate to. Do NOT bend the scenarios around the user's job or hobby.
- AT MOST 1 question in the WHOLE quiz may quietly lean on the user's profession or hobbies for its scenario — and only when it genuinely fits the compared category. Never force a profession/hobby context where it does not naturally belong, and NEVER combine profession AND hobby in the same question, nor repeat the same job/hobby context across questions.
- For every other question, use ordinary everyday contexts drawn from the compared category itself, NOT the user's specific job or hobby.
- AT LEAST 1 question must quietly ground its everyday scene in the user's real signals (interestCategories, recentlyViewed, priorities, usageIntent, registrationQuizAnswers) so it feels personally relevant — only where it naturally fits, and without ever reading the profile back to the user.
- You may lean lightly on recentlyViewed products/categories and interestCategories to pick realistic contexts, but keep the spotlight on the comparison decision.
- NEVER state or hint at what we already know about them. Do not name their profession, hobby, budget or ecosystem in the text. Infer silently and ask a question that UNCOVERS which trade-off wins for them.
- userProfile.registrationQuizAnswers holds what the onboarding quiz already asked and answered — treat it like pastQuizQuestions: NEVER re-ask those facts.
- Do NOT ask anything already listed in userProfile.pastQuizQuestions, and do not re-ask facts we already hold (ecosystem, budgetRange, priorities, currentDevices, usageIntent). Spend the questions only on what is still unknown for THIS comparison.

Return valid JSON:
{
  "questions": [
    {"question": "...", "options": ["...", "...", "...", "..."]},
    ...
  ]
}`}async function Rt({products:n,language:t,userProfile:e={}}){const i=Je(n),r=await I({system:Ze(t,i),user:JSON.stringify({products:(n||[]).map(o=>({title:o.title,url:o.url,category:o.category||"unknown",store:o.siteName,initialScore:o.score,productContext:String(o.analysis||"").slice(0,900)})),userProfile:e,variationSeed:H()}),maxOutputTokens:8192,temperature:.95});return(Array.isArray(r.questions)?r.questions:[]).map((o,s)=>({id:`cq${s}`,text:String(o.question||""),options:Array.isArray(o.options)?o.options.map(String):[]})).filter(o=>o.text&&o.options.length>=2).slice(0,i)}function et(n,t,e,i=5){const r=S(e);return`You are Qor AI's subscription quiz engine. Generate a focused personalized quiz
of EXACTLY ${i} questions to understand the user's needs for: ${n}. Pick only the ${i} most
decisive, highest-signal questions — the ones whose answers most change which service fits
this person best. No filler, no nice-to-have questions.

OUTPUT LANGUAGE — HARD REQUIREMENT: Write EVERY question and EVERY option in ${r}, and ONLY ${r}. This is the site's selected language and overrides everything else: even if the service names or user profile are in another language, the quiz itself is still written in ${r}. Never mirror the language of the context. Only official brand/service names may stay as-is.

The goal: understand how the user uses ${t?"these services":"this service"},
their specific habits, preferences, and expectations.

VARIATION — do not produce the same quiz twice: the user message carries a "variationSeed". Use it to choose a DIFFERENT set of decisive angles, a different opening scene and a different ordering than the most obvious default. Two runs on the same services must not share a question.

Rules:
- Each question is a vivid everyday-life mini-scene of about 28-45 words (one rich sentence, or two short ones): set a relatable real-life moment with a little concrete detail, then ask. Make it noticeably longer and more descriptive than a one-liner, yet still natural and easy to read — never a dry label and never a dense paragraph.
- Ask EXACTLY ${i} questions — no more, no fewer — the ${i} most decisive ones that determine which service fits best, whether analysing one service or comparing several.
- Ask about real habits and moments: when/where/how they watch, listen, play, create or work, and what they care about (quality, variety, offline use, sharing, discovery, comfort, how often they use it).
- HARD RULE — NEVER name, write, or hint at any of the selected services or brands (or their exact features/menus) in the questions OR in the options. Not even once. The user must NOT be able to tell which option belongs to which service. If a service name would appear, replace it with the neutral behavior instead.
- Each question has exactly 4 options. Every option is a short, concrete everyday behavior or priority — NO brand names, NO service names, NO product-specific feature jargon — that silently maps to a different service's strength.
- Make the four options clearly distinct so the answer is meaningful, and keep each option short (a few words to one short clause).
- Vary the situations; do not repeat the same moment, place or time across questions.
- Do not use markdown, bold, quotation marks, or headline-style labels. Add one or two fitting emojis to each question (matching the scene) so it feels lively and friendly.
- NEVER ask about budget or brand preference.
- ALL text must be in ${r}.

PERSONALIZATION (read the userProfile JSON in the user message — this is the profile the user built in the onboarding quiz):
- Shape the everyday situations around what this person plausibly does, using interestCategories, usageIntent, priorities and recentlyViewed for relatable, real-life contexts.
- AT LEAST 1 question must quietly ground its everyday scene in those real signals (interestCategories, recentlyViewed, priorities, usageIntent, registrationQuizAnswers) so it feels personally relevant — without ever reading the profile back to the user.
- AT MOST 1-2 questions may quietly lean on their profession or hobbies, and only when it fits naturally; never combine profession and hobby in one question, and never state or name their profession, hobby, budget or ecosystem.
- userProfile.registrationQuizAnswers holds what the onboarding quiz already asked and answered — treat it like pastQuizQuestions: NEVER re-ask those facts.
- Infer silently — the questions should feel like everyday life, never like the app is reading their profile back to them.

Return valid JSON:
{
  "questions": [
    {"question": "...", "options": ["...", "...", "...", "..."]},
    ...
  ]
}`}async function It({subscriptionNames:n,language:t,userProfile:e={}}){const i=n.length>1,r=Ke(n),o=await I({system:et(n.join(", "),i,t,r),user:JSON.stringify({subscriptions:n,mode:i?"compare":"single",userProfile:e,variationSeed:H()}),maxOutputTokens:8192,temperature:.95});return(Array.isArray(o.questions)?o.questions:[]).map((a,m)=>({id:`sq${m}`,text:String(a.question||""),options:Array.isArray(a.options)?a.options.map(String):[]})).filter(a=>a.text&&a.options.length>=2).slice(0,r)}function B(n){return`Cover ALL of the following, as compact notes:
1) IDENTITY: what this exactly is (edition/variant), current market status, and the headline specs or plan details that actually matter.
2) COMMUNITY SENTIMENT — THE MAIN JOB: scan real user discussion (Reddit threads, YouTube review takeaways and their comment sections, retailer review patterns such as Amazon/Trendyol/Best Buy, specialist review sites, forums, app-store reviews). Extract the RECURRING THEMES, not one-off opinions. For each theme note: the theme, whether it is praise / complaint / mixed, and roughly how dominant it is (e.g. "mentioned in most threads" vs "occasional").
3) COMPLAINTS IN DETAIL: the most repeated negatives, failures, regrets, after-sales/support problems, and whether they hit everyone or only a specific use case. Never soften them.
4) WHO LOVES IT vs WHO REGRETS IT: the usage profiles behind each side.
5) DEAL-BREAKERS: the things a buyer would be angry about not knowing beforehand.
6) ALTERNATIVES people actually compare it against, and why they switch.
7) VALUE / TIMING signal: discount cadence, a newer model or plan change on the horizon, or long-term cost drift. No invented exact prices.
Write in ${n}. Do NOT invent direct quotes, exact review counts, or exact prices. Where evidence is thin, say plainly that it is thin.`}async function Ot({title:n,category:t,url:e,siteName:i,language:r}){const o=S(r),s=String(n||"").trim();if(!s)return"";try{return await x(`Research the product "${s}"${t?` (category: ${t})`:""} for a Qor AI buyer report.
`+(e?`Product URL: ${e}
`:"")+(i?`Store: ${i}
`:"")+`
${B(o)}`,{language:r,maxOutputTokens:3072,timeoutMs:45e3})}catch{return""}}async function Ct({bases:n=[],language:t}){const e=S(t),i=n.filter(o=>o&&o.title);if(!i.length)return"";const r=i.map((o,s)=>`${s+1}. ${o.title}${o.category?` (${o.category})`:""}${o.siteName?` — ${o.siteName}`:""}`).join(`
`);try{return await x(`Research these products for a Qor AI head-to-head comparison report:
${r}

${B(e)}

8) HEAD-TO-HEAD: after covering each product, state the decisive real-world differences between them and which owner profile ends up happier with which one.`,{language:t,maxOutputTokens:4096,timeoutMs:5e4})}catch{return""}}async function Lt({names:n=[],language:t}){const e=S(t),i=n.filter(Boolean);if(!i.length)return"";try{return await x(`Research these subscription services for a Qor AI subscription report: ${i.join(", ")}.

${B(e)}

8) SUBSCRIPTION SPECIFICS: recent catalogue/feature/plan changes, ad tiers, sharing and device limits, regional content gaps, app quality and reliability complaints, support quality, and the most common reasons people cancel or come back.
9) If several services are listed, end with the decisive differences between them for everyday use.`,{language:t,maxOutputTokens:4096,timeoutMs:5e4})}catch{return""}}const tt=new Set(["ile","için","and","the","with","for","gb","tb","mb","inch","inç","akıllı","telefon","cep","kablosuz","siyah","beyaz","gri","mavi"]);function oe(n){return String(n||"").toLowerCase().replace(/[()[\]{}",]/g," ").split(/[\s/_-]+/).map(t=>t.trim()).filter(t=>t.length>1&&!tt.has(t))}function se(n,t){const e=oe(n),i=new Set(oe(t));return!e.length||!i.size?0:e.filter(o=>i.has(o)).length/e.length}async function $t(n,{searchProducts:t,minScore:e=.55}={}){const i=String(n||"").trim();if(!i||typeof t!="function")return null;let r=[];try{r=await t(i,8)}catch{return null}let o=null;for(const s of Array.isArray(r)?r:[]){if(!(s!=null&&s.id)||!(s!=null&&s.name))continue;const a=Math.min(se(i,s.name),se(s.name,i)+.15);(!o||a>o.score)&&(o={score:a,product:s})}return o&&o.score>=e?o.product:null}function Ut(n,t=75e3){return n?Promise.race([Promise.resolve(n).then(e=>String(e||"")).catch(()=>""),new Promise(e=>{setTimeout(()=>e(""),t)})]):Promise.resolve("")}function A(n,t=8){return Array.isArray(n)?n.map(e=>typeof e=="string"?{title:e.trim(),detail:""}:e&&typeof e=="object"?{title:String(e.title||e.label||e.point||"").trim(),detail:String(e.detail||e.impact||e.why||e.comment||"").trim()}:null).filter(e=>e&&(e.title||e.detail)).map(e=>e.title?e:{title:e.detail,detail:""}).slice(0,t):[]}const nt=new Set(["high","medium","low"]);function W(n,t=5){return Array.isArray(n)?n.map(e=>{if(typeof e=="string")return{severity:"medium",title:e.trim(),detail:""};if(!e||typeof e!="object")return null;const i=String(e.severity||e.level||"medium").toLowerCase();return{severity:nt.has(i)?i:"medium",title:String(e.title||e.label||"").trim(),detail:String(e.detail||e.why||e.impact||"").trim()}}).filter(e=>e&&(e.title||e.detail)).slice(0,t):[]}const it=new Set(["positive","negative","mixed"]);function J(n,t=8){return Array.isArray(n)?n.map(e=>{if(!e||typeof e!="object")return null;const i=String(e.sentiment||e.tone||"mixed").toLowerCase();return{label:String(e.label||e.theme||e.title||"").trim(),sentiment:it.has(i)?i:"mixed",strength:Math.max(0,Math.min(100,Math.round(w(e.strength??e.share??e.weight)))),detail:String(e.detail||e.note||e.summary||"").trim()}}).filter(e=>e&&e.label).map(e=>e.strength>0?e:{...e,strength:45}).slice(0,t):[]}function K(n,t=7){return Array.isArray(n)?n.map(e=>{if(!e||typeof e!="object")return null;const i=Math.max(-100,Math.min(100,Math.round(w(e.impact??e.effect??e.delta))));return{topic:String(e.topic||e.question||e.about||"").trim(),answer:String(e.answer||e.choice||"").trim(),impact:i,note:String(e.note||e.detail||e.why||"").trim()}}).filter(e=>e&&(e.answer||e.note)).slice(0,t):[]}function be(n,t=10){return Array.isArray(n)?n.map(e=>typeof e=="string"?{name:e.trim(),note:""}:e&&typeof e=="object"?{name:String(e.name||e.source||e.type||"").trim(),note:String(e.note||e.detail||"").trim()}:null).filter(e=>e&&e.name).slice(0,t):[]}function rt(n,t=10){return Array.isArray(n)?n.map(e=>!e||typeof e!="object"?null:{label:String(e.label||e.feature||"").trim(),productValue:String(e.productValue||e.value||"").trim(),userNeed:String(e.userNeed||e.need||"").trim(),score:Math.max(0,Math.min(100,Math.round(w(e.score)))),comment:String(e.comment||e.detail||"").trim()}).filter(e=>e&&e.label).slice(0,t):[]}function we(n){const t=(Array.isArray(n)?n:[]).map(e=>Number(e)||0).filter(e=>e>0);return t.length<2?0:Math.round(Math.max(...t)-Math.min(...t))}const ot=new Set(["buy","consider","skip"]);function st(n,t){const e=String(n||"").toLowerCase().trim();if(ot.has(e))return e;const i=Number(t)||0;return i>=70?"buy":i>=50?"consider":"skip"}function q(n){const t=String(n||"en").slice(0,2).toLowerCase();return t==="tr"?'ADDRESS FORM — HARD RULE: address the reader informally in Turkish, in the "sen" form ("senin için", "alışkanlıklarına göre", "bunu al", "geç"). NEVER use the formal "siz" forms (no "-ınız/-iniz" possessives, no "olun/edersiniz/olmalısınız"). The whole interface speaks in "sen"; the report must match it.':t==="de"?'ADDRESS FORM — HARD RULE: address the reader informally in German ("du/dein"), never the formal "Sie/Ihr".':'ADDRESS FORM — HARD RULE: address the reader directly as "you"; never write "the user" or "the buyer" when you mean the reader.'}const X="IMPACT VALUES: use the full range honestly. A typical answer nudges the verdict (|impact| 10-45); only an answer that genuinely decides the outcome earns |impact| above 70. Any answer that works AGAINST this choice MUST get a NEGATIVE impact, and a realistic quiz almost always has at least one. A list where every answer is a strong positive is not credible and is forbidden.";function U(n,t){const e=String(n||"").trim();return e?`

LIVE WEB / COMMUNITY RESEARCH NOTES (grounded Google Search, written in ${t} — treat as the CURRENT truth and build the community sections on it):
${e.slice(0,14e3)}`:`

LIVE WEB / COMMUNITY RESEARCH NOTES: none were available. Base the community sections on well-established, widely reported patterns only, and say plainly where the evidence is thin. Do NOT fabricate specific findings.`}function at(n){const t=S(n),e=String(n||"").slice(0,2)==="tr",i=String(n||"").slice(0,2)==="de",r=e?"Kullanım Uyumu":i?"Nutzungsfit":"Usage Fit",o=e?"Bütçe Uyumu":i?"Budget-Fit":"Budget Match",s=e?"Kalite Uyumu":i?"Qualitätsfit":"Quality Fit",a=e?"Uzun Vadeli Değer":i?"Langzeitwert":"Long-term Value",m=e?"Yaşam Tarzı Uyumu":i?"Lifestyle-Fit":"Lifestyle Match",d=e?"Özellik Seti":i?"Funktionsumfang":"Feature Set",p=e?"Güvenilirlik ve Risk":i?"Zuverlässigkeit und Risiko":"Reliability and Risk",c=e?"Topluluk Sinyali":i?"Community-Signal":"Community Signal";return`You are Qor AI's senior product analyst. Given a product, the user's quiz answers, the user profile and live web/community research notes, produce the PERSONAL DECISION half of a comprehensive match report.

LANGUAGE: Write ALL text in ${t}. Factor labels must also be in ${t}.
${q(n)}

CRITICAL — CATEGORY-AWARE ANALYSIS:
- The product can be ANY category: tech, books, clothing, home, sports, beauty, etc.
- For TECH products: analyze specs deeply — cite performance numbers, thermal behavior, software longevity, benchmark context.
- For BOOKS: discuss writing quality, pacing, reader reception, author credentials, genre positioning.
- For CLOTHING/HOME: discuss material science, build quality, brand heritage, durability.
- NEVER force tech terminology onto non-tech products.
- Adapt factor meanings and labels to the product category:
  • "${s}" = build/material/content quality (as appropriate)
  • "${a}" = durability/longevity/re-read value (as appropriate)

SCORING RULES:
- Score must reflect how well THIS SPECIFIC product matches THIS SPECIFIC user's exact needs.
- Scores MUST be realistic and differentiated. Never give identical scores.
- Poor match: 20-45. Average: 46-65. Good: 66-80. Excellent: 81-95.
- ANTI-INFLATION (critical): do NOT cluster scores near the top. Use the FULL range honestly. Every real product has genuine weak spots — AT LEAST 2 of the factor scores MUST fall below 65, and at least one below 55, unless this is a rare near-flawless fit for THIS user. Reserve 85+ only for true standout strengths, never as a default. If most factors land in 75-95 you are inflating — spread them out and score weak areas honestly. The enhancedScore must reflect this honest spread, not drift upward.

EVIDENCE RULES:
- The research notes are the CURRENT truth. Ground every concrete claim (weak spots, reliability, real-world behavior) in them where they cover it.
- Never invent direct quotes, exact review counts or exact live prices. Where evidence is thin, say so in the relevant field instead of guessing.

${X}

WRITING QUALITY REQUIREMENTS:
- Professional, tech-journalist level language. Specific over generic: cite real characteristics, measured behavior, ownership realities.
- Every "detail" field must add NEW information — never restate the label or the score in words.
- verdict = 3 paragraphs (~65 words each): what this product actually is, how it behaves in real use, and the ownership/value picture.
- personaAnalysis = 3 paragraphs (~55 words each) built strictly on the quiz answers and profile signals — never list the user's attributes back to them.
- Bullets are one tight sentence in "title" plus one concrete consequence in "detail".

Return valid JSON (all text in ${t}):
{
  "enhancedScore": <0-100>,
  "confidence": <0-100 — how solid the evidence behind this verdict is; low when research was thin>,
  "decision": "buy | consider | skip",
  "headline": "ONE punchy sentence in ${t} that answers 'should I get this?' for THIS user",
  "factors": [
    {"label": "${r}", "score": <0-100>, "emoji": "🎯", "detail": "1 evidence-based sentence in ${t} explaining WHY this score"},
    {"label": "${o}", "score": <0-100>, "emoji": "💰", "detail": "1 sentence"},
    {"label": "${s}", "score": <0-100>, "emoji": "⭐", "detail": "1 sentence"},
    {"label": "${d}", "score": <0-100>, "emoji": "🧩", "detail": "1 sentence"},
    {"label": "${p}", "score": <0-100>, "emoji": "🛡", "detail": "1 sentence"},
    {"label": "${c}", "score": <0-100>, "emoji": "🌐", "detail": "1 sentence"},
    {"label": "${a}", "score": <0-100>, "emoji": "🚀", "detail": "1 sentence"},
    {"label": "${m}", "score": <0-100>, "emoji": "🏠", "detail": "1 sentence"}
  ],
  "verdict": "3 paragraphs in ${t} as described above. NO user attribute lists.",
  "prosForUser": [{"title": "short concrete strength", "detail": "1 sentence on what it changes in daily use for THIS user"}, "... 4-5 items total"],
  "consForUser": [{"title": "short concrete weakness", "detail": "1 sentence on the real-world impact and how often it bites"}, "... 3-4 items total"],
  "criticalPoints": [{"severity": "high|medium|low", "title": "the thing they would be angry not to know", "detail": "1-2 sentences: what happens, and who it actually affects"}, "... 3-4 items, at least one 'high' if a genuine deal-breaker exists"],
  "quizInsights": [{"topic": "2-4 word label of what the question probed, in ${t}", "answer": "the option the user picked, shortened", "impact": <-100..100 — how much this answer pushed the score up or down>, "note": "1 sentence linking that answer to a concrete property of this product"}, "... one per meaningful quiz answer, 4-6 items"],
  "featureMatches": [{"label": "feature/spec in ${t}", "productValue": "what this product offers", "userNeed": "what the quiz/profile implies they need", "score": <0-100>, "comment": "1 sentence"}, "... 5-7 items"],
  "personaScore": <0-100>,
  "personaAnalysis": "3 paragraphs in ${t} — how this product fits their real life from the quiz answers. Reference the answers concretely. NEVER list user attributes by name.",
  "bestFor": "1-2 sentences in ${t} describing the person this is genuinely great for",
  "notFor": "1-2 sentences in ${t} describing who should walk away",
  "overallVerdict": "1 paragraph in ${t} plus ONE final decisive sentence that clearly says buy, consider, or skip (with a concrete alternative if skip). NEVER mention user attributes by name."
}`}function ct(n){const t=S(n);return`You are Qor AI's community-research analyst. You receive a product, the user's quiz answers, and live web/community research notes gathered with Google Search. Produce the COMMUNITY & MARKET half of the report.

LANGUAGE: Write ALL text in ${t}.
${q(n)}

RULES:
- Build EVERYTHING on the research notes when they cover it; they are the current truth. Where they are thin, say plainly that the evidence is limited — never fabricate findings, quotes, review counts or exact prices.
- A praise-only summary is FORBIDDEN. Recurring complaints must be stated as plainly as the praise.
- ABSENCE OF EVIDENCE IS NOT A STRENGTH: "no complaints found" or "limited information" must never be presented as a positive theme or used to raise a score — say the evidence is thin and lower the confidence instead.
- FACTS ONLY FROM RESEARCH: availability, versions and plan details must come from the research notes; if they are not covered, omit them rather than recalling them from memory.
- "themes" are the topics people keep coming back to (battery, noise, sizing, support, ads, price hikes…), NOT one-off opinions. "strength" is roughly how dominant that theme is in the discussion (0-100).
- Sentiment percentages must be realistic and consistent with the themes: if half the themes are complaints, the split cannot be 90% positive.

Return valid JSON (all text in ${t}):
{
  "communityScore": <0-100 — overall owner satisfaction>,
  "communityAnalysis": "3 paragraphs in ${t}: (1) how it is received overall and what earns the praise, (2) the recurring complaints stated plainly with who they hit, (3) what long-term owners say after months of use. IGNORE the user profile here — this is about everyone.",
  "sentimentBreakdown": {"positive": <int>, "neutral": <int>, "negative": <int>},
  "communityThemes": [{"label": "theme in ${t}", "sentiment": "positive|negative|mixed", "strength": <0-100>, "detail": "1 sentence with the concrete substance of that theme"}, "... 5-7 themes, a realistic mix of positive and negative"],
  "praisePoints": [{"title": "what owners consistently love", "detail": "1 sentence"}, "... 3-4 items"],
  "complaintPoints": [{"title": "what owners consistently complain about", "detail": "1 sentence including how widespread it is"}, "... 3-4 items"],
  "reliabilityNotes": ["1 sentence each in ${t} on durability, failures, warranty/support experience — 2-3 items"],
  "sources": [{"name": "source or source type (Reddit, YouTube reviews, retailer reviews, specialist sites…)", "note": "what it contributed"}, "... 4-6 items — only source TYPES you actually relied on"],
  "alternatives": [{"name": "exact competing product name", "why": "1 sentence on who should take this instead"}, "... 3 items"],
  "priceOutlook": {"trend": "up|down|stable|unknown", "bestTime": "when it is smart to buy, in ${t}", "note": "1-2 sentences on discount cadence, refresh cycle or long-term cost — no invented exact prices"},
  "verificationNotes": ["1 sentence each in ${t}: what is well-evidenced vs what stayed uncertain — 2-3 items"]
}`}function w(n){if(typeof n=="number")return n;const t=parseFloat(String(n||"").replace(",","."));return Number.isFinite(t)?t:0}function Z(n){if(!n||typeof n!="object")return null;const t=Math.max(0,Math.round(w(n.positive))),e=Math.max(0,Math.round(w(n.neutral))),i=Math.max(0,Math.round(w(n.negative)));return t+e+i<=0?null:{positive:t,neutral:e,negative:i}}async function qt({base:n,answers:t,language:e,userProfile:i={},research:r=""}){const o=S(e),s=t.filter(y=>y.answer!=null).map(y=>({question:y.question,answer:y.answer})),a={url:n.url,title:n.title,category:n.category,siteName:n.siteName,initialScore:n.score,initialAnalysis:n.analysis},m=JSON.stringify({product:a,quizAnswers:s,userProfile:i}),d=(async()=>I({system:await Y("gemini_enhanced_link_analysis_system",at(e))+U(r,o),user:m,maxOutputTokens:8192}))(),p=(async()=>{try{return await I({system:ct(e)+U(r,o),user:m,maxOutputTokens:8192})}catch{return{}}})(),[c,h]=await Promise.all([d,p]),f=(Array.isArray(c.factors)?c.factors:[]).map(y=>({label:String(y.label||y.name||""),score:w(y.score??y.value),emoji:String(y.emoji||y.icon||"📊"),detail:String(y.detail||y.comment||"")})).filter(y=>y.label),C=w(c.enhancedScore??c.enhanced_score??c.score),T=C>0?C:n.score,N=Array.isArray(h.alternatives)&&h.alternatives.length?h.alternatives:c.alternatives,v=h.priceOutlook&&typeof h.priceOutlook=="object"?{trend:String(h.priceOutlook.trend||"unknown").toLowerCase(),bestTime:String(h.priceOutlook.bestTime||""),note:String(h.priceOutlook.note||"")}:null;return{base:n,enhancedScore:T,confidence:Math.max(0,Math.min(100,Math.round(w(c.confidence))))||(r?78:58),decision:st(c.decision,T),headline:String(c.headline||""),factors:f,verdict:String(c.verdict||c.detailed_verdict||c.analysis||n.analysis||""),prosForUser:A(c.prosForUser||c.pros,6),consForUser:A(c.consForUser||c.cons,5),criticalPoints:W(c.criticalPoints,5),quizInsights:K(c.quizInsights,7),featureMatches:rt(c.featureMatches,8),alternatives:A(Array.isArray(N)?N.map(y=>y&&typeof y=="object"?{title:y.name||y.title,detail:y.why||y.detail}:y):[],4),bestFor:String(c.bestFor||""),notFor:String(c.notFor||""),personaScore:w(c.personaScore)||null,personaAnalysis:c.personaAnalysis?String(c.personaAnalysis):"",communityScore:w(h.communityScore??c.communityScore)||null,communityAnalysis:String(h.communityAnalysis||c.communityAnalysis||""),sentimentBreakdown:Z(h.sentimentBreakdown||h.sentiment_breakdown||c.sentimentBreakdown||c.sentiment_breakdown),communityThemes:J(h.communityThemes,8),praisePoints:A(h.praisePoints,5),complaintPoints:A(h.complaintPoints,5),reliabilityNotes:A(h.reliabilityNotes,4),sources:be(h.sources,8),verificationNotes:A(h.verificationNotes,4),priceOutlook:v,researched:!!String(r||"").trim(),overallVerdict:c.overallVerdict?String(c.overallVerdict):""}}function lt(n){const t=S(n),e=ye(n),i=["🎯","⚡","⭐","🧩","🧭","🛡","🌐","🚀"],r=e.map((o,s)=>`        {"label": "${o}", "score": 0, "emoji": "${i[s]||"📊"}", "detail": "1 sentence"}`).join(`,
`);return`You are Qor AI's senior product comparison analyst. Produce the PER-PRODUCT half of a head-to-head comparison report.

LANGUAGE: Write ALL text fields in ${t}. Keep official product names as-is.
${q(n)}

You will receive exact products identified from pasted URLs, the user's comparison quiz answers, and live web/community research notes.

Rules:
- Never replace the products with nearby models. Use the exact product titles and URLs given to you.
- Judge every product AGAINST THE OTHERS, not in isolation: the same trait can be a strength here and a weakness there.
- Ground concrete claims in the research notes. Never invent quotes, review counts or live prices. Where evidence is thin, say so.
- NEVER paste raw long URLs in text fields. Use product names and site domains only.
- Scores must be realistic, varied and driven by THIS user's quiz answers. Two products must NEVER get the same score.
- ANTI-INFLATION: every product has real weak spots — at least 2 factors per product below 65, and reserve 85+ for genuine standouts.
- Every product must have factor scores for: ${e.join(", ")}.
- A praise-only community section is FORBIDDEN — state the recurring complaints plainly.

Return ONLY valid JSON with this exact structure:
{
  "products": [
    {
      "name": "exact product title",
      "url": "exact input url",
      "siteName": "domain or store",
      "score": 0,
      "rank": 1,
      "bestFor": "2 sentences in ${t} on the person this one is genuinely for",
      "summary": "3 sentences in ${t}: what it is, how it behaves in real use, where it lands versus the others",
      "pros": [{"title": "short strength", "detail": "1 sentence on what it changes in daily use"}, "... 3-4 items"],
      "cons": [{"title": "short weakness", "detail": "1 sentence on the real-world impact"}, "... 3 items"],
      "risks": ["2-3 ownership/community risks in ${t}, one sentence each"],
      "criticalPoints": [{"severity": "high|medium|low", "title": "what a buyer must know first", "detail": "1-2 sentences"}, "... 2-3 items"],
      "factors": [
${r}
      ],
      "specHighlights": [
        {"label": "short spec label in ${t}", "value": "short known/inferred value or uncertainty note"}
      ],
      "community": "2 short paragraphs in ${t}: reception and praise first, then the recurring complaints stated plainly",
      "communityThemes": [{"label": "theme in ${t}", "sentiment": "positive|negative|mixed", "strength": <0-100>, "detail": "1 sentence"}, "... 3-5 themes"],
      "sentimentBreakdown": {"positive": <int>, "neutral": <int>, "negative": <int>}
    }
  ]
}

Rules for factors: 8 entries per product, each with a "detail" sentence that explains the score with evidence — never a restatement of the label. specHighlights: 4-6 entries.`}function ut(n,t=[]){const e=S(n);return`You are Qor AI's senior comparison analyst. The per-product sections are already written. Produce ONLY the cross-product VERDICT half of the report.

LANGUAGE: Write ALL text fields in ${e}. Keep official product names as-is.
${q(n)}

Rules:
- "winner.best" MUST be exactly one of: ${t.join(" | ")}.
- ${X}
- Be decisive. Vague "both are good" answers are forbidden — name the winner and the exact conditions under which the other one wins instead.
- Ground concrete claims in the live research notes; never invent quotes, review counts or live prices.
- Tie every recommendation back to the user's quiz answers, without reading their profile back to them.

Return ONLY valid JSON:
{
  "winner": {
    "best": "exact product title",
    "reason": "3 sentences in ${e} on why it wins FOR THIS USER",
    "scoreGap": <integer difference between best and weakest>,
    "runnerUpCase": "1-2 sentences in ${e}: when the other product is the smarter buy instead"
  },
  "confidence": <0-100 — how solid the evidence behind this verdict is>,
  "decisiveDifferences": [{"title": "the difference in ${e}", "detail": "1-2 sentences on which product wins it and what it changes in practice"}, "... 4-6 items"],
  "quizInsights": [{"topic": "2-4 word label of what the question probed", "answer": "the option the user picked, shortened", "impact": <-100..100 — how strongly it pushed the winner ahead (+) or held it back (-)>, "note": "1 sentence tying that answer to a concrete difference between the products"}, "... 4-6 items"],
  "detailed": {
    "fit": "2 paragraphs in ${e} comparing quiz-based fit",
    "performance": "2 paragraphs in ${e} comparing performance, specs and real-world behavior",
    "ownership": "2 paragraphs in ${e} comparing durability, support, community risk and long-term cost",
    "community": "2 paragraphs in ${e} comparing what owners of each actually report — complaints included",
    "recommendation": "2 paragraphs in ${e} with the clear final decision and what to do if the winner is unavailable"
  },
  "recommendation": "3-4 sentence final summary in ${e} ending with a plain instruction"
}`}async function Pt({bases:n,answers:t,language:e,userProfile:i={},research:r=""}){var O,P;const o=S(e),s=ye(e),a=["🎯","⚡","⭐","🧩","🧭","🛡","🌐","🚀"],m=(t||[]).filter(u=>u.answer!=null).map(u=>({question:u.question,answer:u.answer})),d=(n||[]).map(u=>u.title).filter(Boolean),p=JSON.stringify({products:(n||[]).map((u,k)=>({index:k+1,url:u.url,title:u.title,category:u.category,siteName:u.siteName,initialScore:u.score,initialAnalysis:u.analysis})),quizAnswers:m,userProfile:i}),[c,h]=await Promise.all([I({system:lt(e)+U(r,o),user:p,maxOutputTokens:12288}),(async()=>{try{return await I({system:ut(e,d)+U(r,o),user:p,maxOutputTokens:8192})}catch{return{}}})()]),f=Array.isArray(c.products)?c.products:[],T=((n||[]).length?(n||[]).map((u,k)=>f.find(R=>(R==null?void 0:R.url)&&R.url===u.url)||f[k]||{}):f).map((u,k)=>{const R=(n||[])[k]||{},l=w(u.score)||w(R.score)||50,L=Array.isArray(u.factors)?u.factors.map(g=>({label:String((g==null?void 0:g.label)||""),score:w((g==null?void 0:g.score)??(g==null?void 0:g.value)),emoji:String((g==null?void 0:g.emoji)||"📊"),detail:String((g==null?void 0:g.detail)||"")})).filter(g=>g.label):[],D=L.length?L:s.map((g,b)=>({label:g,score:l,emoji:a[b]||"📊",detail:""})),j=Array.isArray(u.specHighlights)?u.specHighlights.map(g=>({label:String((g==null?void 0:g.label)||""),value:String((g==null?void 0:g.value)||"")})).filter(g=>g.label||g.value):[];return{name:String(u.name||R.title||`Product ${k+1}`),url:String(u.url||R.url||""),siteName:String(u.siteName||R.siteName||""),score:l,rank:w(u.rank)||k+1,bestFor:String(u.bestFor||""),summary:String(u.summary||R.analysis||""),pros:A(u.pros,5),cons:A(u.cons,4),risks:A(u.risks,4),criticalPoints:W(u.criticalPoints,4),factors:D,specHighlights:j,community:String(u.community||""),communityThemes:J(u.communityThemes,6),sentiment:Z(u.sentimentBreakdown||u.sentiment_breakdown)}});T.sort((u,k)=>(u.rank||99)-(k.rank||99));const N=h.winner&&typeof h.winner=="object"?h.winner:c.winner&&typeof c.winner=="object"?c.winner:null,v=N?{best:String(N.best||((O=T[0])==null?void 0:O.name)||""),reason:String(N.reason||""),scoreGap:we(T.map(u=>u.score)),runnerUpCase:String(N.runnerUpCase||"")}:{best:((P=T[0])==null?void 0:P.name)||"",reason:"",scoreGap:0,runnerUpCase:""},y=h.detailed&&typeof h.detailed=="object"?h.detailed:c.detailed&&typeof c.detailed=="object"?c.detailed:null,E=y?{fit:String(y.fit||""),performance:String(y.performance||""),ownership:String(y.ownership||""),community:String(y.community||""),recommendation:String(y.recommendation||"")}:null;return{type:"compare_structured",isCompare:!0,bases:n,answers:t,winner:v,products:T,scores:Object.fromEntries(T.map(u=>[u.name,u.score])),detailed:E,decisiveDifferences:A(h.decisiveDifferences,6),quizInsights:K(h.quizInsights,7),confidence:Math.max(0,Math.min(100,Math.round(w(h.confidence))))||(r?76:56),researched:!!String(r||"").trim(),recommendation:String(h.recommendation||c.recommendation||(E==null?void 0:E.recommendation)||v.reason||"")}}function ht(n,t,e,i,r){const o=S(r),a=fe(r).map(d=>`        "${d.key}": {"score": "integer 0-100", "detail": "1 evidence-based sentence in ${o} explaining this ${d.label} score"}`).join(`,
`),m=i.length?i.map(d=>`- ${d.question}: ${d.answer}`).join(`
`):"- (no quiz answers provided)";return`You are Qor AI's subscription intelligence analyst. Produce the PER-SERVICE half of a subscription report.
Analyze: ${n}

Quiz Answers:
${m}

CRITICAL RULES:
- ALL text values MUST be in ${o} language
- ${q(r)}
- The "subscriptions" object MUST contain exactly ${t} entries, one for EACH of: ${n}
- You MUST complete ALL ${t} service entries. Do not stop early or truncate.
- compatibility_score must be an integer 0-100 based on how well it fits THIS specific user${e?". Two services must NEVER get the same score.":""}
- factors are 0-100 integers and MUST include every factor key shown in the schema, each with a one-sentence "detail" that explains the score with evidence — never a restatement of the label
- ANTI-INFLATION: do NOT cluster factor scores near the top. Each service has real weak spots — at least 2 factors per service should fall below 65, and reserve 85+ only for genuine standout strengths. Identical high scores across factors are unrealistic.

VENDOR NEUTRALITY — HARD RULE (this analysis runs on a model that may BE one of the compared services, or be made by the company that owns one):
- Your own identity, your maker, and how familiar a service feels to you must have ZERO effect on the scores. Judge every service against the same evidence bar.
- ABSENCE OF EVIDENCE IS NOT A STRENGTH. "No complaints found", "limited community information" or "no known issues" must NEVER raise a score, appear as a positive theme, or justify a high risk/community score. When the research is thin for a service, say the evidence is thin, LOWER the confidence, and score that factor in the middle band — never at the top.
- Every service must get at least two genuinely weak factors stated as plainly as the leader's. A profile where one service is best on EVERY factor is a red flag: re-check it and correct the inflation.
- FACTS ONLY FROM RESEARCH: regional availability, plan names, model names/versions and pricing tiers change constantly. State them ONLY if the research notes cover them. If they do not, omit the claim entirely — never fill it from memory.

- COMMUNITY WORK IS THE CORE: build the community fields on the live research notes. Recurring complaints (price hikes, ad tiers, catalogue removals, sharing limits, app bugs, support) must be stated as plainly as the praise. A positives-only summary is FORBIDDEN.
- "themes" are topics people keep returning to, not one-off opinions; "strength" is roughly how dominant that topic is in the discussion.
- sentiment_breakdown values are integer percentages summing to ~100, realistic and consistent with the themes
- Never invent quotes, exact review counts or exact prices. Where the research is thin, say so.
- Be specific and personalized to the quiz answers and the user profile, not generic
- NEVER mention price, cost, affordability, monthly fees, yearly fees, discounts, or billing

Return ONLY valid JSON (no markdown fences, no commentary) matching this exact schema:
{
  "subscriptions": {
    "${e?"<service_name>":n}": {
      "category": "string - service category label in ${o}",
      "rank": "integer starting at 1",
      "compatibility_score": "integer 0-100",
      "compatibility_explanation": "string - 3 sentences on why this score, tied to the quiz answers",
      "pros": [{"title": "short strength", "detail": "1 sentence on what it changes in everyday use"}, "... 3-4 items"],
      "cons": [{"title": "short weakness", "detail": "1 sentence on the real-world impact"}, "... 3 items"],
      "risks": ["2-3 churn/ownership risk sentences in ${o}"],
      "critical_points": [{"severity": "high|medium|low", "title": "what they must know before subscribing", "detail": "1-2 sentences"}, "... 2-3 items"],
      "notable_features": [{"label": "short feature label", "value": "short feature detail"}, "... 4-6 items"],
      "community_sentiment": "string - 3 short paragraphs of Reddit/forum/reviewer/app-store synthesis: reception, then the recurring complaints plainly, then what long-term subscribers say",
      "community_themes": [{"label": "theme in ${o}", "sentiment": "positive|negative|mixed", "strength": "integer 0-100", "detail": "1 sentence"}, "... 4-6 themes with a realistic positive/negative mix"],
      "sentiment_breakdown": {"positive": "int", "neutral": "int", "negative": "int"},
      "sources": [{"name": "source type you relied on", "note": "what it contributed"}, "... 3-5 items"],
      "cancel_reasons": ["2-3 one-sentence reasons people actually cancel this, in ${o}"],
      "best_for": "string - 2 sentences on the ideal subscriber and usage context",
      "not_for": "string - 1-2 sentences on who should skip it",
      "factors": {
${a}
      }
    }
  }
}`}function dt(n,t,e){const i=S(e);return`You are Qor AI's subscription intelligence analyst. The per-service sections are already written. Produce ONLY the VERDICT half of the report for: ${n}.

LANGUAGE: ALL text values MUST be in ${i}.
${q(e)}


VENDOR NEUTRALITY — HARD RULE (this analysis runs on a model that may BE one of the compared services, or be made by the company that owns one):
- Your own identity, your maker, and how familiar a service feels to you must have ZERO effect on the scores. Judge every service against the same evidence bar.
- ABSENCE OF EVIDENCE IS NOT A STRENGTH. "No complaints found", "limited community information" or "no known issues" must NEVER raise a score, appear as a positive theme, or justify a high risk/community score. When the research is thin for a service, say the evidence is thin, LOWER the confidence, and score that factor in the middle band — never at the top.
- Every service must get at least two genuinely weak factors stated as plainly as the leader's. A profile where one service is best on EVERY factor is a red flag: re-check it and correct the inflation.
- FACTS ONLY FROM RESEARCH: regional availability, plan names, model names/versions and pricing tiers change constantly. State them ONLY if the research notes cover them. If they do not, omit the claim entirely — never fill it from memory.

Rules:
- ${X}
- Be decisive and personal: tie everything to the user's quiz answers without reading their profile back to them.
- ${t?`"winner.overall" MUST be exactly one of: ${n}.`:"There is a single service — judge whether it is worth keeping/subscribing and under what conditions."}
- Ground concrete claims in the live research notes. Never invent quotes, exact review counts or prices.
- NEVER mention price, cost, monthly/yearly fees, discounts or billing.

Return ONLY valid JSON:
{
  ${t?`"winner": {
    "best_content": "string - service name with the strongest catalogue/feature depth",
    "overall": "string - the service to actually pick",
    "reason": "string - 3 sentences on why it wins FOR THIS USER",
    "score_gap": "integer gap between strongest and weakest",
    "runner_up_case": "string - 1-2 sentences on when the other one is the smarter pick",
    "recommendation": "string - 2 short paragraphs with the final decision and trade-offs"
  },`:""}
  "confidence": "integer 0-100 - how solid the evidence behind this verdict is",
  "decisive_differences": [{"title": "the difference in ${i}", "detail": "1-2 sentences on who wins it and what it changes in practice"}, "... ${t?"4-6":"3-4"} items"],
  "quiz_insights": [{"topic": "2-4 word label of what the question probed", "answer": "the option the user picked, shortened", "impact": "integer -100..100 - how strongly this answer pushed the verdict", "note": "1 sentence tying the answer to a concrete property of the service"}, "... 4-6 items"],
  "detailed_comparison": {
    "service_fit_summary": "string - 2 paragraphs on overall fit",
    "feature_comparison": "string - 2 paragraphs on features, catalogue and use cases",
    "user_experience": "string - 2 paragraphs on apps, reliability and everyday usage",
    "community_and_risk": "string - 2 paragraphs on review sentiment, churn risk and long-term satisfaction. You MUST clearly state the most common COMPLAINTS users report (ad tiers, catalogue removals, sharing limits, reliability, support) — never a positives-only summary.",
    "final_plan": "string - 2 paragraphs: a concrete usage plan for the coming months, including what to watch for and when to reconsider"
  },
  "recommendation": "string - 3-4 sentences of personalized final recommendation ending with a plain instruction"
}`}async function zt({subscriptionNames:n,answers:t,language:e,userProfile:i={},research:r=""}){var P;const o=n.length>1,s=n.join(", "),a=S(e),m=fe(e),d=Object.fromEntries(m.map(u=>[u.key,u])),p=(t||[]).filter(u=>u.answer!=null).map(u=>({question:u.question,answer:u.answer})),c=JSON.stringify({subscriptions:n,mode:o?"compare":"single",quizAnswers:p,userProfile:i}),[h,f]=await Promise.all([(async()=>I({system:await Y("gemini_subscription_analysis",ht(s,n.length,o,p,e))+U(r,a),user:c,maxOutputTokens:12288}))(),(async()=>{try{return await I({system:dt(s,o,e)+U(r,a),user:c,maxOutputTokens:8192})}catch{return{}}})()]),C=h.subscriptions&&typeof h.subscriptions=="object"?h.subscriptions:{},T=new Map(Object.entries(C).map(([u,k])=>[String(u).toLowerCase(),{name:u,d:k}])),N=(n||[]).map((u,k)=>{const R=T.get(String(u).toLowerCase())||[...T.values()].find(b=>String(b.name).toLowerCase().includes(String(u).toLowerCase()))||{name:u,d:{}},l=R.d||{},L=w(l==null?void 0:l.compatibility_score)||55,D=l!=null&&l.factors&&typeof l.factors=="object"?Object.entries(l.factors).map(([b,M])=>{const ee=d[b]||{},$=M&&typeof M=="object"?M:null;return{key:b,label:ee.label||String(b).replace(/_/g," "),emoji:ee.emoji||"📊",score:w($?$.score??$.value:M)||L,detail:$?String($.detail||$.comment||""):""}}):[],j=D.length?D:m.map(b=>({key:b.key,label:b.label,emoji:b.emoji,score:L,detail:""})),g=Array.isArray(l==null?void 0:l.notable_features)?l.notable_features.map(b=>({label:String((b==null?void 0:b.label)||""),value:String((b==null?void 0:b.value)||"")})).filter(b=>b.label||b.value):[];return{name:String(R.name||u),category:String((l==null?void 0:l.category)||""),score:L,rank:w(l==null?void 0:l.rank)||k+1,explanation:String((l==null?void 0:l.compatibility_explanation)||""),pros:A(l==null?void 0:l.pros,5),cons:A(l==null?void 0:l.cons,4),risks:A(l==null?void 0:l.risks,4),criticalPoints:W((l==null?void 0:l.critical_points)||(l==null?void 0:l.criticalPoints),4),features:g,community:String((l==null?void 0:l.community_sentiment)||""),communityThemes:J((l==null?void 0:l.community_themes)||(l==null?void 0:l.communityThemes),6),sources:be(l==null?void 0:l.sources,6),cancelReasons:A((l==null?void 0:l.cancel_reasons)||(l==null?void 0:l.cancelReasons),4),sentiment:Z((l==null?void 0:l.sentiment_breakdown)||(l==null?void 0:l.sentimentBreakdown)),bestFor:String((l==null?void 0:l.best_for)||""),notFor:String((l==null?void 0:l.not_for)||(l==null?void 0:l.notFor)||""),factors:j}}).sort((u,k)=>(u.rank||99)-(k.rank||99)||k.score-u.score),v={};N.forEach(u=>{v[u.name]=u.score});const y=((P=[...N].sort((u,k)=>k.score-u.score)[0])==null?void 0:P.name)||"",E=f.winner&&typeof f.winner=="object"?f.winner:h.winner&&typeof h.winner=="object"?h.winner:null,O=f.detailed_comparison&&typeof f.detailed_comparison=="object"?f.detailed_comparison:h.detailed_comparison&&typeof h.detailed_comparison=="object"?h.detailed_comparison:null;return{isCompare:o,services:N,scores:v,winner:E?{best:String(E.best_content||E.overall||y||""),overall:String(E.overall||""),reason:String(E.reason||""),scoreGap:we(N.map(u=>u.score)),runnerUpCase:String(E.runner_up_case||E.runnerUpCase||""),recommendation:String(E.recommendation||"")}:{best:y,overall:y,reason:"",scoreGap:0,runnerUpCase:"",recommendation:""},detailed:O?{fit:String(O.service_fit_summary||""),features:String(O.feature_comparison||""),ux:String(O.user_experience||""),community:String(O.community_and_risk||""),plan:String(O.final_plan||"")}:null,decisiveDifferences:A(f.decisive_differences||f.decisiveDifferences,6),quizInsights:K(f.quiz_insights||f.quizInsights,7),confidence:Math.max(0,Math.min(100,Math.round(w(f.confidence))))||(r?76:56),researched:!!String(r||"").trim(),recommendation:String(f.recommendation||h.recommendation||(E==null?void 0:E.recommendation)||"")}}const mt={netflix:"video","disney+":"video","disney plus":"video","amazon prime":"video","prime video":"video",hbo:"video","hbo max":"video",max:"video",hulu:"video","apple tv+":"video","apple tv plus":"video",blutv:"video",exxen:"video",gain:"video",mubi:"video","youtube premium":"video",crunchyroll:"video","bein sports":"video",tod:"video","paramount+":"video","paramount plus":"video",peacock:"video",tabii:"video","tv+":"video",spotify:"music","apple music":"music","youtube music":"music",tidal:"music",deezer:"music","amazon music":"music",fizy:"music",soundcloud:"music","soundcloud go":"music","chatgpt plus":"ai",chatgpt:"ai","claude pro":"ai",claude:"ai",gemini:"ai","gemini advanced":"ai",perplexity:"ai",midjourney:"ai",copilot:"ai","microsoft copilot":"ai",grok:"ai",deepseek:"ai",poe:"ai",icloud:"cloud","icloud+":"cloud","google one":"cloud",dropbox:"cloud",onedrive:"cloud",pcloud:"cloud",mega:"cloud","adobe creative cloud":"productivity",canva:"productivity",figma:"productivity","microsoft 365":"productivity","office 365":"productivity",notion:"productivity","google workspace":"productivity",hostinger:"hosting",cloudflare:"hosting",godaddy:"hosting",namecheap:"hosting",bluehost:"hosting",siteground:"hosting",hostgator:"hosting",ionos:"hosting",dreamhost:"hosting",wix:"hosting",squarespace:"hosting",wordpress:"hosting","wordpress.com":"hosting",vercel:"hosting",netlify:"hosting",digitalocean:"hosting",kinsta:"hosting",porkbun:"hosting",wpengine:"hosting","wp engine":"hosting","xbox game pass":"gaming","playstation plus":"gaming","ps plus":"gaming","ea play":"gaming","geforce now":"gaming","nintendo switch online":"gaming","ubisoft+":"gaming","apple arcade":"gaming"};function ve(n){return mt[String(n||"").trim().toLowerCase()]||null}const pt={"video-streaming":"video","music-streaming":"music",gaming:"gaming","ai-tools":"ai","cloud-storage":"cloud",productivity:"productivity","web-hosting":"hosting",hosting:"hosting",vpn:"vpn",bundles:"bundles",news:"news",fitness:"fitness",education:"education",other:"other"};function yt(n){const t=String(n||"").trim().toLowerCase();return pt[t]||t||null}function _t(n){const t=n.map(ve).filter(Boolean);return[...new Set(t)].length>1}const ft={netflix:"Netflix","disney+":"Disney+","disney plus":"Disney+","amazon prime":"Amazon Prime","prime video":"Amazon Prime","amazon prime video":"Amazon Prime",hbo:"HBO","hbo max":"HBO Max",max:"Max",hulu:"Hulu","apple tv+":"Apple TV+","apple tv plus":"Apple TV+",blutv:"BluTV",exxen:"Exxen",exen:"Exxen",gain:"Gain",mubi:"MUBI","youtube premium":"YouTube Premium","yt premium":"YouTube Premium",crunchyroll:"Crunchyroll","bein sports":"beIN Sports",tod:"TOD","paramount+":"Paramount+","paramount plus":"Paramount+",peacock:"Peacock",tabii:"Tabii","tv+":"Apple TV+",spotify:"Spotify","apple music":"Apple Music","youtube music":"YouTube Music","yt music":"YouTube Music",tidal:"Tidal",deezer:"Deezer","amazon music":"Amazon Music",fizy:"Fizy",soundcloud:"SoundCloud","soundcloud go":"SoundCloud Go","chatgpt plus":"ChatGPT Plus",chatgpt:"ChatGPT Plus","claude pro":"Claude Pro",claude:"Claude Pro",gemini:"Gemini Advanced","gemini advanced":"Gemini Advanced",perplexity:"Perplexity",midjourney:"Midjourney",copilot:"Microsoft Copilot","microsoft copilot":"Microsoft Copilot",grok:"Grok",deepseek:"DeepSeek",poe:"Poe",icloud:"iCloud+","icloud+":"iCloud+","google one":"Google One",dropbox:"Dropbox",onedrive:"OneDrive",pcloud:"pCloud",mega:"MEGA","adobe creative cloud":"Adobe Creative Cloud",canva:"Canva","microsoft 365":"Microsoft 365","office 365":"Microsoft 365",notion:"Notion","google workspace":"Google Workspace",hostinger:"Hostinger",cloudflare:"Cloudflare",godaddy:"GoDaddy",namecheap:"Namecheap",bluehost:"Bluehost",siteground:"SiteGround",hostgator:"HostGator",ionos:"IONOS",dreamhost:"DreamHost",wix:"Wix",squarespace:"Squarespace",wordpress:"WordPress.com","wordpress.com":"WordPress.com",vercel:"Vercel",netlify:"Netlify",digitalocean:"DigitalOcean",kinsta:"Kinsta",porkbun:"Porkbun",wpengine:"WP Engine","wp engine":"WP Engine","xbox game pass":"Xbox Game Pass","playstation plus":"PlayStation Plus","ps plus":"PlayStation Plus","ea play":"EA Play","geforce now":"GeForce Now","nintendo switch online":"Nintendo Switch Online","ubisoft+":"Ubisoft+","apple arcade":"Apple Arcade"};function gt(n){const t=String(n||"").trim().toLowerCase();return t.includes("http://")||t.includes("https://")||t.includes("www.")||/\.[a-z]{2,}(\/|$)/.test(t)}function ae(n){const t=String(n||"").trim().replace(/\s+/g," "),e=ft[t.toLowerCase()];return e||t.replace(/\b\w/g,i=>i.toUpperCase())}function bt(n){const t=String(n||"").slice(0,2)==="tr",e=String(n||"").slice(0,2)==="de";return{empty:t?"Lütfen en az bir abonelik adı girin.":e?"Bitte gib mindestens einen Abo-Namen ein.":"Please enter at least one subscription name.",url:t?"Buraya yalnızca abonelik adı girebilirsin — link kabul edilmez.":e?"Hier sind nur Abo-Namen erlaubt — keine Links.":"Only subscription names are accepted here — links are not allowed.",notSub:t?"Bu metin bir abonelik servisine benzemiyor. Lütfen Netflix, Spotify gibi bir servis adı yaz.":e?"Das sieht nicht nach einem Abo-Dienst aus. Gib einen Namen wie Netflix oder Spotify ein.":"This doesn't look like a subscription service. Please enter a name like Netflix or Spotify.",failed:t?"Abonelik doğrulanırken hata oluştu. Lütfen tekrar deneyin.":e?"Abo konnte nicht geprüft werden. Bitte erneut versuchen.":"Could not validate subscription. Please try again.",dup:i=>t?`"${i}" zaten eklendi.`:e?`"${i}" ist bereits hinzugefügt.`:`"${i}" is already added.`}}function wt(n,t=[],e=""){const i=S(n),r=(t||[]).map(s=>String(s||"").trim()).filter(Boolean),o=r.length?`

CONTEXT — the user is already comparing: ${r.join(", ")}${e?` (category: ${e})`:""}.
If the input is the SAME real-world type as those, give it the SAME category. Only pick a different category when it truly is a different type.`:"";return`You are Qor AI's subscription validation engine.
Decide whether the input below is a real digital subscription/service OR a real paid digital app, software or platform a person can subscribe to or pay for.

ACCEPT (is_subscription = true):
- Streaming, music, gaming, AI tools, cloud storage, web hosting/domains, VPN, news, fitness, education services.
- Paid digital software/apps and professional/creative tools — e.g. Adobe, Photoshop, Premiere Pro, Canva, Figma, DaVinci Resolve, Final Cut, Microsoft 365, Notion, ChatGPT Plus, Xbox Game Pass.
- If the input is a typo or alternate spelling of a known service, normalize it (e.g. "adobe da vinci", "davinci", "da vinci resolve" → "DaVinci Resolve").

REJECT (is_subscription = false):
- Random/gibberish text, profanity, and generic everyday words.
- Physical products and hardware (phones, cars, food, devices like IQOS).
- Links/URLs and unrelated text.

Category — choose EXACTLY ONE: video-streaming, music-streaming, gaming, ai-tools, cloud-storage, productivity, web-hosting, vpn, news, fitness, education, bundles, other.
Group like-for-like services into the SAME category so they compare cleanly:
- web-hosting = web hosting, domain registrars, CDN/DNS, website builders (Hostinger, Cloudflare, GoDaddy, Namecheap, Vercel, Netlify, Wix, Squarespace, DigitalOcean).
- vpn = VPN and privacy services (NordVPN, ExpressVPN, Surfshark, Proton VPN, Mullvad).
- productivity = ALL design / creative / video-editing / office / professional software (Adobe, Canva, Figma, DaVinci Resolve, Final Cut, Microsoft 365, Notion).
- Prefer a specific category; use "other" ONLY when nothing above fits.
"display_name" must be the clean branded service name. "reason" must be short and in ${i}.${o}

Return ONLY valid JSON:
{ "is_subscription": true|false, "display_name": "string or null", "category": "string or null", "reason": "string" }`}async function Dt(n,t=[],e="en",i=""){const r=bt(e),o=String(n||"").trim();if(!o)return{error:r.empty};if(gt(o))return{error:r.url};const s=o.toLowerCase();if((t||[]).some(h=>String(h||"").trim().toLowerCase()===s))return{error:r.dup(o)};const a=ve(o);if(a){const h=ae(o);return(t||[]).some(f=>String(f||"").trim().toLowerCase()===h.toLowerCase())?{error:r.dup(h)}:{displayName:h,category:a}}let m;try{m=await I({system:wt(e,t,i),user:JSON.stringify({input:o}),maxOutputTokens:512})}catch{return{error:r.failed}}const d=(m==null?void 0:m.is_subscription)===!0,p=ae((m==null?void 0:m.display_name)||o),c=yt(m==null?void 0:m.category);return!d||!p||!c?{error:r.notSub}:(t||[]).some(h=>String(h||"").trim().toLowerCase()===p.toLowerCase())?{error:r.dup(p)}:{displayName:p,category:c}}function vt(n,{feature:t,cost:e,balance:i,lang:r}){const o=String(r||"en").slice(0,2).toLowerCase(),s=te(e??Re(t),o),a=te(i??0,o);return o==="tr"?n==="AUTH_REQUIRED"?`Bu AI özelliği için giriş yapmalısın. İşlem ücreti: ${s} Qor Coin.`:n==="QUIZ_REQUIRED"?"AI özellikleri için önce profil quizini tamamlamalısın. Seni quiz sayfasına yönlendiriyorum.":n==="INSUFFICIENT_QOR_COINS"?`Qor Coin bakiyen yetersiz — analiz başlatılmadı. Bu işlem ${s} Qor Coin, bakiyen ${a}. Sınırsız AI için Premium'a geçebilirsin.`:"AI erişimi hazırlanamadı. Lütfen tekrar dene.":o==="de"?n==="AUTH_REQUIRED"?`Sign in to use this AI feature. Cost: ${s} Qor Coin.`:n==="QUIZ_REQUIRED"?"Schließe zuerst das Profil-Quiz ab. Wir bringen dich zur Quiz-Seite.":n==="INSUFFICIENT_QOR_COINS"?`Dein Qor-Coin-Guthaben reicht nicht — die Analyse wurde nicht gestartet. Sie kostet ${s}, dein Guthaben beträgt ${a}. Für unbegrenzte KI kannst du auf Premium wechseln.`:"KI-Zugriff konnte nicht vorbereitet werden. Bitte erneut versuchen.":n==="AUTH_REQUIRED"?`Sign in to use this AI feature. Cost: ${s} Qor Coin.`:n==="QUIZ_REQUIRED"?"Complete the profile quiz first. Sending you to the quiz page.":n==="INSUFFICIENT_QOR_COINS"?`Not enough Qor Coin — the analysis was not started. This costs ${s} and your balance is ${a}. You can go Premium for unlimited AI.`:"AI access could not be prepared. Please try again."}function Mt(n="en"){const{user:t,openAuth:e}=Ae(),i=ke(),r=Se();return Ee.useCallback(async(o,s={})=>{const a=s.requireQuiz!==!1,m=(d,p={})=>{var h;const c=vt(d,{feature:o,lang:n,cost:p.cost,balance:p.balance});return(h=s.onMessage)==null||h.call(s,c,d),c};if(!t){const d=m("AUTH_REQUIRED");return e(),{ok:!1,reason:"AUTH_REQUIRED",message:d}}if(a&&!Te(t)){const d=m("QUIZ_REQUIRED"),p=`${r.pathname}${r.search}${r.hash}`;return i(`/quiz?required=1&next=${encodeURIComponent(p)}`),{ok:!1,reason:"QUIZ_REQUIRED",message:d}}try{return{ok:!0,...await Ne(o)}}catch(d){const p=(d==null?void 0:d.code)||"AI_ACCESS_ERROR",c=m(p,d);return p==="AUTH_REQUIRED"&&e(),{ok:!1,reason:p,message:c,cost:d==null?void 0:d.cost,balance:d==null?void 0:d.balance}}},[n,r.hash,r.pathname,r.search,i,e,t])}export{Tt as a,At as b,x as c,Me as d,Ut as e,Pt as f,qt as g,$t as h,Rt as i,Nt as j,It as k,Ct as l,Lt as m,ve as n,_t as o,Ot as r,zt as s,Mt as u,Dt as v};
