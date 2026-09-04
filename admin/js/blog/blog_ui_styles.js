// ══════════════════════════════════════════════════════════════════════════
//  QOR AI ADMIN — BLOG EDİTÖRÜ STİLLERİ
//
//  AYRI DOSYA, ÇÜNKÜ TEK BİR NEDENİ VAR: `injectStyles()` bir kez daha
//  "çağıranın sorumluluğu" olmasın. Eskiden render fonksiyonunu tek başına
//  test edince stil gelmiyor, ekran "hiç değişmemiş" gibi görünüyordu ve bu
//  yüzden bir kez yanlış teşhis kondu. Artık modül yüklenirken kendisi
//  enjekte ediyor.
//
//  TASARIM KARARLARI
//   · AKSAN: panelin kendi `var(--accent)`ı. Blog bölümünü tek başına başka
//     bir renge çevirmek panelde ikinci bir kimlik yaratırdı.
//   · SAYILAR: mono + `tabular-nums`. Panelin geri kalanında zaten
//     'JetBrains Mono','Fira Code' stack'i kullanılıyor (.code-block,
//     .scraper-log); yeni webfont EKLENMEDİ.
//   · HİYERARŞİ tipografi ve boşluktan, AYRIM 1px çizgiden gelir — kutu ve
//     gölgeden değil. Gölge yalnız SÜRÜKLENEN öğede var, orada işlevsel.
//   · Yarıçap ≤ 8px.
//   · Hareket bütçesi: sürükleme anı + 120ms hover/focus. `prefers-reduced-
//     motion` saygı görüyor.
// ══════════════════════════════════════════════════════════════════════════
(function (root) {
  'use strict';

  var CSS = `
  /* ── ortak ─────────────────────────────────────────────────────────── */
  .bl-num{font-family:'JetBrains Mono','Fira Code',ui-monospace,monospace;font-variant-numeric:tabular-nums;font-feature-settings:"tnum" 1}
  .bl-wrap{max-width:1560px;margin:0 auto}
  .bl-btn{padding:7px 13px;border-radius:8px;border:1px solid var(--border);background:transparent;color:inherit;
          cursor:pointer;font:inherit;font-size:12.5px;font-weight:600;transition:border-color .12s ease,color .12s ease,background .12s ease}
  .bl-btn:hover{border-color:var(--accent);color:var(--text)}
  .bl-btn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
  .bl-btn[disabled]{opacity:.45;cursor:not-allowed}
  .bl-btn.on{background:var(--accent);border-color:var(--accent);color:#fff}
  .bl-btn.pri{background:var(--accent);border-color:var(--accent);color:#fff}
  .bl-btn.pri:hover{filter:brightness(1.08)}
  .bl-btn.dang:hover{border-color:var(--red);color:var(--red)}
  .bl-btn.sm{padding:4px 9px;font-size:11.5px}
  .bl-in{width:100%;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:9px 11px;color:inherit;font:inherit;font-size:13px}
  .bl-in:focus{outline:none;border-color:var(--accent)}
  .bl-lbl{display:block;font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--text2);margin-bottom:6px}

  /* ── LİSTE: satır, kart değil ───────────────────────────────────────── */
  /* Yuvarlak kart ızgarası 11 makale arasında karşılaştırma YAPTIRMIYOR —
     hangisi ince, hangisinin EN'i eksik, hangisi okunmuyor görünmüyordu.
     Satır + hairline + sağa dayalı mono kolonlar bunu tek bakışta veriyor. */
  .bl-stats{display:flex;gap:1px;background:var(--border);border:1px solid var(--border);border-radius:8px;overflow:hidden;margin-bottom:22px}
  .bl-stat{flex:1;min-width:104px;background:var(--bg2);padding:13px 16px}
  .bl-stat .k{font-size:11px;color:var(--text2);letter-spacing:.3px}
  .bl-stat .v{font-size:23px;font-weight:700;margin-top:3px;letter-spacing:-.02em}
  .bl-tools{display:flex;gap:9px;align-items:center;flex-wrap:wrap;margin-bottom:6px}
  .bl-search{flex:1;min-width:220px}
  .bl-rows{border-top:1px solid var(--border)}
  .bl-row{display:grid;grid-template-columns:58px minmax(0,1fr) 56px repeat(4,52px) 142px;gap:12px;align-items:center;
          padding:11px 8px;border-bottom:1px solid var(--border);transition:background .12s ease}
  @media(max-width:1100px){.bl-row{grid-template-columns:58px minmax(0,1fr) 56px 142px}
    .bl-row>.bl-row-n{display:none}.bl-row-hd>span:nth-child(n+4):nth-child(-n+7){display:none}}
  .bl-row:hover{background:var(--bg3)}
  .bl-row-hd{font-size:10.5px;letter-spacing:.6px;text-transform:uppercase;color:var(--text3);padding:8px;border-bottom:1px solid var(--border)}
  .bl-row-cover{width:64px;height:44px;border-radius:6px;background:var(--bg3);overflow:hidden;display:flex;align-items:center;justify-content:center}
  .bl-row-cover img{width:100%;height:100%;object-fit:cover}
  .bl-row-t{font-size:14px;font-weight:650;line-height:1.35;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .bl-row-s{font-size:11.5px;color:var(--text3);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .bl-row-n{text-align:right;font-size:13px;color:var(--text2)}
  .bl-row-act{display:flex;gap:5px;justify-content:flex-end;min-width:0;flex-wrap:nowrap}
  .bl-dots{display:inline-flex;gap:3px}
  .bl-dot{font-size:9.5px;font-weight:800;letter-spacing:.3px;padding:2px 5px;border-radius:4px;border:1px solid var(--border);color:var(--text3)}
  .bl-dot.on{color:var(--green);border-color:color-mix(in srgb,var(--green) 45%,transparent)}
  .bl-pill{font-size:10px;font-weight:800;letter-spacing:.4px;padding:2px 8px;border-radius:999px;border:1px solid var(--border);color:var(--text2)}
  .bl-pill.pub{color:var(--green);border-color:color-mix(in srgb,var(--green) 45%,transparent)}
  .bl-empty{padding:44px 8px;text-align:center;color:var(--text3);font-size:13.5px}

  /* ── EDİTÖR KABUĞU: üç kolon ────────────────────────────────────────── */
  .bl-top{position:sticky;top:-24px;z-index:40;display:flex;align-items:center;gap:10px;flex-wrap:wrap;
          padding:11px 14px;margin:-24px -32px 18px;border-bottom:1px solid var(--border);
          background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(10px)}
  .bl-top .tt{font-weight:700;font-size:14px;flex:1 1 220px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  @media(max-width:560px){.bl-top{margin:-16px -16px 14px;padding:9px 10px}.bl-top .tt{flex:1 1 120px;font-size:13px}
    .bl-top .bl-save{display:none}}
  .bl-save{font-size:11.5px;color:var(--text3);white-space:nowrap}
  .bl-save.dirty{color:var(--amber)}
  .bl-save.ok{color:var(--green)}
  .bl-shell{display:grid;grid-template-columns:206px minmax(0,1fr) 324px;gap:20px;align-items:start}
  @media(max-width:1460px){.bl-shell{grid-template-columns:188px minmax(0,1fr) 300px;gap:16px}}
  @media(max-width:1180px){.bl-shell{grid-template-columns:minmax(0,1fr)}.bl-rail{position:static!important;max-height:none!important}}
  .bl-rail{position:sticky;top:52px;max-height:calc(100vh - 78px);overflow:auto;scrollbar-width:thin}

  /* ── SOL RAY: anahat = sürükleme haritası ───────────────────────────── */
  /* İMZA ÖĞE. Yapıyı belgede değil HARİTADA değiştiriyorsun: altı öğeli bir
     yazıyı hiç kaydırmadan yeniden diziyorsun. */
  .bl-out{font-size:12.5px}
  .bl-out h5{margin:0 0 7px;font-size:10.5px;letter-spacing:.6px;text-transform:uppercase;color:var(--text3);font-weight:700}
  .bl-out-g{margin-bottom:16px}
  .bl-out-i{display:flex;gap:7px;align-items:center;padding:5px 7px;border-radius:6px;cursor:pointer;color:var(--text2);
            transition:background .12s ease,color .12s ease}
  .bl-out-i:hover{background:var(--bg3);color:var(--text)}
  .bl-out-i.sub{padding-left:18px;font-size:11.5px;color:var(--text3)}
  .bl-out-i .n{font-size:11px;color:var(--text3);min-width:12px}
  .bl-out-i .lbl{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .bl-out-i .bdg{font-size:9.5px;color:var(--text3);letter-spacing:.2px}
  .bl-out-i .bdg.warn{color:var(--amber)}
  .bl-out-q{color:var(--accent)}

  /* ── ORTA: TUVAL ────────────────────────────────────────────────────── */
  /* Tuval yazının KENDİSİ: site ölçüsü (760px), site puntosu, site sınıf
     adlarının aynısı. Ne düzenlediysen o yayına gidiyor. */
  .bl-canvas{background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:30px 34px 40px;min-width:0}
  .bl-doc{max-width:760px;margin:0 auto}
  .bl-zone{position:relative}
  .bl-zone-h{display:flex;align-items:center;gap:8px;margin:26px 0 10px;font-size:10.5px;letter-spacing:.7px;
             text-transform:uppercase;color:var(--text3);font-weight:700}
  .bl-zone-h::after{content:'';flex:1;height:1px;background:var(--border)}
  .bl-h1{width:100%;background:transparent;border:none;border-bottom:1px solid transparent;color:var(--text);
         font:inherit;font-size:33px;font-weight:800;line-height:1.15;letter-spacing:-.02em;padding:4px 0;resize:none;overflow:hidden}
  .bl-h1:focus{outline:none;border-bottom-color:var(--accent)}
  .bl-h1::placeholder{color:var(--text3)}
  .bl-lead{width:100%;background:transparent;border:none;border-bottom:1px solid transparent;color:var(--text2);
           font:inherit;font-size:18px;line-height:1.6;padding:6px 0;resize:none;overflow:hidden}
  .bl-lead:focus{outline:none;border-bottom-color:var(--accent)}
  .bl-cover{position:relative;border:1px dashed var(--border);border-radius:8px;min-height:120px;display:flex;
            align-items:center;justify-content:center;overflow:hidden;background:var(--bg3);margin-bottom:20px}
  .bl-cover img{max-width:100%;max-height:250px;object-fit:contain}
  .bl-cover-a{position:absolute;right:8px;bottom:8px;display:flex;gap:6px}
  .bl-cover-e{color:var(--text3);font-size:12.5px;padding:34px 0}

  /* ── ÖĞE ────────────────────────────────────────────────────────────── */
  .bl-item{position:relative;border-top:1px solid var(--border);padding:22px 0 8px;margin-top:6px}
  .bl-item.drag{opacity:.35}
  .bl-item-h{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:4px}
  .bl-item-t{font-size:25px;font-weight:800;letter-spacing:-.01em;line-height:1.25;flex:1 1 200px;min-width:0;padding-right:40px}
  .bl-item-t .ppn{color:var(--accent)}
  .bl-item-t input{background:transparent;border:none;border-bottom:1px solid transparent;color:inherit;font:inherit;width:100%;padding:0}
  .bl-item-t input:focus{outline:none;border-bottom-color:var(--accent)}
  .bl-item-m{display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:11.5px;color:var(--text3);margin-bottom:12px}
  .bl-kind{font-size:9.5px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;padding:2px 7px;border-radius:4px;border:1px solid var(--border)}
  .bl-kind.k-product{color:var(--blue)}
  .bl-kind.k-subscription{color:var(--accent2)}
  .bl-kind.k-custom{color:var(--green)}
  .bl-item-x{position:absolute;right:0;top:18px}

  /* ── BLOK ───────────────────────────────────────────────────────────── */
  .bl-blk{position:relative;padding:2px 0 2px 26px;margin:0 0 6px;border-radius:6px}
  .bl-blk.drag{opacity:.35}
  .bl-blk-bar{position:absolute;left:0;top:2px;display:flex;flex-direction:column;gap:3px;opacity:0;transition:opacity .12s ease}
  .bl-blk:hover .bl-blk-bar,.bl-blk:focus-within .bl-blk-bar{opacity:1}
  /* ARAC CUBUGU AKISTAN CIKMAZ, YALNIZ GORUNURLUGU DEGISIR.
     Ilk surumde display:none -> display:flex idi: fare bloga girdigi anda kutu
     akisa katiliyor, blok yeniden diziliyor ve yanindaki float'li gorsel
     kayiyordu. Kullanicinin tarifi: "imlec getirilince gorsel ve metin kontrol
     kismi saga kayiyor". BIR ARACIN GORUNMESI BELGEYI OYNATMAMALI.
     visibility yeri KORUR (display korumaz), o yuzden bant her zaman ayrilmis
     durur ve gosterip gizlemek sifir yeniden dizilim uretir. */
  .bl-blk-tools{display:flex;gap:5px;align-items:center;flex-wrap:wrap;margin:5px 0 6px;
                visibility:hidden;opacity:0;transition:opacity .12s ease}
  .bl-blk:hover > .bl-blk-tools,.bl-blk:focus-within > .bl-blk-tools{visibility:visible;opacity:1}
  .bl-grip{width:20px;height:22px;display:flex;align-items:center;justify-content:center;border-radius:5px;border:1px solid transparent;
           background:transparent;color:var(--text3);cursor:grab;font-size:13px;line-height:1;padding:0;touch-action:none}
  .bl-grip:hover{background:var(--bg4);color:var(--text)}
  .bl-grip:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
  .bl-grip.hold{background:var(--accent);color:#fff;cursor:grabbing}
  /* Metin alanı ÇIKTININ tipografisiyle: yazarken de yayındaki gibi görünür.
     Gerçek WYSIWYG için düz metin ↔ HTML çift yönlü eşleme gerekirdi; o el
     yapımı bir editör demek ve veri kaybı riski taşıyor. Bu ödün bilinçli. */
  /* DUZ-METIN contenteditable. white-space:pre-wrap satir sonlarini korur;
     gercek metin dugumu oldugu icin float'li gorselin etrafini SARAR — bunu
     TEXTAREA yapamiyordu (replaced element). Giren/cikan deger innerText,
     yani veri modeli hala duz metin. */
  .bl-txt{width:100%;background:transparent;border:none;color:var(--text-soft,var(--text));font-family:inherit;
          white-space:pre-wrap;overflow-wrap:break-word;padding:2px 0;display:block;min-height:1.4em}
  .bl-txt:focus{outline:none;background:color-mix(in srgb,var(--accent) 5%,transparent);border-radius:4px}
  .bl-txt:empty::before{content:attr(data-ph);color:var(--text3);pointer-events:none}
  .bl-txt.s-paragraph{font-size:16.5px;line-height:1.85}
  .bl-txt.s-heading{font-size:21px;line-height:1.3;font-weight:800;color:var(--text)}
  .bl-txt.s-subheading{font-size:17.5px;line-height:1.35;font-weight:800;color:var(--text)}
  .bl-txt.s-bullets{font-size:16.5px;line-height:1.75;padding-left:2px}
  .bl-split{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  .bl-split .bl-sp{min-width:0}
  .bl-sp-l{font-size:9.5px;font-weight:800;letter-spacing:.5px;color:var(--text3);margin-bottom:2px}
  .bl-sp.miss .bl-sp-l{color:var(--amber)}
  /* FLOAT KAPSAYICIDA, FIGURE'DE DEĞİL.
     İlk sürümde float FIGURE üzerindeydi ve .bl-blk sarmalayıcısı akıştan
     çıkan tek çocuğuyla birlikte ÇÖKÜYORDU — ölçüldü: yükseklik 4px. Sonuç:
     (a) blok 4 piksellik bir bırakma hedefiydi, sürükleyip üstüne bırakmak
     neredeyse imkânsızdı; (b) tutamak görselin yanında değil hiçliğin içinde
     duruyordu. Float sarmalayıcıya taşınınca sarmalayıcı görselin yüksekliğini
     alıyor, sonraki metin bloğu yine yanına sarılıyor — sitedeki davranışın
     aynısı, ama blok gerçek bir hedef. */
  .bl-blk.img-left{float:left;margin:4px 24px 10px 0;padding-left:22px}
  .bl-blk.img-right{float:right;margin:4px 0 10px 24px;padding-left:22px}
  .bl-blk.img-center{margin-left:auto;margin-right:auto;text-align:center}
  /* YAN YANA KOLON — GERCEK SARMA DEGIL, BILINCLI YAKLASIM.
     Chrome contenteditable ogesini BFC KOKU yapiyor: float'in etrafini
     SARAMIYOR (olculdu 2026-09-04 -- genislik 100% verilince blok float'in
     ALTINA itiliyor, auto verilince 175px'e buzusuyor). textarea da ayni sebeple
     (replaced element) saramiyordu. Gercek sarmayi editorde uretmenin tek yolu
     tum ogeyi TEK bir zengin editor alanina cevirmek olurdu; o da el yapimi bir
     editor demek ve veri kaybi riski tasiyor.
     Onun yerine gorsel ile ONU IZLEYEN metin blogu YAN YANA duruyor: "gorsel bu
     metnin sagindadir" bilgisi dogru okunuyor, blok tek tek duzenlenebilir
     kaliyor. Sayfadaki GERCEK sarma "Sitede" onizlemesiyle dogrulanir. */
  .bl-blk.img-left.z-s,.bl-blk.img-right.z-s{width:190px}
  .bl-blk.img-left.z-m,.bl-blk.img-right.z-m{width:285px}
  .bl-blk.img-left.z-l,.bl-blk.img-right.z-l{width:390px}
  .bl-blk.img-left.z-xl,.bl-blk.img-right.z-xl{width:450px}
  .bl-blk.img-left.z-s + .bl-blk:not([class*=img-]),.bl-blk.img-right.z-s + .bl-blk:not([class*=img-]){width:calc(100% - 240px)}
  .bl-blk.img-left.z-m + .bl-blk:not([class*=img-]),.bl-blk.img-right.z-m + .bl-blk:not([class*=img-]){width:calc(100% - 335px)}
  .bl-blk.img-left.z-l + .bl-blk:not([class*=img-]),.bl-blk.img-right.z-l + .bl-blk:not([class*=img-]){width:calc(100% - 440px)}
  .bl-blk.img-left.z-xl + .bl-blk:not([class*=img-]),.bl-blk.img-right.z-xl + .bl-blk:not([class*=img-]){width:calc(100% - 500px)}
  .bl-fig{margin:8px 0 10px;position:relative}
  .bl-fig img{display:block;max-width:100%;border-radius:8px;background:#fff}
  .bl-blk.img-center .bl-fig img{margin:0 auto}
  .bl-fig.z-s img{max-height:180px}
  .bl-fig.z-m img{max-height:280px}
  .bl-fig.z-l img{max-height:410px}
  .bl-fig.z-xl img{max-height:560px}
  .bl-blk.img-left .bl-fig.z-s img,.bl-blk.img-right .bl-fig.z-s img{max-height:150px}
  .bl-blk.img-left .bl-fig.z-m img,.bl-blk.img-right .bl-fig.z-m img{max-height:240px}
  .bl-blk.img-left .bl-fig.z-l img,.bl-blk.img-right .bl-fig.z-l img{max-height:360px}
  .bl-fig figcaption{font-size:12px;color:var(--text3);margin-top:6px;text-align:center}
  .bl-clear{clear:both}
  /* Görsel BOŞ kalabilir ve bu bir hata değil: ürün görseli katalogdan gelir,
     katalogda yoksa yazar elle koyar. Yer tutucu bunu SÖYLER. */
  .bl-fig-e{border:1px dashed var(--border);border-radius:8px;padding:18px;text-align:center;color:var(--text3);font-size:12.5px}
  .bl-cap{width:100%;background:transparent;border:none;border-bottom:1px dashed var(--border);color:var(--text3);
          font:inherit;font-size:12px;text-align:center;padding:3px 0;margin-top:5px}
  .bl-cap:focus{outline:none;border-bottom-color:var(--accent)}
  .bl-add{display:flex;gap:7px;margin:10px 0 4px;opacity:.55;transition:opacity .12s ease}
  .bl-add:hover{opacity:1}

  /* ── RTE (Quill) ────────────────────────────────────────────────────── */
  .bl-rte .ql-toolbar{border:1px solid var(--border);border-bottom:none;border-radius:8px 8px 0 0;background:var(--bg3)}
  .bl-rte .ql-container{border:1px solid var(--border);border-radius:0 0 8px 8px;font:inherit;font-size:16.5px;background:transparent}
  .bl-rte .ql-editor{min-height:150px;color:var(--text-soft,var(--text));line-height:1.85;padding:14px 12px}
  .bl-rte .ql-editor.ql-blank::before{color:var(--text3);font-style:normal}
  .bl-rte .ql-toolbar .ql-stroke{stroke:var(--text2)}
  .bl-rte .ql-toolbar .ql-fill{fill:var(--text2)}
  .bl-rte .ql-toolbar .ql-picker{color:var(--text2)}
  .bl-rte .ql-toolbar button:hover .ql-stroke,.bl-rte .ql-toolbar button.ql-active .ql-stroke{stroke:var(--accent)}
  .bl-rte .ql-toolbar button:hover .ql-fill,.bl-rte .ql-toolbar button.ql-active .ql-fill{fill:var(--accent)}
  .bl-rte .ql-toolbar .ql-picker-options{background:var(--bg2);border-color:var(--border)}
  .bl-rte .ql-editor h2{font-size:23px;font-weight:800;margin:22px 0 8px}
  .bl-rte .ql-editor h3{font-size:18.5px;font-weight:800;margin:18px 0 6px}
  .bl-rte .ql-editor table{border-collapse:collapse}
  .bl-rte .ql-editor table td,.bl-rte .ql-editor table th{border:1px solid var(--border);padding:6px 10px}
  .bl-src{width:100%;min-height:220px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text2);
          font-family:'JetBrains Mono','Fira Code',ui-monospace,monospace;font-size:12.5px;line-height:1.65;padding:12px}

  /* ── SAĞ RAY ────────────────────────────────────────────────────────── */
  .bl-card{border:1px solid var(--border);border-radius:8px;background:var(--bg2);padding:14px 15px;margin-bottom:14px}
  .bl-card h4{margin:0 0 11px;font-size:10.5px;letter-spacing:.7px;text-transform:uppercase;color:var(--text3);font-weight:700;
              display:flex;align-items:center;gap:7px}
  .bl-card h4::after{content:'';flex:1;height:1px;background:var(--border)}
  .bl-f{margin-bottom:11px}
  .bl-f:last-child{margin-bottom:0}
  .bl-cnt{float:right;font-family:'JetBrains Mono','Fira Code',ui-monospace,monospace;font-variant-numeric:tabular-nums;
          font-size:10.5px;letter-spacing:0;text-transform:none;color:var(--text3);font-weight:600}
  .bl-cnt.bad{color:var(--red)}
  .bl-serp{background:#fff;border-radius:6px;padding:10px 12px;margin-bottom:12px}
  .bl-serp .u{color:#1a5c38;font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .bl-serp .t{color:#1a0dab;font-size:15px;line-height:1.3;margin:2px 0;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .bl-serp .d{color:#4d5156;font-size:12px;line-height:1.5;max-height:54px;overflow:hidden}
  .bl-issue{display:flex;gap:7px;font-size:12.5px;line-height:1.55;padding:3px 0;align-items:flex-start}
  .bl-issue .ic{flex:0 0 13px}
  .bl-issue.error{color:var(--red)}
  .bl-issue.warn{color:var(--amber)}
  .bl-issue.info{color:var(--text2)}
  .bl-issue.ok{color:var(--green)}

  /* ── AI KONSOLU ─────────────────────────────────────────────────────── */
  /* "ai hangi işlemleri yapıyor ekranda gözükmüyor" — konsol KALICI: her
     adım, geçen süre ve biten işlerin geçmişi hep ekranda. */
  .bl-ai{font-size:12.5px}
  .bl-ai-bar{height:3px;border-radius:2px;background:var(--bg4);overflow:hidden;margin:0 0 10px}
  .bl-ai-bar i{display:block;height:100%;background:var(--accent);transition:width .3s ease}
  .bl-ai-s{display:flex;gap:8px;align-items:flex-start;padding:3px 0;line-height:1.5}
  .bl-ai-s .ic{flex:0 0 14px;text-align:center}
  .bl-ai-s.done{color:var(--text3)}
  .bl-ai-s.run{font-weight:700}
  .bl-ai-s.fail{color:var(--red)}
  .bl-ai-s.idle{color:var(--text3);opacity:.6}
  .bl-ai-log{margin-top:10px;padding-top:9px;border-top:1px solid var(--border);max-height:180px;overflow:auto}
  .bl-ai-log div{font-size:11.5px;color:var(--text3);padding:2px 0;line-height:1.5}
  .bl-ai-e{color:var(--red);margin-top:8px;font-size:12px;line-height:1.5}

  /* ── SÜRÜKLE-BIRAK ──────────────────────────────────────────────────── */
  /* Bırakma noktası TAHMİN EDİLMEZ, GÖSTERİLİR. */
  .bl-ghost{position:fixed;z-index:999;pointer-events:none;background:var(--bg2);border:1px solid var(--accent);
            border-radius:8px;padding:8px 12px;font-size:12.5px;font-weight:650;max-width:280px;
            box-shadow:0 12px 32px rgba(0,0,0,.35);opacity:.95;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .bl-caret{position:fixed;z-index:998;pointer-events:none;height:2px;background:var(--accent);border-radius:2px}
  .bl-caret::before{content:'';position:absolute;left:-3px;top:-2px;width:6px;height:6px;border-radius:50%;background:var(--accent)}
  .bl-dnd-on{cursor:grabbing!important;user-select:none!important}
  .bl-kb{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:999;background:var(--bg2);
         border:1px solid var(--accent);border-radius:8px;padding:9px 15px;font-size:12.5px;box-shadow:0 12px 32px rgba(0,0,0,.35)}

  /* ── MODAL ──────────────────────────────────────────────────────────── */
  .bl-modal{position:fixed;inset:0;background:rgba(2,6,23,.72);z-index:90;display:flex;align-items:flex-start;
            justify-content:center;padding:5vh 16px;overflow:auto}
  .bl-modal-b{background:var(--bg2);border:1px solid var(--border);border-radius:8px;max-width:880px;width:100%;padding:20px 22px}
  .bl-modal-h{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:14px}
  .bl-modal-h strong{font-size:15px}
  .bl-ta{width:100%;min-height:300px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);
         font-family:'JetBrains Mono','Fira Code',ui-monospace,monospace;font-size:12.5px;line-height:1.6;padding:12px}
  .bl-tabs{display:flex;gap:6px;margin-bottom:13px;flex-wrap:wrap}
  .bl-note{border:1px solid var(--border);border-left:2px solid var(--accent);border-radius:6px;padding:11px 13px;margin:0 0 12px;font-size:12.5px;line-height:1.6}
  .bl-topic{border:1px solid var(--border);border-radius:8px;padding:13px 15px;margin-bottom:9px;transition:border-color .12s ease}
  .bl-topic:hover{border-color:var(--accent)}
  .bl-topic .h{font-weight:700;font-size:14.5px;margin-bottom:3px}
  .bl-topic .a{font-size:12.5px;color:var(--text2);line-height:1.6}
  .bl-topic .w{font-size:11.5px;color:var(--text3);line-height:1.6;margin-top:6px}
  .bl-hits{position:absolute;z-index:30;left:0;right:0;background:var(--bg2);border:1px solid var(--border);
           border-radius:8px;max-height:300px;overflow:auto;box-shadow:0 12px 36px rgba(0,0,0,.45)}
  .bl-hit{padding:8px 11px;cursor:pointer;display:flex;gap:10px;align-items:center;border-bottom:1px solid var(--border);font-size:13px}
  .bl-hit:last-child{border-bottom:none}
  .bl-hit:hover{background:var(--bg3)}
  .bl-hit img{width:32px;height:32px;object-fit:contain;background:#fff;border-radius:5px;flex:0 0 32px}
  .bl-cm{display:flex;gap:9px;align-items:flex-start;border:1px solid var(--border);border-radius:8px;padding:9px 11px;margin-bottom:8px}

  @media(prefers-reduced-motion:reduce){
    .bl-btn,.bl-row,.bl-out-i,.bl-blk-bar,.bl-blk-tools,.bl-add,.bl-ai-bar i,.bl-topic{transition:none}
  }
  `;

  root.blogInjectStyles = function () {
    if (document.getElementById('blogAdminStyles2')) return;
    var s = document.createElement('style');
    s.id = 'blogAdminStyles2';
    s.textContent = CSS;
    document.head.appendChild(s);
  };
  // Modül yüklenirken enjekte et — çağıranın sorumluluğu DEĞİL.
  if (typeof document !== 'undefined') {
    if (document.head) root.blogInjectStyles();
    else document.addEventListener('DOMContentLoaded', root.blogInjectStyles);
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
