/// Qor AI — Spec translation corrections (pure Dart).
///
/// The scraped catalog was machine-translated with an NLLB pipeline that
/// hallucinates badly on short technical fragments — most visibly on SECTION
/// HEADERS ("FİZİKSEL ÖZELLİKLER" → "They're different.", "HARİCİ GRAFİK" →
/// "It 's a costly graphic.", "DEPOLAMA & OPTİK SÜRÜCÜ" → "Storage & optic
/// surrucer"). The Turkish source key is always clean, so we re-derive the
/// correct localized header from a curated glossary instead of trusting the
/// baked English/German.
///
/// This module is the single source of truth for those corrections on the app
/// side; [scripts/spec_corrections.mjs] mirrors it for the PocketBase data fix
/// (which also repairs the admin panel and the website, since they read the
/// same records).
library;

/// Folds a Turkish string to an ascii, lowercase, punctuation-free key so
/// "PİL & DİĞER", "Pil&Diğer" and "pil  diger" all collapse to "pil diger".
String foldTr(String s) {
  var t = s.trim();
  const map = {
    'ı': 'i',
    'İ': 'i',
    'ğ': 'g',
    'Ğ': 'g',
    'ü': 'u',
    'Ü': 'u',
    'ş': 's',
    'Ş': 's',
    'ö': 'o',
    'Ö': 'o',
    'ç': 'c',
    'Ç': 'c',
  };
  map.forEach((k, v) => t = t.replaceAll(k, v));
  return t.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]+'), ' ').trim();
}

final RegExp _hiddenBenchRe = RegExp(
  r'\b(?:antutu|an\s*tu\s*tu|dxomark|dxo\s*mark|geekbench|benchmark|passmark|pcmark|3dmark|cinebench|basemark|gfxbench|ai\s*benchmark)\b',
  caseSensitive: false,
);
final RegExp _hiddenTrRe = RegExp(
  r'(ülkemiz|ulkemiz|satış[ıi]?\s*yok|satis[ıi]?\s*yok|yurt\s*d[ıi]ş[ıi]|yurtdış)',
  caseSensitive: false,
);

/// Spec rows that must NEVER be shown: volatile benchmark scores
/// (AnTuTu / DXOMark / Geekbench / PassMark / 3DMark…) that go stale the moment
/// they are scraped, and Turkey-only availability fields ("Durum: Henüz
/// Ülkemizde Satışı Yok"). Mirrors web `isHiddenSpec()` in
/// web/src/lib/specDisplay.js and scripts/clean_benchmark_specs.js. Applied at
/// display time so a re-scrape can never resurface them.
bool isHiddenSpec(String label, String value) {
  final both = '$label $value';
  if (_hiddenBenchRe.hasMatch(both)) return true;
  if (_hiddenTrRe.hasMatch(both)) return true;
  final folded = foldTr(label);
  return folded == 'durum' || folded == 'status'; // Epey TR sales-status row
}

