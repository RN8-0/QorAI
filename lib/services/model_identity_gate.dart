// ═══════════════════════════════════════════════════════════════════════════
//  MODEL KIMLIK KAPISI — uygulama tarafi
//
//  KAYNAK VE GEREKCE: admin/js/qor_ai_prompts.js -> modelIdentityGate.
//  Bu bir IKINCI KOPYADIR ve bilerek oyle: Dart o JS dosyasini calistiramaz.
//  Kopya ayrismasin diye kurallar TEK YERDE ozetlendi ve
//  test/model_identity_gate_test.dart JS tarafiyla AYNI vakalari kosuyor.
//  Prompt metni degisirse IKISI BIRDEN degismeli.
//
//  OLCULDU 2026-08-28, canli grounded arastirma, "Samsung Galaxy S26 (512 GB)":
//  donen notlarda Galaxy S26 Ultra'nin kronik ekran lekesi, Ultra'nin fiyati ve
//  "Gizlilik Ekrani (S26 Ultra'ya ozel)" ozelligi TABAN MODELIN raporuna
//  yaziliyordu. Kok neden prompt'un modele yalnizca adi vermesi: katalogda ayni
//  seriden sekiz kayit var ve web aramasi seri adiyla amiral gemisini getiriyor.
// ═══════════════════════════════════════════════════════════════════════════

/// Bir urun adinin seri capasi: "Samsung Galaxy S26 (512 GB)" ->
/// stem "Samsung Galaxy S26", prefix "S", num 26.
class _SeriesAnchor {
  const _SeriesAnchor(this.index, this.prefix, this.num, this.stem);
  final int index;
  final String prefix;
  final int num;
  final String stem;
}

class ModelIdentityGate {
  ModelIdentityGate._();

  /// "Pro Max" once gelmeli: eslesince "Pro" ve "Max" ayri ayri sayilmasin.
  /// "Ti" / "XT" ekran karti kademesidir ve her zaman AYRI token gecer.
  static const List<String> variantWords = <String>[
    'Pro Max', 'Ultra', 'Pro', 'Max', 'Plus', 'Edge', 'FE', 'SE',
    'Mini', 'Air', 'Lite', 'Neo', 'Turbo', 'Super', 'Ti', 'XT',
  ];

  /// "oncekine gore", "compared to" — cumlenin KONUYU anlattigini, komsu
  /// neslin yalnizca olcut oldugunu gosteren ipuclari.
  static final RegExp _comparativeCue = RegExp(
    r'(?:\bgöre\b|kıyas|\bkarşın\b|selef|önceki\s+nesil|bir önceki|\bcompared\b'
    r'|\bcompares\b|\bversus\b|\bvs\.?\b|\bthan\b|predecessor'
    r'|previous\s+generation|\bupgrade\s+from\b|\bover\s+the\b)',
    caseSensitive: false,
  );

  static String _esc(String v) =>
      RegExp.escape(v).replaceAll(RegExp(r'(?:\\?\s)+'), r'\s+');

  /// Adin KENDI tasidigi varyant isaretcileri. Bunlar yasak listesine girmez.
  static List<String> variantMarkersIn(String name) {
    var rest = ' ${name.replaceAll(RegExp(r'[()/,]'), ' ').replaceAll(RegExp(r'\s{2,}'), ' ')} ';
    final found = <String>[];
    for (final w in variantWords) {
      final re = RegExp('\\s${w.replaceAll(' ', r'\s+')}\\s', caseSensitive: false);
      if (re.hasMatch(rest)) {
        found.add(w);
        rest = rest.replaceFirst(re, ' ');
      }
    }
    if (name.contains('+') && !found.contains('Plus')) found.add('Plus');
    return found;
  }

  /// Kapasite/birim ("32GB") ve sebeke kusagi ("5G") ELENIR: ikisi de nesil
  /// sayisi degildir.
  static _SeriesAnchor? _seriesAnchor(String name) {
    final cleaned = name
        .replaceAll(RegExp(r'\([^)]*\)'), ' ')
        .replaceAll(RegExp(r'\s{2,}'), ' ')
        .trim();
    if (cleaned.isEmpty) return null;
    final toks = cleaned.split(RegExp(r'\s+'));
    for (var i = toks.length - 1; i >= 0; i--) {
      final t = toks[i].replaceAll(RegExp(r'[^\w+]'), '');
      if (t.isEmpty) continue;
      if (RegExp(r'\d\s*(?:GB|TB|MB|W|Wh|mAh|Hz|nm|MP|K)$', caseSensitive: false).hasMatch(t)) {
        continue;
      }
      final m = RegExp(r'^([A-Za-z]{0,2})(\d{2,4})([A-Za-z+]{0,3})$').firstMatch(t);
      if (m == null) continue;
      final num = int.parse(m.group(2)!);
      if (num < 10) continue; // "5G", "4G" nesil degil
      return _SeriesAnchor(i, m.group(1)!, num, toks.sublist(0, i + 1).join(' '));
    }
    return null;
  }

