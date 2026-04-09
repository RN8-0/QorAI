part of '../compare_screen.dart';

class _SpecComparisonView extends ConsumerStatefulWidget {
  final List<ProductEntity> products;
  final VoidCallback onReset;
  const _SpecComparisonView({required this.products, required this.onReset});

  @override
  ConsumerState<_SpecComparisonView> createState() => _SpecComparisonViewState();
}

class _SpecComparisonViewState extends ConsumerState<_SpecComparisonView> {
  late Map<String, bool> _expandedGroups;
  late Map<String, Map<String, List<String>>> _groupedSpecs;
  String? _aiAnalysis;
  Map<String, dynamic>? _aiStructured;
  bool _aiLoading = false;
  bool _aiExpanded = true;

  // Deep Analysis state
  bool _deepAnalysisExpanded = false;
  bool _deepAnalysisLoading = false;
  String? _deepAnalysisResult;

  // Smart Alternatives state (comparison)
  bool _alternativesExpanded = false;
  bool _alternativesLoading = false;
  String? _alternativesResult;

  // AI Advisor state (comparison buying advice)
  bool _advisorExpanded = false;
  bool _advisorLoading = false;
  String? _advisorResult;

  // Price Prediction state
  bool _predictionExpanded = false;
  bool _predictionLoading = false;
  String? _predictionResult;


  @override
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

  /// Restore AI analysis results from session (survives navigation)
  void _restoreFromSession() {
    final session = ref.read(compareSessionProvider);
    final sessionIds = session.selectedProductIds.toSet();
    final currentIds = widget.products.map((p) => p.id).toSet();
    if (sessionIds.isNotEmpty && sessionIds.difference(currentIds).isEmpty && currentIds.difference(sessionIds).isEmpty) {
      if (session.aiAnalysis != null) {
        _aiAnalysis = session.aiAnalysis;
        _aiStructured = session.aiStructured;
      }
      if (session.deepAnalysisResult != null) _deepAnalysisResult = session.deepAnalysisResult;
      if (session.alternativesResult != null) _alternativesResult = session.alternativesResult;
      if (session.advisorResult != null) _advisorResult = session.advisorResult;
      if (session.predictionResult != null) _predictionResult = session.predictionResult;
    }
  }

  /// Save AI analysis results to session
  void _saveToSession() {
    ref.read(compareSessionProvider.notifier).update((state) => state.copyWith(
      aiAnalysis: _aiAnalysis,
      aiStructured: _aiStructured,
      deepAnalysisResult: _deepAnalysisResult,
      alternativesResult: _alternativesResult,
      advisorResult: _advisorResult,
      predictionResult: _predictionResult,
    ));
  }

  Future<void> _loadAiAnalysis() async {
    setState(() => _aiLoading = true);
    try {
      final gemini = ref.read(geminiServiceProvider);
      final productNames = widget.products.map((p) => p.name).join(' vs ');
      final specSummary = widget.products.map((p) {
        final keySpecs = p.keySpecs.entries.take(10).map((e) => '${e.key}: ${e.value}').join(', ');
        return '${p.name} (${p.brand ?? ""}): Score ${p.techScore.toInt()}/100. $keySpecs';
      }).join('\n');

      final lang = Localizations.localeOf(context).languageCode;
      final langName = lang == 'tr' ? 'Turkish' : 'English';

      final prompt = '''Compare these products in detail. ALL text in $langName.
$productNames

Specs:
$specSummary

Return ONLY valid JSON:
{
  "winner": "product name",
  "winner_score": 0-100,
  "products": {
    "<product_name>": {
      "compatibility_score": 0-100,
      "strengths": ["str1", "str2", "str3"],
      "weaknesses": ["weak1", "weak2"],
      "best_for": "ideal use case"
    }
  },
  "factors": {
    "performance": {"scores": {"<name1>": 0-100, "<name2>": 0-100}},
    "value": {"scores": {"<name1>": 0-100, "<name2>": 0-100}},
    "features": {"scores": {"<name1>": 0-100, "<name2>": 0-100}},
    "build_quality": {"scores": {"<name1>": 0-100, "<name2>": 0-100}},
    "user_experience": {"scores": {"<name1>": 0-100, "<name2>": 0-100}}
  },
  "recommendation": "3-4 sentence personalized recommendation",
  "verdict": "one sentence summary"
}''';

      // Use jsonFreeTextQuery for guaranteed JSON response format
      final result = await gemini.jsonFreeTextQuery(prompt, language: lang);
      if (mounted) {
        // Parse JSON response - jsonFreeTextQuery enforces JSON format
        Map<String, dynamic>? parsed;
        try {
          var clean = result.trim();
          // Strip markdown code fences if present (shouldn't be with responseMimeType)
          final codeBlockMatch = RegExp(r'```(?:json)?\s*\n?([\s\S]*?)\n?\s*```').firstMatch(clean);
          if (codeBlockMatch != null) {
            clean = codeBlockMatch.group(1)!.trim();
          }
          // Try to find JSON object in the response
          final jsonStart = clean.indexOf('{');
          final jsonEnd = clean.lastIndexOf('}');
          if (jsonStart >= 0 && jsonEnd > jsonStart) {
            clean = clean.substring(jsonStart, jsonEnd + 1);
          }
          parsed = jsonDecode(clean) as Map<String, dynamic>?;
        } catch (_) {
          debugPrint('=== COMPAIR: Compare AI JSON parse failed ===');
        }

        setState(() {
          _aiAnalysis = result;
          _aiStructured = parsed;
          _aiLoading = false;
          _aiExpanded = true;
        });
        // Save to session for persistence across navigation
        _saveToSession();
      }
    } catch (_) {
      if (mounted) setState(() => _aiLoading = false);
    }
  }

