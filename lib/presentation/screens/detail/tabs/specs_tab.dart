part of '../product_detail_screen.dart';

// ═══════════════════════════════════════════════════════════
// SPECS CARD (grouped)
// ═══════════════════════════════════════════════════════════

class _SpecsCard extends StatefulWidget {
  final Map<String, dynamic> specs;
  final Color cardBg;
  final bool isDark;
  const _SpecsCard({
    required this.specs,
    required this.cardBg,
    required this.isDark,
  });

  @override
  State<_SpecsCard> createState() => _SpecsCardState();
}

class _SpecsCardState extends State<_SpecsCard> {
  late Map<String, dynamic> _sortedSpecs;

  // Icons per spec group — kept for older spec layouts.
  // ignore: unused_element
  IconData _getGroupIcon(String groupKey) {
    final k = groupKey.toLowerCase().replaceAll('_', ' ');
    if (k.contains('general') || k.contains('information')) {
      return Icons.info_outline;
    }
    if (k.contains('display') || k.contains('screen') || k.contains('ekran')) {
      return Icons.phone_android;
    }
    if (k.contains('processor') ||
        k.contains('cpu') ||
        k.contains('performance')) {
      return Icons.memory;
    }
    if (k.contains('graphic') ||
        k.contains('gpu') ||
        k.contains('video card')) {
      return Icons.videogame_asset_outlined;
    }
    if (k.contains('memory') || k.contains('ram')) return Icons.memory_outlined;
    if (k.contains('storage') ||
        k.contains('disk') ||
        k.contains('optical') ||
        k.contains('ssd') ||
        k.contains('hdd')) {
      return Icons.storage_outlined;
    }
    if (k.contains('battery') || k.contains('power')) {
      return Icons.battery_charging_full_outlined;
    }
    if (k.contains('camera') || k.contains('photo')) {
      return Icons.camera_alt_outlined;
    }
    if (k.contains('connect') ||
        k.contains('network') ||
        k.contains('wifi') ||
        k.contains('bluetooth')) {
      return Icons.wifi;
    }
    if (k.contains('port') ||
        k.contains('slot') ||
        k.contains('interface') ||
        k.contains('usb') ||
        k.contains('expansion')) {
      return Icons.usb_outlined;
    }
    if (k.contains('audio') || k.contains('sound') || k.contains('speaker')) {
      return Icons.headphones_outlined;
    }
    if (k.contains('design') ||
        k.contains('physical') ||
        k.contains('dimension') ||
        k.contains('build') ||
        k.contains('chassis')) {
      return Icons.design_services_outlined;
    }
    if (k.contains('software') || k.contains('os') || k.contains('operating')) {
      return Icons.apps_outlined;
    }
    if (k.contains('cooling') || k.contains('fan') || k.contains('thermal')) {
      return Icons.ac_unit_outlined;
    }
    if (k.contains('lighting') || k.contains('rgb') || k.contains('led')) {
      return Icons.lightbulb_outlined;
    }
    if (k.contains('document') ||
        k.contains('packaging') ||
        k.contains('warranty') ||
        k.contains('box')) {
      return Icons.description_outlined;
    }
    if (k.contains('function') || k.contains('feature')) {
      return Icons.build_outlined;
    }
    if (k.contains('security') || k.contains('sensor')) {
      return Icons.security_outlined;
    }
    if (k.contains('weight') || k.contains('material')) {
      return Icons.fitness_center_outlined;
    }
    if (k.contains('input') || k.contains('keyboard')) {
      return Icons.keyboard_outlined;
    }
    return Icons.tune;
  }

  // ignore: unused_element
  Color _getGroupColor(String groupKey) {
    final k = groupKey.toLowerCase().replaceAll('_', ' ');
    if (k.contains('general') || k.contains('information')) {
      return const Color(0xFF5C6BC0);
    }
    if (k.contains('display') || k.contains('screen')) {
      return const Color(0xFF2196F3);
    }
    if (k.contains('processor') ||
        k.contains('cpu') ||
        k.contains('performance')) {
      return const Color(0xFFFF5722);
    }
    if (k.contains('graphic') || k.contains('gpu')) {
      return const Color(0xFFE91E63);
    }
    if (k.contains('memory') || k.contains('ram')) {
      return const Color(0xFF3F51B5);
    }
    if (k.contains('storage') || k.contains('disk') || k.contains('optical')) {
      return const Color(0xFF607D8B);
    }
    if (k.contains('battery') || k.contains('power')) {
      return const Color(0xFF4CAF50);
    }
    if (k.contains('camera')) return const Color(0xFF9C27B0);
    if (k.contains('connect') || k.contains('network')) {
      return const Color(0xFF00BCD4);
    }
    if (k.contains('port') || k.contains('slot') || k.contains('expansion')) {
      return const Color(0xFF42A5F5);
    }
    if (k.contains('audio') || k.contains('sound')) {
      return const Color(0xFFE91E63);
    }
    if (k.contains('design') ||
        k.contains('physical') ||
        k.contains('dimension') ||
        k.contains('chassis')) {
      return const Color(0xFF795548);
    }
    if (k.contains('software') || k.contains('os')) {
      return const Color(0xFF7E57C2);
    }
    if (k.contains('cooling') || k.contains('fan')) {
      return const Color(0xFF29B6F6);
    }
    if (k.contains('lighting') || k.contains('rgb')) {
      return const Color(0xFFFFC107);
    }
    if (k.contains('document') ||
        k.contains('packaging') ||
        k.contains('warranty')) {
      return const Color(0xFF78909C);
    }
    if (k.contains('function') || k.contains('feature')) {
      return const Color(0xFFAB47BC);
    }
    if (k.contains('security') || k.contains('sensor')) {
      return const Color(0xFFEC407A);
    }
    return const Color(0xFF9E9E9E);
  }

  @override
  void initState() {
    super.initState();
    _sortedSpecs = _sortSpecs(widget.specs);
  }

  @override
  void didUpdateWidget(covariant _SpecsCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (identical(oldWidget.specs, widget.specs)) return;
    _sortedSpecs = _sortSpecs(widget.specs);
  }

  Map<String, dynamic> _sortSpecs(Map<String, dynamic> specs) {
    final sortedEntries = specs.entries.toList()
      ..sort(
        (a, b) => _sectionPriority(a.key).compareTo(_sectionPriority(b.key)),
      );
    return Map.fromEntries(sortedEntries);
  }

  /// Converts a spec value to displayable string.
  /// Handles Lists (newline-joined) and scalars safely.
  static String _specValToString(dynamic val) {
    if (val is List) {
      return val
          .whereType<Object>()
          .map((e) => _sanitizeSpec(e.toString()))
          .where((s) => s.isNotEmpty)
          .join('\n');
    }
    return _sanitizeSpec(val?.toString() ?? '');
  }

  /// Repairs known NLLB-200 hallucinations on stored spec strings.
  /// The TR→EN run mistranslates short technical fragments — most visibly
  /// "İnç ." → "I 'm not ." / "I 'm note ." — and the Turkish source has
  /// already been overwritten in the DB, so the only display-time recovery
  /// is to rewrite the well-known bad outputs to plausible English.
  static String _sanitizeSpec(String raw) {
    var s = raw.replaceAll('\r\n', '\n').replaceAll('\r', '\n').trim();
    if (s.isEmpty) return s;
    // Inches: "6.5 I 'm not .", "6.5 I 'm note ."
    s = s.replaceAll(
      RegExp(r"\s*I\s*'?\s*m\s+not(?:e)?\s*\.?", caseSensitive: false),
      ' inch',
    );
    // Preserve admin-style newline-separated feature lists. Collapsing all
    // whitespace here turns "Display features" into one unreadable paragraph.
    return s
        .split('\n')
        .map((line) => line.replaceAll(RegExp(r'[ \t\f\v]+'), ' ').trim())
        .where((line) => line.isNotEmpty)
        .join('\n');
  }

  static bool _isBlankSpecValue(String value) {
    final trimmed = value.trim();
    return trimmed.isEmpty ||
        trimmed == '?' ||
        trimmed == 'null' ||
        trimmed == '{}' ||
        trimmed == '[]';
  }