  /// KOMSU NESIL adimi urun sinifina gore degisir. Telefon/laptop kusagi birer
  /// birer sayilir (S26 -> S25/S27). Ekran karti dort haneli ve KADEME ile
  /// ilerler: 5090'in komsusu 5089 degil 5080'dir.
  static List<int> _generationSteps(int num) {
    if (num >= 1000) return num % 10 == 0 ? const <int>[-10, 10] : const <int>[];
    return const <int>[-1, 1];
  }

  /// Metinde urunu ARAYAN capa. Marka cogu kaynakta duser ("Galaxy S26 Ultra"),
  /// bu yuzden TAM AD aranmaz — ayirt edici KUYRUK aranir.
  static String anchorTail(String name) {
    final a = _seriesAnchor(name);
    if (a == null) return '';
    final toks = a.stem.split(RegExp(r'\s+'));
    if (a.prefix.isNotEmpty) return toks[a.index];
    final from = a.index - 1 < 0 ? 0 : a.index - 1;
    return toks.sublist(from, a.index + 1).join(' ');
  }

  /// Bu urunle KARISTIRILABILECEK adlar — PROMPT ICIN, insan okur.
  static List<String> siblingModelNames(String name) {
    final anchor = _seriesAnchor(name);
    if (anchor == null) return const <String>[];
    final own = variantMarkersIn(name);
    final out = <String>[];
    for (final w in variantWords) {
      if (own.contains(w)) continue;
      out.add('${anchor.stem} $w');
    }
    if (own.isNotEmpty) out.add(anchor.stem); // taban model de BASKA urun
    final head = anchor.stem.split(RegExp(r'\s+')).sublist(0, anchor.index).join(' ');
    for (final d in _generationSteps(anchor.num)) {
      final n = anchor.num + d;
      if (n < 1) continue;
      out.add('$head ${anchor.prefix}$n'.trim());
    }
    return out.toSet().toList();
  }

  /// Konuyu ADIYLA yakalar — kardes adinin ICINDE eslesmez.
  /// "S26" kalibi "S26 Ultra" cumlesini KONU saymaz.
  static RegExp? subjectRegex(String name) {
    final tail = anchorTail(name);
    final core = tail.isNotEmpty ? tail : name.trim();
    if (core.isEmpty) return null;
    final own = variantMarkersIn(name);
    final tabu = <String>[
      for (final w in variantWords)
        if (!own.contains(w)) w.replaceAll(' ', r'\s+'),
    ];
    if (!own.contains('Plus')) tabu.add(r'\+');
    return RegExp('${_esc(core)}(?!\\s*(?:${tabu.join('|')}))', caseSensitive: false);
  }

  /// Kardes arama — IKI EKSEN AYRI. Varyant kosulsuz, nesil yalnizca
  /// karsilastirma ipucu YOKKEN.
  static ({RegExp variant, RegExp? generation})? detectParts(String name) {
    final anchor = _seriesAnchor(name);
    if (anchor == null) return null;
    final tail = anchorTail(name);
    if (tail.isEmpty) return null;
    final own = variantMarkersIn(name);
    final tabu = <String>[
      for (final w in variantWords)
        if (!own.contains(w)) w.replaceAll(' ', r'\s+'),
    ];
    if (!own.contains('Plus')) tabu.add(r'\+');
    final variant =
        RegExp('${_esc(tail)}\\s*(?:${tabu.join('|')})\\b', caseSensitive: false);
    final tailToks = tail.split(RegExp(r'\s+'));
    final tailHead = tailToks.sublist(0, tailToks.length - 1).join(' ');
    final gen = <String>[];
    for (final d in _generationSteps(anchor.num)) {
      final n = anchor.num + d;
      if (n < 1) continue;
      gen.add('\\b${_esc('$tailHead ${anchor.prefix}$n'.trim())}\\b');
    }
    return (
      variant: variant,
      generation: gen.isEmpty ? null : RegExp('(?:${gen.join('|')})', caseSensitive: false),
    );
  }