  Future<void> _toggleDeepAnalysis() async {
    if (_deepAnalysisExpanded && _deepAnalysisResult != null) {
      setState(() => _deepAnalysisExpanded = false);
      return;
    }
    setState(() {
      _deepAnalysisExpanded = true;
      if (_deepAnalysisResult != null) return;
      _deepAnalysisLoading = true;
    });
    if (_deepAnalysisResult != null) return;
    try {
      final gemini = ref.read(geminiServiceProvider);
      final lang = Localizations.localeOf(context).languageCode;
      final langName = lang == 'tr' ? 'Turkish' : 'English';
      final productNames = widget.products.map((p) => p.name).join(' vs ');

      // Use grounded query to search Reddit/forums and get real user opinions
      final result = await gemini.groundedQuery(
        '''You are a senior tech product analyst. Analyze "$productNames" with web research.

INSTRUCTIONS:
1. Search Reddit, tech forums, and community discussions for real user experiences
2. Find actual user complaints and praise from r/technology, r/gadgets, product-specific subreddits
3. Look for common issues reported by real users

Provide analysis in $langName covering:

## Expert Analysis
- Build quality & design philosophy differences
- Real-world performance (not just benchmarks)
- Value proposition of each product
- Hidden strengths most reviewers miss
- Potential deal-breakers

## Community Insights (Reddit/Forums)
- What real users love about each product
- Common complaints and issues reported
- Long-term reliability reports from actual owners
- Community consensus on which is better and why

## Verdict
- Best use case for each product
- Overall recommendation with reasoning

Keep it comprehensive but readable. Use bullet points for clarity.''',
      );
      if (mounted) {
        setState(() {
          _deepAnalysisResult = result.isNotEmpty ? result : 'Unable to generate analysis.';
          _deepAnalysisLoading = false;
        });
        // Save to session for persistence across navigation
        _saveToSession();
      }
    } catch (_) {
      if (mounted) setState(() {
        _deepAnalysisResult = 'Unable to generate analysis. Please try again.';
        _deepAnalysisLoading = false;
      });
    }
  }

  Future<void> _toggleAlternatives() async {
    if (_alternativesExpanded && _alternativesResult != null) {
      setState(() => _alternativesExpanded = false);
      return;
    }
    setState(() {
      _alternativesExpanded = true;
      if (_alternativesResult != null) return;
      _alternativesLoading = true;
    });
    if (_alternativesResult != null) return;
    try {
      final gemini = ref.read(geminiServiceProvider);
      final lang = Localizations.localeOf(context).languageCode;
      final langName = lang == 'tr' ? 'Turkish' : 'English';
      final productNames = widget.products.map((p) => '${p.name} (${p.brand ?? "Unknown"})').join(' vs ');
      final category = widget.products.first.category;
      final result = await gemini.groundedQuery(
        '''You are a tech product expert. The user is comparing: $productNames in category "$category".
Suggest 3-5 alternative products they should also consider, in $langName.

For each alternative:
🔷 **Product Name** — Brand
- Why it's worth considering (1-2 sentences)
- Key advantage over the compared products
- Price range estimate

Also briefly explain:
## 🎯 Which Alternative Fits Best?
- For budget users: ...
- For performance seekers: ...
- For best value: ...''',
      );
      if (mounted) {
        setState(() {
          _alternativesResult = result.isNotEmpty ? result : 'Unable to generate alternatives.';
          _alternativesLoading = false;
        });
        _saveToSession();
      }
    } catch (_) {
      if (mounted) setState(() {
        _alternativesResult = 'Unable to generate alternatives. Please try again.';
        _alternativesLoading = false;
      });
    }
  }

  Future<void> _toggleAdvisor() async {
    if (_advisorExpanded && _advisorResult != null) {
      setState(() => _advisorExpanded = false);
      return;
    }
    setState(() {
      _advisorExpanded = true;
      if (_advisorResult != null) return;
      _advisorLoading = true;
    });
    if (_advisorResult != null) return;
    try {
      final gemini = ref.read(geminiServiceProvider);
      final lang = Localizations.localeOf(context).languageCode;
      final langName = lang == 'tr' ? 'Turkish' : 'English';
      final productDetails = widget.products.map((p) {
        final specs = p.specs.entries.take(10).map((e) => '${e.key}: ${e.value}').join(', ');
        final price = p.prices.isNotEmpty ? p.prices.values.first : 'N/A';
        return '${p.name} (Score: ${p.techScore}, Price: $price, Specs: $specs)';
      }).join('\n');
      final result = await gemini.groundedQuery(
        '''You are a personal shopping advisor. Help the user decide between these products. Respond in $langName.

Products being compared:
$productDetails

Provide personalized buying advice:

## 🏆 Winner Summary
- Overall winner and runner-up with reasoning

## 👤 Who Should Buy What?
- **${widget.products.first.name}** is best for: ...
${widget.products.length > 1 ? '- **${widget.products[1].name}** is best for: ...' : ''}
${widget.products.length > 2 ? '- **${widget.products[2].name}** is best for: ...' : ''}

## 💡 Key Decision Factors
- If you prioritize camera: choose...
- If you prioritize performance: choose...
- If you prioritize battery: choose...
- If you prioritize value: choose...

## ⚠️ Things to Watch Out For
- Potential downsides of each product

## 🎯 Final Verdict
Clear, actionable recommendation.''',
      );
      if (mounted) {
        setState(() {
          _advisorResult = result.isNotEmpty ? result : 'Unable to generate advice.';
          _advisorLoading = false;
        });
        _saveToSession();
      }
    } catch (_) {
      if (mounted) setState(() {
        _advisorResult = 'Unable to generate advice. Please try again.';
        _advisorLoading = false;
      });
    }
  }

