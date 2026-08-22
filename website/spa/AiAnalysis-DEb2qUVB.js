import{j as r}from"./aitext-Ba2tSqUt.js";import{d as F}from"./vendor-D2xFRrlB.js";import{w as C,s as b,f as B,ae as G}from"./index-B43IYMPv.js";import{H,C as _,h as X,u as K,B as z}from"./AiCharts-Bzt07HyC.js";import{A as D,S as Z}from"./AiReportView-BCJcHrCL.js";import"./AmazonLogo-DwJMDcXt.js";const O=e=>{const s=parseFloat(String(e??"").replace(/[^\d.-]/g,""));return Number.isFinite(s)?Math.round(s):0},g=e=>Array.isArray(e)?e.filter(s=>s!=null&&String(s).trim()):[];function ee(e){const s=String(e||"").replace(/\s+/g," ").trim();if(!s)return"";const t=s.match(/[^.!?]+[.!?]?/);return(t?t[0]:s).trim()}function re(e,s){const t=String(s||"").toLowerCase();return t==="buy"||t==="consider"||t==="skip"?t:e>=75?"buy":e>=55?"consider":"skip"}function se(e={}){if(!e||typeof e!="object")return null;const s=String(e.trend||"").toLowerCase(),t={trend:["up","down","stable"].includes(s)?s:"",bestTime:String(e.bestTimeToBuy||e.bestTime||"").trim(),expectedChange:String(e.expectedChange||"").trim(),note:String(e.analysis||e.note||"").trim(),drivers:g(e.drivers)};return t.bestTime||t.note||t.expectedChange||t.drivers.length?t:null}function Y(e={},s={},t={}){const i=O(e.matchScore||e.overallScore||e.score),n=s&&typeof s=="object"?s:{};return{enhancedScore:i,decision:re(i,e.decision),headline:String(e.headline||"").trim()||ee(e.matchComment),researched:!!t.researched,confidence:O(e.confidence),base:{title:String(e.name||t.title||"").trim(),siteName:String(t.siteName||"").trim(),url:String(t.url||e.url||"").trim()},url:String(t.url||e.url||"").trim(),factors:g(e.factors),criticalPoints:g(e.criticalPoints),quizInsights:g(e.quizInsights),prosForUser:g(e.strengths).length?g(e.strengths):g(e.pros),consForUser:g(e.weaknesses).length?g(e.weaknesses):g(e.cons),featureMatches:g(e.featureMatches),reliabilityNotes:g(e.reliabilityNotes),personaAnalysis:String(e.matchComment||"").trim(),personaScore:i,verdict:String(e.analysis||"").trim(),overallVerdict:String(e.overallVerdict||t.overallVerdict||"").trim(),bestFor:String(e.bestFor||"").trim(),notFor:String(e.notFor||"").trim(),communityScore:O(n.satisfaction),sentimentBreakdown:n.sentimentBreakdown||n.sentiment_breakdown||null,communityThemes:g(n.themes),communityAnalysis:String(n.summary||"").trim(),praisePoints:g(n.pros),complaintPoints:g(n.cons),sources:g(n.sources),verificationNotes:g(n.verificationNotes),priceOutlook:se(e.priceForecast||t.priceForecast),catalogMatch:t.catalogMatch||null}}function te(e={},s={}){const t=e.product||{};return Y(t,e.community,{...s,title:s.title||e.name,researched:s.researched??!!e.researched,priceForecast:e.priceForecast})}function ne(e={},s={}){return Y(e,e.community,{...s,url:s.url||e.url,priceForecast:e.priceForecast})}const ie={tr:"Turkish",en:"English",es:"Spanish",fr:"French",it:"Italian",pt:"Portuguese",ru:"Russian",nl:"Dutch",pl:"Polish",sv:"Swedish",ja:"Japanese",ar:"Arabic"};function j(e){return ie[String(e||"en").slice(0,2).toLowerCase()]||"English"}const J=new Date().toISOString().slice(0,10);function S(e){if(!e)return"";const s=typeof e=="number"?e:Date.parse(e);return!Number.isFinite(s)||s<=0?"":new Date(s).toISOString().slice(0,10)}function A(e,s=[]){const t=[`Current date: ${J}`,`Qor catalog record exists: ${e!=null&&e.id?"yes":"unknown"}`];e!=null&&e.sourceUrl&&t.push(`Catalog source URL: ${e.sourceUrl}`),e!=null&&e.gtin&&t.push(`GTIN: ${e.gtin}`),e!=null&&e.mpn&&t.push(`MPN: ${e.mpn}`),(e!=null&&e.created||e!=null&&e.createdAt)&&t.push(`Catalog first seen: ${S(e.created||e.createdAt)}`),(e!=null&&e.updated||e!=null&&e.lastUpdated)&&t.push(`Catalog updated: ${S(e.updated||e.lastUpdated)}`),e!=null&&e.scrapedAtTs&&t.push(`Search index scraped: ${S(Number(e.scrapedAtTs)*1e3)}`),e!=null&&e.updatedAtTs&&t.push(`Search index updated: ${S(Number(e.updatedAtTs)*1e3)}`),(Number(e==null?void 0:e.offerCount)>0||Number(e==null?void 0:e.pricedOfferCount)>0)&&t.push(`Catalog offer rollup: ${Number(e.offerCount)||0} links, ${Number(e.pricedOfferCount)||0} priced offers`),e!=null&&e.bestOfferCheckedAt&&t.push(`Best offer checked: ${S(e.bestOfferCheckedAt)}`),e!=null&&e.bestOfferExpiresAt&&t.push(`Best offer freshness expires: ${S(e.bestOfferExpiresAt)}`);const i=(Array.isArray(s)?s:[]).filter(n=>n==null?void 0:n.url).slice(0,8).map(n=>{const a=n!=null&&n.hasExactPrice&&Number(n==null?void 0:n.price)>0?`${n.price} ${n.currency||""}`.trim():"price link only";return`${n.store||n.network||"store"} ${n.country||""}: ${a}`});return i.length&&t.push(`Live/store offer context: ${i.join(" | ")}`),t.filter(Boolean).join(`
`)}function N(){return`Freshness rules (current date: ${J}):
- Prefer current web research and official/store evidence over model memory.
- Never say a product is unannounced, not released, not on the market, or only an estimate if current research, official pages, retailer pages, or the Qor catalog indicate it exists.
- If current web research is unavailable or weak, say the evidence is limited; do not fill the gap with old launch-status assumptions.
- Do not base a current-generation product on the previous generation unless explicitly framed as a comparison.
- Do not treat a laptop fan as a real weakness by itself. Mention fan noise only if research reports it as recurring, or phrase it as sustained-load behavior.
- Judge portability against the same class. Around 2.1 kg is normal/acceptable for a 16-inch workstation laptop, not a severe flaw by default.`}const ae=[/hen[üu]z\s+(?:duyurulmam[ıi]ş|tan[ıi]t[ıi]lmam[ıi]ş|piyasada\s+de[ğg]il|sat[ıi]şa\s+[çc][ıi]kmam[ıi]ş|[çc][ıi]kmad[ıi])/i,/(?:daha|hen[üu]z)\s+(?:piyasada|sat[ıi]şta)\s+(?:de[ğg]il|yok)/i,/performans\s+tahmin(?:i|leri).{0,90}(?:M4|[öo]nceki\s+nesil|previous generation)/i,/M4\s+Max.{0,90}(?:dayan|baz|temel|based)/i,/\b(?:unannounced|not yet announced|not yet released|not yet launched|not yet available)\b/i,/\bnot\s+(?:yet\s+)?(?:on the market|released|launched)\b/i,/performance\s+estimates?.{0,90}(?:M4|previous generation)/i];function Re(e){const s=String(e||"");return ae.some(t=>t.test(s))}function Ee(e,s=[]){const t=(Array.isArray(s)?s:[s]).map(i=>String(i||"").trim()).filter(Boolean).join(", ");return`${e}

QUALITY GATE RETRY:
The previous answer was rejected because it contained stale release/availability claims. Rewrite the JSON from scratch.
`+(t?`Products that must keep exact names: ${t}
`:"")+N()+`
Forbidden stale wording includes: unannounced, not on the market, not released, not yet available, based on M4 Max estimates, or equivalent Turkish wording unless current web research explicitly proves it.`}function W(e,s=40){const t=[],i=new Set,n=(a,o)=>{const u=String(a||"").replace(/\s+/g," ").trim(),c=String(o??"").replace(/\s+/g," ").trim();if(!u||!c)return;const l=u.toLowerCase();i.has(l)||(i.add(l),t.push(`${u}: ${c}`))};return e!=null&&e.keySpecs&&typeof e.keySpecs=="object"&&Object.entries(e.keySpecs).forEach(([a,o])=>n(a,o)),e!=null&&e.specs&&typeof e.specs=="object"&&Object.entries(e.specs).forEach(([a,o])=>n(a,o)),e!=null&&e.specSections&&typeof e.specSections=="object"&&Object.entries(e.specSections).forEach(([a,o])=>{o&&typeof o=="object"&&!Array.isArray(o)&&Object.entries(o).forEach(([u,c])=>n(`${a} / ${u}`,c))}),t.slice(0,s).join("; ")}function v(e,s){const t=W(e,42),i=Date.parse((e==null?void 0:e.bestOfferExpiresAt)||"")>Date.now(),n=i&&Number(e==null?void 0:e.lowestPriceUSD)>0?`${Number(e.lowestPriceUSD).toFixed(0)} USD`:i&&Number(e==null?void 0:e.lowestPrice)>0?`${Number(e.lowestPrice)} ${e.lowestPriceCurrency||""}`:"-";return{name:C(e,s),brand:(e==null?void 0:e.brand)||"",category:(e==null?void 0:e.category)||"",score:(e==null?void 0:e.techScore)||"-",price:n,ks:t}}function R(e,s){return{name:C(e,s),brand:(e==null?void 0:e.brand)||"",category:(e==null?void 0:e.category)||"",techScore:Number(e==null?void 0:e.techScore)||0,url:G(e),imageUrl:(e==null?void 0:e.imageUrl)||(Array.isArray(e==null?void 0:e.images)?e.images[0]:""),specs:W(e,18)}}function $(e){return`LANGUAGE HARD GATE: Every user-facing sentence, label, list item, source description, button-like value, and explanation must be fully written in ${j(e)}. Only brand names, official product/model names, source names such as Reddit/YouTube/Amazon, and technical standards such as Thunderbolt, Wi-Fi, RTX, macOS may remain as-is. Do not output English UI labels such as "quiz answers", "similar products", "retailer reviews", "buy", "wait", "source types", "best time", or "community/review research" when the requested language is not English.`}function ce(e,s){const t=String(e||"").trim(),i=t.toLowerCase();return{"quiz answers":s("quiz answers","quiz cevapları"),"qor catalog specs":s("Qor catalog specs","Qor katalog özellikleri"),"community/review research":s("community/review research","topluluk ve yorum araştırması"),"similar products":s("similar products","benzer ürünler"),reddit:"Reddit","youtube reviews":s("YouTube reviews","YouTube incelemeleri"),"retailer reviews":s("retailer reviews","mağaza yorumları"),"specialist sources":s("specialist sources","uzman kaynaklar"),"source types":s("source types","kaynak türleri"),buy:s("buy","satın al"),wait:s("wait","bekle"),watch:s("watch","takip et")}[i]||b(t)}function V(e,s){return p(e).map(t=>ce(t,s))}function E(e=[]){const s=(Array.isArray(e)?e:[]).filter(t=>(t==null?void 0:t.answer)!=null).map((t,i)=>`${i+1}. ${t.question}: ${t.answer}`);return s.length?s.join(`
`):"No product-specific quiz answers were provided."}function T({quizAnswers:e=[],research:s="",similarProducts:t=[],offers:i=[],heroSpecs:n=[]}={},a){const o=(Array.isArray(t)?t:[]).slice(0,8).map(c=>R(c,a)),u=(Array.isArray(i)?i:[]).slice(0,8).map(c=>({store:(c==null?void 0:c.store)||(c==null?void 0:c.network)||"",price:c!=null&&c.hasExactPrice?`${c.price||""} ${c.currency||""}`.trim():"",country:(c==null?void 0:c.country)||"",checkedAt:(c==null?void 0:c.lastCheckedAt)||"",fresh:(c==null?void 0:c.hasExactPrice)===!0}));return{quizAnswers:E(e),research:String(s||"").slice(0,6500),similarProducts:o,offers:u,heroSpecs:Array.isArray(n)?n.slice(0,12):[]}}function Pe(e,s){const{name:t,brand:i,category:n,score:a,price:o,ks:u}=v(e,s);return`You are a senior tech product analyst. The product name is exactly "${t}" by ${i||"unknown"} (category: ${n}). Do NOT assume any typo in the product name — use it exactly as given.

IMPORTANT: Return ONLY valid JSON. ALL text fields, list items, and the verdict MUST be fully written in ${j(s)}.

Return a JSON object with this EXACT structure:
{
  "overallScore": <number 0-100>,
  "strengths": [{"name": "<aspect>", "score": <0-100>, "detail": "<1 sentence>"}],
  "weaknesses": [{"name": "<aspect>", "score": <0-100>, "detail": "<1 sentence>"}],
  "pros": ["<pro1>", "<pro2>", "<pro3>"],
  "cons": ["<con1>", "<con2>", "<con3>"],
  "verdict": "<2-3 sentence final verdict>"
}

Rules:
- Provide 3-5 strengths and 2-4 weaknesses
- Scores realistic and varied (not all 80-90)
- Pros/cons specific and informative (8-18 words each)
- Verdict must include concrete evidence
- Be honest and specific.

Context: techScore=${a}/100, approx price=${o}, key specs: ${u||"-"}`}function Ie(e,s){const{name:t,brand:i,category:n,price:a,ks:o}=v(e,s);return`You are a senior tech product analyst. For the product "${t}" by ${i||"unknown"} (category: ${n}), suggest the 3 strongest real, currently-available alternatives.

IMPORTANT: Return ONLY valid JSON. ALL text MUST be written in ${j(s)} (keep official product/model names as-is).

Return a JSON object with this EXACT structure:
{
  "alternatives": [
    {"name": "<product name>", "advantage": "<1 sentence why it can be better>", "tradeoff": "<1 sentence what you give up>", "priceComparison": "<cheaper/similar/pricier + short note>", "bestFor": "<who it fits>", "whyBetter": "<1 concrete spec-based reason>"}
  ]
}

Rules:
- Exactly 3 alternatives, real models in the same category/segment
- Be specific and grounded; no generic filler.

Context: approx price=${a}, key specs: ${o||"-"}`}function Fe(e,s,t={}){const{name:i,brand:n,category:a,price:o,ks:u}=v(e,s),c=Object.entries(t).filter(([,l])=>l!=null&&l!==""&&(!Array.isArray(l)||l.length)).map(([l,d])=>`${l}: ${Array.isArray(d)?d.join(", "):JSON.stringify(d)}`).slice(0,14).join("; ");return`You are an AI product advisor. For "${i}" by ${n||"unknown"} (category: ${a}), give tailored buying advice.

IMPORTANT: Return ONLY valid JSON. ALL text MUST be written in ${j(s)}.

Return a JSON object with this EXACT structure:
{
  "whoShouldBuy": "<2-3 sentences>",
  "whoShouldAvoid": "<2-3 sentences>",
  "reasonsToBuy": ["<r1>", "<r2>", "<r3>"],
  "reasonsToSkip": ["<r1>", "<r2>"],
  "proTips": ["<tip1>", "<tip2>"],
  "valueRating": <number 0-10 with one decimal>,
  "ratingExplanation": "<1-2 sentences>"
}

Rules:
- Be specific and grounded in the specs.
- valueRating reflects price/performance honestly.

Context: approx price=${o}, key specs: ${u||"-"}`+(c?`
User profile: ${c}`:"")}function Ue(e,s){const{name:t,brand:i,category:n,price:a,ks:o}=v(e,s);return`You are an AI price forecaster. For "${t}" by ${i||"unknown"} (category: ${n}), predict the near-term price trend.

IMPORTANT: Return ONLY valid JSON. ALL text MUST be written in ${j(s)}.

Return a JSON object with this EXACT structure:
{
  "trend": "<up|down|stable>",
  "trendPercentage": <number 0-100, magnitude of expected change>,
  "bestTimeToBuy": "<short phrase, e.g. a month/season>",
  "expectedDrop": "<expected % range within 6 months>",
  "buyOrWait": "<buy|wait>",
  "reasoning": "<2-3 sentences>"
}

Rules:
- Base it on product age, category cycle, supply/demand and successor timing.

Context: approx current price=${a}, key specs: ${o||"-"}`}function Me(e,s){const{name:t,brand:i,category:n,ks:a}=v(e,s);return`You are Qor AI analysing public community sentiment for "${t}" by ${i||"unknown"} (category: ${n}). Base it on widely-known discussions across public forums and communities (e.g. Reddit, XDA, dedicated enthusiast forums, large retailer review sections). Do NOT invent specific quotes or fake numbers — give a grounded synthesis.

IMPORTANT: Return ONLY valid JSON. ALL text MUST be written in ${j(s)} (keep forum/site names as-is).

Return a JSON object with this EXACT structure:
{
  "satisfaction": <number 0-100, overall % of owners who seem satisfied>,
  "summary": "<2-3 sentence synthesis of the community consensus>",
  "praise": ["<most common praise>", "<...>", "<...>"],
  "complaints": ["<most common complaint>", "<...>"],
  "sources": ["<forum/site 1>", "<forum/site 2>"],
  "verdict": "<1 sentence overall community verdict>"
}

Rules:
- satisfaction realistic (not always 90+).
- 3-5 praise, 2-4 complaints.
- Cite the kinds of communities where this product is discussed.

Context: key specs: ${a||"-"}`}function qe(e,s,t={}){const{name:i,brand:n,category:a,score:o,price:u,ks:c}=v(e,s);return`Research the product "${i}" by ${n||"unknown"} for a Qor AI purchase report.
Category: ${a||"-"}
Tech score in catalog: ${o}/100
Approx catalog price: ${u}
Catalog specs: ${c||"-"}

MARKET STATUS CONTEXT:
${A(e)}

${N()}
${$(s)}

Use current web search. Focus on official spec pages, current retailer/store pages, public ownership/review sentiment from Reddit, YouTube reviews, large retailer reviews, specialist review sites, and recent market/price-cycle signals. First determine whether the product is announced/released/available today, then summarize ownership evidence. Do not invent direct quotes, exact review counts, or exact current prices. If evidence is weak, say so clearly.

Product-specific quiz answers:
${E(t.quizAnswers)}

Reply in ${j(s)} with concise research notes only; no JSON is required.`}function Be(e,s,t={}){return`Research these products for a Qor AI comparison report.

${(e||[]).map((n,a)=>{const{name:o,brand:u,category:c,score:l,price:d,ks:h}=v(n,s);return`${a+1}. ${o} (${u||"?"}, ${c||"?"}) score=${l}/100 price=${d}; specs=${h||"-"}`}).join(`
`)}

MARKET STATUS CONTEXT:
${(e||[]).map((n,a)=>`Product ${a+1}:
${A(n)}`).join(`

`)}

${N()}
${$(s)}

Use current web search. For each product, gather current availability/status, public sentiment from Reddit, YouTube, specialist reviews, retailer reviews, official spec pages, and price-cycle signals. Then note the decisive differences that matter for a buyer choosing one. Do not invent quotes, exact counts, or exact live prices.

Comparison quiz answers:
${E(t.quizAnswers)}

Reply in ${j(s)} with concise research notes only; no JSON is required.`}function ze(e,s,t={},i={}){const{name:n,brand:a,category:o,score:u,price:c,ks:l}=v(e,s),d=T(i,s),h=Object.entries(t).filter(([,m])=>m!=null&&m!==""&&(!Array.isArray(m)||m.length)).map(([m,f])=>`${m}: ${Array.isArray(f)?f.join(", "):JSON.stringify(f)}`).slice(0,18).join("; ");return`You are Qor AI's senior product analyst and product advisor. Analyse "${n}" by ${a||"unknown"} (category: ${o}). Use the product name exactly as given. Do not replace it with a similar model.

${$(s)}

CRITICAL OUTPUT ORDER: one single continuous report: match/advisor/deep analysis first, internet/community sentiment second, smart alternatives third, price forecast last.
${N()}
Use catalog specs and quiz answers as verified inputs. Use research notes only when they support a claim; if something is not verified, say it is uncertain. Never invent direct quotes, exact review counts, or exact live prices.
Write like a professional buyer lab report: concrete, decisive, and detailed. Avoid generic praise. Mention exact catalog specs, compatibility constraints, who benefits, who should avoid it, and why.

Return ONLY one valid JSON object with this exact structure:
{
  "type": "product_full_report",
  "product": {
    "name": "exact product name",
    "matchScore": <0-100>,
    "decision": "buy|consider|skip",
    "confidence": <0-100>,
    "headline": "one decisive sentence a buyer can act on",
    "matchComment": "5-7 detailed sentences explaining quiz/profile fit, trade-offs, and who should care",
    "reviewedInputs": ["<input/source label in requested language>", "<input/source label in requested language>"],
    "factors": [{"label": "Usage fit", "score": <0-100>, "detail": "2 detailed sentences with evidence"}],
    "criticalPoints": [{"title": "short warning/insight", "detail": "2 sentences on why it changes the decision", "severity": "high|mid|low"}],
    "quizInsights": [{"topic": "what the question was about", "answer": "the user answer", "impact": <-100..100>, "note": "1-2 sentences on how it moved the score"}],
    "featureMatches": [{"label": "feature/spec", "productValue": "catalog value", "userNeed": "need inferred from quiz/profile", "score": <0-100>, "comment": "2 detailed sentences with evidence"}],
    "analysis": "8-11 substantial paragraphs, each 45-85 words: technical overview, performance/quality, compatibility, longevity, risks, buying advice; merge AI product advisor here",
    "strengths": ["6 detailed strengths grounded in specs"],
    "weaknesses": ["5 detailed weaknesses or caveats"],
    "reliabilityNotes": [{"title": "durability/support/warranty note", "detail": "1-2 sentences"}],
    "bestFor": "1-2 sentences describing the buyer this is perfect for",
    "notFor": "1-2 sentences describing who should skip it",
    "overallVerdict": "2-3 sentence closing verdict"
  },
  "community": {
    "satisfaction": <0-100>,
    "sentimentBreakdown": {"positive": <int>, "neutral": <int>, "negative": <int>},
    "themes": [{"label": "recurring discussion topic", "strength": <0-100>, "sentiment": "positive|neutral|negative", "detail": "1 sentence"}],
    "summary": "5-7 substantial paragraphs synthesizing Reddit, YouTube, retailer reviews, forums, and specialist reviews; include uncertainty where needed",
    "pros": ["6 recurring positive themes"],
    "cons": ["5 recurring negative themes"],
    "sources": ["Reddit", "<source type in requested language>", "<source type in requested language>"],
    "verificationNotes": ["what is directly grounded", "what remains uncertain"]
  },
  "alternatives": [
    {"name": "product name", "imageUrl": "copy from Qor catalog context when available, otherwise empty", "url": "copy from Qor catalog context when available, otherwise empty", "source": "qor_catalog|external", "keySpecs": [{"label": "spec", "value": "value"}], "difference": "2-3 sentences vs target", "shortComment": "1-2 sentence recommendation"}
  ],
  "priceForecast": {"trend": "up|down|stable", "confidence": <0-100>, "expectedChange": "range or uncertainty", "bestTimeToBuy": "specific month/season/window", "buyOrWait": "buy|wait|watch", "drivers": ["5 concrete drivers"], "analysis": "5-7 substantial paragraphs with researched reasoning and caveats"}
}

Rules:
- community.sentimentBreakdown must be integer percentages summing to ~100, realistic (never all-positive) and consistent with community.summary.
- community.themes must include 5-6 recurring discussion topics with varied sentiment (never all positive).
- product.criticalPoints must include 4-6 things that genuinely change the decision (compatibility traps, hidden costs, ecosystem lock-in, missing accessories, service coverage) — not restated specs.
- product.quizInsights must reference the ACTUAL quiz answers listed below, one entry per answered question (4-6). impact is negative when the answer works against this product. Never invent an answer that was not given.
- product.factors must include 8-10 varied factor scores for chart bars. Use labels that a buyer understands.
- featureMatches must include 8-10 spec/need matches using real catalog spec values where possible.
- alternatives must include 3 products. Prefer Qor catalog alternatives if they fit; copy imageUrl/url exactly from the context for those. External alternatives may have empty imageUrl/url.
- priceForecast must not pretend to know live prices unless research notes include them. Use market cycles, product age, availability, successor timing and retailer behavior.

MARKET / AVAILABILITY CONTEXT:
${A(e,i.offers)}

PRODUCT CONTEXT:
Name: ${n}
Brand: ${a||"-"}
Category: ${o||"-"}
Qor AI Tech Score: ${u}/100
Approx catalog price: ${c}
Catalog specs: ${l||"-"}
Hero specs: ${JSON.stringify(d.heroSpecs)}

PRODUCT-SPECIFIC QUIZ ANSWERS:
${d.quizAnswers}

`+(h?`USER PROFILE / USER-RECOGNITION SIGNALS:
${h}

`:"")+`QOR CATALOG ALTERNATIVES:
${JSON.stringify(d.similarProducts,null,2)}

OFFER CONTEXT:
${JSON.stringify(d.offers,null,2)}

WEB RESEARCH NOTES:
${d.research||"No grounded research notes were available; rely on catalog specs and clearly label uncertainty."}`}function De(e,s,t={},i={}){const n=(e||[]).map(m=>{const{name:f,brand:x,category:k,score:Q,ks:L}=v(m,s);return`- ${f} (${x||"?"} / ${k||"?"}; techScore=${Q}; specs: ${L||"-"})`}).join(`
`),a=(e||[]).map(m=>R(m,s)),o=T(i,s),u=Object.entries(t).filter(([,m])=>m!=null&&m!==""&&(!Array.isArray(m)||m.length)).map(([m,f])=>`${m}: ${Array.isArray(f)?f.join(", "):JSON.stringify(f)}`).slice(0,18).join("; "),c=(e||[]).length,l=c>=4,d=c===3,h={matchSent:l?"3-4":d?"4-5":"5-7",factorN:l?"5-6":d?"6-7":"8-10",featN:l?"5-6":d?"6-7":"8-10",analysisPara:l?"2-3":d?"3-4":"6-8",prosN:l?"3":d?"4":"6",consN:l?"3":"4-5",commPara:l?"2":d?"2-3":"4-5",fcPara:l?"1-2":d?"2":"3-4",diffN:l?"4":d?"5":"6",h2hPara:l?"2-3":d?"3-4":"5-6",recPara:l?"3":d?"3-4":"5-6"};return`You are Qor AI's senior product comparison analyst. Evaluate every listed product separately using the same system as product detail, then give a final recommendation.

${$(s)}

${N()}

Return ONLY one valid JSON object with this exact structure:
{
  "type": "compare_full_report",
  "products": [
    {"name": "exact product name", "imageUrl": "copy from product context", "url": "copy from product context", "matchScore": <0-100>, "decision": "buy|consider|skip", "confidence": <0-100>, "headline": "one decisive sentence", "matchComment": "${h.matchSent} detailed sentences", "factors": [{"label": "factor", "score": <0-100>, "detail": "2 evidence-based sentences"}], "criticalPoints": [{"title": "warning/insight", "detail": "2 sentences", "severity": "high|mid|low"}], "quizInsights": [{"topic": "topic", "answer": "user answer", "impact": <-100..100>, "note": "1-2 sentences"}], "featureMatches": [{"label": "feature/spec", "productValue": "value", "userNeed": "need", "score": <0-100>, "comment": "2 evidence-based sentences"}], "analysis": "${h.analysisPara} substantial paragraphs, each 45-85 words", "pros": ["${h.prosN} detailed pros"], "cons": ["${h.consN} detailed cons"], "bestFor": "1-2 sentences", "notFor": "1-2 sentences", "community": {"satisfaction": <0-100>, "themes": [{"label": "topic", "strength": <0-100>, "sentiment": "positive|neutral|negative", "detail": "1 sentence"}], "summary": "${h.commPara} substantial paragraphs", "pros": ["themes"], "cons": ["themes"], "sources": ["source types"]}, "priceForecast": {"trend": "up|down|stable", "confidence": <0-100>, "expectedChange": "range or uncertainty", "bestTimeToBuy": "window", "buyOrWait": "buy|wait|watch", "drivers": ["drivers"], "analysis": "${h.fcPara} substantial paragraphs"}}
  ],
  "comparison": {"winner": "exact product name", "winnerScore": <0-100>, "scoreGap": <number>, "chart": [{"name": "product", "score": <0-100>, "reason": "short reason"}], "factorMatrix": [{"label": "factor", "scores": [{"name": "product", "score": <0-100>}]}], "decisiveDifferences": ["${h.diffN} detailed differences"], "headToHead": "${h.h2hPara} substantial paragraphs", "recommendation": "${h.recPara} substantial paragraphs explaining which one to buy and why"}
}

Rules:
- Include one products[] entry for EVERY product (${c} total). Names must match exactly.
- First evaluate products separately; only then decide the final winner.
- Each product must include ${h.factorN} factor scores and ${h.featN} feature matches so the UI can render charts and spec-fit grids.
- Write concrete professional prose, not generic summaries. Mention exact specs, compatibility, availability uncertainty, buyer profile, and trade-offs.
- Stay within the requested paragraph/item counts so the JSON object is COMPLETE and valid for all ${c} products — never truncate mid-object.
- Scores must be realistic, varied and based on quiz answers, profile signals, catalog specs and research notes.
- Cite uncertainty instead of inventing live prices, review counts or quotes.

MARKET / AVAILABILITY CONTEXT:
${(e||[]).map((m,f)=>`Product ${f+1}:
${A(m)}`).join(`

`)}

PRODUCTS:
${n}

PRODUCT PAYLOAD:
${JSON.stringify(a,null,2)}

COMPARISON QUIZ ANSWERS:
${o.quizAnswers}

`+(u?`USER PROFILE / USER-RECOGNITION SIGNALS:
${u}

`:"")+`WEB RESEARCH NOTES:
${o.research||"No grounded research notes were available; rely on catalog specs and clearly label uncertainty."}`}function Ye(e,s,t={},i={}){const{name:n,brand:a,category:o,score:u,price:c,ks:l}=v(e,s),d=T(i,s),h=(i.peerNames||[]).filter(f=>f&&f!==n),m=Object.entries(t).filter(([,f])=>f!=null&&f!==""&&(!Array.isArray(f)||f.length)).map(([f,x])=>`${f}: ${Array.isArray(x)?x.join(", "):JSON.stringify(x)}`).slice(0,18).join("; ");return`You are Qor AI's senior product analyst. Produce ONE product's section of a multi-product comparison report. Evaluate ONLY "${n}" by ${a||"unknown"} (category: ${o}), but judge it in the CONTEXT of being compared against: ${h.join(", ")||"the other selected products"}.

${$(s)}

${N()}

Use catalog specs and quiz answers as verified inputs; use research notes only when they support a claim. Write like a professional buyer lab report: concrete, decisive, detailed. Never invent direct quotes, exact review counts, or exact live prices.

Return ONLY one valid JSON object for THIS product with this exact structure:
{
  "name": "exact product name",
  "matchScore": <0-100>,
  "decision": "buy|consider|skip",
  "confidence": <0-100>,
  "headline": "one decisive sentence",
  "matchComment": "5-6 detailed sentences on fit, trade-offs and who should care, relative to the other compared products",
  "factors": [{"label": "factor", "score": <0-100>, "detail": "2 evidence-based sentences"}],
  "criticalPoints": [{"title": "short warning/insight", "detail": "2 sentences", "severity": "high|mid|low"}],
  "quizInsights": [{"topic": "topic", "answer": "the user answer", "impact": <-100..100>, "note": "1-2 sentences"}],
  "featureMatches": [{"label": "feature/spec", "productValue": "catalog value", "userNeed": "need inferred from quiz/profile", "score": <0-100>, "comment": "2 evidence-based sentences"}],
  "analysis": "5-7 substantial paragraphs, each 45-85 words",
  "pros": ["6 detailed pros"],
  "cons": ["5 detailed cons"],
  "bestFor": "1-2 sentences",
  "notFor": "1-2 sentences",
  "overallVerdict": "2-3 sentence closing verdict for THIS product",
  "community": {"satisfaction": <0-100>, "sentimentBreakdown": {"positive": <int>, "neutral": <int>, "negative": <int>}, "themes": [{"label": "topic", "strength": <0-100>, "sentiment": "positive|neutral|negative", "detail": "1 sentence"}], "summary": "3-4 substantial paragraphs", "pros": ["themes"], "cons": ["themes"], "sources": ["source types"]},
  "priceForecast": {"trend": "up|down|stable", "confidence": <0-100>, "expectedChange": "range or uncertainty", "bestTimeToBuy": "window", "buyOrWait": "buy|wait|watch", "drivers": ["drivers"], "analysis": "2-3 substantial paragraphs"}
}

Rules:
- Include 8-10 factor scores and 8-10 feature matches so the UI can render charts and spec-fit grids.
- Include 4-6 criticalPoints, 4-6 quizInsights tied to the ACTUAL quiz answers below (impact negative when an answer works against this product), and 4-6 community.themes with varied sentiment.
- Scores realistic and varied, based on quiz answers, profile signals, catalog specs and research notes.
- Stay within the requested counts so the JSON object is COMPLETE and valid — never truncate mid-object.
- Cite uncertainty instead of inventing live prices, review counts or quotes.

MARKET / AVAILABILITY CONTEXT:
${A(e)}

PRODUCT:
Name: ${n}
Brand: ${a||"-"}
Category: ${o||"-"}
Qor AI Tech Score: ${u}/100
Approx catalog price: ${c}
Catalog specs: ${l||"-"}
Full payload: ${JSON.stringify(R(e,s))}

COMPARED AGAINST: ${h.join(", ")||"-"}

COMPARISON QUIZ ANSWERS:
${d.quizAnswers}

`+(m?`USER PROFILE / USER-RECOGNITION SIGNALS:
${m}

`:"")+`WEB RESEARCH NOTES:
${d.research||"No grounded research notes were available; rely on catalog specs and clearly label uncertainty."}`}function Je(e,s=[],t,i={},n={}){const a=T(n,t),o=(e||[]).map(l=>v(l,t).name),u=(s||[]).map(l=>({name:l==null?void 0:l.name,matchScore:l==null?void 0:l.matchScore,summary:de(l==null?void 0:l.matchComment,3),pros:p(l==null?void 0:l.pros).slice(0,4),cons:p(l==null?void 0:l.cons).slice(0,4),topFactors:p(l==null?void 0:l.factors).slice(0,8).map(d=>({label:d==null?void 0:d.label,score:d==null?void 0:d.score}))})),c=Object.entries(i).filter(([,l])=>l!=null&&l!==""&&(!Array.isArray(l)||l.length)).map(([l,d])=>`${l}: ${Array.isArray(d)?d.join(", "):JSON.stringify(d)}`).slice(0,18).join("; ");return`You are Qor AI's senior comparison analyst. Each product already has its own full review (compact summaries below). Produce ONLY the final cross-product comparison verdict.

${$(t)}

${N()}

Return ONLY one valid JSON object with this exact structure:
{
  "winner": "exact product name — must be exactly one of: ${o.join(" | ")}",
  "winnerScore": <0-100>,
  "scoreGap": <number>,
  "chart": [{"name": "product", "score": <0-100>, "reason": "short reason"}],
  "factorMatrix": [{"label": "factor", "scores": [{"name": "product", "score": <0-100>}]}],
  "decisiveDifferences": ["5-6 detailed differences"],
  "headToHead": "5-7 substantial paragraphs",
  "recommendation": "5-7 substantial paragraphs explaining which one to buy and why"
}

Rules:
- chart must include EVERY product (${o.length} total) by exact name.
- factorMatrix: 6-8 shared factors, each scored for every product by exact name.
- winner MUST be one of the listed names exactly.
- Be decisive and concrete; ground it in the per-product summaries, quiz answers and research.
- Stay within the counts so the JSON is COMPLETE and valid.

PRODUCTS (in column order): ${o.join(", ")}

PER-PRODUCT REVIEW SUMMARIES:
${JSON.stringify(u,null,2)}

COMPARISON QUIZ ANSWERS:
${a.quizAnswers}

`+(c?`USER PROFILE / USER-RECOGNITION SIGNALS:
${c}

`:"")+`WEB RESEARCH NOTES:
${a.research||"No grounded research notes were available."}`}function oe(e){if(!e)return null;let s=String(e).trim();const t=s.match(/```(?:json)?\s*([\s\S]*?)```/i);t&&(s=t[1].trim());const i=s.indexOf("{"),n=s.lastIndexOf("}");i!==-1&&n!==-1&&n>i&&(s=s.slice(i,n+1));try{return JSON.parse(s)}catch{}try{return JSON.parse(s.replace(/,\s*([}\]])/g,"$1"))}catch{return null}}const y=e=>{const s=parseFloat(String(e??"").replace(/[^\d.-]/g,""));return Number.isFinite(s)?Math.round(s):0},le=e=>{const s=parseFloat(String(e??"").replace(",",".").replace(/[^\d.-]/g,""));return Number.isFinite(s)?s:0},p=e=>Array.isArray(e)?e.filter(s=>s!=null&&String(s).trim()):[];function de(e,s=2){const t=String(e||"").replace(/\s+/g," ").trim();if(!t)return"";const i=t.split(new RegExp("(?<=[.!?])\\s+")).filter(Boolean);return i.length?i.slice(0,s).join(" "):t}function P(e){return e>=80?"#22c55e":e>=60?"#f59e0b":"#f43f5e"}function I({value:e,max:s=100,suffix:t="/ 100"}){const i=Math.max(0,Math.min(s,Number(e)||0)),n=P(i/s*100),a=44,o=2*Math.PI*a,u=X(),[c,l]=F.useState(u);F.useEffect(()=>{if(u){l(!0);return}const m=setTimeout(()=>l(!0),40);return()=>clearTimeout(m)},[u]);const d=(c?i:0)/s,h=K(i,{duration:900});return r.jsxs("div",{className:"ai-ring",children:[r.jsxs("svg",{width:"100",height:"100",viewBox:"0 0 100 100",children:[r.jsx("circle",{cx:"50",cy:"50",r:a,fill:"none",stroke:n,strokeOpacity:"0.14",strokeWidth:"8"}),r.jsx("circle",{cx:"50",cy:"50",r:a,fill:"none",stroke:n,strokeWidth:"8",strokeLinecap:"round",strokeDasharray:o,strokeDashoffset:o*(1-d),transform:"rotate(-90 50 50)",style:{transition:u?"none":"stroke-dashoffset .9s cubic-bezier(.22,.61,.36,1)"}})]}),r.jsxs("div",{className:"ai-ring-t",style:{color:n},children:[r.jsx("b",{children:Math.round(h)}),r.jsx("small",{children:t})]})]})}function U({name:e,score:s,detail:t,color:i}){const n=Math.max(0,Math.min(100,Number(s)||0));return r.jsxs("div",{className:"ai-attr",children:[r.jsxs("div",{className:"ai-attr-top",children:[r.jsx("span",{className:"ai-attr-name",children:e}),r.jsx("span",{className:"ai-attr-score",style:{color:i},children:n})]}),r.jsx("div",{className:"ai-attr-track",style:{background:`${i}1f`},children:r.jsx(z,{pct:n,color:i,gradient:!0})}),t?r.jsx("small",{className:"ai-attr-detail",children:t}):null]})}function w({icon:e,title:s,items:t,color:i}){return t.length?r.jsxs("div",{className:"ai-procon",style:{borderColor:`${i}33`,background:`${i}0d`},children:[r.jsxs("h5",{style:{color:i},children:[e," ",s]}),r.jsx("ul",{children:t.map((n,a)=>r.jsxs("li",{children:[r.jsx("span",{style:{color:i},children:e==="✓"?"✓":"•"}),n]},a))})]}):null}function M({icon:e,label:s,color:t}){return r.jsxs("div",{className:"ai-seclabel",style:{color:t},children:[e," ",s]})}function ue({data:e,L:s}){const t=y(e.overallScore),i=p(e.strengths).map(c=>({name:c.name||"",score:y(c.score),detail:c.detail||""})),n=p(e.weaknesses).map(c=>({name:c.name||"",score:y(c.score),detail:c.detail||""})),a=p(e.pros).map(String),o=p(e.cons).map(String),u=String(e.verdict||"").trim();return r.jsxs("div",{className:"ai-deep",children:[t>0&&r.jsx("div",{className:"ai-center",children:r.jsx(I,{value:t})}),i.length>0&&r.jsxs(r.Fragment,{children:[r.jsx(M,{icon:"📈",label:s("Strengths","Güçlü Yönler"),color:"#22c55e"}),i.map((c,l)=>r.jsx(U,{...c,color:"#22c55e"},l))]}),n.length>0&&r.jsxs(r.Fragment,{children:[r.jsx(M,{icon:"📉",label:s("Weaknesses","Zayıf Yönler"),color:"#f43f5e"}),n.map((c,l)=>r.jsx(U,{...c,color:"#f43f5e"},l))]}),(a.length>0||o.length>0)&&r.jsxs("div",{className:"ai-procon-row",children:[r.jsx(w,{icon:"✓",title:s("Pros","Artılar"),items:a,color:"#22c55e"}),r.jsx(w,{icon:"✕",title:s("Cons","Eksiler"),items:o,color:"#f43f5e"})]}),u&&r.jsxs("div",{className:"ai-verdict",children:[r.jsx("span",{children:"💡"}),r.jsx("p",{children:u})]})]})}function me({data:e,L:s}){const t=p(e.alternatives);return t.length?r.jsx("div",{className:"ai-alts",children:t.map((i,n)=>r.jsxs("div",{className:"ai-alt",children:[r.jsx("div",{className:"ai-alt-name",children:b(i.name)}),i.whyBetter&&r.jsxs("div",{className:"ai-alt-why",children:["★ ",i.whyBetter]}),r.jsxs("div",{className:"ai-alt-grid",children:[i.advantage&&r.jsxs("div",{className:"ai-alt-cell ai-alt-adv",children:[r.jsx("b",{children:s("Advantage","Avantaj")}),r.jsx("span",{children:i.advantage})]}),i.tradeoff&&r.jsxs("div",{className:"ai-alt-cell ai-alt-trade",children:[r.jsx("b",{children:s("Trade-off","Dezavantaj")}),r.jsx("span",{children:i.tradeoff})]}),i.priceComparison&&r.jsxs("div",{className:"ai-alt-cell",children:[r.jsx("b",{children:s("Price","Fiyat")}),r.jsx("span",{children:i.priceComparison})]}),i.bestFor&&r.jsxs("div",{className:"ai-alt-cell",children:[r.jsx("b",{children:s("Best for","Kime uygun")}),r.jsx("span",{children:i.bestFor})]})]})]},n))}):null}function he({data:e,L:s}){const t=le(e.valueRating),i=p(e.reasonsToBuy).map(String),n=p(e.reasonsToSkip).map(String),a=p(e.proTips).map(String);return r.jsxs("div",{className:"ai-advisor",children:[t>0&&r.jsx("div",{className:"ai-center",children:r.jsx(I,{value:t,max:10,suffix:"/ 10"})}),String(e.ratingExplanation||"").trim()&&r.jsx("p",{className:"ai-advisor-exp",children:e.ratingExplanation}),String(e.whoShouldBuy||"").trim()&&r.jsxs("div",{className:"ai-advisor-box ai-good",children:[r.jsxs("b",{children:["👍 ",s("Who should buy","Kime uygun")]}),r.jsx("p",{children:e.whoShouldBuy})]}),String(e.whoShouldAvoid||"").trim()&&r.jsxs("div",{className:"ai-advisor-box ai-bad",children:[r.jsxs("b",{children:["👎 ",s("Who should avoid","Kime uygun değil")]}),r.jsx("p",{children:e.whoShouldAvoid})]}),(i.length>0||n.length>0)&&r.jsxs("div",{className:"ai-procon-row",children:[r.jsx(w,{icon:"✓",title:s("Reasons to buy","Alma sebepleri"),items:i,color:"#22c55e"}),r.jsx(w,{icon:"✕",title:s("Reasons to skip","Almama sebepleri"),items:n,color:"#f43f5e"})]}),a.length>0&&r.jsxs("div",{className:"ai-tips",children:[r.jsxs("b",{children:["💡 ",s("Pro tips","İpuçları")]}),r.jsx("ul",{children:a.map((o,u)=>r.jsx("li",{children:o},u))})]})]})}function pe({data:e,L:s}){const t=String(e.trend||"stable").toLowerCase(),i=y(e.trendPercentage),n=String(e.buyOrWait||"buy").toLowerCase(),a=t==="down"?"↓":t==="up"?"↑":"→",o=t==="down"?"#22c55e":t==="up"?"#f43f5e":"#f59e0b";return r.jsxs("div",{className:"ai-pred",children:[r.jsxs("div",{className:"ai-pred-head",children:[r.jsxs("div",{className:"ai-pred-trend",style:{color:o},children:[r.jsx("span",{className:"ai-pred-arrow",children:a}),r.jsxs("div",{children:[r.jsx("b",{children:t==="down"?s("Falling","Düşüyor"):t==="up"?s("Rising","Yükseliyor"):s("Stable","Sabit")}),i>0&&r.jsxs("small",{children:["~",i,"%"]})]})]}),r.jsx("div",{className:"ai-pred-verdict "+(n==="wait"?"wait":"buy"),children:n==="wait"?`⏳ ${s("Wait","Bekle")}`:`✓ ${s("Buy now","Şimdi al")}`})]}),r.jsxs("div",{className:"ai-pred-grid",children:[String(e.bestTimeToBuy||"").trim()&&r.jsxs("div",{className:"ai-pred-cell",children:[r.jsx("b",{children:s("Best time","En iyi zaman")}),r.jsx("span",{children:e.bestTimeToBuy})]}),String(e.expectedDrop||"").trim()&&r.jsxs("div",{className:"ai-pred-cell",children:[r.jsx("b",{children:s("Expected drop","Beklenen indirim")}),r.jsx("span",{children:e.expectedDrop})]})]}),String(e.reasoning||"").trim()&&r.jsx("p",{className:"ai-pred-reason",children:e.reasoning})]})}function fe({data:e,L:s}){const t=b(e.winner||""),i=p(e.products).map(a=>({name:b(a.name||""),score:y(a.score),bestFor:a.bestFor||"",pros:p(a.pros).map(String),cons:p(a.cons).map(String)}));if(!i.length)return null;const n=Math.max(1,...i.map(a=>a.score));return r.jsxs("div",{className:"ai-cmp",children:[t&&r.jsxs("div",{className:"ai-cmp-winner",children:[r.jsx("span",{children:"🏆"}),r.jsxs("div",{children:[r.jsx("small",{children:s("AI pick","AI seçimi")}),r.jsx("b",{children:t})]})]}),String(e.verdict||"").trim()&&r.jsx("p",{className:"ai-cmp-verdict",children:e.verdict}),r.jsx("div",{className:"ai-cmp-products",children:i.map((a,o)=>{const u=t&&a.name.toLowerCase()===t.toLowerCase(),c=u?"#22c55e":"#3b82f6";return r.jsxs("div",{className:"ai-cmp-prod"+(u?" win":""),children:[r.jsxs("div",{className:"ai-cmp-prod-top",children:[r.jsxs("span",{className:"ai-cmp-prod-name",children:[u?"★ ":"",a.name]}),r.jsx("span",{className:"ai-cmp-prod-score",style:{color:c},children:a.score})]}),r.jsx("div",{className:"ai-attr-track",style:{background:`${c}1f`},children:r.jsx("i",{style:{width:`${a.score/n*100}%`,background:`linear-gradient(90deg, ${c}80, ${c})`}})}),a.bestFor&&r.jsxs("div",{className:"ai-cmp-bestfor",children:[s("Best for","Kime uygun"),": ",r.jsx("b",{children:a.bestFor})]}),(a.pros.length>0||a.cons.length>0)&&r.jsxs("div",{className:"ai-procon-row",children:[r.jsx(w,{icon:"✓",title:s("Pros","Artılar"),items:a.pros,color:"#22c55e"}),r.jsx(w,{icon:"✕",title:s("Cons","Eksiler"),items:a.cons,color:"#f43f5e"})]})]},o)})}),String(e.recommendation||"").trim()&&r.jsxs("div",{className:"ai-verdict",children:[r.jsx("span",{children:"💡"}),r.jsx("p",{children:e.recommendation})]})]})}function ge({data:e,L:s}){const t=y(e.satisfaction),i=p(e.praise).map(String),n=p(e.complaints).map(String),a=V(e.sources,s);return r.jsxs("div",{className:"ai-forum",children:[t>0&&r.jsxs("div",{className:"ai-forum-gauge",children:[r.jsx(I,{value:t,suffix:"%"}),r.jsxs("div",{className:"ai-forum-gauge-t",children:[r.jsx("b",{children:s("Community satisfaction","Topluluk memnuniyeti")}),r.jsx("small",{children:s("Synthesised from public forums & reviews","Açık forum ve yorumlardan derlendi")})]})]}),String(e.summary||"").trim()&&r.jsx("p",{className:"ai-forum-summary",children:e.summary}),(i.length>0||n.length>0)&&r.jsxs("div",{className:"ai-procon-row",children:[r.jsx(w,{icon:"✓",title:s("People love","Beğenilenler"),items:i,color:"#22c55e"}),r.jsx(w,{icon:"✕",title:s("Common complaints","Şikayetler"),items:n,color:"#f43f5e"})]}),a.length>0&&r.jsxs("div",{className:"ai-forum-sources",children:[r.jsxs("small",{children:[s("Sources","Kaynaklar"),":"]}),a.map((o,u)=>r.jsx("span",{className:"ai-forum-src",children:o},u))]}),String(e.verdict||"").trim()&&r.jsxs("div",{className:"ai-verdict",children:[r.jsx("span",{children:"👥"}),r.jsx("p",{children:e.verdict})]})]})}function q({text:e}){const s=String(e||"").trim();let t=s.split(/\n{2,}/g).map(i=>i.trim()).filter(Boolean);if(t.length<=1){const i=s.split(new RegExp("(?<=[.!?])\\s+(?=[A-ZÇĞİÖŞÜ0-9])","g")).map(n=>n.trim()).filter(Boolean);t=[];for(let n=0;n<i.length;n+=2)t.push(i.slice(n,n+2).join(" "))}return t.length?r.jsx("div",{className:"ai-report-prose",children:t.map((i,n)=>r.jsx("p",{children:i},n))}):null}function ye({items:e,tone:s="neutral"}){const t=p(e).map(String);return t.length?r.jsx("ul",{className:"ai-report-list "+s,children:t.map((i,n)=>r.jsx("li",{children:i},n))}):null}function be({alternatives:e=[],L:s}){const t=p(e);return t.length?r.jsx("div",{className:"ai-alt-cards",children:t.map((i,n)=>{const a=p(i.keySpecs),o=r.jsxs("article",{className:"ai-alt-card",children:[r.jsx("div",{className:"ai-alt-media",children:i.imageUrl?r.jsx(B,{src:i.imageUrl,alt:b(i.name||""),size:"thumb"}):r.jsx("span",{children:n+1})}),r.jsxs("div",{className:"ai-alt-copy",children:[r.jsxs("div",{className:"ai-alt-card-top",children:[r.jsx("b",{children:b(i.name)}),r.jsx("small",{children:i.source==="qor_catalog"?s("Qor catalog","Qor kataloğu"):s("External","Harici")})]}),i.shortComment&&r.jsx("p",{children:i.shortComment}),i.difference&&r.jsx("p",{className:"ai-alt-diff",children:i.difference}),a.length>0&&r.jsx("div",{className:"ai-alt-specs",children:a.slice(0,4).map((u,c)=>r.jsxs("span",{children:[r.jsx("small",{children:u.label}),r.jsx("b",{children:u.value})]},c))})]})]});return i.url?r.jsx("a",{href:i.url,className:"ai-alt-link",children:o},`${i.name}-${n}`):r.jsx("div",{children:o},`${i.name}-${n}`)})}):null}function ve({data:e,L:s,lang:t}){var a;const i=te(e),n=p(e.alternatives);return r.jsx(D,{data:i,L:s,lang:t,showHead:!1,heroExtra:null,altNode:n.length>0?r.jsx(Z,{icon:"🔀",title:s("Smart alternatives","Akıllı alternatifler"),children:r.jsx(be,{alternatives:n,L:s})}):null,tailNode:p((a=e.product)==null?void 0:a.reviewedInputs).length>0?r.jsxs("div",{className:"la-verify",children:[r.jsxs("strong",{children:["🧾 ",s("Inputs used","Kullanılan girdiler")]}),r.jsx("ul",{children:V(e.product.reviewedInputs,s).map((o,u)=>r.jsx("li",{children:o},u))})]}):null})}function xe({chart:e=[],L:s}){const t=p(e).map(n=>({name:b(n.name||""),score:y(n.score),reason:n.reason||""})).filter(n=>n.name).sort((n,a)=>a.score-n.score);if(!t.length)return null;const i=Math.max(1,...t.map(n=>n.score));return r.jsxs("div",{className:"ai-compare-chart",children:[t.map((n,a)=>{const o=P(n.score);return r.jsxs("div",{className:"ai-compare-chart-row",children:[r.jsx("span",{children:n.name}),r.jsx("div",{children:r.jsx(z,{pct:Math.max(4,n.score/i*100),color:o,delay:a*90})}),r.jsx("b",{style:{color:o},children:n.score}),n.reason&&r.jsx("small",{children:n.reason})]},`${n.name}-${a}`)}),r.jsx("small",{className:"ai-report-hint",children:s("Final scores are personalized to the comparison quiz.","Final puanlar karşılaştırma quizine göre kişiselleştirildi.")})]})}function we({rows:e=[]}){const s=p(e).filter(t=>(t==null?void 0:t.label)&&Array.isArray(t.scores));return s.length?r.jsx("div",{className:"ai-factor-matrix",children:s.map((t,i)=>r.jsxs("div",{className:"ai-factor-matrix-row",children:[r.jsx("b",{children:t.label}),r.jsx("div",{children:t.scores.map((n,a)=>{const o=y(n.score);return r.jsxs("span",{children:[r.jsx("small",{children:b(n.name)}),r.jsx("i",{style:{width:`${Math.max(4,o)}%`,background:P(o)}}),r.jsx("strong",{children:o})]},`${n.name}-${a}`)})})]},`${t.label}-${i}`))}):null}function je({cmp:e={},L:s}){return e.winner||p(e.chart).length||p(e.factorMatrix).length||p(e.decisiveDifferences).length||String(e.headToHead||"").trim()||String(e.recommendation||"").trim()?r.jsxs("section",{className:"ai-report-section ai-cmp-overview",children:[r.jsx("div",{className:"ai-report-eyebrow",children:s("AI overall comparison","AI genel karşılaştırma")}),r.jsx("h4",{children:s("Which one wins for you","Senin için hangisi kazanıyor")}),e.winner&&r.jsxs("div",{className:"ai-cmp-winner",children:[r.jsx("span",{children:"★"}),r.jsxs("div",{children:[r.jsx("small",{children:s("Recommended pick","Önerilen seçim")}),r.jsx("b",{children:b(e.winner)})]}),y(e.winnerScore)>0&&r.jsxs("div",{className:"ai-cmp-winner-score",children:[r.jsx("strong",{children:y(e.winnerScore)}),r.jsx("small",{children:s("fit for you","sana uygunluk")})]})]}),r.jsx(xe,{chart:e.chart,L:s}),r.jsx(we,{rows:e.factorMatrix}),(p(e.decisiveDifferences).length>0||String(e.headToHead||"").trim()||String(e.recommendation||"").trim())&&r.jsxs(_,{label:`📖 ${s("Detailed analysis","Detaylı analiz")}`,children:[r.jsx(ye,{items:e.decisiveDifferences,tone:"notes"}),r.jsx(q,{text:e.headToHead}),String(e.recommendation||"").trim()&&r.jsxs("div",{className:"ai-verdict",children:[r.jsx("span",{children:"✓"}),r.jsx("div",{children:r.jsx(q,{text:e.recommendation})})]})]})]}):null}function Ne({data:e={},L:s,lang:t}){return r.jsx(D,{data:ne(e),L:s,lang:t,showHead:!1})}function Se({data:e,L:s,lang:t,products:i=[]}){const n=p(e.products),a=e.comparison||{},o=d=>b(String(d||"")).toLowerCase().replace(/\s+/g," ").trim(),u=(i.length?i:n).map((d,h)=>{if(i.length){const f=C(d,t),x=n.find(k=>o(k.name)===o(f))||n[h]||{};return{ai:x,image:d.imageUrl||x.imageUrl||"",name:f,key:d.id||`${f}-${h}`}}const m=b(d.name||"");return{ai:d,image:d.imageUrl||"",name:m,key:`${m}-${h}`}}).filter(d=>d.name||d.ai&&Object.keys(d.ai).length),c=o(a.winner||""),l=u.map(d=>{var h;return{name:d.name,factors:p((h=d.ai)==null?void 0:h.factors).map(m=>({label:m==null?void 0:m.label,score:y(m==null?void 0:m.score)}))}}).filter(d=>d.factors.length>0);return r.jsxs("div",{className:"ai-report ai-report-compare",children:[r.jsx(je,{cmp:a,L:s}),l.length>=2&&r.jsx(H,{products:l,L:s}),u.length>0&&r.jsx("div",{className:"ai-cmp-reports",children:u.map((d,h)=>{const m=c&&o(d.name)===c;return r.jsxs("section",{className:"ai-cmp-report"+(m?" winner":""),children:[r.jsxs("header",{className:"ai-cmp-report-head",children:[m&&r.jsxs("span",{className:"ai-cmp-report-win",children:["★ ",s("AI pick","AI seçimi")]}),r.jsx("span",{className:"ai-cmp-report-no",children:h+1}),d.image?r.jsx(B,{src:d.image,alt:d.name,size:"thumb"}):null,r.jsxs("div",{className:"ai-cmp-report-id",children:[r.jsx("small",{children:s("Full AI review","Detaylı AI incelemesi")}),r.jsx("b",{children:d.name})]})]}),r.jsx(Ne,{data:d.ai,L:s,lang:t})]},d.key)})})]})}function We({kind:e,raw:s,data:t,lang:i,products:n}){const a=t&&typeof t=="object"?t:oe(s);if(!a||typeof a!="object")return null;const o=String(i||"en").slice(0,2).toLowerCase(),u=(c,l)=>o==="tr"?l:c;return e==="productFull"||a.type==="product_full_report"?r.jsx(ve,{data:a,L:u,lang:i}):e==="compareFull"||a.type==="compare_full_report"?r.jsx(Se,{data:a,L:u,lang:i,products:n}):e==="deep"?r.jsx(ue,{data:a,L:u}):e==="alts"?r.jsx(me,{data:a,L:u}):e==="advisor"?r.jsx(he,{data:a,L:u}):e==="pred"?r.jsx(pe,{data:a,L:u}):e==="compare"?r.jsx(fe,{data:a,L:u}):e==="forum"?r.jsx(ge,{data:a,L:u}):null}export{ve as ProductFullReport,Fe as buildAdvisorPrompt,Ie as buildAltPrompt,Ye as buildCompareProductPrompt,De as buildComparePrompt,Be as buildCompareResearchPrompt,Je as buildCompareVerdictPrompt,Pe as buildDeepPrompt,Me as buildForumPrompt,ze as buildFullPrompt,Ue as buildPredictionPrompt,qe as buildProductResearchPrompt,We as default,Re as hasStaleAvailabilityClaims,oe as parseAiJson,Ee as withFreshnessRetryInstruction};
