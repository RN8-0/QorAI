import{a4 as pt,aO as yt,a5 as gt,aJ as ft,X as Ne,Q as bt}from"./index-Bqvm2VBs.js";import{pb as ee,PB_URL as Ie}from"./pocketbase-ChTYGzaH.js";import{f as wt,e as vt,d as St}from"./vendor-D2xFRrlB.js";let Z=null,Ce=0;async function kt(){const l=Date.now();if(Z&&l-Ce<5*60*1e3)return Z;try{const c=await ee.collection("public_config").getFirstListItem('key = "ai_prompts"'),u=c&&c.value;Z=u&&typeof u=="object"?u:{}}catch{Z={}}return Ce=l,Z}async function Et(l,c){try{const u=await kt(),p=u?u[l]:null,b=(p==null?"":String(p)).trim();if(b.length>=40)return b}catch{}return c}const At=`${Ie}/api/ai/gemini`,Tt="gemini-2.5-flash",Rt=`${Ie}/api/ai/deepseek`,Nt="deepseek-chat",Ct=8192,It={tr:"Turkish",en:"English",es:"Spanish",fr:"French",it:"Italian",pt:"Portuguese",ru:"Russian",nl:"Dutch",pl:"Polish",sv:"Swedish",ja:"Japanese",ar:"Arabic"};function Ot(l="en"){const c=String(l||"en").slice(0,2).toLowerCase();return It[c]||"English"}const Lt=`You are Qor AI — a friendly, sharp shopping and product advisor for ALL product categories (technology, audio, photo, home, fashion and more) on qorai.net.
- KEEP IT SHORT AND SCANNABLE. Lead with a one- or two-sentence direct answer, then at most 3-4 short bullets ONLY if they truly add value. No long essays, no restating the question, no filler. A simple question gets a simple 1-2 sentence reply.
- BE SPECIFIC, NOT GENERIC. When recommending, name real, current products/models (e.g. "Lenovo LOQ 15 (RTX 4060)") — NEVER answer with vague component advice like "look for an i7 with an RTX 4050". Give 2-3 concrete named picks, each with a one-line reason and, when the context provides it, an approximate current price. If you truly cannot name specific models, say so plainly instead of padding with generic advice.
- Any product, comparison, page, "QOR CATALOG DATA" or "LIVE WEB RESEARCH" context you are given is the CURRENT, live truth — trust it over your older memory. If a product appears there it EXISTS; NEVER say a product does not exist, is fake, or has not launched when it is in that context or in the web research.
- With QOR CATALOG DATA: answer from those exact Qor specs and the listed Qor price, and prefer recommending those on-site products (you may share their Qor page link). With LIVE WEB RESEARCH: use it for current launch status, specs, current prices and specific model names. If neither is given and you are unsure whether something exists or its current status, do NOT guess "not released" — say plainly what you are unsure about and what to check on the store/official page.
- Recommend with honest trade-offs: who it is for, who should skip it, and one or two alternatives when useful — briefly.
- Prices/availability change: never invent an exact price; use the Qor price or the LIVE WEB RESEARCH price when provided, otherwise say to check the local store.
- Plain text only: no Markdown headings (#, ##), no code fences, no tables, no raw JSON. Use short "Label:" lines and normal sentences or "- " bullets.
- Never mention backend providers, model names or internal tooling; if asked what powers you, answer as Qor AI.
- Address the person directly ("you" / "sen" / "siz"), never "the user".`;function Pt(l="en",c="",u={}){const p=Ot(l),b=new Date().toISOString().slice(0,10),v=String(u.country||"").toUpperCase(),f=String(u.currency||"").toUpperCase(),w=v?`
- LOCAL MARKET: The person is in ${v}${f?` and shops in ${f}`:""}. Whenever you mention a price, budget or value, use ${f||"their local currency"} and that market's typical pricing — NEVER quote another country's currency (e.g. do not give Turkish Lira to a non-Turkish user, or USD to a Turkish user). If you don't know the local price, say it should be checked on the local store instead of guessing in the wrong currency.`:"";return`${Lt}
- TODAY'S DATE is ${b}. Your own training knowledge is older than this and is stale for recent products, launches, subscription plans and prices. NEVER say something "doesn't exist", "isn't out yet", "hasn't launched" or "is only a rumor" from your own memory — a phone/product that would normally ship by ${b} is already out. Trust the QOR CATALOG DATA and LIVE WEB RESEARCH context for what is real and current; if neither covers it, say you'd verify the latest status rather than asserting it is unreleased.
- SITE LANGUAGE: Reply only in ${p}. Keep official product and brand names as-is.
- If the person writes in another language, still answer in ${p} because the site language is ${p}.${w}
${c?`
QOR CATALOG / PAGE CONTEXT:
${c}`:""}`}const pe=l=>new Promise(c=>setTimeout(c,l));function Oe(l){return l===404||l===429||l===500||l===502||l===503||l===504}function Le(l){return l===500||l===502||l===503||l===504}async function Pe(l,c,u=9e4){const p=new AbortController,b=setTimeout(()=>p.abort(),u),v={"Content-Type":"application/json"};try{ee&&ee.authStore&&ee.authStore.token&&(v.Authorization=ee.authStore.token)}catch{}try{return await fetch(l,{method:"POST",headers:v,body:JSON.stringify(c),signal:p.signal})}finally{clearTimeout(b)}}async function $e({system:l,messages:c,maxOutputTokens:u,temperature:p,tools:b,jsonMode:v,timeoutMs:f}){var $,N,q,B,W;const w={temperature:p,maxOutputTokens:u,thinkingConfig:{thinkingBudget:0}};v&&(w.responseMimeType="application/json");const R={model:Tt,systemInstruction:{parts:[{text:l}]},contents:c.map(D=>({role:D.role==="assistant"?"model":D.role,parts:[{text:D.content}]})),generationConfig:w};Array.isArray(b)&&b.length&&(R.tools=b);const y=await Pe(At,R,f);if(!y.ok){const D=new Error(`gemini ${y.status}`);throw D.transient=Oe(y.status),D.retryable=Le(y.status),D}const E=await y.json(),O=(W=(B=(q=(N=($=E==null?void 0:E.candidates)==null?void 0:$[0])==null?void 0:N.content)==null?void 0:q.parts)==null?void 0:B[0])==null?void 0:W.text;if(!O){const D=new Error("gemini empty");throw D.transient=!0,D}return O.trim()}async function $t({system:l,messages:c,maxOutputTokens:u,temperature:p,jsonMode:b,timeoutMs:v}){var E,O,$;const f={model:Nt,messages:[{role:"system",content:l},...c],max_tokens:Math.min(u,Ct),temperature:p};b&&(f.response_format={type:"json_object"});const w=await Pe(Rt,f,v);if(!w.ok){const N=new Error(`deepseek ${w.status}`);throw N.transient=Oe(w.status),N.retryable=Le(w.status),N}const R=await w.json();if(R&&R.error){const N=new Error(`deepseek ${R.error}`);throw N.transient=String(R.error)==="rate_limited",N}const y=($=(O=(E=R==null?void 0:R.choices)==null?void 0:E[0])==null?void 0:O.message)==null?void 0:$.content;if(!y){const N=new Error("deepseek empty");throw N.transient=!0,N}return y.trim()}async function Ue({system:l,messages:c,maxOutputTokens:u=4096,temperature:p=.7,jsonMode:b=!1,tools:v=null,timeoutMs:f=9e4,budgetMs:w=null}){const R=Date.now()+(w||f*2),y=()=>R-Date.now();let E;for(let O=0;O<2&&!(y()<=2e3);O++)try{return await $e({system:l,messages:c,maxOutputTokens:u,temperature:p,tools:v,jsonMode:b,timeoutMs:Math.min(f,y())})}catch($){if(E=$,!$.retryable||O===1)break;await pe(1200)}for(let O=0;O<2&&!(y()<=2e3);O++)try{return await $t({system:l,messages:c,maxOutputTokens:u,temperature:p,jsonMode:b,timeoutMs:Math.min(f,y())})}catch($){if(E=$,!$.retryable||O===1)break;await pe(1200)}throw E||new Error("AI failed")}async function Ut({system:l,user:c,maxOutputTokens:u=4096,temperature:p=.2,timeoutMs:b=35e3}){let v;const f=[{role:"user",content:c}];for(let w=0;w<3;w++)try{return await $e({system:l,messages:f,maxOutputTokens:u,temperature:p,tools:[{googleSearch:{}}],jsonMode:!1,timeoutMs:b})}catch(R){if(v=R,!R.transient||w===2)break;await pe(700+w*500)}throw v||new Error("grounded search failed")}async function Bt(l,c={}){const u=l.map(p=>({role:p.role==="model"||p.role==="assistant"?"assistant":"user",content:p.text}));return Ue({system:Pt(c.language||c.lang||"en",c.context||"",{country:c.country||"",currency:c.currency||""}),messages:u,maxOutputTokens:4096,temperature:.68})}async function _t({system:l,user:c,maxOutputTokens:u=4096,temperature:p=.7,jsonMode:b=!1,tools:v=null,timeoutMs:f,budgetMs:w}){return Ue({system:l,messages:[{role:"user",content:c}],maxOutputTokens:u,temperature:p,jsonMode:b,tools:v,timeoutMs:f,budgetMs:w})}async function zt(l,c={}){const u=c.language||c.lang||"en";return Ut({system:pt(u),user:l,maxOutputTokens:c.maxOutputTokens||4096,temperature:.2,timeoutMs:c.timeoutMs||35e3})}function he(l){return String(l||"").trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/i,"").replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/,\s*([}\]])/g,"$1").trim()}function Mt(l){const c=String(l||""),u=c.indexOf("{");if(u<0)return"";let p=0,b=!1,v=!1;for(let f=u;f<c.length;f++){const w=c[f];if(v){v=!1;continue}if(w==="\\"){v=!0;continue}if(w==='"'){b=!b;continue}if(!b&&(w==="{"&&(p+=1),w==="}"&&(p-=1,p===0)))return c.slice(u,f+1)}return""}function Dt(l){const c=String(l||""),u=c.indexOf("{");if(u<0)return"";const p=[];let b=!1,v=!1,f=-1,w=null;for(let y=u;y<c.length;y++){const E=c[y];if(v){v=!1;continue}if(E==="\\"){v=!0;continue}if(E==='"'){b=!b;continue}b||(E==="{"||E==="["?p.push(E==="{"?"}":"]"):E==="}"||E==="]"?(p.pop(),f=y+1,w=[...p]):E===","&&(f=y,w=[...p]))}if(!p.length||f<0||!w)return"";let R=c.slice(u,f).replace(/,\s*$/,"");for(let y=w.length-1;y>=0;y--)R+=w[y];return R}function jt(l){const c=he(l);try{return JSON.parse(c)}catch{}const u=he(Mt(c));if(u)try{return JSON.parse(u)}catch{}const p=Dt(c);if(p)try{return JSON.parse(he(p))}catch{}throw new Error("AI JSON parse failed")}async function xt({system:l,user:c,maxOutputTokens:u=4096,timeoutMs:p=7e4,budgetMs:b=15e4,temperature:v=.6}){const f=await _t({system:l,user:c,maxOutputTokens:u,temperature:v,jsonMode:!0,timeoutMs:p,budgetMs:b});return jt(f)}(function(l){var c=l.QorAiPrompts,u=c.languageName,p=c.quizGenerationPrompt,b=c.compareQuizGenerationPrompt,v=c.subscriptionQuizPrompt,f=c.productQuizCount,w=c.compareQuizCount,R=c.subscriptionQuizCount,y=c.variationSeed,E=null;function O(t){E=t||null}function $(){if(!E)throw new Error("[QorAiLink] configure({askJson, askGrounded, adminPrompt}) cagrilmadi");return E}function N(t){return $().askJson(t)}function q(t,n){return $().askGrounded(t,n)}function B(t,n){return $().adminPrompt(t,n)}function W(t){return String(t||"en").slice(0,2).toLowerCase()==="tr"?["Kullanım Uyumu","Performans","Kalite Uyumu","Özellik Seti","Ergonomi ve Taşınabilirlik","Güvenilirlik ve Risk","Topluluk Sinyali","Uzun Vadeli Değer"]:["Usage Fit","Performance","Quality Fit","Feature Set","Ergonomics and Portability","Reliability and Risk","Community Signal","Long-term Value"]}function D(t){return String(t||"en").slice(0,2).toLowerCase()==="tr"?[{key:"usage_fit",label:"Kullanım Uyumu",emoji:"🎯"},{key:"content_match",label:"İçerik Uyumu",emoji:"🎬"},{key:"feature_depth",label:"Özellik Derinliği",emoji:"🧩"},{key:"ecosystem_fit",label:"Ekosistem Uyumu",emoji:"🔗"},{key:"lifestyle_match",label:"Yaşam Tarzı Uyumu",emoji:"🏠"},{key:"community_signal",label:"Topluluk Sinyali",emoji:"🌐"},{key:"retention_value",label:"Uzun Vadeli Tutma Değeri",emoji:"🚀"},{key:"risk_balance",label:"Risk Dengesi",emoji:"🛡"}]:[{key:"usage_fit",label:"Usage Fit",emoji:"🎯"},{key:"content_match",label:"Content Match",emoji:"🎬"},{key:"feature_depth",label:"Feature Depth",emoji:"🧩"},{key:"ecosystem_fit",label:"Ecosystem Fit",emoji:"🔗"},{key:"lifestyle_match",label:"Lifestyle Match",emoji:"🏠"},{key:"community_signal",label:"Community Signal",emoji:"🌐"},{key:"retention_value",label:"Long-term Retention",emoji:"🚀"},{key:"risk_balance",label:"Risk Balance",emoji:"🛡"}]}function _e(t){const n=u(t);return`You are Qor AI's link analysis engine. You receive a product URL, optional metadata, optional web research data, and a user profile. Your job is to identify the EXACT product and analyze it for the user.

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

LANGUAGE: Write the "analysis" field in ${n}.

SCORING RULES:
- Score reflects how well this product fits the user (range: 20-95)
- For tech: consider ecosystem, budget, priorities
- For non-tech: consider budget, lifestyle, stated interests, practical value

Return valid JSON:
{
  "is_product": true,
  "score": 20-95,
  "analysis": "Detailed category-appropriate analysis in ${n}",
  "category": "product category in English lowercase",
  "title": "EXACT product name from metadata/URL — NEVER invented or substituted",
  "image_url": null,
  "price": "Price with currency if known, else null",
  "site_name": "Store name from URL domain"
}`}const re=new Set(["p","dp","pd","gp","aw","d","product","products","urun","urunler","item","items","ref","detay","detail","details","ilan","ilanlar","listing","listings","ad","ads","offer","offers","sayfa","page","satilik","kiralik","sahibinden","index","default","view","show"]);function te(t){const n=String(t||"").trim().toLowerCase();if(!n||n.length<4)return!0;const e=n.split(/\s+/).filter(Boolean);return!!(!e.length||e.every(i=>re.has(i))||e.length<=2&&e.some(i=>re.has(i))||!/[a-zçğıöşü]{3,}/i.test(n))}function ye(t){try{const n=new URL(t),e=n.pathname.split("/").map(d=>d.trim()).filter(Boolean);let i="";if(/amazon\./i.test(n.hostname)){const d=e.findIndex(g=>/^(dp|product)$/i.test(g));d>0&&(i=e[d-1])}const o=d=>re.has(String(d).toLowerCase())||/^(ref|psc|qid|sr)[=_-]/i.test(d),r=/^(?:[a-z0-9]{10}|[a-f0-9]{16,}|[0-9]{8,})$/i;return i||(i=e.filter(g=>/[a-zçğıöşü]{3,}/i.test(g)&&!o(g)&&!r.test(g)).sort((g,S)=>S.replace(/[^a-zçğıöşü]/gi,"").length-g.replace(/[^a-zçğıöşü]/gi,"").length)[0]||""),i||(i=[...e].reverse().find(d=>/[a-z]/i.test(d)&&!o(d))||""),i=i.replace(/\.(html?|php|aspx?)$/i,"").replace(/[-_]+/g," "),i=i.replace(/\b(p|dp|pd|product|urun|item|ref|detay|ilan)\b/gi," ").replace(/\s+/g," ").trim(),i=i.replace(/\s+\d{5,}$/,"").trim(),i=i.replace(/\s+[A-Za-z]{2,}\d[A-Za-z0-9]{5,}$/,"").trim(),i.length<3?"":i.replace(/\b\w/g,d=>d.toUpperCase()).slice(0,80)}catch{return""}}function ge(t,n){const e=`${t||""} ${n||""}`.toLowerCase();return/(vasita|otomobil|arac|araba|\bauto\b|automobil|car|suv|pickup|kamyonet|motosiklet|motorcycle|ecoboost|tdi|tsi|dizel|benzin|hybrid|4x4|ranger|raptor|hilux|amarok)/.test(e)?"cars":/(emlak|konut|daire|villa|arsa|real-?estate|apartment|kiralik-?ev)/.test(e)?"real-estate":/(laptop|notebook|macbook|thinkpad|thinkbook|vivobook|zenbook|ultrabook|chromebook|legion|rog|tuf|omen|victus|ideapad|nebula)/.test(e)?"laptops":/(headphone|headset|kulaklik|earbud|airpods|buds|wh-|quietcomfort)/.test(e)?"headphones":/(tablet|ipad|galaxy-?tab|mediapad|matepad)/.test(e)?"tablets":/(phone|iphone|galaxy|pixel|xiaomi|redmi|smartphone|telefon)/.test(e)?"smartphones":/(monitor|display|oled|qled|ultrawide)/.test(e)?"monitors":/(keyboard|mouse|klavye|fare)/.test(e)?"keyboards":/(camera|kamera|objektif|lens|dslr|mirrorless)/.test(e)?"cameras":/(book|books|isbn|kindle|kitap)/.test(e)?"books":/(shoe|shirt|dress|jacket|pantolon|ayakkabi|giyim|tekstil)/.test(e)?"clothing":/(bisiklet|bicycle|scooter|skuter)/.test(e)?"bikes":/(kitchen|vacuum|robot|coffee|airfryer|home|mutfak|beyaz-?esya|buzdolabi|camasir)/.test(e)?"home-appliances":/(game|gaming|ps5|xbox|switch|konsol)/.test(e)?"gaming":"general"}function fe({url:t,title:n,siteName:e,language:i}){const o=String(i||"en").slice(0,2).toLowerCase(),r=n||e||t;return o==="tr"?`"${r}" bağlantısı ürün sayfası olarak işlendi. Qor AI ürün adını bağlantı ve site bilgisinden çıkardı; canlı sayfa verisi alınamadığında değerlendirme, ürün adı/kategori sinyalleri ve profil cevapların üzerinden hazırlanır. Satın almadan önce satıcı sayfasındaki güncel fiyat, garanti ve teknik özellikleri de kontrol et.`:`"${r}" was processed as a product link. Qor AI identified it from the URL and store signal; when live page data is unavailable, the recommendation is built from the title, category signals, and your answers. Check the seller page for current price, warranty, and specs before buying.`}const ze=["quora.com","reddit.com","youtube.com","youtu.be","twitter.com","x.com","facebook.com","fb.com","fb.watch","instagram.com","tiktok.com","threads.net","wikipedia.org","fandom.com","medium.com","substack.com","linkedin.com","pinterest.com","github.com","gitlab.com","stackoverflow.com","stackexchange.com","google.com","bing.com","duckduckgo.com","yahoo.com","yandex.com","whatsapp.com","t.me","telegram.org","discord.com","discord.gg","twitch.tv","spotify.com","soundcloud.com","netflix.com","wikihow.com"];function be(t){let n;try{n=new URL(t)}catch{return!1}const e=n.hostname.replace(/^www\./,"").toLowerCase();return!(ze.some(o=>e===o||e.endsWith("."+o))||!n.pathname.replace(/\/+$/,"")&&!n.search)}async function Me(t,n,e={}){const i=ye(t);let o="";try{o=new URL(t).hostname.replace(/^www\./,"")}catch{}if(!be(t))return{url:t,title:i||o||t,score:0,analysis:"",category:"",siteName:o,price:null,isProduct:!1};let r="";if(te(i)||/amazon\./i.test(o))try{const m=`Identify the EXACT product sold at this URL using Google Search.
URL: ${t}
`+(i?`Possible title from URL slug: ${i}
`:"")+(o?`Store: ${o}
`:"")+"Return the exact product name (brand + model + key variant), its category, and the current price with currency if visible. If you cannot confirm ONE specific product, say so explicitly — do not guess.";r=await q(m,{language:n,maxOutputTokens:768,timeoutMs:25e3})}catch{}let g=null;try{const m={url:t,productMetadata:i?{title:i,siteName:o}:{siteName:o},userProfile:e};r&&(m.webResearch=r),g=await N({system:await B("gemini_link_analysis_system",_e(n)),user:JSON.stringify(m),maxOutputTokens:1536})}catch{g={title:i||o||t,score:60,analysis:fe({url:t,title:i,siteName:o,language:n}),category:ge(t,i),site_name:o,price:null,is_product:!0}}const S=String(g.title||"").trim(),T=!S||/erişim|hata|error|unknown|bilinmeyen/i.test(S)||te(S)?te(i)?S||o||t:i:S;return{url:t,title:T,score:Number(g.score)||0,analysis:String(g.analysis||fe({url:t,title:T,siteName:o,language:n})),category:(()=>{const m=String(g.category||"").toLowerCase().trim();if(m&&m!=="general"&&m!=="other")return m;const h=ge(t,`${T} ${g.analysis||""}`);return h!=="general"?h:m||"general"})(),siteName:String(g.site_name||o||""),price:g.price||null,isProduct:g.is_product!==!1}}async function De({category:t,productTitle:n,url:e,language:i,userProfile:o={},productContext:r="",siteName:d=""}){const g=f(t),S=await N({system:p(i,g),user:JSON.stringify({category:t||"unknown",productTitle:n,url:e,store:d,productContext:String(r||"").slice(0,1200),userProfile:o,variationSeed:y()}),maxOutputTokens:3072,temperature:.95});return(Array.isArray(S.questions)?S.questions:[]).map((T,m)=>({id:`q${m}`,text:String(T.question||""),options:Array.isArray(T.options)?T.options.map(String):[]})).filter(T=>T.text&&T.options.length>=2).slice(0,g)}async function je({products:t,language:n,userProfile:e={}}){const i=w(t),o=await N({system:b(n,i),user:JSON.stringify({products:(t||[]).map(r=>({title:r.title,url:r.url,category:r.category||"unknown",store:r.siteName,initialScore:r.score,productContext:String(r.analysis||"").slice(0,900)})),userProfile:e,variationSeed:y()}),maxOutputTokens:8192,temperature:.95});return(Array.isArray(o.questions)?o.questions:[]).map((r,d)=>({id:`cq${d}`,text:String(r.question||""),options:Array.isArray(r.options)?r.options.map(String):[]})).filter(r=>r.text&&r.options.length>=2).slice(0,i)}async function xe({subscriptionNames:t,language:n,userProfile:e={}}){const i=t.length>1,o=R(t),r=await N({system:v(t.join(", "),i,n,o),user:JSON.stringify({subscriptions:t,mode:i?"compare":"single",userProfile:e,variationSeed:y()}),maxOutputTokens:8192,temperature:.95});return(Array.isArray(r.questions)?r.questions:[]).map((g,S)=>({id:`sq${S}`,text:String(g.question||""),options:Array.isArray(g.options)?g.options.map(String):[]})).filter(g=>g.text&&g.options.length>=2).slice(0,o)}function oe(t){return`Cover ALL of the following, as compact notes:
1) IDENTITY: what this exactly is (edition/variant), current market status, and the headline specs or plan details that actually matter.
2) COMMUNITY SENTIMENT — THE MAIN JOB: scan real user discussion (Reddit threads, YouTube review takeaways and their comment sections, retailer review patterns such as Amazon/Trendyol/Best Buy, specialist review sites, forums, app-store reviews). Extract the RECURRING THEMES, not one-off opinions. For each theme note: the theme, whether it is praise / complaint / mixed, and roughly how dominant it is (e.g. "mentioned in most threads" vs "occasional").
3) COMPLAINTS IN DETAIL: the most repeated negatives, failures, regrets, after-sales/support problems, and whether they hit everyone or only a specific use case. Never soften them.
4) WHO LOVES IT vs WHO REGRETS IT: the usage profiles behind each side.
5) DEAL-BREAKERS: the things a buyer would be angry about not knowing beforehand.
6) ALTERNATIVES people actually compare it against, and why they switch.
7) VALUE / TIMING signal: discount cadence, a newer model or plan change on the horizon, or long-term cost drift. No invented exact prices.
Write in ${t}. Do NOT invent direct quotes, exact review counts, or exact prices. Where evidence is thin, say plainly that it is thin.`}async function Ge({title:t,category:n,url:e,siteName:i,language:o}){const r=u(o),d=String(t||"").trim();if(!d)return"";try{return await q(`Research the product "${d}"${n?` (category: ${n})`:""} for a Qor AI buyer report.
`+(e?`Product URL: ${e}
`:"")+(i?`Store: ${i}
`:"")+`
${oe(r)}`,{language:o,maxOutputTokens:3072,timeoutMs:45e3})}catch{return""}}async function Fe({bases:t=[],language:n}){const e=u(n),i=t.filter(r=>r&&r.title);if(!i.length)return"";const o=i.map((r,d)=>`${d+1}. ${r.title}${r.category?` (${r.category})`:""}${r.siteName?` — ${r.siteName}`:""}`).join(`
`);try{return await q(`Research these products for a Qor AI head-to-head comparison report:
${o}

${oe(e)}

8) HEAD-TO-HEAD: after covering each product, state the decisive real-world differences between them and which owner profile ends up happier with which one.`,{language:n,maxOutputTokens:4096,timeoutMs:5e4})}catch{return""}}async function qe({names:t=[],language:n}){const e=u(n),i=t.filter(Boolean);if(!i.length)return"";try{return await q(`Research these subscription services for a Qor AI subscription report: ${i.join(", ")}.

${oe(e)}

8) SUBSCRIPTION SPECIFICS: recent catalogue/feature/plan changes, ad tiers, sharing and device limits, regional content gaps, app quality and reliability complaints, support quality, and the most common reasons people cancel or come back.
9) If several services are listed, end with the decisive differences between them for everyday use.`,{language:n,maxOutputTokens:4096,timeoutMs:5e4})}catch{return""}}const Qe=new Set(["ile","için","and","the","with","for","gb","tb","mb","inch","inç","akıllı","telefon","cep","kablosuz","siyah","beyaz","gri","mavi"]);function we(t){return String(t||"").toLowerCase().replace(/[()[\]{}",]/g," ").split(/[\s/_-]+/).map(n=>n.trim()).filter(n=>n.length>1&&!Qe.has(n))}function ve(t,n){const e=we(t),i=new Set(we(n));return!e.length||!i.size?0:e.filter(r=>i.has(r)).length/e.length}async function Be(t,{searchProducts:n,minScore:e=.55}={}){const i=String(t||"").trim();if(!i||typeof n!="function")return null;let o=[];try{o=await n(i,8)}catch{return null}let r=null;for(const d of Array.isArray(o)?o:[]){if(!(d!=null&&d.id)||!(d!=null&&d.name))continue;const g=Math.min(ve(i,d.name),ve(d.name,i)+.15);(!r||g>r.score)&&(r={score:g,product:d})}return r&&r.score>=e?r.product:null}function Ve(t,n=75e3){return t?Promise.race([Promise.resolve(t).then(e=>String(e||"")).catch(()=>""),new Promise(e=>{setTimeout(()=>e(""),n)})]):Promise.resolve("")}function z(t,n=8){return Array.isArray(t)?t.map(e=>typeof e=="string"?{title:e.trim(),detail:""}:e&&typeof e=="object"?{title:String(e.title||e.label||e.point||"").trim(),detail:String(e.detail||e.impact||e.why||e.comment||"").trim()}:null).filter(e=>e&&(e.title||e.detail)).map(e=>e.title?e:{title:e.detail,detail:""}).slice(0,n):[]}const Ye=new Set(["high","medium","low"]);function se(t,n=5){return Array.isArray(t)?t.map(e=>{if(typeof e=="string")return{severity:"medium",title:e.trim(),detail:""};if(!e||typeof e!="object")return null;const i=String(e.severity||e.level||"medium").toLowerCase();return{severity:Ye.has(i)?i:"medium",title:String(e.title||e.label||"").trim(),detail:String(e.detail||e.why||e.impact||"").trim()}}).filter(e=>e&&(e.title||e.detail)).slice(0,n):[]}const He=new Set(["positive","negative","mixed"]);function ae(t,n=8){return Array.isArray(t)?t.map(e=>{if(!e||typeof e!="object")return null;const i=String(e.sentiment||e.tone||"mixed").toLowerCase();return{label:String(e.label||e.theme||e.title||"").trim(),sentiment:He.has(i)?i:"mixed",strength:Math.max(0,Math.min(100,Math.round(L(e.strength??e.share??e.weight)))),detail:String(e.detail||e.note||e.summary||"").trim()}}).filter(e=>e&&e.label).map(e=>e.strength>0?e:{...e,strength:45}).slice(0,n):[]}function ce(t,n=7){return Array.isArray(t)?t.map(e=>{if(!e||typeof e!="object")return null;const i=Math.max(-100,Math.min(100,Math.round(L(e.impact??e.effect??e.delta))));return{topic:String(e.topic||e.question||e.about||"").trim(),answer:String(e.answer||e.choice||"").trim(),impact:i,note:String(e.note||e.detail||e.why||"").trim()}}).filter(e=>e&&(e.answer||e.note)).slice(0,n):[]}function Se(t,n=10){return Array.isArray(t)?t.map(e=>typeof e=="string"?{name:e.trim(),note:""}:e&&typeof e=="object"?{name:String(e.name||e.source||e.type||"").trim(),note:String(e.note||e.detail||"").trim()}:null).filter(e=>e&&e.name).slice(0,n):[]}function Je(t,n=10){return Array.isArray(t)?t.map(e=>!e||typeof e!="object"?null:{label:String(e.label||e.feature||"").trim(),productValue:String(e.productValue||e.value||"").trim(),userNeed:String(e.userNeed||e.need||"").trim(),score:Math.max(0,Math.min(100,Math.round(L(e.score)))),comment:String(e.comment||e.detail||"").trim()}).filter(e=>e&&e.label).slice(0,n):[]}function ke(t){const n=(Array.isArray(t)?t:[]).map(e=>Number(e)||0).filter(e=>e>0);return n.length<2?0:Math.round(Math.max(...n)-Math.min(...n))}const We=new Set(["buy","consider","skip"]);function Ke(t,n){const e=String(t||"").toLowerCase().trim();if(We.has(e))return e;const i=Number(n)||0;return i>=70?"buy":i>=50?"consider":"skip"}function V(t){return String(t||"en").slice(0,2).toLowerCase()==="tr"?'ADDRESS FORM — HARD RULE: address the reader informally in Turkish, in the "sen" form ("senin için", "alışkanlıklarına göre", "bunu al", "geç"). NEVER use the formal "siz" forms (no "-ınız/-iniz" possessives, no "olun/edersiniz/olmalısınız"). The whole interface speaks in "sen"; the report must match it.':'ADDRESS FORM — HARD RULE: address the reader directly as "you"; never write "the user" or "the buyer" when you mean the reader.'}const le="IMPACT VALUES: use the full range honestly. A typical answer nudges the verdict (|impact| 10-45); only an answer that genuinely decides the outcome earns |impact| above 70. Any answer that works AGAINST this choice MUST get a NEGATIVE impact, and a realistic quiz almost always has at least one. A list where every answer is a strong positive is not credible and is forbidden.";function Y(t,n){const e=String(t||"").trim();return e?`

LIVE WEB / COMMUNITY RESEARCH NOTES (grounded Google Search, written in ${n} — treat as the CURRENT truth and build the community sections on it):
${e.slice(0,14e3)}`:`

LIVE WEB / COMMUNITY RESEARCH NOTES: none were available. Base the community sections on well-established, widely reported patterns only, and say plainly where the evidence is thin. Do NOT fabricate specific findings.`}function Xe(t){const n=u(t),e=String(t||"").slice(0,2)==="tr",i=e?"Kullanım Uyumu":"Usage Fit",o=e?"Bütçe Uyumu":"Budget Match",r=e?"Kalite Uyumu":"Quality Fit",d=e?"Uzun Vadeli Değer":"Long-term Value",g=e?"Yaşam Tarzı Uyumu":"Lifestyle Match",S=e?"Özellik Seti":"Feature Set",_=e?"Güvenilirlik ve Risk":"Reliability and Risk",T=e?"Topluluk Sinyali":"Community Signal";return`You are Qor AI's senior product analyst. Given a product, the user's quiz answers, the user profile and live web/community research notes, produce the PERSONAL DECISION half of a comprehensive match report.

LANGUAGE: Write ALL text in ${n}. Factor labels must also be in ${n}.
${V(t)}

CRITICAL — CATEGORY-AWARE ANALYSIS:
- The product can be ANY category: tech, books, clothing, home, sports, beauty, etc.
- For TECH products: analyze specs deeply — cite performance numbers, thermal behavior, software longevity, benchmark context.
- For BOOKS: discuss writing quality, pacing, reader reception, author credentials, genre positioning.
- For CLOTHING/HOME: discuss material science, build quality, brand heritage, durability.
- NEVER force tech terminology onto non-tech products.
- Adapt factor meanings and labels to the product category:
  • "${r}" = build/material/content quality (as appropriate)
  • "${d}" = durability/longevity/re-read value (as appropriate)

SCORING RULES:
- Score must reflect how well THIS SPECIFIC product matches THIS SPECIFIC user's exact needs.
- Scores MUST be realistic and differentiated. Never give identical scores.
- Poor match: 20-45. Average: 46-65. Good: 66-80. Excellent: 81-95.
- ANTI-INFLATION (critical): do NOT cluster scores near the top. Use the FULL range honestly. Every real product has genuine weak spots — AT LEAST 2 of the factor scores MUST fall below 65, and at least one below 55, unless this is a rare near-flawless fit for THIS user. Reserve 85+ only for true standout strengths, never as a default. If most factors land in 75-95 you are inflating — spread them out and score weak areas honestly. The enhancedScore must reflect this honest spread, not drift upward.

EVIDENCE RULES:
- The research notes are the CURRENT truth. Ground every concrete claim (weak spots, reliability, real-world behavior) in them where they cover it.
- Never invent direct quotes, exact review counts or exact live prices. Where evidence is thin, say so in the relevant field instead of guessing.

${le}

WRITING QUALITY REQUIREMENTS:
- Professional, tech-journalist level language. Specific over generic: cite real characteristics, measured behavior, ownership realities.
- Every "detail" field must add NEW information — never restate the label or the score in words.
- verdict = 3 paragraphs (~65 words each): what this product actually is, how it behaves in real use, and the ownership/value picture.
- personaAnalysis = 3 paragraphs (~55 words each) built strictly on the quiz answers and profile signals — never list the user's attributes back to them.
- Bullets are one tight sentence in "title" plus one concrete consequence in "detail".

Return valid JSON (all text in ${n}):
{
  "enhancedScore": <0-100>,
  "confidence": <0-100 — how solid the evidence behind this verdict is; low when research was thin>,
  "decision": "buy | consider | skip",
  "headline": "ONE punchy sentence in ${n} that answers 'should I get this?' for THIS user",
  "factors": [
    {"label": "${i}", "score": <0-100>, "emoji": "🎯", "detail": "1 evidence-based sentence in ${n} explaining WHY this score"},
    {"label": "${o}", "score": <0-100>, "emoji": "💰", "detail": "1 sentence"},
    {"label": "${r}", "score": <0-100>, "emoji": "⭐", "detail": "1 sentence"},
    {"label": "${S}", "score": <0-100>, "emoji": "🧩", "detail": "1 sentence"},
    {"label": "${_}", "score": <0-100>, "emoji": "🛡", "detail": "1 sentence"},
    {"label": "${T}", "score": <0-100>, "emoji": "🌐", "detail": "1 sentence"},
    {"label": "${d}", "score": <0-100>, "emoji": "🚀", "detail": "1 sentence"},
    {"label": "${g}", "score": <0-100>, "emoji": "🏠", "detail": "1 sentence"}
  ],
  "verdict": "3 paragraphs in ${n} as described above. NO user attribute lists.",
  "prosForUser": [{"title": "short concrete strength", "detail": "1 sentence on what it changes in daily use for THIS user"}, "... 4-5 items total"],
  "consForUser": [{"title": "short concrete weakness", "detail": "1 sentence on the real-world impact and how often it bites"}, "... 3-4 items total"],
  "criticalPoints": [{"severity": "high|medium|low", "title": "the thing they would be angry not to know", "detail": "1-2 sentences: what happens, and who it actually affects"}, "... 3-4 items, at least one 'high' if a genuine deal-breaker exists"],
  "quizInsights": [{"topic": "2-4 word label of what the question probed, in ${n}", "answer": "the option the user picked, shortened", "impact": <-100..100 — how much this answer pushed the score up or down>, "note": "1 sentence linking that answer to a concrete property of this product"}, "... one per meaningful quiz answer, 4-6 items"],
  "featureMatches": [{"label": "feature/spec in ${n}", "productValue": "what this product offers", "userNeed": "what the quiz/profile implies they need", "score": <0-100>, "comment": "1 sentence"}, "... 5-7 items"],
  "personaScore": <0-100>,
  "personaAnalysis": "3 paragraphs in ${n} — how this product fits their real life from the quiz answers. Reference the answers concretely. NEVER list user attributes by name.",
  "bestFor": "1-2 sentences in ${n} describing the person this is genuinely great for",
  "notFor": "1-2 sentences in ${n} describing who should walk away",
  "overallVerdict": "1 paragraph in ${n} plus ONE final decisive sentence that clearly says buy, consider, or skip (with a concrete alternative if skip). NEVER mention user attributes by name."
}`}function Ze(t){const n=u(t);return`You are Qor AI's community-research analyst. You receive a product, the user's quiz answers, and live web/community research notes gathered with Google Search. Produce the COMMUNITY & MARKET half of the report.

LANGUAGE: Write ALL text in ${n}.
${V(t)}

RULES:
- Build EVERYTHING on the research notes when they cover it; they are the current truth. Where they are thin, say plainly that the evidence is limited — never fabricate findings, quotes, review counts or exact prices.
- A praise-only summary is FORBIDDEN. Recurring complaints must be stated as plainly as the praise.
- ABSENCE OF EVIDENCE IS NOT A STRENGTH: "no complaints found" or "limited information" must never be presented as a positive theme or used to raise a score — say the evidence is thin and lower the confidence instead.
- FACTS ONLY FROM RESEARCH: availability, versions and plan details must come from the research notes; if they are not covered, omit them rather than recalling them from memory.
- "themes" are the topics people keep coming back to (battery, noise, sizing, support, ads, price hikes…), NOT one-off opinions. "strength" is roughly how dominant that theme is in the discussion (0-100).
- Sentiment percentages must be realistic and consistent with the themes: if half the themes are complaints, the split cannot be 90% positive.

Return valid JSON (all text in ${n}):
{
  "communityScore": <0-100 — overall owner satisfaction>,
  "communityAnalysis": "3 paragraphs in ${n}: (1) how it is received overall and what earns the praise, (2) the recurring complaints stated plainly with who they hit, (3) what long-term owners say after months of use. IGNORE the user profile here — this is about everyone.",
  "sentimentBreakdown": {"positive": <int>, "neutral": <int>, "negative": <int>},
  "communityThemes": [{"label": "theme in ${n}", "sentiment": "positive|negative|mixed", "strength": <0-100>, "detail": "1 sentence with the concrete substance of that theme"}, "... 5-7 themes, a realistic mix of positive and negative"],
  "praisePoints": [{"title": "what owners consistently love", "detail": "1 sentence"}, "... 3-4 items"],
  "complaintPoints": [{"title": "what owners consistently complain about", "detail": "1 sentence including how widespread it is"}, "... 3-4 items"],
  "reliabilityNotes": ["1 sentence each in ${n} on durability, failures, warranty/support experience — 2-3 items"],
  "sources": [{"name": "source or source type (Reddit, YouTube reviews, retailer reviews, specialist sites…)", "note": "what it contributed"}, "... 4-6 items — only source TYPES you actually relied on"],
  "alternatives": [{"name": "exact competing product name", "why": "1 sentence on who should take this instead"}, "... 3 items"],
  "priceOutlook": {"trend": "up|down|stable|unknown", "bestTime": "when it is smart to buy, in ${n}", "note": "1-2 sentences on discount cadence, refresh cycle or long-term cost — no invented exact prices"},
  "verificationNotes": ["1 sentence each in ${n}: what is well-evidenced vs what stayed uncertain — 2-3 items"]
}`}function L(t){if(typeof t=="number")return t;const n=parseFloat(String(t||"").replace(",","."));return Number.isFinite(n)?n:0}function ue(t){if(!t||typeof t!="object")return null;const n=Math.max(0,Math.round(L(t.positive))),e=Math.max(0,Math.round(L(t.neutral))),i=Math.max(0,Math.round(L(t.negative)));return n+e+i<=0?null:{positive:n,neutral:e,negative:i}}async function et({base:t,answers:n,language:e,userProfile:i={},research:o=""}){const r=u(e),d=n.filter(k=>k.answer!=null).map(k=>({question:k.question,answer:k.answer})),g={url:t.url,title:t.title,category:t.category,siteName:t.siteName,initialScore:t.score,initialAnalysis:t.analysis},S=JSON.stringify({product:g,quizAnswers:d,userProfile:i}),_=(async()=>N({system:await B("gemini_enhanced_link_analysis_system",Xe(e))+Y(o,r),user:S,maxOutputTokens:8192}))(),T=(async()=>{try{return await N({system:Ze(e)+Y(o,r),user:S,maxOutputTokens:8192})}catch{return{}}})(),[m,h]=await Promise.all([_,T]),P=(Array.isArray(m.factors)?m.factors:[]).map(k=>({label:String(k.label||k.name||""),score:L(k.score??k.value),emoji:String(k.emoji||k.icon||"📊"),detail:String(k.detail||k.comment||"")})).filter(k=>k.label),K=L(m.enhancedScore??m.enhanced_score??m.score),x=K>0?K:t.score,G=Array.isArray(h.alternatives)&&h.alternatives.length?h.alternatives:m.alternatives,Q=h.priceOutlook&&typeof h.priceOutlook=="object"?{trend:String(h.priceOutlook.trend||"unknown").toLowerCase(),bestTime:String(h.priceOutlook.bestTime||""),note:String(h.priceOutlook.note||"")}:null;return{base:t,enhancedScore:x,confidence:Math.max(0,Math.min(100,Math.round(L(m.confidence))))||(o?78:58),decision:Ke(m.decision,x),headline:String(m.headline||""),factors:P,verdict:String(m.verdict||m.detailed_verdict||m.analysis||t.analysis||""),prosForUser:z(m.prosForUser||m.pros,6),consForUser:z(m.consForUser||m.cons,5),criticalPoints:se(m.criticalPoints,5),quizInsights:ce(m.quizInsights,7),featureMatches:Je(m.featureMatches,8),alternatives:z(Array.isArray(G)?G.map(k=>k&&typeof k=="object"?{title:k.name||k.title,detail:k.why||k.detail}:k):[],4),bestFor:String(m.bestFor||""),notFor:String(m.notFor||""),personaScore:L(m.personaScore)||null,personaAnalysis:m.personaAnalysis?String(m.personaAnalysis):"",communityScore:L(h.communityScore??m.communityScore)||null,communityAnalysis:String(h.communityAnalysis||m.communityAnalysis||""),sentimentBreakdown:ue(h.sentimentBreakdown||h.sentiment_breakdown||m.sentimentBreakdown||m.sentiment_breakdown),communityThemes:ae(h.communityThemes,8),praisePoints:z(h.praisePoints,5),complaintPoints:z(h.complaintPoints,5),reliabilityNotes:z(h.reliabilityNotes,4),sources:Se(h.sources,8),verificationNotes:z(h.verificationNotes,4),priceOutlook:Q,researched:!!String(o||"").trim(),overallVerdict:m.overallVerdict?String(m.overallVerdict):""}}function tt(t){const n=u(t),e=W(t),i=["🎯","⚡","⭐","🧩","🧭","🛡","🌐","🚀"],o=e.map((r,d)=>`        {"label": "${r}", "score": 0, "emoji": "${i[d]||"📊"}", "detail": "1 sentence"}`).join(`,
`);return`You are Qor AI's senior product comparison analyst. Produce the PER-PRODUCT half of a head-to-head comparison report.

LANGUAGE: Write ALL text fields in ${n}. Keep official product names as-is.
${V(t)}

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
      "bestFor": "2 sentences in ${n} on the person this one is genuinely for",
      "summary": "3 sentences in ${n}: what it is, how it behaves in real use, where it lands versus the others",
      "pros": [{"title": "short strength", "detail": "1 sentence on what it changes in daily use"}, "... 3-4 items"],
      "cons": [{"title": "short weakness", "detail": "1 sentence on the real-world impact"}, "... 3 items"],
      "risks": ["2-3 ownership/community risks in ${n}, one sentence each"],
      "criticalPoints": [{"severity": "high|medium|low", "title": "what a buyer must know first", "detail": "1-2 sentences"}, "... 2-3 items"],
      "factors": [
${o}
      ],
      "specHighlights": [
        {"label": "short spec label in ${n}", "value": "short known/inferred value or uncertainty note"}
      ],
      "community": "2 short paragraphs in ${n}: reception and praise first, then the recurring complaints stated plainly",
      "communityThemes": [{"label": "theme in ${n}", "sentiment": "positive|negative|mixed", "strength": <0-100>, "detail": "1 sentence"}, "... 3-5 themes"],
      "sentimentBreakdown": {"positive": <int>, "neutral": <int>, "negative": <int>}
    }
  ]
}

Rules for factors: 8 entries per product, each with a "detail" sentence that explains the score with evidence — never a restatement of the label. specHighlights: 4-6 entries.`}function nt(t,n=[]){const e=u(t);return`You are Qor AI's senior comparison analyst. The per-product sections are already written. Produce ONLY the cross-product VERDICT half of the report.

LANGUAGE: Write ALL text fields in ${e}. Keep official product names as-is.
${V(t)}

Rules:
- "winner.best" MUST be exactly one of: ${n.join(" | ")}.
- ${le}
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
}`}async function it({bases:t,answers:n,language:e,userProfile:i={},research:o=""}){var F,X;const r=u(e),d=W(e),g=["🎯","⚡","⭐","🧩","🧭","🛡","🌐","🚀"],S=(n||[]).filter(a=>a.answer!=null).map(a=>({question:a.question,answer:a.answer})),_=(t||[]).map(a=>a.title).filter(Boolean),T=JSON.stringify({products:(t||[]).map((a,U)=>({index:U+1,url:a.url,title:a.title,category:a.category,siteName:a.siteName,initialScore:a.score,initialAnalysis:a.analysis})),quizAnswers:S,userProfile:i}),[m,h]=await Promise.all([N({system:tt(e)+Y(o,r),user:T,maxOutputTokens:12288}),(async()=>{try{return await N({system:nt(e,_)+Y(o,r),user:T,maxOutputTokens:8192})}catch{return{}}})()]),P=Array.isArray(m.products)?m.products:[],x=((t||[]).length?(t||[]).map((a,U)=>P.find(j=>(j==null?void 0:j.url)&&j.url===a.url)||P[U]||{}):P).map((a,U)=>{const j=(t||[])[U]||{},s=L(a.score)||L(j.score)||50,H=Array.isArray(a.factors)?a.factors.map(A=>({label:String((A==null?void 0:A.label)||""),score:L((A==null?void 0:A.score)??(A==null?void 0:A.value)),emoji:String((A==null?void 0:A.emoji)||"📊"),detail:String((A==null?void 0:A.detail)||"")})).filter(A=>A.label):[],ne=H.length?H:d.map((A,I)=>({label:A,score:s,emoji:g[I]||"📊",detail:""})),de=Array.isArray(a.specHighlights)?a.specHighlights.map(A=>({label:String((A==null?void 0:A.label)||""),value:String((A==null?void 0:A.value)||"")})).filter(A=>A.label||A.value):[];return{name:String(a.name||j.title||`Product ${U+1}`),url:String(a.url||j.url||""),siteName:String(a.siteName||j.siteName||""),score:s,rank:L(a.rank)||U+1,bestFor:String(a.bestFor||""),summary:String(a.summary||j.analysis||""),pros:z(a.pros,5),cons:z(a.cons,4),risks:z(a.risks,4),criticalPoints:se(a.criticalPoints,4),factors:ne,specHighlights:de,community:String(a.community||""),communityThemes:ae(a.communityThemes,6),sentiment:ue(a.sentimentBreakdown||a.sentiment_breakdown)}});x.sort((a,U)=>(a.rank||99)-(U.rank||99));const G=h.winner&&typeof h.winner=="object"?h.winner:m.winner&&typeof m.winner=="object"?m.winner:null,Q=G?{best:String(G.best||((F=x[0])==null?void 0:F.name)||""),reason:String(G.reason||""),scoreGap:ke(x.map(a=>a.score)),runnerUpCase:String(G.runnerUpCase||"")}:{best:((X=x[0])==null?void 0:X.name)||"",reason:"",scoreGap:0,runnerUpCase:""},k=h.detailed&&typeof h.detailed=="object"?h.detailed:m.detailed&&typeof m.detailed=="object"?m.detailed:null,M=k?{fit:String(k.fit||""),performance:String(k.performance||""),ownership:String(k.ownership||""),community:String(k.community||""),recommendation:String(k.recommendation||"")}:null;return{type:"compare_structured",isCompare:!0,bases:t,answers:n,winner:Q,products:x,scores:Object.fromEntries(x.map(a=>[a.name,a.score])),detailed:M,decisiveDifferences:z(h.decisiveDifferences,6),quizInsights:ce(h.quizInsights,7),confidence:Math.max(0,Math.min(100,Math.round(L(h.confidence))))||(o?76:56),researched:!!String(o||"").trim(),recommendation:String(h.recommendation||m.recommendation||(M==null?void 0:M.recommendation)||Q.reason||"")}}function rt(t,n,e,i,o){const r=u(o),g=D(o).map(_=>`        "${_.key}": {"score": "integer 0-100", "detail": "1 evidence-based sentence in ${r} explaining this ${_.label} score"}`).join(`,
`),S=i.length?i.map(_=>`- ${_.question}: ${_.answer}`).join(`
`):"- (no quiz answers provided)";return`You are Qor AI's subscription intelligence analyst. Produce the PER-SERVICE half of a subscription report.
Analyze: ${t}

Quiz Answers:
${S}

CRITICAL RULES:
- ALL text values MUST be in ${r} language
- ${V(o)}
- The "subscriptions" object MUST contain exactly ${n} entries, one for EACH of: ${t}
- You MUST complete ALL ${n} service entries. Do not stop early or truncate.
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
    "${e?"<service_name>":t}": {
      "category": "string - service category label in ${r}",
      "rank": "integer starting at 1",
      "compatibility_score": "integer 0-100",
      "compatibility_explanation": "string - 3 sentences on why this score, tied to the quiz answers",
      "pros": [{"title": "short strength", "detail": "1 sentence on what it changes in everyday use"}, "... 3-4 items"],
      "cons": [{"title": "short weakness", "detail": "1 sentence on the real-world impact"}, "... 3 items"],
      "risks": ["2-3 churn/ownership risk sentences in ${r}"],
      "critical_points": [{"severity": "high|medium|low", "title": "what they must know before subscribing", "detail": "1-2 sentences"}, "... 2-3 items"],
      "notable_features": [{"label": "short feature label", "value": "short feature detail"}, "... 4-6 items"],
      "community_sentiment": "string - 3 short paragraphs of Reddit/forum/reviewer/app-store synthesis: reception, then the recurring complaints plainly, then what long-term subscribers say",
      "community_themes": [{"label": "theme in ${r}", "sentiment": "positive|negative|mixed", "strength": "integer 0-100", "detail": "1 sentence"}, "... 4-6 themes with a realistic positive/negative mix"],
      "sentiment_breakdown": {"positive": "int", "neutral": "int", "negative": "int"},
      "sources": [{"name": "source type you relied on", "note": "what it contributed"}, "... 3-5 items"],
      "cancel_reasons": ["2-3 one-sentence reasons people actually cancel this, in ${r}"],
      "best_for": "string - 2 sentences on the ideal subscriber and usage context",
      "not_for": "string - 1-2 sentences on who should skip it",
      "factors": {
${g}
      }
    }
  }
}`}function ot(t,n,e){const i=u(e);return`You are Qor AI's subscription intelligence analyst. The per-service sections are already written. Produce ONLY the VERDICT half of the report for: ${t}.