  Future<void> _togglePrediction() async {
    if (_predictionExpanded && _predictionResult != null) {
      setState(() => _predictionExpanded = false);
      return;
    }
    setState(() {
      _predictionExpanded = true;
      if (_predictionResult != null) return;
      _predictionLoading = true;
    });
    if (_predictionResult != null) return;
    try {
      final gemini = ref.read(geminiServiceProvider);
      final lang = Localizations.localeOf(context).languageCode;
      final langName = lang == 'tr' ? 'Turkish' : 'English';
      final productNames = widget.products.map((p) {
        final price = p.prices.isNotEmpty ? p.prices.values.first : 'N/A';
        return '${p.name} (current price: $price)';
      }).join(', ');
      final result = await gemini.groundedQuery(
        '''Analyze price trends for: $productNames. Respond in $langName.

## 📊 Current Price Analysis
For each product, analyze current pricing

## 📉 Price Trend Prediction
- Expected price movement in next 1-3 months
- Best time to buy each product
- Any upcoming sales events or price drops

## 🛒 Buying Timing Advice
- Buy now vs wait recommendation for each product
- Which product offers the best value RIGHT NOW

## 💰 Value Comparison
- Price-to-performance ratio comparison
- Hidden costs to consider (accessories, subscriptions)''',
      );
      if (mounted) {
        setState(() {
          _predictionResult = result.isNotEmpty ? result : 'Unable to predict prices.';
          _predictionLoading = false;
        });
        _saveToSession();
      }
    } catch (_) {
      if (mounted) setState(() {
        _predictionResult = 'Unable to predict prices. Please try again.';
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

  Widget _buildAiAnalysisCard() {
    final hasStructured = _aiStructured != null;
    return Container(
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: AppTheme.brandBlue.withValues(alpha: 0.18)),
        boxShadow: [
          BoxShadow(color: AppTheme.brandBlue.withValues(alpha: 0.1), blurRadius: 16, offset: const Offset(0, 4)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          InkWell(
            borderRadius: const BorderRadius.vertical(top: Radius.circular(22)),
            onTap: () => setState(() => _aiExpanded = !_aiExpanded),
            child: Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                gradient: LinearGradient(colors: [
                  AppTheme.brandBlue.withValues(alpha: 0.11),
                  AppTheme.brandDeepBlue.withValues(alpha: 0.08),
                ]),
                borderRadius: _aiExpanded
                    ? const BorderRadius.vertical(top: Radius.circular(22))
                    : BorderRadius.circular(22),
              ),
              child: Row(children: [
                Container(
                  width: 32, height: 32,
                  decoration: const BoxDecoration(gradient: _accentGradient, shape: BoxShape.circle),
                  child: const Icon(Icons.auto_awesome, size: 16, color: Colors.white),
                ),
                const SizedBox(width: 12),
                Expanded(child: Text(
                  context.l10n?.aiAnalysis ?? 'AI Analysis',
                  style: GoogleFonts.plusJakartaSans(fontSize: 15, fontWeight: FontWeight.w700, color: context.textPrimary),
                )),
                if (hasStructured && _aiStructured!['winner'] != null)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: AppTheme.scoreExcellent.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(8)),
                    child: Text('🏆 ${_aiStructured!['winner']}',
                        style: GoogleFonts.plusJakartaSans(fontSize: 11, fontWeight: FontWeight.w700, color: AppTheme.scoreExcellent)),
                  ),
                const SizedBox(width: 8),
                if (_aiLoading)
                  const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: AppTheme.brandBlue))
                else
                  AnimatedRotation(
                    turns: _aiExpanded ? 0.5 : 0, duration: const Duration(milliseconds: 200),
                    child: Icon(Icons.expand_more, size: 22, color: context.textTertiaryColor)),
              ]),
            ),
          ),
          // Structured content
          if (_aiExpanded && hasStructured) ...[
            // Per-product compatibility scores
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              child: Column(
                children: (_aiStructured!['products'] as Map<String, dynamic>? ?? {}).entries.map((e) {
                  final data = e.value as Map<String, dynamic>? ?? {};
                  final score = (data['compatibility_score'] as num?)?.toDouble() ?? 0;
                  final strengths = List<String>.from(data['strengths'] ?? []);
                  final weaknesses = List<String>.from(data['weaknesses'] ?? []);
                  final bestFor = data['best_for'] as String? ?? '';
                  return Container(
                    margin: const EdgeInsets.only(bottom: 12),
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: context.surfaceElevatedColor,
                      borderRadius: BorderRadius.circular(14)),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(children: [
                        Expanded(child: Text(e.key, style: GoogleFonts.plusJakartaSans(
                            fontSize: 14, fontWeight: FontWeight.w700, color: context.textPrimary))),
                        Container(
                          width: 48, height: 48,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            gradient: LinearGradient(colors: [
                              _aiScoreColor(score).withValues(alpha: 0.7), _aiScoreColor(score)])),
                          child: Center(child: Text('${score.toInt()}%',
                              style: GoogleFonts.plusJakartaSans(fontSize: 13, fontWeight: FontWeight.w900, color: Colors.white))),
                        ),
                      ]),
                      if (bestFor.isNotEmpty) ...[
                        const SizedBox(height: 6),
                        Text('🎯 $bestFor', style: GoogleFonts.plusJakartaSans(
                            fontSize: 12, color: context.textSecondary, fontStyle: FontStyle.italic)),
                      ],
                      if (strengths.isNotEmpty) ...[
                        const SizedBox(height: 8),
                        ...strengths.take(3).map((s) => Padding(
                          padding: const EdgeInsets.only(bottom: 3),
                          child: Row(children: [
                            const Text('✅ ', style: TextStyle(fontSize: 11)),
                            Expanded(child: Text(s, style: GoogleFonts.plusJakartaSans(fontSize: 12, color: context.textSecondary))),
                          ]),
                        )),
                      ],
                      if (weaknesses.isNotEmpty) ...[
                        const SizedBox(height: 4),
                        ...weaknesses.take(2).map((w) => Padding(
                          padding: const EdgeInsets.only(bottom: 3),
                          child: Row(children: [
                            const Text('⚠️ ', style: TextStyle(fontSize: 11)),
                            Expanded(child: Text(w, style: GoogleFonts.plusJakartaSans(fontSize: 12, color: context.textTertiaryColor))),
                          ]),
                        )),
                      ],
                    ]),
                  );
                }).toList(),
              ),
            ),
            // Factor comparison bars
            if ((_aiStructured!['factors'] as Map<String, dynamic>?)?.isNotEmpty == true)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                child: Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: context.surfaceElevatedColor,
                    borderRadius: BorderRadius.circular(14)),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Factor Comparison', style: GoogleFonts.plusJakartaSans(
                          fontSize: 13, fontWeight: FontWeight.w700, color: context.textPrimary)),
                      const SizedBox(height: 10),
                      ...(_aiStructured!['factors'] as Map<String, dynamic>).entries.map((factor) {
                        final fData = factor.value as Map<String, dynamic>? ?? {};
                        final scores = (fData['scores'] as Map<String, dynamic>?) ?? {};
                        final label = factor.key.replaceAll('_', ' ').split(' ')
                            .map((w) => w.isNotEmpty ? '${w[0].toUpperCase()}${w.substring(1)}' : '').join(' ');
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text(label, style: GoogleFonts.plusJakartaSans(
                                fontSize: 11, fontWeight: FontWeight.w500, color: context.textTertiaryColor)),
                            const SizedBox(height: 4),
                            ...scores.entries.map((s) {
                              final val = (s.value as num?)?.toDouble() ?? 0;
                              return Padding(
                                padding: const EdgeInsets.only(bottom: 3),
                                child: Row(children: [
                                  SizedBox(width: 70, child: Text(s.key.split(' ').last,
                                      style: GoogleFonts.plusJakartaSans(fontSize: 10, color: context.textTertiaryColor),
                                      maxLines: 1, overflow: TextOverflow.ellipsis)),
                                  Expanded(child: ClipRRect(
                                    borderRadius: BorderRadius.circular(3),
                                    child: LinearProgressIndicator(
                                        value: val / 100, minHeight: 6,
                                        backgroundColor: context.surfaceVariantColor,
                                        color: _aiScoreColor(val)))),
                                  const SizedBox(width: 6),
                                  SizedBox(width: 26, child: Text('${val.toInt()}',
                                      textAlign: TextAlign.right,
                                      style: GoogleFonts.plusJakartaSans(fontSize: 10, fontWeight: FontWeight.w700, color: _aiScoreColor(val)))),
                                ]),
                              );
                            }),
                          ]),
                        );
                      }),
                    ],
                  ),
                ),
              ),
            // Recommendation
            if (_aiStructured!['recommendation'] != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                child: Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(colors: [
                      AppTheme.brandBlue.withValues(alpha: 0.08),
                      AppTheme.brandSkyBlue.withValues(alpha: 0.06)]),
                    borderRadius: BorderRadius.circular(12)),
                  child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    const Text('💡', style: TextStyle(fontSize: 16)),
                    const SizedBox(width: 8),
                    Expanded(child: Text(_aiStructured!['recommendation'] as String,
                        style: GoogleFonts.plusJakartaSans(fontSize: 13, height: 1.5, color: context.textPrimary))),
                  ]),
                ),
              ),
          ],
          // Fallback: formatted text (strip code fences and format)
          if (_aiExpanded && !hasStructured && _aiAnalysis != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: _FormattedAiText(text: _aiAnalysis!),
            ),
          if (_aiExpanded && _aiAnalysis == null && !_aiLoading)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
              child: SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: _loadAiAnalysis,
                  icon: const Icon(Icons.auto_awesome, size: 18),
                  label: Text('Load AI Analysis',
                    style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700)),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.brandBlue,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  ),
                ),
              ),
            ),
        ],
      ),
    ).animate().fadeIn(delay: 300.ms, duration: 400.ms);
  }

  Color _aiScoreColor(double score) {
    if (score >= 80) return AppTheme.scoreExcellent;
    if (score >= 60) return AppTheme.scoreAverage;
    if (score >= 40) return AppTheme.orange500;
    return AppTheme.error;
  }

  // ─── Visual Builders ───

  Widget _buildProductColumn(ProductEntity product) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final imgSize = (constraints.maxWidth * 0.7).clamp(60.0, 120.0);
        return Column(
          children: [
            SizedBox(
              width: imgSize,
              height: imgSize,
              child: Container(
                decoration: BoxDecoration(
                  color: context.surfaceColor,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: ProductImageBox(
                  imageUrl: product.imageUrl,
                  height: imgSize - 4,
                  borderRadius: BorderRadius.circular(16),
                  padding: const EdgeInsets.all(8),
                ),
              ),
            ),
            const SizedBox(height: 10),
            SizedBox(
              height: 36,
              child: Text(
                product.name,
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: context.textPrimary,
                ),
                textAlign: TextAlign.center,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            if (product.brand != null)
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Text(
                  product.brand!,
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 11,
                    fontWeight: FontWeight.w500,
                    color: context.textTertiaryColor,
                  ),
                ),
              ),
          ],
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    ref.watch(specDirectionServiceProvider);

    return DefaultTabController(
      length: 4,
      child: NestedScrollView(
        headerSliverBuilder: (context, innerBoxIsScrolled) => [
          // Product header with frosted glass background
          SliverToBoxAdapter(
            child: Container(
              margin: const EdgeInsets.fromLTRB(16, 8, 16, 8),
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: context.surfaceColor,
                borderRadius: BorderRadius.circular(24),
                border: Border.all(
                  color: AppTheme.brandBlue.withValues(alpha: 0.12),
                ),
                boxShadow: [
                  BoxShadow(
                    color: AppTheme.brandBlue.withValues(alpha: 0.08),
                    blurRadius: 16,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: widget.products.length == 2
                ? Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(child: _buildProductColumn(widget.products[0])),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 24),
                        child: Container(
                          width: 36, height: 36,
                          decoration: BoxDecoration(
                            gradient: _accentGradient,
                            shape: BoxShape.circle,
                            boxShadow: [
                              BoxShadow(
                                color: AppTheme.brandBlue.withValues(alpha: 0.3),
                                blurRadius: 10,
                                offset: const Offset(0, 3),
                              ),
                            ],
                          ),
                          child: Center(
                            child: Text(
                              'VS',
                              style: GoogleFonts.plusJakartaSans(
                                color: Colors.white,
                                fontSize: 12,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                          ),
                        ),
                      ),
                      Expanded(child: _buildProductColumn(widget.products[1])),
                    ],
                  )
                : Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: widget.products.asMap().entries.map((entry) {
                      final idx = entry.key;
                      final product = entry.value;
                      return Expanded(
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Expanded(child: _buildProductColumn(product)),
                            if (idx < widget.products.length - 1)
                              Padding(
                                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 24),
                                child: Container(
                                  width: 30, height: 30,
                                  decoration: BoxDecoration(
                                    gradient: _accentGradient,
                                    shape: BoxShape.circle,
                                    boxShadow: [
                                      BoxShadow(
                                        color: AppTheme.brandBlue.withValues(alpha: 0.3),
                                        blurRadius: 8,
                                        offset: const Offset(0, 2),
                                      ),
                                    ],
                                  ),
                                  child: Center(
                                    child: Text(
                                      'VS',
                                      style: GoogleFonts.plusJakartaSans(
                                        color: Colors.white,
                                        fontSize: 10,
                                        fontWeight: FontWeight.w900,
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                          ],
                        ),
                      );
                    }).toList(),
                  ),
          ),
        ),

          // Sticky compact product name chips
          SliverPersistentHeader(
            pinned: true,
            delegate: _ProductChipHeaderDelegate(widget.products),
          ),

          // Pill-style tab bar
          SliverPersistentHeader(
            pinned: true,
            delegate: _TabBarDelegate(
              TabBar(
                labelColor: Colors.white,
                unselectedLabelColor: context.textSecondary,
                indicatorSize: TabBarIndicatorSize.tab,
                dividerColor: Colors.transparent,
                indicator: BoxDecoration(
                  gradient: _accentGradient,
                  borderRadius: BorderRadius.circular(14),
                ),
                splashBorderRadius: BorderRadius.circular(14),
                labelStyle: GoogleFonts.plusJakartaSans(
                    fontSize: 14, fontWeight: FontWeight.w700),
                unselectedLabelStyle: GoogleFonts.plusJakartaSans(
                    fontSize: 14, fontWeight: FontWeight.w500),
                tabs: [
                  Tab(text: context.l10n?.specs ?? 'Specs'),
                  Tab(text: context.l10n?.reviews ?? 'Reviews'),
                  Tab(text: context.l10n?.similarTab ?? 'Similar'),
                  Tab(text: context.l10n?.proTab ?? 'Premium'),
                ],
              ),
            ),
          ),
        ],
        body: TabBarView(
          children: [
            // ─── Specs Tab ────────────────────────────────────────────
            _buildSpecsTab(),
            // ─── Reviews Tab ──────────────────────────────────────────
            _buildReviewsTab(),
            // ─── Similar Tab ──────────────────────────────────────────
            _buildSimilarTab(),
            // ─── PRO (AI Analysis) Tab ────────────────────────────────
            _buildProTab(),
          ],
        ),
      ),
    );
  }

  Widget _buildSpecsTab() {
    int specGroupIndex = 0;
    return CustomScrollView(
      slivers: [
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
                                    fontSize: 15,
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

                                    return Expanded(
                                      child: Container(
                                        margin: const EdgeInsets.symmetric(horizontal: 3),
                                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                                        decoration: BoxDecoration(
                                          gradient: isBetter
                                              ? LinearGradient(
                                                  colors: [
                                                    AppTheme.brandBlue.withValues(alpha: 0.12),
                                                    AppTheme.brandDeepBlue.withValues(alpha: 0.11),
                                                  ],
                                                )
                                              : null,
                                          color: isBetter ? null : Colors.transparent,
                                          borderRadius: BorderRadius.circular(12),
                                          border: isBetter
                                              ? Border.all(
                                                  color: AppTheme.brandBlue.withValues(alpha: 0.23),
                                                )
                                              : null,
                                        ),
                                        child: isBetter
                                            ? ShaderMask(
                                                shaderCallback: (bounds) =>
                                                    _accentGradient.createShader(bounds),
                                                child: Text(
                                                  _localizedSpecValue(context, val),
                                                  style: GoogleFonts.plusJakartaSans(
                                                    fontSize: 13,
                                                    fontWeight: FontWeight.w700,
                                                    color: Colors.white,
                                                  ),
                                                  textAlign: TextAlign.center,
                                                  maxLines: 3,
                                                  overflow: TextOverflow.ellipsis,
                                                ),
                                              )
                                            : Text(
                                                _localizedSpecValue(context, val),
                                                style: GoogleFonts.plusJakartaSans(
                                                  fontSize: 13,
                                                  fontWeight: isMissing ? FontWeight.w400 : FontWeight.w500,
                                                  color: isMissing
                                                      ? context.textTertiaryColor
                                                      : context.textSecondary,
                                                ),
                                                textAlign: TextAlign.center,
                                                maxLines: 3,
                                                overflow: TextOverflow.ellipsis,
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
    return ListView(
      padding: EdgeInsets.fromLTRB(16, 12, 16, MediaQuery.of(context).padding.bottom + AppTheme.navBarTotalClearance + 40),
      children: [
        // YouTube comparison videos (in-app native player using YouTubeService)
        _CompareYouTubeSection(products: widget.products),
        const SizedBox(height: 14),

        // User reviews section
        _buildUserReviewsSection(),
      ],
    );
  }

  Widget _buildSimilarTab() {
    final excludeIds = widget.products.map((p) => p.id).toSet();
    // Also exclude same variant groups to prevent showing same model variants
    final excludeVariantGroups = widget.products
        .where((p) => p.variantGroup.isNotEmpty)
        .map((p) => p.variantGroup)
        .toSet();
    return ListView(
      padding: EdgeInsets.fromLTRB(16, 16, 16, MediaQuery.of(context).padding.bottom + AppTheme.navBarTotalClearance),
      children: [
        // Similar products for each compared product
        ...widget.products.map((product) => Padding(
          padding: const EdgeInsets.only(bottom: 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(children: [
                Container(
                  width: 36, height: 36,
                  decoration: BoxDecoration(
                    color: AppTheme.brandBlue.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(Icons.grid_view_rounded, color: AppTheme.brandBlue, size: 18),
                ),
                const SizedBox(width: 10),
                Expanded(child: Text(
                  product.name,
                  maxLines: 1, overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.plusJakartaSans(fontSize: 13, fontWeight: FontWeight.w700, color: context.textPrimary),
                )),
              ]),
              const SizedBox(height: 8),
              Text(
                context.l10n?.similarProducts ?? 'Similar Products',
                style: GoogleFonts.plusJakartaSans(fontSize: 12, color: context.textTertiaryColor),
              ),
              const SizedBox(height: 10),
              SizedBox(
                height: 140,
                child: _CompareSuggestedList(
                  category: product.category,
                  excludeIds: excludeIds,
                  excludeVariantGroups: excludeVariantGroups,
                ),
              ),
            ],
          ),
        )),
        // Popular products from different categories
        _CompareDiscoverSection(excludeIds: excludeIds),
      ],
    );
  }

  Widget _buildProTab() {
    return ListView(
      padding: EdgeInsets.fromLTRB(16, 12, 16, MediaQuery.of(context).padding.bottom + AppTheme.navBarTotalClearance),
      children: [
        // User Compatibility Match
        _buildMatchScoreSection(),
        const SizedBox(height: 14),
        // AI Comparison Analysis (review summary)
        _buildAiAnalysisCard(),
        const SizedBox(height: 14),
        // AI Deep Analysis
        _buildExpandableCard(
          icon: Icons.psychology_rounded,
          title: context.l10n?.aiDeepAnalysis ?? 'AI Deep Analysis',
          subtitle: 'Comprehensive AI-powered comparison evaluation',
          gradient: const [AppTheme.brandBlue, AppTheme.brandDeepBlue],
          isExpanded: _deepAnalysisExpanded,
          isLoading: _deepAnalysisLoading,
          content: _deepAnalysisResult,
          onTap: _toggleDeepAnalysis,
        ),
        const SizedBox(height: 14),
        // Smart Alternatives
        _buildExpandableCard(
          icon: Icons.auto_awesome_rounded,
          title: context.l10n?.smartAlternatives ?? 'Smart Alternatives',
          subtitle: 'AI-curated alternatives you should consider',
          gradient: const [AppTheme.brandSkyBlue, AppTheme.orange500],
          isExpanded: _alternativesExpanded,
          isLoading: _alternativesLoading,
          content: _alternativesResult,
          onTap: _toggleAlternatives,
        ),
        const SizedBox(height: 14),
        // AI Product Advisor
        _buildExpandableCard(
          icon: Icons.support_agent_rounded,
          title: 'AI Product Advisor',
          subtitle: 'Personalized buying advice for your comparison',
          gradient: const [AppTheme.scoreAverage, AppTheme.error],
          isExpanded: _advisorExpanded,
          isLoading: _advisorLoading,
          content: _advisorResult,
          onTap: _toggleAdvisor,
        ),
        const SizedBox(height: 14),
        // Price Prediction
        _buildExpandableCard(
          icon: Icons.trending_down_rounded,
          title: 'Price Prediction',
          subtitle: 'AI-powered price trend analysis & best time to buy',
          gradient: const [AppTheme.scoreExcellent, AppTheme.brandBlue],
          isExpanded: _predictionExpanded,
          isLoading: _predictionLoading,
          content: _predictionResult,
          onTap: _togglePrediction,
        ),
        const SizedBox(height: 14),
        // Benchmark comparison
        _CompareBenchmarkSection(products: widget.products),
      ],
    );
  }

  Widget _buildMatchScoreSection() {
    final userProfile = ref.watch(userProfileProvider);
    final user = userProfile.valueOrNull;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: context.dividerColor),
        boxShadow: const [
          BoxShadow(color: Color(0x086366F1), blurRadius: 12, offset: Offset(0, 4)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Container(
              width: 38, height: 38,
              decoration: BoxDecoration(
                gradient: const LinearGradient(colors: [AppTheme.brandSkyBlue, AppTheme.brandDeepBlue]),
                borderRadius: BorderRadius.circular(12)),
              child: const Icon(Icons.person_search_rounded, size: 20, color: Colors.white),
            ),
            const SizedBox(width: 12),
            Expanded(child: Text(
              context.l10n?.personalizedMatch ?? 'Personalized Match',
              style: GoogleFonts.plusJakartaSans(fontSize: 15, fontWeight: FontWeight.w700, color: context.textPrimary),
            )),
          ]),
          const SizedBox(height: 14),
          ...widget.products.map((product) {
            int? matchScore;
            if (user != null) {
              try {
                final algo = ref.read(profileAlgorithmServiceProvider);
                final behavior = ref.watch(behaviorSignalsProvider).valueOrNull ?? BehaviorSignals.empty;
                final fs = algo.calculateTotalFitScore(
                  user: user, product: product, behavior: behavior);
                if (fs > 0) matchScore = fs.toInt();
              } catch (_) {}
            }
            final displayScore = matchScore != null ? '$matchScore%' : '--';
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
              child: Row(children: [
                Container(
                  width: 46, height: 46,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: LinearGradient(colors: [matchColor, AppTheme.brandSkyBlue])),
                  child: Center(child: Text(displayScore,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 15, fontWeight: FontWeight.w900, color: Colors.white))),
                ),
                const SizedBox(width: 12),
                Expanded(child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(product.name, style: GoogleFonts.plusJakartaSans(
                      fontSize: 13, fontWeight: FontWeight.w700, color: context.textPrimary),
                      maxLines: 1, overflow: TextOverflow.ellipsis),
                    const SizedBox(height: 2),
                    Text(matchScore != null
                      ? 'Based on your preferences & behavior'
                      : 'Sign in to see your match',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 11, color: context.textTertiaryColor)),
                  ],
                )),
              ]),
            );
          }),
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
  }) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
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
            Row(children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  gradient: LinearGradient(colors: gradient),
                  borderRadius: BorderRadius.circular(12)),
                child: Icon(icon, color: Colors.white, size: 20)),
              const SizedBox(width: 12),
              Expanded(child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: GoogleFonts.plusJakartaSans(
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
            if (isExpanded && content != null) ...[
              const SizedBox(height: 14),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: gradient[0].withValues(alpha: 0.04),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: gradient[0].withValues(alpha: 0.1))),
                child: _FormattedAiText(text: content),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildUserReviewsSection() {
    // Aggregate reviews from all compared products
    final allReviewFutures = widget.products.map(
        (p) => ref.watch(productReviewsProvider(p.id)));

    final allReviews = <ReviewModel>[];
    bool isLoading = false;
    for (final asyncVal in allReviewFutures) {
      asyncVal.when(
        data: (reviews) => allReviews.addAll(reviews),
        loading: () => isLoading = true,
        error: (_, __) {},
      );
    }
    allReviews.sort((a, b) => b.createdAt.compareTo(a.createdAt));

    final avgRating = allReviews.isEmpty ? 0.0
        : allReviews.map((r) => r.rating).reduce((a, b) => a + b) / allReviews.length;

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
            if (allReviews.isNotEmpty)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: AppTheme.amber500.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(12)),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  const Icon(Icons.star_rounded, size: 14, color: AppTheme.amber500),
                  const SizedBox(width: 3),
                  Text(avgRating.toStringAsFixed(1),
                      style: GoogleFonts.plusJakartaSans(fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: AppTheme.amber500)),
                  Text(' (${allReviews.length})',
                      style: GoogleFonts.plusJakartaSans(fontSize: 11,
                          color: context.textTertiaryColor)),
                ]),
              ),
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

          if (isLoading)
            const Center(child: Padding(
              padding: EdgeInsets.all(20),
              child: CircularProgressIndicator(strokeWidth: 2, color: AppTheme.brandBlue)))
          else if (allReviews.isEmpty)
            Container(
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
            )
          else
            ...allReviews.take(5).map((review) => _buildReviewItem(review)),
        ],
      ),
    );
  }

  Widget _buildReviewItem(ReviewModel review) {
    final rating = review.rating.round().clamp(1, 5);
    final ratingColor = rating >= 4 ? AppTheme.scoreExcellent
        : rating >= 3 ? AppTheme.scoreAverage : AppTheme.error;
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
              child: Text(review.userId.substring(0, 1).toUpperCase(),
                  style: GoogleFonts.plusJakartaSans(fontSize: 11,
                      fontWeight: FontWeight.w700, color: AppTheme.brandBlue)),
            ),
            const SizedBox(width: 8),
            // Star rating
            ...List.generate(5, (i) => Icon(
              i < rating ? Icons.star_rounded : Icons.star_outline_rounded,
              size: 14, color: i < rating ? ratingColor : context.textTertiaryColor,
            )),
            const Spacer(),
            Text(_timeAgo(review.createdAt),
                style: GoogleFonts.plusJakartaSans(fontSize: 11,
                    color: context.textTertiaryColor)),
          ]),
          if (review.text.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(review.text,
              maxLines: 4, overflow: TextOverflow.ellipsis,
              style: GoogleFonts.plusJakartaSans(fontSize: 13,
                  height: 1.5, color: context.textSecondary)),
          ],
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
    if (user == null) {
      ScaffoldMessenger.of(ctx).showSnackBar(SnackBar(
        content: Text(context.l10n?.signInToReview ?? 'Please sign in to write a review'),
        behavior: SnackBarBehavior.floating));
      return;
    }

    double selectedRating = 4.0;
    final textController = TextEditingController();

    showModalBottomSheet(
      context: ctx,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (sheetCtx) => StatefulBuilder(
        builder: (sheetCtx, setSheetState) {
          final ratingLabels = ['😞 Poor', '😐 Fair', '🙂 Good', '😊 Very Good', '🤩 Excellent'];
          final ratingColors = [
            AppTheme.error,
            AppTheme.orange500,
            AppTheme.scoreAverage,
            AppTheme.scoreExcellent,
            AppTheme.brandBlue,
          ];
          final starIndex = selectedRating.round().clamp(1, 5) - 1;

          return Container(
            padding: EdgeInsets.fromLTRB(24, 24, 24,
                MediaQuery.of(sheetCtx).viewInsets.bottom + 24),
            decoration: BoxDecoration(
              color: context.surfaceElevatedColor,
              borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Container(width: 40, height: 4,
                decoration: BoxDecoration(
                  color: context.dividerColor,
                  borderRadius: BorderRadius.circular(2))),
              const SizedBox(height: 16),
              Text(context.l10n?.writeAReview ?? 'Write a Review',
                  style: GoogleFonts.plusJakartaSans(fontSize: 18,
                      fontWeight: FontWeight.w700,
                      color: context.textPrimary)),
              const SizedBox(height: 4),
              Text(widget.products.map((p) => p.name).join(' vs '),
                  textAlign: TextAlign.center,
                  maxLines: 2, overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.plusJakartaSans(fontSize: 13,
                      color: context.textTertiaryColor)),
              const SizedBox(height: 20),
              // 5-star rating
              Row(mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(5, (i) {
                  final starVal = (i + 1).toDouble();
                  return GestureDetector(
                    onTap: () => setSheetState(() => selectedRating = starVal),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 6),
                      child: Icon(
                        i < selectedRating.round() ? Icons.star_rounded : Icons.star_outline_rounded,
                        size: 36,
                        color: i < selectedRating.round() ? ratingColors[starIndex] : context.textTertiaryColor,
                      ),
                    ),
                  );
                }),
              ),
              const SizedBox(height: 8),
              // Rating label
              AnimatedSwitcher(
                duration: const Duration(milliseconds: 200),
                child: Text(
                  ratingLabels[starIndex],
                  key: ValueKey(starIndex),
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 14, fontWeight: FontWeight.w600,
                    color: ratingColors[starIndex]),
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: textController,
                maxLines: 4, minLines: 2,
                style: GoogleFonts.plusJakartaSans(fontSize: 14, color: context.textPrimary),
                decoration: InputDecoration(
                  hintText: context.l10n?.shareYourExperience ?? 'Share your experience...',
                  hintStyle: GoogleFonts.plusJakartaSans(
                      fontSize: 14, color: context.textTertiaryColor),
                  filled: true,
                  fillColor: context.surfaceVariantColor,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(14),
                    borderSide: BorderSide.none)),
              ),
              const SizedBox(height: 16),
              GestureDetector(
                onTap: () async {
                  HapticFeedback.mediumImpact();
                  final review = ReviewModel(
                    id: DateTime.now().millisecondsSinceEpoch.toString(),
                    userId: user.uid,
                    productId: widget.products.first.id,
                    rating: selectedRating,
                    text: textController.text.trim(),
                    helpful: 0,
                    reported: false,
                    createdAt: DateTime.now(),
                  );
                  final repo = ref.read(productRepositoryProvider);
                  final result = await repo.addReview(review);
                  result.when(
                    success: (_) {
                      ref.invalidate(productReviewsProvider(widget.products.first.id));
                      Navigator.of(sheetCtx).pop();
                      ScaffoldMessenger.of(ctx).showSnackBar(SnackBar(
                        content: Text(context.l10n?.reviewSubmitted ?? 'Review submitted! ⭐',
                            style: GoogleFonts.plusJakartaSans(fontSize: 13)),
                        behavior: SnackBarBehavior.floating));
                    },
                    failure: (e) {
                      ScaffoldMessenger.of(ctx).showSnackBar(SnackBar(
                        content: Text(context.l10n?.failedToSubmit('$e') ?? 'Failed to submit: $e'),
                        behavior: SnackBarBehavior.floating));
                    },
                  );
                },
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  decoration: BoxDecoration(
                    gradient: _accentGradient,
                    borderRadius: BorderRadius.circular(14)),
                  child: Center(child: Text(context.l10n?.submitReview ?? 'Submit Review',
                      style: GoogleFonts.plusJakartaSans(fontSize: 15,
                          fontWeight: FontWeight.w700, color: Colors.white))),
                ),
              ),
            ]),
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

