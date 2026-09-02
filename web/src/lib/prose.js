// ═══════════════════════════════════════════════════════════════════════════
//  NESIR BOLUCU — TEK KAYNAK (JSX YOK)
//
//  `proseBlocks` metni ekranda cizilen paragraflara boler. AYNI bolme
//  duygu gocunde de kullanilmak ZORUNDA: etiket anahtari paragrafin ilk
//  cumlesinden turuyor, dolayisiyla iki taraf metni farkli bolerse anahtarlar
//  hic tutmaz.
//
//  OLCULDU 2026-09-02: goc satir sonlarina gore boluyordu, on yuz ise uzun
//  tek satirlik metni UC CUMLELIK paragraflara yeniden paketliyor. Sonuc:
//  ekrandaki 15 paragrafin yalnizca 2'si etiketli cikti. Fonksiyon bu yuzden
//  bilesenden cikarilip saf module alindi — Node betikleri de import eder.
// ═══════════════════════════════════════════════════════════════════════════


// Model bazen tek blok, bazen boş satırlı paragraf, bazen "### başlık" yazıyor.
// Üçünü de aynı şekle indir: [{kind, text}].
export function proseBlocks(text) {
  const raw = String(text || '').replace(/```[a-z]*\s*/gi, '').trim();
  if (!raw) return [];
  const lines = raw.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const blocks = [];
  lines.forEach((line) => {
    if (/^#{1,6}\s+/.test(line)) {
      blocks.push({ kind: 'head', text: line.replace(/^#{1,6}\s+/, '').replace(/[:：]\s*$/, '') });
      return;
    }
    if (/^[-•*]\s+/.test(line)) {
      blocks.push({ kind: 'bullet', text: line.replace(/^[-•*]\s+/, '') });
      return;
    }
    blocks.push({ kind: 'p', text: line.replace(/^>\s+/, '') });
  });
  // TEK NEFESTE YAZILMIŞ METİN. Model kimi zaman 600 kelimeyi tek satırda
  // döndürüyor; o hâlde paragraf ritmi diye bir şey kalmıyor. Cümlelere böl,
  // üçerli paragraflara topla.
  if (blocks.length === 1 && blocks[0].kind === 'p' && blocks[0].text.length > 640) {
    const sents = blocks[0].text.split(/(?<=[.!?])\s+/).filter(Boolean);
    const packed = [];
    for (let i = 0; i < sents.length; i += 3) packed.push({ kind: 'p', text: sents.slice(i, i + 3).join(' ') });
    return packed;
  }
  return blocks;
}
