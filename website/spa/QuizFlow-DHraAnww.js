import{r as T,q as Y,i as j,a7 as o,aS as V}from"./index-DvjKLPQ8.js";import{d as A}from"./vendor-Mg1MKsk6.js";const H={en:"English",tr:"Turkish",de:"German",fr:"French",es:"Spanish",pt:"Portuguese",it:"Italian",ja:"Japanese",ko:"Korean",zh:"Chinese",ar:"Arabic",ru:"Russian",hi:"Hindi",nl:"Dutch",pl:"Polish",sv:"Swedish"};function E(e){return H[String(e||"en").slice(0,2).toLowerCase()]||"English"}function $(e){const t=String(e||"en").slice(0,2).toLowerCase();return t==="tr"?["Kullanım Uyumu","Performans","Kalite Uyumu","Özellik Seti","Ergonomi ve Taşınabilirlik","Güvenilirlik ve Risk","Topluluk Sinyali","Uzun Vadeli Değer"]:t==="de"?["Nutzungsfit","Leistung","Qualitätsfit","Funktionsumfang","Ergonomie und Mobilität","Zuverlässigkeit und Risiko","Community-Signal","Langzeitwert"]:["Usage Fit","Performance","Quality Fit","Feature Set","Ergonomics and Portability","Reliability and Risk","Community Signal","Long-term Value"]}function U(e){const t=String(e||"en").slice(0,2).toLowerCase();return t==="tr"?[{key:"usage_fit",label:"Kullanım Uyumu",emoji:"🎯"},{key:"content_match",label:"İçerik Uyumu",emoji:"🎬"},{key:"feature_depth",label:"Özellik Derinliği",emoji:"🧩"},{key:"ecosystem_fit",label:"Ekosistem Uyumu",emoji:"🔗"},{key:"lifestyle_match",label:"Yaşam Tarzı Uyumu",emoji:"🏠"},{key:"community_signal",label:"Topluluk Sinyali",emoji:"🌐"},{key:"retention_value",label:"Uzun Vadeli Tutma Değeri",emoji:"🚀"},{key:"risk_balance",label:"Risk Dengesi",emoji:"🛡"}]:t==="de"?[{key:"usage_fit",label:"Nutzungsfit",emoji:"🎯"},{key:"content_match",label:"Inhaltsfit",emoji:"🎬"},{key:"feature_depth",label:"Funktionstiefe",emoji:"🧩"},{key:"ecosystem_fit",label:"Ökosystem-Fit",emoji:"🔗"},{key:"lifestyle_match",label:"Lifestyle-Fit",emoji:"🏠"},{key:"community_signal",label:"Community-Signal",emoji:"🌐"},{key:"retention_value",label:"Langzeitbindung",emoji:"🚀"},{key:"risk_balance",label:"Risikobalance",emoji:"🛡"}]:[{key:"usage_fit",label:"Usage Fit",emoji:"🎯"},{key:"content_match",label:"Content Match",emoji:"🎬"},{key:"feature_depth",label:"Feature Depth",emoji:"🧩"},{key:"ecosystem_fit",label:"Ecosystem Fit",emoji:"🔗"},{key:"lifestyle_match",label:"Lifestyle Match",emoji:"🏠"},{key:"community_signal",label:"Community Signal",emoji:"🌐"},{key:"retention_value",label:"Long-term Retention",emoji:"🚀"},{key:"risk_balance",label:"Risk Balance",emoji:"🛡"}]}function K(e){const t=E(e);return`You are Qor AI's link analysis engine. You receive a product URL, optional metadata, optional web research data, and a user profile. Your job is to identify the EXACT product and analyze it for the user.

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
}`}function W(e){try{const t=new URL(e),i=t.pathname.split("/").map(s=>s.trim()).filter(Boolean);let n="";if(/amazon\./i.test(t.hostname)){const s=i.findIndex(l=>/^(dp|product)$/i.test(l));s>0&&(n=i[s-1])}const r=/^(p|dp|pd|gp|aw|d|product|urun|item|ref|ref=.*|psc=.*|qid=.*|sr=.*)$/i,a=/^(?:[a-z0-9]{10}|[a-f0-9]{16,}|[0-9]{8,})$/i,d=/^(ref[=_-]|sr[=_-]|qid[=_-]|psc[=_-])/i;return n||(n=[...i].reverse().find(s=>/[a-z]/i.test(s)&&!r.test(s)&&!a.test(s)&&!d.test(s))||""),n||(n=[...i].reverse().find(s=>/[a-z]/i.test(s)&&!r.test(s))||""),n=n.replace(/\.(html?|php|aspx?)$/i,"").replace(/[-_]+/g," "),n=n.replace(/\b(p|dp|pd|product|urun|item|ref)\b/gi," ").replace(/\s+/g," ").trim(),n.length<3?"":n.replace(/\b\w/g,s=>s.toUpperCase()).slice(0,80)}catch{return""}}function O(e,t){const i=`${e||""} ${t||""}`.toLowerCase();return/(laptop|notebook|macbook|thinkpad|vivobook|zenbook|legion|rog|tuf|omen|victus|ideapad|nebula)/.test(i)?"laptops":/(headphone|headset|kulaklik|earbud|airpods|buds|wh-|quietcomfort)/.test(i)?"headphones":/(phone|iphone|galaxy|pixel|xiaomi|redmi|smartphone)/.test(i)?"smartphones":/(monitor|display|oled|qled|ultrawide)/.test(i)?"monitors":/(keyboard|mouse|klavye|fare)/.test(i)?"keyboards":/(book|isbn|kindle|kitap)/.test(i)?"books":/(shoe|shirt|dress|jacket|pantolon|ayakkabi|giyim)/.test(i)?"clothing":/(kitchen|vacuum|robot|coffee|airfryer|home|mutfak|ev)/.test(i)?"home-appliances":/(game|gaming|ps5|xbox|switch)/.test(i)?"gaming":"general"}function I({url:e,title:t,siteName:i,language:n}){const r=String(n||"en").slice(0,2).toLowerCase(),a=t||i||e;return r==="tr"?`"${a}" bağlantısı ürün sayfası olarak işlendi. Qor AI ürün adını bağlantı ve site bilgisinden çıkardı; canlı sayfa verisi alınamadığında değerlendirme, ürün adı/kategori sinyalleri ve profil cevapların üzerinden hazırlanır. Satın almadan önce satıcı sayfasındaki güncel fiyat, garanti ve teknik özellikleri de kontrol et.`:r==="de"?`"${a}" wurde als Produktlink verarbeitet. Qor AI hat das Produkt aus der URL und dem Shop-Signal erkannt; wenn keine Live-Seitendaten verfügbar sind, wird die Empfehlung aus Titel, Kategorie-Signalen und deinen Antworten erstellt. Prüfe vor dem Kauf trotzdem den aktuellen Preis, die Garantie und die technischen Daten auf der Verkäuferseite.`:`"${a}" was processed as a product link. Qor AI identified it from the URL and store signal; when live page data is unavailable, the recommendation is built from the title, category signals, and your answers. Check the seller page for current price, warranty, and specs before buying.`}const J=["quora.com","reddit.com","youtube.com","youtu.be","twitter.com","x.com","facebook.com","fb.com","fb.watch","instagram.com","tiktok.com","threads.net","wikipedia.org","fandom.com","medium.com","substack.com","linkedin.com","pinterest.com","github.com","gitlab.com","stackoverflow.com","stackexchange.com","google.com","bing.com","duckduckgo.com","yahoo.com","yandex.com","whatsapp.com","t.me","telegram.org","discord.com","discord.gg","twitch.tv","spotify.com","soundcloud.com","netflix.com","wikihow.com"];function X(e){let t;try{t=new URL(e)}catch{return!1}const i=t.hostname.replace(/^www\./,"").toLowerCase();return!(J.some(r=>i===r||i.endsWith("."+r))||!t.pathname.replace(/\/+$/,"")&&!t.search)}async function xe(e,t,i={}){const n=W(e);let r="";try{r=new URL(e).hostname.replace(/^www\./,"")}catch{}if(!X(e))return{url:e,title:n||r||e,score:0,analysis:"",category:"",siteName:r,price:null,isProduct:!1};let a="";if(!n||n.length<4||/amazon\./i.test(r))try{const y=`Identify the EXACT product sold at this URL using Google Search.
URL: ${e}
`+(n?`Possible title from URL slug: ${n}
`:"")+(r?`Store: ${r}
`:"")+"Return the exact product name (brand + model + key variant), its category, and the current price with currency if visible. If you cannot confirm ONE specific product, say so explicitly — do not guess.";a=await Y(y,{language:t,maxOutputTokens:768,timeoutMs:25e3})}catch{}let s=null;try{const y={url:e,productMetadata:n?{title:n,siteName:r}:{siteName:r},userProfile:i};a&&(y.webResearch=a),s=await T({system:await j("gemini_link_analysis_system",K(t)),user:JSON.stringify(y),maxOutputTokens:1536})}catch{s={title:n||r||e,score:60,analysis:I({url:e,title:n,siteName:r,language:t}),category:O(e,n),site_name:r,price:null,is_product:!0}}const l=String(s.title||"").trim(),g=!l||/erişim|hata|error|unknown|bilinmeyen/i.test(l)?n||l||r||e:l;return{url:e,title:g,score:Number(s.score)||0,analysis:String(s.analysis||I({url:e,title:g,siteName:r,language:t})),category:String(s.category||O(e,g)).toLowerCase(),siteName:String(s.site_name||r||""),price:s.price||null,isProduct:s.is_product!==!1}}const Z=["laptops","smartphones","tablets","cameras","camera_lenses","monitors","headphones","gaming","gaming_consoles","tvs","desktops","smartwatches","drones","av_receivers","cpus","gpus"];function M(e){const t=String(e||"").toLowerCase().trim().replace(/[\s-]+/g,"_");return t?Z.some(i=>t===i||t.includes(i)||i.includes(t)):!1}function ee(e){return M(e)?6:5}function te(e){const t=Array.isArray(e)?e:[];return t.length>=3||t.some(i=>M(i==null?void 0:i.category))?6:5}function ne(e){return(Array.isArray(e)?e.length:0)>1?6:5}function ie(e,t=5){const i=E(e),n=t-2;return`You are Qor AI's product quiz engine. Generate a focused personalized quiz
of EXACTLY ${t} questions to understand the user's needs for a specific product category.
Pick only the ${t} most decisive, highest-signal questions — the ones whose answers most
change whether this product is the right fit. No filler, no nice-to-have questions.

OUTPUT LANGUAGE — HARD REQUIREMENT: Write EVERY question and EVERY option in ${i}, and ONLY ${i}. This is the site's selected language and overrides everything else: even if the product name, specs, category, or user profile are written in another language, the quiz itself is still written in ${i}. Never mirror the language of the product context. Only official brand/product/model names and universal technical terms (RTX, USB-C, Wi-Fi…) may stay as-is.

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
- ALL text must be in ${i}

PERSONALIZATION (read the userProfile JSON in the user message):
- This quiz is about THIS PRODUCT CATEGORY first. The clear majority of questions (at least ${n} of the ${t}) MUST be neutral, category-driven usage scenarios that ANY buyer of this product could relate to. Do NOT bend the scenarios around the user's job or hobby.
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
}`}async function ze({category:e,productTitle:t,url:i,language:n,userProfile:r={}}){const a=ee(e),d=await T({system:ie(n,a),user:JSON.stringify({category:e,productTitle:t,url:i,userProfile:r}),maxOutputTokens:3072});return(Array.isArray(d.questions)?d.questions:[]).map((l,u)=>({id:`q${u}`,text:String(l.question||""),options:Array.isArray(l.options)?l.options.map(String):[]})).filter(l=>l.text&&l.options.length>=2).slice(0,a)}function re(e,t=5){const i=E(e),n=t-2;return`You are Qor AI's comparison quiz engine. Generate a focused, high-signal quiz
of EXACTLY ${t} questions that helps choose between multiple product links. Pick only the
${t} most decisive trade-offs — the ones whose answers most change which product wins.
No filler questions.

OUTPUT LANGUAGE — HARD REQUIREMENT: Write EVERY question and EVERY option in ${i}, and ONLY ${i}. This is the site's selected language and overrides everything else: even if the product names, specs, categories, or user profile are in another language, the quiz itself is still written in ${i}. Never mirror the language of the product context. Only official brand/product/model names and universal technical terms (RTX, USB-C, Wi-Fi…) may stay as-is.

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
- ALL text must be in ${i}

PERSONALIZATION (read the userProfile JSON in the user message):
- This quiz is about choosing between THESE PRODUCTS first. The clear majority of questions (at least ${n} of the ${t}) MUST be neutral, category-driven trade-off scenarios that ANY buyer comparing these products could relate to. Do NOT bend the scenarios around the user's job or hobby.
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
}`}async function Ne({products:e,language:t,userProfile:i={}}){const n=te(e),r=await T({system:re(t,n),user:JSON.stringify({products:(e||[]).map(a=>({title:a.title,url:a.url,category:a.category,initialScore:a.score,initialAnalysis:a.analysis})),userProfile:i}),maxOutputTokens:8192});return(Array.isArray(r.questions)?r.questions:[]).map((a,d)=>({id:`cq${d}`,text:String(a.question||""),options:Array.isArray(a.options)?a.options.map(String):[]})).filter(a=>a.text&&a.options.length>=2).slice(0,n)}function ae(e,t,i,n=5){const r=E(i);return`You are Qor AI's subscription quiz engine. Generate a focused personalized quiz
of EXACTLY ${n} questions to understand the user's needs for: ${e}. Pick only the ${n} most
decisive, highest-signal questions — the ones whose answers most change which service fits
this person best. No filler, no nice-to-have questions.

OUTPUT LANGUAGE — HARD REQUIREMENT: Write EVERY question and EVERY option in ${r}, and ONLY ${r}. This is the site's selected language and overrides everything else: even if the service names or user profile are in another language, the quiz itself is still written in ${r}. Never mirror the language of the context. Only official brand/service names may stay as-is.

The goal: understand how the user uses ${t?"these services":"this service"},
their specific habits, preferences, and expectations.

Rules:
- Each question is a vivid everyday-life mini-scene of about 28-45 words (one rich sentence, or two short ones): set a relatable real-life moment with a little concrete detail, then ask. Make it noticeably longer and more descriptive than a one-liner, yet still natural and easy to read — never a dry label and never a dense paragraph.
- Ask EXACTLY ${n} questions — no more, no fewer — the ${n} most decisive ones that determine which service fits best, whether analysing one service or comparing several.
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
}`}async function Te({subscriptionNames:e,language:t,userProfile:i={}}){const n=e.length>1,r=ne(e),a=await T({system:ae(e.join(", "),n,t,r),user:JSON.stringify({subscriptions:e,mode:n?"compare":"single",userProfile:i}),maxOutputTokens:8192});return(Array.isArray(a.questions)?a.questions:[]).map((s,l)=>({id:`sq${l}`,text:String(s.question||""),options:Array.isArray(s.options)?s.options.map(String):[]})).filter(s=>s.text&&s.options.length>=2).slice(0,r)}function se(e){const t=E(e),i=String(e||"").slice(0,2)==="tr",n=String(e||"").slice(0,2)==="de",r=i?"Kullanım Uyumu":n?"Nutzungsfit":"Usage Fit",a=i?"Bütçe Uyumu":n?"Budget-Fit":"Budget Match",d=i?"Kalite Uyumu":n?"Qualitätsfit":"Quality Fit",s=i?"Uzun Vadeli Değer":n?"Langzeitwert":"Long-term Value";return`You are Qor AI's senior product analyst. Given a product, quiz answers, and user profile, produce a comprehensive, professional, highly detailed personalized match report.

LANGUAGE: Write ALL text in ${t}. Factor labels must also be in ${t}.

CRITICAL — CATEGORY-AWARE ANALYSIS:
- The product can be ANY category: tech, books, clothing, home, sports, beauty, etc.
- For TECH products: analyze specs deeply — cite performance numbers, thermal behavior, software longevity, benchmark context.
- For BOOKS: discuss writing quality, pacing, reader reception, author credentials, genre positioning.
- For CLOTHING/HOME: discuss material science, build quality, brand heritage, durability.
- NEVER force tech terminology onto non-tech products.
- Adapt factor meanings and labels to the product category:
  • "${d}" = build/material/content quality (as appropriate)
  • "${s}" = durability/longevity/re-read value (as appropriate)

SCORING RULES:
- Score must reflect how well THIS SPECIFIC product matches THIS SPECIFIC user's exact needs.
- Scores MUST be realistic and differentiated. Never give identical scores.
- Poor match: 20-45. Average: 46-65. Good: 66-80. Excellent: 81-95.
- ANTI-INFLATION (critical): do NOT cluster scores near the top. Use the FULL range honestly. Every real product has genuine weak spots — AT LEAST 2 of the factor scores MUST fall below 65, and at least one below 55, unless this is a rare near-flawless fit for THIS user. Reserve 85+ only for true standout strengths, never as a default. If most factors land in 75-95 you are inflating — spread them out and score weak areas honestly. The enhancedScore must reflect this honest spread, not drift upward.

WRITING QUALITY REQUIREMENTS:
- Use professional, tech-journalist level language. Be specific, not generic — but SHORT. A human reads this at a glance; every sentence must earn its place.
- Cite actual specs, community observations, or market context wherever possible.
- verdict must be EXACTLY 2 short paragraphs, ~90 words total.
- personaAnalysis must be 2 short paragraphs, ~70 words total, personalized to quiz answers.
- communityAnalysis must be 2 short paragraphs, ~70 words total; one paragraph MUST plainly state the most-reported complaints and negatives — a positives-only summary is forbidden.
- prosForUser and consForUser must be concise, specific bullet points.

Return valid JSON (all text in ${t}):
{
  "enhancedScore": <0-100>,
  "factors": [
    {"label": "${r}", "score": <0-100>, "emoji": "🎯"},
    {"label": "${a}", "score": <0-100>, "emoji": "💰"},
    {"label": "${d}", "score": <0-100>, "emoji": "⭐"},
    {"label": "${i?"Özellik Seti":n?"Funktionsumfang":"Feature Set"}", "score": <0-100>, "emoji": "🧩"},
    {"label": "${i?"Güvenilirlik ve Risk":n?"Zuverlässigkeit und Risiko":"Reliability and Risk"}", "score": <0-100>, "emoji": "🛡"},
    {"label": "${i?"Topluluk Sinyali":n?"Community-Signal":"Community Signal"}", "score": <0-100>, "emoji": "🌐"},
    {"label": "${s}", "score": <0-100>, "emoji": "🚀"},
    {"label": "${i?"Yaşam Tarzı Uyumu":n?"Lifestyle-Fit":"Lifestyle Match"}", "score": <0-100>, "emoji": "🏠"}
  ],
  "verdict": "EXACTLY 2 short paragraphs (~90 words total) in ${t}: the product story and the value/ownership picture. Be specific with actual product characteristics. NO user attribute lists.",
  "prosForUser": ["Concise pro 1 citing a specific product trait", "Concise pro 2 with performance context", "Concise pro 3", "Concise pro 4 (3-4 items total)"],
  "consForUser": ["Concise con 1 with real-world impact", "Concise con 2 with severity context", "Concise con 3 (exactly 3 items)"],
  "alternatives": ["Full model name of alternative 1", "Full model name of alternative 2", "Full model name of alternative 3"],
  "personaScore": <0-100>,
  "personaAnalysis": "2 short paragraphs (~70 words total) in ${t} — how this product fits the user's lifestyle and needs from quiz answers. Reference specific quiz answers. Be concrete. NEVER list user attributes by name.",
  "communityScore": <0-100>,
  "communityAnalysis": "2 short paragraphs (~70 words total) in ${t} — synthesis of community opinion. One paragraph covers reception/praise; the other MUST plainly state the most common complaints, recurring criticisms and defects users actually report — do not soften or bury them. Reference known sources (Reddit, YouTube, review sites). IGNORE user profile.",
  "sentimentBreakdown": {"positive": <int>, "neutral": <int>, "negative": <int>},
  "overallVerdict": "1 short paragraph in ${t} plus ONE final decisive sentence that clearly says buy, consider, or skip (with a concrete alternative if skip). NEVER mention user attributes by name."
}

sentimentBreakdown = the community sentiment split as integer percentages summing to ~100; keep it realistic (never all-positive) and consistent with communityAnalysis.`}function S(e){if(typeof e=="number")return e;const t=parseFloat(String(e||"").replace(",","."));return Number.isFinite(t)?t:0}function F(e){if(!e||typeof e!="object")return null;const t=Math.max(0,Math.round(S(e.positive))),i=Math.max(0,Math.round(S(e.neutral))),n=Math.max(0,Math.round(S(e.negative)));return t+i+n<=0?null:{positive:t,neutral:i,negative:n}}async function Ee({base:e,answers:t,language:i,userProfile:n={}}){const r=t.filter(l=>l.answer!=null).map(l=>({question:l.question,answer:l.answer})),a=await T({system:await j("gemini_enhanced_link_analysis_system",se(i)),user:JSON.stringify({product:{url:e.url,title:e.title,category:e.category,initialScore:e.score,initialAnalysis:e.analysis},quizAnswers:r,userProfile:n}),maxOutputTokens:8192}),d=(Array.isArray(a.factors)?a.factors:[]).map(l=>({label:String(l.label||l.name||""),score:S(l.score??l.value),emoji:String(l.emoji||l.icon||"📊")})).filter(l=>l.label),s=S(a.enhancedScore??a.enhanced_score??a.score);return{base:e,enhancedScore:s>0?s:e.score,factors:d,verdict:String(a.verdict||a.detailed_verdict||a.analysis||e.analysis||""),prosForUser:Array.isArray(a.prosForUser||a.pros)?(a.prosForUser||a.pros).map(String):[],consForUser:Array.isArray(a.consForUser||a.cons)?(a.consForUser||a.cons).map(String):[],alternatives:Array.isArray(a.alternatives)?a.alternatives.map(String):[],personaScore:S(a.personaScore)||null,personaAnalysis:a.personaAnalysis?String(a.personaAnalysis):"",communityScore:S(a.communityScore)||null,communityAnalysis:a.communityAnalysis?String(a.communityAnalysis):"",sentimentBreakdown:F(a.sentimentBreakdown||a.sentiment_breakdown),overallVerdict:a.overallVerdict?String(a.overallVerdict):""}}function oe(e){const t=E(e),i=$(e),n=["🎯","⚡","⭐","🧩","🧭","🛡","🌐","🚀"],r=i.map((a,d)=>`        {"label": "${a}", "score": 0, "emoji": "${n[d]||"📊"}", "detail": "1 sentence"}`).join(`,
`);return`You are Qor AI's senior product comparison analyst.

LANGUAGE: Write ALL text fields in ${t}. Keep official product names as-is.

You will receive exact products identified from pasted URLs and the user's comparison quiz answers.

Rules:
- Never replace the products with nearby models.
- Use the exact product titles and URLs given to you.
- Give a detailed, app-style comparison; do not write a short chat answer.
- Blend quiz answers into the recommendation.
- If one product is clearly better for a certain user type, say that directly.
- Do not invent live prices.
- NEVER paste raw long URLs in text fields. Use product names and site domains only.
- Scores must be realistic, varied, and based on THIS user's quiz answers.
- Every product must have factor scores for: ${i.join(", ")}.

Return ONLY valid JSON with this exact structure:
{
  "winner": {
    "best": "exact product title",
    "reason": "2-3 detailed sentences in ${t}",
    "scoreGap": 0
  },
  "products": [
    {
      "name": "exact product title",
      "url": "exact input url",
      "siteName": "domain or store",
      "score": 0,
      "rank": 1,
      "bestFor": "2 sentences in ${t}",
      "summary": "2-3 sentences in ${t}",
      "pros": ["3 concise bullets in ${t}"],
      "cons": ["3 concise bullets in ${t}"],
      "risks": ["2 ownership/community risks in ${t}"],
      "factors": [
${r}
      ],
      "specHighlights": [
        {"label": "short spec label in ${t}", "value": "short known/inferred value or uncertainty note"}
      ],
      "community": "2 short paragraphs in ${t}"
    }
  ],
  "detailed": {
    "fit": "2 short paragraphs in ${t} comparing quiz-based fit",
    "performance": "2 short paragraphs in ${t} comparing performance/specs",
    "ownership": "2 short paragraphs in ${t} comparing durability, support, community risk",
    "recommendation": "2 short paragraphs in ${t} with clear final decision and alternatives"
  },
  "recommendation": "2-3 sentence final summary in ${t}"
}`}async function Re({bases:e,answers:t,language:i,userProfile:n={}}){var b,z;const r=$(i),a=["🎯","⚡","⭐","🧩","🧭","🛡","🌐","🚀"],d=(t||[]).filter(p=>p.answer!=null).map(p=>({question:p.question,answer:p.answer})),s=await T({system:oe(i),user:JSON.stringify({products:(e||[]).map((p,k)=>({index:k+1,url:p.url,title:p.title,category:p.category,siteName:p.siteName,initialScore:p.score,initialAnalysis:p.analysis})),quizAnswers:d,userProfile:n}),maxOutputTokens:12288}),l=Array.isArray(s.products)?s.products:[],g=((e||[]).length?(e||[]).map((p,k)=>l.find(c=>(c==null?void 0:c.url)&&c.url===p.url)||l[k]||{}):l).map((p,k)=>{const c=(e||[])[k]||{},w=S(p.score)||S(c.score)||50,x=Array.isArray(p.factors)?p.factors.map(f=>({label:String((f==null?void 0:f.label)||""),score:S((f==null?void 0:f.score)??(f==null?void 0:f.value)),emoji:String((f==null?void 0:f.emoji)||"📊"),detail:String((f==null?void 0:f.detail)||"")})).filter(f=>f.label):[],m=x.length?x:r.map((f,C)=>({label:f,score:w,emoji:a[C]||"📊",detail:""})),R=Array.isArray(p.specHighlights)?p.specHighlights.map(f=>({label:String((f==null?void 0:f.label)||""),value:String((f==null?void 0:f.value)||"")})).filter(f=>f.label||f.value):[];return{name:String(p.name||c.title||`Product ${k+1}`),url:String(p.url||c.url||""),siteName:String(p.siteName||c.siteName||""),score:w,rank:S(p.rank)||k+1,bestFor:String(p.bestFor||""),summary:String(p.summary||c.analysis||""),pros:Array.isArray(p.pros)?p.pros.map(String):[],cons:Array.isArray(p.cons)?p.cons.map(String):[],risks:Array.isArray(p.risks)?p.risks.map(String):[],factors:m,specHighlights:R,community:String(p.community||"")}});g.sort((p,k)=>(p.rank||99)-(k.rank||99));const y=s.winner&&typeof s.winner=="object"?{best:String(s.winner.best||((b=g[0])==null?void 0:b.name)||""),reason:String(s.winner.reason||""),scoreGap:S(s.winner.scoreGap)}:{best:((z=g[0])==null?void 0:z.name)||"",reason:"",scoreGap:0},h=s.detailed&&typeof s.detailed=="object"?{fit:String(s.detailed.fit||""),performance:String(s.detailed.performance||""),ownership:String(s.detailed.ownership||""),recommendation:String(s.detailed.recommendation||"")}:null;return{type:"compare_structured",isCompare:!0,bases:e,answers:t,winner:y,products:g,scores:Object.fromEntries(g.map(p=>[p.name,p.score])),detailed:h,recommendation:String(s.recommendation||(h==null?void 0:h.recommendation)||y.reason||"")}}function le(e,t,i,n,r){const a=E(r),s=U(r).map(g=>`        "${g.key}": "integer 0-100 - ${g.label}"`).join(`,
`),l=i?`{
  "subscriptions": {
    "<service_name>": {
      "category": "string - shared subscription category label",
      "rank": "integer starting at 1",
      "compatibility_score": "integer 0-100",
      "compatibility_explanation": "string - 2-3 sentences why this score, personalized to quiz answers",
      "pros": ["concise string", "concise string", "concise string", "optional 4th concise string"],
      "cons": ["concise string", "concise string", "concise string"],
      "risks": ["ownership/churn risk string", "risk string", "optional 3rd risk string"],
      "notable_features": [
        {"label": "short feature label", "value": "short feature detail"}
      ],
      "community_sentiment": "string - 2 short paragraphs of Reddit/forum/reviewer synthesis; one paragraph MUST plainly state the most common complaints and negatives, never only praise",
      "sentiment_breakdown": {"positive": "int", "neutral": "int", "negative": "int"},
      "best_for": "string - 2-3 sentence ideal user type and usage context",
      "factors": {
${s}
      }
    }
  },
  "winner": {
    "best_content": "string - service name",
    "overall": "string - service name",
    "reason": "string - 2-3 detailed sentences",
    "score_gap": "integer score gap between strongest and weakest",
    "recommendation": "string - 2-3 short paragraphs of personalized recommendation explaining WHY, trade-offs and the final decision"
  },
  "detailed_comparison": {
    "service_fit_summary": "string - 2 short paragraphs comparing overall fit",
    "feature_comparison": "string - 2 short paragraphs about feature differences",
    "user_experience": "string - 2 short paragraphs about UX differences",
    "community_and_risk": "string - 2 short paragraphs about review sentiment, churn risk and long-term satisfaction. You MUST clearly state the most common COMPLAINTS and negative points users report (price hikes, missing features, reliability, support, ads) — never a positives-only summary.",
    "final_plan": "string - 2 short paragraphs explaining how the user should use the winning service or combination"
  }
}`:`{
  "subscriptions": {
    "${e}": {
      "category": "string - service category label",
      "rank": 1,
      "compatibility_score": "integer 0-100",
      "compatibility_explanation": "string - 2-3 sentences why this score, personalized to quiz answers",
      "pros": ["concise string", "concise string", "concise string", "optional 4th concise string"],
      "cons": ["concise string", "concise string", "concise string"],
      "risks": ["ownership/churn risk string", "risk string", "optional 3rd risk string"],
      "notable_features": [
        {"label": "short feature label", "value": "short feature detail"}
      ],
      "community_sentiment": "string - 2 short paragraphs of Reddit/forum/reviewer synthesis; one paragraph MUST plainly state the most common complaints and negatives, never only praise",
      "sentiment_breakdown": {"positive": "int", "neutral": "int", "negative": "int"},
      "best_for": "string - 2-3 sentence ideal user type and usage context",
      "factors": {
${s}
      }
    }
  },
  "detailed_comparison": {
    "service_fit_summary": "string - 2 short paragraphs about overall fit",
    "feature_comparison": "string - 2 short paragraphs about features and content/use cases",
    "user_experience": "string - 2 short paragraphs about UX and everyday usage",
    "community_and_risk": "string - 2 short paragraphs about review sentiment, churn risk and long-term satisfaction. You MUST clearly state the most common COMPLAINTS and negative points users report (price hikes, missing features, reliability, support, ads) — never a positives-only summary.",
    "final_plan": "string - 2 short paragraphs explaining how the user should use or evaluate the service"
  },
  "recommendation": "string - 2-3 short paragraphs of personalized recommendation explaining fit, trade-offs and the final decision"
}`,u=n.length?n.map(g=>`- ${g.question}: ${g.answer}`).join(`
`):"- (no quiz answers provided)";return`You are Qor AI's subscription intelligence analyst.
Analyze: ${e}

Quiz Answers:
${u}

CRITICAL RULES:
- ALL text values MUST be in ${a} language
- The "subscriptions" object MUST contain exactly ${t} entries, one for EACH of: ${e}
- You MUST complete ALL ${t} service entries. Do not stop early or truncate.
- compatibility_score must be an integer 0-100 based on how well it fits THIS specific user
- pros must have 3-4 items, cons exactly 3 items, risks 2-3 items — each item one concise sentence
- notable_features must have 4-6 concise items
- factors are 0-100 integers and MUST include every factor key shown in the schema
- ANTI-INFLATION: do NOT cluster factor scores near the top. Each service has real weak spots — at least 2 factors per service should fall below 65, and reserve 85+ only for genuine standout strengths. Differentiate honestly; identical high scores across factors are unrealistic.
- sentiment_breakdown values are integer percentages summing to ~100; keep them realistic (never all-positive) and consistent with community_sentiment
- Be specific and personalized to the quiz answers and the user profile, not generic
- Blend the user's profile, browsing history and quiz answers when scoring
- compatibility_explanation: 2-3 sentences. community_sentiment: 2 short paragraphs
  (complaints stated plainly). best_for: 2 sentences. recommendation: 2-3 short
  paragraphs. detailed_comparison fields: 2 short paragraphs each. Keep it tight —
  finishing the full JSON for ALL services matters more than length.
- NEVER mention price, cost, affordability, monthly fees, yearly fees, discounts, or billing

Return ONLY valid JSON (no markdown fences, no commentary) matching this exact schema:
${l}`}async function Ce({subscriptionNames:e,answers:t,language:i,userProfile:n={}}){var p,k;const r=e.length>1,a=e.join(", "),d=U(i),s=Object.fromEntries(d.map(c=>[c.key,c])),l=(t||[]).filter(c=>c.answer!=null).map(c=>({question:c.question,answer:c.answer})),u=await T({system:await j("gemini_subscription_analysis",le(a,e.length,r,l,i)),user:JSON.stringify({subscriptions:e,mode:r?"compare":"single",userProfile:n}),maxOutputTokens:12288}),g=u.subscriptions&&typeof u.subscriptions=="object"?u.subscriptions:{},y=new Map(Object.entries(g).map(([c,w])=>[String(c).toLowerCase(),{name:c,d:w}])),h=(e||[]).map((c,w)=>{const x=y.get(String(c).toLowerCase())||[...y.values()].find(v=>String(v.name).toLowerCase().includes(String(c).toLowerCase()))||{name:c,d:{}},m=x.d||{},R=S(m==null?void 0:m.compatibility_score)||55,f=m!=null&&m.factors&&typeof m.factors=="object"?Object.entries(m.factors).map(([v,G])=>{const L=s[v]||{};return{key:v,label:L.label||String(v).replace(/_/g," "),emoji:L.emoji||"📊",score:S(G)||R}}):[],C=f.length?f:d.map(v=>({key:v.key,label:v.label,emoji:v.emoji,score:R})),B=Array.isArray(m==null?void 0:m.notable_features)?m.notable_features.map(v=>({label:String((v==null?void 0:v.label)||""),value:String((v==null?void 0:v.value)||"")})).filter(v=>v.label||v.value):[];return{name:String(x.name||c),category:String((m==null?void 0:m.category)||""),score:R,rank:S(m==null?void 0:m.rank)||w+1,explanation:String((m==null?void 0:m.compatibility_explanation)||""),pros:Array.isArray(m==null?void 0:m.pros)?m.pros.map(String):[],cons:Array.isArray(m==null?void 0:m.cons)?m.cons.map(String):[],risks:Array.isArray(m==null?void 0:m.risks)?m.risks.map(String):[],features:B,community:String((m==null?void 0:m.community_sentiment)||""),sentiment:F((m==null?void 0:m.sentiment_breakdown)||(m==null?void 0:m.sentimentBreakdown)),bestFor:String((m==null?void 0:m.best_for)||""),factors:C}}).sort((c,w)=>(c.rank||99)-(w.rank||99)||w.score-c.score),b={};h.forEach(c=>{b[c.name]=c.score});const z=((p=[...h].sort((c,w)=>w.score-c.score)[0])==null?void 0:p.name)||"";return{isCompare:r,services:h,scores:b,winner:u.winner&&typeof u.winner=="object"?{best:String(u.winner.best_content||u.winner.overall||z||""),overall:String(u.winner.overall||""),reason:String(u.winner.reason||""),scoreGap:S(u.winner.score_gap??u.winner.scoreGap),recommendation:String(u.winner.recommendation||"")}:{best:z,overall:z,reason:"",scoreGap:0,recommendation:""},detailed:u.detailed_comparison&&typeof u.detailed_comparison=="object"?{fit:String(u.detailed_comparison.service_fit_summary||""),features:String(u.detailed_comparison.feature_comparison||""),ux:String(u.detailed_comparison.user_experience||""),community:String(u.detailed_comparison.community_and_risk||""),plan:String(u.detailed_comparison.final_plan||"")}:null,recommendation:String(u.recommendation||((k=u==null?void 0:u.winner)==null?void 0:k.recommendation)||"")}}const ce={netflix:"video","disney+":"video","disney plus":"video","amazon prime":"video","prime video":"video",hbo:"video","hbo max":"video",max:"video",hulu:"video","apple tv+":"video","apple tv plus":"video",blutv:"video",exxen:"video",gain:"video",mubi:"video","youtube premium":"video",crunchyroll:"video","bein sports":"video",tod:"video","paramount+":"video","paramount plus":"video",peacock:"video",tabii:"video","tv+":"video",spotify:"music","apple music":"music","youtube music":"music",tidal:"music",deezer:"music","amazon music":"music",fizy:"music",soundcloud:"music","soundcloud go":"music","chatgpt plus":"ai",chatgpt:"ai","claude pro":"ai",claude:"ai",gemini:"ai","gemini advanced":"ai",perplexity:"ai",midjourney:"ai",copilot:"ai","microsoft copilot":"ai",grok:"ai",deepseek:"ai",poe:"ai",icloud:"cloud","icloud+":"cloud","google one":"cloud",dropbox:"cloud",onedrive:"cloud",pcloud:"cloud",mega:"cloud","adobe creative cloud":"productivity",canva:"productivity",figma:"productivity","microsoft 365":"productivity","office 365":"productivity",notion:"productivity","google workspace":"productivity",hostinger:"other","xbox game pass":"gaming","playstation plus":"gaming","ps plus":"gaming","ea play":"gaming","geforce now":"gaming","nintendo switch online":"gaming","ubisoft+":"gaming","apple arcade":"gaming"};function Q(e){return ce[String(e||"").trim().toLowerCase()]||null}const ue={"video-streaming":"video","music-streaming":"music",gaming:"gaming","ai-tools":"ai","cloud-storage":"cloud",productivity:"productivity",bundles:"bundles",news:"news",fitness:"fitness",education:"education",other:"other"};function de(e){const t=String(e||"").trim().toLowerCase();return ue[t]||t||null}function je(e){const t=e.map(Q).filter(Boolean);return[...new Set(t)].length>1}const me={netflix:"Netflix","disney+":"Disney+","disney plus":"Disney+","amazon prime":"Amazon Prime","prime video":"Amazon Prime","amazon prime video":"Amazon Prime",hbo:"HBO","hbo max":"HBO Max",max:"Max",hulu:"Hulu","apple tv+":"Apple TV+","apple tv plus":"Apple TV+",blutv:"BluTV",exxen:"Exxen",exen:"Exxen",gain:"Gain",mubi:"MUBI","youtube premium":"YouTube Premium","yt premium":"YouTube Premium",crunchyroll:"Crunchyroll","bein sports":"beIN Sports",tod:"TOD","paramount+":"Paramount+","paramount plus":"Paramount+",peacock:"Peacock",tabii:"Tabii","tv+":"Apple TV+",spotify:"Spotify","apple music":"Apple Music","youtube music":"YouTube Music","yt music":"YouTube Music",tidal:"Tidal",deezer:"Deezer","amazon music":"Amazon Music",fizy:"Fizy",soundcloud:"SoundCloud","soundcloud go":"SoundCloud Go","chatgpt plus":"ChatGPT Plus",chatgpt:"ChatGPT Plus","claude pro":"Claude Pro",claude:"Claude Pro",gemini:"Gemini Advanced","gemini advanced":"Gemini Advanced",perplexity:"Perplexity",midjourney:"Midjourney",copilot:"Microsoft Copilot","microsoft copilot":"Microsoft Copilot",grok:"Grok",deepseek:"DeepSeek",poe:"Poe",icloud:"iCloud+","icloud+":"iCloud+","google one":"Google One",dropbox:"Dropbox",onedrive:"OneDrive",pcloud:"pCloud",mega:"MEGA","adobe creative cloud":"Adobe Creative Cloud",canva:"Canva","microsoft 365":"Microsoft 365","office 365":"Microsoft 365",notion:"Notion","google workspace":"Google Workspace",hostinger:"Hostinger","xbox game pass":"Xbox Game Pass","playstation plus":"PlayStation Plus","ps plus":"PlayStation Plus","ea play":"EA Play","geforce now":"GeForce Now","nintendo switch online":"Nintendo Switch Online","ubisoft+":"Ubisoft+","apple arcade":"Apple Arcade"};function pe(e){const t=String(e||"").trim().toLowerCase();return t.includes("http://")||t.includes("https://")||t.includes("www.")||/\.[a-z]{2,}(\/|$)/.test(t)}function _(e){const t=String(e||"").trim().replace(/\s+/g," "),i=me[t.toLowerCase()];return i||t.replace(/\b\w/g,n=>n.toUpperCase())}function he(e){const t=String(e||"").slice(0,2)==="tr",i=String(e||"").slice(0,2)==="de";return{empty:t?"Lütfen en az bir abonelik adı girin.":i?"Bitte gib mindestens einen Abo-Namen ein.":"Please enter at least one subscription name.",url:t?"Buraya yalnızca abonelik adı girebilirsin — link kabul edilmez.":i?"Hier sind nur Abo-Namen erlaubt — keine Links.":"Only subscription names are accepted here — links are not allowed.",notSub:t?"Bu metin bir abonelik servisine benzemiyor. Lütfen Netflix, Spotify gibi bir servis adı yaz.":i?"Das sieht nicht nach einem Abo-Dienst aus. Gib einen Namen wie Netflix oder Spotify ein.":"This doesn't look like a subscription service. Please enter a name like Netflix or Spotify.",failed:t?"Abonelik doğrulanırken hata oluştu. Lütfen tekrar deneyin.":i?"Abo konnte nicht geprüft werden. Bitte erneut versuchen.":"Could not validate subscription. Please try again.",dup:n=>t?`"${n}" zaten eklendi.`:i?`"${n}" ist bereits hinzugefügt.`:`"${n}" is already added.`}}function ge(e){return`You are Qor AI's subscription validation engine.
Decide whether the input below is a real digital subscription/service OR a real paid digital app, software or platform a person can subscribe to or pay for.

ACCEPT (is_subscription = true):
- Streaming, music, gaming, AI tools, cloud storage, news, fitness, education services.
- Paid digital software/apps and professional/creative tools — e.g. Adobe, Photoshop, Premiere Pro, Canva, Figma, DaVinci Resolve, Final Cut, Microsoft 365, Notion, ChatGPT Plus, Xbox Game Pass.
- If the input is an obvious typo of a known service, normalize it.

REJECT (is_subscription = false):
- Random/gibberish text, profanity, and generic everyday words.
- Physical products and hardware (phones, cars, food, devices like IQOS).
- Links/URLs and unrelated text.

Category — choose exactly one: video-streaming, music-streaming, gaming, ai-tools, cloud-storage, productivity, bundles, news, fitness, education, other.
Put ALL design / creative / video-editing / professional software under "productivity" (so Adobe, Canva, Figma, DaVinci Resolve group together).
"display_name" must be the clean branded service name. "reason" must be short and in ${E(e)}.

Return ONLY valid JSON:
{ "is_subscription": true|false, "display_name": "string or null", "category": "string or null", "reason": "string" }`}async function qe(e,t=[],i="en"){const n=he(i),r=String(e||"").trim();if(!r)return{error:n.empty};if(pe(r))return{error:n.url};const a=r.toLowerCase();if((t||[]).some(y=>String(y||"").trim().toLowerCase()===a))return{error:n.dup(r)};const d=Q(r);if(d){const y=_(r);return(t||[]).some(h=>String(h||"").trim().toLowerCase()===y.toLowerCase())?{error:n.dup(y)}:{displayName:y,category:d}}let s;try{s=await T({system:ge(i),user:JSON.stringify({input:r}),maxOutputTokens:512})}catch{return{error:n.failed}}const l=(s==null?void 0:s.is_subscription)===!0,u=_((s==null?void 0:s.display_name)||r),g=de(s==null?void 0:s.category);return!l||!u||!g?{error:n.notSub}:(t||[]).some(y=>String(y||"").trim().toLowerCase()===u.toLowerCase())?{error:n.dup(u)}:{displayName:u,category:g}}const N={strong:"#22c55e",balanced:"#f59e0b",weak:"#f43f5e"};function D(){const[e,t]=A.useState(()=>typeof window<"u"&&typeof window.matchMedia=="function"&&window.matchMedia("(prefers-reduced-motion: reduce)").matches);return A.useEffect(()=>{var r;if(typeof window>"u"||typeof window.matchMedia!="function")return;const i=window.matchMedia("(prefers-reduced-motion: reduce)"),n=a=>t(a.matches);return(r=i.addEventListener)==null||r.call(i,"change",n),()=>{var a;return(a=i.removeEventListener)==null?void 0:a.call(i,"change",n)}},[]),e}function q(){const e=D(),[t,i]=A.useState(e);return A.useEffect(()=>{if(e){i(!0);return}let n=0;const r=requestAnimationFrame(()=>{n=requestAnimationFrame(()=>i(!0))});return()=>{cancelAnimationFrame(r),n&&cancelAnimationFrame(n)}},[e]),{drawn:t,reduced:e}}function Le(e,{enabled:t=!0,duration:i=800}={}){const n=D(),r=Number(e)||0,[a,d]=A.useState(t&&!n?0:r);return A.useEffect(()=>{if(!t||n){d(r);return}let s=0;const l=typeof performance<"u"?performance.now():Date.now(),u=g=>{const y=Math.min(1,(g-l)/i),h=1-Math.pow(1-y,3);d(r*h),y<1&&(s=requestAnimationFrame(u))};return s=requestAnimationFrame(u),()=>cancelAnimationFrame(s)},[r,t,n,i]),a}function Oe({pct:e,color:t,gradient:i=!1,delay:n=0}){const{drawn:r,reduced:a}=q(),d=Math.max(0,Math.min(100,Number(e)||0)),s=r?d:0;return o.jsx("i",{style:{width:`${s}%`,background:i?`linear-gradient(90deg, ${t}80, ${t})`:t,transition:a?"none":`width .7s cubic-bezier(.22,.61,.36,1) ${n}ms`}})}function ye(e){const t=Number(e)||0;return t>=70?"buy":t>=50?"consider":"skip"}function Ie({score:e,L:t=i=>i}){const i=ye(e),n=i==="buy"?t("Buy","Al","Kaufen"):i==="consider"?t("Consider","Düşün","Überlegen"):t("Skip","Geç","Überspringen"),r=i==="buy"?"✓":i==="consider"?"~":"✕";return o.jsxs("span",{className:`aic-badge ${i}`,children:[o.jsx("i",{"aria-hidden":"true",children:r}),n]})}function fe(e){const t=Math.max(0,Math.min(100,Math.round(Number(e)||0))),i=t,n=Math.round((100-t)*.65),r=Math.max(0,100-i-n);return{positive:i,neutral:r,negative:n}}function _e(e,t){if(e&&typeof e=="object"){const i=Math.max(0,Math.round(Number(e.positive)||0)),n=Math.max(0,Math.round(Number(e.neutral)||0)),r=Math.max(0,Math.round(Number(e.negative)||0)),a=i+n+r;if(a>0){const d=Math.round(i/a*100),s=Math.round(r/a*100);return{positive:d,negative:s,neutral:Math.max(0,100-d-s)}}}return fe(t)}function be({segments:e=[],centerValue:t="",centerLabel:i="",size:n=128,thickness:r=15}){const{drawn:a,reduced:d}=q(),s=e.map(h=>({label:h.label,value:Math.max(0,Number(h.value)||0),color:h.color})).filter(h=>h.value>0),l=s.reduce((h,b)=>h+b.value,0);if(!l)return null;const u=(n-r)/2,g=2*Math.PI*u;let y=0;return o.jsxs("div",{className:"aic-donut-svg",style:{width:n,height:n},children:[o.jsxs("svg",{width:n,height:n,viewBox:`0 0 ${n} ${n}`,role:"img","aria-label":i||"Donut chart",children:[o.jsx("circle",{cx:n/2,cy:n/2,r:u,fill:"none",stroke:"var(--surface-3)",strokeWidth:r}),o.jsx("g",{transform:`rotate(-90 ${n/2} ${n/2})`,children:s.map((h,b)=>{const z=h.value/l*g,p=y;y+=z;const k=a?z:0;return o.jsx("circle",{cx:n/2,cy:n/2,r:u,fill:"none",stroke:h.color,strokeWidth:r,strokeDasharray:`${k} ${Math.max(0,g-k)}`,strokeDashoffset:-p,style:{transition:d?"none":`stroke-dasharray .8s cubic-bezier(.22,.61,.36,1) ${b*140}ms`}},`${h.label}-${b}`)})})]}),(t!==""||i)&&o.jsxs("div",{className:"aic-donut-center",children:[t!==""&&o.jsx("b",{children:t}),i&&o.jsx("small",{children:i})]})]})}function Pe({breakdown:e,L:t=r=>r,size:i=124,compact:n=!1}){const r=e&&typeof e=="object"?e:null;if(!r)return null;const a=[{label:t("Positive","Olumlu","Positiv"),value:r.positive,color:N.strong},{label:t("Neutral","Nötr","Neutral"),value:r.neutral,color:N.balanced},{label:t("Negative","Olumsuz","Negativ"),value:r.negative,color:N.weak}];return o.jsxs("div",{className:"aic-card aic-sentiment",children:[o.jsxs("div",{className:"aic-card-title",children:["💬 ",t("Community satisfaction","Topluluk memnuniyeti","Community-Zufriedenheit")]}),o.jsxs("div",{className:"aic-donut",children:[o.jsx(be,{segments:a,centerValue:`${Math.round(r.positive)}%`,centerLabel:t("positive","olumlu","positiv"),size:n?96:i,thickness:n?12:15}),o.jsx("div",{className:"aic-legend",children:a.map(d=>o.jsxs("div",{className:"aic-legend-row",children:[o.jsx("i",{style:{background:d.color}}),o.jsx("span",{children:d.label}),o.jsxs("b",{children:[Math.round(d.value),"%"]})]},d.label))})]})]})}function $e(e=[]){let t=0,i=0,n=0;return(Array.isArray(e)?e:[]).forEach(r=>{const a=Number((r==null?void 0:r.score)??(r==null?void 0:r.value))||0;a>=70?t+=1:a>=50?i+=1:n+=1}),{strong:t,balanced:i,weak:n}}function Ue({strong:e=0,balanced:t=0,weak:i=0,L:n=r=>r}){const{drawn:r,reduced:a}=q(),d=e+t+i;if(!d)return null;const s=u=>r?u/d*100:0,l=(u,g,y)=>u>0?o.jsx("i",{style:{width:`${s(u)}%`,background:g,transition:a?"none":`width .7s cubic-bezier(.22,.61,.36,1) ${y}ms`}}):null;return o.jsxs("div",{className:"aic-card aic-dist",children:[o.jsxs("div",{className:"aic-card-title",children:["⚖️ ",n("Factor balance","Faktör dengesi","Faktor-Balance")]}),o.jsxs("div",{className:"aic-dist-track",role:"img","aria-label":n("Factor balance","Faktör dengesi","Faktor-Balance"),children:[l(e,N.strong,0),l(t,N.balanced,120),l(i,N.weak,240)]}),o.jsxs("div",{className:"aic-dist-legend",children:[o.jsxs("span",{children:[o.jsx("i",{style:{background:N.strong}}),e," ",n("strong","güçlü","stark")]}),o.jsxs("span",{children:[o.jsx("i",{style:{background:N.balanced}}),t," ",n("balanced","dengeli","ausgewogen")]}),o.jsxs("span",{children:[o.jsx("i",{style:{background:N.weak}}),i," ",n("weak","zayıf","schwach")]})]})]})}function Me({label:e,children:t,defaultOpen:i=!1,className:n=""}){const[r,a]=A.useState(i);return o.jsxs("div",{className:`aic-collapse${r?" open":""}${n?` ${n}`:""}`,children:[o.jsxs("button",{type:"button",className:"aic-collapse-btn","aria-expanded":r,onClick:()=>a(d=>!d),children:[o.jsx("span",{children:e}),o.jsx("svg",{className:"aic-chev",viewBox:"0 0 24 24",width:"18",height:"18",fill:"none",stroke:"currentColor",strokeWidth:"2.4",strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":"true",children:o.jsx("polyline",{points:"6 9 12 15 18 9"})})]}),r&&o.jsx("div",{className:"aic-collapse-body",children:t})]})}function Fe(e,t=1){const i=String(e||"").replace(/\s+/g," ").trim();if(!i)return"";const n=i.split(new RegExp("(?<=[.!?])\\s+")).filter(Boolean);return n.length?n.slice(0,t).join(" "):i}function we(e){if(!e)return;const t=document.querySelector(".appbar"),i=(t?t.getBoundingClientRect().height:60)+14,n=window.scrollY+e.getBoundingClientRect().top-i;window.scrollTo({top:Math.max(0,n),behavior:"smooth"})}const P={quizProduct:{title:["Preparing your quiz","Quiz hazırlanıyor","Quiz wird vorbereitet"],detail:["Questions are tuned to this product, not a generic profile form.","Sorular genel profil formu değil, bu ürüne göre hazırlanıyor.","Die Fragen werden auf dieses Produkt zugeschnitten."],steps:[["Locking the product context","Ürün bağlamı sabitleniyor","Produktkontext wird fixiert"],["Mapping usage scenarios","Kullanım senaryoları çıkarılıyor","Nutzungsszenarien werden abgebildet"],["Writing category-specific questions","Kategoriye özel sorular yazılıyor","Kategoriespezifische Fragen werden erstellt"],["Balancing the answer choices","Cevap seçenekleri dengeleniyor","Antwortoptionen werden ausbalanciert"]]},quizCompare:{title:["Preparing your quiz","Quiz hazırlanıyor","Quiz wird vorbereitet"],detail:["Questions are built from the products in your comparison, not a generic form.","Sorular karşılaştırmandaki ürünlerden üretiliyor, genel form değil.","Die Fragen entstehen aus den verglichenen Produkten."],steps:[["Reading the selected products","Seçili ürünler okunuyor","Ausgewählte Produkte werden gelesen"],["Finding the real differences","Gerçek farklar bulunuyor","Reale Unterschiede werden gesucht"],["Writing comparison scenarios","Karşılaştırma senaryoları yazılıyor","Vergleichsszenarien werden erstellt"],["Balancing the answer choices","Cevap seçenekleri dengeleniyor","Antwortoptionen werden ausbalanciert"]]},product:{title:["Building your report","Raporun hazırlanıyor","Bericht wird erstellt"],detail:["Qor AI turns your answers into a personal match report.","Qor AI cevaplarını kişisel eşleşme raporuna çeviriyor.","Qor AI macht aus deinen Antworten einen persönlichen Match-Bericht."],steps:[["Reading catalog specs","Katalog özellikleri okunuyor","Katalogdaten werden gelesen"],["Applying your profile & answers","Profilin ve cevapların uygulanıyor","Profil & Antworten werden angewendet"],["Running current web research","Güncel web araştırması yapılıyor","Aktuelle Webrecherche läuft"],["Scoring match factors","Uyum faktörleri puanlanıyor","Match-Faktoren werden bewertet"],["Checking alternatives and price timing","Alternatifler ve fiyat zamanlaması kontrol ediliyor","Alternativen und Preis-Timing werden geprüft"],["Composing the final report","Son rapor hazırlanıyor","Der Bericht wird zusammengestellt"]]},compare:{title:["Building the comparison","Karşılaştırma hazırlanıyor","Vergleich wird erstellt"],detail:["Qor AI scores every product for your real use, then picks a winner.","Qor AI her ürünü gerçek kullanımına göre puanlayıp bir kazanan seçiyor.","Qor AI bewertet jedes Produkt und wählt einen Sieger."],steps:[["Reading the selected products","Seçili ürünler okunuyor","Ausgewählte Produkte werden gelesen"],["Applying your profile & answers","Profilin ve cevapların uygulanıyor","Profil & Antworten werden angewendet"],["Running current web research","Güncel web araştırması yapılıyor","Aktuelle Webrecherche läuft"],["Comparing specs head-to-head","Özellikler karşılıklı karşılaştırılıyor","Specs werden direkt verglichen"],["Scoring the best fit for you","Sana en uygunu puanlanıyor","Beste Wahl wird bewertet"],["Composing the verdict","Sonuç hazırlanıyor","Fazit wird erstellt"]]},linkIdentify:{title:["Identifying the product","Ürün tanımlanıyor","Produkt wird erkannt"],detail:["Qor AI reads the URL, store signal, and product slug first.","Qor AI önce URL, mağaza ve ürün adı sinyallerini okuyor.","Qor AI liest zuerst URL, Shop-Signal und Produktslug."],steps:[["Checking the link format","Bağlantı formatı kontrol ediliyor","Linkformat wird geprüft"],["Reading store and product signals","Mağaza ve ürün sinyalleri okunuyor","Shop- und Produktsignale werden gelesen"],["Detecting the category","Kategori algılanıyor","Kategorie wird erkannt"],["Preparing the base analysis","Baz analiz hazırlanıyor","Basisanalyse wird vorbereitet"]]},linkQuiz:{title:["Preparing your quiz","Quiz hazırlanıyor","Quiz wird vorbereitet"],detail:["Questions are tuned to this product, not a generic profile form.","Sorular genel profil formu değil, bu ürüne göre hazırlanıyor.","Die Fragen werden auf dieses Produkt zugeschnitten."],steps:[["Product context is locked","Ürün bağlamı sabitlendi","Produktkontext ist fixiert"],["Usage scenarios are mapped","Kullanım senaryoları çıkarılıyor","Nutzungsszenarien werden abgebildet"],["Category-specific questions are written","Kategoriye özel sorular yazılıyor","Kategoriespezifische Fragen werden erstellt"],["Answer choices are balanced","Cevap seçenekleri dengeleniyor","Antwortoptionen werden ausbalanciert"]]},linkAnalyze:{title:["Building your report","Raporun hazırlanıyor","Bericht wird erstellt"],detail:["Qor AI turns your answers into a personal match report.","Qor AI cevaplarını kişisel eşleşme raporuna çeviriyor.","Qor AI macht aus deinen Antworten einen persönlichen Match-Bericht."],steps:[["Reading quiz answers","Quiz cevapları okunuyor","Quizantworten werden gelesen"],["Scoring match factors","Uyum faktörleri puanlanıyor","Match-Faktoren werden bewertet"],["Summarizing reviews and risks","Yorumlar ve riskler özetleniyor","Bewertungen und Risiken werden zusammengefasst"],["Building the final verdict","Son karar hazırlanıyor","Endgültiges Fazit wird erstellt"]]},linkCompare:{title:["Comparing links","Linkler karşılaştırılıyor","Links werden verglichen"],detail:["Qor AI is weighing each product side by side.","Qor AI her ürünü yan yana tartıyor.","Qor AI gewichtet jedes Produkt nebeneinander."],steps:[["Validating product links","Ürün linkleri doğrulanıyor","Produktlinks werden geprüft"],["Identifying each exact product","Her ürün tek tek tanınıyor","Jedes Produkt wird erkannt"],["Weighing strengths and trade-offs","Artılar, eksiler ve farklar tartılıyor","Stärken und Kompromisse werden abgewogen"],["Writing the final recommendation","Nihai öneri yazılıyor","Empfehlung wird geschrieben"]]},subQuiz:{title:["Preparing your subscription quiz","Abonelik quizin hazırlanıyor","Abo-Quiz wird vorbereitet"],detail:["The questions adapt to the selected service type.","Sorular seçilen abonelik türüne göre uyarlanıyor.","Die Fragen passen sich dem Diensttyp an."],steps:[["Reading the selected services","Seçilen abonelikler okunuyor","Ausgewählte Dienste werden gelesen"],["Detecting the service category","Servis kategorisi algılanıyor","Dienstkategorie wird erkannt"],["Mapping usage scenarios","Kullanım senaryoları çıkarılıyor","Nutzungsszenarien werden abgebildet"],["Writing targeted questions","Hedefli sorular yazılıyor","Gezielte Fragen werden erstellt"]]},subAnalyze:{title:["Analyzing subscription","Abonelik analiz ediliyor","Abo wird analysiert"],detail:["Qor AI turns your answers into a detailed match report.","Qor AI cevaplarını detaylı eşleşme raporuna çeviriyor.","Qor AI macht aus deinen Antworten einen Match-Bericht."],steps:[["Reading quiz answers","Quiz cevapları okunuyor","Quizantworten werden gelesen"],["Evaluating content and feature fit","İçerik ve özellik uyumu değerlendiriliyor","Inhalts- und Funktionsfit wird bewertet"],["Reviewing community signals","İnternet yorum sinyalleri değerlendiriliyor","Community-Signale werden bewertet"],["Building the final recommendation","Nihai öneri hazırlanıyor","Empfehlung wird erstellt"]]},subCompare:{title:["Comparing subscriptions","Abonelikler karşılaştırılıyor","Abos werden verglichen"],detail:["Qor AI turns your answers into a detailed match report.","Qor AI cevaplarını detaylı eşleşme raporuna çeviriyor.","Qor AI macht aus deinen Antworten einen Match-Bericht."],steps:[["Reading quiz answers","Quiz cevapları okunuyor","Quizantworten werden gelesen"],["Evaluating content and feature fit","İçerik ve özellik uyumu değerlendiriliyor","Inhalts- und Funktionsfit wird bewertet"],["Reviewing community signals","İnternet yorum sinyalleri değerlendiriliyor","Community-Signale werden bewertet"],["Building the final recommendation","Nihai öneri hazırlanıyor","Empfehlung wird erstellt"]]}},ve={prep:1,research:2,report:99};function Qe({lang:e="en",mode:t="product",stage:i=null}){const n=String(e||"en").slice(0,2).toLowerCase(),r=h=>n==="tr"?h[1]:n==="de"?h[2]:h[0],a=P[t]||P.product,d=a.steps,s=d.length-1,l=i==null?s:Math.min(s,ve[i]??s),[u,g]=A.useState(0),y=A.useRef(null);return A.useEffect(()=>{const h=requestAnimationFrame(()=>we(y.current));return()=>cancelAnimationFrame(h)},[t]),A.useEffect(()=>{g(0)},[t]),A.useEffect(()=>{if(u>=l)return;const h=setTimeout(()=>g(b=>Math.min(l,b+1)),u===0?500:1300);return()=>clearTimeout(h)},[u,l]),o.jsxs("div",{className:"aiwb fade-up",role:"status","aria-live":"polite",ref:y,children:[o.jsxs("div",{className:"aiwb-orb","aria-hidden":"true",children:[o.jsx("span",{className:"aiwb-ring"}),o.jsx("span",{className:"aiwb-core",style:{display:"flex",alignItems:"center",justifyContent:"center"},children:o.jsxs("svg",{viewBox:"0 0 24 24",width:"24",height:"24",fill:"none",stroke:"#fff",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":"true",children:[o.jsx("path",{d:"M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z"}),o.jsx("path",{d:"M18.5 14.5l.8 1.7 1.7.8-1.7.8-.8 1.7-.8-1.7-1.7-.8 1.7-.8.8-1.7z"})]})})]}),o.jsxs("div",{className:"aiwb-copy",children:[o.jsx("strong",{children:r(a.title)}),o.jsx("span",{children:r(a.detail)})]}),o.jsx("div",{className:"aiwb-steps",children:d.map((h,b)=>o.jsxs("div",{className:"aiwb-step"+(b===u?" active":"")+(b<u?" done":""),children:[o.jsx("i",{"aria-hidden":"true",children:b<u?"✓":b+1}),o.jsx("span",{children:r(h)})]},b))})]})}function ke(e){if(!e)return;const t=document.querySelector(".appbar"),i=(t?t.getBoundingClientRect().height:60)+14,n=window.scrollY+e.getBoundingClientRect().top-i;window.scrollTo({top:Math.max(0,n),behavior:"smooth"})}function De({questions:e=[],onSubmit:t,onSkip:i,busy:n=!1,title:r,subtitle:a}){const{lang:d}=V(),s=(c,w,x)=>d==="tr"?w:d==="de"?x:c,[l,u]=A.useState({}),g=A.useRef(null);A.useEffect(()=>{const c=requestAnimationFrame(()=>ke(g.current));return()=>cancelAnimationFrame(c)},[]);const y=A.useMemo(()=>e.filter(c=>l[c.id]!=null).length,[l,e]),h=y===e.length&&e.length>0,b=Math.max(0,e.findIndex(c=>l[c.id]==null)),z=h?e.length-1:b;function p(c,w){u(x=>({...x,[c]:w}))}function k(){!h||n||t(e.map(c=>({question:c.text,answer:l[c.id]??null})))}return e.length?o.jsxs("div",{className:"quiz fade-up",ref:g,children:[o.jsxs("div",{className:"quiz-head",children:[o.jsxs("div",{className:"quiz-head-text",children:[o.jsx("strong",{children:r||s("Quick quiz","Hızlı quiz","Kurzes Quiz")}),o.jsx("span",{children:a||s("Answer a few questions for a personalized analysis.","Kişiselleştirilmiş analiz için birkaç soruyu yanıtla.","Beantworte ein paar Fragen für eine personalisierte Analyse.")})]}),o.jsxs("span",{className:"quiz-progress-pill",children:[y,"/",e.length]})]}),o.jsx("div",{className:"quiz-progress",children:o.jsx("i",{style:{width:`${y/Math.max(1,e.length)*100}%`}})}),o.jsx("div",{className:"quiz-step-map","aria-hidden":"true",children:e.map((c,w)=>o.jsx("span",{className:(l[c.id]!=null?"done ":"")+(w===z?"active":"")},c.id))}),o.jsx("div",{className:"quiz-list",children:e.map((c,w)=>o.jsxs("div",{className:"quiz-q"+(l[c.id]!=null?" done":w===z?" active":""),children:[o.jsxs("h3",{children:[o.jsx("span",{className:"quiz-q-no",children:w+1}),c.text]}),o.jsx("div",{className:"quiz-options",children:c.options.map((x,m)=>o.jsxs("button",{type:"button",className:"quiz-option"+(l[c.id]===x?" on":""),onClick:()=>p(c.id,x),disabled:n,children:[o.jsx("span",{className:"quiz-option-letter",children:String.fromCharCode(65+m)}),o.jsx("span",{className:"quiz-option-tick","aria-hidden":"true"}),o.jsx("span",{children:x})]},x))})]},c.id))}),o.jsxs("div",{className:"quiz-actions",children:[i&&o.jsx("button",{type:"button",className:"btn btn-ghost",onClick:i,disabled:n,children:s("Skip quiz","Quizi atla","Quiz überspringen")}),o.jsx("button",{type:"button",className:"btn btn-primary quiz-submit",onClick:k,disabled:!h||n,children:n?s("Analyzing…","Analiz ediliyor…","Wird analysiert…"):h?s("Analyze","Analiz Et","Analysieren"):s(`Answer all ${e.length} questions`,`${e.length} sorunun hepsini yanıtla`,`Beantworte alle ${e.length} Fragen`)})]})]}):null}export{Qe as A,Oe as B,Me as C,Ie as D,De as Q,Pe as S,Ue as a,be as b,xe as c,Re as d,Ee as e,$e as f,Fe as g,Ne as h,ze as i,Te as j,Q as k,je as l,D as m,_e as n,Ce as s,Le as u,qe as v};
