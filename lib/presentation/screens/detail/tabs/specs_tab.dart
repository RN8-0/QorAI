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
  late Map<String, bool> _expanded;

  // Icons per spec group — matches Firestore group names from admin panel
  IconData _getGroupIcon(String groupKey) {
    final k = groupKey.toLowerCase().replaceAll('_', ' ');
    if (k.contains('general') || k.contains('information'))
      return Icons.info_outline;
    if (k.contains('display') || k.contains('screen') || k.contains('ekran'))
      return Icons.phone_android;
    if (k.contains('processor') ||
        k.contains('cpu') ||
        k.contains('performance'))
      return Icons.memory;
    if (k.contains('graphic') || k.contains('gpu') || k.contains('video card'))
      return Icons.videogame_asset_outlined;
    if (k.contains('memory') || k.contains('ram')) return Icons.memory_outlined;
    if (k.contains('storage') ||
        k.contains('disk') ||
        k.contains('optical') ||
        k.contains('ssd') ||
        k.contains('hdd'))
      return Icons.storage_outlined;
    if (k.contains('battery') || k.contains('power'))
      return Icons.battery_charging_full_outlined;
    if (k.contains('camera') || k.contains('photo'))
      return Icons.camera_alt_outlined;
    if (k.contains('connect') ||
        k.contains('network') ||
        k.contains('wifi') ||
        k.contains('bluetooth'))
      return Icons.wifi;
    if (k.contains('port') ||
        k.contains('slot') ||
        k.contains('interface') ||
        k.contains('usb') ||
        k.contains('expansion'))
      return Icons.usb_outlined;
    if (k.contains('audio') || k.contains('sound') || k.contains('speaker'))
      return Icons.headphones_outlined;
    if (k.contains('design') ||
        k.contains('physical') ||
        k.contains('dimension') ||
        k.contains('build') ||
        k.contains('chassis'))
      return Icons.design_services_outlined;
    if (k.contains('software') || k.contains('os') || k.contains('operating'))
      return Icons.apps_outlined;
    if (k.contains('cooling') || k.contains('fan') || k.contains('thermal'))
      return Icons.ac_unit_outlined;
    if (k.contains('lighting') || k.contains('rgb') || k.contains('led'))
      return Icons.lightbulb_outlined;
    if (k.contains('document') ||
        k.contains('packaging') ||
        k.contains('warranty') ||
        k.contains('box'))
      return Icons.description_outlined;
    if (k.contains('function') || k.contains('feature'))
      return Icons.build_outlined;
    if (k.contains('security') || k.contains('sensor'))
      return Icons.security_outlined;
    if (k.contains('weight') || k.contains('material'))
      return Icons.fitness_center_outlined;
    if (k.contains('input') || k.contains('keyboard'))
      return Icons.keyboard_outlined;
    return Icons.tune;
  }

  Color _getGroupColor(String groupKey) {
    final k = groupKey.toLowerCase().replaceAll('_', ' ');
    if (k.contains('general') || k.contains('information'))
      return const Color(0xFF5C6BC0);
    if (k.contains('display') || k.contains('screen'))
      return const Color(0xFF2196F3);
    if (k.contains('processor') ||
        k.contains('cpu') ||
        k.contains('performance'))
      return const Color(0xFFFF5722);
    if (k.contains('graphic') || k.contains('gpu'))
      return const Color(0xFFE91E63);
    if (k.contains('memory') || k.contains('ram'))
      return const Color(0xFF3F51B5);
    if (k.contains('storage') || k.contains('disk') || k.contains('optical'))
      return const Color(0xFF607D8B);
    if (k.contains('battery') || k.contains('power'))
      return const Color(0xFF4CAF50);
    if (k.contains('camera')) return const Color(0xFF9C27B0);
    if (k.contains('connect') || k.contains('network'))
      return const Color(0xFF00BCD4);
    if (k.contains('port') || k.contains('slot') || k.contains('expansion'))
      return const Color(0xFF42A5F5);
    if (k.contains('audio') || k.contains('sound'))
      return const Color(0xFFE91E63);
    if (k.contains('design') ||
        k.contains('physical') ||
        k.contains('dimension') ||
        k.contains('chassis'))
      return const Color(0xFF795548);
    if (k.contains('software') || k.contains('os'))
      return const Color(0xFF7E57C2);
    if (k.contains('cooling') || k.contains('fan'))
      return const Color(0xFF29B6F6);
    if (k.contains('lighting') || k.contains('rgb'))
      return const Color(0xFFFFC107);
    if (k.contains('document') ||
        k.contains('packaging') ||
        k.contains('warranty'))
      return const Color(0xFF78909C);
    if (k.contains('function') || k.contains('feature'))
      return const Color(0xFFAB47BC);
    if (k.contains('security') || k.contains('sensor'))
      return const Color(0xFFEC407A);
    return const Color(0xFF9E9E9E);
  }

  @override
  void initState() {
    super.initState();
    _expanded = {for (final key in widget.specs.keys) key: false};
  }

  /// Converts a spec value to displayable string.
  /// Handles Lists (newline-joined) and scalars safely.
  static String _specValToString(dynamic val) {
    if (val is List) {
      return val
          .whereType<Object>()
          .map((e) => e.toString().trim())
          .where((s) => s.isNotEmpty)
          .join('\n');
    }
    return val?.toString() ?? '';
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
      'other': l.specGroupOther,
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
      'general features': l.specGroupGeneral,
      'memory features': l.specGroupMemory,
      'memory (ram) features': l.specGroupMemory,
      'gpu': l.specGroupGpu,
      'technological infrastructure': l.specGroupTechInfra,
      'power and connections': l.specGroupPowerConnections,
      'network connections': l.specGroupNetwork,
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

  /// Translate a multi-word spec name word-by-word using a dictionary.
  static String _translateWords(String input, Map<String, String> dict) {
    final parts = input.split(RegExp(r'(\s+)'));
    final translated = <String>[];
    bool anyTranslated = false;
    for (final part in parts) {
      final clean = part.trim().toLowerCase();
      if (clean.isEmpty || clean == '&' || clean == '/' || clean == '-') {
        if (clean == '&')
          translated.add('ve');
        else if (clean == '/')
          translated.add('/');
        else if (clean.isNotEmpty)
          translated.add(part);
        continue;
      }
      final tr = dict[clean];
      if (tr != null) {
        if (tr.isNotEmpty)
          translated.add(tr); // skip empty translations (stop words)
        anyTranslated = true;
      } else {
        // Keep original preserving acronyms via _formatKey single-word logic
        translated.add(_formatKey(part));
      }
    }
    if (!anyTranslated) {
      return _formatKey(input);
    }
    // Clean up any double spaces after dropping stop words
    return translated.join(' ').replaceAll(RegExp(r'\s{2,}'), ' ').trim();
  }

  /// Word-level dictionary for translating individual technical terms.
  static Map<String, String> _specWordDict(String locale) {
    switch (locale) {
      case 'tr':
        return _trWordDict;
      default:
        return const {};
    }
  }

  static const _trWordDict = <String, String>{
    // Core hardware
    'processor': 'İşlemci', 'cpu': 'İşlemci', 'chipset': 'Yonga Seti',
    'core': 'Çekirdek',
    'cores': 'Çekirdek',
    'thread': 'İş Parçacığı',
    'threads': 'İş Parçacığı',
    'clock': 'Saat', 'frequency': 'Frekans', 'speed': 'Hız',
    'boost': 'Boost', 'turbo': 'Turbo', 'base': 'Temel',
    'efficiency': 'Verimlilik', 'performance': 'Performans',
    'transistor': 'Transistör', 'distance': 'Mesafe',
    'architecture': 'Mimari', 'process': 'Üretim Süreci',
    'cache': 'Önbellek', 'generation': 'Nesil',
    // Memory & Storage
    'memory': 'Bellek', 'ram': 'RAM', 'vram': 'VRAM',
    'storage': 'Depolama', 'internal': 'Dahili', 'external': 'Harici',
    'expandable': 'Genişletilebilir', 'capacity': 'Kapasite',
    'optical': 'Optik', 'drive': 'Sürücü', 'slot': 'Yuva', 'slots': 'Yuva',
    'bus': 'Veri Yolu', 'bandwidth': 'Bant Genişliği',
    'type': 'Türü', 'size': 'Boyut',
    // Display
    'display': 'Ekran', 'screen': 'Ekran', 'panel': 'Panel',
    'resolution': 'Çözünürlük', 'refresh': 'Yenileme', 'rate': 'Hızı',
    'brightness': 'Parlaklık', 'contrast': 'Kontrast', 'ratio': 'Oranı',
    'hdr': 'HDR', 'touchscreen': 'Dokunmatik Ekran',
    'color': 'Renk', 'colors': 'Renkler', 'gamut': 'Gamut',
    'response': 'Tepki', 'time': 'Süresi', 'nit': 'Nit', 'nits': 'Nit',
    'pixel': 'Piksel', 'density': 'Yoğunluk',
    'technology': 'Teknoloji',
    // Battery & Power
    'battery': 'Batarya', 'charging': 'Şarj', 'charger': 'Şarj Cihazı',
    'power': 'Güç', 'supply': 'Kaynağı', 'consumption': 'Tüketimi',
    'voltage': 'Gerilim', 'current': 'Akım', 'watt': 'Watt',
    'adapter': 'Adaptör', 'wireless': 'Kablosuz', 'wired': 'Kablolu',
    'fast': 'Hızlı', 'life': 'Ömrü',
    // Camera
    'camera': 'Kamera', 'lens': 'Lens', 'aperture': 'Diyafram',
    'zoom': 'Yakınlaştırma', 'optical zoom': 'Optik Yakınlaştırma',
    'digital': 'Dijital', 'flash': 'Flaş', 'autofocus': 'Otomatik Odaklama',
    'stabilization': 'Sabitleme', 'megapixel': 'Megapiksel',
    'front': 'Ön', 'rear': 'Arka', 'main': 'Ana',
    'video': 'Video', 'recording': 'Kayıt', 'photo': 'Fotoğraf',
    'image': 'Görüntü', 'sensor': 'Sensör', 'sensors': 'Sensörler',
    // Network & Connectivity
    'network': 'Ağ', 'connection': 'Bağlantı', 'connections': 'Bağlantılar',
    'connectivity': 'Bağlantı',
    'interface': 'Arayüz',
    'interfaces': 'Arayüzler',
    'bluetooth': 'Bluetooth', 'wifi': 'Wi-Fi', 'wi-fi': 'Wi-Fi',
    'nfc': 'NFC', 'gps': 'GPS', 'lte': 'LTE', '5g': '5G', '4g': '4G',
    'band': 'Bant', 'bands': 'Bantlar',
    'signal': 'Sinyal', 'range': 'Menzil', 'antenna': 'Anten',
    'sim': 'SIM', 'dual': 'Çift', 'single': 'Tekli',
    'port': 'Port', 'ports': 'Portlar', 'usb': 'USB',
    'hdmi': 'HDMI', 'jack': 'Jak', 'headphone': 'Kulaklık',
    'input': 'Giriş', 'output': 'Çıkış',
    // Audio
    'audio': 'Ses',
    'sound': 'Ses',
    'speaker': 'Hoparlör',
    'speakers': 'Hoparlörler',
    'microphone': 'Mikrofon', 'stereo': 'Stereo', 'mono': 'Mono',
    'noise': 'Gürültü', 'cancellation': 'Önleme',
    'active': 'Aktif', 'passive': 'Pasif',
    'driver': 'Sürücü', 'impedance': 'Empedans',
    // GPU
    'graphics': 'Grafik', 'gpu': 'GPU', 'cuda': 'CUDA',
    'stream': 'Akış', 'processors': 'İşlemciler',
    'shader': 'Gölgelendirici', 'render': 'İşleme',
    // Design & Physical
    'design': 'Tasarım', 'body': 'Gövde', 'material': 'Malzeme',
    'weight': 'Ağırlık', 'height': 'Yükseklik', 'width': 'Genişlik',
    'depth': 'Derinlik', 'thickness': 'Kalınlık', 'length': 'Uzunluk',
    'dimensions': 'Boyutlar', 'form': 'Form', 'factor': 'Faktör',
    // Security & Sensors
    'security': 'Güvenlik', 'fingerprint': 'Parmak İzi',
    'face': 'Yüz', 'recognition': 'Tanıma',
    'gyroscope': 'Jiroskop', 'accelerometer': 'İvmeölçer',
    'proximity': 'Yakınlık', 'compass': 'Pusula', 'barometer': 'Barometre',
    // Software
    'operating': 'İşletim', 'system': 'Sistemi', 'software': 'Yazılım',
    'version': 'Sürüm', 'update': 'Güncelleme',
    // General descriptors
    'brand': 'Marka', 'model': 'Model', 'series': 'Seri',
    'name': 'Adı', 'number': 'Sayısı', 'count': 'Sayısı',
    'total': 'Toplam', 'max': 'Maksimum', 'maximum': 'Maksimum',
    'min': 'Minimum', 'minimum': 'Minimum',
    'standard': 'Standart', 'premium': 'Premium', 'pro': 'Pro',
    'advanced': 'Gelişmiş', 'basic': 'Temel',
    'high': 'Yüksek', 'low': 'Düşük', 'medium': 'Orta',
    'ultra': 'Ultra', 'super': 'Süper', 'mega': 'Mega',
    'smart': 'Akıllı', 'assistant': 'Asistan',
    'enabled': 'Etkin', 'disabled': 'Devre Dışı',
    'support': 'Destek', 'supported': 'Destekleniyor',
    'compatible': 'Uyumlu', 'compatibility': 'Uyumluluk',
    'protection': 'Koruma', 'resistance': 'Dayanıklılık',
    'water': 'Su', 'dust': 'Toz', 'ip': 'IP', 'rating': 'Derece',
    'warranty': 'Garanti', 'certification': 'Sertifika',
    'year': 'Yıl', 'date': 'Tarih', 'release': 'Çıkış',
    'details': 'Detayları', 'detail': 'Detay',
    'feature': 'Özellik', 'features': 'Özellikler',
    'other': 'Diğer', 'integrated': 'Dahili',
    'level': 'Seviye', 'mode': 'Mod', 'channel': 'Kanal',
    'module': 'Modül', 'chip': 'Çip', 'card': 'Kart',
    'format': 'Format', 'protocol': 'Protokol',
    'multi': 'Çoklu', 'triple': 'Üçlü', 'quad': 'Dörtlü',
    'angle': 'Açı', 'wide': 'Geniş', 'narrow': 'Dar',
    'top': 'Üst', 'bottom': 'Alt', 'side': 'Yan',
    'left': 'Sol', 'right': 'Sağ', 'under': 'Alt',
    'back': 'Arka',
    // Connector words that appear in mixed spec names
    'to': 'Karşı', 'for': 'İçin', 'with': 'ile', 'of': '',
    'and': 'Ve', 'in': 'İçinde', 'the': '', 'a': '',
    'against': 'Karşı',
    // Missing hardware terms
    'impacts': 'Darbeler', 'impact': 'Darbe',
    'shock': 'Şok', 'drop': 'Düşme', 'vibration': 'Titreşim',
    'delivery': 'Teslimatı', 'data': 'Veri',
    'transfer': 'Aktarım',
    'expansion': 'Genişletme',
    'reader': 'Okuyucu', 'writer': 'Yazıcı',
    'hub': 'Hub', 'dock': 'Dock',
    'scanner': 'Tarayıcı', 'lock': 'Kilit',
    'keyboard': 'Klavye', 'backlit': 'Aydınlatmalı',
    'backlight': 'Arka Işık', 'illumination': 'Aydınlatma',
    'trackpad': 'İzleme Paneli', 'touchpad': 'Dokunmatik Yüzey',
    'pointer': 'İşaretçi', 'stylus': 'Kalem',
    'pen': 'Kalem', 'touch': 'Dokunmatik',
    'multi-touch': 'Çok Dokunuşlu',
    'fan': 'Fan', 'cooling': 'Soğutma', 'heat': 'Isı',
    'pipe': 'Boru', 'thermal': 'Termal',
    'silent': 'Sessiz',
    'virtual': 'Sanal',
    'built-in': 'Dahili',
    'frame': 'Çerçeve',
    'lid': 'Kapak', 'hinge': 'Menteşe',
    'surface': 'Yüzey', 'coating': 'Kaplama',
    'texture': 'Doku', 'finish': 'Yüzey',
  };

  int _sectionPriority(String key) {
    final k = key.toLowerCase().replaceAll('_', ' ');

    // 1. BASIC INFO — Answers "What is this?", establishes context
    if (k.contains('basic info') ||
        k.contains('general info') ||
        k.contains('information') ||
        k.contains('release') ||
        k.contains('general') ||
        k.contains('overview'))
      return 1;

    // 2. DESIGN — First visual impression; what the user feels when seeing the product
    if (k.contains('design') ||
        k.contains('physical') ||
        k.contains('dimension') ||
        k.contains('build') ||
        k.contains('chassis') ||
        k.contains('weight') ||
        k.contains('material') ||
        k.contains('color'))
      return 2;

    // 3. DISPLAY — The surface the user interacts with the most
    if (k.contains('display') ||
        k.contains('screen') ||
        k.contains('monitor') ||
        k.contains('panel'))
      return 3;

    // 4. PERFORMANCE / PROCESSOR — "How fast is it?" — Most frequently asked
    if (k.contains('basic hard') ||
        k.contains('processor') ||
        k.contains('cpu') ||
        k.contains('chipset') ||
        k.contains('performance') ||
        k.contains('computing'))
      return 4;

    // 5. MEMORY / RAM — Extension of performance
    if (k.contains('memory') || k.contains('ram')) return 5;

    // 6. STORAGE — Capacity
    if (k.contains('storage') ||
        k.contains('disk') ||
        k.contains('ssd') ||
        k.contains('hdd') ||
        k.contains('optical') ||
        k.contains('flash'))
      return 6;

    // 7. CAMERA — Strongest purchase motivator in 2024
    if (k.contains('camera') ||
        k.contains('photo') ||
        k.contains('imaging') ||
        k.contains('optic'))
      return 7;

    // 8. BATTERY — A constant concern in daily use
    if (k.contains('battery') ||
        k.contains('power') ||
        k.contains('charging') ||
        k.contains('endurance'))
      return 8;

    // 9. GPU / GRAPHICS — Gaming and visual performance
    if (k.contains('graphic') ||
        k.contains('gpu') ||
        k.contains('video card') ||
        k.contains('vga'))
      return 9;

    // 10. NETWORK / CELLULAR — Connectivity (4G/5G matters)
    if (k.contains('network') ||
        k.contains('cellular') ||
        k.contains('sim') ||
        k.contains('lte') ||
        k.contains('5g') ||
        k.contains('connect') && !k.contains('wireless'))
      return 10;

    // 11. WIRELESS — WiFi, BT, NFC
    if (k.contains('wireless') ||
        k.contains('wifi') ||
        k.contains('bluetooth') ||
        k.contains('nfc') ||
        k.contains('gps') ||
        k.contains('navigation'))
      return 11;

    // 12. OS / SOFTWARE — Ecosystem and platform
    if (k.contains('operating') ||
        k.contains('software') ||
        k.contains(' os') ||
        k.contains('system'))
      return 12;

    // 13. AUDIO / MULTIMEDIA — Media consumption
    if (k.contains('audio') ||
        k.contains('sound') ||
        k.contains('speaker') ||
        k.contains('multimedia') ||
        k.contains('music'))
      return 13;

    // 14. FEATURES / SECURITY / SENSORS — Additional features
    if (k.contains('feature') ||
        k.contains('function') ||
        k.contains('security') ||
        k.contains('sensor') ||
        k.contains('biometric') ||
        k.contains('fingerprint'))
      return 14;

    // 15. PORTS / CONNECTIONS — Physical connections
    if (k.contains('port') ||
        k.contains('slot') ||
        k.contains('usb') ||
        k.contains('interface') ||
        k.contains('expansion') ||
        k.contains('other connection') ||
        k.contains('connector'))
      return 15;

    // 16. COOLING — Desktop/Laptop specific
    if (k.contains('cooling') ||
        k.contains('fan') ||
        k.contains('thermal') ||
        k.contains('heat'))
      return 16;

    // 17. INPUT — Keyboard, mouse
    if (k.contains('input') ||
        k.contains('keyboard') ||
        k.contains('mouse') ||
        k.contains('touchpad'))
      return 17;

    // 18. PACKAGING / WARRANTY — Box contents, warranty
    if (k.contains('document') ||
        k.contains('packaging') ||
        k.contains('warranty') ||
        k.contains('box') ||
        k.contains('contents') ||
        k.contains('lighting') ||
        k.contains('rgb') ||
        k.contains('led'))
      return 18;

    return 99;
  }

  @override
  Widget build(BuildContext context) {
    final sortedEntries = widget.specs.entries.toList()
      ..sort(
        (a, b) => _sectionPriority(a.key).compareTo(_sectionPriority(b.key)),
      );
    final specs = Map.fromEntries(sortedEntries);

    return Container(
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: context.dividerColor),
        boxShadow: [
          BoxShadow(color: Colors.white.withValues(alpha: 0.04), blurRadius: 8),
        ],
      ),
      clipBehavior: Clip.hardEdge,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
            decoration: BoxDecoration(
              border: Border(bottom: BorderSide(color: context.dividerColor)),
            ),
            child: Row(
              children: [
                _CardHeader(
                  icon: Icons.settings_input_component,
                  label: context.l10n?.specs ?? 'Specifications',
                  color: AppTheme.primaryBlue,
                ),
                const Spacer(),
                Text(
                  '${specs.length} ${context.l10n?.groups ?? 'groups'}',
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppTheme.slate500,
                  ),
                ),
              ],
            ),
          ),
          ...specs.entries.map((entry) {
            final groupKey = entry.key;
            final value = entry.value;
            final isExpanded = _expanded[groupKey] ?? false;

            // ── If value is a nested map → expandable group ──
            if (value is Map && value.isNotEmpty) {
              final icon = _getGroupIcon(groupKey);
              final color = _getGroupColor(groupKey);

              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Group header — solid colored bar matching admin panel style
                  Material(
                    color: color,
                    child: InkWell(
                      onTap: () =>
                          setState(() => _expanded[groupKey] = !isExpanded),
                      splashColor: Colors.white.withValues(alpha: 0.15),
                      highlightColor: Colors.white.withValues(alpha: 0.08),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 11,
                        ),
                        child: Row(
                          children: [
                            Icon(icon, size: 15, color: Colors.white),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text(
                                _localizedGroupName(
                                  context,
                                  groupKey,
                                ).toUpperCase(),
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 12,
                                  color: Colors.white,
                                  letterSpacing: 0.6,
                                ),
                              ),
                            ),
                            Text(
                              '${value.length} ${context.l10n?.specsCount ?? 'specs'}',
                              style: TextStyle(
                                fontSize: 11,
                                color: Colors.white.withValues(alpha: 0.75),
                              ),
                            ),
                            const SizedBox(width: 6),
                            AnimatedRotation(
                              turns: isExpanded ? 0.5 : 0,
                              duration: const Duration(milliseconds: 200),
                              child: Icon(
                                Icons.expand_more,
                                size: 18,
                                color: Colors.white.withValues(alpha: 0.85),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                  if (isExpanded)
                    Builder(
                      builder: (context) {
                        int rowIdx = 0;
                        return Column(
                          children: value.entries.expand<Widget>((sub) {
                            final subLabel = _localizedSpecName(
                              context,
                              sub.key.toString(),
                            );
                            final subVal = sub.value;
                            // Handle nested maps within a group
                            if (subVal is Map && subVal.isNotEmpty) {
                              return subVal.entries.map((inner) {
                                final innerVal = _specValToString(inner.value);
                                if (innerVal.isEmpty ||
                                    innerVal == '?' ||
                                    innerVal == 'null' ||
                                    innerVal == '{}' ||
                                    innerVal == '[]') {
                                  return const SizedBox.shrink();
                                }
                                final odd = rowIdx++ % 2 == 1;
                                return _SpecRow(
                                  label: _localizedSpecName(
                                    context,
                                    inner.key.toString(),
                                  ),
                                  value: innerVal,
                                  isDark: widget.isDark,
                                  accent: color,
                                  isOdd: odd,
                                );
                              });
                            }
                            final subValue = _specValToString(subVal);
                            if (subValue.isEmpty ||
                                subValue == '?' ||
                                subValue == 'null' ||
                                subValue == '{}' ||
                                subValue == '[]') {
                              return [const SizedBox.shrink()];
                            }
                            final odd = rowIdx++ % 2 == 1;
                            return [
                              _SpecRow(
                                label: subLabel,
                                value: subValue,
                                isDark: widget.isDark,
                                accent: color,
                                isOdd: odd,
                              ),
                            ];
                          }).toList(),
                        );
                      },
                    ),
                ],
              );
            }

            // ── Flat key-value (fallback) ──
            final flatValue = _specValToString(value);
            if (flatValue.isEmpty ||
                flatValue == '?' ||
                flatValue == 'null' ||
                flatValue == '{}' ||
                flatValue == '[]') {
              return const SizedBox.shrink();
            }
            return _SpecRow(
              label: _localizedSpecName(context, groupKey),
              value: flatValue,
              isDark: widget.isDark,
              accent: AppTheme.primaryBlue,
              isOdd: false,
            );
          }),
          const SizedBox(height: 4),
        ],
      ),
    );
  }
}

