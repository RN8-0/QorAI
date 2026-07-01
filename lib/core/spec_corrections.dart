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
  'one cikanlar': {'en': 'Highlights'},
  'tasarim': {'en': 'Design'},
  'tasarim boyutlar': {'en': 'Design & dimensions'},
  'tasarim ve olculer': {'en': 'Design & dimensions'},
  'tasarim fonksiyon': {'en': 'Design & function'},
  'ekran': {'en': 'Display'},
  'ekran ozellikleri': {'en': 'Display features'},
  'genel bilgiler': {'en': 'General information'},
  'genel ozellikler': {'en': 'General features'},
  'islemci': {'en': 'Processor'},
  'grafik islemcisi': {'en': 'Graphics processor'},
  'baglanti': {'en': 'Connection'},
  'baglantilar': {'en': 'Connections'},
  'baglanti ozellikleri': {'en': 'Connectivity features'},
  'baglanti noktalari': {'en': 'Ports'},
  'baglanti ve guc': {'en': 'Connection & power'},
  'baglantilar arayuzler': {'en': 'Connections & interfaces'},
  'baglantilar ve yuvalar': {'en': 'Connections & slots'},
  'arka baglantilar': {'en': 'Rear connections'},
  'kablolu baglantilar': {'en': 'Wired connections'},
  'fiziksel baglantilar': {'en': 'Physical connections'},
  'ses ozellikleri': {'en': 'Audio features'},
  'ses': {'en': 'Audio'},
  'ses guc bilgileri': {'en': 'Audio / power info'},
  'bellek': {'en': 'Memory'},
  'bellek ozellikleri': {'en': 'Memory features'},
  'bellek ram ozellikleri': {'en': 'Memory (RAM) features'},
  'bellek depolama': {'en': 'Memory & storage'},
  'harici grafik': {'en': 'External graphics'},
  'dahili grafik': {'en': 'Integrated graphics'},
  'fiziksel ozellikler': {'en': 'Physical features'},
  'fiziksel dayaniklilik': {'en': 'Physical durability'},
  'temel bilgiler': {'en': 'Basics'},
  'temel ozellikler': {'en': 'Key features'},
  'temel donanim': {'en': 'Core hardware'},
  'teknik ozellikler': {'en': 'Technical features'},
  'teknik bilgiler': {'en': 'Technical information'},
  'teknolojik altyapi': {'en': 'Technical infrastructure'},
  'dokuman diger': {'en': 'Documents & other'},
  'dokuman yazilim': {'en': 'Documents/software'},
  'dokuman': {'en': 'Documents'},
  'depolama optik okuyucu': {'en': 'Storage & optical reader'},
  'depolama optik surucu': {'en': 'Storage & optical drive'},
  'depolama ozellikleri': {'en': 'Storage features'},
  'genisleme yuvalari': {'en': 'Expansion slots'},
  'kapasite ve hiz': {'en': 'Capacity & speed'},
  'pil diger': {'en': 'Battery & other'},
  'kamera': {'en': 'Camera'},
  'kamera ve goruntuleme': {'en': 'Camera & imaging'},
  'ag baglantilari': {'en': 'Network connections'},
  'batarya': {'en': 'Battery'},
  'aku bilgileri': {'en': 'Battery info'},
  'diger baglantilar': {'en': 'Other connections'},
  'diger ozellikler': {'en': 'Other features'},
  'diger bilgiler': {'en': 'Other information'},
  'kablosuz baglantilar': {'en': 'Wireless connections'},
  'kablosuz baglanti': {'en': 'Wireless connection'},
  'coklu ortam': {'en': 'Multimedia'},
  'multimedya': {'en': 'Multimedia'},
  'multimedya ozellikleri': {'en': 'Multimedia features'},
  'ozellikler': {'en': 'Features'},
  'fonksiyonlar': {'en': 'Functions'},
  'islevsellik': {'en': 'Functionality'},
  'isletim sistemi': {'en': 'Operating system'},
  'performans': {'en': 'Performance'},
  'stant': {'en': 'Stand'},
  'alicilar': {'en': 'Receivers'},
  'enerji ve tasarim': {'en': 'Energy & design'},
  'sogutma ozellikleri': {'en': 'Cooling features'},
  'fan ozellikleri': {'en': 'Fan features'},
  'pompa ozellikleri': {'en': 'Pump features'},
  'guc': {'en': 'Power'},
  'guc ozellikleri': {'en': 'Power features'},
  'guc bilgileri': {'en': 'Power info'},
  'guc ve baglantilar': {'en': 'Power & connections'},
  'kablolu guc ozellikleri': {'en': 'Wired power features'},
  'kablosuz guc ozellikleri': {'en': 'Wireless power features'},
  'ebat agirlik': {'en': 'Dimensions & weight'},
  'mouse ozellikleri': {'en': 'Mouse features'},
  'klavye ozellikleri': {'en': 'Keyboard features'},
  'hareket ozellikleri': {'en': 'Motion features'},
  'kontrol ve kullanim': {'en': 'Control & use'},
  'uyumluluk': {'en': 'Compatibility'},
  'sensorler': {'en': 'Sensors'},
  'guvenlik ozellikleri': {'en': 'Security features'},
  'guvenlik ve kontrol': {'en': 'Security & control'},
  'gosterge ikaz guvenlik': {'en': 'Indicators / alerts / safety'},
  'giris verileri': {'en': 'Input data'},
  'cikis verileri': {'en': 'Output data'},
  'goruntu ozellikleri': {'en': 'Image features'},
  'goruntu ses': {'en': 'Video / audio'},
  'goruntu ses ozellikleri': {'en': 'Video / audio features'},
  'optik': {'en': 'Optics'},
  'baski ozellikleri': {'en': 'Print features'},
  'tarama fotokopi': {'en': 'Scan & copy'},
  'donanim': {'en': 'Hardware'},
  'donanim filtre': {'en': 'Hardware & filter'},
  'donanim yazilim': {'en': 'Hardware/software'},
  'donanim yazilim ozellikleri': {'en': 'Hardware/software features'},
  'sinirsel islemci npu': {'en': 'Neural processor (NPU)'},
  'aksesuarlar': {'en': 'Accessories'},
  'varyant': {'en': 'Variant'},
  'ab urun kayit ve enerji etiketi': {
    'en': 'EU product registration & energy label',
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
