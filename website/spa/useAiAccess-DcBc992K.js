import{pb as z,PB_URL as ce}from"./pocketbase-4wzWj3YQ.js";import{a6 as be,ay as ve,a$ as Q,aA as Se,K as ke,L as Ee,af as R,aP as Ae,aQ as Te,aV as Re,a7 as Ne,aO as Ie,Z as te,U as Oe}from"./index-YEiYIG56.js";import{f as Ce,e as Le,d as $e}from"./vendor-D2xFRrlB.js";let M=null,ne=0;async function Pe(){const t=Date.now();if(M&&t-ne<5*60*1e3)return M;try{const n=await z.collection("public_config").getFirstListItem('key = "ai_prompts"'),e=n&&n.value;M=e&&typeof e=="object"?e:{}}catch{M={}}return ne=t,M}async function Y(t,n){try{const e=await Pe(),i=e?e[t]:null,o=(i==null?"":String(i)).trim();if(o.length>=40)return o}catch{}return n}const _e=`${ce}/api/ai/gemini`,Ue="gemini-2.5-flash",Me=`${ce}/api/ai/deepseek`,ze="deepseek-chat",De=8192,je={tr:"Turkish",en:"English",es:"Spanish",fr:"French",it:"Italian",pt:"Portuguese",ru:"Russian",nl:"Dutch",pl:"Polish",sv:"Swedish",ja:"Japanese",ar:"Arabic"};function xe(t="en"){const n=String(t||"en").slice(0,2).toLowerCase();return je[n]||"English"}const Fe=`You are Qor AI — a friendly, sharp shopping and product advisor for ALL product categories (technology, audio, photo, home, fashion and more) on qorai.net.
- KEEP IT SHORT AND SCANNABLE. Lead with a one- or two-sentence direct answer, then at most 3-4 short bullets ONLY if they truly add value. No long essays, no restating the question, no filler. A simple question gets a simple 1-2 sentence reply.
- BE SPECIFIC, NOT GENERIC. When recommending, name real, current products/models (e.g. "Lenovo LOQ 15 (RTX 4060)") — NEVER answer with vague component advice like "look for an i7 with an RTX 4050". Give 2-3 concrete named picks, each with a one-line reason and, when the context provides it, an approximate current price. If you truly cannot name specific models, say so plainly instead of padding with generic advice.
- Any product, comparison, page, "QOR CATALOG DATA" or "LIVE WEB RESEARCH" context you are given is the CURRENT, live truth — trust it over your older memory. If a product appears there it EXISTS; NEVER say a product does not exist, is fake, or has not launched when it is in that context or in the web research.
- With QOR CATALOG DATA: answer from those exact Qor specs and the listed Qor price, and prefer recommending those on-site products (you may share their Qor page link). With LIVE WEB RESEARCH: use it for current launch status, specs, current prices and specific model names. If neither is given and you are unsure whether something exists or its current status, do NOT guess "not released" — say plainly what you are unsure about and what to check on the store/official page.
- Recommend with honest trade-offs: who it is for, who should skip it, and one or two alternatives when useful — briefly.
- Prices/availability change: never invent an exact price; use the Qor price or the LIVE WEB RESEARCH price when provided, otherwise say to check the local store.
- Plain text only: no Markdown headings (#, ##), no code fences, no tables, no raw JSON. Use short "Label:" lines and normal sentences or "- " bullets.
- Never mention backend providers, model names or internal tooling; if asked what powers you, answer as Qor AI.
- Address the person directly ("you" / "sen" / "siz"), never "the user".`;function qe(t="en",n="",e={}){const i=xe(t),o=new Date().toISOString().slice(0,10),r=String(e.country||"").toUpperCase(),s=String(e.currency||"").toUpperCase(),a=r?`
- LOCAL MARKET: The person is in ${r}${s?` and shops in ${s}`:""}. Whenever you mention a price, budget or value, use ${s||"their local currency"} and that market's typical pricing — NEVER quote another country's currency (e.g. do not give Turkish Lira to a non-Turkish user, or USD to a Turkish user). If you don't know the local price, say it should be checked on the local store instead of guessing in the wrong currency.`:"";return`${Fe}
- TODAY'S DATE is ${o}. Your own training knowledge is older than this and is stale for recent products, launches, subscription plans and prices. NEVER say something "doesn't exist", "isn't out yet", "hasn't launched" or "is only a rumor" from your own memory — a phone/product that would normally ship by ${o} is already out. Trust the QOR CATALOG DATA and LIVE WEB RESEARCH context for what is real and current; if neither covers it, say you'd verify the latest status rather than asserting it is unreleased.
- SITE LANGUAGE: Reply only in ${i}. Keep official product and brand names as-is.
- If the person writes in another language, still answer in ${i} because the site language is ${i}.${a}
${n?`
QOR CATALOG / PAGE CONTEXT:
${n}`:""}`}const V=t=>new Promise(n=>setTimeout(n,t));function le(t){return t===404||t===429||t===500||t===502||t===503||t===504}function ue(t){return t===500||t===502||t===503||t===504}async function me(t,n,e=9e4){const i=new AbortController,o=setTimeout(()=>i.abort(),e),r={"Content-Type":"application/json"};try{z&&z.authStore&&z.authStore.token&&(r.Authorization=z.authStore.token)}catch{}try{return await fetch(t,{method:"POST",headers:r,body:JSON.stringify(n),signal:i.signal})}finally{clearTimeout(o)}}async function de({system:t,messages:n,maxOutputTokens:e,temperature:i,tools:o,jsonMode:r,timeoutMs:s}){var m,f,C,A,T;const a={temperature:i,maxOutputTokens:e,thinkingConfig:{thinkingBudget:0}};r&&(a.responseMimeType="application/json");const h={model:Ue,systemInstruction:{parts:[{text:t}]},contents:n.map(v=>({role:v.role==="assistant"?"model":v.role,parts:[{text:v.content}]})),generationConfig:a};Array.isArray(o)&&o.length&&(h.tools=o);const d=await me(_e,h,s);if(!d.ok){const v=new Error(`gemini ${d.status}`);throw v.transient=le(d.status),v.retryable=ue(d.status),v}const p=await d.json(),c=(T=(A=(C=(f=(m=p==null?void 0:p.candidates)==null?void 0:m[0])==null?void 0:f.content)==null?void 0:C.parts)==null?void 0:A[0])==null?void 0:T.text;if(!c){const v=new Error("gemini empty");throw v.transient=!0,v}return c.trim()}async function Ge({system:t,messages:n,maxOutputTokens:e,temperature:i,jsonMode:o,timeoutMs:r}){var p,c,m;const s={model:ze,messages:[{role:"system",content:t},...n],max_tokens:Math.min(e,De),temperature:i};o&&(s.response_format={type:"json_object"});const a=await me(Me,s,r);if(!a.ok){const f=new Error(`deepseek ${a.status}`);throw f.transient=le(a.status),f.retryable=ue(a.status),f}const h=await a.json();if(h&&h.error){const f=new Error(`deepseek ${h.error}`);throw f.transient=String(h.error)==="rate_limited",f}const d=(m=(c=(p=h==null?void 0:h.choices)==null?void 0:p[0])==null?void 0:c.message)==null?void 0:m.content;if(!d){const f=new Error("deepseek empty");throw f.transient=!0,f}return d.trim()}async function he({system:t,messages:n,maxOutputTokens:e=4096,temperature:i=.7,jsonMode:o=!1,tools:r=null,timeoutMs:s=9e4,budgetMs:a=null}){const h=Date.now()+(a||s*2),d=()=>h-Date.now();let p;for(let c=0;c<2&&!(d()<=2e3);c++)try{return await de({system:t,messages:n,maxOutputTokens:e,temperature:i,tools:r,jsonMode:o,timeoutMs:Math.min(s,d())})}catch(m){if(p=m,!m.retryable||c===1)break;await V(1200)}for(let c=0;c<2&&!(d()<=2e3);c++)try{return await Ge({system:t,messages:n,maxOutputTokens:e,temperature:i,jsonMode:o,timeoutMs:Math.min(s,d())})}catch(m){if(p=m,!m.retryable||c===1)break;await V(1200)}throw p||new Error("AI failed")}async function Ve({system:t,user:n,maxOutputTokens:e=4096,temperature:i=.2,timeoutMs:o=35e3}){let r;const s=[{role:"user",content:n}];for(let a=0;a<3;a++)try{return await de({system:t,messages:s,maxOutputTokens:e,temperature:i,tools:[{googleSearch:{}}],jsonMode:!1,timeoutMs:o})}catch(h){if(r=h,!h.transient||a===2)break;await V(700+a*500)}throw r||new Error("grounded search failed")}async function kt(t,n={}){const e=t.map(i=>({role:i.role==="model"||i.role==="assistant"?"assistant":"user",content:i.text}));return he({system:qe(n.language||n.lang||"en",n.context||"",{country:n.country||"",currency:n.currency||""}),messages:e,maxOutputTokens:4096,temperature:.68})}async function Be({system:t,user:n,maxOutputTokens:e=4096,temperature:i=.7,jsonMode:o=!1,tools:r=null,timeoutMs:s,budgetMs:a}){return he({system:t,messages:[{role:"user",content:n}],maxOutputTokens:e,temperature:i,jsonMode:o,tools:r,timeoutMs:s,budgetMs:a})}async function x(t,n={}){const e=n.language||n.lang||"en";return Ve({system:be(e),user:t,maxOutputTokens:n.maxOutputTokens||4096,temperature:.2,timeoutMs:n.timeoutMs||35e3})}function q(t){return String(t||"").trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/i,"").replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/,\s*([}\]])/g,"$1").trim()}function Qe(t){const n=String(t||""),e=n.indexOf("{");if(e<0)return"";let i=0,o=!1,r=!1;for(let s=e;s<n.length;s++){const a=n[s];if(r){r=!1;continue}if(a==="\\"){r=!0;continue}if(a==='"'){o=!o;continue}if(!o&&(a==="{"&&(i+=1),a==="}"&&(i-=1,i===0)))return n.slice(e,s+1)}return""}function Ye(t){const n=String(t||""),e=n.indexOf("{");if(e<0)return"";const i=[];let o=!1,r=!1,s=-1,a=null;for(let d=e;d<n.length;d++){const p=n[d];if(r){r=!1;continue}if(p==="\\"){r=!0;continue}if(p==='"'){o=!o;continue}o||(p==="{"||p==="["?i.push(p==="{"?"}":"]"):p==="}"||p==="]"?(i.pop(),s=d+1,a=[...i]):p===","&&(s=d,a=[...i]))}if(!i.length||s<0||!a)return"";let h=n.slice(e,s).replace(/,\s*$/,"");for(let d=a.length-1;d>=0;d--)h+=a[d];return h}function He(t){const n=q(t);try{return JSON.parse(n)}catch{}const e=q(Qe(n));if(e)try{return JSON.parse(e)}catch{}const i=Ye(n);if(i)try{return JSON.parse(q(i))}catch{}throw new Error("AI JSON parse failed")}async function I({system:t,user:n,maxOutputTokens:e=4096,timeoutMs:i=7e4,budgetMs:o=15e4,temperature:r=.6}){const s=await Be({system:t,user:n,maxOutputTokens:e,temperature:r,jsonMode:!0,timeoutMs:i,budgetMs:o});return He(s)}function pe(t){return String(t||"en").slice(0,2).toLowerCase()==="tr"?["Kullanım Uyumu","Performans","Kalite Uyumu","Özellik Seti","Ergonomi ve Taşınabilirlik","Güvenilirlik ve Risk","Topluluk Sinyali","Uzun Vadeli Değer"]:["Usage Fit","Performance","Quality Fit","Feature Set","Ergonomics and Portability","Reliability and Risk","Community Signal","Long-term Value"]}function ye(t){return String(t||"en").slice(0,2).toLowerCase()==="tr"?[{key:"usage_fit",label:"Kullanım Uyumu",emoji:"🎯"},{key:"content_match",label:"İçerik Uyumu",emoji:"🎬"},{key:"feature_depth",label:"Özellik Derinliği",emoji:"🧩"},{key:"ecosystem_fit",label:"Ekosistem Uyumu",emoji:"🔗"},{key:"lifestyle_match",label:"Yaşam Tarzı Uyumu",emoji:"🏠"},{key:"community_signal",label:"Topluluk Sinyali",emoji:"🌐"},{key:"retention_value",label:"Uzun Vadeli Tutma Değeri",emoji:"🚀"},{key:"risk_balance",label:"Risk Dengesi",emoji:"🛡"}]:[{key:"usage_fit",label:"Usage Fit",emoji:"🎯"},{key:"content_match",label:"Content Match",emoji:"🎬"},{key:"feature_depth",label:"Feature Depth",emoji:"🧩"},{key:"ecosystem_fit",label:"Ecosystem Fit",emoji:"🔗"},{key:"lifestyle_match",label:"Lifestyle Match",emoji:"🏠"},{key:"community_signal",label:"Community Signal",emoji:"🌐"},{key:"retention_value",label:"Long-term Retention",emoji:"🚀"},{key:"risk_balance",label:"Risk Balance",emoji:"🛡"}]}function We(t){const n=R(t);return`You are Qor AI's link analysis engine. You receive a product URL, optional metadata, optional web research data, and a user profile. Your job is to identify the EXACT product and analyze it for the user.

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
}`}const B=new Set(["p","dp","pd","gp","aw","d","product","products","urun","urunler","item","items","ref","detay","detail","details","ilan","ilanlar","listing","listings","ad","ads","offer","offers","sayfa","page","satilik","kiralik","sahibinden","index","default","view","show"]);function G(t){const n=String(t||"").trim().toLowerCase();if(!n||n.length<4)return!0;const e=n.split(/\s+/).filter(Boolean);return!!(!e.length||e.every(i=>B.has(i))||e.length<=2&&e.some(i=>B.has(i))||!/[a-zçğıöşü]{3,}/i.test(n))}function Je(t){try{const n=new URL(t),e=n.pathname.split("/").map(s=>s.trim()).filter(Boolean);let i="";if(/amazon\./i.test(n.hostname)){const s=e.findIndex(a=>/^(dp|product)$/i.test(a));s>0&&(i=e[s-1])}const o=s=>B.has(String(s).toLowerCase())||/^(ref|psc|qid|sr)[=_-]/i.test(s),r=/^(?:[a-z0-9]{10}|[a-f0-9]{16,}|[0-9]{8,})$/i;return i||(i=e.filter(a=>/[a-zçğıöşü]{3,}/i.test(a)&&!o(a)&&!r.test(a)).sort((a,h)=>h.replace(/[^a-zçğıöşü]/gi,"").length-a.replace(/[^a-zçğıöşü]/gi,"").length)[0]||""),i||(i=[...e].reverse().find(s=>/[a-z]/i.test(s)&&!o(s))||""),i=i.replace(/\.(html?|php|aspx?)$/i,"").replace(/[-_]+/g," "),i=i.replace(/\b(p|dp|pd|product|urun|item|ref|detay|ilan)\b/gi," ").replace(/\s+/g," ").trim(),i=i.replace(/\s+\d{5,}$/,"").trim(),i=i.replace(/\s+[A-Za-z]{2,}\d[A-Za-z0-9]{5,}$/,"").trim(),i.length<3?"":i.replace(/\b\w/g,s=>s.toUpperCase()).slice(0,80)}catch{return""}}function ie(t,n){const e=`${t||""} ${n||""}`.toLowerCase();return/(vasita|otomobil|arac|araba|\bauto\b|automobil|car|suv|pickup|kamyonet|motosiklet|motorcycle|ecoboost|tdi|tsi|dizel|benzin|hybrid|4x4|ranger|raptor|hilux|amarok)/.test(e)?"cars":/(emlak|konut|daire|villa|arsa|real-?estate|apartment|kiralik-?ev)/.test(e)?"real-estate":/(laptop|notebook|macbook|thinkpad|thinkbook|vivobook|zenbook|ultrabook|chromebook|legion|rog|tuf|omen|victus|ideapad|nebula)/.test(e)?"laptops":/(headphone|headset|kulaklik|earbud|airpods|buds|wh-|quietcomfort)/.test(e)?"headphones":/(tablet|ipad|galaxy-?tab|mediapad|matepad)/.test(e)?"tablets":/(phone|iphone|galaxy|pixel|xiaomi|redmi|smartphone|telefon)/.test(e)?"smartphones":/(monitor|display|oled|qled|ultrawide)/.test(e)?"monitors":/(keyboard|mouse|klavye|fare)/.test(e)?"keyboards":/(camera|kamera|objektif|lens|dslr|mirrorless)/.test(e)?"cameras":/(book|books|isbn|kindle|kitap)/.test(e)?"books":/(shoe|shirt|dress|jacket|pantolon|ayakkabi|giyim|tekstil)/.test(e)?"clothing":/(bisiklet|bicycle|scooter|skuter)/.test(e)?"bikes":/(kitchen|vacuum|robot|coffee|airfryer|home|mutfak|beyaz-?esya|buzdolabi|camasir)/.test(e)?"home-appliances":/(game|gaming|ps5|xbox|switch|konsol)/.test(e)?"gaming":"general"}function re({url:t,title:n,siteName:e,language:i}){const o=String(i||"en").slice(0,2).toLowerCase(),r=n||e||t;return o==="tr"?`"${r}" bağlantısı ürün sayfası olarak işlendi. Qor AI ürün adını bağlantı ve site bilgisinden çıkardı; canlı sayfa verisi alınamadığında değerlendirme, ürün adı/kategori sinyalleri ve profil cevapların üzerinden hazırlanır. Satın almadan önce satıcı sayfasındaki güncel fiyat, garanti ve teknik özellikleri de kontrol et.`:`"${r}" was processed as a product link. Qor AI identified it from the URL and store signal; when live page data is unavailable, the recommendation is built from the title, category signals, and your answers. Check the seller page for current price, warranty, and specs before buying.`}const Ke=["quora.com","reddit.com","youtube.com","youtu.be","twitter.com","x.com","facebook.com","fb.com","fb.watch","instagram.com","tiktok.com","threads.net","wikipedia.org","fandom.com","medium.com","substack.com","linkedin.com","pinterest.com","github.com","gitlab.com","stackoverflow.com","stackexchange.com","google.com","bing.com","duckduckgo.com","yahoo.com","yandex.com","whatsapp.com","t.me","telegram.org","discord.com","discord.gg","twitch.tv","spotify.com","soundcloud.com","netflix.com","wikihow.com"];function Xe(t){let n;try{n=new URL(t)}catch{return!1}const e=n.hostname.replace(/^www\./,"").toLowerCase();return!(Ke.some(o=>e===o||e.endsWith("."+o))||!n.pathname.replace(/\/+$/,"")&&!n.search)}async function Et(t,n,e={}){const i=Je(t);let o="";try{o=new URL(t).hostname.replace(/^www\./,"")}catch{}if(!Xe(t))return{url:t,title:i||o||t,score:0,analysis:"",category:"",siteName:o,price:null,isProduct:!1};let r="";if(G(i)||/amazon\./i.test(o))try{const c=`Identify the EXACT product sold at this URL using Google Search.
URL: ${t}
`+(i?`Possible title from URL slug: ${i}
`:"")+(o?`Store: ${o}
`:"")+"Return the exact product name (brand + model + key variant), its category, and the current price with currency if visible. If you cannot confirm ONE specific product, say so explicitly — do not guess.";r=await x(c,{language:n,maxOutputTokens:768,timeoutMs:25e3})}catch{}let a=null;try{const c={url:t,productMetadata:i?{title:i,siteName:o}:{siteName:o},userProfile:e};r&&(c.webResearch=r),a=await I({system:await Y("gemini_link_analysis_system",We(n)),user:JSON.stringify(c),maxOutputTokens:1536})}catch{a={title:i||o||t,score:60,analysis:re({url:t,title:i,siteName:o,language:n}),category:ie(t,i),site_name:o,price:null,is_product:!0}}const h=String(a.title||"").trim(),p=!h||/erişim|hata|error|unknown|bilinmeyen/i.test(h)||G(h)?G(i)?h||o||t:i:h;return{url:t,title:p,score:Number(a.score)||0,analysis:String(a.analysis||re({url:t,title:p,siteName:o,language:n})),category:(()=>{const c=String(a.category||"").toLowerCase().trim();if(c&&c!=="general"&&c!=="other")return c;const m=ie(t,`${p} ${a.analysis||""}`);return m!=="general"?m:c||"general"})(),siteName:String(a.site_name||o||""),price:a.price||null,isProduct:a.is_product!==!1}}async function At({category:t,productTitle:n,url:e,language:i,userProfile:o={},productContext:r="",siteName:s=""}){const a=ve(t),h=await I({system:Se(i,a),user:JSON.stringify({category:t||"unknown",productTitle:n,url:e,store:s,productContext:String(r||"").slice(0,1200),userProfile:o,variationSeed:Q()}),maxOutputTokens:3072,temperature:.95});return(Array.isArray(h.questions)?h.questions:[]).map((p,c)=>({id:`q${c}`,text:String(p.question||""),options:Array.isArray(p.options)?p.options.map(String):[]})).filter(p=>p.text&&p.options.length>=2).slice(0,a)}async function Tt({products:t,language:n,userProfile:e={}}){const i=ke(t),o=await I({system:Ee(n,i),user:JSON.stringify({products:(t||[]).map(r=>({title:r.title,url:r.url,category:r.category||"unknown",store:r.siteName,initialScore:r.score,productContext:String(r.analysis||"").slice(0,900)})),userProfile:e,variationSeed:Q()}),maxOutputTokens:8192,temperature:.95});return(Array.isArray(o.questions)?o.questions:[]).map((r,s)=>({id:`cq${s}`,text:String(r.question||""),options:Array.isArray(r.options)?r.options.map(String):[]})).filter(r=>r.text&&r.options.length>=2).slice(0,i)}async function Rt({subscriptionNames:t,language:n,userProfile:e={}}){const i=t.length>1,o=Ae(t),r=await I({system:Te(t.join(", "),i,n,o),user:JSON.stringify({subscriptions:t,mode:i?"compare":"single",userProfile:e,variationSeed:Q()}),maxOutputTokens:8192,temperature:.95});return(Array.isArray(r.questions)?r.questions:[]).map((a,h)=>({id:`sq${h}`,text:String(a.question||""),options:Array.isArray(a.options)?a.options.map(String):[]})).filter(a=>a.text&&a.options.length>=2).slice(0,o)}function H(t){return`Cover ALL of the following, as compact notes:
1) IDENTITY: what this exactly is (edition/variant), current market status, and the headline specs or plan details that actually matter.
2) COMMUNITY SENTIMENT — THE MAIN JOB: scan real user discussion (Reddit threads, YouTube review takeaways and their comment sections, retailer review patterns such as Amazon/Trendyol/Best Buy, specialist review sites, forums, app-store reviews). Extract the RECURRING THEMES, not one-off opinions. For each theme note: the theme, whether it is praise / complaint / mixed, and roughly how dominant it is (e.g. "mentioned in most threads" vs "occasional").
3) COMPLAINTS IN DETAIL: the most repeated negatives, failures, regrets, after-sales/support problems, and whether they hit everyone or only a specific use case. Never soften them.
4) WHO LOVES IT vs WHO REGRETS IT: the usage profiles behind each side.
5) DEAL-BREAKERS: the things a buyer would be angry about not knowing beforehand.
6) ALTERNATIVES people actually compare it against, and why they switch.
7) VALUE / TIMING signal: discount cadence, a newer model or plan change on the horizon, or long-term cost drift. No invented exact prices.
Write in ${t}. Do NOT invent direct quotes, exact review counts, or exact prices. Where evidence is thin, say plainly that it is thin.`}async function Nt({title:t,category:n,url:e,siteName:i,language:o}){const r=R(o),s=String(t||"").trim();if(!s)return"";try{return await x(`Research the product "${s}"${n?` (category: ${n})`:""} for a Qor AI buyer report.
`+(e?`Product URL: ${e}
`:"")+(i?`Store: ${i}
`:"")+`
${H(r)}`,{language:o,maxOutputTokens:3072,timeoutMs:45e3})}catch{return""}}async function It({bases:t=[],language:n}){const e=R(n),i=t.filter(r=>r&&r.title);if(!i.length)return"";const o=i.map((r,s)=>`${s+1}. ${r.title}${r.category?` (${r.category})`:""}${r.siteName?` — ${r.siteName}`:""}`).join(`
`);try{return await x(`Research these products for a Qor AI head-to-head comparison report:
${o}

${H(e)}

8) HEAD-TO-HEAD: after covering each product, state the decisive real-world differences between them and which owner profile ends up happier with which one.`,{language:n,maxOutputTokens:4096,timeoutMs:5e4})}catch{return""}}async function Ot({names:t=[],language:n}){const e=R(n),i=t.filter(Boolean);if(!i.length)return"";try{return await x(`Research these subscription services for a Qor AI subscription report: ${i.join(", ")}.

${H(e)}

8) SUBSCRIPTION SPECIFICS: recent catalogue/feature/plan changes, ad tiers, sharing and device limits, regional content gaps, app quality and reliability complaints, support quality, and the most common reasons people cancel or come back.
9) If several services are listed, end with the decisive differences between them for everyday use.`,{language:n,maxOutputTokens:4096,timeoutMs:5e4})}catch{return""}}const Ze=new Set(["ile","için","and","the","with","for","gb","tb","mb","inch","inç","akıllı","telefon","cep","kablosuz","siyah","beyaz","gri","mavi"]);function oe(t){return String(t||"").toLowerCase().replace(/[()[\]{}",]/g," ").split(/[\s/_-]+/).map(n=>n.trim()).filter(n=>n.length>1&&!Ze.has(n))}function se(t,n){const e=oe(t),i=new Set(oe(n));return!e.length||!i.size?0:e.filter(r=>i.has(r)).length/e.length}async function Ct(t,{searchProducts:n,minScore:e=.55}={}){const i=String(t||"").trim();if(!i||typeof n!="function")return null;let o=[];try{o=await n(i,8)}catch{return null}let r=null;for(const s of Array.isArray(o)?o:[]){if(!(s!=null&&s.id)||!(s!=null&&s.name))continue;const a=Math.min(se(i,s.name),se(s.name,i)+.15);(!r||a>r.score)&&(r={score:a,product:s})}return r&&r.score>=e?r.product:null}function Lt(t,n=75e3){return t?Promise.race([Promise.resolve(t).then(e=>String(e||"")).catch(()=>""),new Promise(e=>{setTimeout(()=>e(""),n)})]):Promise.resolve("")}function E(t,n=8){return Array.isArray(t)?t.map(e=>typeof e=="string"?{title:e.trim(),detail:""}:e&&typeof e=="object"?{title:String(e.title||e.label||e.point||"").trim(),detail:String(e.detail||e.impact||e.why||e.comment||"").trim()}:null).filter(e=>e&&(e.title||e.detail)).map(e=>e.title?e:{title:e.detail,detail:""}).slice(0,n):[]}const et=new Set(["high","medium","low"]);function W(t,n=5){return Array.isArray(t)?t.map(e=>{if(typeof e=="string")return{severity:"medium",title:e.trim(),detail:""};if(!e||typeof e!="object")return null;const i=String(e.severity||e.level||"medium").toLowerCase();return{severity:et.has(i)?i:"medium",title:String(e.title||e.label||"").trim(),detail:String(e.detail||e.why||e.impact||"").trim()}}).filter(e=>e&&(e.title||e.detail)).slice(0,n):[]}const tt=new Set(["positive","negative","mixed"]);function J(t,n=8){return Array.isArray(t)?t.map(e=>{if(!e||typeof e!="object")return null;const i=String(e.sentiment||e.tone||"mixed").toLowerCase();return{label:String(e.label||e.theme||e.title||"").trim(),sentiment:tt.has(i)?i:"mixed",strength:Math.max(0,Math.min(100,Math.round(b(e.strength??e.share??e.weight)))),detail:String(e.detail||e.note||e.summary||"").trim()}}).filter(e=>e&&e.label).map(e=>e.strength>0?e:{...e,strength:45}).slice(0,n):[]}function K(t,n=7){return Array.isArray(t)?t.map(e=>{if(!e||typeof e!="object")return null;const i=Math.max(-100,Math.min(100,Math.round(b(e.impact??e.effect??e.delta))));return{topic:String(e.topic||e.question||e.about||"").trim(),answer:String(e.answer||e.choice||"").trim(),impact:i,note:String(e.note||e.detail||e.why||"").trim()}}).filter(e=>e&&(e.answer||e.note)).slice(0,n):[]}function fe(t,n=10){return Array.isArray(t)?t.map(e=>typeof e=="string"?{name:e.trim(),note:""}:e&&typeof e=="object"?{name:String(e.name||e.source||e.type||"").trim(),note:String(e.note||e.detail||"").trim()}:null).filter(e=>e&&e.name).slice(0,n):[]}function nt(t,n=10){return Array.isArray(t)?t.map(e=>!e||typeof e!="object"?null:{label:String(e.label||e.feature||"").trim(),productValue:String(e.productValue||e.value||"").trim(),userNeed:String(e.userNeed||e.need||"").trim(),score:Math.max(0,Math.min(100,Math.round(b(e.score)))),comment:String(e.comment||e.detail||"").trim()}).filter(e=>e&&e.label).slice(0,n):[]}function ge(t){const n=(Array.isArray(t)?t:[]).map(e=>Number(e)||0).filter(e=>e>0);return n.length<2?0:Math.round(Math.max(...n)-Math.min(...n))}const it=new Set(["buy","consider","skip"]);function rt(t,n){const e=String(t||"").toLowerCase().trim();if(it.has(e))return e;const i=Number(n)||0;return i>=70?"buy":i>=50?"consider":"skip"}function _(t){return String(t||"en").slice(0,2).toLowerCase()==="tr"?'ADDRESS FORM — HARD RULE: address the reader informally in Turkish, in the "sen" form ("senin için", "alışkanlıklarına göre", "bunu al", "geç"). NEVER use the formal "siz" forms (no "-ınız/-iniz" possessives, no "olun/edersiniz/olmalısınız"). The whole interface speaks in "sen"; the report must match it.':'ADDRESS FORM — HARD RULE: address the reader directly as "you"; never write "the user" or "the buyer" when you mean the reader.'}const X="IMPACT VALUES: use the full range honestly. A typical answer nudges the verdict (|impact| 10-45); only an answer that genuinely decides the outcome earns |impact| above 70. Any answer that works AGAINST this choice MUST get a NEGATIVE impact, and a realistic quiz almost always has at least one. A list where every answer is a strong positive is not credible and is forbidden.";function P(t,n){const e=String(t||"").trim();return e?`

LIVE WEB / COMMUNITY RESEARCH NOTES (grounded Google Search, written in ${n} — treat as the CURRENT truth and build the community sections on it):
${e.slice(0,14e3)}`:`

LIVE WEB / COMMUNITY RESEARCH NOTES: none were available. Base the community sections on well-established, widely reported patterns only, and say plainly where the evidence is thin. Do NOT fabricate specific findings.`}function ot(t){const n=R(t),e=String(t||"").slice(0,2)==="tr",i=e?"Kullanım Uyumu":"Usage Fit",o=e?"Bütçe Uyumu":"Budget Match",r=e?"Kalite Uyumu":"Quality Fit",s=e?"Uzun Vadeli Değer":"Long-term Value",a=e?"Yaşam Tarzı Uyumu":"Lifestyle Match",h=e?"Özellik Seti":"Feature Set",d=e?"Güvenilirlik ve Risk":"Reliability and Risk",p=e?"Topluluk Sinyali":"Community Signal";return`You are Qor AI's senior product analyst. Given a product, the user's quiz answers, the user profile and live web/community research notes, produce the PERSONAL DECISION half of a comprehensive match report.

LANGUAGE: Write ALL text in ${n}. Factor labels must also be in ${n}.
${_(t)}

CRITICAL — CATEGORY-AWARE ANALYSIS:
- The product can be ANY category: tech, books, clothing, home, sports, beauty, etc.
- For TECH products: analyze specs deeply — cite performance numbers, thermal behavior, software longevity, benchmark context.
- For BOOKS: discuss writing quality, pacing, reader reception, author credentials, genre positioning.
- For CLOTHING/HOME: discuss material science, build quality, brand heritage, durability.
- NEVER force tech terminology onto non-tech products.
- Adapt factor meanings and labels to the product category:
  • "${r}" = build/material/content quality (as appropriate)
  • "${s}" = durability/longevity/re-read value (as appropriate)

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
    {"label": "${h}", "score": <0-100>, "emoji": "🧩", "detail": "1 sentence"},
    {"label": "${d}", "score": <0-100>, "emoji": "🛡", "detail": "1 sentence"},
    {"label": "${p}", "score": <0-100>, "emoji": "🌐", "detail": "1 sentence"},
    {"label": "${s}", "score": <0-100>, "emoji": "🚀", "detail": "1 sentence"},
    {"label": "${a}", "score": <0-100>, "emoji": "🏠", "detail": "1 sentence"}
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
}`}function st(t){const n=R(t);return`You are Qor AI's community-research analyst. You receive a product, the user's quiz answers, and live web/community research notes gathered with Google Search. Produce the COMMUNITY & MARKET half of the report.

LANGUAGE: Write ALL text in ${n}.
${_(t)}

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
}`}function b(t){if(typeof t=="number")return t;const n=parseFloat(String(t||"").replace(",","."));return Number.isFinite(n)?n:0}function Z(t){if(!t||typeof t!="object")return null;const n=Math.max(0,Math.round(b(t.positive))),e=Math.max(0,Math.round(b(t.neutral))),i=Math.max(0,Math.round(b(t.negative)));return n+e+i<=0?null:{positive:n,neutral:e,negative:i}}async function $t({base:t,answers:n,language:e,userProfile:i={},research:o=""}){const r=R(e),s=n.filter(y=>y.answer!=null).map(y=>({question:y.question,answer:y.answer})),a={url:t.url,title:t.title,category:t.category,siteName:t.siteName,initialScore:t.score,initialAnalysis:t.analysis},h=JSON.stringify({product:a,quizAnswers:s,userProfile:i}),d=(async()=>I({system:await Y("gemini_enhanced_link_analysis_system",ot(e))+P(o,r),user:h,maxOutputTokens:8192}))(),p=(async()=>{try{return await I({system:st(e)+P(o,r),user:h,maxOutputTokens:8192})}catch{return{}}})(),[c,m]=await Promise.all([d,p]),f=(Array.isArray(c.factors)?c.factors:[]).map(y=>({label:String(y.label||y.name||""),score:b(y.score??y.value),emoji:String(y.emoji||y.icon||"📊"),detail:String(y.detail||y.comment||"")})).filter(y=>y.label),C=b(c.enhancedScore??c.enhanced_score??c.score),A=C>0?C:t.score,T=Array.isArray(m.alternatives)&&m.alternatives.length?m.alternatives:c.alternatives,v=m.priceOutlook&&typeof m.priceOutlook=="object"?{trend:String(m.priceOutlook.trend||"unknown").toLowerCase(),bestTime:String(m.priceOutlook.bestTime||""),note:String(m.priceOutlook.note||"")}:null;return{base:t,enhancedScore:A,confidence:Math.max(0,Math.min(100,Math.round(b(c.confidence))))||(o?78:58),decision:rt(c.decision,A),headline:String(c.headline||""),factors:f,verdict:String(c.verdict||c.detailed_verdict||c.analysis||t.analysis||""),prosForUser:E(c.prosForUser||c.pros,6),consForUser:E(c.consForUser||c.cons,5),criticalPoints:W(c.criticalPoints,5),quizInsights:K(c.quizInsights,7),featureMatches:nt(c.featureMatches,8),alternatives:E(Array.isArray(T)?T.map(y=>y&&typeof y=="object"?{title:y.name||y.title,detail:y.why||y.detail}:y):[],4),bestFor:String(c.bestFor||""),notFor:String(c.notFor||""),personaScore:b(c.personaScore)||null,personaAnalysis:c.personaAnalysis?String(c.personaAnalysis):"",communityScore:b(m.communityScore??c.communityScore)||null,communityAnalysis:String(m.communityAnalysis||c.communityAnalysis||""),sentimentBreakdown:Z(m.sentimentBreakdown||m.sentiment_breakdown||c.sentimentBreakdown||c.sentiment_breakdown),communityThemes:J(m.communityThemes,8),praisePoints:E(m.praisePoints,5),complaintPoints:E(m.complaintPoints,5),reliabilityNotes:E(m.reliabilityNotes,4),sources:fe(m.sources,8),verificationNotes:E(m.verificationNotes,4),priceOutlook:v,researched:!!String(o||"").trim(),overallVerdict:c.overallVerdict?String(c.overallVerdict):""}}function at(t){const n=R(t),e=pe(t),i=["🎯","⚡","⭐","🧩","🧭","🛡","🌐","🚀"],o=e.map((r,s)=>`        {"label": "${r}", "score": 0, "emoji": "${i[s]||"📊"}", "detail": "1 sentence"}`).join(`,
`);return`You are Qor AI's senior product comparison analyst. Produce the PER-PRODUCT half of a head-to-head comparison report.

LANGUAGE: Write ALL text fields in ${n}. Keep official product names as-is.
${_(t)}

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

Rules for factors: 8 entries per product, each with a "detail" sentence that explains the score with evidence — never a restatement of the label. specHighlights: 4-6 entries.`}function ct(t,n=[]){const e=R(t);return`You are Qor AI's senior comparison analyst. The per-product sections are already written. Produce ONLY the cross-product VERDICT half of the report.

LANGUAGE: Write ALL text fields in ${e}. Keep official product names as-is.
${_(t)}

Rules:
- "winner.best" MUST be exactly one of: ${n.join(" | ")}.
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
}`}async function Pt({bases:t,answers:n,language:e,userProfile:i={},research:o=""}){var O,U;const r=R(e),s=pe(e),a=["🎯","⚡","⭐","🧩","🧭","🛡","🌐","🚀"],h=(n||[]).filter(u=>u.answer!=null).map(u=>({question:u.question,answer:u.answer})),d=(t||[]).map(u=>u.title).filter(Boolean),p=JSON.stringify({products:(t||[]).map((u,S)=>({index:S+1,url:u.url,title:u.title,category:u.category,siteName:u.siteName,initialScore:u.score,initialAnalysis:u.analysis})),quizAnswers:h,userProfile:i}),[c,m]=await Promise.all([I({system:at(e)+P(o,r),user:p,maxOutputTokens:12288}),(async()=>{try{return await I({system:ct(e,d)+P(o,r),user:p,maxOutputTokens:8192})}catch{return{}}})()]),f=Array.isArray(c.products)?c.products:[],A=((t||[]).length?(t||[]).map((u,S)=>f.find(N=>(N==null?void 0:N.url)&&N.url===u.url)||f[S]||{}):f).map((u,S)=>{const N=(t||[])[S]||{},l=b(u.score)||b(N.score)||50,L=Array.isArray(u.factors)?u.factors.map(g=>({label:String((g==null?void 0:g.label)||""),score:b((g==null?void 0:g.score)??(g==null?void 0:g.value)),emoji:String((g==null?void 0:g.emoji)||"📊"),detail:String((g==null?void 0:g.detail)||"")})).filter(g=>g.label):[],D=L.length?L:s.map((g,w)=>({label:g,score:l,emoji:a[w]||"📊",detail:""})),F=Array.isArray(u.specHighlights)?u.specHighlights.map(g=>({label:String((g==null?void 0:g.label)||""),value:String((g==null?void 0:g.value)||"")})).filter(g=>g.label||g.value):[];return{name:String(u.name||N.title||`Product ${S+1}`),url:String(u.url||N.url||""),siteName:String(u.siteName||N.siteName||""),score:l,rank:b(u.rank)||S+1,bestFor:String(u.bestFor||""),summary:String(u.summary||N.analysis||""),pros:E(u.pros,5),cons:E(u.cons,4),risks:E(u.risks,4),criticalPoints:W(u.criticalPoints,4),factors:D,specHighlights:F,community:String(u.community||""),communityThemes:J(u.communityThemes,6),sentiment:Z(u.sentimentBreakdown||u.sentiment_breakdown)}});A.sort((u,S)=>(u.rank||99)-(S.rank||99));const T=m.winner&&typeof m.winner=="object"?m.winner:c.winner&&typeof c.winner=="object"?c.winner:null,v=T?{best:String(T.best||((O=A[0])==null?void 0:O.name)||""),reason:String(T.reason||""),scoreGap:ge(A.map(u=>u.score)),runnerUpCase:String(T.runnerUpCase||"")}:{best:((U=A[0])==null?void 0:U.name)||"",reason:"",scoreGap:0,runnerUpCase:""},y=m.detailed&&typeof m.detailed=="object"?m.detailed:c.detailed&&typeof c.detailed=="object"?c.detailed:null,k=y?{fit:String(y.fit||""),performance:String(y.performance||""),ownership:String(y.ownership||""),community:String(y.community||""),recommendation:String(y.recommendation||"")}:null;return{type:"compare_structured",isCompare:!0,bases:t,answers:n,winner:v,products:A,scores:Object.fromEntries(A.map(u=>[u.name,u.score])),detailed:k,decisiveDifferences:E(m.decisiveDifferences,6),quizInsights:K(m.quizInsights,7),confidence:Math.max(0,Math.min(100,Math.round(b(m.confidence))))||(o?76:56),researched:!!String(o||"").trim(),recommendation:String(m.recommendation||c.recommendation||(k==null?void 0:k.recommendation)||v.reason||"")}}function lt(t,n,e,i,o){const r=R(o),a=ye(o).map(d=>`        "${d.key}": {"score": "integer 0-100", "detail": "1 evidence-based sentence in ${r} explaining this ${d.label} score"}`).join(`,
`),h=i.length?i.map(d=>`- ${d.question}: ${d.answer}`).join(`
`):"- (no quiz answers provided)";return`You are Qor AI's subscription intelligence analyst. Produce the PER-SERVICE half of a subscription report.
Analyze: ${t}