  static String _formatKey(String key) {
    const acronyms = {
      'USB', 'HDMI', 'NFC', 'GPS', 'RAM', 'ROM', 'SSD', 'HDD', 'CPU', 'GPU',
      'VRAM', 'HDR', 'UHD', 'FHD', 'QHD', 'LCD', 'LED', 'OLED', 'IPS', 'TN',
      'VA', 'TDP', 'OS', 'LTE', 'UFS', 'SD', 'MIL', 'STD', 'VPN', 'PCIe',
      'NVMe', 'AI', 'API', 'BIOS', 'UEFI', 'VGA', 'DVI', 'DP', 'MIMO',
      'SIM', 'OIS', 'EIS', 'AF', 'OTG', 'IR', 'TPM', 'DC', 'AC',
      // common 2-letter
      'GB', 'TB', 'MB', 'GHz', 'MHz', 'Hz', 'WH', 'WA', 'UW',
    };

    String processWord(String w) {
      if (w.isEmpty) return '';
      // Split on hyphens to handle "type-c" → "Type-C", "wi-fi" → "Wi-Fi"
      if (w.contains('-')) {
        return w.split('-').map(processWord).join('-');
      }
      final upper = w.toUpperCase();
      if (acronyms.contains(upper)) return upper;
      return w[0].toUpperCase() + w.substring(1).toLowerCase();
    }

    return key.replaceAll('_', ' ').split(' ').map(processWord).join(' ');
  }

  /// Capitalize each word in a string (title case).
  String _titleCase(String s) {
    if (s.isEmpty) return s;
    return s
        .split(' ')
        .map((w) {
          if (w.isEmpty) return w;
          return w[0].toUpperCase() + w.substring(1);
        })
        .join(' ');
  }