/// Curated Turkish-source → {en, de} section header glossary. Covers the full
/// finite set of section names in the catalog (57 distinct). The map is keyed
/// by [foldTr] of the Turkish source name.
const Map<String, Map<String, String>> _sectionGlossary = {
  'one cikanlar': {'en': 'Highlights', 'de': 'Highlights'},
  'tasarim': {'en': 'Design', 'de': 'Design'},
  'tasarim boyutlar': {'en': 'Design & dimensions', 'de': 'Design & Abmessungen'},
  'tasarim ve olculer': {'en': 'Design & dimensions', 'de': 'Design & Abmessungen'},
  'tasarim fonksiyon': {'en': 'Design & function', 'de': 'Design & Funktion'},
  'ekran': {'en': 'Display', 'de': 'Display'},
  'ekran ozellikleri': {'en': 'Display features', 'de': 'Displayfunktionen'},
  'genel bilgiler': {'en': 'General information', 'de': 'Allgemeine Informationen'},
  'genel ozellikler': {'en': 'General features', 'de': 'Allgemeine Eigenschaften'},
  'islemci': {'en': 'Processor', 'de': 'Prozessor'},
  'grafik islemcisi': {'en': 'Graphics processor', 'de': 'Grafikprozessor'},
  'baglanti': {'en': 'Connection', 'de': 'Verbindung'},
  'baglantilar': {'en': 'Connections', 'de': 'Verbindungen'},
  'baglanti ozellikleri': {'en': 'Connectivity features', 'de': 'Verbindungsfunktionen'},
  'baglanti noktalari': {'en': 'Ports', 'de': 'Anschlüsse'},
  'baglanti ve guc': {'en': 'Connection & power', 'de': 'Verbindung & Stromversorgung'},
  'baglantilar arayuzler': {'en': 'Connections & interfaces', 'de': 'Anschlüsse & Schnittstellen'},
  'baglantilar ve yuvalar': {'en': 'Connections & slots', 'de': 'Anschlüsse & Steckplätze'},
  'arka baglantilar': {'en': 'Rear connections', 'de': 'Rückseitige Anschlüsse'},
  'kablolu baglantilar': {'en': 'Wired connections', 'de': 'Kabelgebundene Verbindungen'},
  'fiziksel baglantilar': {'en': 'Physical connections', 'de': 'Physische Anschlüsse'},
  'ses ozellikleri': {'en': 'Audio features', 'de': 'Audiofunktionen'},
  'ses': {'en': 'Audio', 'de': 'Audio'},
  'ses guc bilgileri': {'en': 'Audio / power info', 'de': 'Audio-/Leistungsinfo'},
  'bellek': {'en': 'Memory', 'de': 'Arbeitsspeicher'},
  'bellek ozellikleri': {'en': 'Memory features', 'de': 'Speicherfunktionen'},
  'bellek ram ozellikleri': {'en': 'Memory (RAM) features', 'de': 'Arbeitsspeicher-Funktionen'},
  'bellek depolama': {'en': 'Memory & storage', 'de': 'Speicher & Datenspeicher'},
  'harici grafik': {'en': 'External graphics', 'de': 'Externe Grafik'},
  'dahili grafik': {'en': 'Integrated graphics', 'de': 'Integrierte Grafik'},
  'fiziksel ozellikler': {'en': 'Physical features', 'de': 'Physische Eigenschaften'},
  'fiziksel dayaniklilik': {'en': 'Physical durability', 'de': 'Physische Beständigkeit'},
  'temel bilgiler': {'en': 'Basics', 'de': 'Grundlagen'},
  'temel ozellikler': {'en': 'Key features', 'de': 'Hauptmerkmale'},
  'temel donanim': {'en': 'Core hardware', 'de': 'Kern-Hardware'},
  'teknik ozellikler': {'en': 'Technical features', 'de': 'Technische Eigenschaften'},
  'teknik bilgiler': {'en': 'Technical information', 'de': 'Technische Informationen'},
  'teknolojik altyapi': {'en': 'Technical infrastructure', 'de': 'Technische Infrastruktur'},
  'dokuman diger': {'en': 'Documents & other', 'de': 'Dokumente & Weiteres'},
  'dokuman yazilim': {'en': 'Documents/software', 'de': 'Dokumente/Software'},
  'dokuman': {'en': 'Documents', 'de': 'Dokumente'},
  'depolama optik okuyucu': {'en': 'Storage & optical reader', 'de': 'Speicher & optisches Laufwerk'},
  'depolama optik surucu': {'en': 'Storage & optical drive', 'de': 'Speicher & optisches Laufwerk'},
  'depolama ozellikleri': {'en': 'Storage features', 'de': 'Speicherfunktionen'},
  'genisleme yuvalari': {'en': 'Expansion slots', 'de': 'Erweiterungssteckplätze'},
  'kapasite ve hiz': {'en': 'Capacity & speed', 'de': 'Kapazität & Geschwindigkeit'},
  'pil diger': {'en': 'Battery & other', 'de': 'Akku & Weiteres'},
  'kamera': {'en': 'Camera', 'de': 'Kamera'},
  'kamera ve goruntuleme': {'en': 'Camera & imaging', 'de': 'Kamera & Bildgebung'},
  'ag baglantilari': {'en': 'Network connections', 'de': 'Netzwerkverbindungen'},
  'batarya': {'en': 'Battery', 'de': 'Akku'},
  'aku bilgileri': {'en': 'Battery info', 'de': 'Akku-Informationen'},
  'diger baglantilar': {'en': 'Other connections', 'de': 'Weitere Verbindungen'},
  'diger ozellikler': {'en': 'Other features', 'de': 'Weitere Eigenschaften'},
  'diger bilgiler': {'en': 'Other information', 'de': 'Weitere Informationen'},
  'kablosuz baglantilar': {'en': 'Wireless connections', 'de': 'Drahtlose Verbindungen'},
  'kablosuz baglanti': {'en': 'Wireless connection', 'de': 'Drahtlose Verbindung'},
  'coklu ortam': {'en': 'Multimedia', 'de': 'Multimedia'},
  'multimedya': {'en': 'Multimedia', 'de': 'Multimedia'},
  'multimedya ozellikleri': {'en': 'Multimedia features', 'de': 'Multimedia-Funktionen'},
  'ozellikler': {'en': 'Features', 'de': 'Funktionen'},
  'fonksiyonlar': {'en': 'Functions', 'de': 'Funktionen'},
  'islevsellik': {'en': 'Functionality', 'de': 'Funktionalität'},
  'isletim sistemi': {'en': 'Operating system', 'de': 'Betriebssystem'},
  'performans': {'en': 'Performance', 'de': 'Leistung'},
  'stant': {'en': 'Stand', 'de': 'Standfuß'},
  'alicilar': {'en': 'Receivers', 'de': 'Empfänger'},
  'enerji ve tasarim': {'en': 'Energy & design', 'de': 'Energie & Design'},
  'sogutma ozellikleri': {'en': 'Cooling features', 'de': 'Kühlfunktionen'},
  'fan ozellikleri': {'en': 'Fan features', 'de': 'Lüfterfunktionen'},
  'pompa ozellikleri': {'en': 'Pump features', 'de': 'Pumpenfunktionen'},
  'guc': {'en': 'Power', 'de': 'Stromversorgung'},
  'guc ozellikleri': {'en': 'Power features', 'de': 'Leistungsmerkmale'},
  'guc bilgileri': {'en': 'Power info', 'de': 'Leistungsinformationen'},
  'guc ve baglantilar': {'en': 'Power & connections', 'de': 'Stromversorgung & Anschlüsse'},
  'kablolu guc ozellikleri': {'en': 'Wired power features', 'de': 'Kabelgebundene Stromfunktionen'},
  'kablosuz guc ozellikleri': {'en': 'Wireless power features', 'de': 'Kabellose Stromfunktionen'},
  'ebat agirlik': {'en': 'Dimensions & weight', 'de': 'Maße & Gewicht'},
  'mouse ozellikleri': {'en': 'Mouse features', 'de': 'Maus-Funktionen'},
  'klavye ozellikleri': {'en': 'Keyboard features', 'de': 'Tastatur-Funktionen'},
  'hareket ozellikleri': {'en': 'Motion features', 'de': 'Bewegungsfunktionen'},
  'kontrol ve kullanim': {'en': 'Control & use', 'de': 'Steuerung & Bedienung'},
  'uyumluluk': {'en': 'Compatibility', 'de': 'Kompatibilität'},
  'sensorler': {'en': 'Sensors', 'de': 'Sensoren'},
  'guvenlik ozellikleri': {'en': 'Security features', 'de': 'Sicherheitsfunktionen'},
  'guvenlik ve kontrol': {'en': 'Security & control', 'de': 'Sicherheit & Steuerung'},
  'gosterge ikaz guvenlik': {'en': 'Indicators / alerts / safety', 'de': 'Anzeigen / Warnungen / Sicherheit'},
  'giris verileri': {'en': 'Input data', 'de': 'Eingangsdaten'},
  'cikis verileri': {'en': 'Output data', 'de': 'Ausgangsdaten'},
  'goruntu ozellikleri': {'en': 'Image features', 'de': 'Bildfunktionen'},
  'goruntu ses': {'en': 'Video / audio', 'de': 'Bild / Ton'},
  'goruntu ses ozellikleri': {'en': 'Video / audio features', 'de': 'Bild- / Tonfunktionen'},
  'optik': {'en': 'Optics', 'de': 'Optik'},
  'baski ozellikleri': {'en': 'Print features', 'de': 'Druckfunktionen'},
  'tarama fotokopi': {'en': 'Scan & copy', 'de': 'Scannen & Kopieren'},
  'donanim': {'en': 'Hardware', 'de': 'Hardware'},
  'donanim filtre': {'en': 'Hardware & filter', 'de': 'Hardware & Filter'},
  'donanim yazilim': {'en': 'Hardware/software', 'de': 'Hardware/Software'},
  'donanim yazilim ozellikleri': {'en': 'Hardware/software features', 'de': 'Hardware-/Softwarefunktionen'},
  'sinirsel islemci npu': {'en': 'Neural processor (NPU)', 'de': 'Neuronaler Prozessor (NPU)'},
  'aksesuarlar': {'en': 'Accessories', 'de': 'Zubehör'},
  'varyant': {'en': 'Variant', 'de': 'Variante'},
  'ab urun kayit ve enerji etiketi': {
    'en': 'EU product registration & energy label',
    'de': 'EU-Produktregistrierung & Energielabel',
  },
};