Quiz Answers:
${h}

CRITICAL RULES:
- ALL text values MUST be in ${r} language
- ${_(o)}
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
${a}
      }
    }
  }
}`}function ut(t,n,e){const i=R(e);return`You are Qor AI's subscription intelligence analyst. The per-service sections are already written. Produce ONLY the VERDICT half of the report for: ${t}.

LANGUAGE: ALL text values MUST be in ${i}.
${_(e)}


VENDOR NEUTRALITY — HARD RULE (this analysis runs on a model that may BE one of the compared services, or be made by the company that owns one):
- Your own identity, your maker, and how familiar a service feels to you must have ZERO effect on the scores. Judge every service against the same evidence bar.
- ABSENCE OF EVIDENCE IS NOT A STRENGTH. "No complaints found", "limited community information" or "no known issues" must NEVER raise a score, appear as a positive theme, or justify a high risk/community score. When the research is thin for a service, say the evidence is thin, LOWER the confidence, and score that factor in the middle band — never at the top.
- Every service must get at least two genuinely weak factors stated as plainly as the leader's. A profile where one service is best on EVERY factor is a red flag: re-check it and correct the inflation.
- FACTS ONLY FROM RESEARCH: regional availability, plan names, model names/versions and pricing tiers change constantly. State them ONLY if the research notes cover them. If they do not, omit the claim entirely — never fill it from memory.