  // ignore: unused_element
  String _localizedGroupName(BuildContext context, String key) {
    final l = context.l10n;
    if (l == null) return _formatKey(key);
    final k = key.toLowerCase().replaceAll('_', ' ').trim();
    final map = <String, String>{
      'general features': l.specGroupGeneral,
      'general': l.specGroupGeneral,
      'design & dimensions': l.specGroupDesign,
      'design': l.specGroupDesign,
      'dimensions': l.specGroupDesign,
      'basic hardware': l.specGroupHardware,
      'hardware': l.specGroupHardware,
      'camera': l.specGroupCamera,
      'battery': l.specGroupBattery,
      'network connections': l.specGroupNetwork,
      'network': l.specGroupNetwork,
      'display': l.specGroupDisplay,
      'storage': l.specGroupStorage,
      'connectivity': l.specGroupConnectivity,
      'software': l.specGroupSoftware,
      'audio': l.specGroupAudio,
      'security': l.specGroupSecurity,
      'performance': l.specGroupPerformance,
      'sensors': l.specGroupSensors,
      'features': l.specGroupFeatures,
      'processor': l.specGroupProcessor,
      'memory': l.specGroupMemory,
      'ports & interfaces': l.specGroupPorts,
      'ports': l.specGroupPorts,
      'graphics card': l.specGroupGpu,
      'gpu': l.specGroupGpu,
      'keyboard': l.specGroupKeyboard,
      'other': l.specGroupOther,
      'weight & dimensions': l.specGroupWeight,
      'weight': l.specGroupWeight,
      'screen': l.specGroupScreen,
      'video': l.specGroupVideo,
      'image': l.specGroupImage,
      'charging': l.specGroupCharging,
      'wireless': l.specGroupWireless,
      // Additional group names
      'storage & optical drive': l.specGroupStorageOptical,
      'battery & other': l.specGroupBatteryOther,
      'integrated graphics': l.specGroupIntegratedGpu,
      'external graphics': l.specGroupExternalGpu,
      'connection & interface': l.specGroupConnectionInterface,
      'connections & interfaces': l.specGroupConnectionInterface,
      'connection & interfaces': l.specGroupConnectionInterface,
      'body': l.specGroupBody,
      'main features': l.specGroupMainFeatures,
      'multimedia': l.specGroupMultimedia,
      'power': l.specGroupPower,
      'input/output': l.specGroupInputOutput,
      'input / output': l.specGroupInputOutput,
      'communications': l.specGroupCommunications,
      'expansion': l.specGroupExpansion,
      'expansion slots': l.specGroupExpansion,
      'operating system & software': l.specGroupSoftware,
      'sound': l.specGroupAudio,
      'optics': l.specGroupOptics,
      'lens': l.specGroupOptics,
      'physical durability': l.specGroupDurability,
      'durability': l.specGroupDurability,
      'screen&viewfinder': l.specGroupScreenViewfinder,
      'screen & viewfinder': l.specGroupScreenViewfinder,
      'viewfinder': l.specGroupScreenViewfinder,
      'exposure & shooting': l.specGroupExposureShooting,
      'exposure': l.specGroupExposureShooting,
      'shooting': l.specGroupExposureShooting,
      'flash': l.specGroupFlash,
      'other information': l.specGroupOtherInfo,
      'information': l.specGroupOtherInfo,
      'recording': l.specGroupRecording,
      'focus': l.specGroupFocus,
      'autofocus': l.specGroupFocus,
      // Mixed Turkish/English from scraper
      'diğer information': l.specGroupOtherInfo,
      'diğer bilgiler': l.specGroupOtherInfo,
      'diğer': l.specGroupOtherInfo,
      // Actual Firestore group names from products
      'general information': l.specGroupGeneral,
      'basic information': l.specGroupGeneral,
      'basic features': l.specGroupGeneral,
      'display/audio': l.specGroupDisplayAudio,
      'hardware/software': l.specGroupHardwareSoftware,
      'connections': l.specGroupConnections,
      'receivers': l.specGroupReceivers,
      'multimedia features': l.specGroupMultimedia,
      'energy and design': l.specGroupEnergyDesign,
      'dimensions & weight': l.specGroupDimensionsWeight,
      'documentation/software': l.specGroupSoftware,
      'memory features': l.specGroupMemory,
      'memory (ram) features': l.specGroupMemory,
      'technological infrastructure': l.specGroupTechInfra,
      'power and connections': l.specGroupPowerConnections,
      'wireless connections': l.specGroupWireless,
      'other connections': l.specGroupOtherConnections,
      'operating system': l.specGroupSoftware,
      'sensor': l.specGroupSensors,
      'storage features': l.specGroupStorage,
      'storage & battery': l.specGroupStorageBattery,
      'rear connections': l.specGroupRearConnections,
      'audio features': l.specGroupAudio,
      'cooling features': l.specGroupCooling,
      'neural processing unit (npu)': l.specGroupNpu,
      'npu': l.specGroupNpu,
      'technical information': l.specGroupTechnical,
      'eu product registration and energy label': l.specGroupEuLabel,
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
    final locale = Localizations.localeOf(context).languageCode;
    final svc = SpecTranslationService.instance;
    final canonicalKey = svc.isLoaded ? svc.canonicalizeToEnglish(k) : k;
    // Try exact match
    final exact = map[k] ?? map[canonicalKey];
    if (exact != null) return exact;
    if (svc.isLoaded) {
      final translated = svc.translateLabelForLocale(key, locale);
      if (translated.toLowerCase() != canonicalKey.toLowerCase()) {
        return _titleCase(translated);
      }
    }
    if (locale != 'en') {
      final translated = spec_dict.translateSpec(canonicalKey, locale);
      if (translated.toLowerCase() != canonicalKey.toLowerCase()) {
        return _titleCase(translated);
      }
    }
    return _formatKey(canonicalKey);
  }

  /// Translate a spec name to the user's language.
  /// Uses exact-match first, then word-level dictionary fallback.
  // ignore: unused_element
  String _localizedSpecName(BuildContext context, String key) {
    final l = context.l10n;
    if (l == null) return _formatKey(key);
    final k = key.toLowerCase().replaceAll('_', ' ').trim();
    final map = <String, String>{
      'display size': l.specDisplaySize,
      'screen size': l.specScreenSize,
      'screen technology': l.specScreenTechnology,
      'resolution': l.specResolution,
      'refresh rate': l.specRefreshRate,
      'brightness': l.specBrightness,
      'processor': l.specProcessor,
      'chipset': l.specChipset,
      'cpu': l.specCpu,
      'ram': l.specRam,
      'internal storage': l.specInternalStorage,
      'storage': l.specStorage,
      'expandable storage': l.specExpandableStorage,
      'battery capacity': l.specBatteryCapacity,
      'charging speed': l.specChargingSpeed,
      'wireless charging': l.specWirelessCharging,
      'operating system': l.specOperatingSystem,
      'os': l.specOs,
      'weight': l.specWeight,
      'dimensions': l.specDimensions,
      'thickness': l.specThickness,
      'height': l.specHeight,
      'width': l.specWidth,
      'main camera': l.specMainCamera,
      'front camera': l.specFrontCamera,
      'rear camera': l.specRearCamera,
      'video recording': l.specVideoRecording,
      'sim': l.specSim,
      'dual sim': l.specDualSim,
      'nfc': l.specNfc,
      'bluetooth': l.specBluetooth,
      'wi-fi': l.specWifi,
      'wifi': l.specWifi,
      'usb': l.specUsb,
      'headphone jack': l.specHeadphoneJack,
      'water resistance': l.specWaterResistance,
      'ip rating': l.specIpRating,
      'fingerprint sensor': l.specFingerprintSensor,
      'face recognition': l.specFaceRecognition,
      'color': l.specColor,
      'colors': l.specColors,
      'gpu': l.specGpu,
      'graphics': l.specGraphics,
      'release date': l.specReleaseDate,
      'price': l.specPrice,
      'network': l.specNetwork,
      '5g': l.spec5g,
      '4g / lte': l.spec4g,
      '4g': l.spec4g,
      'lte': l.spec4g,
      'frequency bands': l.specBand,
      'speaker': l.specSpeaker,
      'microphone': l.specMicrophone,
      'sensors': l.specSensor,
      'gyroscope': l.specGyroscope,
      'accelerometer': l.specAccelerometer,
      'proximity': l.specProximity,
      'compass': l.specCompass,
      'barometer': l.specBarometer,
      'gps': l.specGps,
      'memory type': l.specMemoryType,
      'memory speed': l.specMemorySpeed,
      'storage type': l.specStorageType,
      'display type': l.specDisplayType,
      'panel type': l.specPanelType,
      'response time': l.specResponseTime,
      'contrast ratio': l.specContrastRatio,
      'color gamut': l.specColorGamut,
      'hdr': l.specHdr,
      'touchscreen': l.specTouchscreen,
      'keyboard': l.specKeyboard,
      'trackpad': l.specTrackpad,
      'webcam': l.specWebcam,
      'ports': l.specPorts,
      'connectivity': l.specConnectivity,
      'wireless': l.specWireless,
      'battery life': l.specBatteryLife,
      'power supply': l.specPowerSupply,
      'tdp': l.specTdp,
      'cores': l.specCores,
      'threads': l.specThreads,
      'base clock': l.specBaseClock,
      'boost clock': l.specBoostClock,
      'cache': l.specCache,
      'architecture': l.specArchitecture,
      'process': l.specProcess,
      'vram': l.specVram,
      'memory bus': l.specMemoryBus,
      'cuda cores': l.specCudaCores,
      'stream processors': l.specStreamProcessors,
      'clock speed': l.specClockSpeed,
      'max resolution': l.specMaxResolution,
      'form factor': l.specFormFactor,
      'noise level': l.specNoiseLevel,
      'driver size': l.specDriverSize,
      'frequency response': l.specFrequencyResponse,
      'impedance': l.specImpedance,
      'active noise cancellation': l.specActiveNoiseCancellation,
      'microphone type': l.specMicrophoneType,
      'connection type': l.specConnectionType,
      'wireless range': l.specWirelessRange,
      'smart assistant': l.specSmartAssistant,
      'model': l.specModel,
      'brand': l.specBrand,
      'series': l.specSeries,
      'year': l.specYear,
      'warranty': l.specWarranty,
      // Group names as fallback
      'display': l.specGroupDisplay,
      'battery': l.specGroupBattery,
      'camera': l.specGroupCamera,
      'audio': l.specGroupAudio,
      'security': l.specGroupSecurity,
      'performance': l.specGroupPerformance,
      'memory': l.specGroupMemory,
      'software': l.specGroupSoftware,
    };
    final locale = Localizations.localeOf(context).languageCode;
    final svc = SpecTranslationService.instance;
    final canonicalKey = svc.isLoaded ? svc.canonicalizeToEnglish(k) : k;
    // 1. Try exact match (fast path)
    final exact = map[k] ?? map[canonicalKey];
    if (exact != null) return exact;
    if (svc.isLoaded) {
      final translated = svc.translateLabelForLocale(key, locale);
      if (translated.toLowerCase() != canonicalKey.toLowerCase()) {
        return _titleCase(translated);
      }
    }
    if (locale != 'en') {
      final translated = spec_dict.translateSpec(canonicalKey, locale);
      if (translated.toLowerCase() != canonicalKey.toLowerCase()) {
        return _titleCase(translated);
      }
    }
    return _formatKey(canonicalKey);
  }

  int _sectionPriority(String key) {
    final k = key.toLowerCase().replaceAll('_', ' ');

    if (k.contains('öne çıkan') || k.contains('one cikan')) return 0;

    if (k.contains('display') ||
        k.contains('ekran') ||
        k.contains('screen') ||
        k.contains('monitor') ||
        k.contains('panel')) {
      return 1;
    }

    if (k.contains('battery') ||
        k.contains('batarya') ||
        k.contains('pil') ||
        k.contains('power') ||
        k.contains('güç') ||
        k.contains('guc') ||
        k.contains('charging') ||
        k.contains('şarj') ||
        k.contains('sarj') ||
        k.contains('endurance')) {
      return 2;
    }

    if (k.contains('camera') ||
        k.contains('kamera') ||
        k.contains('photo') ||
        k.contains('imaging') ||
        k.contains('optic')) {
      return 3;
    }

    // 1. BASIC INFO — Answers "What is this?", establishes context
    if (k.contains('basic info') ||
        k.contains('general info') ||
        k.contains('information') ||
        k.contains('temel bilgi') ||
        k.contains('genel bilgi') ||
        k.contains('release') ||
        k.contains('general') ||
        k.contains('overview')) {
      return 4;
    }

    // 2. DESIGN — First visual impression; what the user feels when seeing the product
    if (k.contains('design') ||
        k.contains('tasarım') ||
        k.contains('tasarim') ||
        k.contains('physical') ||
        k.contains('dimension') ||
        k.contains('boyut') ||
        k.contains('ağırlık') ||
        k.contains('agirlik') ||
        k.contains('build') ||
        k.contains('chassis') ||
        k.contains('weight') ||
        k.contains('material') ||
        k.contains('color')) {
      return 5;
    }

    // 4. PERFORMANCE / PROCESSOR — "How fast is it?" — Most frequently asked
    if (k.contains('basic hard') ||
        k.contains('temel donan') ||
        k.contains('processor') ||
        k.contains('işlemci') ||
        k.contains('islemci') ||
        k.contains('cpu') ||
        k.contains('chipset') ||
        k.contains('yonga') ||
        k.contains('performance') ||
        k.contains('computing')) {
      return 6;
    }

    // 5. MEMORY / RAM — Extension of performance
    if (k.contains('memory') || k.contains('bellek') || k.contains('ram')) {
      return 7;
    }

    // 6. STORAGE — Capacity
    if (k.contains('storage') ||
        k.contains('depolama') ||
        k.contains('disk') ||
        k.contains('ssd') ||
        k.contains('hdd') ||
        k.contains('optical') ||
        k.contains('flash')) {
      return 8;
    }

    // 9. GPU / GRAPHICS — Gaming and visual performance
    if (k.contains('graphic') ||
        k.contains('grafik') ||
        k.contains('gpu') ||
        k.contains('video card') ||
        k.contains('vga')) {
      return 9;
    }

    // 10. NETWORK / CELLULAR — Connectivity (4G/5G matters)
    if (k.contains('network') ||
        k.contains('ağ') ||
        k.contains('ag ') ||
        k.contains('bağlantı') ||
        k.contains('baglanti') ||
        k.contains('cellular') ||
        k.contains('sim') ||
        k.contains('lte') ||
        k.contains('5g') ||
        k.contains('connect') && !k.contains('wireless')) {
      return 10;
    }

    // 11. WIRELESS — WiFi, BT, NFC
    if (k.contains('wireless') ||
        k.contains('kablosuz') ||
        k.contains('wifi') ||
        k.contains('bluetooth') ||
        k.contains('nfc') ||
        k.contains('gps') ||
        k.contains('navigation')) {
      return 11;
    }

    // 12. OS / SOFTWARE — Ecosystem and platform
    if (k.contains('operating') ||
        k.contains('işletim') ||
        k.contains('isletim') ||
        k.contains('software') ||
        k.contains('yazılım') ||
        k.contains('yazilim') ||
        k.contains(' os') ||
        k.contains('system')) {
      return 12;
    }

    // 13. AUDIO / MULTIMEDIA — Media consumption
    if (k.contains('audio') ||
        k.contains('ses') ||
        k.contains('sound') ||
        k.contains('speaker') ||
        k.contains('çoklu ortam') ||
        k.contains('coklu ortam') ||
        k.contains('multimedia') ||
        k.contains('music')) {
      return 13;
    }

    // 14. FEATURES / SECURITY / SENSORS — Additional features
    if (k.contains('feature') ||
        k.contains('özellik') ||
        k.contains('ozellik') ||
        k.contains('function') ||
        k.contains('security') ||
        k.contains('güvenlik') ||
        k.contains('guvenlik') ||
        k.contains('sensor') ||
        k.contains('sensör') ||
        k.contains('sensor') ||
        k.contains('biometric') ||
        k.contains('fingerprint')) {
      return 14;
    }

    // 15. PORTS / CONNECTIONS — Physical connections
    if (k.contains('port') ||
        k.contains('slot') ||
        k.contains('usb') ||
        k.contains('interface') ||
        k.contains('expansion') ||
        k.contains('diğer bağlantı') ||
        k.contains('diger baglanti') ||
        k.contains('other connection') ||
        k.contains('connector')) {
      return 15;
    }

    // 16. COOLING — Desktop/Laptop specific
    if (k.contains('cooling') ||
        k.contains('fan') ||
        k.contains('thermal') ||
        k.contains('heat')) {
      return 16;
    }

    // 17. INPUT — Keyboard, mouse
    if (k.contains('input') ||
        k.contains('keyboard') ||
        k.contains('mouse') ||
        k.contains('touchpad')) {
      return 17;
    }

    // 18. PACKAGING / WARRANTY — Box contents, warranty
    if (k.contains('document') ||
        k.contains('packaging') ||
        k.contains('warranty') ||
        k.contains('box') ||
        k.contains('contents') ||
        k.contains('lighting') ||
        k.contains('rgb') ||
        k.contains('led')) {
      return 18;
    }

    return 99;
  }

  @override
  Widget build(BuildContext context) {
    final specs = _sortedSpecs;
    final sections = <MapEntry<String, List<_SpecPair>>>[];

    for (final entry in specs.entries) {
      final groupKey = entry.key;
      final value = entry.value;

      if (value is Map && value.isNotEmpty) {
        var rowIdx = 0;
        final rows = value.entries
            .expand<_SpecPair>((sub) {
              final subVal = sub.value;
              if (subVal is Map && subVal.isNotEmpty) {
                return subVal.entries.map((inner) {
                  return _SpecPair(
                    label: inner.key.toString(),
                    value: _specValToString(inner.value),
                    isOdd: rowIdx++ % 2 == 1,
                  );
                });
              }
              return [
                _SpecPair(
                  label: sub.key.toString(),
                  value: _specValToString(subVal),
                  isOdd: rowIdx++ % 2 == 1,
                ),
              ];
            })
            .where((row) => !_isBlankSpecValue(row.value))
            .toList(growable: false);

        if (rows.isNotEmpty) sections.add(MapEntry(groupKey, rows));
        continue;
      }

      final flatValue = _specValToString(value);
      if (!_isBlankSpecValue(flatValue)) {
        sections.add(
          MapEntry(context.l10n?.specs ?? 'Specifications', [
            _SpecPair(label: groupKey, value: flatValue, isOdd: false),
          ]),
        );
      }
    }

    if (sections.isEmpty) return const SizedBox.shrink();

    return Container(
      margin: const EdgeInsets.only(top: 14),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Theme.of(
          context,
        ).colorScheme.surfaceContainerHighest.withValues(alpha: 0.4),
        border: Border.all(color: context.dividerColor),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _SpecsTableHeader(title: context.l10n?.specs ?? 'Specifications'),
          const SizedBox(height: 12),
          for (var i = 0; i < sections.length; i++) ...[
            if (i > 0) const SizedBox(height: 14),
            _SpecSectionLabel(title: sections[i].key),
            const SizedBox(height: 8),
            ...sections[i].value.map(
              (row) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: _SpecRow(
                  label: row.label,
                  value: row.value,
                  isOdd: row.isOdd,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _SpecPair {
  final String label;
  final String value;
  final bool isOdd;

  const _SpecPair({
    required this.label,
    required this.value,
    required this.isOdd,
  });
}

class _SpecsTableHeader extends StatelessWidget {
  final String title;

  const _SpecsTableHeader({required this.title});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      children: [
        Icon(
          Icons.auto_awesome_rounded,
          size: 16,
          color: theme.colorScheme.primary,
        ),
        const SizedBox(width: 6),
        Text(
          title,
          style: GoogleFonts.plusJakartaSans(
            color: theme.colorScheme.onSurface,
            fontSize: 14,
            height: 1.2,
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
    );
  }
}

class _SpecSectionLabel extends StatelessWidget {
  final String title;

  const _SpecSectionLabel({required this.title});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      children: [
        Container(
          width: 4,
          height: 18,
          decoration: BoxDecoration(
            color: theme.colorScheme.primary,
            borderRadius: BorderRadius.circular(99),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            title,
            style: GoogleFonts.plusJakartaSans(
              color: theme.colorScheme.primary,
              fontSize: 12,
              height: 1.2,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.2,
            ),
          ),
        ),
      ],
    );
  }
}

class _SpecRow extends StatelessWidget {
  final String label, value;
  final bool isOdd;
  const _SpecRow({
    required this.label,
    required this.value,
    this.isOdd = false,
  });

  /// Capitalize first letter of each word but preserve acronyms (USB, HDMI...).
  // ignore: unused_element
  static String _applyValueTitleCase(String s) {
    if (s.isEmpty) return s;
    return s
        .split(' ')
        .map((w) {
          if (w.isEmpty) return w;
          // Numbers and technical codes (start with digit): leave as is
          if (RegExp(r'^[\d\W]').hasMatch(w)) return w;
          return w[0].toUpperCase() + w.substring(1);
        })
        .join(' ');
  }

  /// Every spec in a box must start with a capital letter (admin parity).
  /// Capitalizes the first alphabetic character, while leaving values that
  /// begin with a number/symbol untouched and preserving deliberate
  /// lowercase brand/unit casing (iPhone, iOS, eSIM, eMMC, mAh, µ…).
  static String _capitalizeLeadingLetter(String s) {
    for (var i = 0; i < s.length; i++) {
      final ch = s[i];
      if (RegExp(r'[\s•\-–·*]').hasMatch(ch)) continue;
      final rest = s.substring(i);
      if (RegExp(r'^(i[A-Z]|e[A-Z]|mAh|µ)').hasMatch(rest)) return s;
      final isLetter = ch.toLowerCase() != ch.toUpperCase();
      if (!isLetter) return s;
      if (ch == ch.toUpperCase()) return s;
      return s.substring(0, i) + ch.toUpperCase() + s.substring(i + 1);
    }
    return s;
  }

  static bool _isConnectorWord(String word) {
    const connectors = {
      'and',
      'or',
      'with',
      'for',
      'to',
      've',
      'ile',
      'veya',
      'the',
      'a',
      'an',
      'of',
      '&',
    };
    return connectors.contains(word.toLowerCase());
  }

  static String _foldSpecLabel(String text) {
    return text
        .toLowerCase()
        .replaceAll('ı', 'i')
        .replaceAll('ğ', 'g')
        .replaceAll('ü', 'u')
        .replaceAll('ş', 's')
        .replaceAll('ö', 'o')
        .replaceAll('ç', 'c')
        .replaceAll('İ', 'i')
        .replaceAll('Ğ', 'g')
        .replaceAll('Ü', 'u')
        .replaceAll('Ş', 's')
        .replaceAll('Ö', 'o')
        .replaceAll('Ç', 'c')
        .replaceAll(RegExp(r'[^a-z0-9]+'), ' ')
        .trim();
  }

  // ignore: unused_element
  static String _adminLikeSpecLabel(
    String rawLabel,
    String translatedLabel,
    String locale,
  ) {
    if (locale.toLowerCase() == 'tr') return translatedLabel;
    const exact = <String, String>{
      'ekran ozellikleri': 'Display features',
      'navigasyon ozellikleri': 'Navigation features',
      'kablosuz baglanti ozellikleri': 'Wireless features',
      'kablosuz baglantilar ozellikleri': 'Wireless features',
      'kamera ozellikleri': 'Camera features',
      'on kamera ozellikleri': 'Front camera features',
      'arka kamera ozellikleri': 'Rear camera features',
      'batarya ozellikleri': 'Battery specifications',
      'sarj ozellikleri': 'Charging specifications',
      'ses ozellikleri': 'Audio features',
      'video kayit ozellikleri': 'Video recording features',
      'govde ozellikleri': 'Body features',
    };
    return exact[_foldSpecLabel(rawLabel)] ?? translatedLabel;
  }

  // ignore: unused_element
  static List<String> _chunkLongValue(String value) {
    final words = value
        .split(RegExp(r'\s+'))
        .map((w) => w.trim())
        .where((w) => w.isNotEmpty)
        .toList();
    if (words.length < 5) return [value];

    final chunks = <String>[];
    final current = <String>[];
    var currentLength = 0;

    for (final word in words) {
      final startsFeature =
          current.isNotEmpty &&
          current.length >= 2 &&
          RegExp(r'^[A-Z0-9ÇĞİÖŞÜ]').hasMatch(word) &&
          !_isConnectorWord(word) &&
          currentLength >= 18;

      if (startsFeature || currentLength >= 28) {
        chunks.add(current.join(' '));
        current
          ..clear()
          ..add(word);
        currentLength = word.length;
        continue;
      }

      current.add(word);
      currentLength += word.length + 1;
    }

    if (current.isNotEmpty) {
      chunks.add(current.join(' '));
    }

    return chunks.where((chunk) => chunk.trim().isNotEmpty).toList();
  }

  // ignore: unused_element
  static bool _looksLikePackedFeatureList(String value) {
    final words = value
        .split(RegExp(r'\s+'))
        .map((word) => word.trim())
        .where((word) => word.isNotEmpty)
        .toList();
    if (words.length < 6) return false;
    final featureLikeWords = words.where((word) {
      return RegExp(r'^[A-Z0-9ÇĞİÖŞÜ]').hasMatch(word) &&
          !_isConnectorWord(word);
    }).length;
    return featureLikeWords >= 4 &&
        !value.contains('.') &&
        !value.contains(':');
  }

  static List<String> _extractValueParts(String value) {
    List<String> splitTopLevel(String source) {
      final out = <String>[];
      var depth = 0;
      final buffer = StringBuffer();
      for (var i = 0; i < source.length; i++) {
        final ch = source[i];
        if (ch == '(' || ch == '[' || ch == '{') {
          depth++;
        } else if (ch == ')' || ch == ']' || ch == '}') {
          depth = dart_math.max(0, depth - 1);
        }
        if (depth == 0 && (ch == ',' || ch == ';')) {
          final prev = i > 0 ? source[i - 1] : '';
          final next = i + 1 < source.length ? source[i + 1] : '';
          if (RegExp(r'\d').hasMatch(prev) && RegExp(r'\d').hasMatch(next)) {
            buffer.write(ch);
            continue;
          }
          out.add(buffer.toString());
          buffer.clear();
        } else {
          buffer.write(ch);
        }
      }
      if (buffer.isNotEmpty) out.add(buffer.toString());
      return out;
    }

    final rawLines = <String>[];
    final normalized = value
        .replaceAll('\r', '\n')
        .replaceAll('•', '\n')
        .replaceAll('|', '\n');
    for (final line in normalized.split('\n')) {
      for (final part in splitTopLevel(line)) {
        final trimmed = part
            .trim()
            .replaceFirst(RegExp(r'^[-•\s]+'), '')
            .trim();
        if (trimmed.isNotEmpty) rawLines.add(trimmed);
      }
    }

    final lines = <String>[];
    for (var i = 0; i < rawLines.length; i++) {
      final line = rawLines[i];
      if (RegExp(r'^\d+x$', caseSensitive: false).hasMatch(line) &&
          i + 1 < rawLines.length) {
        lines.add('$line ${rawLines[++i]}');
      } else {
        lines.add(line);
      }
    }
    return lines.isEmpty ? [value.trim()] : lines;
  }

  // Values arrive already localized (admin parity) — render them verbatim.
  String _localizedValue(BuildContext context, String val) => val;

  static bool _isYesValue(String text) {
    return RegExp(
      r'^(yes|var|evet|true|ja|oui|sí|si|sim|tak)$',
      caseSensitive: false,
    ).hasMatch(text.trim());
  }

  static bool _isNoValue(String text) {
    return RegExp(
      r'^(no|yok|hayır|hayir|nein|non|não|nao|nie|false)$',
      caseSensitive: false,
    ).hasMatch(text.trim());
  }

  @override
  Widget build(BuildContext context) {
    final trimmed = value.trim();
    // Label is already localized to match the admin modal — only enforce the
    // leading-capital rule, no further translation.
    final displayLabel = _capitalizeLeadingLetter(label.trim());
    if (trimmed.isEmpty ||
        trimmed == '?' ||
        trimmed == 'null' ||
        trimmed == '{}' ||
        trimmed == '[]' ||
        (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
      return const SizedBox.shrink();
    }

    // Split FIRST (before any localization — normalize() collapses \n to spaces
    // which would destroy multi-value separators if we localized the whole string).
    final rawParts = _extractValueParts(trimmed);

    Widget valueWidget;
    if (_isYesValue(trimmed) || _isNoValue(trimmed)) {
      valueWidget = _buildValueText(context, _localizedValue(context, trimmed));
    } else if (rawParts.length >= 2) {
      valueWidget = _SpecValueList(
        parts: rawParts
            .map((part) => _localizedValue(context, part))
            .toList(growable: false),
      );
    } else {
      final localized = _localizedValue(context, trimmed);
      valueWidget = _buildValueText(context, localized);
    }

    final theme = Theme.of(context);
    final primary = theme.colorScheme.primary;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: theme.dividerColor.withValues(alpha: 0.5),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 30,
            height: 30,
            decoration: BoxDecoration(
              color: primary.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(
              SharedKeySpecsGrid.iconForSpec(displayLabel),
              size: 17,
              color: primary.withValues(alpha: 0.75),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  displayLabel,
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 11,
                    height: 1.25,
                    fontWeight: FontWeight.w500,
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.55),
                  ),
                ),
                const SizedBox(height: 4),
                valueWidget,
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildValueText(BuildContext context, String text) {
    final displayText = _capitalizeLeadingLetter(text.trim());
    final isYes = _isYesValue(displayText);
    final isNo = _isNoValue(displayText);
    if (isYes || isNo) {
      final color = isYes ? Theme.of(context).colorScheme.primary : AppTheme.error;
      return Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            isYes ? Icons.check_circle_rounded : Icons.cancel_rounded,
            size: 18,
            color: color,
          ),
          const SizedBox(width: 6),
          Flexible(
            child: Text(
              displayText,
              style: GoogleFonts.plusJakartaSans(
                fontSize: 12.5,
                height: 1.35,
                fontWeight: FontWeight.w700,
                color: color,
              ),
              softWrap: true,
            ),
          ),
        ],
      );
    }
    return Text(
      displayText,
      style: GoogleFonts.plusJakartaSans(
        fontSize: 12.5,
        height: 1.35,
        fontWeight: FontWeight.w700,
        color: Theme.of(context).colorScheme.onSurface,
      ),
      textAlign: TextAlign.left,
      softWrap: true,
      overflow: TextOverflow.visible,
    );
  }
}

class _SpecValueList extends StatelessWidget {
  final List<String> parts;

  const _SpecValueList({required this.parts});

  @override
  Widget build(BuildContext context) {
    final primary = Theme.of(context).colorScheme.primary;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: parts
          .map((part) {
            return Padding(
              padding: const EdgeInsets.only(top: 1, bottom: 1),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 3,
                    height: 3,
                    margin: const EdgeInsets.only(left: 4, top: 8, right: 7),
                    decoration: BoxDecoration(
                      color: primary,
                      shape: BoxShape.circle,
                    ),
                  ),
                  Expanded(
                    child: Text(
                      _SpecRow._capitalizeLeadingLetter(part),
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 12,
                        height: 1.35,
                        fontWeight: FontWeight.w600,
                        color: Theme.of(context).colorScheme.onSurface,
                      ),
                      softWrap: true,
                    ),
                  ),
                ],
              ),
            );
          })
          .toList(growable: false),
    );
  }
}

