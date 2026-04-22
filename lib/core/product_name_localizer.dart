/// Utility to clean product names that contain Turkish tech-category words
/// when the app is running in a non-Turkish locale.
///
/// Example: "XPG Defender bilgisayar kasa" (tr) →
///          "XPG Defender Computer Case"      (en)
library;

// ---------------------------------------------------------------------------
// Turkish → English tech term map (word/phrase level, lowercased keys).
// Add entries here as more Turkish product-name suffixes are discovered.
// ---------------------------------------------------------------------------
const _trToEn = <String, String>{
  'bilgisayar kasası': 'Computer Case',
  'bilgisayar kasa': 'Computer Case',
  'kasa': 'Case',
  'ekran kartı': 'Graphics Card',
  'ekran karti': 'Graphics Card',
  'işlemci': 'Processor',
  'islemci': 'Processor',
  'anakart': 'Motherboard',
  'soğutucu': 'Cooler',
  'sogutma': 'Cooler',
  'sogutucu': 'Cooler',
  'bellek': 'Memory',
  'klavye': 'Keyboard',
  'kulaklık': 'Headset',
  'kulaklik': 'Headset',
  'hoparlör': 'Speaker',
  'hoparlaor': 'Speaker',
  'yazıcı': 'Printer',
  'yazici': 'Printer',
  'güç kaynağı': 'Power Supply',
  'guc kaynagi': 'Power Supply',
  'psu': 'PSU',
  'oyuncu': 'Gaming',
  'kablosuz': 'Wireless',
  'mekanik': 'Mechanical',
  'mouse pad': 'Mouse Pad',
  'mousepad': 'Mouse Pad',
  'bileklik': 'Wrist Rest',
  'çanta': 'Bag',
  'canta': 'Bag',
  'kılıf': 'Case',
  'kilif': 'Case',
  'batarya': 'Battery',
  'baskı': 'Print',
  'tarayıcı': 'Scanner',
  'tarayici': 'Scanner',
  'kamera': 'Camera',
  'projeksiyon': 'Projector',
  'dönüştürücü': 'Converter',
  'donusturucu': 'Converter',
  'adaptör': 'Adapter',
  'adaptor': 'Adapter',
  'kablo': 'Cable',
  'hub': 'Hub',
  'şarj': 'Charger',
  'sarj': 'Charger',
  'pil': 'Battery',
  'stand': 'Stand',
  'tutucu': 'Holder',
  'stant': 'Stand',
};

/// Returns a display-ready product name for the given locale.
/// When locale is Turkish (or the name has no Turkish words), the original
/// name is returned unchanged.
String localizeProductName(String name, String locale) {
  if (locale == 'tr' || name.isEmpty) return name;

  final lower = name.toLowerCase();
  var result = name;

  // Multi-word phrases first (longer matches take priority).
  final sorted = _trToEn.entries.toList()
    ..sort((a, b) => b.key.length.compareTo(a.key.length));

  for (final entry in sorted) {
    final trWord = entry.key;
    final enWord = entry.value;
    final idx = lower.indexOf(trWord);
    if (idx == -1) continue;

    // Replace in the result (preserving surrounding case).
    result = result.replaceAll(
      RegExp(RegExp.escape(trWord), caseSensitive: false),
      enWord,
    );
  }

  // Clean up duplicate spaces introduced by replacements.
  return result.replaceAll(RegExp(r' {2,}'), ' ').trim();
}
