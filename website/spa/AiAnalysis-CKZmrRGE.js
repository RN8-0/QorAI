import{a8 as r,E as k,u as x,g as q,ap as G}from"./index-9OISHqNk.js";import{d as I}from"./vendor-Mg1MKsk6.js";import{H as J,C as H,I as K,G as _,B as z}from"./AiText-WsbB510S.js";import{A as M,S as X}from"./AiReportView-CdrQ-KPq.js";const $=e=>{const s=parseFloat(String(e??"").replace(/[^\d.-]/g,""));return Number.isFinite(s)?Math.round(s):0},g=e=>Array.isArray(e)?e.filter(s=>s!=null&&String(s).trim()):[];function Z(e){const s=String(e||"").replace(/\s+/g," ").trim();if(!s)return"";const t=s.match(/[^.!?]+[.!?]?/);return(t?t[0]:s).trim()}function L(e,s){const t=String(s||"").toLowerCase();return t==="buy"||t==="consider"||t==="skip"?t:e>=75?"buy":e>=55?"consider":"skip"}function ee(e={}){if(!e||typeof e!="object")return null;const s=String(e.trend||"").toLowerCase(),t={trend:["up","down","stable"].includes(s)?s:"",bestTime:String(e.bestTimeToBuy||e.bestTime||"").trim(),expectedChange:String(e.expectedChange||"").trim(),note:String(e.analysis||e.note||"").trim(),drivers:g(e.drivers)};return t.bestTime||t.note||t.expectedChange||t.drivers.length?t:null}function B(e={},s={},t={}){const n=$(e.matchScore||e.overallScore||e.score),i=s&&typeof s=="object"?s:{};return{enhancedScore:n,decision:L(n,e.decision),headline:String(e.headline||"").trim()||Z(e.matchComment),researched:!!t.researched,confidence:$(e.confidence),base:{title:String(e.name||t.title||"").trim(),siteName:String(t.siteName||"").trim(),url:String(t.url||e.url||"").trim()},url:String(t.url||e.url||"").trim(),factors:g(e.factors),criticalPoints:g(e.criticalPoints),quizInsights:g(e.quizInsights),prosForUser:g(e.strengths).length?g(e.strengths):g(e.pros),consForUser:g(e.weaknesses).length?g(e.weaknesses):g(e.cons),featureMatches:g(e.featureMatches),reliabilityNotes:g(e.reliabilityNotes),personaAnalysis:String(e.matchComment||"").trim(),personaScore:n,verdict:String(e.analysis||"").trim(),overallVerdict:String(e.overallVerdict||t.overallVerdict||"").trim(),bestFor:String(e.bestFor||"").trim(),notFor:String(e.notFor||"").trim(),communityScore:$(i.satisfaction),sentimentBreakdown:i.sentimentBreakdown||i.sentiment_breakdown||null,communityThemes:g(i.themes),communityAnalysis:String(i.summary||"").trim(),praisePoints:g(i.pros),complaintPoints:g(i.cons),sources:g(i.sources),verificationNotes:g(i.verificationNotes),priceOutlook:ee(e.priceForecast||t.priceForecast),catalogMatch:t.catalogMatch||null}}function re(e={},s={}){const t=e.product||{};return B(t,e.community,{...s,title:s.title||e.name,researched:s.researched??!!e.researched,priceForecast:e.priceForecast})}function se(e={},s={}){return B(e,e.community,{...s,url:s.url||e.url,priceForecast:e.priceForecast})}const te={tr:"Turkish",en:"English",de:"German",es:"Spanish",fr:"French",it:"Italian",pt:"Portuguese",ru:"Russian",nl:"Dutch",pl:"Polish",sv:"Swedish",ja:"Japanese",ar:"Arabic"};function T(e){return te[String(e||"en").slice(0,2).toLowerCase()]||"English"}const D=new Date().toISOString().slice(0,10);function w(e){if(!e)return"";const s=typeof e=="number"?e:Date.parse(e);return!Number.isFinite(s)||s<=0?"":new Date(s).toISOString().slice(0,10)}function A(e,s=[]){const t=[`Current date: ${D}`,`Qor catalog record exists: ${e!=null&&e.id?"yes":"unknown"}`];e!=null&&e.sourceUrl&&t.push(`Catalog source URL: ${e.sourceUrl}`),e!=null&&e.gtin&&t.push(`GTIN: ${e.gtin}`),e!=null&&e.mpn&&t.push(`MPN: ${e.mpn}`),(e!=null&&e.created||e!=null&&e.createdAt)&&t.push(`Catalog first seen: ${w(e.created||e.createdAt)}`),(e!=null&&e.updated||e!=null&&e.lastUpdated)&&t.push(`Catalog updated: ${w(e.updated||e.lastUpdated)}`),e!=null&&e.scrapedAtTs&&t.push(`Search index scraped: ${w(Number(e.scrapedAtTs)*1e3)}`),e!=null&&e.updatedAtTs&&t.push(`Search index updated: ${w(Number(e.updatedAtTs)*1e3)}`),(Number(e==null?void 0:e.offerCount)>0||Number(e==null?void 0:e.pricedOfferCount)>0)&&t.push(`Catalog offer rollup: ${Number(e.offerCount)||0} links, ${Number(e.pricedOfferCount)||0} priced offers`),e!=null&&e.bestOfferCheckedAt&&t.push(`Best offer checked: ${w(e.bestOfferCheckedAt)}`),e!=null&&e.bestOfferExpiresAt&&t.push(`Best offer freshness expires: ${w(e.bestOfferExpiresAt)}`);const n=(Array.isArray(s)?s:[]).filter(i=>i==null?void 0:i.url).slice(0,8).map(i=>{const a=i!=null&&i.hasExactPrice&&Number(i==null?void 0:i.price)>0?`${i.price} ${i.currency||""}`.trim():"price link only";return`${i.store||i.network||"store"} ${i.country||""}: ${a}`});return n.length&&t.push(`Live/store offer context: ${n.join(" | ")}`),t.filter(Boolean).join(`
`)}function j(){return`Freshness rules (current date: ${D}):
- Prefer current web research and official/store evidence over model memory.
- Never say a product is unannounced, not released, not on the market, or only an estimate if current research, official pages, retailer pages, or the Qor catalog indicate it exists.
- If current web research is unavailable or weak, say the evidence is limited; do not fill the gap with old launch-status assumptions.
- Do not base a current-generation product on the previous generation unless explicitly framed as a comparison.
- Do not treat a laptop fan as a real weakness by itself. Mention fan noise only if research reports it as recurring, or phrase it as sustained-load behavior.
- Judge portability against the same class. Around 2.1 kg is normal/acceptable for a 16-inch workstation laptop, not a severe flaw by default.`}const ie=[/hen[üu]z\s+(?:duyurulmam[ıi]ş|tan[ıi]t[ıi]lmam[ıi]ş|piyasada\s+de[ğg]il|sat[ıi]şa\s+[çc][ıi]kmam[ıi]ş|[çc][ıi]kmad[ıi])/i,/(?:daha|hen[üu]z)\s+(?:piyasada|sat[ıi]şta)\s+(?:de[ğg]il|yok)/i,/performans\s+tahmin(?:i|leri).{0,90}(?:M4|[öo]nceki\s+nesil|previous generation)/i,/M4\s+Max.{0,90}(?:dayan|baz|temel|based)/i,/\b(?:unannounced|not yet announced|not yet released|not yet launched|not yet available)\b/i,/\bnot\s+(?:yet\s+)?(?:on the market|released|launched)\b/i,/performance\s+estimates?.{0,90}(?:M4|previous generation)/i];function ke(e){const s=String(e||"");return ie.some(t=>t.test(s))}function Te(e,s=[]){const t=(Array.isArray(s)?s:[s]).map(n=>String(n||"").trim()).filter(Boolean).join(", ");return`${e}

QUALITY GATE RETRY:
The previous answer was rejected because it contained stale release/availability claims. Rewrite the JSON from scratch.
`+(t?`Products that must keep exact names: ${t}
`:"")+j()+`
Forbidden stale wording includes: unannounced, not on the market, not released, not yet available, based on M4 Max estimates, or equivalent Turkish/German wording unless current web research explicitly proves it.`}function W(e,s=40){const t=[],n=new Set,i=(a,o)=>{const l=String(a||"").replace(/\s+/g," ").trim(),c=String(o??"").replace(/\s+/g," ").trim();if(!l||!c)return;const u=l.toLowerCase();n.has(u)||(n.add(u),t.push(`${l}: ${c}`))};return e!=null&&e.keySpecs&&typeof e.keySpecs=="object"&&Object.entries(e.keySpecs).forEach(([a,o])=>i(a,o)),e!=null&&e.specs&&typeof e.specs=="object"&&Object.entries(e.specs).forEach(([a,o])=>i(a,o)),e!=null&&e.specSections&&typeof e.specSections=="object"&&Object.entries(e.specSections).forEach(([a,o])=>{o&&typeof o=="object"&&!Array.isArray(o)&&Object.entries(o).forEach(([l,c])=>i(`${a} / ${l}`,c))}),t.slice(0,s).join("; ")}function S(e,s){const t=W(e,42),n=Date.parse((e==null?void 0:e.bestOfferExpiresAt)||"")>Date.now(),i=n&&Number(e==null?void 0:e.lowestPriceUSD)>0?`${Number(e.lowestPriceUSD).toFixed(0)} USD`:n&&Number(e==null?void 0:e.lowestPrice)>0?`${Number(e.lowestPrice)} ${e.lowestPriceCurrency||""}`:"-";return{name:k(e,s),brand:(e==null?void 0:e.brand)||"",category:(e==null?void 0:e.category)||"",score:(e==null?void 0:e.techScore)||"-",price:i,ks:t}}function Q(e,s){return{name:k(e,s),brand:(e==null?void 0:e.brand)||"",category:(e==null?void 0:e.category)||"",techScore:Number(e==null?void 0:e.techScore)||0,url:G(e),imageUrl:(e==null?void 0:e.imageUrl)||(Array.isArray(e==null?void 0:e.images)?e.images[0]:""),specs:W(e,18)}}function N(e){return`LANGUAGE HARD GATE: Every user-facing sentence, label, list item, source description, button-like value, and explanation must be fully written in ${T(e)}. Only brand names, official product/model names, source names such as Reddit/YouTube/Amazon, and technical standards such as Thunderbolt, Wi-Fi, RTX, macOS may remain as-is. Do not output English UI labels such as "quiz answers", "similar products", "retailer reviews", "buy", "wait", "source types", "best time", or "community/review research" when the requested language is not English.`}function ne(e,s){const t=String(e||"").trim(),n=t.toLowerCase();return{"quiz answers":s("quiz answers","quiz cevapları","Quiz-Antworten"),"qor catalog specs":s("Qor catalog specs","Qor katalog özellikleri","Qor-Katalogdaten"),"community/review research":s("community/review research","topluluk ve yorum araştırması","Community- und Review-Recherche"),"similar products":s("similar products","benzer ürünler","ähnliche Produkte"),reddit:"Reddit","youtube reviews":s("YouTube reviews","YouTube incelemeleri","YouTube-Reviews"),"retailer reviews":s("retailer reviews","mağaza yorumları","Händlerbewertungen"),"specialist sources":s("specialist sources","uzman kaynaklar","Fachquellen"),"source types":s("source types","kaynak türleri","Quellentypen"),buy:s("buy","satın al","kaufen"),wait:s("wait","bekle","warten"),watch:s("watch","takip et","beobachten")}[n]||x(t)}function V(e,s){return m(e).map(t=>ne(t,s))}function C(e=[]){const s=(Array.isArray(e)?e:[]).filter(t=>(t==null?void 0:t.answer)!=null).map((t,n)=>`${n+1}. ${t.question}: ${t.answer}`);return s.length?s.join(`
`):"No product-specific quiz answers were provided."}function E({quizAnswers:e=[],research:s="",similarProducts:t=[],offers:n=[],heroSpecs:i=[]}={},a){const o=(Array.isArray(t)?t:[]).slice(0,8).map(c=>Q(c,a)),l=(Array.isArray(n)?n:[]).slice(0,8).map(c=>({store:(c==null?void 0:c.store)||(c==null?void 0:c.network)||"",price:c!=null&&c.hasExactPrice?`${c.price||""} ${c.currency||""}`.trim():"",country:(c==null?void 0:c.country)||"",checkedAt:(c==null?void 0:c.lastCheckedAt)||"",fresh:(c==null?void 0:c.hasExactPrice)===!0}));return{quizAnswers:C(e),research:String(s||"").slice(0,6500),similarProducts:o,offers:l,heroSpecs:Array.isArray(i)?i.slice(0,12):[]}}function Ce(e,s,t={}){const{name:n,brand:i,category:a,score:o,price:l,ks:c}=S(e,s);return`Research the product "${n}" by ${i||"unknown"} for a Qor AI purchase report.
Category: ${a||"-"}
Tech score in catalog: ${o}/100
Approx catalog price: ${l}
Catalog specs: ${c||"-"}

MARKET STATUS CONTEXT:
${A(e)}

${j()}
${N(s)}

Use current web search. Focus on official spec pages, current retailer/store pages, public ownership/review sentiment from Reddit, YouTube reviews, large retailer reviews, specialist review sites, and recent market/price-cycle signals. First determine whether the product is announced/released/available today, then summarize ownership evidence. Do not invent direct quotes, exact review counts, or exact current prices. If evidence is weak, say so clearly.

Product-specific quiz answers:
${C(t.quizAnswers)}

Reply in ${T(s)} with concise research notes only; no JSON is required.`}function Ee(e,s,t={}){return`Research these products for a Qor AI comparison report.

${(e||[]).map((i,a)=>{const{name:o,brand:l,category:c,score:u,price:d,ks:p}=S(i,s);return`${a+1}. ${o} (${l||"?"}, ${c||"?"}) score=${u}/100 price=${d}; specs=${p||"-"}`}).join(`
`)}

MARKET STATUS CONTEXT:
${(e||[]).map((i,a)=>`Product ${a+1}:
${A(i)}`).join(`

`)}

${j()}
${N(s)}

Use current web search. For each product, gather current availability/status, public sentiment from Reddit, YouTube, specialist reviews, retailer reviews, official spec pages, and price-cycle signals. Then note the decisive differences that matter for a buyer choosing one. Do not invent quotes, exact counts, or exact live prices.

Comparison quiz answers:
${C(t.quizAnswers)}

Reply in ${T(s)} with concise research notes only; no JSON is required.`}function Re(e,s,t={},n={}){const{name:i,brand:a,category:o,score:l,price:c,ks:u}=S(e,s),d=E(n,s),p=Object.entries(t).filter(([,h])=>h!=null&&h!==""&&(!Array.isArray(h)||h.length)).map(([h,f])=>`${h}: ${Array.isArray(f)?f.join(", "):JSON.stringify(f)}`).slice(0,18).join("; ");return`You are Qor AI's senior product analyst and product advisor. Analyse "${i}" by ${a||"unknown"} (category: ${o}). Use the product name exactly as given. Do not replace it with a similar model.

${N(s)}

CRITICAL OUTPUT ORDER: one single continuous report: match/advisor/deep analysis first, internet/community sentiment second, smart alternatives third, price forecast last.
${j()}
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
${A(e,n.offers)}

PRODUCT CONTEXT:
Name: ${i}
Brand: ${a||"-"}
Category: ${o||"-"}
Qor AI Tech Score: ${l}/100
Approx catalog price: ${c}
Catalog specs: ${u||"-"}
Hero specs: ${JSON.stringify(d.heroSpecs)}

PRODUCT-SPECIFIC QUIZ ANSWERS:
${d.quizAnswers}

`+(p?`USER PROFILE / USER-RECOGNITION SIGNALS:
${p}

`:"")+`QOR CATALOG ALTERNATIVES:
${JSON.stringify(d.similarProducts,null,2)}

OFFER CONTEXT:
${JSON.stringify(d.offers,null,2)}

WEB RESEARCH NOTES:
${d.research||"No grounded research notes were available; rely on catalog specs and clearly label uncertainty."}`}function Oe(e,s,t={},n={}){const{name:i,brand:a,category:o,score:l,price:c,ks:u}=S(e,s),d=E(n,s),p=(n.peerNames||[]).filter(f=>f&&f!==i),h=Object.entries(t).filter(([,f])=>f!=null&&f!==""&&(!Array.isArray(f)||f.length)).map(([f,v])=>`${f}: ${Array.isArray(v)?v.join(", "):JSON.stringify(v)}`).slice(0,18).join("; ");return`You are Qor AI's senior product analyst. Produce ONE product's section of a multi-product comparison report. Evaluate ONLY "${i}" by ${a||"unknown"} (category: ${o}), but judge it in the CONTEXT of being compared against: ${p.join(", ")||"the other selected products"}.

${N(s)}

${j()}

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
Name: ${i}
Brand: ${a||"-"}
Category: ${o||"-"}
Qor AI Tech Score: ${l}/100
Approx catalog price: ${c}
Catalog specs: ${u||"-"}
Full payload: ${JSON.stringify(Q(e,s))}

COMPARED AGAINST: ${p.join(", ")||"-"}

COMPARISON QUIZ ANSWERS:
${d.quizAnswers}

`+(h?`USER PROFILE / USER-RECOGNITION SIGNALS:
${h}

`:"")+`WEB RESEARCH NOTES:
${d.research||"No grounded research notes were available; rely on catalog specs and clearly label uncertainty."}`}function Ie(e,s=[],t,n={},i={}){const a=E(i,t),o=(e||[]).map(u=>S(u,t).name),l=(s||[]).map(u=>({name:u==null?void 0:u.name,matchScore:u==null?void 0:u.matchScore,summary:oe(u==null?void 0:u.matchComment,3),pros:m(u==null?void 0:u.pros).slice(0,4),cons:m(u==null?void 0:u.cons).slice(0,4),topFactors:m(u==null?void 0:u.factors).slice(0,8).map(d=>({label:d==null?void 0:d.label,score:d==null?void 0:d.score}))})),c=Object.entries(n).filter(([,u])=>u!=null&&u!==""&&(!Array.isArray(u)||u.length)).map(([u,d])=>`${u}: ${Array.isArray(d)?d.join(", "):JSON.stringify(d)}`).slice(0,18).join("; ");return`You are Qor AI's senior comparison analyst. Each product already has its own full review (compact summaries below). Produce ONLY the final cross-product comparison verdict.

${N(t)}

${j()}

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
${JSON.stringify(l,null,2)}

COMPARISON QUIZ ANSWERS:
${a.quizAnswers}

`+(c?`USER PROFILE / USER-RECOGNITION SIGNALS:
${c}

`:"")+`WEB RESEARCH NOTES:
${a.research||"No grounded research notes were available."}`}function ae(e){if(!e)return null;let s=String(e).trim();const t=s.match(/```(?:json)?\s*([\s\S]*?)```/i);t&&(s=t[1].trim());const n=s.indexOf("{"),i=s.lastIndexOf("}");n!==-1&&i!==-1&&i>n&&(s=s.slice(n,i+1));try{return JSON.parse(s)}catch{}try{return JSON.parse(s.replace(/,\s*([}\]])/g,"$1"))}catch{return null}}const y=e=>{const s=parseFloat(String(e??"").replace(/[^\d.-]/g,""));return Number.isFinite(s)?Math.round(s):0},ce=e=>{const s=parseFloat(String(e??"").replace(",",".").replace(/[^\d.-]/g,""));return Number.isFinite(s)?s:0},m=e=>Array.isArray(e)?e.filter(s=>s!=null&&String(s).trim()):[];function oe(e,s=2){const t=String(e||"").replace(/\s+/g," ").trim();if(!t)return"";const n=t.split(new RegExp("(?<=[.!?])\\s+")).filter(Boolean);return n.length?n.slice(0,s).join(" "):t}function R(e){return e>=80?"#22c55e":e>=60?"#f59e0b":"#f43f5e"}function O({value:e,max:s=100,suffix:t="/ 100"}){const n=Math.max(0,Math.min(s,Number(e)||0)),i=R(n/s*100),a=44,o=2*Math.PI*a,l=K(),[c,u]=I.useState(l);I.useEffect(()=>{if(l){u(!0);return}const h=setTimeout(()=>u(!0),40);return()=>clearTimeout(h)},[l]);const d=(c?n:0)/s,p=_(n,{duration:900});return r.jsxs("div",{className:"ai-ring",children:[r.jsxs("svg",{width:"100",height:"100",viewBox:"0 0 100 100",children:[r.jsx("circle",{cx:"50",cy:"50",r:a,fill:"none",stroke:i,strokeOpacity:"0.14",strokeWidth:"8"}),r.jsx("circle",{cx:"50",cy:"50",r:a,fill:"none",stroke:i,strokeWidth:"8",strokeLinecap:"round",strokeDasharray:o,strokeDashoffset:o*(1-d),transform:"rotate(-90 50 50)",style:{transition:l?"none":"stroke-dashoffset .9s cubic-bezier(.22,.61,.36,1)"}})]}),r.jsxs("div",{className:"ai-ring-t",style:{color:i},children:[r.jsx("b",{children:Math.round(p)}),r.jsx("small",{children:t})]})]})}function P({name:e,score:s,detail:t,color:n}){const i=Math.max(0,Math.min(100,Number(s)||0));return r.jsxs("div",{className:"ai-attr",children:[r.jsxs("div",{className:"ai-attr-top",children:[r.jsx("span",{className:"ai-attr-name",children:e}),r.jsx("span",{className:"ai-attr-score",style:{color:n},children:i})]}),r.jsx("div",{className:"ai-attr-track",style:{background:`${n}1f`},children:r.jsx(z,{pct:i,color:n,gradient:!0})}),t?r.jsx("small",{className:"ai-attr-detail",children:t}):null]})}function b({icon:e,title:s,items:t,color:n}){return t.length?r.jsxs("div",{className:"ai-procon",style:{borderColor:`${n}33`,background:`${n}0d`},children:[r.jsxs("h5",{style:{color:n},children:[e," ",s]}),r.jsx("ul",{children:t.map((i,a)=>r.jsxs("li",{children:[r.jsx("span",{style:{color:n},children:e==="✓"?"✓":"•"}),i]},a))})]}):null}function F({icon:e,label:s,color:t}){return r.jsxs("div",{className:"ai-seclabel",style:{color:t},children:[e," ",s]})}function le({data:e,L:s}){const t=y(e.overallScore),n=m(e.strengths).map(c=>({name:c.name||"",score:y(c.score),detail:c.detail||""})),i=m(e.weaknesses).map(c=>({name:c.name||"",score:y(c.score),detail:c.detail||""})),a=m(e.pros).map(String),o=m(e.cons).map(String),l=String(e.verdict||"").trim();return r.jsxs("div",{className:"ai-deep",children:[t>0&&r.jsx("div",{className:"ai-center",children:r.jsx(O,{value:t})}),n.length>0&&r.jsxs(r.Fragment,{children:[r.jsx(F,{icon:"📈",label:s("Strengths","Güçlü Yönler","Stärken"),color:"#22c55e"}),n.map((c,u)=>r.jsx(P,{...c,color:"#22c55e"},u))]}),i.length>0&&r.jsxs(r.Fragment,{children:[r.jsx(F,{icon:"📉",label:s("Weaknesses","Zayıf Yönler","Schwächen"),color:"#f43f5e"}),i.map((c,u)=>r.jsx(P,{...c,color:"#f43f5e"},u))]}),(a.length>0||o.length>0)&&r.jsxs("div",{className:"ai-procon-row",children:[r.jsx(b,{icon:"✓",title:s("Pros","Artılar","Pro"),items:a,color:"#22c55e"}),r.jsx(b,{icon:"✕",title:s("Cons","Eksiler","Contra"),items:o,color:"#f43f5e"})]}),l&&r.jsxs("div",{className:"ai-verdict",children:[r.jsx("span",{children:"💡"}),r.jsx("p",{children:l})]})]})}function de({data:e,L:s}){const t=m(e.alternatives);return t.length?r.jsx("div",{className:"ai-alts",children:t.map((n,i)=>r.jsxs("div",{className:"ai-alt",children:[r.jsx("div",{className:"ai-alt-name",children:x(n.name)}),n.whyBetter&&r.jsxs("div",{className:"ai-alt-why",children:["★ ",n.whyBetter]}),r.jsxs("div",{className:"ai-alt-grid",children:[n.advantage&&r.jsxs("div",{className:"ai-alt-cell ai-alt-adv",children:[r.jsx("b",{children:s("Advantage","Avantaj","Vorteil")}),r.jsx("span",{children:n.advantage})]}),n.tradeoff&&r.jsxs("div",{className:"ai-alt-cell ai-alt-trade",children:[r.jsx("b",{children:s("Trade-off","Dezavantaj","Nachteil")}),r.jsx("span",{children:n.tradeoff})]}),n.priceComparison&&r.jsxs("div",{className:"ai-alt-cell",children:[r.jsx("b",{children:s("Price","Fiyat","Preis")}),r.jsx("span",{children:n.priceComparison})]}),n.bestFor&&r.jsxs("div",{className:"ai-alt-cell",children:[r.jsx("b",{children:s("Best for","Kime uygun","Ideal für")}),r.jsx("span",{children:n.bestFor})]})]})]},i))}):null}function ue({data:e,L:s}){const t=ce(e.valueRating),n=m(e.reasonsToBuy).map(String),i=m(e.reasonsToSkip).map(String),a=m(e.proTips).map(String);return r.jsxs("div",{className:"ai-advisor",children:[t>0&&r.jsx("div",{className:"ai-center",children:r.jsx(O,{value:t,max:10,suffix:"/ 10"})}),String(e.ratingExplanation||"").trim()&&r.jsx("p",{className:"ai-advisor-exp",children:e.ratingExplanation}),String(e.whoShouldBuy||"").trim()&&r.jsxs("div",{className:"ai-advisor-box ai-good",children:[r.jsxs("b",{children:["👍 ",s("Who should buy","Kime uygun","Für wen geeignet")]}),r.jsx("p",{children:e.whoShouldBuy})]}),String(e.whoShouldAvoid||"").trim()&&r.jsxs("div",{className:"ai-advisor-box ai-bad",children:[r.jsxs("b",{children:["👎 ",s("Who should avoid","Kime uygun değil","Für wen ungeeignet")]}),r.jsx("p",{children:e.whoShouldAvoid})]}),(n.length>0||i.length>0)&&r.jsxs("div",{className:"ai-procon-row",children:[r.jsx(b,{icon:"✓",title:s("Reasons to buy","Alma sebepleri","Gründe dafür"),items:n,color:"#22c55e"}),r.jsx(b,{icon:"✕",title:s("Reasons to skip","Almama sebepleri","Gründe dagegen"),items:i,color:"#f43f5e"})]}),a.length>0&&r.jsxs("div",{className:"ai-tips",children:[r.jsxs("b",{children:["💡 ",s("Pro tips","İpuçları","Profi-Tipps")]}),r.jsx("ul",{children:a.map((o,l)=>r.jsx("li",{children:o},l))})]})]})}function me({data:e,L:s}){const t=String(e.trend||"stable").toLowerCase(),n=y(e.trendPercentage),i=String(e.buyOrWait||"buy").toLowerCase(),a=t==="down"?"↓":t==="up"?"↑":"→",o=t==="down"?"#22c55e":t==="up"?"#f43f5e":"#f59e0b";return r.jsxs("div",{className:"ai-pred",children:[r.jsxs("div",{className:"ai-pred-head",children:[r.jsxs("div",{className:"ai-pred-trend",style:{color:o},children:[r.jsx("span",{className:"ai-pred-arrow",children:a}),r.jsxs("div",{children:[r.jsx("b",{children:t==="down"?s("Falling","Düşüyor","Fällt"):t==="up"?s("Rising","Yükseliyor","Steigt"):s("Stable","Sabit","Stabil")}),n>0&&r.jsxs("small",{children:["~",n,"%"]})]})]}),r.jsx("div",{className:"ai-pred-verdict "+(i==="wait"?"wait":"buy"),children:i==="wait"?`⏳ ${s("Wait","Bekle","Warten")}`:`✓ ${s("Buy now","Şimdi al","Jetzt kaufen")}`})]}),r.jsxs("div",{className:"ai-pred-grid",children:[String(e.bestTimeToBuy||"").trim()&&r.jsxs("div",{className:"ai-pred-cell",children:[r.jsx("b",{children:s("Best time","En iyi zaman","Beste Zeit")}),r.jsx("span",{children:e.bestTimeToBuy})]}),String(e.expectedDrop||"").trim()&&r.jsxs("div",{className:"ai-pred-cell",children:[r.jsx("b",{children:s("Expected drop","Beklenen indirim","Erwarteter Rückgang")}),r.jsx("span",{children:e.expectedDrop})]})]}),String(e.reasoning||"").trim()&&r.jsx("p",{className:"ai-pred-reason",children:e.reasoning})]})}function he({data:e,L:s}){const t=x(e.winner||""),n=m(e.products).map(a=>({name:x(a.name||""),score:y(a.score),bestFor:a.bestFor||"",pros:m(a.pros).map(String),cons:m(a.cons).map(String)}));if(!n.length)return null;const i=Math.max(1,...n.map(a=>a.score));return r.jsxs("div",{className:"ai-cmp",children:[t&&r.jsxs("div",{className:"ai-cmp-winner",children:[r.jsx("span",{children:"🏆"}),r.jsxs("div",{children:[r.jsx("small",{children:s("AI pick","AI seçimi","KI-Wahl")}),r.jsx("b",{children:t})]})]}),String(e.verdict||"").trim()&&r.jsx("p",{className:"ai-cmp-verdict",children:e.verdict}),r.jsx("div",{className:"ai-cmp-products",children:n.map((a,o)=>{const l=t&&a.name.toLowerCase()===t.toLowerCase(),c=l?"#22c55e":"#3b82f6";return r.jsxs("div",{className:"ai-cmp-prod"+(l?" win":""),children:[r.jsxs("div",{className:"ai-cmp-prod-top",children:[r.jsxs("span",{className:"ai-cmp-prod-name",children:[l?"★ ":"",a.name]}),r.jsx("span",{className:"ai-cmp-prod-score",style:{color:c},children:a.score})]}),r.jsx("div",{className:"ai-attr-track",style:{background:`${c}1f`},children:r.jsx("i",{style:{width:`${a.score/i*100}%`,background:`linear-gradient(90deg, ${c}80, ${c})`}})}),a.bestFor&&r.jsxs("div",{className:"ai-cmp-bestfor",children:[s("Best for","Kime uygun","Ideal für"),": ",r.jsx("b",{children:a.bestFor})]}),(a.pros.length>0||a.cons.length>0)&&r.jsxs("div",{className:"ai-procon-row",children:[r.jsx(b,{icon:"✓",title:s("Pros","Artılar","Pro"),items:a.pros,color:"#22c55e"}),r.jsx(b,{icon:"✕",title:s("Cons","Eksiler","Contra"),items:a.cons,color:"#f43f5e"})]})]},o)})}),String(e.recommendation||"").trim()&&r.jsxs("div",{className:"ai-verdict",children:[r.jsx("span",{children:"💡"}),r.jsx("p",{children:e.recommendation})]})]})}function pe({data:e,L:s}){const t=y(e.satisfaction),n=m(e.praise).map(String),i=m(e.complaints).map(String),a=V(e.sources,s);return r.jsxs("div",{className:"ai-forum",children:[t>0&&r.jsxs("div",{className:"ai-forum-gauge",children:[r.jsx(O,{value:t,suffix:"%"}),r.jsxs("div",{className:"ai-forum-gauge-t",children:[r.jsx("b",{children:s("Community satisfaction","Topluluk memnuniyeti","Community-Zufriedenheit")}),r.jsx("small",{children:s("Synthesised from public forums & reviews","Açık forum ve yorumlardan derlendi","Aus öffentlichen Foren & Reviews")})]})]}),String(e.summary||"").trim()&&r.jsx("p",{className:"ai-forum-summary",children:e.summary}),(n.length>0||i.length>0)&&r.jsxs("div",{className:"ai-procon-row",children:[r.jsx(b,{icon:"✓",title:s("People love","Beğenilenler","Beliebt"),items:n,color:"#22c55e"}),r.jsx(b,{icon:"✕",title:s("Common complaints","Şikayetler","Häufige Kritik"),items:i,color:"#f43f5e"})]}),a.length>0&&r.jsxs("div",{className:"ai-forum-sources",children:[r.jsxs("small",{children:[s("Sources","Kaynaklar","Quellen"),":"]}),a.map((o,l)=>r.jsx("span",{className:"ai-forum-src",children:o},l))]}),String(e.verdict||"").trim()&&r.jsxs("div",{className:"ai-verdict",children:[r.jsx("span",{children:"👥"}),r.jsx("p",{children:e.verdict})]})]})}function U({text:e}){const s=String(e||"").trim();let t=s.split(/\n{2,}/g).map(n=>n.trim()).filter(Boolean);if(t.length<=1){const n=s.split(new RegExp("(?<=[.!?])\\s+(?=[A-ZÇĞİÖŞÜ0-9])","g")).map(i=>i.trim()).filter(Boolean);t=[];for(let i=0;i<n.length;i+=2)t.push(n.slice(i,i+2).join(" "))}return t.length?r.jsx("div",{className:"ai-report-prose",children:t.map((n,i)=>r.jsx("p",{children:n},i))}):null}function fe({items:e,tone:s="neutral"}){const t=m(e).map(String);return t.length?r.jsx("ul",{className:"ai-report-list "+s,children:t.map((n,i)=>r.jsx("li",{children:n},i))}):null}function ge({alternatives:e=[],L:s}){const t=m(e);return t.length?r.jsx("div",{className:"ai-alt-cards",children:t.map((n,i)=>{const a=m(n.keySpecs),o=r.jsxs("article",{className:"ai-alt-card",children:[r.jsx("div",{className:"ai-alt-media",children:n.imageUrl?r.jsx(q,{src:n.imageUrl,alt:x(n.name||""),size:"thumb"}):r.jsx("span",{children:i+1})}),r.jsxs("div",{className:"ai-alt-copy",children:[r.jsxs("div",{className:"ai-alt-card-top",children:[r.jsx("b",{children:x(n.name)}),r.jsx("small",{children:n.source==="qor_catalog"?s("Qor catalog","Qor kataloğu","Qor-Katalog"):s("External","Harici","Extern")})]}),n.shortComment&&r.jsx("p",{children:n.shortComment}),n.difference&&r.jsx("p",{className:"ai-alt-diff",children:n.difference}),a.length>0&&r.jsx("div",{className:"ai-alt-specs",children:a.slice(0,4).map((l,c)=>r.jsxs("span",{children:[r.jsx("small",{children:l.label}),r.jsx("b",{children:l.value})]},c))})]})]});return n.url?r.jsx("a",{href:n.url,className:"ai-alt-link",children:o},`${n.name}-${i}`):r.jsx("div",{children:o},`${n.name}-${i}`)})}):null}function ye({data:e,L:s,lang:t}){var a;const n=re(e),i=m(e.alternatives);return r.jsx(M,{data:n,L:s,lang:t,showHead:!1,heroExtra:null,altNode:i.length>0?r.jsx(X,{icon:"🔀",title:s("Smart alternatives","Akıllı alternatifler","Intelligente Alternativen"),children:r.jsx(ge,{alternatives:i,L:s})}):null,tailNode:m((a=e.product)==null?void 0:a.reviewedInputs).length>0?r.jsxs("div",{className:"la-verify",children:[r.jsxs("strong",{children:["🧾 ",s("Inputs used","Kullanılan girdiler","Verwendete Eingaben")]}),r.jsx("ul",{children:V(e.product.reviewedInputs,s).map((o,l)=>r.jsx("li",{children:o},l))})]}):null})}function xe({chart:e=[],L:s}){const t=m(e).map(i=>({name:x(i.name||""),score:y(i.score),reason:i.reason||""})).filter(i=>i.name).sort((i,a)=>a.score-i.score);if(!t.length)return null;const n=Math.max(1,...t.map(i=>i.score));return r.jsxs("div",{className:"ai-compare-chart",children:[t.map((i,a)=>{const o=R(i.score);return r.jsxs("div",{className:"ai-compare-chart-row",children:[r.jsx("span",{children:i.name}),r.jsx("div",{children:r.jsx(z,{pct:Math.max(4,i.score/n*100),color:o,delay:a*90})}),r.jsx("b",{style:{color:o},children:i.score}),i.reason&&r.jsx("small",{children:i.reason})]},`${i.name}-${a}`)}),r.jsx("small",{className:"ai-report-hint",children:s("Final scores are personalized to the comparison quiz.","Final puanlar karşılaştırma quizine göre kişiselleştirildi.","Endwerte sind auf das Vergleichsquiz personalisiert.")})]})}function be({rows:e=[]}){const s=m(e).filter(t=>(t==null?void 0:t.label)&&Array.isArray(t.scores));return s.length?r.jsx("div",{className:"ai-factor-matrix",children:s.map((t,n)=>r.jsxs("div",{className:"ai-factor-matrix-row",children:[r.jsx("b",{children:t.label}),r.jsx("div",{children:t.scores.map((i,a)=>{const o=y(i.score);return r.jsxs("span",{children:[r.jsx("small",{children:x(i.name)}),r.jsx("i",{style:{width:`${Math.max(4,o)}%`,background:R(o)}}),r.jsx("strong",{children:o})]},`${i.name}-${a}`)})})]},`${t.label}-${n}`))}):null}function ve({cmp:e={},L:s}){return e.winner||m(e.chart).length||m(e.factorMatrix).length||m(e.decisiveDifferences).length||String(e.headToHead||"").trim()||String(e.recommendation||"").trim()?r.jsxs("section",{className:"ai-report-section ai-cmp-overview",children:[r.jsx("div",{className:"ai-report-eyebrow",children:s("AI overall comparison","AI genel karşılaştırma","KI-Gesamtvergleich")}),r.jsx("h4",{children:s("Which one wins for you","Senin için hangisi kazanıyor","Was für dich gewinnt")}),e.winner&&r.jsxs("div",{className:"ai-cmp-winner",children:[r.jsx("span",{children:"★"}),r.jsxs("div",{children:[r.jsx("small",{children:s("Recommended pick","Önerilen seçim","Empfohlene Wahl")}),r.jsx("b",{children:x(e.winner)})]}),y(e.winnerScore)>0&&r.jsxs("div",{className:"ai-cmp-winner-score",children:[r.jsx("strong",{children:y(e.winnerScore)}),r.jsx("small",{children:s("fit for you","sana uygunluk","Passung")})]})]}),r.jsx(xe,{chart:e.chart,L:s}),r.jsx(be,{rows:e.factorMatrix}),(m(e.decisiveDifferences).length>0||String(e.headToHead||"").trim()||String(e.recommendation||"").trim())&&r.jsxs(H,{label:`📖 ${s("Detailed analysis","Detaylı analiz","Detaillierte Analyse")}`,children:[r.jsx(fe,{items:e.decisiveDifferences,tone:"notes"}),r.jsx(U,{text:e.headToHead}),String(e.recommendation||"").trim()&&r.jsxs("div",{className:"ai-verdict",children:[r.jsx("span",{children:"✓"}),r.jsx("div",{children:r.jsx(U,{text:e.recommendation})})]})]})]}):null}function we({data:e={},L:s,lang:t}){return r.jsx(M,{data:se(e),L:s,lang:t,showHead:!1})}function je({data:e,L:s,lang:t,products:n=[]}){const i=m(e.products),a=e.comparison||{},o=d=>x(String(d||"")).toLowerCase().replace(/\s+/g," ").trim(),l=(n.length?n:i).map((d,p)=>{if(n.length){const f=k(d,t),v=i.find(Y=>o(Y.name)===o(f))||i[p]||{};return{ai:v,image:d.imageUrl||v.imageUrl||"",name:f,key:d.id||`${f}-${p}`}}const h=x(d.name||"");return{ai:d,image:d.imageUrl||"",name:h,key:`${h}-${p}`}}).filter(d=>d.name||d.ai&&Object.keys(d.ai).length),c=o(a.winner||""),u=l.map(d=>{var p;return{name:d.name,factors:m((p=d.ai)==null?void 0:p.factors).map(h=>({label:h==null?void 0:h.label,score:y(h==null?void 0:h.score)}))}}).filter(d=>d.factors.length>0);return r.jsxs("div",{className:"ai-report ai-report-compare",children:[r.jsx(ve,{cmp:a,L:s}),u.length>=2&&r.jsx(J,{products:u,L:s}),l.length>0&&r.jsx("div",{className:"ai-cmp-reports",children:l.map((d,p)=>{const h=c&&o(d.name)===c;return r.jsxs("section",{className:"ai-cmp-report"+(h?" winner":""),children:[r.jsxs("header",{className:"ai-cmp-report-head",children:[h&&r.jsxs("span",{className:"ai-cmp-report-win",children:["★ ",s("AI pick","AI seçimi","KI-Wahl")]}),r.jsx("span",{className:"ai-cmp-report-no",children:p+1}),d.image?r.jsx(q,{src:d.image,alt:d.name,size:"thumb"}):null,r.jsxs("div",{className:"ai-cmp-report-id",children:[r.jsx("small",{children:s("Full AI review","Detaylı AI incelemesi","Vollständige KI-Analyse")}),r.jsx("b",{children:d.name})]})]}),r.jsx(we,{data:d.ai,L:s,lang:t})]},d.key)})})]})}function Pe({kind:e,raw:s,data:t,lang:n,products:i}){const a=t&&typeof t=="object"?t:ae(s);if(!a||typeof a!="object")return null;const o=String(n||"en").slice(0,2).toLowerCase(),l=(c,u,d)=>o==="tr"?u:o==="de"?d:c;return e==="productFull"||a.type==="product_full_report"?r.jsx(ye,{data:a,L:l,lang:n}):e==="compareFull"||a.type==="compare_full_report"?r.jsx(je,{data:a,L:l,lang:n,products:i}):e==="deep"?r.jsx(le,{data:a,L:l}):e==="alts"?r.jsx(de,{data:a,L:l}):e==="advisor"?r.jsx(ue,{data:a,L:l}):e==="pred"?r.jsx(me,{data:a,L:l}):e==="compare"?r.jsx(he,{data:a,L:l}):e==="forum"?r.jsx(pe,{data:a,L:l}):null}export{Pe as A,Ee as a,Oe as b,Ie as c,Re as d,Ce as e,ke as h,ae as p,Te as w};
