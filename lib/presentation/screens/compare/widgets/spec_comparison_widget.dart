part of '../compare_screen.dart';

class _SpecComparisonView extends ConsumerStatefulWidget {
  final List<ProductEntity> products;
  final VoidCallback onReset;
  final void Function(String productId)? onRemoveProduct;
  const _SpecComparisonView({required this.products, required this.onReset, this.onRemoveProduct});

  @override
  ConsumerState<_SpecComparisonView> createState() => _SpecComparisonViewState();
}

class _SpecComparisonViewState extends ConsumerState<_SpecComparisonView> {
  late Map<String, bool> _expandedGroups;
  late Map<String, Map<String, List<String>>> _groupedSpecs;

  // Deep Analysis state (merged with AI Analysis structured)
  bool _deepAnalysisExpanded = false;
  bool _deepAnalysisLoading = false;
  String? _deepAnalysisResult;
  Map<String, dynamic>? _deepAnalysisStructured;
  bool _deepAnalysisError = false;

  // Smart Alternatives state
  bool _alternativesExpanded = false;
  bool _alternativesLoading = false;
  String? _alternativesResult;
  Map<String, dynamic>? _alternativesStructured;
  bool _alternativesError = false;

  // AI Advisor state
  bool _advisorExpanded = false;
  bool _advisorLoading = false;
  String? _advisorResult;
  Map<String, dynamic>? _advisorStructured;
  bool _advisorError = false;

  // Price Prediction state
  bool _predictionExpanded = false;
  bool _predictionLoading = false;
  String? _predictionResult;
  Map<String, dynamic>? _predictionStructured;
  bool _predictionError = false;

  // Personalized Match state
  bool _matchScoreExpanded = false;
  bool _matchScoreFetched = false;

  // Floating YouTube player overlay
  OverlayEntry? _pipOverlay;

  void _closePiP() {
    _pipOverlay?.remove();
    _pipOverlay = null;
  }

  void _onVideoTap(String url, String title, String thumbnailUrl) {
    final ytRegex = RegExp(r'(?:youtube\.com/watch\?v=|youtu\.be/)([\w-]+)');
    final match = ytRegex.firstMatch(url);
    if (match != null) {
      final videoId = match.group(1)!;
      if (!mounted) return;
      _closePiP();
      _pipOverlay = OverlayEntry(
        builder: (_) => _CompareFloatingPlayer(
          videoId: videoId,
          title: title,
          thumbnailUrl: thumbnailUrl.isNotEmpty
              ? thumbnailUrl
              : 'https://img.youtube.com/vi/$videoId/mqdefault.jpg',
          onClose: _closePiP,
        ),
      );
      Overlay.of(context).insert(_pipOverlay!);
    }
  }

  @override
  void dispose() {
    _closePiP();
    super.dispose();
  }
  void initState() {
    super.initState();
    _groupedSpecs = _buildGroupedSpecs();
    final keys = _groupedSpecs.keys.toList();
    _expandedGroups = {
      for (int i = 0; i < keys.length; i++) keys[i]: false,
    };
    // Restore AI analysis from session if available
    _restoreFromSession();
  }

  /// Cache key for Firestore AI result cache
  String get _aiCacheDocId {
    final ids = widget.products.map((p) => p.id).toList()..sort();
    return ids.join('_');
  }

  /// Try to load a cached AI result from Firestore
  Future<Map<String, dynamic>?> _loadAiCache(String feature) async {
    try {
      final doc = await FirebaseFirestore.instance
          .collection('ai_compare_cache')
          .doc(_aiCacheDocId)
          .collection('features')
          .doc(feature)
          .get();
      if (!doc.exists) return null;
      final data = doc.data()!;
      final ts = data['timestamp'] as Timestamp?;
      if (ts == null) return null;
      // 24h TTL
      if (DateTime.now().difference(ts.toDate()).inHours > 24) return null;
      debugPrint('[Compair] ✅ Cache HIT for $feature');
      return data;
    } catch (e) {
      debugPrint('[Compair] Cache read error ($feature): $e');
      return null;
    }
  }

  /// Save an AI result to Firestore cache
  Future<void> _saveAiCache(String feature, Map<String, dynamic> data) async {
    try {
      await FirebaseFirestore.instance
          .collection('ai_compare_cache')
          .doc(_aiCacheDocId)
          .collection('features')
          .doc(feature)
          .set({...data, 'timestamp': FieldValue.serverTimestamp()});
    } catch (e) {
      debugPrint('[Compair] Cache write error ($feature): $e');
    }
  }

  /// Restore AI analysis results from session (survives navigation)
  void _restoreFromSession() {
    final session = ref.read(compareSessionProvider);
    final sessionIds = session.selectedProductIds.toSet();
    final currentIds = widget.products.map((p) => p.id).toSet();
    if (sessionIds.isNotEmpty && sessionIds.difference(currentIds).isEmpty && currentIds.difference(sessionIds).isEmpty) {
      if (session.deepAnalysisResult != null) _deepAnalysisResult = session.deepAnalysisResult;
      if (session.aiStructured != null) _deepAnalysisStructured = session.aiStructured;
      if (session.alternativesResult != null) _alternativesResult = session.alternativesResult;
      if (session.alternativesStructured != null) _alternativesStructured = session.alternativesStructured;
      if (session.advisorResult != null) _advisorResult = session.advisorResult;
      if (session.advisorStructured != null) _advisorStructured = session.advisorStructured;
      if (session.predictionResult != null) _predictionResult = session.predictionResult;
      if (session.predictionStructured != null) _predictionStructured = session.predictionStructured;
    }
  }

  /// Save AI analysis results to session
  void _saveToSession() {
    ref.read(compareSessionProvider.notifier).update((state) => state.copyWith(
      aiStructured: _deepAnalysisStructured,
      deepAnalysisResult: _deepAnalysisResult,
      alternativesResult: _alternativesResult,
      alternativesStructured: _alternativesStructured,
      advisorResult: _advisorResult,
      advisorStructured: _advisorStructured,
      predictionResult: _predictionResult,
      predictionStructured: _predictionStructured,
    ));
  }

  /// Parse JSON from AI response, handling markdown code blocks and truncated responses
  Map<String, dynamic>? _tryParseJson(String raw) {
    try {
      var clean = raw.trim();
      final codeBlockMatch = RegExp(r'```(?:json)?\s*\n?([\s\S]*?)\n?\s*```').firstMatch(clean);
      if (codeBlockMatch != null) clean = codeBlockMatch.group(1)!.trim();
      final jsonStart = clean.indexOf('{');
      final jsonEnd = clean.lastIndexOf('}');
      if (jsonStart >= 0 && jsonEnd > jsonStart) {
        clean = clean.substring(jsonStart, jsonEnd + 1);
      } else if (jsonStart >= 0) {
        // No closing brace — truncated JSON, try repair
        clean = _repairTruncatedJson(clean.substring(jsonStart));
        debugPrint('[Compair] _tryParseJson: attempted JSON repair');
      }
      final decoded = jsonDecode(clean);
      if (decoded is Map<String, dynamic>) return decoded;
      return null;
    } catch (e) {
      // Try repair as last resort
      try {
        final repaired = _repairTruncatedJson(raw.trim());
        final decoded = jsonDecode(repaired);
        if (decoded is Map<String, dynamic>) {
          debugPrint('[Compair] _tryParseJson: repair succeeded');
          return decoded;
        }
      } catch (_) {}
      debugPrint('[Compair] _tryParseJson failed: $e | raw snippet: ${raw.length > 200 ? raw.substring(0, 200) : raw}');
      return null;
    }
  }