LANGUAGE: ALL text values MUST be in ${i}.
${V(e)}


VENDOR NEUTRALITY — HARD RULE (this analysis runs on a model that may BE one of the compared services, or be made by the company that owns one):
- Your own identity, your maker, and how familiar a service feels to you must have ZERO effect on the scores. Judge every service against the same evidence bar.
- ABSENCE OF EVIDENCE IS NOT A STRENGTH. "No complaints found", "limited community information" or "no known issues" must NEVER raise a score, appear as a positive theme, or justify a high risk/community score. When the research is thin for a service, say the evidence is thin, LOWER the confidence, and score that factor in the middle band — never at the top.
- Every service must get at least two genuinely weak factors stated as plainly as the leader's. A profile where one service is best on EVERY factor is a red flag: re-check it and correct the inflation.
- FACTS ONLY FROM RESEARCH: regional availability, plan names, model names/versions and pricing tiers change constantly. State them ONLY if the research notes cover them. If they do not, omit the claim entirely — never fill it from memory.

Rules:
- ${le}
- Be decisive and personal: tie everything to the user's quiz answers without reading their profile back to them.
- ${n?`"winner.overall" MUST be exactly one of: ${t}.`:"There is a single service — judge whether it is worth keeping/subscribing and under what conditions."}
- Ground concrete claims in the live research notes. Never invent quotes, exact review counts or prices.
- NEVER mention price, cost, monthly/yearly fees, discounts or billing.