// ═══════════════════════════════════════════════════════════
// TAGS ROW
// ═══════════════════════════════════════════════════════════

class _TagsRow extends StatelessWidget {
  final List<String> tags;
  const _TagsRow({required this.tags});

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: tags
          .map(
            (t) => Chip(
              label: Text('#$t', style: const TextStyle(fontSize: 12)),
              backgroundColor: AppTheme.primaryBlue.withValues(alpha: 0.08),
              side: const BorderSide(color: Colors.transparent),
              padding: EdgeInsets.zero,
              materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
            ),
          )
          .toList(),
    );
  }
}

// ═══════════════════════════════════════════════════════════
// OVERVIEW TAB
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// KEY SPECS HIGHLIGHT — Category-specific quick overview
// ═══════════════════════════════════════════════════════════

class _KeySpecsHighlight extends StatelessWidget {
  final ProductEntity product;
  const _KeySpecsHighlight({required this.product});

  String? _find(List<String> keywords) {
    // First pass: product.specs (flat map)
    final specs = product.specs;
    for (final kw in keywords) {
      final kwLow = kw.toLowerCase();
      for (final entry in specs.entries) {
        if (entry.key.toLowerCase().contains(kwLow)) {
          final val = entry.value?.toString().trim() ?? '';
          if (val.isNotEmpty &&
              val != '0' &&
              val != '-' &&
              val.toLowerCase() != 'n/a') {
            return val;
          }
        }
      }
    }
    // Second pass: product.specSections (grouped map) for better coverage
    final sections = product.specSections;
    for (final kw in keywords) {
      final kwLow = kw.toLowerCase();
      for (final section in sections.values) {
        if (section is Map) {
          for (final entry in section.entries) {
            if (entry.key.toString().toLowerCase().contains(kwLow)) {
              final val = entry.value?.toString().trim() ?? '';
              if (val.isNotEmpty &&
                  val != '0' &&
                  val != '-' &&
                  val.toLowerCase() != 'n/a') {
                return val;
              }
            }
          }
        }
      }
    }
    return null;
  }