// ─── Tab Bar Delegate ─────────────────────────────────────────────────────────

class _TabBarDelegate extends SliverPersistentHeaderDelegate {
  final TabBar tabBar;
  _TabBarDelegate(this.tabBar);

  @override
  double get minExtent => tabBar.preferredSize.height + 16;
  @override
  double get maxExtent => tabBar.preferredSize.height + 16;

  @override
  Widget build(BuildContext context, double shrinkOffset,
      bool overlapsContent) {
    return Container(
      color: context.backgroundColor,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Container(
        decoration: BoxDecoration(
          color: context.dividerColor,
          borderRadius: BorderRadius.circular(16),
        ),
        child: tabBar,
      ),
    );
  }

  @override
  bool shouldRebuild(_TabBarDelegate oldDelegate) => false;
}

class _ProductChipHeaderDelegate extends SliverPersistentHeaderDelegate {
  final List<ProductEntity> products;
  _ProductChipHeaderDelegate(this.products);

  static const _chipColors = [
    AppTheme.brandBlue,
    AppTheme.scoreAverage,
    AppTheme.premiumPurpleLight,
    AppTheme.scoreExcellent,
  ];

  @override
  double get minExtent => 44;
  @override
  double get maxExtent => 44;

  @override
  Widget build(BuildContext context, double shrinkOffset, bool overlapsContent) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      color: context.backgroundColor,
      height: 44,
      child: Row(
        children: products.asMap().entries.map((entry) {
          final idx = entry.key;
          final product = entry.value;
          final chipColor = _chipColors[idx % 4];
          final name = product.name.length > 12
              ? '${product.name.substring(0, 12)}…'
              : product.name;
          return Expanded(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (idx > 0)
                  Container(
                    width: 1,
                    color: context.dividerColor,
                  ),
                Expanded(
                  child: Container(
                    color: chipColor.withValues(alpha: isDark ? 0.08 : 0.05),
                    alignment: Alignment.center,
                    padding: const EdgeInsets.symmetric(horizontal: 6),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Flexible(
                          child: Text(
                            name,
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: chipColor,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        if (product.techScore > 0) ...[
                          const SizedBox(width: 4),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                            decoration: BoxDecoration(
                              color: chipColor.withValues(alpha: 0.2),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: Text(
                              product.techScore.toInt().toString(),
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 10,
                                fontWeight: FontWeight.w700,
                                color: chipColor,
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              ],
            ),
          );
        }).toList(),
      ),
    );
  }

  @override
  bool shouldRebuild(_ProductChipHeaderDelegate oldDelegate) =>
      oldDelegate.products != products;
}

// ─── In-App YouTube Comparison Videos (uses YouTubeService) ───