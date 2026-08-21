// Yeni /product/<slug> rotasi + eski /product/<slug>-<id> geriye donuk uyum.
import puppeteer from 'puppeteer';
const BASE=process.argv[2]||'http://localhost:5173';
const T=[
  ['yeni slug',            '/tr/product/samsung-galaxy-s23-ultra-512gb'],
  ['eski slug-id',         '/tr/product/samsung-galaxy-s23-ultra-512gb-6fael0sjib7ezfn'],
  ['duz id',               '/tr/product/6fael0sjib7ezfn'],
  ['id-benzeri sonekli slug','/tr/product/lenovo-legion-pro-7-l83de002xtrwp25'],
  ['EN yeni slug',         '/product/apple-iphone-15-pro-max-1tb'],
];
const b=await puppeteer.launch({headless:'new',args:['--no-sandbox']});
let ok=0;
for(const [ad,yol] of T){
  const p=await b.newPage(); await p.setViewport({width:1280,height:900});
  const hata=[]; p.on('pageerror',e=>hata.push(String(e).slice(0,80)));
  await p.goto(BASE+yol,{waitUntil:'domcontentloaded',timeout:60000}).catch(()=>{});
  await p.waitForSelector('h1',{timeout:30000}).catch(()=>{});
  await new Promise(r=>setTimeout(r,1200));
  const d=await p.evaluate(()=>({
    h1:(document.querySelector('main h1')?.textContent||'').replace(/\s+/g,' ').trim().slice(0,52),
    adres:location.pathname,
    canonical:document.querySelector('link[rel=canonical]')?.href||'',
    satir:document.querySelectorAll('.pd-srow').length,
  }));
  const gecti=!!d.h1 && d.satir>0 && !hata.length;
  if(gecti) ok++;
  console.log(`${gecti?'✔':'✘'} ${ad.padEnd(24)} ${yol}\n     h1=«${d.h1}» satir=${d.satir} adres=${d.adres}\n     canonical=${d.canonical}${hata.length?'\n     HATA: '+hata[0]:''}`);
  await p.close();
}
await b.close();
console.log(`\nSONUC: ${ok}/${T.length}`);
process.exit(ok===T.length?0:1);