  List<(String, List<String>)> get _specDefs {
    final sub = product.subcategory.toLowerCase();

    if (sub.contains('smartphone') || sub.contains('phone')) {
      return [
        ('Screen Size', ['screen size', 'display size', 'ekran boyutu']),
        ('RAM', ['ram', 'memory size', 'bellek (ram)', 'bellek']),
        (
          'Storage',
          ['internal storage', 'storage capacity', 'dahili depolama'],
        ),
        ('Battery', ['battery capacity', 'batarya kapasitesi']),
        (
          'Main Camera',
          ['main camera', 'rear camera', 'camera resolution', 'kamera'],
        ),
        ('Front Camera', ['front camera', 'selfie camera', 'on kamera']),
        (
          'Processor',
          ['processor', 'chipset', 'cpu model', 'cpu name', 'islemci'],
        ),
        ('CPU Cores', ['cpu core', 'core count', 'number of core']),
        ('CPU Frequency', ['cpu frequenc', 'clock speed', 'cpu speed']),
        (
          'Screen Tech',
          ['screen tech', 'display tech', 'panel type', 'ekran teknolojisi'],
        ),
        (
          'Resolution',
          ['screen resolution', 'display resolution', 'ekran cozunurlugu'],
        ),
        ('Pixel Density', ['pixel density', 'ppi']),
        ('5G', ['5g']),
        ('NFC', ['nfc']),
        ('GPS', ['gps']),
        ('Bluetooth', ['bluetooth']),
        ('Fast Charge', ['fast charg', 'charging power', 'hizli sarj']),
        ('USB Type', ['usb type', 'usb connector', 'usb version']),
        (
          'Water Rating',
          ['water resist', 'ip rating', 'ipx', 'suya dayaniklilik'],
        ),
        ('Fingerprint', ['fingerprint', 'parmak izi']),
        ('OS', ['operating system', 'android version']),
        ('Weight', ['weight', 'agirlik']),
        ('SIM', ['sim count', 'hat sayisi', 'sim card']),
      ];
    }

    if (sub.contains('tablet')) {
      return [
        ('Screen Size', ['screen size', 'display size', 'ekran boyutu']),
        ('RAM', ['ram', 'memory size', 'bellek']),
        (
          'Storage',
          ['internal storage', 'storage capacity', 'dahili depolama'],
        ),
        ('Memory Card', ['memory card', 'microsd', 'expandable storage']),
        ('Battery', ['battery capacity', 'batarya kapasitesi']),
        ('Processor', ['processor', 'chipset', 'cpu model', 'islemci']),
        ('CPU Cores', ['cpu core', 'core count', 'number of core']),
        ('CPU Frequency', ['cpu frequenc', 'clock speed']),
        (
          'Screen Tech',
          ['screen tech', 'display tech', 'panel type', 'ekran teknolojisi'],
        ),
        ('Resolution', ['screen resolution', 'display resolution']),
        ('Pixel Density', ['pixel density', 'ppi']),
        ('Screen Area', ['screen area', 'display area', 'ekran alani']),
        ('WiFi', ['wifi', 'wi-fi', '802.11']),
        ('Bluetooth', ['bluetooth']),
        ('GPS', ['gps']),
        ('NFC', ['nfc']),
        ('USB Type', ['usb type', 'usb connector']),
        ('Weight', ['weight', 'agirlik']),
        ('OS', ['operating system']),
      ];
    }

    if (sub.contains('laptop') || sub.contains('notebook')) {
      return [
        (
          'Processor',
          ['processor model', 'cpu model', 'cpu name', 'islemci modeli'],
        ),
        ('Processor Gen', ['processor generation', 'cpu generation', 'nesil']),
        ('Base Freq', ['base frequenc', 'base clock', 'temel frekans']),
        ('CPU Cores', ['cpu core', 'core count', 'number of core']),
        ('TDP', ['tdp', 'thermal design power']),
        ('RAM', ['ram', 'memory size', 'bellek']),
        ('Storage', ['ssd', 'storage size', 'hard disk', 'nvme']),
        ('Screen Size', ['screen size', 'display size']),
        ('Screen Tech', ['screen tech', 'display tech', 'panel type']),
        ('Resolution', ['screen resolution', 'display resolution']),
        ('Refresh Rate', ['refresh rate', 'hz']),
        ('GPU', ['gpu', 'graphics card', 'video card', 'ekran karti']),
        ('Battery', ['battery capacity', 'batarya']),
        ('OS', ['operating system']),
        ('WiFi', ['wifi', 'wi-fi', '802.11']),
        ('Bluetooth', ['bluetooth']),
        ('USB Type', ['usb type', 'usb-c', 'thunderbolt']),
        ('Weight', ['weight', 'agirlik']),
      ];
    }

    if (sub.contains('desktop')) {
      return [
        ('Processor', ['processor model', 'cpu model', 'cpu name']),
        (
          'Processor Gen',
          ['processor generation', 'cpu generation', 'generation'],
        ),
        ('Base Freq', ['base frequenc', 'base clock']),
        ('CPU Cores', ['cpu core', 'core count', 'number of core']),
        ('TDP', ['tdp', 'thermal design power']),
        ('RAM', ['ram', 'memory size', 'bellek']),
        ('Storage', ['storage', 'disk', 'ssd', 'hdd']),
        ('GPU', ['gpu', 'graphics']),
        ('Case Type', ['case type', 'chassis type', 'kasa tipi']),
        ('Product Series', ['product series', 'series', 'model series']),
        ('OS', ['operating system']),
        (
          'Display Feat',
          ['display features', 'display body ratio', 'screen to body'],
        ),
      ];
    }

    if (sub.contains('cpu') || sub.contains('processor')) {
      return [
        ('Model', ['processor model', 'cpu model', 'cpu name']),
        ('Series', ['series', 'product line']),
        ('Cores', ['core count', 'number of core', ' cores']),
        ('Threads', ['thread count', 'threads']),
        ('Base Clock', ['base frequenc', 'base clock', 'base speed']),
        ('Boost Clock', ['boost frequenc', 'max clock', 'turbo']),
        ('TDP', ['tdp', 'thermal design power']),
        ('Socket', ['socket', 'platform']),
        ('L3 Cache', ['l3 cache', 'cache']),
        ('Process', ['process node', 'manufacturing process', 'nm']),
      ];
    }

    if (sub.contains('gpu') || sub.contains('graphic')) {
      return [
        ('GPU Model', ['gpu model', 'product name', 'chip']),
        ('VRAM', ['vram', 'video memory', 'memory size']),
        ('Memory Type', ['memory type', 'vram type']),
        ('Memory Bus', ['memory bus', 'bus width']),
        ('Base Clock', ['base clock', 'core clock']),
        ('Boost Clock', ['boost clock', 'max clock']),
        ('TDP', ['tdp', 'power consumption']),
        ('Interface', ['interface', 'pcie']),
        ('Outputs', ['output', 'display output', 'hdmi']),
      ];
    }

    if (sub.contains('ram') ||
        (sub.contains('memory') && !sub.contains('card'))) {
      return [
        ('Capacity', ['capacity', 'size']),
        ('Speed', ['speed', 'frequency', 'mhz']),
        ('Type', ['type', 'ddr']),
        ('CAS Latency', ['cas', 'latency']),
        ('Voltage', ['voltage']),
        ('Form Factor', ['form factor', 'dimm', 'so-dimm']),
      ];
    }

    if (sub.contains('ssd') ||
        sub.contains('hdd') ||
        sub.contains('storage') ||
        sub.contains('hard')) {
      return [
        ('Capacity', ['capacity', 'storage size']),
        ('Interface', ['interface', 'pcie', 'sata', 'nvme']),
        ('Read Speed', ['read speed', 'sequential read']),
        ('Write Speed', ['write speed', 'sequential write']),
        ('Form Factor', ['form factor']),
        ('NAND Type', ['nand', 'flash type']),
      ];
    }

    if (sub.contains('monitor')) {
      return [
        ('Screen Size', ['screen size', 'display size']),
        ('Resolution', ['resolution']),
        ('Panel Type', ['panel type', 'panel']),
        ('Refresh Rate', ['refresh rate', 'hz']),
        ('Response Time', ['response time']),
        ('HDR', ['hdr']),
        ('Brightness', ['brightness', 'nits', 'cd/m']),
        ('Color Gamut', ['color gamut', 'srgb', 'dci-p3']),
        ('Sync Tech', ['freesync', 'g-sync', 'adaptive sync']),
        ('Connectivity', ['hdmi', 'displayport', 'usb-c']),
      ];
    }

    if (sub.contains('tv') || sub.contains('television')) {
      return [
        ('Screen Size', ['screen size', 'display size']),
        ('Resolution', ['resolution']),
        ('Panel Type', ['panel type']),
        ('HDR', ['hdr']),
        ('Smart TV', ['smart tv', 'smart']),
        ('Refresh Rate', ['refresh rate']),
        ('HDMI Ports', ['hdmi']),
        ('Brightness', ['brightness', 'nits']),
        ('Viewing Angle', ['viewing angle']),
        ('Dolby', ['dolby']),
      ];
    }

    if (sub.contains('headphone') ||
        sub.contains('earphone') ||
        sub.contains('earbuds')) {
      return [
        ('Type', ['type', 'form factor', 'design']),
        ('Connectivity', ['connectivity', 'bluetooth', 'wireless']),
        ('BT Version', ['bluetooth version', 'bt version']),
        ('Battery Life', ['battery life', 'playback time', 'battery']),
        ('Charge Time', ['charge time', 'charging time']),
        ('Noise Cancel', ['noise cancell', 'anc', 'active noise']),
        ('Driver Size', ['driver size', 'driver']),
        ('Frequency', ['frequency response']),
        ('Impedance', ['impedance', 'ohm']),
        ('Microphone', ['microphone', 'mic']),
        ('Water Rating', ['water resist', 'ip rating', 'ipx']),
        ('Weight', ['weight']),
      ];
    }

    if (sub.contains('speaker') || sub.contains('soundbar')) {
      return [
        ('Power', ['power output', 'rms', 'watt']),
        ('Connectivity', ['bluetooth', 'connectivity', 'wireless']),
        ('BT Version', ['bluetooth version']),
        ('Battery', ['battery', 'playback time']),
        ('Channels', ['channel', 'subwoofer', '2.1', '5.1']),
        ('Frequency', ['frequency response']),
        ('Water Rating', ['water resist', 'ip rating', 'ipx']),
        ('Weight', ['weight']),
      ];
    }

    if (sub.contains('smartwatch') || sub.contains('watch')) {
      return [
        ('Display Size', ['display size', 'screen size']),
        ('Display Tech', ['display tech', 'screen tech', 'panel type']),
        ('Battery Life', ['battery life', 'battery']),
        ('OS', ['os', 'operating system', 'watch os']),
        ('Processor', ['processor', 'chip', 'cpu']),
        ('RAM', ['ram', 'memory']),
        ('Storage', ['storage', 'internal storage']),
        ('GPS', ['gps']),
        ('Heart Rate', ['heart rate']),
        ('SpO2', ['spo2', 'blood oxygen']),
        ('ECG', ['ecg', 'electrocardiogram']),
        ('Water Rating', ['water resist', 'ip rating', 'atm']),
        ('NFC', ['nfc']),
        ('Weight', ['weight']),
      ];
    }

    if (sub.contains('camera')) {
      return [
        ('Sensor', ['sensor type', 'sensor size', 'sensor']),
        ('Resolution', ['resolution', 'megapixel', 'mp']),
        ('Aperture', ['aperture', 'f/']),
        ('Focal Length', ['focal length', 'lens']),
        ('ISO', ['iso']),
        ('Shutter Speed', ['shutter speed']),
        ('Video', ['video resolution', 'video recording', '4k']),
        ('Stabilization', ['stabilization', 'ois', 'ibis']),
        ('AF System', ['autofocus', 'af system']),
        ('Battery', ['battery', 'shots per charge']),
        ('Weight', ['weight']),
      ];
    }

    if (sub.contains('motherboard')) {
      return [
        ('Chipset', ['chipset']),
        ('Socket', ['socket', 'cpu socket']),
        ('Form Factor', ['form factor', 'atx']),
        ('Memory Slots', ['memory slot', 'dimm']),
        ('Max RAM', ['max memory', 'maximum ram']),
        ('Memory Type', ['memory type', 'ddr']),
        ('PCIe Slots', ['pcie x16', 'pcie slot']),
        ('M.2 Slots', ['m.2', 'm2 slot']),
        ('USB Ports', ['usb', 'usb 3']),
        ('Network', ['network', 'ethernet', '2.5g']),
        ('WiFi', ['wifi', 'wi-fi', '802.11']),
        ('Bluetooth', ['bluetooth']),
      ];
    }

    if (sub.contains('psu') || sub.contains('power supply')) {
      return [
        ('Wattage', ['wattage', 'power output', 'watt']),
        ('Efficiency', ['efficiency', '80 plus', '80plus']),
        ('Modular', ['modular']),
        ('Form Factor', ['form factor', 'atx']),
        ('Fan Size', ['fan size']),
        ('PFC', ['pfc', 'power factor']),
      ];
    }

    if (sub.contains('cooler') || sub.contains('cooling')) {
      return [
        ('Type', ['type', 'cooler type']),
        ('TDP Support', ['tdp support', 'max tdp']),
        ('Fan Size', ['fan size', 'fan diameter']),
        ('Fan Speed', ['fan speed', 'rpm']),
        ('Noise Level', ['noise', 'dba', 'db level']),
        ('Socket Support', ['socket', 'compatibility']),
        ('Dimensions', ['dimension', 'height', 'size']),
        ('Weight', ['weight']),
      ];
    }

    if (sub.contains('keyboard')) {
      return [
        ('Switch Type', ['switch type', 'switch']),
        ('Connectivity', ['connectivity', 'wireless', 'bluetooth']),
        ('BT Version', ['bluetooth version']),
        ('Layout', ['layout', 'form factor']),
        ('Backlight', ['backlight', 'rgb', 'led']),
        ('Battery', ['battery', 'battery life']),
        ('Interface', ['interface', 'usb']),
        ('N-Key', ['rollover', 'nkro', 'anti-ghosting']),
        ('Weight', ['weight']),
      ];
    }

    if (sub.contains('mouse') || sub.contains('mice')) {
      return [
        ('DPI', ['dpi', 'sensitivity', 'cpi']),
        ('Polling Rate', ['polling rate', 'hz']),
        ('Connectivity', ['connectivity', 'wireless', 'bluetooth']),
        ('Sensor', ['sensor type', 'sensor model', 'sensor']),
        ('Buttons', ['button', 'programmable']),
        ('Battery', ['battery', 'battery life']),
        ('RGB', ['rgb', 'lighting']),
        ('Weight', ['weight']),
      ];
    }

    if (sub.contains('router')) {
      return [
        ('WiFi Standard', ['wifi standard', 'wifi 6', 'wifi 5', '802.11']),
        ('Max Speed', ['max speed', 'throughput', 'mbps', 'gbps']),
        ('Frequency', ['frequency band', 'dual band', 'tri band']),
        ('LAN Ports', ['lan port', 'ethernet port', 'wan']),
        ('Antennas', ['antenna']),
        ('Processor', ['processor', 'cpu']),
        ('RAM', ['ram', 'memory']),
        ('USB Port', ['usb port']),
        ('Security', ['security', 'wpa', 'encryption']),
      ];
    }

    if (sub.contains('console') || sub.contains('gaming')) {
      return [
        ('Processor', ['processor', 'cpu']),
        ('GPU', ['gpu', 'graphics']),
        ('RAM', ['ram', 'memory']),
        ('Storage', ['storage', 'ssd']),
        ('Resolution', ['resolution', '4k', '8k']),
        ('Optical Drive', ['optical', 'blu-ray', 'disc']),
        ('WiFi', ['wifi', 'wi-fi']),
        ('Bluetooth', ['bluetooth']),
        ('USB Ports', ['usb', 'usb port']),
      ];
    }

    if (sub.contains('projector')) {
      return [
        ('Resolution', ['resolution']),
        ('Brightness', ['brightness', 'lumens', 'ansi']),
        ('Contrast Ratio', ['contrast']),
        ('Throw Ratio', ['throw ratio']),
        ('Lamp Life', ['lamp life', 'lamp hour']),
        ('Connectivity', ['hdmi', 'connectivity']),
      ];
    }

    return const [];
  }