Return ONLY valid JSON:
{
  ${n?`"winner": {
    "best_content": "string - service name with the strongest catalogue/feature depth",
    "overall": "string - the service to actually pick",
    "reason": "string - 3 sentences on why it wins FOR THIS USER",
    "score_gap": "integer gap between strongest and weakest",
    "runner_up_case": "string - 1-2 sentences on when the other one is the smarter pick",
    "recommendation": "string - 2 short paragraphs with the final decision and trade-offs"
  },`:""}
  "confidence": "integer 0-100 - how solid the evidence behind this verdict is",
  "decisive_differences": [{"title": "the difference in ${i}", "detail": "1-2 sentences on who wins it and what it changes in practice"}, "... ${n?"4-6":"3-4"} items"],
  "quiz_insights": [{"topic": "2-4 word label of what the question probed", "answer": "the option the user picked, shortened", "impact": "integer -100..100 - how strongly this answer pushed the verdict", "note": "1 sentence tying the answer to a concrete property of the service"}, "... 4-6 items"],
  "detailed_comparison": {
    "service_fit_summary": "string - 2 paragraphs on overall fit",
    "feature_comparison": "string - 2 paragraphs on features, catalogue and use cases",
    "user_experience": "string - 2 paragraphs on apps, reliability and everyday usage",
    "community_and_risk": "string - 2 paragraphs on review sentiment, churn risk and long-term satisfaction. You MUST clearly state the most common COMPLAINTS users report (ad tiers, catalogue removals, sharing limits, reliability, support) — never a positives-only summary.",
    "final_plan": "string - 2 paragraphs: a concrete usage plan for the coming months, including what to watch for and when to reconsider"
  },
  "recommendation": "string - 3-4 sentences of personalized final recommendation ending with a plain instruction"
}`}async function st({subscriptionNames:t,answers:n,language:e,userProfile:i={},research:o=""}){var X;const r=t.length>1,d=t.join(", "),g=u(e),S=D(e),_=Object.fromEntries(S.map(a=>[a.key,a])),T=(n||[]).filter(a=>a.answer!=null).map(a=>({question:a.question,answer:a.answer})),m=JSON.stringify({subscriptions:t,mode:r?"compare":"single",quizAnswers:T,userProfile:i}),[h,P]=await Promise.all([(async()=>N({system:await B("gemini_subscription_analysis",rt(d,t.length,r,T,e))+Y(o,g),user:m,maxOutputTokens:12288}))(),(async()=>{try{return await N({system:ot(d,r,e)+Y(o,g),user:m,maxOutputTokens:8192})}catch{return{}}})()]),K=h.subscriptions&&typeof h.subscriptions=="object"?h.subscriptions:{},x=new Map(Object.entries(K).map(([a,U])=>[String(a).toLowerCase(),{name:a,d:U}])),G=(t||[]).map((a,U)=>{const j=x.get(String(a).toLowerCase())||[...x.values()].find(I=>String(I.name).toLowerCase().includes(String(a).toLowerCase()))||{name:a,d:{}},s=j.d||{},H=L(s==null?void 0:s.compatibility_score)||55,ne=s!=null&&s.factors&&typeof s.factors=="object"?Object.entries(s.factors).map(([I,ie])=>{const Re=_[I]||{},J=ie&&typeof ie=="object"?ie:null;return{key:I,label:Re.label||String(I).replace(/_/g," "),emoji:Re.emoji||"📊",score:L(J?J.score??J.value:ie)||H,detail:J?String(J.detail||J.comment||""):""}}):[],de=ne.length?ne:S.map(I=>({key:I.key,label:I.label,emoji:I.emoji,score:H,detail:""})),A=Array.isArray(s==null?void 0:s.notable_features)?s.notable_features.map(I=>({label:String((I==null?void 0:I.label)||""),value:String((I==null?void 0:I.value)||"")})).filter(I=>I.label||I.value):[];return{name:String(j.name||a),category:String((s==null?void 0:s.category)||""),score:H,rank:L(s==null?void 0:s.rank)||U+1,explanation:String((s==null?void 0:s.compatibility_explanation)||""),pros:z(s==null?void 0:s.pros,5),cons:z(s==null?void 0:s.cons,4),risks:z(s==null?void 0:s.risks,4),criticalPoints:se((s==null?void 0:s.critical_points)||(s==null?void 0:s.criticalPoints),4),features:A,community:String((s==null?void 0:s.community_sentiment)||""),communityThemes:ae((s==null?void 0:s.community_themes)||(s==null?void 0:s.communityThemes),6),sources:Se(s==null?void 0:s.sources,6),cancelReasons:z((s==null?void 0:s.cancel_reasons)||(s==null?void 0:s.cancelReasons),4),sentiment:ue((s==null?void 0:s.sentiment_breakdown)||(s==null?void 0:s.sentimentBreakdown)),bestFor:String((s==null?void 0:s.best_for)||""),notFor:String((s==null?void 0:s.not_for)||(s==null?void 0:s.notFor)||""),factors:de}}).sort((a,U)=>(a.rank||99)-(U.rank||99)||U.score-a.score),Q={};G.forEach(a=>{Q[a.name]=a.score});const k=((X=[...G].sort((a,U)=>U.score-a.score)[0])==null?void 0:X.name)||"",M=P.winner&&typeof P.winner=="object"?P.winner:h.winner&&typeof h.winner=="object"?h.winner:null,F=P.detailed_comparison&&typeof P.detailed_comparison=="object"?P.detailed_comparison:h.detailed_comparison&&typeof h.detailed_comparison=="object"?h.detailed_comparison:null;return{isCompare:r,services:G,scores:Q,winner:M?{best:String(M.best_content||M.overall||k||""),overall:String(M.overall||""),reason:String(M.reason||""),scoreGap:ke(G.map(a=>a.score)),runnerUpCase:String(M.runner_up_case||M.runnerUpCase||""),recommendation:String(M.recommendation||"")}:{best:k,overall:k,reason:"",scoreGap:0,runnerUpCase:"",recommendation:""},detailed:F?{fit:String(F.service_fit_summary||""),features:String(F.feature_comparison||""),ux:String(F.user_experience||""),community:String(F.community_and_risk||""),plan:String(F.final_plan||"")}:null,decisiveDifferences:z(P.decisive_differences||P.decisiveDifferences,6),quizInsights:ce(P.quiz_insights||P.quizInsights,7),confidence:Math.max(0,Math.min(100,Math.round(L(P.confidence))))||(o?76:56),researched:!!String(o||"").trim(),recommendation:String(P.recommendation||h.recommendation||(M==null?void 0:M.recommendation)||"")}}const at={netflix:"video","disney+":"video","disney plus":"video","amazon prime":"video","prime video":"video",hbo:"video","hbo max":"video",max:"video",hulu:"video","apple tv+":"video","apple tv plus":"video",blutv:"video",exxen:"video",gain:"video",mubi:"video","youtube premium":"video",crunchyroll:"video","bein sports":"video",tod:"video","paramount+":"video","paramount plus":"video",peacock:"video",tabii:"video","tv+":"video",spotify:"music","apple music":"music","youtube music":"music",tidal:"music",deezer:"music","amazon music":"music",fizy:"music",soundcloud:"music","soundcloud go":"music","chatgpt plus":"ai",chatgpt:"ai","claude pro":"ai",claude:"ai",gemini:"ai","gemini advanced":"ai",perplexity:"ai",midjourney:"ai",copilot:"ai","microsoft copilot":"ai",grok:"ai",deepseek:"ai",poe:"ai",icloud:"cloud","icloud+":"cloud","google one":"cloud",dropbox:"cloud",onedrive:"cloud",pcloud:"cloud",mega:"cloud","adobe creative cloud":"productivity",canva:"productivity",figma:"productivity","microsoft 365":"productivity","office 365":"productivity",notion:"productivity","google workspace":"productivity",hostinger:"hosting",cloudflare:"hosting",godaddy:"hosting",namecheap:"hosting",bluehost:"hosting",siteground:"hosting",hostgator:"hosting",ionos:"hosting",dreamhost:"hosting",wix:"hosting",squarespace:"hosting",wordpress:"hosting","wordpress.com":"hosting",vercel:"hosting",netlify:"hosting",digitalocean:"hosting",kinsta:"hosting",porkbun:"hosting",wpengine:"hosting","wp engine":"hosting","xbox game pass":"gaming","playstation plus":"gaming","ps plus":"gaming","ea play":"gaming","geforce now":"gaming","nintendo switch online":"gaming","ubisoft+":"gaming","apple arcade":"gaming"};function me(t){return at[String(t||"").trim().toLowerCase()]||null}const ct={"video-streaming":"video","music-streaming":"music",gaming:"gaming","ai-tools":"ai","cloud-storage":"cloud",productivity:"productivity","web-hosting":"hosting",hosting:"hosting",vpn:"vpn",bundles:"bundles",news:"news",fitness:"fitness",education:"education",other:"other"};function Ee(t){const n=String(t||"").trim().toLowerCase();return ct[n]||n||null}function lt(t){const n=t.map(me).filter(Boolean);return[...new Set(n)].length>1}const ut={netflix:"Netflix","disney+":"Disney+","disney plus":"Disney+","amazon prime":"Amazon Prime","prime video":"Amazon Prime","amazon prime video":"Amazon Prime",hbo:"HBO","hbo max":"HBO Max",max:"Max",hulu:"Hulu","apple tv+":"Apple TV+","apple tv plus":"Apple TV+",blutv:"BluTV",exxen:"Exxen",exen:"Exxen",gain:"Gain",mubi:"MUBI","youtube premium":"YouTube Premium","yt premium":"YouTube Premium",crunchyroll:"Crunchyroll","bein sports":"beIN Sports",tod:"TOD","paramount+":"Paramount+","paramount plus":"Paramount+",peacock:"Peacock",tabii:"Tabii","tv+":"Apple TV+",spotify:"Spotify","apple music":"Apple Music","youtube music":"YouTube Music","yt music":"YouTube Music",tidal:"Tidal",deezer:"Deezer","amazon music":"Amazon Music",fizy:"Fizy",soundcloud:"SoundCloud","soundcloud go":"SoundCloud Go","chatgpt plus":"ChatGPT Plus",chatgpt:"ChatGPT Plus","claude pro":"Claude Pro",claude:"Claude Pro",gemini:"Gemini Advanced","gemini advanced":"Gemini Advanced",perplexity:"Perplexity",midjourney:"Midjourney",copilot:"Microsoft Copilot","microsoft copilot":"Microsoft Copilot",grok:"Grok",deepseek:"DeepSeek",poe:"Poe",icloud:"iCloud+","icloud+":"iCloud+","google one":"Google One",dropbox:"Dropbox",onedrive:"OneDrive",pcloud:"pCloud",mega:"MEGA","adobe creative cloud":"Adobe Creative Cloud",canva:"Canva","microsoft 365":"Microsoft 365","office 365":"Microsoft 365",notion:"Notion","google workspace":"Google Workspace",hostinger:"Hostinger",cloudflare:"Cloudflare",godaddy:"GoDaddy",namecheap:"Namecheap",bluehost:"Bluehost",siteground:"SiteGround",hostgator:"HostGator",ionos:"IONOS",dreamhost:"DreamHost",wix:"Wix",squarespace:"Squarespace",wordpress:"WordPress.com","wordpress.com":"WordPress.com",vercel:"Vercel",netlify:"Netlify",digitalocean:"DigitalOcean",kinsta:"Kinsta",porkbun:"Porkbun",wpengine:"WP Engine","wp engine":"WP Engine","xbox game pass":"Xbox Game Pass","playstation plus":"PlayStation Plus","ps plus":"PlayStation Plus","ea play":"EA Play","geforce now":"GeForce Now","nintendo switch online":"Nintendo Switch Online","ubisoft+":"Ubisoft+","apple arcade":"Apple Arcade"};function Ae(t){const n=String(t||"").trim().toLowerCase();return n.includes("http://")||n.includes("https://")||n.includes("www.")||/\.[a-z]{2,}(\/|$)/.test(n)}function Te(t){const n=String(t||"").trim().replace(/\s+/g," "),e=ut[n.toLowerCase()];return e||n.replace(/\b\w/g,i=>i.toUpperCase())}function mt(t){const n=String(t||"").slice(0,2)==="tr";return{empty:n?"Lütfen en az bir abonelik adı girin.":"Please enter at least one subscription name.",url:n?"Buraya yalnızca abonelik adı girebilirsin — link kabul edilmez.":"Only subscription names are accepted here — links are not allowed.",notSub:n?"Bu metin bir abonelik servisine benzemiyor. Lütfen Netflix, Spotify gibi bir servis adı yaz.":"This doesn't look like a subscription service. Please enter a name like Netflix or Spotify.",failed:n?"Abonelik doğrulanırken hata oluştu. Lütfen tekrar deneyin.":"Could not validate subscription. Please try again.",dup:e=>n?`"${e}" zaten eklendi.`:`"${e}" is already added.`}}function dt(t,n=[],e=""){const i=u(t),o=(n||[]).map(d=>String(d||"").trim()).filter(Boolean),r=o.length?`