Rules:
- ${X}
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
}`}async function _t({subscriptionNames:t,answers:n,language:e,userProfile:i={},research:o=""}){var U;const r=t.length>1,s=t.join(", "),a=R(e),h=ye(e),d=Object.fromEntries(h.map(u=>[u.key,u])),p=(n||[]).filter(u=>u.answer!=null).map(u=>({question:u.question,answer:u.answer})),c=JSON.stringify({subscriptions:t,mode:r?"compare":"single",quizAnswers:p,userProfile:i}),[m,f]=await Promise.all([(async()=>I({system:await Y("gemini_subscription_analysis",lt(s,t.length,r,p,e))+P(o,a),user:c,maxOutputTokens:12288}))(),(async()=>{try{return await I({system:ut(s,r,e)+P(o,a),user:c,maxOutputTokens:8192})}catch{return{}}})()]),C=m.subscriptions&&typeof m.subscriptions=="object"?m.subscriptions:{},A=new Map(Object.entries(C).map(([u,S])=>[String(u).toLowerCase(),{name:u,d:S}])),T=(t||[]).map((u,S)=>{const N=A.get(String(u).toLowerCase())||[...A.values()].find(w=>String(w.name).toLowerCase().includes(String(u).toLowerCase()))||{name:u,d:{}},l=N.d||{},L=b(l==null?void 0:l.compatibility_score)||55,D=l!=null&&l.factors&&typeof l.factors=="object"?Object.entries(l.factors).map(([w,j])=>{const ee=d[w]||{},$=j&&typeof j=="object"?j:null;return{key:w,label:ee.label||String(w).replace(/_/g," "),emoji:ee.emoji||"📊",score:b($?$.score??$.value:j)||L,detail:$?String($.detail||$.comment||""):""}}):[],F=D.length?D:h.map(w=>({key:w.key,label:w.label,emoji:w.emoji,score:L,detail:""})),g=Array.isArray(l==null?void 0:l.notable_features)?l.notable_features.map(w=>({label:String((w==null?void 0:w.label)||""),value:String((w==null?void 0:w.value)||"")})).filter(w=>w.label||w.value):[];return{name:String(N.name||u),category:String((l==null?void 0:l.category)||""),score:L,rank:b(l==null?void 0:l.rank)||S+1,explanation:String((l==null?void 0:l.compatibility_explanation)||""),pros:E(l==null?void 0:l.pros,5),cons:E(l==null?void 0:l.cons,4),risks:E(l==null?void 0:l.risks,4),criticalPoints:W((l==null?void 0:l.critical_points)||(l==null?void 0:l.criticalPoints),4),features:g,community:String((l==null?void 0:l.community_sentiment)||""),communityThemes:J((l==null?void 0:l.community_themes)||(l==null?void 0:l.communityThemes),6),sources:fe(l==null?void 0:l.sources,6),cancelReasons:E((l==null?void 0:l.cancel_reasons)||(l==null?void 0:l.cancelReasons),4),sentiment:Z((l==null?void 0:l.sentiment_breakdown)||(l==null?void 0:l.sentimentBreakdown)),bestFor:String((l==null?void 0:l.best_for)||""),notFor:String((l==null?void 0:l.not_for)||(l==null?void 0:l.notFor)||""),factors:F}}).sort((u,S)=>(u.rank||99)-(S.rank||99)||S.score-u.score),v={};T.forEach(u=>{v[u.name]=u.score});const y=((U=[...T].sort((u,S)=>S.score-u.score)[0])==null?void 0:U.name)||"",k=f.winner&&typeof f.winner=="object"?f.winner:m.winner&&typeof m.winner=="object"?m.winner:null,O=f.detailed_comparison&&typeof f.detailed_comparison=="object"?f.detailed_comparison:m.detailed_comparison&&typeof m.detailed_comparison=="object"?m.detailed_comparison:null;return{isCompare:r,services:T,scores:v,winner:k?{best:String(k.best_content||k.overall||y||""),overall:String(k.overall||""),reason:String(k.reason||""),scoreGap:ge(T.map(u=>u.score)),runnerUpCase:String(k.runner_up_case||k.runnerUpCase||""),recommendation:String(k.recommendation||"")}:{best:y,overall:y,reason:"",scoreGap:0,runnerUpCase:"",recommendation:""},detailed:O?{fit:String(O.service_fit_summary||""),features:String(O.feature_comparison||""),ux:String(O.user_experience||""),community:String(O.community_and_risk||""),plan:String(O.final_plan||"")}:null,decisiveDifferences:E(f.decisive_differences||f.decisiveDifferences,6),quizInsights:K(f.quiz_insights||f.quizInsights,7),confidence:Math.max(0,Math.min(100,Math.round(b(f.confidence))))||(o?76:56),researched:!!String(o||"").trim(),recommendation:String(f.recommendation||m.recommendation||(k==null?void 0:k.recommendation)||"")}}const mt={netflix:"video","disney+":"video","disney plus":"video","amazon prime":"video","prime video":"video",hbo:"video","hbo max":"video",max:"video",hulu:"video","apple tv+":"video","apple tv plus":"video",blutv:"video",exxen:"video",gain:"video",mubi:"video","youtube premium":"video",crunchyroll:"video","bein sports":"video",tod:"video","paramount+":"video","paramount plus":"video",peacock:"video",tabii:"video","tv+":"video",spotify:"music","apple music":"music","youtube music":"music",tidal:"music",deezer:"music","amazon music":"music",fizy:"music",soundcloud:"music","soundcloud go":"music","chatgpt plus":"ai",chatgpt:"ai","claude pro":"ai",claude:"ai",gemini:"ai","gemini advanced":"ai",perplexity:"ai",midjourney:"ai",copilot:"ai","microsoft copilot":"ai",grok:"ai",deepseek:"ai",poe:"ai",icloud:"cloud","icloud+":"cloud","google one":"cloud",dropbox:"cloud",onedrive:"cloud",pcloud:"cloud",mega:"cloud","adobe creative cloud":"productivity",canva:"productivity",figma:"productivity","microsoft 365":"productivity","office 365":"productivity",notion:"productivity","google workspace":"productivity",hostinger:"hosting",cloudflare:"hosting",godaddy:"hosting",namecheap:"hosting",bluehost:"hosting",siteground:"hosting",hostgator:"hosting",ionos:"hosting",dreamhost:"hosting",wix:"hosting",squarespace:"hosting",wordpress:"hosting","wordpress.com":"hosting",vercel:"hosting",netlify:"hosting",digitalocean:"hosting",kinsta:"hosting",porkbun:"hosting",wpengine:"hosting","wp engine":"hosting","xbox game pass":"gaming","playstation plus":"gaming","ps plus":"gaming","ea play":"gaming","geforce now":"gaming","nintendo switch online":"gaming","ubisoft+":"gaming","apple arcade":"gaming"};function we(t){return mt[String(t||"").trim().toLowerCase()]||null}const dt={"video-streaming":"video","music-streaming":"music",gaming:"gaming","ai-tools":"ai","cloud-storage":"cloud",productivity:"productivity","web-hosting":"hosting",hosting:"hosting",vpn:"vpn",bundles:"bundles",news:"news",fitness:"fitness",education:"education",other:"other"};function ht(t){const n=String(t||"").trim().toLowerCase();return dt[n]||n||null}function Ut(t){const n=t.map(we).filter(Boolean);return[...new Set(n)].length>1}const pt={netflix:"Netflix","disney+":"Disney+","disney plus":"Disney+","amazon prime":"Amazon Prime","prime video":"Amazon Prime","amazon prime video":"Amazon Prime",hbo:"HBO","hbo max":"HBO Max",max:"Max",hulu:"Hulu","apple tv+":"Apple TV+","apple tv plus":"Apple TV+",blutv:"BluTV",exxen:"Exxen",exen:"Exxen",gain:"Gain",mubi:"MUBI","youtube premium":"YouTube Premium","yt premium":"YouTube Premium",crunchyroll:"Crunchyroll","bein sports":"beIN Sports",tod:"TOD","paramount+":"Paramount+","paramount plus":"Paramount+",peacock:"Peacock",tabii:"Tabii","tv+":"Apple TV+",spotify:"Spotify","apple music":"Apple Music","youtube music":"YouTube Music","yt music":"YouTube Music",tidal:"Tidal",deezer:"Deezer","amazon music":"Amazon Music",fizy:"Fizy",soundcloud:"SoundCloud","soundcloud go":"SoundCloud Go","chatgpt plus":"ChatGPT Plus",chatgpt:"ChatGPT Plus","claude pro":"Claude Pro",claude:"Claude Pro",gemini:"Gemini Advanced","gemini advanced":"Gemini Advanced",perplexity:"Perplexity",midjourney:"Midjourney",copilot:"Microsoft Copilot","microsoft copilot":"Microsoft Copilot",grok:"Grok",deepseek:"DeepSeek",poe:"Poe",icloud:"iCloud+","icloud+":"iCloud+","google one":"Google One",dropbox:"Dropbox",onedrive:"OneDrive",pcloud:"pCloud",mega:"MEGA","adobe creative cloud":"Adobe Creative Cloud",canva:"Canva","microsoft 365":"Microsoft 365","office 365":"Microsoft 365",notion:"Notion","google workspace":"Google Workspace",hostinger:"Hostinger",cloudflare:"Cloudflare",godaddy:"GoDaddy",namecheap:"Namecheap",bluehost:"Bluehost",siteground:"SiteGround",hostgator:"HostGator",ionos:"IONOS",dreamhost:"DreamHost",wix:"Wix",squarespace:"Squarespace",wordpress:"WordPress.com","wordpress.com":"WordPress.com",vercel:"Vercel",netlify:"Netlify",digitalocean:"DigitalOcean",kinsta:"Kinsta",porkbun:"Porkbun",wpengine:"WP Engine","wp engine":"WP Engine","xbox game pass":"Xbox Game Pass","playstation plus":"PlayStation Plus","ps plus":"PlayStation Plus","ea play":"EA Play","geforce now":"GeForce Now","nintendo switch online":"Nintendo Switch Online","ubisoft+":"Ubisoft+","apple arcade":"Apple Arcade"};function yt(t){const n=String(t||"").trim().toLowerCase();return n.includes("http://")||n.includes("https://")||n.includes("www.")||/\.[a-z]{2,}(\/|$)/.test(n)}function ae(t){const n=String(t||"").trim().replace(/\s+/g," "),e=pt[n.toLowerCase()];return e||n.replace(/\b\w/g,i=>i.toUpperCase())}function ft(t){const n=String(t||"").slice(0,2)==="tr";return{empty:n?"Lütfen en az bir abonelik adı girin.":"Please enter at least one subscription name.",url:n?"Buraya yalnızca abonelik adı girebilirsin — link kabul edilmez.":"Only subscription names are accepted here — links are not allowed.",notSub:n?"Bu metin bir abonelik servisine benzemiyor. Lütfen Netflix, Spotify gibi bir servis adı yaz.":"This doesn't look like a subscription service. Please enter a name like Netflix or Spotify.",failed:n?"Abonelik doğrulanırken hata oluştu. Lütfen tekrar deneyin.":"Could not validate subscription. Please try again.",dup:e=>n?`"${e}" zaten eklendi.`:`"${e}" is already added.`}}function gt(t,n=[],e=""){const i=R(t),o=(n||[]).map(s=>String(s||"").trim()).filter(Boolean),r=o.length?`

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
{ "is_subscription": true|false, "display_name": "string or null", "category": "string or null", "reason": "string" }`}async function Mt(t,n=[],e="en",i=""){const o=ft(e),r=String(t||"").trim();if(!r)return{error:o.empty};if(yt(r))return{error:o.url};const s=r.toLowerCase();if((n||[]).some(m=>String(m||"").trim().toLowerCase()===s))return{error:o.dup(r)};const a=we(r);if(a){const m=ae(r);return(n||[]).some(f=>String(f||"").trim().toLowerCase()===m.toLowerCase())?{error:o.dup(m)}:{displayName:m,category:a}}let h;try{h=await I({system:gt(e,n,i),user:JSON.stringify({input:r}),maxOutputTokens:512})}catch{return{error:o.failed}}const d=(h==null?void 0:h.is_subscription)===!0,p=ae((h==null?void 0:h.display_name)||r),c=ht(h==null?void 0:h.category);return!d||!p||!c?{error:o.notSub}:(n||[]).some(m=>String(m||"").trim().toLowerCase()===p.toLowerCase())?{error:o.dup(p)}:{displayName:p,category:c}}function wt(t,{feature:n,cost:e,balance:i,lang:o}){const r=String(o||"en").slice(0,2).toLowerCase(),s=te(e??Oe(n),r),a=te(i??0,r);return r==="tr"?t==="AUTH_REQUIRED"?`Bu AI özelliği için giriş yapmalısın. İşlem ücreti: ${s} Qor Coin.`:t==="QUIZ_REQUIRED"?"AI özellikleri için önce profil quizini tamamlamalısın. Seni quiz sayfasına yönlendiriyorum.":t==="INSUFFICIENT_QOR_COINS"?`Qor Coin bakiyen yetersiz — analiz başlatılmadı. Bu işlem ${s} Qor Coin, bakiyen ${a}. Sınırsız AI için Premium'a geçebilirsin.`:"AI erişimi hazırlanamadı. Lütfen tekrar dene.":t==="AUTH_REQUIRED"?`Sign in to use this AI feature. Cost: ${s} Qor Coin.`:t==="QUIZ_REQUIRED"?"Complete the profile quiz first. Sending you to the quiz page.":t==="INSUFFICIENT_QOR_COINS"?`Not enough Qor Coin — the analysis was not started. This costs ${s} and your balance is ${a}. You can go Premium for unlimited AI.`:"AI access could not be prepared. Please try again."}function zt(t="en"){const{user:n,openAuth:e}=Re(),i=Ce(),o=Le();return $e.useCallback(async(r,s={})=>{const a=s.requireQuiz!==!1,h=(d,p={})=>{var m;const c=wt(d,{feature:r,lang:t,cost:p.cost,balance:p.balance});return(m=s.onMessage)==null||m.call(s,c,d),c};if(!n){const d=h("AUTH_REQUIRED");return e(),{ok:!1,reason:"AUTH_REQUIRED",message:d}}if(a&&!Ne(n)){const d=h("QUIZ_REQUIRED"),p=`${o.pathname}${o.search}${o.hash}`;return i(`/quiz?required=1&next=${encodeURIComponent(p)}`),{ok:!1,reason:"QUIZ_REQUIRED",message:d}}try{return{ok:!0,...await Ie(r)}}catch(d){const p=(d==null?void 0:d.code)||"AI_ACCESS_ERROR",c=h(p,d);return p==="AUTH_REQUIRED"&&e(),{ok:!1,reason:p,message:c,cost:d==null?void 0:d.cost,balance:d==null?void 0:d.balance}}},[t,o.hash,o.pathname,o.search,i,e,n])}export{Et as a,kt as b,x as c,Be as d,Lt as e,Pt as f,$t as g,Ct as h,Tt as i,At as j,Rt as k,It as l,Ot as m,we as n,Ut as o,Nt as r,_t as s,zt as u,Mt as v};