  /// Attempt to repair truncated JSON by closing open strings, arrays, and objects
  String _repairTruncatedJson(String truncated) {
    var inString = false;
    var escaped = false;
    final stack = <String>[]; // tracks '{' and '['

    for (var i = 0; i < truncated.length; i++) {
      final c = truncated[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (c == '\\' && inString) {
        escaped = true;
        continue;
      }
      if (c == '"') {
        inString = !inString;
        continue;
      }
      if (!inString) {
        if (c == '{') stack.add('{');
        else if (c == '[') stack.add('[');
        else if (c == '}' && stack.isNotEmpty && stack.last == '{') stack.removeLast();
        else if (c == ']' && stack.isNotEmpty && stack.last == '[') stack.removeLast();
      }
    }

    var repaired = truncated;
    // Close open string
    if (inString) repaired += '"';
    // Remove trailing incomplete key-value (e.g. `"key": ` or `, "key"`)
    repaired = repaired.replaceAll(RegExp(r',\s*"[^"]*"\s*:\s*"?[^"{}[\]]*$'), '');
    repaired = repaired.replaceAll(RegExp(r',\s*"[^"]*"\s*$'), '');
    repaired = repaired.replaceAll(RegExp(r',\s*$'), '');
    // Close remaining open brackets/braces in reverse order
    for (var i = stack.length - 1; i >= 0; i--) {
      repaired += stack[i] == '{' ? '}' : ']';
    }
    return repaired;
  }

  /// Parse JSON array from AI response
  List<dynamic>? _tryParseJsonArray(String raw) {
    try {
      var clean = raw.trim();
      final codeBlockMatch = RegExp(r'```(?:json)?\s*\n?([\s\S]*?)\n?\s*```').firstMatch(clean);
      if (codeBlockMatch != null) clean = codeBlockMatch.group(1)!.trim();
      final arrStart = clean.indexOf('[');
      final arrEnd = clean.lastIndexOf(']');
      if (arrStart >= 0 && arrEnd > arrStart) clean = clean.substring(arrStart, arrEnd + 1);
      final decoded = jsonDecode(clean);
      if (decoded is List) return decoded;
      return null;
    } catch (e) {
      debugPrint('[Compair] _tryParseJsonArray failed: $e');
      return null;
    }
  }

  /// Fetch from Gemini with automatic retry on parse failure (max 2 attempts)
  Future<Map<String, dynamic>?> _fetchWithRetry(String prompt, String label, String lang, {int maxTokens = 4096}) async {
    final gemini = ref.read(geminiServiceProvider);
    for (var attempt = 1; attempt <= 2; attempt++) {
      try {
        String result;
        String source = 'jsonFreeTextQuery';
        try {
          result = await gemini.jsonFreeTextQuery(prompt, language: lang, maxTokens: maxTokens);
        } catch (jsonErr) {
          debugPrint('[Compair] ❌ $label jsonFreeTextQuery THREW: $jsonErr — falling back to groundedQuery');
          source = 'groundedQuery (fallback)';
          result = await gemini.groundedQuery(prompt, maxTokens: maxTokens);
        }
        debugPrint('[Compair] 🔍 $label RAW attempt $attempt ($source, ${result.length} chars):\n${result.length > 800 ? result.substring(0, 800) : result}');
        final parsed = _tryParseJson(result);
        if (parsed != null) return parsed;
        debugPrint('[Compair] $label parse FAILED attempt $attempt${attempt < 2 ? " — retrying" : " — giving up"}');
        if (attempt < 2) await Future.delayed(const Duration(seconds: 1));
      } catch (e) {
        debugPrint('[Compair] $label attempt $attempt error: $e');
        if (attempt < 2) await Future.delayed(const Duration(seconds: 1));
      }
    }
    return null;
  }

  Future<void> _toggleDeepAnalysis() async {
    if (_deepAnalysisExpanded && (_deepAnalysisResult != null || _deepAnalysisStructured != null)) {
      setState(() => _deepAnalysisExpanded = false);
      return;
    }
    setState(() {
      _deepAnalysisExpanded = true;
      if (_deepAnalysisResult != null || _deepAnalysisStructured != null) return;
      _deepAnalysisLoading = true;
    });
    if (_deepAnalysisResult == null && _deepAnalysisStructured == null) {
      await _fetchDeepAnalysis();
    }
  }

  Future<void> _fetchDeepAnalysis() async {
    if (_deepAnalysisResult != null || _deepAnalysisStructured != null) return;
    final sw = Stopwatch()..start();
    try {
      // Check Firestore cache first
      final cached = await _loadAiCache('deep_analysis');
      if (cached != null && cached['result'] != null) {
        final cacheResult = cached['result'] as String;
        final parsed = cached['structured'] != null
            ? Map<String, dynamic>.from(cached['structured'] as Map)
            : _tryParseJson(cacheResult);
        if (parsed == null) {
          // Stale/unparseable cache — clear and re-fetch
          debugPrint('[Compair] Deep Analysis cache unparseable — re-fetching');
        } else {
          if (mounted) setState(() {
            _deepAnalysisResult = cacheResult;
            _deepAnalysisStructured = parsed;
            _deepAnalysisLoading = false;
          });
          _saveToSession();
          debugPrint('[Compair] ⏱ Deep Analysis from cache: ${sw.elapsedMilliseconds}ms');
          return;
        }
      }

      final lang = Localizations.localeOf(context).languageCode;
      final langName = lang == 'tr' ? 'Turkish' : 'English';
      final productNames = widget.products.map((p) => p.name).join(' vs ');
      final specSummary = widget.products.map((p) {
        final keySpecs = p.keySpecs.entries.take(10).map((e) => '${e.key}: ${e.value}').join(', ');
        return '${p.name} (${p.brand ?? ""}): Score ${p.techScore.toInt()}/100. $keySpecs';
      }).join('\n');

      final prompt = '''You are a senior tech analyst. Compare these products for the user. Address the user directly using "you/your". ALL text in $langName.
$productNames

Specs:
$specSummary

Return ONLY valid JSON, no markdown, no explanation:
{
  "winner": "product name",
  "verdict": "2-3 sentence comprehensive verdict addressing you directly",
  "products": {
    "<product_name>": {
      "score": 85,
      "strengths": ["detailed strength 1", "detailed strength 2", "detailed strength 3"],
      "weaknesses": ["detailed weakness 1", "detailed weakness 2"],
      "best_for": "ideal use case for you"
    }
  },
  "categories": {
    "Performance": {"scores": {"<name1>": 85, "<name2>": 70}, "explanation": "one line explanation"},
    "Display": {"scores": {"<name1>": 90, "<name2>": 80}, "explanation": "one line explanation"},
    "Battery": {"scores": {"<name1>": 75, "<name2>": 85}, "explanation": "one line explanation"},
    "Value": {"scores": {"<name1>": 80, "<name2>": 65}, "explanation": "one line explanation"},
    "Design": {"scores": {"<name1>": 70, "<name2>": 90}, "explanation": "one line explanation"}
  },
  "recommendation": "3-4 sentence personalized recommendation addressing you directly"
}''';

      debugPrint('[Compair] Deep Analysis starting for: $productNames');
      final parsed = await _fetchWithRetry(prompt, 'Deep Analysis', lang, maxTokens: 8192);
      if (mounted) {
        if (parsed == null) {
          debugPrint('[Compair] Deep Analysis parse FAILED — showing error');
          setState(() {
            _deepAnalysisError = true;
            _deepAnalysisLoading = false;
          });
        } else {
          final resultStr = jsonEncode(parsed);
          setState(() {
            _deepAnalysisResult = resultStr;
            _deepAnalysisStructured = parsed;
            _deepAnalysisLoading = false;
          });
          _saveToSession();
          _saveAiCache('deep_analysis', {
            'result': resultStr,
            'structured': parsed,
          });
        }
      }
      debugPrint('[Compair] ⏱ Deep Analysis from Gemini: ${sw.elapsedMilliseconds}ms');
    } catch (e, st) {
      debugPrint('[Compair] Deep Analysis FAILED: $e\n$st');
      if (mounted) setState(() {
        _deepAnalysisError = true;
        _deepAnalysisLoading = false;
      });
    }
  }

  Future<void> _toggleAlternatives() async {
    if (_alternativesExpanded && (_alternativesResult != null || _alternativesStructured != null)) {
      setState(() => _alternativesExpanded = false);
      return;
    }
    setState(() {
      _alternativesExpanded = true;
      if (_alternativesResult != null || _alternativesStructured != null) return;
      _alternativesLoading = true;
    });
    if (_alternativesResult == null && _alternativesStructured == null) {
      await _fetchAlternatives();
    }
  }

  Future<void> _fetchAlternatives() async {
    if (_alternativesResult != null || _alternativesStructured != null) return;
    final sw = Stopwatch()..start();
    try {
      // Check Firestore cache first
      final cached = await _loadAiCache('alternatives');
      if (cached != null && cached['result'] != null) {
        final cacheResult = cached['result'] as String;
        final parsed = cached['structured'] != null
            ? Map<String, dynamic>.from(cached['structured'] as Map)
            : _tryParseJson(cacheResult);
        if (parsed == null) {
          debugPrint('[Compair] Alternatives cache unparseable — re-fetching');
        } else {
          if (mounted) setState(() {
            _alternativesResult = cacheResult;
            _alternativesStructured = parsed;
            _alternativesLoading = false;
          });
          _saveToSession();
          debugPrint('[Compair] ⏱ Alternatives from cache: ${sw.elapsedMilliseconds}ms');
          return;
        }
      }

      final lang = Localizations.localeOf(context).languageCode;
      final langName = lang == 'tr' ? 'Turkish' : 'English';
      final productNames = widget.products.map((p) => '${p.name} (${p.brand ?? "Unknown"})').join(' vs ');
      final category = widget.products.first.category;

      final prompt = '''You are a tech expert. The user is comparing: $productNames in category "$category".
Suggest 3-5 alternative products they should also consider. Address the user directly using "you/your". ALL text in $langName.

Return ONLY valid JSON:
{
  "alternatives": [
    {
      "name": "Product Name",
      "brand": "Brand",
      "why_better": "1 sentence why this is worth considering for you",
      "price_range": "approx price range",
      "score": 0-100
    }
  ]
}''';

      debugPrint('[Compair] Alternatives starting for: $productNames');
      final parsed = await _fetchWithRetry(prompt, 'Alternatives', lang, maxTokens: 4096);
      if (mounted) {
        if (parsed == null) {
          debugPrint('[Compair] Alternatives parse FAILED — showing error');
          setState(() {
            _alternativesError = true;
            _alternativesLoading = false;
          });
        } else {
          final resultStr = jsonEncode(parsed);
          setState(() {
            _alternativesResult = resultStr;
            _alternativesStructured = parsed;
            _alternativesLoading = false;
          });
          _saveToSession();
          _saveAiCache('alternatives', {
            'result': resultStr,
            'structured': parsed,
          });
        }
      }
      debugPrint('[Compair] ⏱ Alternatives from Gemini: ${sw.elapsedMilliseconds}ms');
    } catch (e, st) {
      debugPrint('[Compair] Alternatives FAILED: $e\n$st');
      if (mounted) setState(() {
        _alternativesError = true;
        _alternativesLoading = false;
      });
    }
  }

  Future<void> _toggleAdvisor() async {
    if (_advisorExpanded && (_advisorResult != null || _advisorStructured != null)) {
      setState(() => _advisorExpanded = false);
      return;
    }
    setState(() {
      _advisorExpanded = true;
      if (_advisorResult != null || _advisorStructured != null) return;
      _advisorLoading = true;
    });
    if (_advisorResult == null && _advisorStructured == null) {
      await _fetchAdvisor();
    }
  }

  Future<void> _fetchAdvisor() async {
    if (_advisorResult != null || _advisorStructured != null) return;
    final sw = Stopwatch()..start();
    try {
      // Check Firestore cache first
      final cached = await _loadAiCache('advisor');
      if (cached != null && cached['result'] != null) {
        final cacheResult = cached['result'] as String;
        final parsed = cached['structured'] != null
            ? Map<String, dynamic>.from(cached['structured'] as Map)
            : _tryParseJson(cacheResult);
        if (parsed == null) {
          debugPrint('[Compair] Advisor cache unparseable — re-fetching');
        } else {
          if (mounted) setState(() {
            _advisorResult = cacheResult;
            _advisorStructured = parsed;
            _advisorLoading = false;
          });
          _saveToSession();
          debugPrint('[Compair] ⏱ Advisor from cache: ${sw.elapsedMilliseconds}ms');
          return;
        }
      }

      final lang = Localizations.localeOf(context).languageCode;
      final langName = lang == 'tr' ? 'Turkish' : 'English';
      final productDetails = widget.products.map((p) {
        final specs = p.specs.entries.take(10).map((e) => '${e.key}: ${e.value}').join(', ');
        final price = p.prices.isNotEmpty ? p.prices.values.first : 'N/A';
        return '${p.name} (Score: ${p.techScore}, Price: $price, Specs: $specs)';
      }).join('\n');

      final prompt = '''You are a personal tech shopping advisor. Address the user directly using "you/your". ALL text in $langName.

Products:
$productDetails

Return ONLY valid JSON, no markdown, no explanation:
{
  "recommended": "exact product name you recommend",
  "best_for": "1 sentence summary - which product is best for most users and why",
  "match_points": ["reason this fits the user 1", "reason 2", "reason 3"],
  "caution_points": ["scenario where this is NOT the right choice", "another scenario"],
  "per_product": [
    {
      "name": "product name",
      "ideal_user": "who should buy this",
      "rating": 4
    }
  ],
  "final_verdict": "2-3 sentence clear recommendation addressing you directly"
}''';

      debugPrint('[Compair] Advisor starting');
      final parsed = await _fetchWithRetry(prompt, 'Advisor', lang, maxTokens: 4096);
      if (mounted) {
        if (parsed == null) {
          setState(() {
            _advisorError = true;
            _advisorLoading = false;
          });
        } else {
          final resultStr = jsonEncode(parsed);
          setState(() {
            _advisorResult = resultStr;
            _advisorStructured = parsed;
            _advisorLoading = false;
          });
          _saveToSession();
          _saveAiCache('advisor', {
            'result': resultStr,
            'structured': parsed,
          });
        }
      }
      debugPrint('[Compair] ⏱ Advisor from Gemini: ${sw.elapsedMilliseconds}ms');
    } catch (e, st) {
      debugPrint('[Compair] Advisor FAILED: $e\n$st');
      if (mounted) setState(() {
        _advisorError = true;
        _advisorLoading = false;
      });
    }
  }

  Future<void> _togglePrediction() async {
    if (_predictionExpanded && (_predictionResult != null || _predictionStructured != null)) {
      setState(() => _predictionExpanded = false);
      return;
    }
    setState(() {
      _predictionExpanded = true;
      if (_predictionResult != null || _predictionStructured != null) return;
      _predictionLoading = true;
    });
    if (_predictionResult == null && _predictionStructured == null) {
      await _fetchPrediction();
    }
  }

  Future<void> _fetchPrediction() async {
    if (_predictionResult != null || _predictionStructured != null) return;
    final sw = Stopwatch()..start();
    try {
      // Check Firestore cache first
      final cached = await _loadAiCache('prediction');
      if (cached != null && cached['result'] != null) {
        final cacheResult = cached['result'] as String;
        final parsed = cached['structured'] != null
            ? Map<String, dynamic>.from(cached['structured'] as Map)
            : _tryParseJson(cacheResult);
        if (parsed == null) {
          debugPrint('[Compair] Prediction cache unparseable — re-fetching');
        } else {
          if (mounted) setState(() {
            _predictionResult = cacheResult;
            _predictionStructured = parsed;
            _predictionLoading = false;
          });
          _saveToSession();
          debugPrint('[Compair] ⏱ Prediction from cache: ${sw.elapsedMilliseconds}ms');
          return;
        }
      }

      final lang = Localizations.localeOf(context).languageCode;
      final langName = lang == 'tr' ? 'Turkish' : 'English';
      final productNames = widget.products.map((p) {
        final price = p.prices.isNotEmpty ? p.prices.values.first : 'N/A';
        return '${p.name} (current price: $price)';
      }).join(', ');

      final prompt = '''You are a price analyst. These products may be real or hypothetical. Make reasonable predictions based on market trends. Address the user directly using "you/your". ALL text in $langName.

Products: $productNames

Return ONLY valid JSON, no markdown, no explanation:
{
  "products": [
    {
      "name": "product name",
      "trend": "dropping",
      "change_percent": -5,
      "best_time_to_buy": "now",
      "confidence": 75,
      "reason": "1-2 sentence explanation of the prediction"
    }
  ]
}
Note: trend must be one of "dropping", "stable", "rising". best_time_to_buy must be one of "now", "wait_1_month", "wait_3_months". confidence is 0-100.''';

      debugPrint('[Compair] Prediction starting');
      final parsed = await _fetchWithRetry(prompt, 'Prediction', lang, maxTokens: 4096);
      if (mounted) {
        if (parsed == null) {
          setState(() {
            _predictionError = true;
            _predictionLoading = false;
          });
        } else {
          final resultStr = jsonEncode(parsed);
          setState(() {
            _predictionResult = resultStr;
            _predictionStructured = parsed;
            _predictionLoading = false;
          });
          _saveToSession();
          _saveAiCache('prediction', {
            'result': resultStr,
            'structured': parsed,
          });
        }
      }
      debugPrint('[Compair] ⏱ Prediction from Gemini: ${sw.elapsedMilliseconds}ms');
    } catch (e, st) {
      debugPrint('[Compair] Prediction FAILED: $e\n$st');
      if (mounted) setState(() {
        _predictionError = true;
        _predictionLoading = false;
      });
    }
  }

  /// Merge spec groups from all products into a unified structure.
  /// Returns: { groupName: { specKey: [val1, val2, ...] } }
  Map<String, Map<String, List<String>>> _buildGroupedSpecs() {
    final result = <String, Map<String, List<String>>>{};
    final productCount = widget.products.length;

    // Use specSections when available, fallback to specs
    Map<String, dynamic> displaySpecs(product) =>
        product.specSections.isNotEmpty ? product.specSections : product.specs;

    // Collect all group names from all products
    final allGroupNames = <String>{};
    for (final product in widget.products) {
      for (final entry in displaySpecs(product).entries) {
        if (entry.value is Map && (entry.value as Map).isNotEmpty) {
          allGroupNames.add(entry.key);
        }
      }
    }

    // Sort groups by priority (matching epey.com spec ordering)
    const specGroupPriority = [
      'basic information',
      'design',
      'display',
      'basic hardware',
      'processor',
      'hardware',
      'memory',
      'storage',
      'camera',
      'battery',
      'network connections',
      'wireless connections',
      'operating system',
      'multimedia',
      'features',
      'sensors',
      'other connections',
      'other',
    ];
    final sortedGroupNames = allGroupNames.toList();
    sortedGroupNames.sort((a, b) {
      final aLower = a.toLowerCase();
      final bLower = b.toLowerCase();
      int aIdx = specGroupPriority.indexWhere((p) => aLower.contains(p));
      int bIdx = specGroupPriority.indexWhere((p) => bLower.contains(p));
      if (aIdx == -1) aIdx = 900;
      if (bIdx == -1) bIdx = 900;
      return aIdx.compareTo(bIdx);
    });

    // For each group (in priority order), collect all spec keys and values per product
    for (final groupName in sortedGroupNames) {
      final allKeys = <String>{};
      // Gather all spec keys in this group across all products
      for (final product in widget.products) {
        final group = displaySpecs(product)[groupName];
        if (group is Map) {
          for (final entry in group.entries) {
            if (entry.value is Map) {
              // Nested sub-group: flatten
              for (final subKey in (entry.value as Map).keys) {
                allKeys.add(subKey.toString());
              }
            } else {
              allKeys.add(entry.key.toString());
            }
          }
        }
      }

      if (allKeys.isEmpty) continue;
      final groupSpecs = <String, List<String>>{};

      for (final specKey in allKeys) {
        final values = <String>[];
        for (final product in widget.products) {
          final group = displaySpecs(product)[groupName];
          String val = '—';
          if (group is Map) {
            if (group.containsKey(specKey)) {
              final v = group[specKey];
              val = (v != null && v.toString().isNotEmpty && v.toString() != 'null' && v.toString() != '?')
                  ? v.toString()
                  : '—';
            } else {
              // Check in nested sub-groups
              for (final entry in group.entries) {
                if (entry.value is Map && (entry.value as Map).containsKey(specKey)) {
                  final v = (entry.value as Map)[specKey];
                  val = (v != null && v.toString().isNotEmpty && v.toString() != 'null' && v.toString() != '?')
                      ? v.toString()
                      : '—';
                  break;
                }
              }
            }
          }
          values.add(val);
        }
        // Only add if at least one product has a value
        if (values.any((v) => v != '—')) {
          groupSpecs[specKey] = values;
        }
      }

      if (groupSpecs.isNotEmpty) {
        result[groupName] = groupSpecs;
      }
    }

    // Handle flat (ungrouped) specs
    final flatSpecs = <String, List<String>>{};
    for (final product in widget.products) {
      for (final entry in displaySpecs(product).entries) {
        if (entry.value is! Map) {
          flatSpecs.putIfAbsent(entry.key, () => List.filled(productCount, '—'));
        }
      }
    }
    for (int i = 0; i < productCount; i++) {
      for (final entry in displaySpecs(widget.products[i]).entries) {
        if (entry.value is! Map && flatSpecs.containsKey(entry.key)) {
          final v = entry.value;
          flatSpecs[entry.key]![i] = (v != null && v.toString().isNotEmpty && v.toString() != 'null')
              ? v.toString()
              : '—';
        }
      }
    }
    if (flatSpecs.isNotEmpty) {
      result['Other'] = flatSpecs;
    }

    return result;
  }

  String _formatKey(String key) {
    return key.replaceAll('_', ' ').split(' ').map((w) => w.isNotEmpty ? w[0].toUpperCase() + w.substring(1) : '').join(' ');
  }

  String _localizedGroupName(BuildContext context, String key) {
    final l = context.l10n;
    if (l == null) return _formatKey(key);
    final k = key.toLowerCase().replaceAll('_', ' ').trim();
    final map = <String, String>{
      'general features': l.specGroupGeneral,
      'general': l.specGroupGeneral,
      'general information': l.specGroupGeneral,
      'basic features': l.specGroupGeneral,
      'basic information': l.specGroupGeneral,
      'design & dimensions': l.specGroupDesign,
      'design': l.specGroupDesign,
      'dimensions': l.specGroupDesign,
      'dimensions & weight': l.specGroupDimensionsWeight,
      'basic hardware': l.specGroupHardware,
      'hardware': l.specGroupHardware,
      'camera': l.specGroupCamera,
      'battery': l.specGroupBattery,
      'network connections': l.specGroupNetwork,
      'network': l.specGroupNetwork,
      'display': l.specGroupDisplay,
      'display/audio': l.specGroupDisplayAudio,
      'storage': l.specGroupStorage,
      'storage features': l.specGroupStorage,
      'storage & optical drive': l.specGroupStorageOptical,
      'connectivity': l.specGroupConnectivity,
      'software': l.specGroupSoftware,
      'operating system': l.specGroupSoftware,
      'audio': l.specGroupAudio,
      'audio features': l.specGroupAudio,
      'sound': l.specGroupAudio,
      'security': l.specGroupSecurity,
      'performance': l.specGroupPerformance,
      'sensors': l.specGroupSensors,
      'sensor': l.specGroupSensors,
      'features': l.specGroupFeatures,
      'main features': l.specGroupMainFeatures,
      'processor': l.specGroupProcessor,
      'memory': l.specGroupMemory,
      'memory features': l.specGroupMemory,
      'memory (ram) features': l.specGroupMemory,
      'ports & interfaces': l.specGroupPorts,
      'ports': l.specGroupPorts,
      'graphics card': l.specGroupGpu,
      'gpu': l.specGroupGpu,
      'keyboard': l.specGroupKeyboard,
      'other': l.specGroupOther,
      'other information': l.specGroupOtherInfo,
      'weight & dimensions': l.specGroupWeight,
      'weight': l.specGroupWeight,
      'screen': l.specGroupScreen,
      'video': l.specGroupVideo,
      'image': l.specGroupImage,
      'charging': l.specGroupCharging,
      'wireless': l.specGroupWireless,
      'wireless connections': l.specGroupWireless,
      'connections': l.specGroupConnections,
      'connection & interface': l.specGroupConnectionInterface,
      'connections & interfaces': l.specGroupConnectionInterface,
      'body': l.specGroupBody,
      'multimedia': l.specGroupMultimedia,
      'multimedia features': l.specGroupMultimedia,
      'power': l.specGroupPower,
      'power and connections': l.specGroupPowerConnections,
      'input/output': l.specGroupInputOutput,
      'input / output': l.specGroupInputOutput,
      'communications': l.specGroupCommunications,
      'expansion': l.specGroupExpansion,
      'expansion slots': l.specGroupExpansion,
      'optics': l.specGroupOptics,
      'lens': l.specGroupOptics,
      'durability': l.specGroupDurability,
      'physical durability': l.specGroupDurability,
      'recording': l.specGroupRecording,
      'focus': l.specGroupFocus,
      'autofocus': l.specGroupFocus,
      'flash': l.specGroupFlash,
      'exposure': l.specGroupExposureShooting,
      'exposure & shooting': l.specGroupExposureShooting,
      'energy and design': l.specGroupEnergyDesign,
      'hardware/software': l.specGroupHardwareSoftware,
      'receivers': l.specGroupReceivers,
      'cooling features': l.specGroupCooling,
      'technological infrastructure': l.specGroupTechInfra,
      'technical information': l.specGroupTechnical,
      'rear connections': l.specGroupRearConnections,
      'other connections': l.specGroupOtherConnections,
      // Additional Firestore groups
      'connections and slots': l.specGroupConnectionsSlots,
      'design and dimensions': l.specGroupDesign,
      'design & function': l.specGroupDesignFunction,
      'document & other': l.specGroupDocOther,
      'fan features': l.specGroupFan,
      'hardware/software features': l.specGroupHardwareSoftware,
      'image/sound features': l.specGroupImageSound,
      'memory & storage': l.specGroupMemoryStorage,
      'pump features': l.specGroupPump,
      'power and storage features': l.specGroupPowerStorage,
      'video and lens': l.specGroupVideoLens,
      'documentation': l.specGroupDocumentation,
    };
    final groupExact = map[k];
    if (groupExact != null) return groupExact;
    final locale = Localizations.localeOf(context).languageCode;
    if (locale != 'en') {
      final translated = spec_dict.translateSpec(key, locale);
      if (translated.toLowerCase() != k) return translated;
    }
    return _formatKey(key);
  }

  String _localizedSpecName(BuildContext context, String key) {
    final l = context.l10n;
    if (l == null) return _formatKey(key);
    final k = key.toLowerCase().replaceAll('_', ' ').trim();
    final map = <String, String>{
      'screen resolution': l.specResolution,
      'screen aspect ratio': l.specResolution,
      'display size': l.specDisplaySize,
      'screen size': l.specScreenSize,
      'display type': l.specDisplayType,
      'screen technology': l.specScreenTechnology,
      'weight': l.specWeight,
      'height': l.specHeight,
      'width': l.specWidth,
      'depth': l.specThickness,
      'thickness': l.specThickness,
      'dimensions': l.specDimensions,
      'processor': l.specProcessor,
      'processor speed': l.specClockSpeed,
      'processor type': l.specProcessor,
      'cpu': l.specCpu,
      'ram': l.specRam,
      'ram capacity': l.specRam,
      'ram type': l.specMemoryType,
      'memory type': l.specMemoryType,
      'memory speed': l.specMemorySpeed,
      'memory bus': l.specMemoryBus,
      'internal storage': l.specInternalStorage,
      'storage': l.specStorage,
      'storage capacity': l.specStorage,
      'storage type': l.specStorageType,
      'expandable storage': l.specExpandableStorage,
      'battery capacity': l.specBatteryCapacity,
      'battery life': l.specBatteryLife,
      'charging speed': l.specChargingSpeed,
      'operating system': l.specOperatingSystem,
      'os': l.specOs,
      'bluetooth': l.specBluetooth,
      'wifi': l.specWifi,
      'wi-fi': l.specWifi,
      'nfc': l.specNfc,
      'usb': l.specUsb,
      'usb type': l.specUsb,
      'hdmi': l.specPorts,
      'color': l.specColor,
      'colors': l.specColors,
      'material': l.specFormFactor,
      'refresh rate': l.specRefreshRate,
      'panel type': l.specPanelType,
      'brightness': l.specBrightness,
      'contrast ratio': l.specContrastRatio,
      'resolution': l.specResolution,
      'max resolution': l.specMaxResolution,
      'camera': l.specMainCamera,
      'front camera': l.specFrontCamera,
      'rear camera': l.specRearCamera,
      'main camera': l.specMainCamera,
      'video resolution': l.specVideoRecording,
      'video recording': l.specVideoRecording,
      'sim card': l.specSim,
      'sim': l.specSim,
      'sim type': l.specSim,
      'dual sim': l.specDualSim,
      'fingerprint': l.specFingerprintSensor,
      'fingerprint sensor': l.specFingerprintSensor,
      'face recognition': l.specFaceRecognition,
      'water resistance': l.specWaterResistance,
      'ip rating': l.specIpRating,
      'wireless charging': l.specWirelessCharging,
      'fast charging': l.specChargingSpeed,
      'displayport': l.specPorts,
      'number of cores': l.specCores,
      'cores': l.specCores,
      'core count': l.specCores,
      'threads': l.specThreads,
      'thread count': l.specThreads,
      'base clock': l.specBaseClock,
      'boost clock': l.specBoostClock,
      'tdp': l.specTdp,
      'cache': l.specCache,
      'architecture': l.specArchitecture,
      'process': l.specProcess,
      'vram': l.specVram,
      'clock speed': l.specClockSpeed,
      'cuda cores': l.specCudaCores,
      'stream processors': l.specStreamProcessors,
      'power supply': l.specPowerSupply,
      'wattage': l.specPowerSupply,
      'noise level': l.specNoiseLevel,
      'response time': l.specResponseTime,
      'hdr': l.specHdr,
      'color gamut': l.specColorGamut,
      'speaker': l.specSpeaker,
      'microphone': l.specMicrophone,
      'microphone type': l.specMicrophoneType,
      'headphone jack': l.specHeadphoneJack,
      'driver size': l.specDriverSize,
      'impedance': l.specImpedance,
      'frequency response': l.specFrequencyResponse,
      'active noise cancellation': l.specActiveNoiseCancellation,
      'wireless range': l.specWirelessRange,
      'connectivity': l.specConnectivity,
      'connection type': l.specConnectionType,
      'warranty': l.specWarranty,
      'model': l.specModel,
      'brand': l.specBrand,
      'series': l.specSeries,
      'release date': l.specReleaseDate,
      'year': l.specYear,
      'release year': l.specYear,
      'gpu': l.specGpu,
      'graphics': l.specGraphics,
      'touchscreen': l.specTouchscreen,
      'keyboard': l.specKeyboard,
      'trackpad': l.specTrackpad,
      'webcam': l.specWebcam,
      'sensor': l.specSensor,
      'smart assistant': l.specSmartAssistant,
      'gps': l.specGps,
      'accelerometer': l.specAccelerometer,
      'gyroscope': l.specGyroscope,
      'barometer': l.specBarometer,
      'compass': l.specCompass,
      'proximity': l.specProximity,
      'network': l.specNetwork,
      'band': l.specBand,
      'form factor': l.specFormFactor,
      'ports': l.specPorts,
      'wireless': l.specWireless,
    };
    final specExact = map[k];
    if (specExact != null) return specExact;
    final locale = Localizations.localeOf(context).languageCode;
    if (locale != 'en') {
      final translated = spec_dict.translateSpec(key, locale);
      if (translated.toLowerCase() != k) return translated;
    }
    return _formatKey(key);
  }

  /// Translate spec values (colors, materials, booleans, etc.)
  String _localizedSpecValue(BuildContext context, String val) {
    if (val.isEmpty || val == '—') return val;
    final locale = Localizations.localeOf(context).languageCode;
    if (locale == 'en') return val;
    // Boolean/status shortcuts
    final lower = val.trim().toLowerCase();
    final l = context.l10n;
    if (l != null) {
      if (lower == 'yes' || lower == 'true') return l.specValYes;
      if (lower == 'no' || lower == 'no.' || lower == 'false') return l.specValNo;
      if (lower == 'available') return l.specValAvailable;
      if (lower == 'not available' || lower == 'n/a') return l.specValNotAvailable;
    }
    final translated = spec_dict.translateSpec(val, locale);
    if (translated != val) return translated;
    return val;
  }


  /// Returns the index of the "better" value for a given spec.
  /// Uses SpecDirectionService (with component rankings + Firestore overrides).
  /// -1 if values are equal or undecidable.
  int _findBetterIndex(String key, List<String> values) {
    final serviceAsync = ref.read(specDirectionServiceProvider);
    final service = serviceAsync.valueOrNull;
    if (service != null) {
      return service.findBetterIndex(key, values);
    }
    // Fallback while service loads: basic boolean check only
    if (values.length < 2 || values.any((v) => v == '—')) return -1;
    final lowers = values.map((v) => v.toLowerCase()).toList();
    final allBool = lowers.every((v) => v.contains('yes') || v.contains('no') || v.startsWith('✓') || v.startsWith('✗'));
    if (allBool) {
      final idx = lowers.indexWhere((v) => v.contains('yes') || v.startsWith('✓'));
      final hasNo = lowers.any((v) => v.contains('no') || v.startsWith('✗'));
      if (idx >= 0 && hasNo) return idx;
    }
    return -1;
  }


  Color _aiScoreColor(double score) {
    if (score >= 80) return AppTheme.scoreExcellent;
    if (score >= 60) return AppTheme.scoreAverage;
    if (score >= 40) return AppTheme.orange500;
    return AppTheme.error;
  }

  Widget _buildAiShimmer() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _ShimmerBlock(width: 200, height: 20),
        const SizedBox(height: 10),
        _ShimmerBlock(width: double.infinity, height: 14),
        const SizedBox(height: 8),
        _ShimmerBlock(width: double.infinity, height: 14),
        const SizedBox(height: 8),
        _ShimmerBlock(width: 160, height: 14),
      ],
    );
  }

  Widget _buildAiError(VoidCallback onRetry) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.error_outline_rounded, size: 48, color: AppTheme.error.withValues(alpha: 0.6)),
            const SizedBox(height: 12),
            Text('Analiz yüklenemedi', style: GoogleFonts.plusJakartaSans(
              fontSize: 14, fontWeight: FontWeight.w600, color: context.textSecondary)),
            const SizedBox(height: 12),
            GestureDetector(
              onTap: onRetry,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(colors: [AppTheme.amber500, Color(0xFFF59E0B)]),
                  borderRadius: BorderRadius.circular(10)),
                child: Text('Tekrar Dene', style: GoogleFonts.plusJakartaSans(
                  fontSize: 13, fontWeight: FontWeight.w700, color: Colors.white)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ─── Structured Visual Builders for Premium AI Sections ───

  Widget _buildDeepAnalysisVisual() {
    final data = _deepAnalysisStructured!;
    final winner = data['winner'] as String?;
    final verdict = data['verdict'] as String?;
    final products = data['products'] as Map<String, dynamic>? ?? {};
    final categories = data['categories'] as Map<String, dynamic>? ?? {};
    final recommendation = data['recommendation'] as String?;
    final productNames = widget.products.map((p) => p.name).toList();
    final barColors = [
      const Color(0xFF6366F1), const Color(0xFFEC4899), const Color(0xFF06B6D4),
      const Color(0xFFF59E0B), const Color(0xFF10B981),
    ];

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      // Winner card
      if (winner != null)
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            gradient: LinearGradient(colors: [
              const Color(0xFFFFD700).withValues(alpha: 0.15),
              const Color(0xFFFFA500).withValues(alpha: 0.08)]),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: const Color(0xFFFFD700).withValues(alpha: 0.4), width: 1.5)),
          child: Column(children: [
            const Text('🏆', style: TextStyle(fontSize: 24)),
            const SizedBox(height: 4),
            Text(winner, style: GoogleFonts.plusJakartaSans(
              fontSize: 16, fontWeight: FontWeight.w800, color: context.textPrimary),
              maxLines: 2, overflow: TextOverflow.ellipsis, textAlign: TextAlign.center),
            if (verdict != null) ...[
              const SizedBox(height: 6),
              Text(verdict, style: GoogleFonts.plusJakartaSans(
                fontSize: 12, color: context.textSecondary, height: 1.4),
                textAlign: TextAlign.center),
            ],
          ]),
        ),
      // Per-product scores
      if (products.isNotEmpty) ...[
        const SizedBox(height: 14),
        ...products.entries.map((e) {
          final pData = e.value as Map<String, dynamic>? ?? {};
          final score = (pData['score'] as num?)?.toDouble() ?? 0;
          final strengths = List<String>.from(pData['strengths'] ?? []);
          final weaknesses = List<String>.from(pData['weaknesses'] ?? []);
          final bestFor = pData['best_for'] as String? ?? '';
          return Container(
            margin: const EdgeInsets.only(bottom: 10),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: context.surfaceElevatedColor,
              borderRadius: BorderRadius.circular(12)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Expanded(child: Text(e.key, style: GoogleFonts.plusJakartaSans(
                  fontSize: 13, fontWeight: FontWeight.w700, color: context.textPrimary),
                  maxLines: 1, overflow: TextOverflow.ellipsis)),
                Container(
                  width: 42, height: 42,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: LinearGradient(colors: [
                      _aiScoreColor(score).withValues(alpha: 0.7), _aiScoreColor(score)])),
                  child: Center(child: Text('${score.toInt()}',
                    style: GoogleFonts.plusJakartaSans(fontSize: 14, fontWeight: FontWeight.w900, color: Colors.white))),
                ),
              ]),
              if (bestFor.isNotEmpty) ...[
                const SizedBox(height: 6),
                Text('🎯 $bestFor', style: GoogleFonts.plusJakartaSans(
                  fontSize: 11, color: context.textSecondary, fontStyle: FontStyle.italic)),
              ],
              if (strengths.isNotEmpty) ...[
                const SizedBox(height: 6),
                ...strengths.take(3).map((s) => Padding(
                  padding: const EdgeInsets.only(bottom: 2),
                  child: Row(children: [
                    const Text('✅ ', style: TextStyle(fontSize: 10)),
                    Expanded(child: Text(s, style: GoogleFonts.plusJakartaSans(
                      fontSize: 11, color: context.textSecondary))),
                  ]),
                )),
              ],
              if (weaknesses.isNotEmpty) ...[
                const SizedBox(height: 4),
                ...weaknesses.take(2).map((w) => Padding(
                  padding: const EdgeInsets.only(bottom: 2),
                  child: Row(children: [
                    const Text('⚠️ ', style: TextStyle(fontSize: 10)),
                    Expanded(child: Text(w, style: GoogleFonts.plusJakartaSans(
                      fontSize: 11, color: context.textTertiaryColor))),
                  ]),
                )),
              ],
            ]),
          );
        }),
      ],
      // Category comparison bar chart using fl_chart
      if (categories.isNotEmpty) ...[
        const SizedBox(height: 14),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: context.surfaceElevatedColor,
            borderRadius: BorderRadius.circular(14)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('📊 Category Comparison', style: GoogleFonts.plusJakartaSans(
              fontSize: 14, fontWeight: FontWeight.w700, color: context.textPrimary)),
            const SizedBox(height: 4),
            // Legend
            Wrap(spacing: 12, runSpacing: 4, children: [
              for (int i = 0; i < productNames.length && i < barColors.length; i++)
                Row(mainAxisSize: MainAxisSize.min, children: [
                  Container(width: 10, height: 10, decoration: BoxDecoration(
                    color: barColors[i], borderRadius: BorderRadius.circular(2))),
                  const SizedBox(width: 4),
                  Text(productNames[i].length > 15 ? '${productNames[i].substring(0, 15)}…' : productNames[i],
                    style: GoogleFonts.plusJakartaSans(fontSize: 10, color: context.textSecondary)),
                ]),
            ]),
            const SizedBox(height: 12),
            SizedBox(
              height: categories.length * 48.0 + 20,
              child: BarChart(BarChartData(
                alignment: BarChartAlignment.spaceAround,
                maxY: 100,
                barTouchData: BarTouchData(
                  touchTooltipData: BarTouchTooltipData(
                    getTooltipItem: (group, groupIndex, rod, rodIndex) {
                      final pName = productNames.length > rodIndex ? productNames[rodIndex] : '';
                      return BarTooltipItem('$pName\n${rod.toY.toInt()}',
                        GoogleFonts.plusJakartaSans(fontSize: 11, fontWeight: FontWeight.w600, color: Colors.white));
                    },
                  ),
                ),
                titlesData: FlTitlesData(
                  show: true,
                  bottomTitles: AxisTitles(sideTitles: SideTitles(
                    showTitles: true, reservedSize: 32,
                    getTitlesWidget: (value, meta) {
                      final idx = value.toInt();
                      if (idx < 0 || idx >= categories.length) return const SizedBox.shrink();
                      final catName = categories.keys.elementAt(idx);
                      return Padding(
                        padding: const EdgeInsets.only(top: 6),
                        child: Text(catName.length > 8 ? '${catName.substring(0, 8)}…' : catName,
                          style: GoogleFonts.plusJakartaSans(fontSize: 9, color: context.textTertiaryColor),
                          textAlign: TextAlign.center),
                      );
                    },
                  )),
                  leftTitles: AxisTitles(sideTitles: SideTitles(
                    showTitles: true, reservedSize: 28,
                    getTitlesWidget: (value, meta) => Text('${value.toInt()}',
                      style: GoogleFonts.plusJakartaSans(fontSize: 9, color: context.textTertiaryColor)),
                  )),
                  topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                  rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                ),
                gridData: FlGridData(
                  show: true,
                  drawVerticalLine: false,
                  horizontalInterval: 25,
                  getDrawingHorizontalLine: (value) => FlLine(
                    color: context.dividerColor, strokeWidth: 0.5),
                ),
                borderData: FlBorderData(show: false),
                barGroups: _buildCategoryBarGroups(categories, productNames, barColors),
              )),
            ),
            // Expandable explanations per category
            const SizedBox(height: 12),
            ...categories.entries.map((cat) {
              final catData = cat.value;
              String? explanation;
              if (catData is Map<String, dynamic>) {
                explanation = catData['explanation'] as String?;
              }
              if (explanation == null) return const SizedBox.shrink();
              return Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('${_categoryIcon(cat.key)} ', style: const TextStyle(fontSize: 12)),
                  Expanded(child: RichText(text: TextSpan(children: [
                    TextSpan(text: '${cat.key}: ', style: GoogleFonts.plusJakartaSans(
                      fontSize: 11, fontWeight: FontWeight.w700, color: context.textPrimary)),
                    TextSpan(text: explanation, style: GoogleFonts.plusJakartaSans(
                      fontSize: 11, color: context.textSecondary)),
                  ]))),
                ]),
              );
            }),
          ]),
        ),
      ],
      // Recommendation
      if (recommendation != null) ...[
        const SizedBox(height: 10),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            gradient: LinearGradient(colors: [
              AppTheme.brandBlue.withValues(alpha: 0.08),
              AppTheme.brandSkyBlue.withValues(alpha: 0.06)]),
            borderRadius: BorderRadius.circular(12)),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('💡', style: TextStyle(fontSize: 14)),
            const SizedBox(width: 8),
            Expanded(child: Text(recommendation, style: GoogleFonts.plusJakartaSans(
              fontSize: 12, height: 1.5, color: context.textPrimary))),
          ]),
        ),
      ],
    ]);
  }

  String _categoryIcon(String category) {
    const icons = {
      'Performance': '⚡', 'Display': '🖥️', 'Build Quality': '🔨',
      'Value': '💰', 'Features': '✨', 'Camera': '📷', 'Battery': '🔋',
      'Software': '📱', 'Audio': '🔊', 'Design': '🎨',
    };
    return icons[category] ?? '📊';
  }

  List<BarChartGroupData> _buildCategoryBarGroups(
    Map<String, dynamic> categories, List<String> productNames, List<Color> barColors) {
    final groups = <BarChartGroupData>[];
    int catIdx = 0;
    for (final cat in categories.entries) {
      final catData = cat.value;
      Map<String, dynamic> scores = {};
      if (catData is Map<String, dynamic>) {
        // New format: {"scores": {...}, "explanation": "..."}
        if (catData.containsKey('scores')) {
          scores = Map<String, dynamic>.from(catData['scores'] as Map);
        } else {
          // Old format: {"<name1>": 85, "<name2>": 70} — filter out non-numeric entries
          scores = Map.fromEntries(catData.entries.where((e) => e.value is num));
        }
      }
      final rods = <BarChartRodData>[];
      for (int pIdx = 0; pIdx < productNames.length; pIdx++) {
        final pName = productNames[pIdx];
        double val = 0;
        // Try exact match first, then partial match
        if (scores.containsKey(pName)) {
          val = (scores[pName] as num).toDouble();
        } else {
          for (final se in scores.entries) {
            if (pName.toLowerCase().contains(se.key.toLowerCase()) ||
                se.key.toLowerCase().contains(pName.toLowerCase())) {
              val = (se.value as num).toDouble();
              break;
            }
          }
        }
        rods.add(BarChartRodData(
          toY: val, width: 12,
          color: barColors[pIdx % barColors.length],
          borderRadius: const BorderRadius.only(
            topLeft: Radius.circular(3), topRight: Radius.circular(3)),
        ));
      }
      groups.add(BarChartGroupData(x: catIdx, barRods: rods, barsSpace: 3));
      catIdx++;
    }
    return groups;
  }

  Widget _buildAlternativesVisual() {
    final data = _alternativesStructured!;
    final alternatives = List<Map<String, dynamic>>.from(
      (data['alternatives'] as List<dynamic>?)?.map((e) => e as Map<String, dynamic>) ?? []);
    if (alternatives.isEmpty) {
      return _buildAiError(() {
        setState(() { _alternativesError = false; _alternativesLoading = true; _alternativesResult = null; _alternativesStructured = null; });
        _fetchAlternatives();
      });
    }
    return SizedBox(
      height: 150,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: alternatives.length,
        separatorBuilder: (_, __) => const SizedBox(width: 10),
        itemBuilder: (context, i) {
          final alt = alternatives[i];
          final score = (alt['score'] as num?)?.toDouble() ?? 0;
          return Container(
            width: 200,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: context.surfaceElevatedColor,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: _aiScoreColor(score).withValues(alpha: 0.2))),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Expanded(child: Text(alt['name'] as String? ?? '',
                  style: GoogleFonts.plusJakartaSans(fontSize: 13, fontWeight: FontWeight.w700, color: context.textPrimary),
                  maxLines: 1, overflow: TextOverflow.ellipsis)),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: _aiScoreColor(score).withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(6)),
                  child: Text('${score.toInt()}', style: GoogleFonts.plusJakartaSans(
                    fontSize: 11, fontWeight: FontWeight.w800, color: _aiScoreColor(score))),
                ),
              ]),
              if (alt['brand'] != null) ...[
                const SizedBox(height: 2),
                Text((alt['brand'] as String).toUpperCase(), style: GoogleFonts.plusJakartaSans(
                  fontSize: 10, fontWeight: FontWeight.w600, color: context.textTertiaryColor, letterSpacing: 0.5)),
              ],
              const Spacer(),
              if (alt['why_better'] != null)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
                  decoration: BoxDecoration(
                    color: AppTheme.scoreExcellent.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(6)),
                  child: ExpandableText(alt['why_better'] as String, style: GoogleFonts.plusJakartaSans(
                    fontSize: 10, color: AppTheme.scoreExcellent), maxLines: 2),
                ),
              if (alt['price_range'] != null) ...[
                const SizedBox(height: 4),
                Text('💰 ${alt['price_range']}', style: GoogleFonts.plusJakartaSans(
                  fontSize: 10, color: context.textSecondary)),
              ],
            ]),
          );
        },
      ),
    );
  }

  Widget _buildAdvisorVisual() {
    final data = _advisorStructured!;
    final recommended = data['recommended'] as String? ?? data['best_for'] as String?;
    final bestFor = data['best_for'] as String?;
    final matchPoints = List<String>.from(data['match_points'] ?? data['buy_if'] ?? []);
    final cautionPoints = List<String>.from(data['caution_points'] ?? data['avoid_if'] ?? []);
    final perProduct = List<Map<String, dynamic>>.from(
      (data['per_product'] as List<dynamic>?)?.map((e) => e as Map<String, dynamic>) ?? []);
    final finalVerdict = data['final_verdict'] as String?;

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      // Recommended product card
      if (recommended != null || bestFor != null)
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            gradient: LinearGradient(colors: [
              const Color(0xFF3B82F6).withValues(alpha: 0.12),
              const Color(0xFF06B6D4).withValues(alpha: 0.08)]),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: const Color(0xFF3B82F6).withValues(alpha: 0.2))),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: const Color(0xFF3B82F6).withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(10)),
                child: const Icon(Icons.recommend_rounded, color: Color(0xFF3B82F6), size: 20),
              ),
              const SizedBox(width: 10),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Recommended', style: GoogleFonts.plusJakartaSans(
                  fontSize: 11, fontWeight: FontWeight.w600, color: const Color(0xFF3B82F6), letterSpacing: 0.5)),
                if (recommended != null)
                  Text(recommended, style: GoogleFonts.plusJakartaSans(
                    fontSize: 15, fontWeight: FontWeight.w800, color: context.textPrimary),
                    maxLines: 2, overflow: TextOverflow.ellipsis),
              ])),
            ]),
            if (bestFor != null && recommended != bestFor) ...[
              const SizedBox(height: 8),
              Text(bestFor, style: GoogleFonts.plusJakartaSans(
                fontSize: 12, color: context.textSecondary, height: 1.4)),
            ],
          ]),
        ),
      // Match points (green)
      if (matchPoints.isNotEmpty) ...[
        const SizedBox(height: 12),
        ...matchPoints.map((item) => Container(
          margin: const EdgeInsets.only(bottom: 6),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            color: AppTheme.scoreExcellent.withValues(alpha: 0.08),
            borderRadius: BorderRadius.circular(10)),
          child: Row(children: [
            Icon(Icons.check_circle_rounded, size: 16, color: AppTheme.scoreExcellent),
            const SizedBox(width: 8),
            Expanded(child: Text(item, style: GoogleFonts.plusJakartaSans(
              fontSize: 12, color: context.textPrimary))),
          ]),
        )),
      ],
      // Caution points (amber)
      if (cautionPoints.isNotEmpty) ...[
        const SizedBox(height: 8),
        ...cautionPoints.map((item) => Container(
          margin: const EdgeInsets.only(bottom: 6),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            color: AppTheme.warning.withValues(alpha: 0.08),
            borderRadius: BorderRadius.circular(10)),
          child: Row(children: [
            Icon(Icons.warning_amber_rounded, size: 16, color: AppTheme.warning),
            const SizedBox(width: 8),
            Expanded(child: Text(item, style: GoogleFonts.plusJakartaSans(
              fontSize: 12, color: context.textPrimary))),
          ]),
        )),
      ],
      // Per-product star ratings
      if (perProduct.isNotEmpty) ...[
        const SizedBox(height: 12),
        ...perProduct.map((p) {
          final rating = (p['rating'] as num?)?.toInt() ?? 3;
          return Container(
            margin: const EdgeInsets.only(bottom: 6),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: context.surfaceElevatedColor,
              borderRadius: BorderRadius.circular(12)),
            child: Row(children: [
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(p['name'] as String? ?? '', style: GoogleFonts.plusJakartaSans(
                  fontSize: 13, fontWeight: FontWeight.w700, color: context.textPrimary),
                  maxLines: 1, overflow: TextOverflow.ellipsis),
                if (p['ideal_user'] != null) ...[
                  const SizedBox(height: 2),
                  Text(p['ideal_user'] as String, style: GoogleFonts.plusJakartaSans(
                    fontSize: 11, color: context.textSecondary)),
                ],
              ])),
              const SizedBox(width: 8),
              Row(children: List.generate(5, (i) => Icon(
                i < rating ? Icons.star_rounded : Icons.star_outline_rounded,
                size: 18, color: i < rating ? const Color(0xFFFFD700) : context.textTertiaryColor))),
            ]),
          );
        }),
      ],
      // Final verdict
      if (finalVerdict != null) ...[
        const SizedBox(height: 10),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            gradient: LinearGradient(colors: [
              const Color(0xFF3B82F6).withValues(alpha: 0.08),
              const Color(0xFF06B6D4).withValues(alpha: 0.06)]),
            borderRadius: BorderRadius.circular(12)),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('💡', style: TextStyle(fontSize: 14)),
            const SizedBox(width: 8),
            Expanded(child: Text(finalVerdict, style: GoogleFonts.plusJakartaSans(
              fontSize: 12, height: 1.5, color: context.textPrimary))),
          ]),
        ),
      ],
    ]);
  }

  Widget _buildPredictionVisual() {
    final data = _predictionStructured!;
    final products = List<Map<String, dynamic>>.from(
      (data['products'] as List<dynamic>?)?.map((e) => e as Map<String, dynamic>) ?? []);
    if (products.isEmpty) {
      return _buildAiError(() {
        setState(() { _predictionError = false; _predictionLoading = true; _predictionResult = null; _predictionStructured = null; });
        _fetchPrediction();
      });
    }

    return Column(children: products.map((p) {
      final trend = (p['trend'] as String? ?? 'stable').toLowerCase();
      final changePercent = (p['change_percent'] as num?)?.toDouble() ?? 0;
      final confidence = (p['confidence'] as num?)?.toDouble() ?? 0;
      final reason = p['reason'] as String? ?? '';
      final bestTime = p['best_time_to_buy'] as String? ?? p['best_time'] as String? ?? '';
      final buyNow = p['buy_now'] as bool? ?? (bestTime == 'now' || trend == 'dropping');
      final name = p['name'] as String? ?? '';

      final isDropping = trend == 'dropping' || trend == 'down';
      final isRising = trend == 'rising' || trend == 'up';
      final trendIcon = isDropping ? Icons.trending_down_rounded
          : isRising ? Icons.trending_up_rounded : Icons.trending_flat_rounded;
      final trendColor = isDropping ? AppTheme.scoreExcellent
          : isRising ? AppTheme.error : AppTheme.warning;
      final trendLabel = isDropping ? 'Dropping' : isRising ? 'Rising' : 'Stable';

      // Best time badge
      String bestTimeLabel;
      Color bestTimeColor;
      if (bestTime == 'now' || buyNow) {
        bestTimeLabel = '🛒 Buy Now';
        bestTimeColor = AppTheme.scoreExcellent;
      } else if (bestTime == 'wait_1_month') {
        bestTimeLabel = '⏳ Wait 1 Month';
        bestTimeColor = AppTheme.warning;
      } else if (bestTime == 'wait_3_months') {
        bestTimeLabel = '⏳ Wait 3 Months';
        bestTimeColor = AppTheme.orange500;
      } else {
        bestTimeLabel = bestTime.isNotEmpty ? '📅 $bestTime' : '📅 Unknown';
        bestTimeColor = AppTheme.warning;
      }

      return Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: context.surfaceElevatedColor,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: trendColor.withValues(alpha: 0.15))),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          // Product name + trend
          Row(children: [
            Expanded(child: Text(name, style: GoogleFonts.plusJakartaSans(
              fontSize: 14, fontWeight: FontWeight.w700, color: context.textPrimary),
              maxLines: 1, overflow: TextOverflow.ellipsis)),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: trendColor.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(8)),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                Icon(trendIcon, color: trendColor, size: 16),
                const SizedBox(width: 4),
                Text('${changePercent > 0 ? '+' : ''}${changePercent.toStringAsFixed(0)}%',
                  style: GoogleFonts.plusJakartaSans(fontSize: 13, fontWeight: FontWeight.w800, color: trendColor)),
              ]),
            ),
          ]),
          const SizedBox(height: 8),
          // Trend label + best time badge
          Row(children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: trendColor.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(6)),
              child: Text(trendLabel, style: GoogleFonts.plusJakartaSans(
                fontSize: 11, fontWeight: FontWeight.w600, color: trendColor)),
            ),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: bestTimeColor.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(8)),
              child: Text(bestTimeLabel, style: GoogleFonts.plusJakartaSans(
                fontSize: 12, fontWeight: FontWeight.w700, color: bestTimeColor)),
            ),
          ]),
          // Confidence bar
          if (confidence > 0) ...[
            const SizedBox(height: 10),
            Row(children: [
              Text('Confidence', style: GoogleFonts.plusJakartaSans(
                fontSize: 10, fontWeight: FontWeight.w600, color: context.textTertiaryColor)),
              const Spacer(),
              Text('${confidence.toInt()}%', style: GoogleFonts.plusJakartaSans(
                fontSize: 10, fontWeight: FontWeight.w800, color: _aiScoreColor(confidence))),
            ]),
            const SizedBox(height: 3),
            ClipRRect(
              borderRadius: BorderRadius.circular(3),
              child: LinearProgressIndicator(
                value: confidence / 100, minHeight: 5,
                backgroundColor: context.dividerColor,
                color: _aiScoreColor(confidence)),
            ),
          ],
          // Reasoning
          if (reason.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(reason, style: GoogleFonts.plusJakartaSans(
              fontSize: 12, color: context.textSecondary, height: 1.4)),
          ],
        ]),
      );
    }).toList());
  }

  // ─── Key Specs Side-by-Side Comparison ───

  /// Build a merged spec pool for a product (keySpecs + specs + specSections).
  Map<String, String> _buildSpecPool(ProductEntity product) {
    final pool = <String, String>{};
    for (final e in product.keySpecs.entries) {
      final v = e.value.trim();
      if (v.isNotEmpty && v != '-' && v != 'N/A') pool[e.key] = v;
    }
    for (final e in product.specs.entries) {
      if (pool.containsKey(e.key)) continue;
      if (e.value != null && e.value is! Map) {
        final v = e.value.toString().trim();
        if (v.isNotEmpty && v != '-' && v != 'N/A') pool[e.key] = v;
      }
    }
    for (final section in product.specSections.entries) {
      if (section.value is Map) {
        for (final spec in (section.value as Map).entries) {
          final k = spec.key.toString();
          if (pool.containsKey(k)) continue;
          if (spec.value != null) {
            final v = spec.value.toString().trim();
            if (v.isNotEmpty && v != '-' && v != 'N/A') pool[k] = v;
          }
        }
      }
    }
    return pool;
  }

  /// Find a spec value from the pool given a list of aliases.
  MapEntry<String, String>? _findSpecInPool(
      Map<String, String> pool, List<String> aliases, Set<String> used) {
    for (final alias in aliases) {
      final aLower = alias.toLowerCase();
      for (final e in pool.entries) {
        if (used.contains(e.key)) continue;
        final eLower = e.key.toLowerCase();
        if (eLower == aLower || eLower.contains(aLower) || aLower.contains(eLower)) {
          return e;
        }
      }
    }
    return null;
  }

  /// Collect 6 category-aware key specs across all products for comparison.
  /// Returns list of (specLabel, [val_product0, val_product1, ...]).
  List<_CompareSpecRow> _collectCompareKeySpecs() {
    final products = widget.products;
    final pools = products.map(_buildSpecPool).toList();

    // Resolve category
    final cat = keySpecs.resolveCategory(
      products.first.category.isNotEmpty ? products.first.category : products.first.subcategory,
    );
    final prioritySlots = keySpecs.categoryKeySpecAliases[cat];

    final result = <_CompareSpecRow>[];
    final usedPerProduct = List.generate(products.length, (_) => <String>{});

    // Phase 1: category-priority specs
    if (prioritySlots != null) {
      for (final slotAliases in prioritySlots) {
        final values = <String>[];
        String? label;
        for (int i = 0; i < products.length; i++) {
          final found = _findSpecInPool(pools[i], slotAliases, usedPerProduct[i]);
          if (found != null) {
            values.add(found.value);
            usedPerProduct[i].add(found.key);
            label ??= found.key;
          } else {
            values.add('—');
          }
        }
        label ??= slotAliases.first;
        // Only include if at least one product has a value
        if (values.any((v) => v != '—')) {
          result.add(_CompareSpecRow(label: label, values: values));
        }
        if (result.length >= 6) break;
      }
    }

    // Phase 2: fill remaining slots from pools
    if (result.length < 6) {
      // Gather all remaining keys (priority: from first product's pool)
      final remainingKeys = <String>[];
      for (int i = 0; i < products.length; i++) {
        for (final key in pools[i].keys) {
          if (usedPerProduct[i].contains(key)) continue;
          if (!remainingKeys.contains(key)) remainingKeys.add(key);
        }
      }
      for (final key in remainingKeys) {
        final values = <String>[];
        for (int i = 0; i < products.length; i++) {
          values.add(pools[i][key] ?? '—');
          usedPerProduct[i].add(key);
        }
        if (values.any((v) => v != '—')) {
          result.add(_CompareSpecRow(label: key, values: values));
        }
        if (result.length >= 6) break;
      }
    }

    return result;
  }

  /// Determine winner index for a compare spec row.
  int _findCompareWinner(String label, List<String> values) {
    if (values.length < 2) return -1;
    final nonMissing = values.where((v) => v != '—').toList();
    if (nonMissing.length < 2) return -1;
    if (nonMissing.toSet().length == 1) return -1; // all same → no winner

    // Delegate to the existing specDirection service
    return _findBetterIndex(label, values);
  }

  /// Color + weight for a cell based on comparison result.
  ({Color color, FontWeight weight}) _cellStyle({
    required String value,
    required int index,
    required int winnerIndex,
    required ThemeData theme,
  }) {
    final isMissing = value == '—';
    if (isMissing) {
      return (color: context.textTertiaryColor, weight: FontWeight.w400);
    }

    // Boolean values: green for yes, red for no (independent of winner)
    final vLower = value.toLowerCase().trim();
    if (vLower == 'yes' || vLower == 'true' || vLower == 'var' || vLower == 'evet' || vLower == '✓') {
      return (color: AppTheme.scoreExcellent, weight: FontWeight.w700);
    }
    if (vLower == 'no' || vLower == 'false' || vLower == 'yok' || vLower == 'hayır' || vLower == '✗') {
      return (color: AppTheme.error.withValues(alpha: 0.7), weight: FontWeight.w600);
    }

    if (winnerIndex < 0) {
      // No winner → neutral
      return (color: theme.colorScheme.onSurface, weight: FontWeight.w700);
    }
    if (index == winnerIndex) {
      return (color: AppTheme.scoreExcellent, weight: FontWeight.w800);
    }
    // Loser
    return (color: AppTheme.error.withValues(alpha: 0.65), weight: FontWeight.w600);
  }

  Widget _buildKeySpecsSummary() {
    final specs = _collectCompareKeySpecs();
    if (specs.isEmpty) return const SizedBox.shrink();

    final theme = Theme.of(context);
    final productCount = widget.products.length;

    return Container(
      margin: const EdgeInsets.fromLTRB(16, 16, 16, 8),
      padding: const EdgeInsets.fromLTRB(10, 14, 10, 10),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.4),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: theme.dividerColor),
      ),
      child: Column(
        children: [
          // Centered header
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.auto_awesome_rounded, size: 16,
                color: theme.colorScheme.primary),
              const SizedBox(width: 6),
              Text(
                'Key Specs',
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 14, fontWeight: FontWeight.w700, color: context.textPrimary),
              ),
            ],
          ),
          const SizedBox(height: 12),

          // Spec rows
          for (int i = 0; i < specs.length; i++) ...[
            if (i > 0) const SizedBox(height: 5),
            _buildSpecComparisonRow(specs[i], theme, productCount),
          ],
        ],
      ),
    );
  }

  /// Build a single spec comparison row — unified layout for all product counts.
  /// Spec label centered on top, values below in a row.
  Widget _buildSpecComparisonRow(_CompareSpecRow spec, ThemeData theme, int productCount) {
    final winnerIdx = _findCompareWinner(spec.label, spec.values);
    final isCompact = productCount > 2;

    return Container(
      padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 4),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface.withValues(alpha: 0.6),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: theme.dividerColor.withValues(alpha: 0.3)),
      ),
      child: Column(
        children: [
          // Spec label centered
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(keySpecs.iconForSpecKey(spec.label),
                size: 12, color: theme.colorScheme.primary.withValues(alpha: 0.7)),
              const SizedBox(width: 4),
              Flexible(
                child: Text(
                  _localizedSpecName(context, spec.label),
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 9, fontWeight: FontWeight.w600,
                    color: context.textTertiaryColor, letterSpacing: 0.2),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          // Product value cells
          Row(
            children: List.generate(productCount, (i) {
              final val = i < spec.values.length ? spec.values[i] : '—';
              final isMissing = val == '—';
              final style = _cellStyle(value: val, index: i, winnerIndex: winnerIdx, theme: theme);
              return Expanded(
                child: Tooltip(
                  message: _localizedSpecValue(context, val),
                  preferBelow: false,
                  decoration: BoxDecoration(
                    color: theme.colorScheme.inverseSurface,
                    borderRadius: BorderRadius.circular(8)),
                  textStyle: GoogleFonts.plusJakartaSans(
                    fontSize: 12, fontWeight: FontWeight.w600,
                    color: theme.colorScheme.onInverseSurface),
                  child: Container(
                    margin: EdgeInsets.symmetric(horizontal: isCompact ? 1.5 : 2),
                    padding: const EdgeInsets.symmetric(horizontal: 3, vertical: 6),
                    decoration: BoxDecoration(
                      color: (winnerIdx >= 0 && i == winnerIdx && !isMissing)
                          ? AppTheme.scoreExcellent.withValues(alpha: 0.10)
                          : (winnerIdx >= 0 && i != winnerIdx && !isMissing)
                              ? AppTheme.error.withValues(alpha: 0.05)
                              : Colors.transparent,
                      borderRadius: BorderRadius.circular(8),
                      border: (winnerIdx >= 0 && i == winnerIdx && !isMissing)
                          ? Border.all(color: AppTheme.scoreExcellent.withValues(alpha: 0.3))
                          : null,
                    ),
                    child: Text(
                      _localizedSpecValue(context, val),
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: isCompact ? 9 : 10,
                        fontWeight: style.weight,
                        color: style.color),
                      textAlign: TextAlign.center,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ),
              );
            }),
          ),
        ],
      ),
    );
  }

  void _showRemoveProductDialog(ProductEntity product) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Remove Product', style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700)),
        content: Text(
          'Remove "${product.name}" from comparison?',
          style: GoogleFonts.plusJakartaSans(fontSize: 14),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: Text('Cancel', style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w600)),
          ),
          TextButton(
            onPressed: () {
              Navigator.of(ctx).pop();
              widget.onRemoveProduct?.call(product.id);
            },
            child: Text('Remove', style: GoogleFonts.plusJakartaSans(
              fontWeight: FontWeight.w600, color: AppTheme.error)),
          ),
        ],
      ),
    );
  }

  // ─── Expert Scores Comparison ───

  Widget _buildExpertScoresComparison() {
    final scores = widget.products.map((p) => p.techScore).toList();
    final maxScore = scores.reduce((a, b) => a > b ? a : b);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: context.dividerColor),
        boxShadow: [
          BoxShadow(
            color: AppTheme.brandBlue.withValues(alpha: 0.06),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Container(
              width: 38, height: 38,
              decoration: BoxDecoration(
                gradient: _accentGradient,
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Icon(Icons.analytics_rounded, size: 20, color: Colors.white),
            ),
            const SizedBox(width: 12),
            Expanded(child: Text(
              'TechScore',
              style: GoogleFonts.plusJakartaSans(
                fontSize: 15,
                fontWeight: FontWeight.w700,
                color: context.textPrimary,
              ),
            )),
          ]),
          const SizedBox(height: 16),
          ...widget.products.asMap().entries.map((entry) {
            final idx = entry.key;
            final product = entry.value;
            final score = product.techScore;
            final isBest = score == maxScore && scores.where((s) => s == maxScore).length == 1;
            final scoreColor = score >= 80 ? AppTheme.scoreExcellent
                : score >= 60 ? AppTheme.scoreAverage
                : score >= 40 ? AppTheme.orange500
                : AppTheme.error;
            final chipColors = [
              AppTheme.brandBlue,
              AppTheme.scoreAverage,
              AppTheme.premiumPurpleLight,
              AppTheme.scoreExcellent,
            ];
            final chipColor = chipColors[idx % 4];

            return Container(
              margin: const EdgeInsets.only(bottom: 10),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: isBest
                    ? AppTheme.scoreExcellent.withValues(alpha: 0.06)
                    : context.surfaceColor,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(
                  color: isBest
                      ? AppTheme.scoreExcellent.withValues(alpha: 0.2)
                      : context.dividerColor,
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(children: [
                    Container(
                      width: 8, height: 8,
                      decoration: BoxDecoration(
                        color: chipColor,
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(child: Text(
                      product.name,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: context.textPrimary,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    )),
                    if (isBest)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: AppTheme.scoreExcellent.withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text('🏆',
                          style: GoogleFonts.plusJakartaSans(fontSize: 11)),
                      ),
                    const SizedBox(width: 8),
                    Container(
                      width: 42, height: 42,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: LinearGradient(
                          colors: [scoreColor.withValues(alpha: 0.8), scoreColor],
                        ),
                      ),
                      child: Center(child: Text(
                        score.toInt().toString(),
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 14,
                          fontWeight: FontWeight.w900,
                          color: Colors.white,
                        ),
                      )),
                    ),
                  ]),
                  const SizedBox(height: 8),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(4),
                    child: LinearProgressIndicator(
                      value: score / 100,
                      minHeight: 6,
                      backgroundColor: context.dividerColor,
                      color: scoreColor,
                    ),
                  ),
                ],
              ),
            );
          }),
        ],
      ),
    );
  }

  // ─── Visual Builders ───


  @override
  Widget build(BuildContext context) {
    ref.watch(specDirectionServiceProvider);

    return DefaultTabController(
      length: 4,
      child: Column(
        children: [
          // Sticky product header (always visible)
          _buildProductHeader(context),

          // Pill-style tab bar (always visible)
          Container(
            color: context.surfaceColor,
            child: TabBar(
              isScrollable: false,
              tabAlignment: TabAlignment.fill,
              labelColor: Theme.of(context).colorScheme.primary,
              unselectedLabelColor: context.textTertiaryColor,
              indicatorSize: TabBarIndicatorSize.tab,
              dividerColor: Colors.transparent,
              indicator: BoxDecoration(
                border: Border(
                  bottom: BorderSide(
                    color: Theme.of(context).colorScheme.primary,
                    width: 2.5,
                  ),
                ),
              ),
              labelStyle: const TextStyle(
                  fontSize: 12, fontWeight: FontWeight.w700),
              unselectedLabelStyle: const TextStyle(
                  fontSize: 12, fontWeight: FontWeight.w500),
              tabs: [
                Tab(text: context.l10n?.specsTab ?? 'Specs'),
                Tab(text: context.l10n?.reviews ?? 'Reviews'),
                Tab(text: context.l10n?.similarTab ?? 'Similar'),
                Tab(text: context.l10n?.proTab ?? 'Premium'),
              ],
            ),
          ),

          // Tab content (scrollable) — KeepAlive prevents disposal on tab switch
          Expanded(
            child: TabBarView(
              children: [
                _KeepAliveTab(child: _buildSpecsTab()),
                _KeepAliveTab(child: _buildReviewsTab()),
                _KeepAliveTab(child: _buildSimilarTab()),
                _KeepAliveTab(child: _buildProTab()),
              ],
            ),
          ),
        ],
      ),
    );
  }

  /// Product header: images + names (non-pinned, scrolls away)
  Widget _buildProductHeader(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 8, 16, 8),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.surfaceElevatedColor,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: AppTheme.brandBlue.withValues(alpha: 0.12)),
        boxShadow: [
          BoxShadow(color: AppTheme.brandBlue.withValues(alpha: 0.08), blurRadius: 16, offset: const Offset(0, 4)),
          const BoxShadow(color: Color(0x08000000), blurRadius: 8, offset: Offset(0, 2)),
        ],
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: _buildHeaderProductWidgets(context),
      ),
    );
  }

  List<Widget> _buildHeaderProductWidgets(BuildContext context) {
    final widgets = <Widget>[];
    for (int idx = 0; idx < widget.products.length; idx++) {
      final product = widget.products[idx];
      final scoreColor = product.techScore >= 80
          ? AppTheme.scoreExcellent
          : product.techScore >= 60
              ? AppTheme.scoreAverage
              : product.techScore >= 40
                  ? AppTheme.orange500
                  : AppTheme.error;

      if (idx > 0) {
        widgets.add(const SizedBox(width: 4));
      }

      widgets.add(
        Expanded(
          child: GestureDetector(
            onTap: () => context.push('/product/${product.id}'),
            onLongPress: widget.onRemoveProduct != null && widget.products.length > 2
                ? () => _showRemoveProductDialog(product)
                : null,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                ProductImageBox(
                  imageUrl: product.imageUrl,
                  width: 80,
                  height: 80,
                  borderRadius: BorderRadius.circular(16),
                  padding: const EdgeInsets.all(6),
                ),
                const SizedBox(height: 6),
                if (product.techScore > 0)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: scoreColor.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: scoreColor.withValues(alpha: 0.3), width: 0.5),
                    ),
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                      Icon(Icons.memory_outlined, size: 10, color: scoreColor),
                      const SizedBox(width: 3),
                      Text(product.techScore.toInt().toString(),
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 11, fontWeight: FontWeight.w800, color: scoreColor)),
                    ]),
                  ),
                const SizedBox(height: 4),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: Text(
                    product.name,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 11, fontWeight: FontWeight.w600, color: context.textPrimary),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.center,
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    }
    return widgets;
  }

  Widget _buildSpecsTab() {
    int specGroupIndex = 0;
    return CustomScrollView(
      slivers: [
        // Key Specs Summary at top
        SliverToBoxAdapter(child: _buildKeySpecsSummary()),
        // Grouped spec comparison
        ..._groupedSpecs.entries.map((groupEntry) {
          final groupName = groupEntry.key;
          final specs = groupEntry.value;
          final isExpanded = _expandedGroups[groupName] ?? false;
          final currentGroupIndex = specGroupIndex++;

          return SliverToBoxAdapter(
            child: Container(
              margin: EdgeInsets.fromLTRB(16, currentGroupIndex == 0 ? 16 : 10, 16, 4),
              decoration: BoxDecoration(
                color: context.surfaceVariantColor,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(
                  color: isExpanded
                      ? AppTheme.brandBlue.withValues(alpha: 0.18)
                      : context.dividerColor,
                ),
                boxShadow: [
                  BoxShadow(
                    color: AppTheme.brandBlue.withValues(alpha: isExpanded ? 0.06 : 0.02),
                    blurRadius: 16,
                    offset: const Offset(0, 4),
                  ),
                  const BoxShadow(
                    color: Color(0x06000000),
                    blurRadius: 8,
                    offset: Offset(0, 2),
                  ),
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Group header
                  InkWell(
                    onTap: () => setState(() => _expandedGroups[groupName] = !isExpanded),
                    borderRadius: BorderRadius.circular(20),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
                      decoration: BoxDecoration(
                        gradient: isExpanded
                            ? LinearGradient(
                                colors: [
                                  AppTheme.brandBlue.withValues(alpha: 0.1),
                                  AppTheme.brandDeepBlue.withValues(alpha: 0.06),
                                ],
                              )
                            : null,
                        borderRadius: isExpanded
                            ? const BorderRadius.vertical(top: Radius.circular(20))
                            : BorderRadius.circular(20),
                      ),
                      child: Row(
                        children: [
                          Container(
                            width: 4,
                            height: 24,
                            decoration: BoxDecoration(
                              gradient: _accentGradient,
                              borderRadius: BorderRadius.circular(2),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.center,
                              children: [
                                Text(
                                  _localizedGroupName(context, groupName),
                                  style: GoogleFonts.plusJakartaSans(
                                    fontWeight: FontWeight.w700,
                                    fontSize: 13,
                                    color: context.textPrimary,
                                  ),
                                  textAlign: TextAlign.center,
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  context.l10n?.nSpecs('${specs.length}') ?? '${specs.length} specs',
                                  style: GoogleFonts.plusJakartaSans(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w500,
                                    color: context.textTertiaryColor,
                                  ),
                                  textAlign: TextAlign.center,
                                ),
                              ],
                            ),
                          ),
                          AnimatedRotation(
                            turns: isExpanded ? 0.5 : 0,
                            duration: const Duration(milliseconds: 200),
                            child: Container(
                              width: 28,
                              height: 28,
                              decoration: BoxDecoration(
                                color: isExpanded
                                    ? AppTheme.brandBlue.withValues(alpha: 0.16)
                                    : context.dividerColor,
                                shape: BoxShape.circle,
                              ),
                              child: Icon(
                                Icons.expand_more,
                                size: 18,
                                color: isExpanded
                                    ? AppTheme.brandBlue
                                    : context.textTertiaryColor,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),

                  // Spec rows
                  if (isExpanded)
                     Padding(
                      padding: const EdgeInsets.fromLTRB(8, 2, 8, 8),
                      child: Column(
                        children: specs.entries.toList().asMap().entries.map((indexedEntry) {
                          final specIndex = indexedEntry.key;
                          final specEntry = indexedEntry.value;
                          final specKey = specEntry.key;
                          final values = specEntry.value;
                          final allSame = values.toSet().length == 1;
                          final betterIndex = allSame ? -1 : _findBetterIndex(specKey, values);
                          final isAlternate = specIndex.isOdd;

                          return Container(
                            margin: const EdgeInsets.symmetric(vertical: 2),
                            padding: const EdgeInsets.fromLTRB(8, 6, 8, 8),
                            decoration: BoxDecoration(
                              color: isAlternate
                                  ? context.surfaceColor
                                  : context.surfaceVariantColor,
                              borderRadius: BorderRadius.circular(16),
                              border: Border.all(
                                color: context.dividerColor,
                              ),
                            ),
                            child: Column(
                              children: [
                                // Spec name
                                Text(
                                  _localizedSpecName(context, specKey).toUpperCase(),
                                  style: GoogleFonts.plusJakartaSans(
                                    fontSize: 10,
                                    letterSpacing: 0.5,
                                    color: context.textTertiaryColor,
                                    fontWeight: FontWeight.w600,
                                  ),
                                  textAlign: TextAlign.center,
                                ),
                                const SizedBox(height: 6),
                                // Values row
                                Row(
                                  children: values.asMap().entries.map((valEntry) {
                                    final idx = valEntry.key;
                                    final val = valEntry.value;
                                    final isMissing = val == '—';
                                    final isBetter = betterIndex == idx;
                                    final isWorse = betterIndex >= 0 && betterIndex != idx && !isMissing;

                                    return Expanded(
                                      child: Tooltip(
                                        message: _localizedSpecValue(context, val),
                                        preferBelow: false,
                                        decoration: BoxDecoration(
                                          color: Theme.of(context).colorScheme.inverseSurface,
                                          borderRadius: BorderRadius.circular(8)),
                                        textStyle: GoogleFonts.plusJakartaSans(
                                          fontSize: 12, fontWeight: FontWeight.w600,
                                          color: Theme.of(context).colorScheme.onInverseSurface),
                                        child: Container(
                                          margin: const EdgeInsets.symmetric(horizontal: 3),
                                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 8),
                                          decoration: BoxDecoration(
                                            color: isBetter
                                                ? AppTheme.scoreExcellent.withValues(alpha: 0.12)
                                                : isWorse
                                                    ? AppTheme.error.withValues(alpha: 0.06)
                                                    : Colors.transparent,
                                            borderRadius: BorderRadius.circular(12),
                                            border: isBetter
                                                ? Border.all(
                                                    color: AppTheme.scoreExcellent.withValues(alpha: 0.3),
                                                  )
                                                : null,
                                          ),
                                          child: Text(
                                            _localizedSpecValue(context, val),
                                            style: GoogleFonts.plusJakartaSans(
                                              fontSize: 10,
                                              fontWeight: isBetter ? FontWeight.w700 : (isMissing ? FontWeight.w400 : FontWeight.w500),
                                              color: isBetter
                                                  ? AppTheme.scoreExcellent
                                                  : isWorse
                                                      ? AppTheme.error.withValues(alpha: 0.7)
                                                      : isMissing
                                                          ? context.textTertiaryColor
                                                          : context.textSecondary,
                                            ),
                                            textAlign: TextAlign.center,
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                          ),
                                        ),
                                      ),
                                    );
                                  }).toList(),
                                ),
                              ],
                            ),
                          );
                        }).toList(),
                      ),
                    ),
                ],
              ),
            ),
          );
        }),

        // Bottom spacer
        SliverToBoxAdapter(
          child: SizedBox(
            height: MediaQuery.of(context).padding.bottom + AppTheme.navBarTotalClearance,
          ),
        ),
      ],
    );
  }

  Widget _buildReviewsTab() {
    // Build "product1 vs product2" search query for comparison videos
    final vsQuery = widget.products.map((p) => p.name).join(' vs ');

    return ListView(
      padding: EdgeInsets.fromLTRB(16, 12, 16, MediaQuery.of(context).padding.bottom + AppTheme.navBarTotalClearance + 40),
      children: [
        // Single YouTube section with comparison query (collapsible)
        Padding(
          padding: const EdgeInsets.only(bottom: 14),
          child: SharedYouTubeReviewsCard(
            product: widget.products.first,
            isDark: Theme.of(context).brightness == Brightness.dark,
            cardBg: context.surfaceVariantColor,
            searchQuery: vsQuery,
            titleOverride: context.l10n?.comparisonVideos ?? 'Comparison Videos',
            collapsible: true,
            onVideoTap: _onVideoTap,
          ),
        ),

        // User reviews section
        _buildUserReviewsSection(),
      ],
    );
  }

  Widget _buildSimilarTab() {
    final excludeIds = widget.products.map((p) => p.id).toSet();
    // Use similarProductsProvider with first product as reference
    final similarAsync = ref.watch(similarProductsProvider(widget.products.first));

    return ListView(
      padding: EdgeInsets.fromLTRB(16, 16, 16, MediaQuery.of(context).padding.bottom + 16),
      children: [
        similarAsync.when(
          loading: () => _buildSimilarShimmer(),
          error: (_, __) => _buildSimilarEmpty(),
          data: (products) {
            // Filter out compared products and take top 12
            final filtered = products
                .where((p) => !excludeIds.contains(p.id))
                .take(12)
                .toList();
            if (filtered.isEmpty) return _buildSimilarEmpty();

            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Padding(
                  padding: const EdgeInsets.only(left: 4, bottom: 14),
                  child: Row(children: [
                    Container(
                      width: 36, height: 36,
                      decoration: BoxDecoration(
                        gradient: _accentGradient,
                        borderRadius: BorderRadius.circular(10)),
                      child: const Icon(Icons.grid_view_rounded, color: Colors.white, size: 18),
                    ),
                    const SizedBox(width: 10),
                    Text(context.l10n?.similarProducts ?? 'Similar Products',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 16, fontWeight: FontWeight.w700,
                        color: context.textPrimary)),
                  ]),
                ),
                GridView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 2,
                    crossAxisSpacing: 12,
                    mainAxisSpacing: 12,
                    childAspectRatio: 0.72,
                  ),
                  itemCount: filtered.length,
                  itemBuilder: (context, i) => SharedSimilarGridCard(product: filtered[i]),
                ),
              ],
            );
          },
        ),
      ],
    );
  }

  Widget _buildSimilarEmpty() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.only(top: 48),
        child: Column(children: [
          Icon(Icons.widgets_outlined, size: 48,
              color: context.textTertiaryColor?.withValues(alpha: 0.5)),
          const SizedBox(height: 12),
          Text('No similar products found',
              style: GoogleFonts.plusJakartaSans(
                fontSize: 14, color: context.textTertiaryColor)),
        ]),
      ),
    );
  }

  Widget _buildSimilarShimmer() {
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2, crossAxisSpacing: 12, mainAxisSpacing: 12, childAspectRatio: 0.72),
      itemCount: 4,
      itemBuilder: (_, __) => Container(
        decoration: BoxDecoration(
          color: context.surfaceVariantColor,
          borderRadius: BorderRadius.circular(16)),
        child: const Center(child: CircularProgressIndicator(strokeWidth: 2)),
      ),
    );
  }

  Widget _buildProTab() {
    // RULE 1: No auto-fetch. All AI calls are lazy — triggered only when user taps a card.

    return ListView(
      padding: EdgeInsets.fromLTRB(16, 12, 16, MediaQuery.of(context).padding.bottom + AppTheme.navBarTotalClearance),
      children: [
        // 1. Personalized Match
        _buildMatchScoreSection(),
        const SizedBox(height: 14),
        // 2. AI Deep Analysis
        _buildExpandableCard(
          icon: Icons.psychology_rounded,
          title: context.l10n?.aiDeepAnalysis ?? 'AI Deep Analysis',
          subtitle: context.l10n?.comprehensiveAiComparison ?? 'Comprehensive AI-powered comparison evaluation',
          gradient: const [AppTheme.premiumPurple, Color(0xFF6366F1)],
          isExpanded: _deepAnalysisExpanded,
          isLoading: _deepAnalysisLoading,
          content: _deepAnalysisResult,
          contentWidget: _deepAnalysisStructured != null ? _buildDeepAnalysisVisual() : null,
          isError: _deepAnalysisError,
          onRetry: () {
            setState(() { _deepAnalysisError = false; _deepAnalysisLoading = true; _deepAnalysisResult = null; _deepAnalysisStructured = null; });
            _fetchDeepAnalysis();
          },
          onTap: _toggleDeepAnalysis,
        ),
        const SizedBox(height: 14),
        // 4. Smart Alternatives
        _buildExpandableCard(
          icon: Icons.swap_horizontal_circle_rounded,
          title: context.l10n?.smartAlternatives ?? 'Smart Alternatives',
          subtitle: context.l10n?.aiAlternativesToConsider ?? 'AI-curated alternatives you should consider',
          gradient: const [AppTheme.warning, Color(0xFFF97316)],
          isExpanded: _alternativesExpanded,
          isLoading: _alternativesLoading,
          content: _alternativesResult,
          contentWidget: _alternativesStructured != null ? _buildAlternativesVisual() : null,
          isError: _alternativesError,
          onRetry: () {
            setState(() { _alternativesError = false; _alternativesLoading = true; _alternativesResult = null; _alternativesStructured = null; });
            _fetchAlternatives();
          },
          onTap: _toggleAlternatives,
        ),
        const SizedBox(height: 14),
        // 5. AI Product Advisor
        _buildExpandableCard(
          icon: Icons.support_agent_rounded,
          title: context.l10n?.aiProductAdvisor ?? 'AI Product Advisor',
          subtitle: context.l10n?.personalizedPurchaseAdvice ?? 'Personalized comparison purchase advice',
          gradient: const [Color(0xFF3B82F6), Color(0xFF06B6D4)],
          isExpanded: _advisorExpanded,
          isLoading: _advisorLoading,
          content: _advisorResult,
          contentWidget: _advisorStructured != null ? _buildAdvisorVisual() : null,
          isError: _advisorError,
          onRetry: () {
            setState(() { _advisorError = false; _advisorLoading = true; _advisorResult = null; _advisorStructured = null; });
            _fetchAdvisor();
          },
          onTap: _toggleAdvisor,
        ),
        const SizedBox(height: 14),
        // 6. Price Prediction
        _buildExpandableCard(
          icon: Icons.trending_down_rounded,
          title: context.l10n?.pricePrediction ?? 'Price Prediction',
          subtitle: context.l10n?.aiPriceTrendAnalysis ?? 'AI-powered price trend analysis & best time to buy',
          gradient: const [Color(0xFF10B981), Color(0xFF059669)],
          isExpanded: _predictionExpanded,
          isLoading: _predictionLoading,
          content: _predictionResult,
          contentWidget: _predictionStructured != null ? _buildPredictionVisual() : null,
          isError: _predictionError,
          onRetry: () {
            setState(() { _predictionError = false; _predictionLoading = true; _predictionResult = null; _predictionStructured = null; });
            _fetchPrediction();
          },
          onTap: _togglePrediction,
        ),
      ],
    );
  }

  Widget _buildMatchScoreSection() {
    final userProfile = ref.watch(userProfileProvider);
    final user = userProfile.valueOrNull;
    final quizCompleted = user != null && user.quizCompleted;

    return AnimatedContainer(
      duration: const Duration(milliseconds: 300),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppTheme.brandBlue.withValues(alpha: 0.15)),
        boxShadow: [
          BoxShadow(
            color: AppTheme.brandBlue.withValues(alpha: 0.08),
            blurRadius: 12, offset: const Offset(0, 4)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Only header row toggles expand/collapse
          GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: () {
              setState(() => _matchScoreExpanded = !_matchScoreExpanded);
              if (_matchScoreExpanded && !_matchScoreFetched && quizCompleted) {
                _matchScoreFetched = true;
                for (final product in widget.products) {
                  final notifier = ref.read(geminiMatchScoreProvider(product.id).notifier);
                  notifier.fetchMatchScore(product: product);
                }
              }
            },
            child: Row(children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(colors: [AppTheme.brandSkyBlue, AppTheme.brandDeepBlue]),
                  borderRadius: BorderRadius.circular(12)),
                child: const Icon(Icons.person_search_rounded, size: 20, color: Colors.white),
              ),
              const SizedBox(width: 12),
              Expanded(child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    context.l10n?.personalizedMatch ?? 'Personalized Match',
                    style: GoogleFonts.plusJakartaSans(fontSize: 15, fontWeight: FontWeight.w700, color: context.textPrimary),
                    maxLines: 1, overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 2),
                  Text(context.l10n?.aiCompatibilityAnalysis ?? 'AI-powered compatibility analysis',
                    style: GoogleFonts.plusJakartaSans(fontSize: 12, color: context.textSecondary)),
                ],
              )),
              Icon(_matchScoreExpanded ? Icons.expand_less_rounded : Icons.expand_more_rounded,
                color: AppTheme.brandBlue),
            ]),
          ),
          // Content area — taps absorbed, don't toggle card
          if (_matchScoreExpanded) ...[
            const SizedBox(height: 14),
            GestureDetector(
              onTap: () {},
              child: Column(
                children: [
                  if (!quizCompleted)
                    GestureDetector(
                      onTap: () => context.push('/quiz'),
                      child: Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(colors: [AppTheme.brandSkyBlue, AppTheme.brandDeepBlue]),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(Icons.quiz_rounded, size: 18, color: Colors.white),
                        const SizedBox(width: 8),
                        Text(context.l10n?.completeQuiz ?? "Complete Quiz",
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 14, fontWeight: FontWeight.w600, color: Colors.white)),
                      ],
                    ),
                  ),
                )
              else
                ...widget.products.map((product) {
                  final matchAsync = ref.watch(geminiMatchScoreProvider(product.id));
                  final matchResult = matchAsync.valueOrNull;
                  final matchScore = matchResult?.matchScore;
                  final reason = matchResult?.reason;
                  final isLoading = matchAsync is AsyncLoading;

                  final matchColor = matchScore == null ? AppTheme.brandDeepBlue :
                      matchScore >= 80 ? AppTheme.scoreExcellent :
                      matchScore >= 60 ? AppTheme.scoreAverage : AppTheme.error;

                  return Container(
                    margin: const EdgeInsets.only(bottom: 10),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: matchColor.withValues(alpha: 0.06),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: matchColor.withValues(alpha: 0.15)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(children: [
                          if (isLoading)
                            Container(
                              width: 46, height: 46,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: matchColor.withValues(alpha: 0.1)),
                              child: Center(child: SizedBox(
                                width: 20, height: 20,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2, color: matchColor))),
                            )
                          else
                            // Animated circular score indicator
                            TweenAnimationBuilder<double>(
                              tween: Tween(begin: 0, end: (matchScore ?? 0) / 100),
                              duration: const Duration(milliseconds: 1500),
                              curve: Curves.easeOutCubic,
                              builder: (context, value, child) {
                                final displayVal = (value * 100).toInt();
                                return SizedBox(
                                  width: 46, height: 46,
                                  child: Stack(
                                    alignment: Alignment.center,
                                    children: [
                                      CircularProgressIndicator(
                                        value: value,
                                        strokeWidth: 4,
                                        backgroundColor: matchColor.withValues(alpha: 0.15),
                                        color: matchColor,
                                      ),
                                      Text('$displayVal%',
                                        style: GoogleFonts.plusJakartaSans(
                                          fontSize: 11, fontWeight: FontWeight.w900, color: matchColor)),
                                    ],
                                  ),
                                );
                              },
                            ),
                          const SizedBox(width: 12),
                          Expanded(child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(product.name, style: GoogleFonts.plusJakartaSans(
                                fontSize: 13, fontWeight: FontWeight.w700, color: context.textPrimary),
                                maxLines: 2, overflow: TextOverflow.ellipsis),
                              const SizedBox(height: 2),
                              Text(
                                isLoading ? (context.l10n?.analyzing ?? 'Analyzing...')
                                    : context.l10n?.basedOnYourPreferences ?? 'Based on your preferences and usage habits',
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 11, color: context.textTertiaryColor)),
                            ],
                          )),
                        ]),
                        if (reason != null && reason.isNotEmpty) ...[
                          const SizedBox(height: 8),
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Icon(Icons.auto_awesome, size: 12,
                                  color: matchColor.withValues(alpha: 0.7)),
                              const SizedBox(width: 6),
                              Expanded(child: ExpandableText(reason,
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 11, fontStyle: FontStyle.italic,
                                  color: context.textSecondary, height: 1.3))),
                            ],
                          ),
                        ],
                      ],
                    ),
                  );
                }),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildExpandableCard({
    required IconData icon,
    required String title,
    required String subtitle,
    required List<Color> gradient,
    required bool isExpanded,
    required bool isLoading,
    required String? content,
    required VoidCallback onTap,
    Widget? contentWidget,
    bool isError = false,
    VoidCallback? onRetry,
  }) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return AnimatedContainer(
      duration: const Duration(milliseconds: 300),
      curve: Curves.easeInOut,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: gradient[0].withValues(alpha: 0.15)),
        boxShadow: [BoxShadow(
          color: gradient[0].withValues(alpha: 0.08),
          blurRadius: 12, offset: const Offset(0, 4))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: onTap,
            child: Row(children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  gradient: LinearGradient(colors: gradient),
                  borderRadius: BorderRadius.circular(12)),
                child: Icon(icon, color: context.surfaceVariantColor, size: 20)),
              const SizedBox(width: 12),
              Expanded(child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, maxLines: 1, overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.plusJakartaSans(
                    fontSize: 15, fontWeight: FontWeight.w700, color: context.textPrimary)),
                  const SizedBox(height: 2),
                  Text(subtitle, style: GoogleFonts.plusJakartaSans(
                    fontSize: 12, color: context.textSecondary)),
                ])),
              if (isLoading)
                SizedBox(width: 20, height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2, color: gradient[0]))
              else
                Icon(isExpanded ? Icons.expand_less_rounded : Icons.expand_more_rounded,
                  color: gradient[0]),
            ]),
          ),
          // Error state with retry
          if (isExpanded && isError && onRetry != null) ...[
            const SizedBox(height: 14),
            _buildAiError(onRetry),
          ]
          // Loading shimmer
          else if (isExpanded && isLoading) ...[
            const SizedBox(height: 14),
            _buildAiShimmer(),
          ]
          // Structured content widget (the ONLY content display path)
          else if (isExpanded && contentWidget != null) ...[
            const SizedBox(height: 14),
            GestureDetector(onTap: () {}, child: contentWidget),
          ]
          // No data yet and not loading — idle state (card just opened, fetch will start)
          else if (isExpanded && content == null && !isLoading && !isError) ...[
            const SizedBox(height: 14),
            _buildAiShimmer(),
          ],
        ],
      ),
    );
  }

  /// Generate composite document key for comparison reviews
  String _comparisonReviewDocKey() {
    final ids = widget.products.map((p) => p.id).toList()..sort();
    return ids.join('_');
  }

  Widget _buildUserReviewsSection() {
    final docKey = _comparisonReviewDocKey();

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: context.dividerColor),
        boxShadow: [
          BoxShadow(
            color: AppTheme.amber500.withValues(alpha: 0.04),
            blurRadius: 16,
            offset: const Offset(0, 4),
          ),
          const BoxShadow(color: Color(0x06000000), blurRadius: 8, offset: Offset(0, 2)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Container(width: 44, height: 44,
              decoration: BoxDecoration(
                color: AppTheme.amber500.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(14)),
              child: const Icon(Icons.forum_rounded,
                  size: 22, color: AppTheme.amber500)),
            const SizedBox(width: 14),
            Expanded(child: Text(context.l10n?.userReviews ?? 'User Reviews',
                style: GoogleFonts.plusJakartaSans(fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: context.textPrimary))),
          ]),
          const SizedBox(height: 14),

          // Write review button
          GestureDetector(
            onTap: () => _showWriteReviewSheet(context),
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 12),
              decoration: BoxDecoration(
                gradient: _accentGradient,
                borderRadius: BorderRadius.circular(16)),
              child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                const Icon(Icons.edit_note_rounded, size: 18, color: Colors.white),
                const SizedBox(width: 8),
                Text(context.l10n?.writeAReview ?? 'Write a Review',
                    style: GoogleFonts.plusJakartaSans(fontSize: 14,
                        fontWeight: FontWeight.w600, color: Colors.white)),
              ]),
            ),
          ),
          const SizedBox(height: 14),

          // Real-time review stream from comparison_reviews collection
          StreamBuilder<QuerySnapshot>(
            stream: FirebaseFirestore.instance
                .collection('comparison_reviews')
                .where('docKey', isEqualTo: docKey)
                .orderBy('timestamp', descending: true)
                .limit(20)
                .snapshots(),
            builder: (context, snapshot) {
              if (snapshot.connectionState == ConnectionState.waiting) {
                return const Center(child: Padding(
                  padding: EdgeInsets.all(20),
                  child: CircularProgressIndicator(strokeWidth: 2, color: AppTheme.brandBlue)));
              }
              if (snapshot.hasError) {
                return _buildEmptyReviews();
              }
              final docs = snapshot.data?.docs ?? [];
              if (docs.isEmpty) {
                return _buildEmptyReviews();
              }
              return Column(
                children: docs.map((doc) {
                  final data = doc.data() as Map<String, dynamic>;
                  return _buildComparisonReviewItem(data, doc.id);
                }).toList(),
              );
            },
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyReviews() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(12)),
      child: Column(children: [
        Icon(Icons.rate_review_outlined, size: 32, color: context.textTertiaryColor),
        const SizedBox(height: 8),
        Text(context.l10n?.noReviewsYet ?? 'No reviews yet',
            style: GoogleFonts.plusJakartaSans(fontSize: 14,
                fontWeight: FontWeight.w600, color: context.textPrimary)),
        const SizedBox(height: 4),
        Text(context.l10n?.beFirstToReview ?? 'Be the first to share your thoughts!',
            style: GoogleFonts.plusJakartaSans(fontSize: 12,
                color: context.textTertiaryColor)),
      ]),
    );
  }

  Widget _buildComparisonReviewItem(Map<String, dynamic> data, String docId) {
    final userId = data['userId'] as String? ?? 'anonymous';
    final displayName = data['displayName'] as String? ?? '';
    final reviewText = data['reviewText'] as String? ?? '';
    final timestamp = (data['timestamp'] as Timestamp?)?.toDate() ?? DateTime.now();
    final isAnonymous = userId == 'anonymous';

    // Resolve display name: displayName → email prefix → Anonymous
    String resolvedName;
    if (displayName.isNotEmpty) {
      resolvedName = displayName;
    } else if (!isAnonymous && userId.contains('@')) {
      resolvedName = userId.split('@').first;
    } else if (isAnonymous) {
      resolvedName = 'Anonymous';
    } else {
      resolvedName = 'User';
    }
    final displayChar = resolvedName.substring(0, 1).toUpperCase();

    // Check if current user owns this review
    final currentUser = ref.read(userProfileProvider).valueOrNull;
    final isOwner = currentUser != null && currentUser.uid == userId;

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: context.surfaceColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: context.dividerColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            CircleAvatar(
              radius: 14,
              backgroundColor: AppTheme.brandBlue.withValues(alpha: 0.15),
              child: Text(displayChar,
                  style: GoogleFonts.plusJakartaSans(fontSize: 11,
                      fontWeight: FontWeight.w700, color: AppTheme.brandBlue)),
            ),
            const SizedBox(width: 8),
            Expanded(child: Text(resolvedName,
                style: GoogleFonts.plusJakartaSans(fontSize: 12,
                    fontWeight: FontWeight.w600, color: context.textPrimary),
                maxLines: 1, overflow: TextOverflow.ellipsis)),
            Text(_timeAgo(timestamp),
                style: GoogleFonts.plusJakartaSans(fontSize: 11,
                    color: context.textTertiaryColor)),
            if (isOwner) ...[
              const SizedBox(width: 6),
              GestureDetector(
                onTap: () => _confirmDeleteReview(docId),
                child: Icon(Icons.delete_outline_rounded,
                    size: 18, color: AppTheme.error.withValues(alpha: 0.7)),
              ),
            ],
          ]),
          if (reviewText.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(reviewText,
              style: GoogleFonts.plusJakartaSans(fontSize: 13,
                  height: 1.5, color: context.textSecondary)),
          ],
        ],
      ),
    );
  }

  void _confirmDeleteReview(String docId) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: Theme.of(ctx).colorScheme.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Text('Yorumu Sil',
            style: GoogleFonts.plusJakartaSans(fontSize: 16,
                fontWeight: FontWeight.w700,
                color: Theme.of(ctx).colorScheme.onSurface)),
        content: Text('Bu yorumu silmek istiyor musun?',
            style: GoogleFonts.plusJakartaSans(fontSize: 14,
                color: Theme.of(ctx).colorScheme.onSurface.withValues(alpha: 0.7))),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: Text('İptal',
                style: GoogleFonts.plusJakartaSans(
                    fontWeight: FontWeight.w600,
                    color: Theme.of(ctx).colorScheme.onSurface.withValues(alpha: 0.5))),
          ),
          TextButton(
            onPressed: () async {
              Navigator.of(ctx).pop();
              try {
                await FirebaseFirestore.instance
                    .collection('comparison_reviews')
                    .doc(docId)
                    .delete();
              } catch (e) {
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                    content: Text('Silinemedi: $e'),
                    behavior: SnackBarBehavior.floating));
                }
              }
            },
            child: Text('Sil',
                style: GoogleFonts.plusJakartaSans(
                    fontWeight: FontWeight.w700, color: AppTheme.error)),
          ),
        ],
      ),
    );
  }

  String _timeAgo(DateTime date) {
    final diff = DateTime.now().difference(date);
    if (diff.inDays > 30) return '${(diff.inDays / 30).floor()}mo ago';
    if (diff.inDays > 0) return '${diff.inDays}d ago';
    if (diff.inHours > 0) return '${diff.inHours}h ago';
    return '${diff.inMinutes}m ago';
  }


  void _showWriteReviewSheet(BuildContext ctx) {
    final user = ref.read(userProfileProvider).valueOrNull;
    final userId = user?.uid ?? 'anonymous';
    // Resolve display name: displayName → email prefix → Anonymous
    String resolvedDisplayName;
    if (user != null && user.displayName.isNotEmpty) {
      resolvedDisplayName = user.displayName;
    } else if (user != null && user.email.isNotEmpty) {
      resolvedDisplayName = user.email.split('@').first;
    } else {
      resolvedDisplayName = 'Anonymous';
    }
    final textController = TextEditingController();

    showDialog(
      context: ctx,
      barrierDismissible: true,
      builder: (dialogCtx) => StatefulBuilder(
        builder: (dialogCtx, setDialogState) {
          final theme = Theme.of(dialogCtx);
          final hasText = textController.text.trim().isNotEmpty;
          return Dialog(
            backgroundColor: theme.colorScheme.surface,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
            insetPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 40),
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                // Title
                Text(context.l10n?.writeAReview ?? 'Yorum Yaz',
                    style: GoogleFonts.plusJakartaSans(fontSize: 18,
                        fontWeight: FontWeight.w700,
                        color: theme.colorScheme.onSurface)),
                const SizedBox(height: 6),
                // Subtitle — product names
                Text(widget.products.map((p) => p.name).join(' vs '),
                    textAlign: TextAlign.center,
                    maxLines: 2, overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.plusJakartaSans(fontSize: 12,
                        color: theme.colorScheme.onSurface.withValues(alpha: 0.5))),
                const SizedBox(height: 20),
                // Text input
                TextField(
                  controller: textController,
                  maxLines: 4, minLines: 2,
                  autofocus: true,
                  onChanged: (_) => setDialogState(() {}),
                  style: GoogleFonts.plusJakartaSans(fontSize: 14,
                      color: theme.colorScheme.onSurface),
                  decoration: InputDecoration(
                    hintText: context.l10n?.shareYourExperience ?? 'Deneyiminizi paylaşın...',
                    hintStyle: GoogleFonts.plusJakartaSans(
                        fontSize: 14, color: theme.colorScheme.onSurface.withValues(alpha: 0.4)),
                    filled: true,
                    fillColor: theme.colorScheme.surfaceContainerHighest,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(14),
                      borderSide: BorderSide.none)),
                ),
                const SizedBox(height: 20),
                // Buttons row
                Row(children: [
                  Expanded(
                    child: GestureDetector(
                      onTap: () => Navigator.of(dialogCtx).pop(),
                      child: Container(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        decoration: BoxDecoration(
                          color: theme.colorScheme.surfaceContainerHighest,
                          borderRadius: BorderRadius.circular(12)),
                        child: Center(child: Text(context.l10n?.cancel ?? 'İptal',
                            style: GoogleFonts.plusJakartaSans(fontSize: 14,
                                fontWeight: FontWeight.w600,
                                color: theme.colorScheme.onSurface.withValues(alpha: 0.7)))),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: GestureDetector(
                      onTap: hasText ? () async {
                        HapticFeedback.mediumImpact();
                        try {
                          final docKey = _comparisonReviewDocKey();
                          final productIds = widget.products.map((p) => p.id).toList()..sort();
                          await FirebaseFirestore.instance
                              .collection('comparison_reviews')
                              .add({
                            'docKey': docKey,
                            'userId': userId,
                            'displayName': resolvedDisplayName,
                            'reviewText': textController.text.trim(),
                            'timestamp': FieldValue.serverTimestamp(),
                            'productIds': productIds,
                          });
                          if (dialogCtx.mounted) Navigator.of(dialogCtx).pop();
                          if (ctx.mounted) {
                            ScaffoldMessenger.of(ctx).showSnackBar(SnackBar(
                              content: Text(context.l10n?.reviewSubmitted ?? 'Yorum gönderildi! ✨',
                                  style: GoogleFonts.plusJakartaSans(fontSize: 13)),
                              behavior: SnackBarBehavior.floating));
                          }
                        } catch (e) {
                          if (ctx.mounted) {
                            ScaffoldMessenger.of(ctx).showSnackBar(SnackBar(
                              content: Text('Yorum gönderilemedi: $e'),
                              behavior: SnackBarBehavior.floating));
                          }
                        }
                      } : null,
                      child: Container(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        decoration: BoxDecoration(
                          gradient: hasText ? _accentGradient : null,
                          color: hasText ? null : theme.colorScheme.onSurface.withValues(alpha: 0.2),
                          borderRadius: BorderRadius.circular(12)),
                        child: Center(child: Text(context.l10n?.submitReview ?? 'Gönder',
                            style: GoogleFonts.plusJakartaSans(fontSize: 14,
                                fontWeight: FontWeight.w700, color: Colors.white))),
                      ),
                    ),
                  ),
                ]),
              ]),
            ),
          );
        },
      ),
    );
  }

  Widget _buildActionButton(IconData icon, String label, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 12),
        decoration: BoxDecoration(
          color: context.surfaceVariantColor,
          borderRadius: BorderRadius.circular(24),
          border: Border.all(
            color: AppTheme.brandBlue.withValues(alpha: 0.23),
          ),
          boxShadow: [
            BoxShadow(
              color: AppTheme.brandBlue.withValues(alpha: 0.11),
              blurRadius: 12,
              offset: const Offset(0, 3),
            ),
            const BoxShadow(color: Color(0x06000000), blurRadius: 6, offset: Offset(0, 2)),
          ],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            ShaderMask(
              shaderCallback: (bounds) => _accentGradient.createShader(bounds),
              child: Icon(icon, color: Colors.white, size: 18),
            ),
            const SizedBox(width: 8),
            Text(
              label,
              style: GoogleFonts.plusJakartaSans(
                color: context.textSecondary,
                fontSize: 13,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Data class for a single spec comparison row.
class _CompareSpecRow {
  final String label;
  final List<String> values;
  const _CompareSpecRow({required this.label, required this.values});
}

/// Keeps TabBarView children alive across tab switches.
class _KeepAliveTab extends StatefulWidget {
  final Widget child;
  const _KeepAliveTab({required this.child});
  @override
  State<_KeepAliveTab> createState() => _KeepAliveTabState();
}

class _KeepAliveTabState extends State<_KeepAliveTab>
    with AutomaticKeepAliveClientMixin {
  @override
  bool get wantKeepAlive => true;
  @override
  Widget build(BuildContext context) {
    super.build(context);
    return widget.child;
  }
}

// ─── Tab Bar Delegate ─────────────────────────────────────────────────────────

class _ShimmerBlock extends StatefulWidget {
  final double width;
  final double height;
  const _ShimmerBlock({required this.width, required this.height});
  @override
  State<_ShimmerBlock> createState() => _ShimmerBlockState();
}

class _ShimmerBlockState extends State<_ShimmerBlock> with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 1500))..repeat();
  }
  @override
  void dispose() { _ctrl.dispose(); super.dispose(); }
  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _ctrl,
      builder: (_, __) => Container(
        width: widget.width,
        height: widget.height,
        margin: const EdgeInsets.only(bottom: 2),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(6),
          gradient: LinearGradient(
            begin: Alignment(-1.0 + 2.0 * _ctrl.value, 0),
            end: Alignment(-1.0 + 2.0 * _ctrl.value + 1, 0),
            colors: [
              Colors.grey.withValues(alpha: 0.12),
              Colors.grey.withValues(alpha: 0.24),
              Colors.grey.withValues(alpha: 0.12),
            ],
          ),
        ),
      ),
    );
  }
}



// ─── In-App YouTube Comparison Videos (uses YouTubeService) ───