  @override
  Widget build(BuildContext context) {
    final found = <(String label, String value)>[];

    // Priority 1: Use keySpecs from Firestore (Key Specs from epey.com)
    if (product.keySpecs.isNotEmpty) {
      for (final entry in product.keySpecs.entries) {
        final val = entry.value.trim();
        if (val.isNotEmpty &&
            val != '0' &&
            val != '-' &&
            val.toLowerCase() != 'n/a') {
          found.add((entry.key, val));
        }
      }
    }

    // Priority 2: Category keyword matching from specs/specSections
    if (found.isEmpty) {
      final defs = _specDefs;
      for (final (label, keywords) in defs) {
        final val = _find(keywords);
        if (val != null) found.add((label, val));
      }
    }

    // Fallback: first 9 flat specs
    if (found.isEmpty) {
      final entries = product.specs.entries
          .where((e) => e.value?.toString().trim().isNotEmpty == true)
          .take(9);
      for (final e in entries) {
        found.add((e.key, e.value.toString()));
      }
    }

    if (found.isEmpty) return const SizedBox.shrink();

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: context.dividerColor),
        boxShadow: [
          BoxShadow(
            color: Colors.white.withValues(alpha: 0.04),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 10),
            child: Row(
              children: [
                Container(
                  width: 28,
                  height: 28,
                  decoration: BoxDecoration(
                    color: AppTheme.primaryBlue.withValues(alpha: 0.10),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Icon(
                    Icons.bolt_rounded,
                    color: AppTheme.primaryBlue,
                    size: 16,
                  ),
                ),
                const SizedBox(width: 10),
                Text(
                  'KEY SPECS',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: context.textTertiaryColor,
                    letterSpacing: 1.2,
                  ),
                ),
              ],
            ),
          ),
          Divider(height: 1, thickness: 1, color: context.dividerColor),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            child: Column(
              children: found.asMap().entries.map((entry) {
                final isOdd = entry.key.isOdd;
                final spec = entry.value;
                return Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 9,
                  ),
                  decoration: BoxDecoration(
                    color: isOdd
                        ? context.surfaceColor.withValues(alpha: 0.5)
                        : Colors.transparent,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        flex: 2,
                        child: Text(
                          spec.$1,
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 12,
                            fontWeight: FontWeight.w500,
                            color: context.textSecondary,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        flex: 3,
                        child: Text(
                          spec.$2,
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: context.textPrimary,
                          ),
                          textAlign: TextAlign.end,
                        ),
                      ),
                    ],
                  ),
                );
              }).toList(),
            ),
          ),
        ],
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════
// SPECS TAB CONTENT
// ═══════════════════════════════════════════════════════════