  static bool _sentenceIsSiblingOnly(
    String sent,
    ({RegExp variant, RegExp? generation}) parts,
  ) {
    if (parts.variant.hasMatch(sent)) return true;
    final g = parts.generation;
    if (g != null && g.hasMatch(sent)) return !_comparativeCue.hasMatch(sent);
    return false;
  }

  // Dart'ta lookbehind'e guvenmemek icin cumle bolme ELLE yapilir.
  static List<String> _sentences(String body) {
    final out = <String>[];
    final buf = StringBuffer();
    for (var i = 0; i < body.length; i++) {
      final ch = body[i];
      buf.write(ch);
      if (ch == '.' || ch == '!' || ch == '?') {
        var j = i + 1;
        while (j < body.length && body[j] == ' ') {
          j++;
        }
        if (j > i + 1 || j == body.length) {
          out.add(buf.toString());
          buf.clear();
          i = j - 1;
        }
      }
    }
    if (buf.isNotEmpty) out.add(buf.toString());
    return out.isEmpty ? <String>[body] : out;
  }

  /// Prompt kapisi. Capasi olmayan konuda (abonelik, "Honor Robot Phone")
  /// SUSAR — olmayan bir varyant ekseni ogretmek zarardir.
  static String gate(List<String> subjects) {
    final names = subjects.map((s) => s.trim()).where((s) => s.isNotEmpty).toList();
    if (names.isEmpty) return '';
    if (!names.any((n) => _seriesAnchor(n) != null)) return '';
    final konu = names.map((n) => n.toLowerCase()).toSet();
    final rows = names.map((n) {
      final own = variantMarkersIn(n);
      final sibs =
          siblingModelNames(n).where((s) => !konu.contains(s.toLowerCase())).toList();
      final stand = own.isNotEmpty
          ? 'this is the ${own.join(' ')} version — NOT the base model and not any other suffix'
          : 'this is the BASE model of its line — it carries no Ultra/Pro/Max/Plus/FE suffix';
      return '- "$n": $stand.'
          '${sibs.isEmpty ? '' : ' Different products that will surface in the same searches: ${sibs.join(', ')}.'}';
    }).join('\n');
    return 'MODEL IDENTITY HARD GATE — measured as the most common failure in these reports.\n'
        'The subject${names.length > 1 ? 's are' : ' is'} EXACTLY: ${names.map((n) => '"$n"').join(', ')}.\n'
        '$rows\n'
        '- A defect, complaint, price, benchmark, camera or battery result, or feature that a source attributes to one of those other models is NOT evidence about the subject. Never carry it over, not even as "likely applies here too".\n'
        '- NEVER list a feature among the strengths when the source says it belongs to another model. A sentence that itself names a different model disqualifies that claim.\n'
        '- Pin every search query to the exact model. Review titles and press coverage default to the flagship of a line, so a page carrying the series name is usually about the top variant — read it before attributing anything.\n'
        '- If a section has no subject-specific evidence, say so plainly. An honest gap is a correct report; a sibling’s material is a wrong one.\n'
        '- You may mention another model only for explicit contrast, named in full, and stated to be a different product.';
  }

  /// Arastirma notu temizligi: kardesi anan ama konuyu ANMAYAN cumle atilir.
  /// Iki adi birden gecen cumle KALIR (bilincli karsilastirma).
  static String scrub(String notes, List<String> subjects) {
    if (notes.trim().isEmpty) return notes;
    final names = subjects.map((s) => s.trim()).where((s) => s.isNotEmpty).toList();
    if (names.isEmpty) return notes;
    final subjectRes = names.map(subjectRegex).whereType<RegExp>().toList();
    final parts = names.map(detectParts).nonNulls.toList();
    if (parts.isEmpty) return notes;

    var dropped = 0;
    final lines = <String>[];
    for (final line in notes.split(RegExp(r'\r?\n'))) {
      if (line.trim().isEmpty) {
        lines.add(line);
        continue;
      }
      // Markdown basligi / kalin etiket satiri: iddia tasimaz, dokunma.
      if (RegExp(r'^\s*(?:#{1,6}\s|\*\*[^*]+\*\*\s*:?\s*$)').hasMatch(line)) {
        lines.add(line);
        continue;
      }
      final leadM = RegExp(r'^\s*(?:[-*•]\s*|\d+[.)]\s*)?').firstMatch(line);
      final lead = leadM?.group(0) ?? '';
      final kept = <String>[];
      for (final s in _sentences(line.substring(lead.length))) {
        final sibling = parts.any((pr) => _sentenceIsSiblingOnly(s, pr));
        if (!sibling || subjectRes.any((re) => re.hasMatch(s))) {
          kept.add(s);
        } else {
          dropped++;
        }
      }
      if (kept.isEmpty) continue;
      lines.add(lead + kept.join(' '));
    }
    final out = lines.join('\n');
    if (dropped == 0) return out;
    return '$out\n\n[Qor AI note] $dropped sentence(s) about a DIFFERENT model in '
        'the same product line were removed from these notes. Do not reconstruct them.';
  }