/// Returns the curated localized header for a Turkish source section name, or
/// `null` if it isn't in the glossary (caller keeps the baked value then).
String? correctedSectionHeader(String turkishSource, String lang) {
  final entry = _sectionGlossary[foldTr(turkishSource)];
  if (entry == null) return null;
  return entry[lang] ?? entry['en'];
}

/// Trailing Turkish category phrases that leak into product names when a name
/// has no baked translation (keyed by [foldTr]).
const Map<String, Map<String, String>> _nameSuffixGlossary = {
  'oyun kolu': {'en': 'Gamepad', 'de': 'Gamepad'},
  'kablosuz kulaklik': {'en': 'Wireless Headphones', 'de': 'Kabellose Kopfhörer'},
  'kulaklik': {'en': 'Headphones', 'de': 'Kopfhörer'},
  'klavye': {'en': 'Keyboard', 'de': 'Tastatur'},
  'mouse': {'en': 'Mouse', 'de': 'Maus'},
  'soguk cuzdan': {'en': 'Hardware Wallet', 'de': 'Hardware-Wallet'},
  'ekran karti': {'en': 'Graphics Card', 'de': 'Grafikkarte'},
  'anakart': {'en': 'Motherboard', 'de': 'Mainboard'},
  'islemci': {'en': 'Processor', 'de': 'Prozessor'},
};