class _SpecsTabContent extends StatelessWidget {
  final ProductEntity product;
  final bool isDark;
  const _SpecsTabContent({required this.product, required this.isDark});

  @override
  Widget build(BuildContext context) {
    final locale = Localizations.localeOf(context).languageCode;
    // Render specs IDENTICALLY to the admin product modal: reuse the exact
    // pre-baked per-language payloads (`multiLangSections` / `multiLangSpecs`)
    // the admin reads. Section headers, keys and values are already translated
    // at scrape time, so the app must NOT re-translate them here — that is what
    // used to make the app diverge from the admin. Non-tr/de/en locales fall
    // back to English (see localizedSpecSections).
    // The admin modal renders ONLY the (localized) grouped sections — the
    // "Öne Çıkanlar"/"Highlights" group already comes baked inside them, so we
    // don't prepend raw keySpecs (that would leak untranslated source text).
    final specsSource = product.localizedSpecSections(locale);
    final cardBg = context.surfaceVariantColor;
    if (specsSource.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(40),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(
                Icons.settings_input_component_outlined,
                size: 48,
                color: AppTheme.slate400,
              ),
              const SizedBox(height: 12),
              const Text(
                'No specifications available',
                style: TextStyle(color: AppTheme.slate500, fontSize: 15),
              ),
            ],
          ),
        ),
      );
    }
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
      children: [
        // Category-aware key specs highlight at the top (translation-safe via
        // SpecTranslationService). Renders nothing when no specs are available.
        RepaintBoundary(
          child: SharedKeySpecsGrid(product: product),
        ),
        RepaintBoundary(
          child: _SpecsCard(specs: specsSource, cardBg: cardBg, isDark: isDark),
        ),
      ],
    );
  }
}