class _SpecRow extends StatelessWidget {
  final String label, value;
  final bool isDark;
  final Color accent;
  final bool isOdd;
  const _SpecRow({
    required this.label,
    required this.value,
    required this.isDark,
    required this.accent,
    this.isOdd = false,
  });

  /// Capitalize first letter of each word but preserve acronyms (USB, HDMI...).
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
    // Step 1: replace bullet chars and pipe with newlines
    final withNewlines = value
        .replaceAll('•', '\n')
        .replaceAll('•', '\n')
        .replaceAll('|', '\n');

    // Step 2: if the value already contains natural line breaks (admin panel
    // format), split on them directly — do NOT apply camelCase regex which
    // incorrectly breaks feature names like "FreeSync", "AirPlay", "HbbTV".
    if (withNewlines.contains('\n')) {
      final rawParts = withNewlines
          .split('\n')
          .map((s) => s.trim())
          .where((s) => s.isNotEmpty)
          .map((p) => p.replaceFirst(RegExp(r'^[-•\s]+'), '').trim())
          .where((p) => p.isNotEmpty)
          .toList();
      if (rawParts.length >= 2) return rawParts;
    }

    // Step 3: single-line value — apply heuristic splitting
    final normalized = withNewlines
        .replaceAllMapped(
          RegExp(r'(?<=[+)])\s+(?=[A-ZÇĞİÖŞÜ0-9])'),
          (_) => '\n',
        )
        // Only collapse horizontal whitespace (spaces/tabs), NOT newlines
        .replaceAll(RegExp(r'[^\S\n]{2,}'), ' ')
        .trim();