CONTEXT — the user is already comparing: ${o.join(", ")}${e?` (category: ${e})`:""}.
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
"display_name" must be the clean branded service name. "reason" must be short and in ${i}.${r}

Return ONLY valid JSON:
{ "is_subscription": true|false, "display_name": "string or null", "category": "string or null", "reason": "string" }`}async function ht(t,n=[],e="en",i=""){const o=mt(e),r=String(t||"").trim();if(!r)return{error:o.empty};if(Ae(r))return{error:o.url};const d=r.toLowerCase();if((n||[]).some(h=>String(h||"").trim().toLowerCase()===d))return{error:o.dup(r)};const g=me(r);if(g){const h=Te(r);return(n||[]).some(P=>String(P||"").trim().toLowerCase()===h.toLowerCase())?{error:o.dup(h)}:{displayName:h,category:g}}let S;try{S=await N({system:dt(e,n,i),user:JSON.stringify({input:r}),maxOutputTokens:512})}catch{return{error:o.failed}}const _=(S==null?void 0:S.is_subscription)===!0,T=Te((S==null?void 0:S.display_name)||r),m=Ee(S==null?void 0:S.category);return!_||!T||!m?{error:o.notSub}:(n||[]).some(h=>String(h||"").trim().toLowerCase()===T.toLowerCase())?{error:o.dup(T)}:{displayName:T,category:m}}l.QorAiLink={configure:O,isJunkProductTitle:te,titleFromUrl:ye,looksLikeProductUrl:be,analyzeLink:Me,generateQuiz:De,generateCompareQuiz:je,generateSubscriptionQuiz:xe,researchProductCommunity:Ge,researchProductsCommunity:Fe,researchSubscriptionsCommunity:qe,findCatalogMatch:Be,awaitResearch:Ve,enhancedAnalysis:et,compareAnalysis:it,subscriptionAnalysis:st,subscriptionCategory:me,normalizeSubscriptionCategoryKey:Ee,subscriptionsMixCategories:lt,looksLikeSubscriptionUrl:Ae,validateSubscriptionInput:ht}})(typeof globalThis<"u"?globalThis:window);const C=globalThis.QorAiLink;if(!C)throw new Error("[linkAnalysis] admin/js/qor_ai_link.js yuklenemedi — motor TEK KAYNAKTA (bkz. dosya basligi). Dosya tasindiysa buradaki import yolu da guncellenmeli.");C.configure({askJson:xt,askGrounded:zt,adminPrompt:Et});const Vt=C.analyzeLink;C.isJunkProductTitle;C.titleFromUrl;C.looksLikeProductUrl;const Yt=C.findCatalogMatch,Ht=C.generateQuiz,Jt=C.generateCompareQuiz,Wt=C.generateSubscriptionQuiz,Kt=C.researchProductCommunity,Xt=C.researchProductsCommunity,Zt=C.researchSubscriptionsCommunity,en=C.awaitResearch,tn=C.enhancedAnalysis,nn=C.compareAnalysis,rn=C.subscriptionAnalysis,on=C.subscriptionCategory;C.normalizeSubscriptionCategoryKey;const sn=C.subscriptionsMixCategories;C.looksLikeSubscriptionUrl;const an=C.validateSubscriptionInput;function Gt(l,{feature:c,cost:u,balance:p,lang:b}){const v=String(b||"en").slice(0,2).toLowerCase(),f=Ne(u??bt(c),v),w=Ne(p??0,v);return v==="tr"?l==="AUTH_REQUIRED"?`Bu AI özelliği için giriş yapmalısın. İşlem ücreti: ${f} Qor Coin.`:l==="QUIZ_REQUIRED"?"AI özellikleri için önce profil quizini tamamlamalısın. Seni quiz sayfasına yönlendiriyorum.":l==="INSUFFICIENT_QOR_COINS"?`Qor Coin bakiyen yetersiz — analiz başlatılmadı. Bu işlem ${f} Qor Coin, bakiyen ${w}. Sınırsız AI için Premium'a geçebilirsin.`:"AI erişimi hazırlanamadı. Lütfen tekrar dene.":l==="AUTH_REQUIRED"?`Sign in to use this AI feature. Cost: ${f} Qor Coin.`:l==="QUIZ_REQUIRED"?"Complete the profile quiz first. Sending you to the quiz page.":l==="INSUFFICIENT_QOR_COINS"?`Not enough Qor Coin — the analysis was not started. This costs ${f} and your balance is ${w}. You can go Premium for unlimited AI.`:"AI access could not be prepared. Please try again."}function cn(l="en"){const{user:c,openAuth:u}=yt(),p=wt(),b=vt();return St.useCallback(async(v,f={})=>{const w=f.requireQuiz!==!1,R=(y,E={})=>{var $;const O=Gt(y,{feature:v,lang:l,cost:E.cost,balance:E.balance});return($=f.onMessage)==null||$.call(f,O,y),O};if(!c){const y=R("AUTH_REQUIRED");return u(),{ok:!1,reason:"AUTH_REQUIRED",message:y}}if(w&&!gt(c)){const y=R("QUIZ_REQUIRED"),E=`${b.pathname}${b.search}${b.hash}`;return p(`/quiz?required=1&next=${encodeURIComponent(E)}`),{ok:!1,reason:"QUIZ_REQUIRED",message:y}}try{return{ok:!0,...await ft(v)}}catch(y){const E=(y==null?void 0:y.code)||"AI_ACCESS_ERROR",O=R(E,y);return E==="AUTH_REQUIRED"&&u(),{ok:!1,reason:E,message:O,cost:y==null?void 0:y.cost,balance:y==null?void 0:y.balance}}},[l,b.hash,b.pathname,b.search,p,u,c])}export{Vt as a,Bt as b,zt as c,_t as d,en as e,nn as f,tn as g,Yt as h,Jt as i,Ht as j,Wt as k,Xt as l,Zt as m,on as n,sn as o,Kt as r,rn as s,cn as u,an as v};