  /// Yalniz KENDI urununu anlatmasi gereken bolumler. `alternatives` ve
  /// `priceForecast` DISARIDA: orada baska model adi dogru.
  static const Map<String, List<String>> ownSubjectKeys = <String, List<String>>{
    'product': <String>[
      'strengths', 'weaknesses', 'criticalPoints', 'reliabilityNotes', 'factors',
      'featureMatches', 'analysis', 'headline', 'overallVerdict', 'pros', 'cons',
      'bestFor', 'notFor', 'matchComment',
    ],
    'community': <String>['chronicIssues', 'lovedFeatures', 'summary', 'themes'],
  };

  static void _collect(dynamic node, List<String> out) {
    if (node is String) {
      out.add(node);
    } else if (node is List) {
      for (final v in node) {
        _collect(v, out);
      }
    } else if (node is Map) {
      for (final v in node.values) {
        _collect(v, out);
      }
    }
  }

  /// Rapordaki kardes-model sizintilari. Bos liste = temiz.
  static List<String> leaks(Map<String, dynamic> report, List<String> subjects) {
    final names = subjects.map((s) => s.trim()).where((s) => s.isNotEmpty).toList();
    if (names.isEmpty) return const <String>[];
    final products = report['products'];
    if (products is List) {
      final out = <String>[];
      for (final entry in products) {
        if (entry is! Map) continue;
        final entryName = '${entry['name'] ?? ''}';
        final nm = names.firstWhere(
          (n) => entryName.toLowerCase().contains(n.toLowerCase()),
          orElse: () => entryName.isNotEmpty ? entryName : names.first,
        );
        final others = names
            .where((n) => n != nm)
            .map(subjectRegex)
            .whereType<RegExp>()
            .toList();
        for (final f in _leaksInEntry(Map<String, dynamic>.from(entry), nm)) {
          // Karsilastirmada obur KONU urunu kardes degil.
          if (others.any((re) => re.hasMatch(f))) continue;
          out.add(f);
        }
      }
      return out;
    }
    return _leaksInEntry(report, names.first);
  }

  static List<String> _leaksInEntry(Map<String, dynamic> entry, String name) {
    final parts = detectParts(name);
    if (parts == null) return const <String>[];
    final subjRe = subjectRegex(name);
    final found = <String>[];
    void scan(dynamic bag, List<String> keys, String label) {
      if (bag is! Map) return;
      for (final k in keys) {
        final node = bag[k];
        if (node == null) continue;
        final strings = <String>[];
        _collect(node, strings);
        for (final s in strings) {
          for (final sent in _sentences(s)) {
            if (!_sentenceIsSiblingOnly(sent, parts)) continue;
            if (subjRe != null && subjRe.hasMatch(sent)) continue;
            final t = sent.trim();
            found.add('$label.$k: ${t.length > 180 ? t.substring(0, 180) : t}');
          }
        }
      }
    }

    final productBag = entry['product'] ?? entry;
    scan(productBag, ownSubjectKeys['product']!, 'product');
    scan(
      entry['community'] ?? (productBag is Map ? productBag['community'] : null),
      ownSubjectKeys['community']!,
      'community',
    );
    return found;
  }

  /// Sizinti bulunan raporu bir kez daha isteme talimati.
  static String retryInstruction(String prompt, List<String> subjects, List<String> found) {
    final ornek = found.take(5).map((l) => '- $l').join('\n');
    return '$prompt\n\nMODEL IDENTITY RETRY:\n'
        'The previous answer was rejected: it attributed material from a DIFFERENT model in the same product line to the subject. Rewrite the JSON from scratch.\n'
        '${ornek.isEmpty ? '' : 'Rejected sentences:\n$ornek\n'}'
        '${gate(subjects)}\n'
        'Subject names that must stay exact: ${subjects.join(', ')}\n'
        'Drop every claim you cannot tie to the subject itself. A shorter honest section is required; a sibling’s material is not acceptable.';
  }
}
