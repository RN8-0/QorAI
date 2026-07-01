import{q as R,p as D,i as C,$ as m,aF as Q}from"./index-o9fJvioQ.js";import{d as N}from"./vendor-Mg1MKsk6.js";const M={en:"English",tr:"Turkish",de:"German",fr:"French",es:"Spanish",pt:"Portuguese",it:"Italian",ja:"Japanese",ko:"Korean",zh:"Chinese",ar:"Arabic",ru:"Russian",hi:"Hindi",nl:"Dutch",pl:"Polish",sv:"Swedish"};function x(e){return M[String(e||"en").slice(0,2).toLowerCase()]||"English"}function P(e){const t=String(e||"en").slice(0,2).toLowerCase();return t==="tr"?["Kullanım Uyumu","Performans","Kalite Uyumu","Özellik Seti","Ergonomi ve Taşınabilirlik","Güvenilirlik ve Risk","Topluluk Sinyali","Uzun Vadeli Değer"]:t==="de"?["Nutzungsfit","Leistung","Qualitätsfit","Funktionsumfang","Ergonomie und Mobilität","Zuverlässigkeit und Risiko","Community-Signal","Langzeitwert"]:["Usage Fit","Performance","Quality Fit","Feature Set","Ergonomics and Portability","Reliability and Risk","Community Signal","Long-term Value"]}function j(e){const t=String(e||"en").slice(0,2).toLowerCase();return t==="tr"?[{key:"usage_fit",label:"Kullanım Uyumu",emoji:"🎯"},{key:"content_match",label:"İçerik Uyumu",emoji:"🎬"},{key:"feature_depth",label:"Özellik Derinliği",emoji:"🧩"},{key:"ecosystem_fit",label:"Ekosistem Uyumu",emoji:"🔗"},{key:"lifestyle_match",label:"Yaşam Tarzı Uyumu",emoji:"🏠"},{key:"community_signal",label:"Topluluk Sinyali",emoji:"🌐"},{key:"retention_value",label:"Uzun Vadeli Tutma Değeri",emoji:"🚀"},{key:"risk_balance",label:"Risk Dengesi",emoji:"🛡"}]:t==="de"?[{key:"usage_fit",label:"Nutzungsfit",emoji:"🎯"},{key:"content_match",label:"Inhaltsfit",emoji:"🎬"},{key:"feature_depth",label:"Funktionstiefe",emoji:"🧩"},{key:"ecosystem_fit",label:"Ökosystem-Fit",emoji:"🔗"},{key:"lifestyle_match",label:"Lifestyle-Fit",emoji:"🏠"},{key:"community_signal",label:"Community-Signal",emoji:"🌐"},{key:"retention_value",label:"Langzeitbindung",emoji:"🚀"},{key:"risk_balance",label:"Risikobalance",emoji:"🛡"}]:[{key:"usage_fit",label:"Usage Fit",emoji:"🎯"},{key:"content_match",label:"Content Match",emoji:"🎬"},{key:"feature_depth",label:"Feature Depth",emoji:"🧩"},{key:"ecosystem_fit",label:"Ecosystem Fit",emoji:"🔗"},{key:"lifestyle_match",label:"Lifestyle Match",emoji:"🏠"},{key:"community_signal",label:"Community Signal",emoji:"🌐"},{key:"retention_value",label:"Long-term Retention",emoji:"🚀"},{key:"risk_balance",label:"Risk Balance",emoji:"🛡"}]}function G(e){const t=x(e);return`You are Qor AI's link analysis engine. You receive a product URL, optional metadata, optional web research data, and a user profile. Your job is to identify the EXACT product and analyze it for the user.

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
}`}function B(e){try{const t=new URL(e),n=t.pathname.split("/").map(r=>r.trim()).filter(Boolean);let i="";if(/amazon\./i.test(t.hostname)){const r=n.findIndex(l=>/^(dp|product)$/i.test(l));r>0&&(i=n[r-1])}const a=/^(p|dp|pd|gp|aw|d|product|urun|item|ref|ref=.*|psc=.*|qid=.*|sr=.*)$/i,o=/^(?:[a-z0-9]{10}|[a-f0-9]{16,}|[0-9]{8,})$/i,p=/^(ref[=_-]|sr[=_-]|qid[=_-]|psc[=_-])/i;return i||(i=[...n].reverse().find(r=>/[a-z]/i.test(r)&&!a.test(r)&&!o.test(r)&&!p.test(r))||""),i||(i=[...n].reverse().find(r=>/[a-z]/i.test(r)&&!a.test(r))||""),i=i.replace(/\.(html?|php|aspx?)$/i,"").replace(/[-_]+/g," "),i=i.replace(/\b(p|dp|pd|product|urun|item|ref)\b/gi," ").replace(/\s+/g," ").trim(),i.length<3?"":i.replace(/\b\w/g,r=>r.toUpperCase()).slice(0,80)}catch{return""}}function L(e,t){const n=`${e||""} ${t||""}`.toLowerCase();return/(laptop|notebook|macbook|thinkpad|vivobook|zenbook|legion|rog|tuf|omen|victus|ideapad|nebula)/.test(n)?"laptops":/(headphone|headset|kulaklik|earbud|airpods|buds|wh-|quietcomfort)/.test(n)?"headphones":/(phone|iphone|galaxy|pixel|xiaomi|redmi|smartphone)/.test(n)?"smartphones":/(monitor|display|oled|qled|ultrawide)/.test(n)?"monitors":/(keyboard|mouse|klavye|fare)/.test(n)?"keyboards":/(book|isbn|kindle|kitap)/.test(n)?"books":/(shoe|shirt|dress|jacket|pantolon|ayakkabi|giyim)/.test(n)?"clothing":/(kitchen|vacuum|robot|coffee|airfryer|home|mutfak|ev)/.test(n)?"home-appliances":/(game|gaming|ps5|xbox|switch)/.test(n)?"gaming":"general"}function O({url:e,title:t,siteName:n,language:i}){const a=String(i||"en").slice(0,2).toLowerCase(),o=t||n||e;return a==="tr"?`"${o}" bağlantısı ürün sayfası olarak işlendi. Qor AI ürün adını bağlantı ve site bilgisinden çıkardı; canlı sayfa verisi alınamadığında değerlendirme, ürün adı/kategori sinyalleri ve profil cevapların üzerinden hazırlanır. Satın almadan önce satıcı sayfasındaki güncel fiyat, garanti ve teknik özellikleri de kontrol et.`:a==="de"?`"${o}" wurde als Produktlink verarbeitet. Qor AI hat das Produkt aus der URL und dem Shop-Signal erkannt; wenn keine Live-Seitendaten verfügbar sind, wird die Empfehlung aus Titel, Kategorie-Signalen und deinen Antworten erstellt. Prüfe vor dem Kauf trotzdem den aktuellen Preis, die Garantie und die technischen Daten auf der Verkäuferseite.`:`"${o}" was processed as a product link. Qor AI identified it from the URL and store signal; when live page data is unavailable, the recommendation is built from the title, category signals, and your answers. Check the seller page for current price, warranty, and specs before buying.`}const V=["quora.com","reddit.com","youtube.com","youtu.be","twitter.com","x.com","facebook.com","fb.com","fb.watch","instagram.com","tiktok.com","threads.net","wikipedia.org","fandom.com","medium.com","substack.com","linkedin.com","pinterest.com","github.com","gitlab.com","stackoverflow.com","stackexchange.com","google.com","bing.com","duckduckgo.com","yahoo.com","yandex.com","whatsapp.com","t.me","telegram.org","discord.com","discord.gg","twitch.tv","spotify.com","soundcloud.com","netflix.com","wikihow.com"];function Y(e){let t;try{t=new URL(e)}catch{return!1}const n=t.hostname.replace(/^www\./,"").toLowerCase();return!(V.some(a=>n===a||n.endsWith("."+a))||!t.pathname.replace(/\/+$/,"")&&!t.search)}async function me(e,t,n={}){const i=B(e);let a="";try{a=new URL(e).hostname.replace(/^www\./,"")}catch{}if(!Y(e))return{url:e,title:i||a||e,score:0,analysis:"",category:"",siteName:a,price:null,isProduct:!1};let o="";if(!i||i.length<4||/amazon\./i.test(a))try{const y=`Identify the EXACT product sold at this URL using Google Search.
URL: ${e}
`+(i?`Possible title from URL slug: ${i}
`:"")+(a?`Store: ${a}
`:"")+"Return the exact product name (brand + model + key variant), its category, and the current price with currency if visible. If you cannot confirm ONE specific product, say so explicitly — do not guess.";o=await D(y,{language:t,maxOutputTokens:768,timeoutMs:25e3})}catch{}let r=null;try{const y={url:e,productMetadata:i?{title:i,siteName:a}:{siteName:a},userProfile:n};o&&(y.webResearch=o),r=await R({system:await C("gemini_link_analysis_system",G(t)),user:JSON.stringify(y),maxOutputTokens:1536})}catch{r={title:i||a||e,score:60,analysis:O({url:e,title:i,siteName:a,language:t}),category:L(e,i),site_name:a,price:null,is_product:!0}}const l=String(r.title||"").trim(),g=!l||/erişim|hata|error|unknown|bilinmeyen/i.test(l)?i||l||a||e:l;return{url:e,title:g,score:Number(r.score)||0,analysis:String(r.analysis||O({url:e,title:g,siteName:a,language:t})),category:String(r.category||L(e,g)).toLowerCase(),siteName:String(r.site_name||a||""),price:r.price||null,isProduct:r.is_product!==!1}}function H(e){const t=x(e);return`You are Qor AI's product quiz engine. Generate a focused personalized quiz
(8-10 questions) to understand the user's needs for a specific product category.

OUTPUT LANGUAGE — HARD REQUIREMENT: Write EVERY question and EVERY option in ${t}, and ONLY ${t}. This is the site's selected language and overrides everything else: even if the product name, specs, category, or user profile are written in another language, the quiz itself is still written in ${t}. Never mirror the language of the product context. Only official brand/product/model names and universal technical terms (RTX, USB-C, Wi-Fi…) may stay as-is.

Rules:
- Each question is a vivid everyday-life mini-scene of about 28-45 words (one rich sentence, or two short ones): set a relatable real-life moment with a little concrete detail, then ask. Make it noticeably longer and more descriptive than a one-liner, yet still natural and easy to read — never a dry label and never a dense paragraph.
- Questions must be relevant to the product CATEGORY.
- Choose 8 questions for simple products, 9-10 for complex/high-consideration products.
- Cover real use moments, environment, quality tolerance, ergonomics, ownership risk and long-term value.
- Each question reveals one concrete trade-off (comfort vs durability, speed vs battery, detail vs simplicity, portability vs capacity, privacy vs convenience).
- HARD RULE — do NOT name the product or brand in the OPTIONS, and mention the product name at most once in the whole quiz (otherwise say "this one" or the category). Options describe behaviors/priorities only, never a brand name.
- Each question has exactly 4 options; each option is a short, concrete everyday behavior or priority, not a one-word label.
- Vary the situations; do not repeat the same day, time, place, or routine across questions.
- Do not use markdown, bold markers, quotation marks, or headline-style labels. Add one or two fitting emojis to each question (matching the scene) so it feels lively and friendly.
- NEVER ask about budget or brand preference.
- ALL text must be in ${t}

PERSONALIZATION (read the userProfile JSON in the user message):
- This quiz is about THIS PRODUCT CATEGORY first. The clear majority of questions (at least 6 of them) MUST be neutral, category-driven usage scenarios that ANY buyer of this product could relate to. Do NOT bend the scenarios around the user's job or hobby.
- AT MOST 1-2 questions in the WHOLE quiz may quietly lean on the user's profession or hobbies for their scenario — and only when it genuinely fits the product category. Never force a profession/hobby context into a question where it does not naturally belong, and NEVER combine profession AND hobby in the same question, nor repeat the same job/hobby context across questions.
- For every other question, use ordinary everyday contexts that come from the product category itself (commuting, travel, home, general work, leisure, family), NOT the user's specific job or hobby.
- You may lean lightly on recentlyViewed products/categories and interestCategories to pick realistic contexts, but keep the spotlight on the product decision, not the person.
- NEVER state or hint at what we already know about them. Do not write "as a doctor", "since you love gaming", or name their profession, hobby, budget or ecosystem. Infer silently and ask a question that UNCOVERS the trade-off — the user must never feel told about their own profile.
- Do NOT ask anything already listed in userProfile.pastQuizQuestions, and do not re-ask facts we already hold (ecosystem, budgetRange, priorities, currentDevices, usageIntent). Spend the questions only on what is still unknown for THIS specific product decision.

Return valid JSON:
{
  "questions": [
    {"question": "...", "options": ["...", "...", "...", "..."]},
    ...
  ]
}`}async function pe({category:e,productTitle:t,url:n,language:i,userProfile:a={}}){const o=await R({system:H(i),user:JSON.stringify({category:e,productTitle:t,url:n,userProfile:a}),maxOutputTokens:3072});return(Array.isArray(o.questions)?o.questions:[]).map((r,l)=>({id:`q${l}`,text:String(r.question||""),options:Array.isArray(r.options)?r.options.map(String):[]})).filter(r=>r.text&&r.options.length>=2).slice(0,10)}function K(e){const t=x(e);return`You are Qor AI's comparison quiz engine. Generate a focused, high-signal quiz
(8-10 questions) that helps choose between multiple product links.

OUTPUT LANGUAGE — HARD REQUIREMENT: Write EVERY question and EVERY option in ${t}, and ONLY ${t}. This is the site's selected language and overrides everything else: even if the product names, specs, categories, or user profile are in another language, the quiz itself is still written in ${t}. Never mirror the language of the product context. Only official brand/product/model names and universal technical terms (RTX, USB-C, Wi-Fi…) may stay as-is.

Rules:
- Each question is a vivid everyday-life mini-scene of about 28-45 words (one rich sentence, or two short ones): set a relatable real-life moment with a little concrete detail, then ask. Make it noticeably longer and more descriptive than a one-liner, yet still natural and easy to read — never a dry label and never a dense paragraph.
- The quiz must surface which trade-offs matter to the user, not ask generic shopping questions.
- Choose 8 questions for two products, 9-10 for complex categories or 3+ products.
- Cover real use moments, performance, quality, portability/ergonomics, durability, risk tolerance and long-term ownership.
- Each question exposes one real decision trade-off between the options' differing strengths.
- HARD RULE — NEVER name, write, or hint at any of the compared products or brands in the questions OR in the options. Not even once. The user must NOT be able to tell which option maps to which product. Describe only behaviors, situations and priorities.
- Each question has exactly 4 options; each option is a short, concrete everyday behavior or priority (no brand names, no model names) that silently maps to a different product's strength.
- Make the four options clearly distinct so the answer is meaningful.
- Vary the situations; do not repeat the same day, time, place, or routine across questions.
- Do not use markdown, bold markers, quotation marks, or headline-style labels. Add one or two fitting emojis to each question (matching the scene) so it feels lively and friendly.
- NEVER ask about budget or brand preference.
- ALL text must be in ${t}

PERSONALIZATION (read the userProfile JSON in the user message):
- This quiz is about choosing between THESE PRODUCTS first. The clear majority of questions (at least 6 of them) MUST be neutral, category-driven trade-off scenarios that ANY buyer comparing these products could relate to. Do NOT bend the scenarios around the user's job or hobby.
- AT MOST 1-2 questions in the WHOLE quiz may quietly lean on the user's profession or hobbies for their scenario — and only when it genuinely fits the compared category. Never force a profession/hobby context where it does not naturally belong, and NEVER combine profession AND hobby in the same question, nor repeat the same job/hobby context across questions.
- For every other question, use ordinary everyday contexts drawn from the compared category itself, NOT the user's specific job or hobby.
- You may lean lightly on recentlyViewed products/categories and interestCategories to pick realistic contexts, but keep the spotlight on the comparison decision.
- NEVER state or hint at what we already know about them. Do not name their profession, hobby, budget or ecosystem in the text. Infer silently and ask a question that UNCOVERS which trade-off wins for them.
- Do NOT ask anything already listed in userProfile.pastQuizQuestions, and do not re-ask facts we already hold (ecosystem, budgetRange, priorities, currentDevices, usageIntent). Spend the questions only on what is still unknown for THIS comparison.

Return valid JSON:
{
  "questions": [
    {"question": "...", "options": ["...", "...", "...", "..."]},
    ...
  ]
}`}async function he({products:e,language:t,userProfile:n={}}){const i=await R({system:K(t),user:JSON.stringify({products:(e||[]).map(a=>({title:a.title,url:a.url,category:a.category,initialScore:a.score,initialAnalysis:a.analysis})),userProfile:n}),maxOutputTokens:8192});return(Array.isArray(i.questions)?i.questions:[]).map((a,o)=>({id:`cq${o}`,text:String(a.question||""),options:Array.isArray(a.options)?a.options.map(String):[]})).filter(a=>a.text&&a.options.length>=2).slice(0,10)}function W(e,t,n){const i=x(n);return`You are Qor AI's subscription quiz engine. Generate a focused personalized quiz
(8-10 questions) to understand the user's needs for: ${e}.

OUTPUT LANGUAGE — HARD REQUIREMENT: Write EVERY question and EVERY option in ${i}, and ONLY ${i}. This is the site's selected language and overrides everything else: even if the service names or user profile are in another language, the quiz itself is still written in ${i}. Never mirror the language of the context. Only official brand/service names may stay as-is.

The goal: understand how the user uses ${t?"these services":"this service"},
their specific habits, preferences, and expectations.

Rules:
- Each question is a vivid everyday-life mini-scene of about 28-45 words (one rich sentence, or two short ones): set a relatable real-life moment with a little concrete detail, then ask. Make it noticeably longer and more descriptive than a one-liner, yet still natural and easy to read — never a dry label and never a dense paragraph.
- Choose 8 questions for one service, 9-10 when comparing multiple services.
- Ask about real habits and moments: when/where/how they watch, listen, play, create or work, and what they care about (quality, variety, offline use, sharing, discovery, comfort, how often they use it).
- HARD RULE — NEVER name, write, or hint at any of the selected services or brands (or their exact features/menus) in the questions OR in the options. Not even once. The user must NOT be able to tell which option belongs to which service. If a service name would appear, replace it with the neutral behavior instead.
- Each question has exactly 4 options. Every option is a short, concrete everyday behavior or priority — NO brand names, NO service names, NO product-specific feature jargon — that silently maps to a different service's strength.
- Make the four options clearly distinct so the answer is meaningful, and keep each option short (a few words to one short clause).
- Vary the situations; do not repeat the same moment, place or time across questions.
- Do not use markdown, bold, quotation marks, or headline-style labels. Add one or two fitting emojis to each question (matching the scene) so it feels lively and friendly.
- NEVER ask about budget or brand preference.
- ALL text must be in ${i}.

PERSONALIZATION (read the userProfile JSON in the user message — this is the profile the user built in the onboarding quiz):
- Shape the everyday situations around what this person plausibly does, using interestCategories, usageIntent, priorities and recentlyViewed for relatable, real-life contexts.
- AT MOST 1-2 questions may quietly lean on their profession or hobbies, and only when it fits naturally; never combine profession and hobby in one question, and never state or name their profession, hobby, budget or ecosystem.
- Infer silently — the questions should feel like everyday life, never like the app is reading their profile back to them.

Return valid JSON:
{
  "questions": [
    {"question": "...", "options": ["...", "...", "...", "..."]},
    ...
  ]
}`}async function ge({subscriptionNames:e,language:t,userProfile:n={}}){const i=e.length>1,a=await R({system:W(e.join(", "),i,t),user:JSON.stringify({subscriptions:e,mode:i?"compare":"single",userProfile:n}),maxOutputTokens:8192});return(Array.isArray(a.questions)?a.questions:[]).map((p,r)=>({id:`sq${r}`,text:String(p.question||""),options:Array.isArray(p.options)?p.options.map(String):[]})).filter(p=>p.text&&p.options.length>=2).slice(0,10)}function J(e){const t=x(e),n=String(e||"").slice(0,2)==="tr",i=String(e||"").slice(0,2)==="de",a=n?"Kullanım Uyumu":i?"Nutzungsfit":"Usage Fit",o=n?"Bütçe Uyumu":i?"Budget-Fit":"Budget Match",p=n?"Kalite Uyumu":i?"Qualitätsfit":"Quality Fit",r=n?"Uzun Vadeli Değer":i?"Langzeitwert":"Long-term Value";return`You are Qor AI's senior product analyst. Given a product, quiz answers, and user profile, produce a comprehensive, professional, highly detailed personalized match report.

LANGUAGE: Write ALL text in ${t}. Factor labels must also be in ${t}.

CRITICAL — CATEGORY-AWARE ANALYSIS:
- The product can be ANY category: tech, books, clothing, home, sports, beauty, etc.
- For TECH products: analyze specs deeply — cite performance numbers, thermal behavior, software longevity, benchmark context.
- For BOOKS: discuss writing quality, pacing, reader reception, author credentials, genre positioning.
- For CLOTHING/HOME: discuss material science, build quality, brand heritage, durability.
- NEVER force tech terminology onto non-tech products.
- Adapt factor meanings and labels to the product category:
  • "${p}" = build/material/content quality (as appropriate)
  • "${r}" = durability/longevity/re-read value (as appropriate)

SCORING RULES:
- Score must reflect how well THIS SPECIFIC product matches THIS SPECIFIC user's exact needs.
- Scores MUST be realistic and differentiated. Never give identical scores.
- Poor match: 20-45. Average: 46-65. Good: 66-80. Excellent: 81-95.

WRITING QUALITY REQUIREMENTS:
- Use professional, tech-journalist level language. Be specific and detailed, not generic.
- Cite actual specs, community observations, or market context wherever possible.
- verdict must be 5-7 rich paragraphs covering the full product story.
- personaAnalysis must be 3-5 paragraphs, deeply personalized to quiz answers.
- communityAnalysis must be 3-4 paragraphs synthesizing broad community feedback AND must clearly call out the product's most-reported NEGATIVES and complaints — never a positives-only summary.
- prosForUser and consForUser must be detailed, specific bullet points.

Return valid JSON (all text in ${t}):
{
  "enhancedScore": <0-100>,
  "factors": [
    {"label": "${a}", "score": <0-100>, "emoji": "🎯"},
    {"label": "${o}", "score": <0-100>, "emoji": "💰"},
    {"label": "${p}", "score": <0-100>, "emoji": "⭐"},
    {"label": "${n?"Özellik Seti":i?"Funktionsumfang":"Feature Set"}", "score": <0-100>, "emoji": "🧩"},
    {"label": "${n?"Güvenilirlik ve Risk":i?"Zuverlässigkeit und Risiko":"Reliability and Risk"}", "score": <0-100>, "emoji": "🛡"},
    {"label": "${n?"Topluluk Sinyali":i?"Community-Signal":"Community Signal"}", "score": <0-100>, "emoji": "🌐"},
    {"label": "${r}", "score": <0-100>, "emoji": "🚀"},
    {"label": "${n?"Yaşam Tarzı Uyumu":i?"Lifestyle-Fit":"Lifestyle Match"}", "score": <0-100>, "emoji": "🏠"}
  ],
  "verdict": "5-7 paragraph comprehensive product analysis in ${t}. Cover: technical overview, performance analysis, build quality, value assessment, long-term ownership outlook, who it's for. Be specific with actual product characteristics. NO user attribute lists.",
  "prosForUser": ["Detailed pro 1 citing specific product trait", "Detailed pro 2 with performance context", "Detailed pro 3", "Detailed pro 4", "Detailed pro 5"],
  "consForUser": ["Specific con 1 with real-world impact", "Specific con 2 with severity context", "Specific con 3", "Specific con 4"],
  "alternatives": ["Full model name of alternative 1", "Full model name of alternative 2", "Full model name of alternative 3"],
  "personaScore": <0-100>,
  "personaAnalysis": "3-5 paragraphs in ${t} — deep analysis of how this product fits the user's lifestyle, use cases, and needs from quiz answers. Reference specific quiz answers. Be concrete. NEVER list user attributes by name.",
  "communityScore": <0-100>,
  "communityAnalysis": "3-4 paragraphs in ${t} — professional synthesis of community opinion. Cover overall reception and praise, but you MUST devote at least one clear paragraph to the NEGATIVES: the most common complaints, recurring criticisms, defects and disappointments users actually report — state them plainly, do not soften or bury them. Reference known sources (Reddit, YouTube, review sites). IGNORE user profile.",
  "overallVerdict": "3-4 paragraph definitive buy/consider/skip verdict in ${t}. Include specific reasoning and concrete alternative if recommending skip. NEVER mention user attributes by name."
}`}function A(e){if(typeof e=="number")return e;const t=parseFloat(String(e||"").replace(",","."));return Number.isFinite(t)?t:0}async function ye({base:e,answers:t,language:n,userProfile:i={}}){const a=t.filter(l=>l.answer!=null).map(l=>({question:l.question,answer:l.answer})),o=await R({system:await C("gemini_enhanced_link_analysis_system",J(n)),user:JSON.stringify({product:{url:e.url,title:e.title,category:e.category,initialScore:e.score,initialAnalysis:e.analysis},quizAnswers:a,userProfile:i}),maxOutputTokens:8192}),p=(Array.isArray(o.factors)?o.factors:[]).map(l=>({label:String(l.label||l.name||""),score:A(l.score??l.value),emoji:String(l.emoji||l.icon||"📊")})).filter(l=>l.label),r=A(o.enhancedScore??o.enhanced_score??o.score);return{base:e,enhancedScore:r>0?r:e.score,factors:p,verdict:String(o.verdict||o.detailed_verdict||o.analysis||e.analysis||""),prosForUser:Array.isArray(o.prosForUser||o.pros)?(o.prosForUser||o.pros).map(String):[],consForUser:Array.isArray(o.consForUser||o.cons)?(o.consForUser||o.cons).map(String):[],alternatives:Array.isArray(o.alternatives)?o.alternatives.map(String):[],personaScore:A(o.personaScore)||null,personaAnalysis:o.personaAnalysis?String(o.personaAnalysis):"",communityScore:A(o.communityScore)||null,communityAnalysis:o.communityAnalysis?String(o.communityAnalysis):"",overallVerdict:o.overallVerdict?String(o.overallVerdict):""}}function X(e){const t=x(e),n=P(e),i=["🎯","⚡","⭐","🧩","🧭","🛡","🌐","🚀"],a=n.map((o,p)=>`        {"label": "${o}", "score": 0, "emoji": "${i[p]||"📊"}", "detail": "1 sentence"}`).join(`,
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
- Every product must have factor scores for: ${n.join(", ")}.

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
      "summary": "4-6 detailed sentences in ${t}",
      "pros": ["4 detailed bullets in ${t}"],
      "cons": ["3 detailed bullets in ${t}"],
      "risks": ["3 ownership/community risks in ${t}"],
      "factors": [
${a}
      ],
      "specHighlights": [
        {"label": "short spec label in ${t}", "value": "short known/inferred value or uncertainty note"}
      ],
      "community": "2 short paragraphs in ${t}"
    }
  ],
  "detailed": {
    "fit": "3-4 paragraphs in ${t} comparing quiz-based fit",
    "performance": "3-4 paragraphs in ${t} comparing performance/specs",
    "ownership": "3-4 paragraphs in ${t} comparing durability, support, community risk",
    "recommendation": "4-6 paragraphs in ${t} with clear final decision and alternatives"
  },
  "recommendation": "2-3 sentence final summary in ${t}"
}`}async function fe({bases:e,answers:t,language:n,userProfile:i={}}){var v,z;const a=P(n),o=["🎯","⚡","⭐","🧩","🧭","🛡","🌐","🚀"],p=(t||[]).filter(d=>d.answer!=null).map(d=>({question:d.question,answer:d.answer})),r=await R({system:X(n),user:JSON.stringify({products:(e||[]).map((d,k)=>({index:k+1,url:d.url,title:d.title,category:d.category,siteName:d.siteName,initialScore:d.score,initialAnalysis:d.analysis})),quizAnswers:p,userProfile:i}),maxOutputTokens:12288}),l=Array.isArray(r.products)?r.products:[],g=((e||[]).length?(e||[]).map((d,k)=>l.find(s=>(s==null?void 0:s.url)&&s.url===d.url)||l[k]||{}):l).map((d,k)=>{const s=(e||[])[k]||{},b=A(d.score)||A(s.score)||50,S=Array.isArray(d.factors)?d.factors.map(h=>({label:String((h==null?void 0:h.label)||""),score:A((h==null?void 0:h.score)??(h==null?void 0:h.value)),emoji:String((h==null?void 0:h.emoji)||"📊"),detail:String((h==null?void 0:h.detail)||"")})).filter(h=>h.label):[],c=S.length?S:a.map((h,T)=>({label:h,score:b,emoji:o[T]||"📊",detail:""})),E=Array.isArray(d.specHighlights)?d.specHighlights.map(h=>({label:String((h==null?void 0:h.label)||""),value:String((h==null?void 0:h.value)||"")})).filter(h=>h.label||h.value):[];return{name:String(d.name||s.title||`Product ${k+1}`),url:String(d.url||s.url||""),siteName:String(d.siteName||s.siteName||""),score:b,rank:A(d.rank)||k+1,bestFor:String(d.bestFor||""),summary:String(d.summary||s.analysis||""),pros:Array.isArray(d.pros)?d.pros.map(String):[],cons:Array.isArray(d.cons)?d.cons.map(String):[],risks:Array.isArray(d.risks)?d.risks.map(String):[],factors:c,specHighlights:E,community:String(d.community||"")}});g.sort((d,k)=>(d.rank||99)-(k.rank||99));const y=r.winner&&typeof r.winner=="object"?{best:String(r.winner.best||((v=g[0])==null?void 0:v.name)||""),reason:String(r.winner.reason||""),scoreGap:A(r.winner.scoreGap)}:{best:((z=g[0])==null?void 0:z.name)||"",reason:"",scoreGap:0},f=r.detailed&&typeof r.detailed=="object"?{fit:String(r.detailed.fit||""),performance:String(r.detailed.performance||""),ownership:String(r.detailed.ownership||""),recommendation:String(r.detailed.recommendation||"")}:null;return{type:"compare_structured",isCompare:!0,bases:e,answers:t,winner:y,products:g,scores:Object.fromEntries(g.map(d=>[d.name,d.score])),detailed:f,recommendation:String(r.recommendation||(f==null?void 0:f.recommendation)||y.reason||"")}}function Z(e,t,n,i,a){const o=x(a),r=j(a).map(g=>`        "${g.key}": "integer 0-100 - ${g.label}"`).join(`,
`),l=n?`{
  "subscriptions": {
    "<service_name>": {
      "category": "string - shared subscription category label",
      "rank": "integer starting at 1",
      "compatibility_score": "integer 0-100",
      "compatibility_explanation": "string - 4-6 detailed sentences why this score, personalized to quiz answers",
      "pros": ["detailed string", "detailed string", "detailed string", "detailed string", "detailed string"],
      "cons": ["detailed string", "detailed string", "detailed string", "detailed string"],
      "risks": ["ownership/churn risk string", "risk string", "risk string"],
      "notable_features": [
        {"label": "short feature label", "value": "short feature detail"}
      ],
      "community_sentiment": "string - 3-4 paragraph Reddit/forum/reviewer summary that clearly includes the most common complaints and negatives, not only praise",
      "best_for": "string - 2-3 sentence ideal user type and usage context",
      "factors": {
${r}
      }
    }
  },
  "winner": {
    "best_content": "string - service name",
    "overall": "string - service name",
    "reason": "string - 2-3 detailed sentences",
    "score_gap": "integer score gap between strongest and weakest",
    "recommendation": "string - 5-7 paragraph personalized recommendation explaining WHY, trade-offs, best use cases and final decision"
  },
  "detailed_comparison": {
    "service_fit_summary": "string - 3-4 paragraphs comparing overall fit",
    "feature_comparison": "string - 3-4 paragraphs about feature differences",
    "user_experience": "string - 3-4 paragraphs about UX differences",
    "community_and_risk": "string - 3-4 paragraphs about review sentiment, churn risk and long-term satisfaction. You MUST clearly state the most common COMPLAINTS and negative points users report (price hikes, missing features, reliability, support, ads) — never a positives-only summary.",
    "final_plan": "string - 3-4 paragraphs explaining how the user should use the winning service or combination"
  }
}`:`{
  "subscriptions": {
    "${e}": {
      "category": "string - service category label",
      "rank": 1,
      "compatibility_score": "integer 0-100",
      "compatibility_explanation": "string - 4-6 detailed sentences why this score, personalized to quiz answers",
      "pros": ["detailed string", "detailed string", "detailed string", "detailed string", "detailed string"],
      "cons": ["detailed string", "detailed string", "detailed string", "detailed string"],
      "risks": ["ownership/churn risk string", "risk string", "risk string"],
      "notable_features": [
        {"label": "short feature label", "value": "short feature detail"}
      ],
      "community_sentiment": "string - 3-4 paragraph Reddit/forum/reviewer summary that clearly includes the most common complaints and negatives, not only praise",
      "best_for": "string - 2-3 sentence ideal user type and usage context",
      "factors": {
${r}
      }
    }
  },
  "detailed_comparison": {
    "service_fit_summary": "string - 3-4 paragraphs about overall fit",
    "feature_comparison": "string - 3-4 paragraphs about features and content/use cases",
    "user_experience": "string - 3-4 paragraphs about UX and everyday usage",
    "community_and_risk": "string - 3-4 paragraphs about review sentiment, churn risk and long-term satisfaction. You MUST clearly state the most common COMPLAINTS and negative points users report (price hikes, missing features, reliability, support, ads) — never a positives-only summary.",
    "final_plan": "string - 3-4 paragraphs explaining how the user should use or evaluate the service"
  },
  "recommendation": "string - 5-7 paragraph personalized recommendation explaining fit, trade-offs, usage scenarios and final decision"
}`,u=i.length?i.map(g=>`- ${g.question}: ${g.answer}`).join(`
`):"- (no quiz answers provided)";return`You are Qor AI's subscription intelligence analyst.
Analyze: ${e}

Quiz Answers:
${u}

CRITICAL RULES:
- ALL text values MUST be in ${o} language
- The "subscriptions" object MUST contain exactly ${t} entries, one for EACH of: ${e}
- You MUST complete ALL ${t} service entries. Do not stop early or truncate.
- compatibility_score must be an integer 0-100 based on how well it fits THIS specific user
- pros must have exactly 5 items, cons exactly 4 items, risks exactly 3 items — each item one concise sentence
- notable_features must have 4-6 concise items
- factors are 0-100 integers and MUST include every factor key shown in the schema
- Be specific and personalized to the quiz answers and the user profile, not generic
- Blend the user's profile, browsing history and quiz answers when scoring
- compatibility_explanation: 3-4 sentences. community_sentiment: 2 short paragraphs.
  best_for: 2 sentences. recommendation / detailed_comparison fields: 3-4 short
  paragraphs each. Keep it substantial but DO NOT pad — finishing the full JSON
  for ALL services matters more than length.
- NEVER mention price, cost, affordability, monthly fees, yearly fees, discounts, or billing

Return ONLY valid JSON (no markdown fences, no commentary) matching this exact schema:
${l}`}async function be({subscriptionNames:e,answers:t,language:n,userProfile:i={}}){var d,k;const a=e.length>1,o=e.join(", "),p=j(n),r=Object.fromEntries(p.map(s=>[s.key,s])),l=(t||[]).filter(s=>s.answer!=null).map(s=>({question:s.question,answer:s.answer})),u=await R({system:await C("gemini_subscription_analysis",Z(o,e.length,a,l,n)),user:JSON.stringify({subscriptions:e,mode:a?"compare":"single",userProfile:i}),maxOutputTokens:12288}),g=u.subscriptions&&typeof u.subscriptions=="object"?u.subscriptions:{},y=new Map(Object.entries(g).map(([s,b])=>[String(s).toLowerCase(),{name:s,d:b}])),f=(e||[]).map((s,b)=>{const S=y.get(String(s).toLowerCase())||[...y.values()].find(w=>String(w.name).toLowerCase().includes(String(s).toLowerCase()))||{name:s,d:{}},c=S.d||{},E=A(c==null?void 0:c.compatibility_score)||55,h=c!=null&&c.factors&&typeof c.factors=="object"?Object.entries(c.factors).map(([w,$])=>{const q=r[w]||{};return{key:w,label:q.label||String(w).replace(/_/g," "),emoji:q.emoji||"📊",score:A($)||E}}):[],T=h.length?h:p.map(w=>({key:w.key,label:w.label,emoji:w.emoji,score:E})),F=Array.isArray(c==null?void 0:c.notable_features)?c.notable_features.map(w=>({label:String((w==null?void 0:w.label)||""),value:String((w==null?void 0:w.value)||"")})).filter(w=>w.label||w.value):[];return{name:String(S.name||s),category:String((c==null?void 0:c.category)||""),score:E,rank:A(c==null?void 0:c.rank)||b+1,explanation:String((c==null?void 0:c.compatibility_explanation)||""),pros:Array.isArray(c==null?void 0:c.pros)?c.pros.map(String):[],cons:Array.isArray(c==null?void 0:c.cons)?c.cons.map(String):[],risks:Array.isArray(c==null?void 0:c.risks)?c.risks.map(String):[],features:F,community:String((c==null?void 0:c.community_sentiment)||""),bestFor:String((c==null?void 0:c.best_for)||""),factors:T}}).sort((s,b)=>(s.rank||99)-(b.rank||99)||b.score-s.score),v={};f.forEach(s=>{v[s.name]=s.score});const z=((d=[...f].sort((s,b)=>b.score-s.score)[0])==null?void 0:d.name)||"";return{isCompare:a,services:f,scores:v,winner:u.winner&&typeof u.winner=="object"?{best:String(u.winner.best_content||u.winner.overall||z||""),overall:String(u.winner.overall||""),reason:String(u.winner.reason||""),scoreGap:A(u.winner.score_gap??u.winner.scoreGap),recommendation:String(u.winner.recommendation||"")}:{best:z,overall:z,reason:"",scoreGap:0,recommendation:""},detailed:u.detailed_comparison&&typeof u.detailed_comparison=="object"?{fit:String(u.detailed_comparison.service_fit_summary||""),features:String(u.detailed_comparison.feature_comparison||""),ux:String(u.detailed_comparison.user_experience||""),community:String(u.detailed_comparison.community_and_risk||""),plan:String(u.detailed_comparison.final_plan||"")}:null,recommendation:String(u.recommendation||((k=u==null?void 0:u.winner)==null?void 0:k.recommendation)||"")}}const ee={netflix:"video","disney+":"video","disney plus":"video","amazon prime":"video","prime video":"video",hbo:"video","hbo max":"video",max:"video",hulu:"video","apple tv+":"video","apple tv plus":"video",blutv:"video",exxen:"video",gain:"video",mubi:"video","youtube premium":"video",crunchyroll:"video","bein sports":"video",tod:"video","paramount+":"video","paramount plus":"video",peacock:"video",tabii:"video","tv+":"video",spotify:"music","apple music":"music","youtube music":"music",tidal:"music",deezer:"music","amazon music":"music",fizy:"music",soundcloud:"music","soundcloud go":"music","chatgpt plus":"ai",chatgpt:"ai","claude pro":"ai",claude:"ai",gemini:"ai","gemini advanced":"ai",perplexity:"ai",midjourney:"ai",copilot:"ai","microsoft copilot":"ai",grok:"ai",deepseek:"ai",poe:"ai",icloud:"cloud","icloud+":"cloud","google one":"cloud",dropbox:"cloud",onedrive:"cloud",pcloud:"cloud",mega:"cloud","adobe creative cloud":"productivity",canva:"productivity",figma:"productivity","microsoft 365":"productivity","office 365":"productivity",notion:"productivity","google workspace":"productivity",hostinger:"other","xbox game pass":"gaming","playstation plus":"gaming","ps plus":"gaming","ea play":"gaming","geforce now":"gaming","nintendo switch online":"gaming","ubisoft+":"gaming","apple arcade":"gaming"};function U(e){return ee[String(e||"").trim().toLowerCase()]||null}const te={"video-streaming":"video","music-streaming":"music",gaming:"gaming","ai-tools":"ai","cloud-storage":"cloud",productivity:"productivity",bundles:"bundles",news:"news",fitness:"fitness",education:"education",other:"other"};function ie(e){const t=String(e||"").trim().toLowerCase();return te[t]||t||null}function we(e){const t=e.map(U).filter(Boolean);return[...new Set(t)].length>1}const re={netflix:"Netflix","disney+":"Disney+","disney plus":"Disney+","amazon prime":"Amazon Prime","prime video":"Amazon Prime","amazon prime video":"Amazon Prime",hbo:"HBO","hbo max":"HBO Max",max:"Max",hulu:"Hulu","apple tv+":"Apple TV+","apple tv plus":"Apple TV+",blutv:"BluTV",exxen:"Exxen",exen:"Exxen",gain:"Gain",mubi:"MUBI","youtube premium":"YouTube Premium","yt premium":"YouTube Premium",crunchyroll:"Crunchyroll","bein sports":"beIN Sports",tod:"TOD","paramount+":"Paramount+","paramount plus":"Paramount+",peacock:"Peacock",tabii:"Tabii","tv+":"Apple TV+",spotify:"Spotify","apple music":"Apple Music","youtube music":"YouTube Music","yt music":"YouTube Music",tidal:"Tidal",deezer:"Deezer","amazon music":"Amazon Music",fizy:"Fizy",soundcloud:"SoundCloud","soundcloud go":"SoundCloud Go","chatgpt plus":"ChatGPT Plus",chatgpt:"ChatGPT Plus","claude pro":"Claude Pro",claude:"Claude Pro",gemini:"Gemini Advanced","gemini advanced":"Gemini Advanced",perplexity:"Perplexity",midjourney:"Midjourney",copilot:"Microsoft Copilot","microsoft copilot":"Microsoft Copilot",grok:"Grok",deepseek:"DeepSeek",poe:"Poe",icloud:"iCloud+","icloud+":"iCloud+","google one":"Google One",dropbox:"Dropbox",onedrive:"OneDrive",pcloud:"pCloud",mega:"MEGA","adobe creative cloud":"Adobe Creative Cloud",canva:"Canva","microsoft 365":"Microsoft 365","office 365":"Microsoft 365",notion:"Notion","google workspace":"Google Workspace",hostinger:"Hostinger","xbox game pass":"Xbox Game Pass","playstation plus":"PlayStation Plus","ps plus":"PlayStation Plus","ea play":"EA Play","geforce now":"GeForce Now","nintendo switch online":"Nintendo Switch Online","ubisoft+":"Ubisoft+","apple arcade":"Apple Arcade"};function ne(e){const t=String(e||"").trim().toLowerCase();return t.includes("http://")||t.includes("https://")||t.includes("www.")||/\.[a-z]{2,}(\/|$)/.test(t)}function I(e){const t=String(e||"").trim().replace(/\s+/g," "),n=re[t.toLowerCase()];return n||t.replace(/\b\w/g,i=>i.toUpperCase())}function ae(e){const t=String(e||"").slice(0,2)==="tr",n=String(e||"").slice(0,2)==="de";return{empty:t?"Lütfen en az bir abonelik adı girin.":n?"Bitte gib mindestens einen Abo-Namen ein.":"Please enter at least one subscription name.",url:t?"Buraya yalnızca abonelik adı girebilirsin — link kabul edilmez.":n?"Hier sind nur Abo-Namen erlaubt — keine Links.":"Only subscription names are accepted here — links are not allowed.",notSub:t?"Bu metin bir abonelik servisine benzemiyor. Lütfen Netflix, Spotify gibi bir servis adı yaz.":n?"Das sieht nicht nach einem Abo-Dienst aus. Gib einen Namen wie Netflix oder Spotify ein.":"This doesn't look like a subscription service. Please enter a name like Netflix or Spotify.",failed:t?"Abonelik doğrulanırken hata oluştu. Lütfen tekrar deneyin.":n?"Abo konnte nicht geprüft werden. Bitte erneut versuchen.":"Could not validate subscription. Please try again.",dup:i=>t?`"${i}" zaten eklendi.`:n?`"${i}" ist bereits hinzugefügt.`:`"${i}" is already added.`}}function oe(e){return`You are Qor AI's subscription validation engine.
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
"display_name" must be the clean branded service name. "reason" must be short and in ${x(e)}.

Return ONLY valid JSON:
{ "is_subscription": true|false, "display_name": "string or null", "category": "string or null", "reason": "string" }`}async function ve(e,t=[],n="en"){const i=ae(n),a=String(e||"").trim();if(!a)return{error:i.empty};if(ne(a))return{error:i.url};const o=a.toLowerCase();if((t||[]).some(y=>String(y||"").trim().toLowerCase()===o))return{error:i.dup(a)};const p=U(a);if(p){const y=I(a);return(t||[]).some(f=>String(f||"").trim().toLowerCase()===y.toLowerCase())?{error:i.dup(y)}:{displayName:y,category:p}}let r;try{r=await R({system:oe(n),user:JSON.stringify({input:a}),maxOutputTokens:512})}catch{return{error:i.failed}}const l=(r==null?void 0:r.is_subscription)===!0,u=I((r==null?void 0:r.display_name)||a),g=ie(r==null?void 0:r.category);return!l||!u||!g?{error:i.notSub}:(t||[]).some(y=>String(y||"").trim().toLowerCase()===u.toLowerCase())?{error:i.dup(u)}:{displayName:u,category:g}}function se(e){if(!e)return;const t=document.querySelector(".appbar"),n=(t?t.getBoundingClientRect().height:60)+14,i=window.scrollY+e.getBoundingClientRect().top-n;window.scrollTo({top:Math.max(0,i),behavior:"smooth"})}const _={quizProduct:{title:["Preparing your quiz","Quiz hazırlanıyor","Quiz wird vorbereitet"],detail:["Questions are tuned to this product, not a generic profile form.","Sorular genel profil formu değil, bu ürüne göre hazırlanıyor.","Die Fragen werden auf dieses Produkt zugeschnitten."],steps:[["Locking the product context","Ürün bağlamı sabitleniyor","Produktkontext wird fixiert"],["Mapping usage scenarios","Kullanım senaryoları çıkarılıyor","Nutzungsszenarien werden abgebildet"],["Writing category-specific questions","Kategoriye özel sorular yazılıyor","Kategoriespezifische Fragen werden erstellt"],["Balancing the answer choices","Cevap seçenekleri dengeleniyor","Antwortoptionen werden ausbalanciert"]]},quizCompare:{title:["Preparing your quiz","Quiz hazırlanıyor","Quiz wird vorbereitet"],detail:["Questions are built from the products in your comparison, not a generic form.","Sorular karşılaştırmandaki ürünlerden üretiliyor, genel form değil.","Die Fragen entstehen aus den verglichenen Produkten."],steps:[["Reading the selected products","Seçili ürünler okunuyor","Ausgewählte Produkte werden gelesen"],["Finding the real differences","Gerçek farklar bulunuyor","Reale Unterschiede werden gesucht"],["Writing comparison scenarios","Karşılaştırma senaryoları yazılıyor","Vergleichsszenarien werden erstellt"],["Balancing the answer choices","Cevap seçenekleri dengeleniyor","Antwortoptionen werden ausbalanciert"]]},product:{title:["Building your report","Raporun hazırlanıyor","Bericht wird erstellt"],detail:["Qor AI turns your answers into a personal match report.","Qor AI cevaplarını kişisel eşleşme raporuna çeviriyor.","Qor AI macht aus deinen Antworten einen persönlichen Match-Bericht."],steps:[["Reading catalog specs","Katalog özellikleri okunuyor","Katalogdaten werden gelesen"],["Applying your profile & answers","Profilin ve cevapların uygulanıyor","Profil & Antworten werden angewendet"],["Running current web research","Güncel web araştırması yapılıyor","Aktuelle Webrecherche läuft"],["Scoring match factors","Uyum faktörleri puanlanıyor","Match-Faktoren werden bewertet"],["Checking alternatives and price timing","Alternatifler ve fiyat zamanlaması kontrol ediliyor","Alternativen und Preis-Timing werden geprüft"],["Composing the final report","Son rapor hazırlanıyor","Der Bericht wird zusammengestellt"]]},compare:{title:["Building the comparison","Karşılaştırma hazırlanıyor","Vergleich wird erstellt"],detail:["Qor AI scores every product for your real use, then picks a winner.","Qor AI her ürünü gerçek kullanımına göre puanlayıp bir kazanan seçiyor.","Qor AI bewertet jedes Produkt und wählt einen Sieger."],steps:[["Reading the selected products","Seçili ürünler okunuyor","Ausgewählte Produkte werden gelesen"],["Applying your profile & answers","Profilin ve cevapların uygulanıyor","Profil & Antworten werden angewendet"],["Running current web research","Güncel web araştırması yapılıyor","Aktuelle Webrecherche läuft"],["Comparing specs head-to-head","Özellikler karşılıklı karşılaştırılıyor","Specs werden direkt verglichen"],["Scoring the best fit for you","Sana en uygunu puanlanıyor","Beste Wahl wird bewertet"],["Composing the verdict","Sonuç hazırlanıyor","Fazit wird erstellt"]]},linkIdentify:{title:["Identifying the product","Ürün tanımlanıyor","Produkt wird erkannt"],detail:["Qor AI reads the URL, store signal, and product slug first.","Qor AI önce URL, mağaza ve ürün adı sinyallerini okuyor.","Qor AI liest zuerst URL, Shop-Signal und Produktslug."],steps:[["Checking the link format","Bağlantı formatı kontrol ediliyor","Linkformat wird geprüft"],["Reading store and product signals","Mağaza ve ürün sinyalleri okunuyor","Shop- und Produktsignale werden gelesen"],["Detecting the category","Kategori algılanıyor","Kategorie wird erkannt"],["Preparing the base analysis","Baz analiz hazırlanıyor","Basisanalyse wird vorbereitet"]]},linkQuiz:{title:["Preparing your quiz","Quiz hazırlanıyor","Quiz wird vorbereitet"],detail:["Questions are tuned to this product, not a generic profile form.","Sorular genel profil formu değil, bu ürüne göre hazırlanıyor.","Die Fragen werden auf dieses Produkt zugeschnitten."],steps:[["Product context is locked","Ürün bağlamı sabitlendi","Produktkontext ist fixiert"],["Usage scenarios are mapped","Kullanım senaryoları çıkarılıyor","Nutzungsszenarien werden abgebildet"],["Category-specific questions are written","Kategoriye özel sorular yazılıyor","Kategoriespezifische Fragen werden erstellt"],["Answer choices are balanced","Cevap seçenekleri dengeleniyor","Antwortoptionen werden ausbalanciert"]]},linkAnalyze:{title:["Building your report","Raporun hazırlanıyor","Bericht wird erstellt"],detail:["Qor AI turns your answers into a personal match report.","Qor AI cevaplarını kişisel eşleşme raporuna çeviriyor.","Qor AI macht aus deinen Antworten einen persönlichen Match-Bericht."],steps:[["Reading quiz answers","Quiz cevapları okunuyor","Quizantworten werden gelesen"],["Scoring match factors","Uyum faktörleri puanlanıyor","Match-Faktoren werden bewertet"],["Summarizing reviews and risks","Yorumlar ve riskler özetleniyor","Bewertungen und Risiken werden zusammengefasst"],["Building the final verdict","Son karar hazırlanıyor","Endgültiges Fazit wird erstellt"]]},linkCompare:{title:["Comparing links","Linkler karşılaştırılıyor","Links werden verglichen"],detail:["Qor AI is weighing each product side by side.","Qor AI her ürünü yan yana tartıyor.","Qor AI gewichtet jedes Produkt nebeneinander."],steps:[["Validating product links","Ürün linkleri doğrulanıyor","Produktlinks werden geprüft"],["Identifying each exact product","Her ürün tek tek tanınıyor","Jedes Produkt wird erkannt"],["Weighing strengths and trade-offs","Artılar, eksiler ve farklar tartılıyor","Stärken und Kompromisse werden abgewogen"],["Writing the final recommendation","Nihai öneri yazılıyor","Empfehlung wird geschrieben"]]},subQuiz:{title:["Preparing your subscription quiz","Abonelik quizin hazırlanıyor","Abo-Quiz wird vorbereitet"],detail:["The questions adapt to the selected service type.","Sorular seçilen abonelik türüne göre uyarlanıyor.","Die Fragen passen sich dem Diensttyp an."],steps:[["Reading the selected services","Seçilen abonelikler okunuyor","Ausgewählte Dienste werden gelesen"],["Detecting the service category","Servis kategorisi algılanıyor","Dienstkategorie wird erkannt"],["Mapping usage scenarios","Kullanım senaryoları çıkarılıyor","Nutzungsszenarien werden abgebildet"],["Writing targeted questions","Hedefli sorular yazılıyor","Gezielte Fragen werden erstellt"]]},subAnalyze:{title:["Analyzing subscription","Abonelik analiz ediliyor","Abo wird analysiert"],detail:["Qor AI turns your answers into a detailed match report.","Qor AI cevaplarını detaylı eşleşme raporuna çeviriyor.","Qor AI macht aus deinen Antworten einen Match-Bericht."],steps:[["Reading quiz answers","Quiz cevapları okunuyor","Quizantworten werden gelesen"],["Evaluating content and feature fit","İçerik ve özellik uyumu değerlendiriliyor","Inhalts- und Funktionsfit wird bewertet"],["Reviewing community signals","İnternet yorum sinyalleri değerlendiriliyor","Community-Signale werden bewertet"],["Building the final recommendation","Nihai öneri hazırlanıyor","Empfehlung wird erstellt"]]},subCompare:{title:["Comparing subscriptions","Abonelikler karşılaştırılıyor","Abos werden verglichen"],detail:["Qor AI turns your answers into a detailed match report.","Qor AI cevaplarını detaylı eşleşme raporuna çeviriyor.","Qor AI macht aus deinen Antworten einen Match-Bericht."],steps:[["Reading quiz answers","Quiz cevapları okunuyor","Quizantworten werden gelesen"],["Evaluating content and feature fit","İçerik ve özellik uyumu değerlendiriliyor","Inhalts- und Funktionsfit wird bewertet"],["Reviewing community signals","İnternet yorum sinyalleri değerlendiriliyor","Community-Signale werden bewertet"],["Building the final recommendation","Nihai öneri hazırlanıyor","Empfehlung wird erstellt"]]}},le={prep:1,research:2,report:99};function ke({lang:e="en",mode:t="product",stage:n=null}){const i=String(e||"en").slice(0,2).toLowerCase(),a=f=>i==="tr"?f[1]:i==="de"?f[2]:f[0],o=_[t]||_.product,p=o.steps,r=p.length-1,l=n==null?r:Math.min(r,le[n]??r),[u,g]=N.useState(0),y=N.useRef(null);return N.useEffect(()=>{const f=requestAnimationFrame(()=>se(y.current));return()=>cancelAnimationFrame(f)},[t]),N.useEffect(()=>{g(0)},[t]),N.useEffect(()=>{if(u>=l)return;const f=setTimeout(()=>g(v=>Math.min(l,v+1)),u===0?500:1300);return()=>clearTimeout(f)},[u,l]),m.jsxs("div",{className:"aiwb fade-up",role:"status","aria-live":"polite",ref:y,children:[m.jsxs("div",{className:"aiwb-orb","aria-hidden":"true",children:[m.jsx("span",{className:"aiwb-ring"}),m.jsx("span",{className:"aiwb-core"})]}),m.jsxs("div",{className:"aiwb-copy",children:[m.jsx("strong",{children:a(o.title)}),m.jsx("span",{children:a(o.detail)})]}),m.jsx("div",{className:"aiwb-steps",children:p.map((f,v)=>m.jsxs("div",{className:"aiwb-step"+(v===u?" active":"")+(v<u?" done":""),children:[m.jsx("i",{"aria-hidden":"true",children:v<u?"✓":v+1}),m.jsx("span",{children:a(f)})]},v))})]})}function ce(e){if(!e)return;const t=document.querySelector(".appbar"),n=(t?t.getBoundingClientRect().height:60)+14,i=window.scrollY+e.getBoundingClientRect().top-n;window.scrollTo({top:Math.max(0,i),behavior:"smooth"})}function Se({questions:e=[],onSubmit:t,onSkip:n,busy:i=!1,title:a,subtitle:o}){const{lang:p}=Q(),r=(s,b,S)=>p==="tr"?b:p==="de"?S:s,[l,u]=N.useState({}),g=N.useRef(null);N.useEffect(()=>{const s=requestAnimationFrame(()=>ce(g.current));return()=>cancelAnimationFrame(s)},[]);const y=N.useMemo(()=>e.filter(s=>l[s.id]!=null).length,[l,e]),f=y===e.length&&e.length>0,v=Math.max(0,e.findIndex(s=>l[s.id]==null)),z=f?e.length-1:v;function d(s,b){u(S=>({...S,[s]:b}))}function k(){!f||i||t(e.map(s=>({question:s.text,answer:l[s.id]??null})))}return e.length?m.jsxs("div",{className:"quiz fade-up",ref:g,children:[m.jsxs("div",{className:"quiz-head",children:[m.jsxs("div",{className:"quiz-head-text",children:[m.jsx("strong",{children:a||r("Quick quiz","Hızlı quiz","Kurzes Quiz")}),m.jsx("span",{children:o||r("Answer a few questions for a personalized analysis.","Kişiselleştirilmiş analiz için birkaç soruyu yanıtla.","Beantworte ein paar Fragen für eine personalisierte Analyse.")})]}),m.jsxs("span",{className:"quiz-progress-pill",children:[y,"/",e.length]})]}),m.jsx("div",{className:"quiz-progress",children:m.jsx("i",{style:{width:`${y/Math.max(1,e.length)*100}%`}})}),m.jsx("div",{className:"quiz-step-map","aria-hidden":"true",children:e.map((s,b)=>m.jsx("span",{className:(l[s.id]!=null?"done ":"")+(b===z?"active":"")},s.id))}),m.jsx("div",{className:"quiz-list",children:e.map((s,b)=>m.jsxs("div",{className:"quiz-q"+(l[s.id]!=null?" done":b===z?" active":""),children:[m.jsxs("h3",{children:[m.jsx("span",{className:"quiz-q-no",children:b+1}),s.text]}),m.jsx("div",{className:"quiz-options",children:s.options.map((S,c)=>m.jsxs("button",{type:"button",className:"quiz-option"+(l[s.id]===S?" on":""),onClick:()=>d(s.id,S),disabled:i,children:[m.jsx("span",{className:"quiz-option-letter",children:String.fromCharCode(65+c)}),m.jsx("span",{className:"quiz-option-tick","aria-hidden":"true"}),m.jsx("span",{children:S})]},S))})]},s.id))}),m.jsxs("div",{className:"quiz-actions",children:[n&&m.jsx("button",{type:"button",className:"btn btn-ghost",onClick:n,disabled:i,children:r("Skip quiz","Quizi atla","Quiz überspringen")}),m.jsx("button",{type:"button",className:"btn btn-primary quiz-submit",onClick:k,disabled:!f||i,children:i?r("Analyzing…","Analiz ediliyor…","Wird analysiert…"):f?r("Analyze","Analiz Et","Analysieren"):r(`Answer all ${e.length} questions`,`${e.length} sorunun hepsini yanıtla`,`Beantworte alle ${e.length} Fragen`)})]})]}):null}export{ke as A,Se as Q,me as a,pe as b,fe as c,ge as d,ye as e,U as f,he as g,we as h,be as s,ve as v};