/// Best-effort name localization fallback for products whose `nameTranslated`
/// has no entry for [lang]: swaps a recognized trailing Turkish category phrase
/// for its localized form. Leaves the name untouched if nothing matches.
String correctedName(String name, String lang) {
  if (lang == 'tr') return name;
  final folded = foldTr(name);
  // Try the 3-, 2- then 1-word trailing phrase.
  final words = folded.split(' ');
  for (var take = 3; take >= 1; take--) {
    if (words.length < take) continue;
    final phrase = words.sublist(words.length - take).join(' ');
    final hit = _nameSuffixGlossary[phrase];
    if (hit != null) {
      final replacement = hit[lang] ?? hit['en']!;
      // Replace the matching trailing words in the ORIGINAL name (case-insens).
      final pattern = RegExp(
        r'(?:\s+\S+){0,' + (take - 1).toString() + r'}\s*\S+\s*$',
      );
      // Simpler: cut the original name to the same trailing word count.
      final origWords = name.trim().split(RegExp(r'\s+'));
      if (origWords.length >= take) {
        final head = origWords.sublist(0, origWords.length - take).join(' ');
        return head.isEmpty ? replacement : '$head $replacement';
      }
      return name.replaceFirst(pattern, ' $replacement').trim();
    }
  }
  return name;
}

// ── Value / label atom corrections ──────────────────────────────────────────

/// Whole-value exact corrections (case-insensitive on the trimmed string).
const Map<String, String> _valueExact = {
  'the computer': 'Computer',
  'analog with joystik': 'Analog joystick',
  'warnings that can be set': 'Adjustable triggers',
  'they re different': 'Physical features',
};

class _ValueRegexFix {
  final RegExp pattern;
  final String replacement;
  const _ValueRegexFix(this.pattern, this.replacement);
}

final List<_ValueRegexFix> _valueRegexFixes = [
  // "20 o 'clock" / "20 o'clock" → "20 hours" (Turkish "saat" mistranslation).
  _ValueRegexFix(
    RegExp(r"\b(\d+(?:[.,]\d+)?)\s*o\s*'?\s*clock\b", caseSensitive: false),
    r'$1 hours',
  ),
  _ValueRegexFix(RegExp(r'\bjoystik\b', caseSensitive: false), 'joystick'),
];

/// Repairs known mistranslated atoms in a spec value or label. Applies to each
/// already-localized fragment; safe to call on values that need no change.
String correctValueText(String text) {
  var out = text;
  final exact = _valueExact[foldTr(out)];
  if (exact != null) return exact;
  for (final fix in _valueRegexFixes) {
    out = out.replaceAllMapped(fix.pattern, (m) {
      var r = fix.replacement;
      for (var i = 1; i <= m.groupCount; i++) {
        r = r.replaceAll('\$$i', m.group(i) ?? '');
      }
      return r;
    });
  }
  return out;
}