    List<String>? parts;
    if (normalized.contains('\n')) {
      parts = normalized
          .split('\n')
          .map((s) => s.trim())
          .where((s) => s.isNotEmpty)
          .toList();
    } else if (normalized.contains(',') && normalized.length > 8) {
      parts = normalized
          .split(',')
          .map((s) => s.trim())
          .where((s) => s.isNotEmpty)
          .toList();
    } else if (normalized.contains(';') && normalized.length > 8) {
      parts = normalized
          .split(';')
          .map((s) => s.trim())
          .where((s) => s.isNotEmpty)
          .toList();
    } else if (normalized.contains(' / ') && normalized.length > 8) {
      parts = normalized
          .split(' / ')
          .map((s) => s.trim())
          .where((s) => s.isNotEmpty)
          .toList();
    } else if (normalized.length > 42 &&
        _looksLikePackedFeatureList(normalized)) {
      parts = _chunkLongValue(normalized);
    }

    return (parts ?? [normalized])
        .map((part) => part.replaceFirst(RegExp(r'^[•\-\s]+'), '').trim())
        .where((part) => part.isNotEmpty)
        .toList();
  }

  String _localizedValue(BuildContext context, String val) {
    final l = context.l10n;
    if (l == null) return val;
    final locale = Localizations.localeOf(context).languageCode;
    final svc = SpecTranslationService.instance;
    final canonicalValue = svc.isLoaded ? svc.canonicalizeToEnglish(val) : val;
    final canonicalLower = canonicalValue.trim().toLowerCase();
    // Handle "No." variant (with period)
    if (canonicalLower == 'no.' || canonicalLower == 'no') {
      return l.specValNo;
    }
    // Common boolean/status values
    const enToKey = {
      'yes': 'yes',
      'available': 'available',
      'not available': 'notAvailable',
      'unknown': 'unknown',
      'none': 'none',
      'supported': 'supported',
      'not supported': 'notSupported',
      'included': 'included',
      'not included': 'notIncluded',
      'wireless': 'wireless',
      'wired': 'wired',
      'both': 'both',
      'plastic': 'plastic',
      'metal': 'metal',
      'glass': 'glass',
      'aluminum': 'aluminum',
      'aluminium': 'aluminum',
      'ceramic': 'ceramic',
      'leather': 'leather',
      'silicon': 'silicon',
      'silicone': 'silicon',
      'front': 'front',
      'rear': 'rear',
      'side': 'side',
      'under display': 'underDisplay',
      // Additional values
      'rechargeable': 'rechargeable',
      'non-rechargeable': 'nonRechargeable',
      'lithium': 'lithium',
      'lithium-ion': 'lithiumIon',
      'lithium ion': 'lithiumIon',
      'lithium polymer': 'lithiumPolymer',
      'li-ion': 'lithiumIon',
      'li-po': 'lithiumPolymer',
      'true': 'yes',
      'false': 'no',
      'n/a': 'notAvailable',
      'na': 'notAvailable',
      'enabled': 'enabled',
      'disabled': 'disabled',
      'auto': 'auto',
      'manual': 'manual',
      'optical': 'optical',
      'digital': 'digital',
      'hybrid': 'hybrid',
      'stereo': 'stereo',
      'mono': 'mono',
      'built-in': 'builtIn',
      'removable': 'removable',
      'non-removable': 'nonRemovable',
      'waterproof': 'waterproof',
      'water resistant': 'waterResistant',
      'dustproof': 'dustproof',
      'shockproof': 'shockproof',
      'touchscreen': 'touchscreen',
      'foldable': 'foldable',
      'rotating': 'rotating',
      'fixed': 'fixed',
      'adjustable': 'adjustable',
      'automatic': 'automatic',
    };
    final trMap = {
      'yes': l.specValYes,
      'no': l.specValNo,
      'available': l.specValAvailable,
      'notAvailable': l.specValNotAvailable,
      'unknown': l.specValUnknown,
      'none': l.specValNone,
      'supported': l.specValSupported,
      'notSupported': l.specValNotSupported,
      'included': l.specValIncluded,
      'notIncluded': l.specValNotIncluded,
      'wireless': l.specValWireless,
      'wired': l.specValWired,
      'both': l.specValBoth,
      'plastic': l.specValPlastic,
      'metal': l.specValMetal,
      'glass': l.specValGlass,
      'aluminum': l.specValAluminum,
      'ceramic': l.specValCeramic,
      'leather': l.specValLeather,
      'silicon': l.specValSilicon,
      'front': l.specValFront,
      'rear': l.specValRear,
      'side': l.specValSide,
      'underDisplay': l.specValUnderDisplay,
      // Additional values
      'rechargeable': l.specValRechargeable,
      'nonRechargeable': l.specValNonRechargeable,
      'lithium': l.specValLithium,
      'lithiumIon': l.specValLithiumIon,
      'lithiumPolymer': l.specValLithiumPolymer,
      'enabled': l.specValEnabled,
      'disabled': l.specValDisabled,
      'auto': l.specValAuto,
      'manual': l.specValManual,
      'optical': l.specValOptical,
      'digital': l.specValDigital,
      'hybrid': l.specValHybrid,
      'stereo': l.specValStereo,
      'mono': l.specValMono,
      'builtIn': l.specValBuiltIn,
      'removable': l.specValRemovable,
      'nonRemovable': l.specValNonRemovable,
      'waterproof': l.specValWaterproof,
      'waterResistant': l.specValWaterResistant,
      'dustproof': l.specValDustproof,
      'shockproof': l.specValShockproof,
      'touchscreen': l.specValTouchscreen,
      'foldable': l.specValFoldable,
      'rotating': l.specValRotating,
      'fixed': l.specValFixed,
      'adjustable': l.specValAdjustable,
      'automatic': l.specValAutomatic,
    };
    final key = enToKey[canonicalLower];
    if (key != null && trMap[key] != null) return trMap[key]!;
    if (locale == 'en') {
      return _applyValueTitleCase(canonicalValue);
    }
    if (svc.isLoaded) {
      final translated = svc.translateValueForLocale(val, locale);
      if (translated.toLowerCase() != canonicalLower) {
        return _applyValueTitleCase(translated);
      }
    }
    final translated = spec_dict.translateSpecValue(canonicalValue, locale);
    if (translated != canonicalValue) {
      return translated;
    }
    return _applyValueTitleCase(val);
  }

  @override
  Widget build(BuildContext context) {
    // Skip empty, null-like, or serialized object values
    final trimmed = value.trim();
    if (trimmed.isEmpty ||
        trimmed == '?' ||
        trimmed == 'null' ||
        trimmed == '{}' ||
        trimmed == '[]' ||
        (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
      return const SizedBox.shrink();
    }
    final localizedVal = _localizedValue(context, value);
    // Split long multi-value strings into per-line display
    final valueWidget = _buildValueWidget(context, localizedVal);

    return Column(
      children: [
        Container(
          constraints: const BoxConstraints(minHeight: 44),
          color: isOdd ? context.surfaceColor : context.surfaceVariantColor,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                flex: 4,
                child: Text(
                  label,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w400,
                    color: Theme.of(
                      context,
                    ).colorScheme.onSurface.withValues(alpha: 0.6),
                  ),
                ),
              ),
              Expanded(flex: 5, child: valueWidget),
            ],
          ),
        ),
        Divider(color: context.dividerColor, height: 1),
      ],
    );
  }

  /// Translate common English spec values to the active locale language.
  String _localizedSpecValue(BuildContext context, String val) {
    final locale = Localizations.localeOf(context).languageCode;
    final svc = SpecTranslationService.instance;
    final canonicalValue = svc.isLoaded ? svc.canonicalizeToEnglish(val) : val;
    if (locale == 'en') return canonicalValue;
    final v = canonicalValue.trim().toLowerCase();
    switch (locale) {
      case 'tr':
        const trMap = {
          'yes': 'Var',
          'no': 'Yok',
          'true': 'Evet',
          'false': 'Hayır',
          'available': 'Mevcut',
          'not available': 'Mevcut Değil',
          'supported': 'Destekleniyor',
          'not supported': 'Desteklenmiyor',
          'included': 'Dahil',
          'not included': 'Dahil Değil',
          'active': 'Aktif',
          'passive': 'Pasif',
          'wired': 'Kablolu',
          'wireless': 'Kablosuz',
          'touch': 'Dokunmatik',
          'mechanical': 'Mekanik',
          'mono': 'Mono',
          'stereo': 'Stereo',
          'front': 'Ön',
          'rear': 'Arka',
          'back': 'Arka',
          'left': 'Sol',
          'right': 'Sağ',
          'black': 'Siyah',
          'white': 'Beyaz',
          'silver': 'Gümüş',
          'gold': 'Altın',
          'blue': 'Mavi',
          'red': 'Kırmızı',
          'green': 'Yeşil',
          'gray': 'Gri',
          'grey': 'Gri',
        };
        return trMap[v] ?? val;
      case 'de':
        const deMap = {
          'yes': 'Ja',
          'no': 'Nein',
          'available': 'Verfügbar',
          'not available': 'Nicht verfügbar',
        };
        return deMap[v] ?? canonicalValue;
      case 'fr':
        const frMap = {
          'yes': 'Oui',
          'no': 'Non',
          'available': 'Disponible',
          'not available': 'Non disponible',
        };
        return frMap[v] ?? canonicalValue;
      case 'es':
        const esMap = {
          'yes': 'Sí',
          'no': 'No',
          'available': 'Disponible',
          'not available': 'No disponible',
        };
        return esMap[v] ?? canonicalValue;
      default:
        final translated = svc.isLoaded
            ? svc.translateValueForLocale(val, locale)
            : canonicalValue;
        return translated == val ? canonicalValue : translated;
    }
  }

  Widget _buildValueWidget(BuildContext context, String rawVal) {
    // Translate common value words to locale language
    final val = _localizedSpecValue(context, rawVal);
    final parts = _extractValueParts(val);

    if (parts.length >= 2) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: parts
            .map(
              (p) => Padding(
                padding: const EdgeInsets.only(bottom: 3),
                child: Text(
                  p,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                    color: Theme.of(context).colorScheme.onSurface,
                    height: 1.4,
                  ),
                  textAlign: TextAlign.end,
                  softWrap: true,
                ),
              ),
            )
            .toList(),
      );
    }

    return Text(
      val,
      style: TextStyle(
        fontSize: 13,
        fontWeight: FontWeight.w500,
        color: Theme.of(context).colorScheme.onSurface,
      ),
      textAlign: TextAlign.end,
      softWrap: true,
      overflow: TextOverflow.visible,
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

class _SpecChip extends StatelessWidget {
  final String label;
  final String value;
  const _SpecChip({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final display = value.length > 18
        ? '${value.substring(0, 16)}\u2026'
        : value;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 7),
      decoration: BoxDecoration(
        color: context.surfaceColor,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: context.dividerColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            label,
            style: TextStyle(
              fontSize: 9,
              color: context.textSecondary,
              fontWeight: FontWeight.w500,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 2),
          Text(
            display,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: context.textPrimary,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
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
    final cardBg = context.surfaceVariantColor;
    if (product.specs.isEmpty && product.specSections.isEmpty) {
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
        _KeySpecsGrid(product: product),
        RepaintBoundary(
          child: _SpecsCard(
            specs: product.specSections.isNotEmpty
                ? product.specSections
                : product.specs,
            cardBg: cardBg,
            isDark: isDark,
          ),
        ),
      ],
    );
  }
}

// ═══════════════════════════════════════════════════════════
// KEY SPECS GRID
// ═══════════════════════════════════════════════════════════

/// Delegates to SharedKeySpecsGrid from shared widgets.
class _KeySpecsGrid extends StatelessWidget {
  final ProductEntity product;
  const _KeySpecsGrid({required this.product});

  @override
  Widget build(BuildContext context) => SharedKeySpecsGrid(product: product);
}
