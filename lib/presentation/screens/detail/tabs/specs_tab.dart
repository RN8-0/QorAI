part of '../product_detail_screen.dart';

// ═══════════════════════════════════════════════════════════
// SPECS CARD (grouped)
// ═══════════════════════════════════════════════════════════

class _SpecsCard extends StatefulWidget {
  final Map<String, dynamic> specs;
  final Color cardBg;
  final bool isDark;
  const _SpecsCard({required this.specs, required this.cardBg, required this.isDark});

  @override
  State<_SpecsCard> createState() => _SpecsCardState();
}

class _SpecsCardState extends State<_SpecsCard> {
  late Map<String, bool> _expanded;

  // Icons per spec group — matches Firestore group names from admin panel
  IconData _getGroupIcon(String groupKey) {
    final k = groupKey.toLowerCase().replaceAll('_', ' ');
    if (k.contains('general') || k.contains('information')) return Icons.info_outline;
    if (k.contains('display') || k.contains('screen') || k.contains('ekran')) return Icons.phone_android;
    if (k.contains('processor') || k.contains('cpu') || k.contains('performance')) return Icons.memory;
    if (k.contains('graphic') || k.contains('gpu') || k.contains('video card')) return Icons.videogame_asset_outlined;
    if (k.contains('memory') || k.contains('ram')) return Icons.memory_outlined;
    if (k.contains('storage') || k.contains('disk') || k.contains('optical') || k.contains('ssd') || k.contains('hdd')) return Icons.storage_outlined;
    if (k.contains('battery') || k.contains('power')) return Icons.battery_charging_full_outlined;
    if (k.contains('camera') || k.contains('photo')) return Icons.camera_alt_outlined;
    if (k.contains('connect') || k.contains('network') || k.contains('wifi') || k.contains('bluetooth')) return Icons.wifi;
    if (k.contains('port') || k.contains('slot') || k.contains('interface') || k.contains('usb') || k.contains('expansion')) return Icons.usb_outlined;
    if (k.contains('audio') || k.contains('sound') || k.contains('speaker')) return Icons.headphones_outlined;
    if (k.contains('design') || k.contains('physical') || k.contains('dimension') || k.contains('build') || k.contains('chassis')) return Icons.design_services_outlined;
    if (k.contains('software') || k.contains('os') || k.contains('operating')) return Icons.apps_outlined;
    if (k.contains('cooling') || k.contains('fan') || k.contains('thermal')) return Icons.ac_unit_outlined;
    if (k.contains('lighting') || k.contains('rgb') || k.contains('led')) return Icons.lightbulb_outlined;
    if (k.contains('document') || k.contains('packaging') || k.contains('warranty') || k.contains('box')) return Icons.description_outlined;
    if (k.contains('function') || k.contains('feature')) return Icons.build_outlined;
    if (k.contains('security') || k.contains('sensor')) return Icons.security_outlined;
    if (k.contains('weight') || k.contains('material')) return Icons.fitness_center_outlined;
    if (k.contains('input') || k.contains('keyboard')) return Icons.keyboard_outlined;
    return Icons.tune;
  }

  Color _getGroupColor(String groupKey) {
    final k = groupKey.toLowerCase().replaceAll('_', ' ');
    if (k.contains('general') || k.contains('information')) return const Color(0xFF5C6BC0);
    if (k.contains('display') || k.contains('screen')) return const Color(0xFF2196F3);
    if (k.contains('processor') || k.contains('cpu') || k.contains('performance')) return const Color(0xFFFF5722);
    if (k.contains('graphic') || k.contains('gpu')) return const Color(0xFFE91E63);
    if (k.contains('memory') || k.contains('ram')) return const Color(0xFF3F51B5);
    if (k.contains('storage') || k.contains('disk') || k.contains('optical')) return const Color(0xFF607D8B);
    if (k.contains('battery') || k.contains('power')) return const Color(0xFF4CAF50);
    if (k.contains('camera')) return const Color(0xFF9C27B0);
    if (k.contains('connect') || k.contains('network')) return const Color(0xFF00BCD4);
    if (k.contains('port') || k.contains('slot') || k.contains('expansion')) return const Color(0xFF42A5F5);
    if (k.contains('audio') || k.contains('sound')) return const Color(0xFFE91E63);
    if (k.contains('design') || k.contains('physical') || k.contains('dimension') || k.contains('chassis')) return const Color(0xFF795548);
    if (k.contains('software') || k.contains('os')) return const Color(0xFF7E57C2);
    if (k.contains('cooling') || k.contains('fan')) return const Color(0xFF29B6F6);
    if (k.contains('lighting') || k.contains('rgb')) return const Color(0xFFFFC107);
    if (k.contains('document') || k.contains('packaging') || k.contains('warranty')) return const Color(0xFF78909C);
    if (k.contains('function') || k.contains('feature')) return const Color(0xFFAB47BC);
    if (k.contains('security') || k.contains('sensor')) return const Color(0xFFEC407A);
    return const Color(0xFF9E9E9E);
  }

  @override
  void initState() {
    super.initState();
    // Use Firestore data directly — all groups collapsed
    _expanded = {
      for (final key in widget.specs.keys) key: false,
    };
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
    return s.split(' ').map((w) {
      if (w.isEmpty) return w;
      return w[0].toUpperCase() + w.substring(1);
    }).join(' ');
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
    // Try exact match
    final exact = map[k];
    if (exact != null) return exact;
    // Bidirectional dictionary fallback (EN↔TR)
    final locale = Localizations.localeOf(context).languageCode;
    final svc = SpecTranslationService.instance;
    if (svc.isLoaded) {
      if (locale == 'tr') {
        final full = svc.translate(k);
        if (full != k) return _titleCase(full);
        final wordLevel = svc.translateWords(k);
        if (wordLevel != k) return _titleCase(wordLevel);
      } else {
        final full = svc.translateToEn(k);
        if (full != k) return _titleCase(full);
        final wordLevel = svc.translateWordsToEn(k);
        if (wordLevel != k) return _titleCase(wordLevel);
      }
    }
    // Multilingual word-level dictionary (all languages)
    if (locale != 'en') {
      final translated = spec_dict.translateSpec(key, locale);
      if (translated.toLowerCase() != k) return _titleCase(translated);
    }
    return _formatKey(key);
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
    // 1. Try exact match (fast path)
    final exact = map[k];
    if (exact != null) return exact;
    // 2. Scraper dictionary (7300+ entries, bidirectional EN↔TR)
    final locale = Localizations.localeOf(context).languageCode;
    final svc = SpecTranslationService.instance;
    if (svc.isLoaded) {
      if (locale == 'tr') {
        // EN→TR translation
        final full = svc.translate(k);
        if (full != k) return _titleCase(full);
        final wordLevel = svc.translateWords(k);
        if (wordLevel != k) return _titleCase(wordLevel);
      } else {
        // TR→EN translation (for leftover Turkish spec names)
        final full = svc.translateToEn(k);
        if (full != k) return _titleCase(full);
        final wordLevel = svc.translateWordsToEn(k);
        if (wordLevel != k) return _titleCase(wordLevel);
      }
    }
    // 3. Multilingual word-level dictionary (all languages)
    if (locale != 'en') {
      final translated = spec_dict.translateSpec(key, locale);
      if (translated.toLowerCase() != k) return _titleCase(translated);
    }
    return _formatKey(key);
  }

  /// Translate a multi-word spec name word-by-word using a dictionary.
  static String _translateWords(String input, Map<String, String> dict) {
    final parts = input.split(RegExp(r'(\s+)'));
    final translated = <String>[];
    bool anyTranslated = false;
    for (final part in parts) {
      final clean = part.trim().toLowerCase();
      if (clean.isEmpty || clean == '&' || clean == '/' || clean == '-') {
        if (clean == '&') translated.add('ve');
        else if (clean == '/') translated.add('/');
        else if (clean.isNotEmpty) translated.add(part);
        continue;
      }
      final tr = dict[clean];
      if (tr != null) {
        if (tr.isNotEmpty) translated.add(tr); // skip empty translations (stop words)
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
      case 'tr': return _trWordDict;
      default: return const {};
    }
  }

  static const _trWordDict = <String, String>{
    // Core hardware
    'processor': 'İşlemci', 'cpu': 'İşlemci', 'chipset': 'Yonga Seti',
    'core': 'Çekirdek', 'cores': 'Çekirdek', 'thread': 'İş Parçacığı', 'threads': 'İş Parçacığı',
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
    'connectivity': 'Bağlantı', 'interface': 'Arayüz', 'interfaces': 'Arayüzler',
    'bluetooth': 'Bluetooth', 'wifi': 'Wi-Fi', 'wi-fi': 'Wi-Fi',
    'nfc': 'NFC', 'gps': 'GPS', 'lte': 'LTE', '5g': '5G', '4g': '4G',
    'band': 'Bant', 'bands': 'Bantlar',
    'signal': 'Sinyal', 'range': 'Menzil', 'antenna': 'Anten',
    'sim': 'SIM', 'dual': 'Çift', 'single': 'Tekli',
    'port': 'Port', 'ports': 'Portlar', 'usb': 'USB',
    'hdmi': 'HDMI', 'jack': 'Jak', 'headphone': 'Kulaklık',
    'input': 'Giriş', 'output': 'Çıkış',
    // Audio
    'audio': 'Ses', 'sound': 'Ses', 'speaker': 'Hoparlör', 'speakers': 'Hoparlörler',
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
    if (k.contains('basic info') || k.contains('general info') ||
        k.contains('information') || k.contains('release') ||
        k.contains('general') || k.contains('overview')) return 1;

    // 2. DESIGN — First visual impression; what the user feels when seeing the product
    if (k.contains('design') || k.contains('physical') ||
        k.contains('dimension') || k.contains('build') ||
        k.contains('chassis') || k.contains('weight') ||
        k.contains('material') || k.contains('color')) return 2;

    // 3. DISPLAY — The surface the user interacts with the most
    if (k.contains('display') || k.contains('screen') ||
        k.contains('monitor') || k.contains('panel')) return 3;

    // 4. PERFORMANCE / PROCESSOR — "How fast is it?" — Most frequently asked
    if (k.contains('basic hard') || k.contains('processor') ||
        k.contains('cpu') || k.contains('chipset') ||
        k.contains('performance') || k.contains('computing')) return 4;

    // 5. MEMORY / RAM — Extension of performance
    if (k.contains('memory') || k.contains('ram')) return 5;

    // 6. STORAGE — Capacity
    if (k.contains('storage') || k.contains('disk') ||
        k.contains('ssd') || k.contains('hdd') ||
        k.contains('optical') || k.contains('flash')) return 6;

    // 7. CAMERA — Strongest purchase motivator in 2024
    if (k.contains('camera') || k.contains('photo') ||
        k.contains('imaging') || k.contains('optic')) return 7;

    // 8. BATTERY — A constant concern in daily use
    if (k.contains('battery') || k.contains('power') ||
        k.contains('charging') || k.contains('endurance')) return 8;

    // 9. GPU / GRAPHICS — Gaming and visual performance
    if (k.contains('graphic') || k.contains('gpu') ||
        k.contains('video card') || k.contains('vga')) return 9;

    // 10. NETWORK / CELLULAR — Connectivity (4G/5G matters)
    if (k.contains('network') || k.contains('cellular') ||
        k.contains('sim') || k.contains('lte') || k.contains('5g') ||
        k.contains('connect') && !k.contains('wireless')) return 10;

    // 11. WIRELESS — WiFi, BT, NFC
    if (k.contains('wireless') || k.contains('wifi') ||
        k.contains('bluetooth') || k.contains('nfc') ||
        k.contains('gps') || k.contains('navigation')) return 11;

    // 12. OS / SOFTWARE — Ecosystem and platform
    if (k.contains('operating') || k.contains('software') ||
        k.contains(' os') || k.contains('system')) return 12;

    // 13. AUDIO / MULTIMEDIA — Media consumption
    if (k.contains('audio') || k.contains('sound') ||
        k.contains('speaker') || k.contains('multimedia') ||
        k.contains('music')) return 13;

    // 14. FEATURES / SECURITY / SENSORS — Additional features
    if (k.contains('feature') || k.contains('function') ||
        k.contains('security') || k.contains('sensor') ||
        k.contains('biometric') || k.contains('fingerprint')) return 14;

    // 15. PORTS / CONNECTIONS — Physical connections
    if (k.contains('port') || k.contains('slot') ||
        k.contains('usb') || k.contains('interface') ||
        k.contains('expansion') || k.contains('other connection') ||
        k.contains('connector')) return 15;

    // 16. COOLING — Desktop/Laptop specific
    if (k.contains('cooling') || k.contains('fan') ||
        k.contains('thermal') || k.contains('heat')) return 16;

    // 17. INPUT — Keyboard, mouse
    if (k.contains('input') || k.contains('keyboard') ||
        k.contains('mouse') || k.contains('touchpad')) return 17;

    // 18. PACKAGING / WARRANTY — Box contents, warranty
    if (k.contains('document') || k.contains('packaging') ||
        k.contains('warranty') || k.contains('box') ||
        k.contains('contents') || k.contains('lighting') ||
        k.contains('rgb') || k.contains('led')) return 18;

    return 99;
  }

  @override
  Widget build(BuildContext context) {
    final sortedEntries = widget.specs.entries.toList()
      ..sort((a, b) => _sectionPriority(a.key).compareTo(_sectionPriority(b.key)));
    final specs = Map.fromEntries(sortedEntries);

    return Container(
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: context.dividerColor),
        boxShadow: [BoxShadow(color: Colors.white.withValues(alpha: 0.04), blurRadius: 8)],
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
                _CardHeader(icon: Icons.settings_input_component, label: context.l10n?.specs ?? 'Specifications', color: AppTheme.primaryBlue),
                const Spacer(),
                Text(
                  '${specs.length} ${context.l10n?.groups ?? 'groups'}',
                  style: const TextStyle(fontSize: 12, color: AppTheme.slate500),
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
                  // Group header — clean white with colored icon
                  Material(
                    color: context.surfaceVariantColor,
                    child: InkWell(
                      onTap: () => setState(() => _expanded[groupKey] = !isExpanded),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                        child: Row(
                          children: [
                            Container(
                              width: 32, height: 32,
                              decoration: BoxDecoration(
                                color: color.withValues(alpha: 0.12),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Icon(icon, size: 16, color: color),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Text(
                                _localizedGroupName(context, groupKey),
                                style: TextStyle(
                                  fontWeight: FontWeight.w600,
                                  fontSize: 13,
                                  color: Theme.of(context).colorScheme.primary,
                                ),
                                textAlign: TextAlign.center,
                              ),
                            ),
                            Text(
                              '${value.length} ${context.l10n?.specsCount ?? 'specs'}',
                              style: const TextStyle(fontSize: 11, color: AppTheme.slate400),
                            ),
                            const SizedBox(width: 6),
                            AnimatedRotation(
                              turns: isExpanded ? 0.5 : 0,
                              duration: const Duration(milliseconds: 200),
                              child: const Icon(Icons.expand_more, size: 18, color: AppTheme.slate400),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                  if (isExpanded)
                    Builder(builder: (context) {
                      int rowIdx = 0;
                      return Column(
                        children: value.entries.expand<Widget>((sub) {
                          final subLabel = _localizedSpecName(context, sub.key.toString());
                          final subVal = sub.value;
                          // Handle nested maps within a group
                          if (subVal is Map && subVal.isNotEmpty) {
                            return subVal.entries.map((inner) {
                              final innerVal = inner.value?.toString() ?? '';
                              if (innerVal.isEmpty || innerVal == '?' || innerVal == 'null' || innerVal == '{}' || innerVal == '[]') {
                                return const SizedBox.shrink();
                              }
                              final odd = rowIdx++ % 2 == 1;
                              return _SpecRow(
                                label: _localizedSpecName(context, inner.key.toString()),
                                value: innerVal,
                                isDark: widget.isDark,
                                accent: color,
                                isOdd: odd,
                              );
                            });
                          }
                          final subValue = subVal?.toString() ?? '';
                          if (subValue.isEmpty || subValue == '?' || subValue == 'null' || subValue == '{}' || subValue == '[]') {
                            return [const SizedBox.shrink()];
                          }
                          final odd = rowIdx++ % 2 == 1;
                          return [_SpecRow(
                            label: subLabel,
                            value: subValue,
                            isDark: widget.isDark,
                            accent: color,
                            isOdd: odd,
                          )];
                        }).toList(),
                      );
                    }),
                ],
              );
            }

            // ── Flat key-value (fallback) ──
            final flatValue = value?.toString() ?? '';
            if (flatValue.isEmpty || flatValue == '?' || flatValue == 'null' || flatValue == '{}' || flatValue == '[]') {
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
  const _SpecRow({required this.label, required this.value, required this.isDark, required this.accent, this.isOdd = false});

  /// Capitalize first letter of each word but preserve acronyms (USB, HDMI...).
  static String _applyValueTitleCase(String s) {
    if (s.isEmpty) return s;
    return s.split(' ').map((w) {
      if (w.isEmpty) return w;
      // Numbers and technical codes (start with digit): leave as is
      if (RegExp(r'^[\d\W]').hasMatch(w)) return w;
      return w[0].toUpperCase() + w.substring(1);
    }).join(' ');
  }

  String _localizedValue(BuildContext context, String val) {
    final l = context.l10n;
    if (l == null) return val;
    final v = val.trim().toLowerCase();
    // Handle "No." variant (with period)
    if (v == 'no.' || v == 'no') {
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
    final key = enToKey[v];
    if (key != null && trMap[key] != null) return trMap[key]!;
    // Bidirectional dictionary fallback for spec values
    final locale = Localizations.localeOf(context).languageCode;
    final svc = SpecTranslationService.instance;
    if (svc.isLoaded) {
      if (locale == 'tr') {
        // 1. Full-phrase exact match
        final full = svc.translate(v);
        if (full != v) return _applyValueTitleCase(full);
        // 2. Word-by-word (handles multi-word values like "side mounted")
        final words = svc.translateWords(v);
        if (words != v) return _applyValueTitleCase(words);
        // 3. Hyphen-split: "side-mounted" → translate "side" + "mounted" separately
        if (v.contains('-')) {
          final parts = v.split('-');
          final translated = parts.map((p) {
            final t = svc.translate(p.trim());
            return t != p.trim() ? t : p.trim();
          }).join(' ');
          if (translated != v.replaceAll('-', ' ')) return _applyValueTitleCase(translated);
        }
      } else {
        final full = svc.translateToEn(v);
        if (full != v) return _applyValueTitleCase(full);
      }
    }
    // Multilingual word-level dictionary fallback
    if (locale != 'en') {
      final translated = spec_dict.translateSpecValue(val, locale);
      if (translated != val) return translated;
    }
    // Capitalize first letter of value for any language
    return _applyValueTitleCase(val);
  }

  @override
  Widget build(BuildContext context) {
    // Skip empty, null-like, or serialized object values
    final trimmed = value.trim();
    if (trimmed.isEmpty || trimmed == '?' || trimmed == 'null' || 
        trimmed == '{}' || trimmed == '[]' ||
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
                    color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.6),
                  ),
                ),
              ),
              Expanded(
                flex: 5,
                child: valueWidget,
              ),
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
    if (locale == 'en') return val;
    final v = val.trim().toLowerCase();
    switch (locale) {
      case 'tr':
        const trMap = {
          'yes': 'Var', 'no': 'Yok', 'true': 'Evet', 'false': 'Hayır',
          'available': 'Mevcut', 'not available': 'Mevcut Değil',
          'supported': 'Destekleniyor', 'not supported': 'Desteklenmiyor',
          'included': 'Dahil', 'not included': 'Dahil Değil',
          'active': 'Aktif', 'passive': 'Pasif',
          'wired': 'Kablolu', 'wireless': 'Kablosuz',
          'touch': 'Dokunmatik', 'mechanical': 'Mekanik',
          'mono': 'Mono', 'stereo': 'Stereo',
          'front': 'Ön', 'rear': 'Arka', 'back': 'Arka',
          'left': 'Sol', 'right': 'Sağ',
          'black': 'Siyah', 'white': 'Beyaz', 'silver': 'Gümüş',
          'gold': 'Altın', 'blue': 'Mavi', 'red': 'Kırmızı',
          'green': 'Yeşil', 'gray': 'Gri', 'grey': 'Gri',
        };
        return trMap[v] ?? val;
      case 'de':
        const deMap = {'yes': 'Ja', 'no': 'Nein', 'available': 'Verfügbar', 'not available': 'Nicht verfügbar'};
        return deMap[v] ?? val;
      case 'fr':
        const frMap = {'yes': 'Oui', 'no': 'Non', 'available': 'Disponible', 'not available': 'Non disponible'};
        return frMap[v] ?? val;
      case 'es':
        const esMap = {'yes': 'Sí', 'no': 'No', 'available': 'Disponible', 'not available': 'No disponible'};
        return esMap[v] ?? val;
      default:
        return val;
    }
  }

  Widget _buildValueWidget(BuildContext context, String rawVal) {
    // Translate common value words to locale language
    final val = _localizedSpecValue(context, rawVal);
    // Detect multi-value strings (comma/semicolon/newline separated)
    // Lower thresholds so short multi-values like "Android, iOS" also split
    List<String>? parts;
    if (val.contains('\n')) {
      parts = val.split('\n').map((s) => s.trim()).where((s) => s.isNotEmpty).toList();
    } else if (val.contains(',') && val.length > 8) {
      parts = val.split(',').map((s) => s.trim()).where((s) => s.isNotEmpty).toList();
    } else if (val.contains(';') && val.length > 8) {
      parts = val.split(';').map((s) => s.trim()).where((s) => s.isNotEmpty).toList();
    } else if (val.contains(' / ') && val.length > 8) {
      parts = val.split(' / ').map((s) => s.trim()).where((s) => s.isNotEmpty).toList();
    }

    if (parts != null && parts.length >= 2) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: parts.map((p) => Padding(
          padding: const EdgeInsets.only(bottom: 2),
          child: Text(
            '• $p',
            style: TextStyle(
              fontSize: 12.5,
              fontWeight: FontWeight.w600,
              color: Theme.of(context).colorScheme.onSurface,
              height: 1.4,
            ),
            textAlign: TextAlign.end,
            softWrap: true,
          ),
        )).toList(),
      );
    }

    return Text(
      val,
      style: TextStyle(
        fontSize: 13,
        fontWeight: FontWeight.w600,
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
      children: tags.map((t) => Chip(
        label: Text('#$t', style: const TextStyle(fontSize: 12)),
        backgroundColor: AppTheme.primaryBlue.withValues(alpha: 0.08),
        side: const BorderSide(color: Colors.transparent),
        padding: EdgeInsets.zero,
        materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
      )).toList(),
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
          if (val.isNotEmpty && val != '0' && val != '-' && val.toLowerCase() != 'n/a') {
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
              if (val.isNotEmpty && val != '0' && val != '-' && val.toLowerCase() != 'n/a') {
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
        ('Screen Size',    ['screen size', 'display size', 'ekran boyutu']),
        ('RAM',            ['ram', 'memory size', 'bellek (ram)', 'bellek']),
        ('Storage',        ['internal storage', 'storage capacity', 'dahili depolama']),
        ('Battery',        ['battery capacity', 'batarya kapasitesi']),
        ('Main Camera',    ['main camera', 'rear camera', 'camera resolution', 'kamera']),
        ('Front Camera',   ['front camera', 'selfie camera', 'on kamera']),
        ('Processor',      ['processor', 'chipset', 'cpu model', 'cpu name', 'islemci']),
        ('CPU Cores',      ['cpu core', 'core count', 'number of core']),
        ('CPU Frequency',  ['cpu frequenc', 'clock speed', 'cpu speed']),
        ('Screen Tech',    ['screen tech', 'display tech', 'panel type', 'ekran teknolojisi']),
        ('Resolution',     ['screen resolution', 'display resolution', 'ekran cozunurlugu']),
        ('Pixel Density',  ['pixel density', 'ppi']),
        ('5G',             ['5g']),
        ('NFC',            ['nfc']),
        ('GPS',            ['gps']),
        ('Bluetooth',      ['bluetooth']),
        ('Fast Charge',    ['fast charg', 'charging power', 'hizli sarj']),
        ('USB Type',       ['usb type', 'usb connector', 'usb version']),
        ('Water Rating',   ['water resist', 'ip rating', 'ipx', 'suya dayaniklilik']),
        ('Fingerprint',    ['fingerprint', 'parmak izi']),
        ('OS',             ['operating system', 'android version']),
        ('Weight',         ['weight', 'agirlik']),
        ('SIM',            ['sim count', 'hat sayisi', 'sim card']),
      ];
    }

    if (sub.contains('tablet')) {
      return [
        ('Screen Size',    ['screen size', 'display size', 'ekran boyutu']),
        ('RAM',            ['ram', 'memory size', 'bellek']),
        ('Storage',        ['internal storage', 'storage capacity', 'dahili depolama']),
        ('Memory Card',    ['memory card', 'microsd', 'expandable storage']),
        ('Battery',        ['battery capacity', 'batarya kapasitesi']),
        ('Processor',      ['processor', 'chipset', 'cpu model', 'islemci']),
        ('CPU Cores',      ['cpu core', 'core count', 'number of core']),
        ('CPU Frequency',  ['cpu frequenc', 'clock speed']),
        ('Screen Tech',    ['screen tech', 'display tech', 'panel type', 'ekran teknolojisi']),
        ('Resolution',     ['screen resolution', 'display resolution']),
        ('Pixel Density',  ['pixel density', 'ppi']),
        ('Screen Area',    ['screen area', 'display area', 'ekran alani']),
        ('WiFi',           ['wifi', 'wi-fi', '802.11']),
        ('Bluetooth',      ['bluetooth']),
        ('GPS',            ['gps']),
        ('NFC',            ['nfc']),
        ('USB Type',       ['usb type', 'usb connector']),
        ('Weight',         ['weight', 'agirlik']),
        ('OS',             ['operating system']),
      ];
    }

    if (sub.contains('laptop') || sub.contains('notebook')) {
      return [
        ('Processor',      ['processor model', 'cpu model', 'cpu name', 'islemci modeli']),
        ('Processor Gen',  ['processor generation', 'cpu generation', 'nesil']),
        ('Base Freq',      ['base frequenc', 'base clock', 'temel frekans']),
        ('CPU Cores',      ['cpu core', 'core count', 'number of core']),
        ('TDP',            ['tdp', 'thermal design power']),
        ('RAM',            ['ram', 'memory size', 'bellek']),
        ('Storage',        ['ssd', 'storage size', 'hard disk', 'nvme']),
        ('Screen Size',    ['screen size', 'display size']),
        ('Screen Tech',    ['screen tech', 'display tech', 'panel type']),
        ('Resolution',     ['screen resolution', 'display resolution']),
        ('Refresh Rate',   ['refresh rate', 'hz']),
        ('GPU',            ['gpu', 'graphics card', 'video card', 'ekran karti']),
        ('Battery',        ['battery capacity', 'batarya']),
        ('OS',             ['operating system']),
        ('WiFi',           ['wifi', 'wi-fi', '802.11']),
        ('Bluetooth',      ['bluetooth']),
        ('USB Type',       ['usb type', 'usb-c', 'thunderbolt']),
        ('Weight',         ['weight', 'agirlik']),
      ];
    }

    if (sub.contains('desktop')) {
      return [
        ('Processor',      ['processor model', 'cpu model', 'cpu name']),
        ('Processor Gen',  ['processor generation', 'cpu generation', 'generation']),
        ('Base Freq',      ['base frequenc', 'base clock']),
        ('CPU Cores',      ['cpu core', 'core count', 'number of core']),
        ('TDP',            ['tdp', 'thermal design power']),
        ('RAM',            ['ram', 'memory size', 'bellek']),
        ('Storage',        ['storage', 'disk', 'ssd', 'hdd']),
        ('GPU',            ['gpu', 'graphics']),
        ('Case Type',      ['case type', 'chassis type', 'kasa tipi']),
        ('Product Series', ['product series', 'series', 'model series']),
        ('OS',             ['operating system']),
        ('Display Feat',   ['display features', 'display body ratio', 'screen to body']),
      ];
    }

    if (sub.contains('cpu') || sub.contains('processor')) {
      return [
        ('Model',          ['processor model', 'cpu model', 'cpu name']),
        ('Series',         ['series', 'product line']),
        ('Cores',          ['core count', 'number of core', ' cores']),
        ('Threads',        ['thread count', 'threads']),
        ('Base Clock',     ['base frequenc', 'base clock', 'base speed']),
        ('Boost Clock',    ['boost frequenc', 'max clock', 'turbo']),
        ('TDP',            ['tdp', 'thermal design power']),
        ('Socket',         ['socket', 'platform']),
        ('L3 Cache',       ['l3 cache', 'cache']),
        ('Process',        ['process node', 'manufacturing process', 'nm']),
      ];
    }

    if (sub.contains('gpu') || sub.contains('graphic')) {
      return [
        ('GPU Model',      ['gpu model', 'product name', 'chip']),
        ('VRAM',           ['vram', 'video memory', 'memory size']),
        ('Memory Type',    ['memory type', 'vram type']),
        ('Memory Bus',     ['memory bus', 'bus width']),
        ('Base Clock',     ['base clock', 'core clock']),
        ('Boost Clock',    ['boost clock', 'max clock']),
        ('TDP',            ['tdp', 'power consumption']),
        ('Interface',      ['interface', 'pcie']),
        ('Outputs',        ['output', 'display output', 'hdmi']),
      ];
    }

    if (sub.contains('ram') || (sub.contains('memory') && !sub.contains('card'))) {
      return [
        ('Capacity',       ['capacity', 'size']),
        ('Speed',          ['speed', 'frequency', 'mhz']),
        ('Type',           ['type', 'ddr']),
        ('CAS Latency',    ['cas', 'latency']),
        ('Voltage',        ['voltage']),
        ('Form Factor',    ['form factor', 'dimm', 'so-dimm']),
      ];
    }

    if (sub.contains('ssd') || sub.contains('hdd') || sub.contains('storage') || sub.contains('hard')) {
      return [
        ('Capacity',       ['capacity', 'storage size']),
        ('Interface',      ['interface', 'pcie', 'sata', 'nvme']),
        ('Read Speed',     ['read speed', 'sequential read']),
        ('Write Speed',    ['write speed', 'sequential write']),
        ('Form Factor',    ['form factor']),
        ('NAND Type',      ['nand', 'flash type']),
      ];
    }

    if (sub.contains('monitor')) {
      return [
        ('Screen Size',    ['screen size', 'display size']),
        ('Resolution',     ['resolution']),
        ('Panel Type',     ['panel type', 'panel']),
        ('Refresh Rate',   ['refresh rate', 'hz']),
        ('Response Time',  ['response time']),
        ('HDR',            ['hdr']),
        ('Brightness',     ['brightness', 'nits', 'cd/m']),
        ('Color Gamut',    ['color gamut', 'srgb', 'dci-p3']),
        ('Sync Tech',      ['freesync', 'g-sync', 'adaptive sync']),
        ('Connectivity',   ['hdmi', 'displayport', 'usb-c']),
      ];
    }

    if (sub.contains('tv') || sub.contains('television')) {
      return [
        ('Screen Size',    ['screen size', 'display size']),
        ('Resolution',     ['resolution']),
        ('Panel Type',     ['panel type']),
        ('HDR',            ['hdr']),
        ('Smart TV',       ['smart tv', 'smart']),
        ('Refresh Rate',   ['refresh rate']),
        ('HDMI Ports',     ['hdmi']),
        ('Brightness',     ['brightness', 'nits']),
        ('Viewing Angle',  ['viewing angle']),
        ('Dolby',          ['dolby']),
      ];
    }

    if (sub.contains('headphone') || sub.contains('earphone') || sub.contains('earbuds')) {
      return [
        ('Type',           ['type', 'form factor', 'design']),
        ('Connectivity',   ['connectivity', 'bluetooth', 'wireless']),
        ('BT Version',     ['bluetooth version', 'bt version']),
        ('Battery Life',   ['battery life', 'playback time', 'battery']),
        ('Charge Time',    ['charge time', 'charging time']),
        ('Noise Cancel',   ['noise cancell', 'anc', 'active noise']),
        ('Driver Size',    ['driver size', 'driver']),
        ('Frequency',      ['frequency response']),
        ('Impedance',      ['impedance', 'ohm']),
        ('Microphone',     ['microphone', 'mic']),
        ('Water Rating',   ['water resist', 'ip rating', 'ipx']),
        ('Weight',         ['weight']),
      ];
    }

    if (sub.contains('speaker') || sub.contains('soundbar')) {
      return [
        ('Power',          ['power output', 'rms', 'watt']),
        ('Connectivity',   ['bluetooth', 'connectivity', 'wireless']),
        ('BT Version',     ['bluetooth version']),
        ('Battery',        ['battery', 'playback time']),
        ('Channels',       ['channel', 'subwoofer', '2.1', '5.1']),
        ('Frequency',      ['frequency response']),
        ('Water Rating',   ['water resist', 'ip rating', 'ipx']),
        ('Weight',         ['weight']),
      ];
    }

    if (sub.contains('smartwatch') || sub.contains('watch')) {
      return [
        ('Display Size',   ['display size', 'screen size']),
        ('Display Tech',   ['display tech', 'screen tech', 'panel type']),
        ('Battery Life',   ['battery life', 'battery']),
        ('OS',             ['os', 'operating system', 'watch os']),
        ('Processor',      ['processor', 'chip', 'cpu']),
        ('RAM',            ['ram', 'memory']),
        ('Storage',        ['storage', 'internal storage']),
        ('GPS',            ['gps']),
        ('Heart Rate',     ['heart rate']),
        ('SpO2',           ['spo2', 'blood oxygen']),
        ('ECG',            ['ecg', 'electrocardiogram']),
        ('Water Rating',   ['water resist', 'ip rating', 'atm']),
        ('NFC',            ['nfc']),
        ('Weight',         ['weight']),
      ];
    }

    if (sub.contains('camera')) {
      return [
        ('Sensor',         ['sensor type', 'sensor size', 'sensor']),
        ('Resolution',     ['resolution', 'megapixel', 'mp']),
        ('Aperture',       ['aperture', 'f/']),
        ('Focal Length',   ['focal length', 'lens']),
        ('ISO',            ['iso']),
        ('Shutter Speed',  ['shutter speed']),
        ('Video',          ['video resolution', 'video recording', '4k']),
        ('Stabilization',  ['stabilization', 'ois', 'ibis']),
        ('AF System',      ['autofocus', 'af system']),
        ('Battery',        ['battery', 'shots per charge']),
        ('Weight',         ['weight']),
      ];
    }

    if (sub.contains('motherboard')) {
      return [
        ('Chipset',        ['chipset']),
        ('Socket',         ['socket', 'cpu socket']),
        ('Form Factor',    ['form factor', 'atx']),
        ('Memory Slots',   ['memory slot', 'dimm']),
        ('Max RAM',        ['max memory', 'maximum ram']),
        ('Memory Type',    ['memory type', 'ddr']),
        ('PCIe Slots',     ['pcie x16', 'pcie slot']),
        ('M.2 Slots',      ['m.2', 'm2 slot']),
        ('USB Ports',      ['usb', 'usb 3']),
        ('Network',        ['network', 'ethernet', '2.5g']),
        ('WiFi',           ['wifi', 'wi-fi', '802.11']),
        ('Bluetooth',      ['bluetooth']),
      ];
    }

    if (sub.contains('psu') || sub.contains('power supply')) {
      return [
        ('Wattage',        ['wattage', 'power output', 'watt']),
        ('Efficiency',     ['efficiency', '80 plus', '80plus']),
        ('Modular',        ['modular']),
        ('Form Factor',    ['form factor', 'atx']),
        ('Fan Size',       ['fan size']),
        ('PFC',            ['pfc', 'power factor']),
      ];
    }

    if (sub.contains('cooler') || sub.contains('cooling')) {
      return [
        ('Type',           ['type', 'cooler type']),
        ('TDP Support',    ['tdp support', 'max tdp']),
        ('Fan Size',       ['fan size', 'fan diameter']),
        ('Fan Speed',      ['fan speed', 'rpm']),
        ('Noise Level',    ['noise', 'dba', 'db level']),
        ('Socket Support', ['socket', 'compatibility']),
        ('Dimensions',     ['dimension', 'height', 'size']),
        ('Weight',         ['weight']),
      ];
    }

    if (sub.contains('keyboard')) {
      return [
        ('Switch Type',    ['switch type', 'switch']),
        ('Connectivity',   ['connectivity', 'wireless', 'bluetooth']),
        ('BT Version',     ['bluetooth version']),
        ('Layout',         ['layout', 'form factor']),
        ('Backlight',      ['backlight', 'rgb', 'led']),
        ('Battery',        ['battery', 'battery life']),
        ('Interface',      ['interface', 'usb']),
        ('N-Key',          ['rollover', 'nkro', 'anti-ghosting']),
        ('Weight',         ['weight']),
      ];
    }

    if (sub.contains('mouse') || sub.contains('mice')) {
      return [
        ('DPI',            ['dpi', 'sensitivity', 'cpi']),
        ('Polling Rate',   ['polling rate', 'hz']),
        ('Connectivity',   ['connectivity', 'wireless', 'bluetooth']),
        ('Sensor',         ['sensor type', 'sensor model', 'sensor']),
        ('Buttons',        ['button', 'programmable']),
        ('Battery',        ['battery', 'battery life']),
        ('RGB',            ['rgb', 'lighting']),
        ('Weight',         ['weight']),
      ];
    }

    if (sub.contains('router')) {
      return [
        ('WiFi Standard',  ['wifi standard', 'wifi 6', 'wifi 5', '802.11']),
        ('Max Speed',      ['max speed', 'throughput', 'mbps', 'gbps']),
        ('Frequency',      ['frequency band', 'dual band', 'tri band']),
        ('LAN Ports',      ['lan port', 'ethernet port', 'wan']),
        ('Antennas',       ['antenna']),
        ('Processor',      ['processor', 'cpu']),
        ('RAM',            ['ram', 'memory']),
        ('USB Port',       ['usb port']),
        ('Security',       ['security', 'wpa', 'encryption']),
      ];
    }

    if (sub.contains('console') || sub.contains('gaming')) {
      return [
        ('Processor',      ['processor', 'cpu']),
        ('GPU',            ['gpu', 'graphics']),
        ('RAM',            ['ram', 'memory']),
        ('Storage',        ['storage', 'ssd']),
        ('Resolution',     ['resolution', '4k', '8k']),
        ('Optical Drive',  ['optical', 'blu-ray', 'disc']),
        ('WiFi',           ['wifi', 'wi-fi']),
        ('Bluetooth',      ['bluetooth']),
        ('USB Ports',      ['usb', 'usb port']),
      ];
    }

    if (sub.contains('projector')) {
      return [
        ('Resolution',     ['resolution']),
        ('Brightness',     ['brightness', 'lumens', 'ansi']),
        ('Contrast Ratio', ['contrast']),
        ('Throw Ratio',    ['throw ratio']),
        ('Lamp Life',      ['lamp life', 'lamp hour']),
        ('Connectivity',   ['hdmi', 'connectivity']),
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
        if (val.isNotEmpty && val != '0' && val != '-' && val.toLowerCase() != 'n/a') {
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
                  width: 28, height: 28,
                  decoration: BoxDecoration(
                    color: AppTheme.primaryBlue.withValues(alpha: 0.10),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Icon(Icons.bolt_rounded,
                      color: AppTheme.primaryBlue, size: 16),
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
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
                  decoration: BoxDecoration(
                    color: isOdd ? context.surfaceColor.withValues(alpha: 0.5) : Colors.transparent,
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
    final display = value.length > 18 ? '${value.substring(0, 16)}\u2026' : value;
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
              const Icon(Icons.settings_input_component_outlined, size: 48, color: AppTheme.slate400),
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
        _SpecsCard(
          specs: product.specSections.isNotEmpty ? product.specSections : product.specs,
          cardBg: cardBg,
          isDark: isDark,
        ),
      ],
    );
  }
}

// ═══════════════════════════════════════════════════════════
// KEY SPECS GRID
// ═══════════════════════════════════════════════════════════

class _KeySpecsGrid extends StatelessWidget {
  final ProductEntity product;
  const _KeySpecsGrid({required this.product});

  // Category-based key spec names — priority ordered, at least 9 per category.
  // Each entry is a list of ALIASES that match the same concept; first match wins.
  // This way "Screen Size", "Display Size", "Ekran Boyutu" all resolve to one slot.
  static const _categoryKeys = <String, List<List<String>>>{
    'smartphones': [
      ['Screen Size', 'Display Size', 'Ekran Boyutu'],
      ['RAM', 'Memory (RAM)', 'RAM Kapasitesi'],
      ['Storage', 'Internal Storage', 'Dahili Depolama', 'ROM'],
      ['Battery', 'Battery Capacity', 'Pil', 'Pil Kapasitesi'],
      ['Camera', 'Main Camera', 'Kamera', 'Camera Çözünürlük'],
      ['Processor', 'Chipset', 'İşlemci', 'Processor Model', 'CPU'],
      ['OS', 'Operating System', 'İşletim Sistemi'],
      ['5G', 'Network', 'Ağ', '4.5G', 'Cellular'],
      ['Weight', 'Ağırlık'],
    ],
    'tablets': [
      ['Screen Size', 'Display Size', 'Ekran Boyutu'],
      ['RAM', 'Memory (RAM)', 'RAM Kapasitesi'],
      ['Storage', 'Internal Storage', 'Dahili Depolama'],
      ['Battery', 'Battery Capacity', 'Pil'],
      ['Processor', 'Chipset', 'İşlemci', 'Processor Model'],
      ['OS', 'Operating System', 'İşletim Sistemi'],
      ['5G', 'Network', 'Ağ', 'Cellular'],
      ['Display Technology', 'Panel', 'Ekran Teknolojisi'],
      ['Weight', 'Ağırlık'],
    ],
    'laptops': [
      ['Screen Size', 'Display Size', 'Ekran Boyutu'],
      ['RAM', 'Memory (RAM)', 'RAM Kapasitesi'],
      ['Storage', 'SSD', 'Internal Storage', 'Dahili Depolama', 'Hard Disk (SSD)'],
      ['Processor', 'CPU', 'İşlemci', 'Processor Model'],
      ['GPU', 'Graphics Card', 'Ekran Kartı', 'GPU Model', 'Video Card'],
      ['Battery', 'Battery Life', 'Pil'],
      ['OS', 'Operating System', 'İşletim Sistemi'],
      ['Weight', 'Ağırlık'],
      ['Display Technology', 'Panel', 'Refresh Rate', 'Yenileme Hızı'],
    ],
    'monitors': [
      ['Screen Size', 'Display Size', 'Ekran Boyutu'],
      ['Resolution', 'Çözünürlük'],
      ['Panel Type', 'Panel', 'Panel Tipi'],
      ['Refresh Rate', 'Yenileme Hızı'],
      ['Response Time', 'Tepki Süresi'],
      ['HDR', 'HDR Support', 'HDR Desteği'],
      ['Connectivity', 'Bağlantı', 'Ports'],
      ['Aspect Ratio', 'En Boy Oranı'],
      ['Weight', 'Ağırlık'],
    ],
    'tvs': [
      ['Screen Size', 'Display Size', 'Ekran Boyutu'],
      ['Resolution', 'Çözünürlük'],
      ['Panel Type', 'Panel', 'Panel Tipi'],
      ['Smart TV', 'Akıllı TV'],
      ['HDR', 'HDR Support'],
      ['Refresh Rate', 'Yenileme Hızı'],
      ['HDMI', 'HDMI Ports', 'HDMI Girişi'],
      ['OS', 'Operating System', 'İşletim Sistemi'],
      ['Weight', 'Ağırlık'],
    ],
    'headphones': [
      ['Type', 'Tip', 'Form'],
      ['Driver', 'Driver Size', 'Sürücü Boyutu'],
      ['Frequency Response', 'Frekans'],
      ['Impedance', 'Empedans'],
      ['Noise Cancelling', 'ANC', 'Gürültü Engelleme'],
      ['Connectivity', 'Bağlantı', 'Connection'],
      ['Battery', 'Battery Life', 'Pil Ömrü'],
      ['Weight', 'Ağırlık'],
      ['Microphone', 'Mikrofon'],
    ],
    'keyboards': [
      ['Switch Type', 'Switch', 'Anahtar Tipi'],
      ['Layout', 'Düzen'],
      ['Connectivity', 'Bağlantı', 'Connection'],
      ['Backlighting', 'RGB', 'Aydınlatma'],
      ['Battery Life', 'Battery', 'Pil Ömrü'],
      ['Compatibility', 'Uyumluluk'],
      ['Numpad', 'Number Pad'],
      ['Dimensions', 'Boyutlar'],
      ['Weight', 'Ağırlık'],
    ],
    'mice': [
      ['DPI', 'Sensitivity', 'Hassasiyet'],
      ['Connectivity', 'Bağlantı', 'Connection'],
      ['Buttons', 'Button Count', 'Tuş Sayısı'],
      ['Battery', 'Battery Life', 'Pil'],
      ['Sensor', 'Sensör'],
      ['Weight', 'Ağırlık'],
      ['Polling Rate', 'Yoklama Hızı'],
      ['Compatibility', 'Uyumluluk'],
      ['RGB', 'Lighting'],
    ],
    'cameras': [
      ['Sensor Size', 'Sensör Boyutu', 'Sensor'],
      ['Megapixels', 'Resolution', 'Çözünürlük'],
      ['Video Resolution', 'Video', '4K'],
      ['ISO', 'ISO Range'],
      ['Shutter Speed', 'Enstantane'],
      ['Autofocus', 'AF', 'Otomatik Odak'],
      ['Connectivity', 'Bağlantı'],
      ['Battery', 'Pil'],
      ['Weight', 'Ağırlık'],
    ],
    'printers': [
      ['Print Technology', 'Baskı Teknolojisi', 'Type'],
      ['Max Resolution', 'Resolution', 'Çözünürlük'],
      ['Print Speed', 'Speed', 'Baskı Hızı'],
      ['Connectivity', 'Bağlantı'],
      ['Paper Size', 'Kağıt Boyutu'],
      ['Color Print', 'Color', 'Renkli'],
      ['Duplex', 'Çift Taraflı'],
      ['Cartridge Type', 'Kartuş'],
      ['Weight', 'Ağırlık'],
    ],
    'routers': [
      ['WiFi Standard', 'WiFi', 'Wi-Fi'],
      ['Frequency', 'Band', 'Frekans'],
      ['Speed', 'Max Speed', 'Hız'],
      ['Ports', 'LAN Ports', 'Port'],
      ['Coverage', 'Range', 'Kapsama'],
      ['MU-MIMO', 'MIMO'],
      ['Beamforming', 'Beam'],
      ['Security', 'Güvenlik'],
      ['Antennas', 'Antenna', 'Anten'],
    ],
    'ssds': [
      ['Capacity', 'Kapasite', 'Size'],
      ['Interface', 'Arayüz', 'Connection'],
      ['Read Speed', 'Okuma Hızı', 'Sequential Read'],
      ['Write Speed', 'Yazma Hızı', 'Sequential Write'],
      ['Form Factor', 'Form'],
      ['NAND Type', 'NAND', 'Flash Type'],
      ['TBW', 'Endurance'],
      ['Warranty', 'Garanti'],
      ['Encryption', 'Şifreleme'],
    ],
    'hdds': [
      ['Capacity', 'Kapasite', 'Size'],
      ['RPM', 'Devir', 'Rotation Speed'],
      ['Interface', 'Arayüz'],
      ['Cache Size', 'Cache', 'Buffer', 'Önbellek'],
      ['Form Factor', 'Form'],
      ['Read Speed', 'Okuma Hızı'],
      ['Write Speed', 'Yazma Hızı'],
      ['Warranty', 'Garanti'],
      ['Shock Resistance', 'Darbe Dayanımı'],
    ],
    'ram': [
      ['Capacity', 'Kapasite', 'Size'],
      ['Type', 'DDR', 'Tip'],
      ['Speed', 'Clock', 'Hız'],
      ['Latency', 'CAS', 'CL', 'Gecikme'],
      ['Voltage', 'Voltaj'],
      ['Form Factor', 'Form'],
      ['ECC', 'Error Correction'],
      ['Warranty', 'Garanti'],
      ['Heat Spreader', 'Heatsink', 'Soğutucu'],
    ],
    'gpus': [
      ['VRAM', 'Memory', 'Bellek', 'Video Memory'],
      ['Architecture', 'Mimari', 'GPU Chip'],
      ['TDP', 'Power', 'Güç Tüketimi', 'Watt'],
      ['Core Clock', 'Base Clock', 'Temel Saat'],
      ['Boost Clock', 'Turbo Clock'],
      ['Memory Bandwidth', 'Bant Genişliği'],
      ['Ports', 'Display Outputs', 'Çıkış'],
      ['Cooling', 'Fan', 'Soğutma'],
      ['Length', 'Uzunluk', 'Dimensions'],
    ],
    'cpus': [
      ['Cores', 'Core Count', 'Çekirdek'],
      ['Threads', 'Thread Count', 'İş Parçacığı'],
      ['Base Clock', 'Base Frequency', 'Temel Frekans'],
      ['Boost Clock', 'Turbo', 'Max Frequency'],
      ['TDP', 'Power', 'Güç Tüketimi', 'Watt'],
      ['Socket', 'Soket'],
      ['Cache', 'L3 Cache', 'Önbellek'],
      ['Architecture', 'Mimari', 'Process'],
      ['Integrated GPU', 'iGPU', 'Dahili GPU'],
    ],
    'smartwatches': [
      ['Screen Size', 'Display Size', 'Ekran Boyutu'],
      ['Battery', 'Battery Life', 'Pil Ömrü'],
      ['OS', 'Operating System', 'İşletim Sistemi'],
      ['Heart Rate', 'Kalp Atış', 'HR'],
      ['GPS', 'Location'],
      ['Water Resistance', 'Su Direnci', 'ATM', 'IP'],
      ['Connectivity', 'Bağlantı'],
      ['Weight', 'Ağırlık'],
      ['NFC', 'Payment'],
    ],
    'powerbanks': [
      ['Capacity', 'Kapasite', 'mAh'],
      ['Output Power', 'Output', 'Çıkış Gücü', 'Max Output'],
      ['Input Power', 'Input', 'Giriş Gücü'],
      ['Ports', 'Port', 'USB'],
      ['Wireless', 'Wireless Charging', 'Kablosuz'],
      ['Weight', 'Ağırlık'],
      ['Pass-Through', 'Pass Through'],
      ['Warranty', 'Garanti'],
      ['Fast Charge', 'Quick Charge', 'PD', 'Hızlı Şarj'],
    ],
  };

  static const _categoryAliases = <String, String>{
    'phone': 'smartphones', 'telefon': 'smartphones', 'akıllı telefon': 'smartphones',
    'smartphone': 'smartphones', 'cep telefonu': 'smartphones',
    'tablet': 'tablets',
    'laptop': 'laptops', 'dizüstü': 'laptops', 'notebook': 'laptops', 'dizüstü bilgisayar': 'laptops',
    'desktop': 'laptops', 'masaüstü': 'laptops',
    'monitor': 'monitors', 'monitör': 'monitors', 'ekran': 'monitors',
    'tv': 'tvs', 'televizyon': 'tvs', 'television': 'tvs',
    'headphone': 'headphones', 'kulaklık': 'headphones', 'earphone': 'headphones', 'earbuds': 'headphones',
    'keyboard': 'keyboards', 'klavye': 'keyboards',
    'mouse': 'mice', 'fare': 'mice',
    'camera': 'cameras', 'fotoğraf makinesi': 'cameras', 'kamera': 'cameras',
    'printer': 'printers', 'yazıcı': 'printers',
    'router': 'routers', 'modem': 'routers',
    'ssd': 'ssds',
    'hdd': 'hdds', 'hard disk': 'hdds',
    'ram': 'ram', 'memory': 'ram', 'bellek': 'ram',
    'gpu': 'gpus', 'ekran kartı': 'gpus', 'graphics card': 'gpus', 'video card': 'gpus',
    'cpu': 'cpus', 'işlemci': 'cpus', 'processor': 'cpus',
    'smartwatch': 'smartwatches', 'akıllı saat': 'smartwatches', 'watch': 'smartwatches',
    'powerbank': 'powerbanks', 'power bank': 'powerbanks', 'taşınabilir şarj': 'powerbanks',
  };

  static IconData _iconForSpec(String key) {
    final k = key.toLowerCase();
    if (k.contains('screen') || k.contains('display') || k.contains('ekran') || k.contains('çözünürlük')) return Icons.monitor_rounded;
    if (k.contains('battery') || k.contains('pil')) return Icons.battery_full_rounded;
    if (k.contains('ram') || k.contains('memory') || k.contains('bellek')) return Icons.memory_rounded;
    if (k.contains('processor') || k.contains('cpu') || k.contains('chip') || k.contains('işlemci')) return Icons.developer_board_rounded;
    if (k.contains('camera') || k.contains('kamera') || k.contains('megapixel')) return Icons.camera_alt_rounded;
    if (k.contains('storage') || k.contains('ssd') || k.contains('hdd') || k.contains('depolama') || k.contains('kapasite') || k.contains('capacity') || k.contains('hard disk')) return Icons.storage_rounded;
    if (k.contains('weight') || k.contains('ağırlık')) return Icons.scale_rounded;
    if (k.contains('5g') || k.contains('4.5g') || k.contains('network') || k.contains('wifi') || k.contains('ağ') || k.contains('bağlantı') || k.contains('connectivity') || k.contains('cellular')) return Icons.signal_cellular_alt_rounded;
    if (k.contains('gpu') || k.contains('graphic') || k.contains('ekran kartı') || k.contains('vram')) return Icons.videogame_asset_rounded;
    if (k.contains('os') || k.contains('operating') || k.contains('işletim')) return Icons.phone_android_rounded;
    if (k.contains('refresh') || k.contains('yenileme')) return Icons.speed_rounded;
    if (k.contains('resolution')) return Icons.high_quality_rounded;
    if (k.contains('panel')) return Icons.grid_view_rounded;
    if (k.contains('hdr')) return Icons.hdr_on_rounded;
    if (k.contains('noise') || k.contains('anc')) return Icons.noise_aware_rounded;
    if (k.contains('heart') || k.contains('kalp')) return Icons.favorite_rounded;
    if (k.contains('gps')) return Icons.location_on_rounded;
    if (k.contains('water') || k.contains('su') || k.contains('ip6') || k.contains('atm')) return Icons.water_drop_rounded;
    if (k.contains('sensor') || k.contains('sensör')) return Icons.sensors_rounded;
    if (k.contains('dpi')) return Icons.mouse_rounded;
    if (k.contains('switch') || k.contains('anahtar')) return Icons.keyboard_rounded;
    if (k.contains('port') || k.contains('hdmi') || k.contains('usb')) return Icons.settings_input_hdmi_rounded;
    if (k.contains('speed') || k.contains('hız') || k.contains('clock') || k.contains('frequency') || k.contains('frekans')) return Icons.speed_rounded;
    if (k.contains('type') || k.contains('tip')) return Icons.category_rounded;
    if (k.contains('thread') || k.contains('iş parçacığı')) return Icons.hub_rounded;
    if (k.contains('core') || k.contains('çekirdek')) return Icons.developer_board_rounded;
    if (k.contains('socket') || k.contains('soket')) return Icons.electrical_services_rounded;
    if (k.contains('cache') || k.contains('önbellek')) return Icons.cached_rounded;
    if (k.contains('tdp') || k.contains('güç') || k.contains('power') || k.contains('watt')) return Icons.bolt_rounded;
    if (k.contains('cool') || k.contains('soğut') || k.contains('fan')) return Icons.ac_unit_rounded;
    if (k.contains('warranty') || k.contains('garanti')) return Icons.verified_rounded;
    if (k.contains('nfc') || k.contains('payment')) return Icons.contactless_rounded;
    if (k.contains('microphone') || k.contains('mikrofon')) return Icons.mic_rounded;
    if (k.contains('rgb') || k.contains('backlight') || k.contains('aydınlatma')) return Icons.lightbulb_rounded;
    return Icons.info_outline_rounded;
  }

  String _resolveCategory() {
    final cat = product.category.toLowerCase().trim();
    if (_categoryKeys.containsKey(cat)) return cat;
    for (final alias in _categoryAliases.entries) {
      if (cat.contains(alias.key) || alias.key.contains(cat)) return alias.value;
    }
    return '';
  }

  /// Build a merged pool of all available specs from keySpecs + specs + specSections.
  Map<String, String> _buildSpecPool() {
    final pool = <String, String>{};
    // Primary: keySpecs
    for (final e in product.keySpecs.entries) {
      final v = e.value.trim();
      if (v.isNotEmpty && v != '-' && v != 'N/A') pool[e.key] = v;
    }
    // Secondary: flat specs
    for (final e in product.specs.entries) {
      if (pool.containsKey(e.key)) continue;
      if (e.value != null && e.value is! Map) {
        final v = e.value.toString().trim();
        if (v.isNotEmpty && v != '-' && v != 'N/A') pool[e.key] = v;
      }
    }
    // Tertiary: specSections (flattened)
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

  /// Try to find a spec in the pool matching any of the given aliases.
  MapEntry<String, String>? _findSpec(Map<String, String> pool, List<String> aliases, Set<String> used) {
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

  /// Collect specs: always returns a multiple of 3 (6 or 9).
  List<MapEntry<String, String>> _collectKeySpecs() {
    final pool = _buildSpecPool();
    if (pool.isEmpty) return [];

    final result = <MapEntry<String, String>>[];
    final used = <String>{};

    final cat = _resolveCategory();
    final prioritySlots = _categoryKeys[cat];

    if (prioritySlots != null) {
      for (final slotAliases in prioritySlots) {
        final found = _findSpec(pool, slotAliases, used);
        if (found != null) {
          result.add(found);
          used.add(found.key);
        }
        if (result.length >= 9) break;
      }
    }

    // If we don't have enough from category mapping, fill from pool
    if (result.length < 6) {
      for (final e in pool.entries) {
        if (used.contains(e.key)) continue;
        result.add(e);
        used.add(e.key);
        if (result.length >= 6) break;
      }
    }

    // Ensure multiple of 3: round up to 6 or 9
    if (result.length > 6 && result.length < 9) {
      // Need to fill to 9
      for (final e in pool.entries) {
        if (used.contains(e.key)) continue;
        result.add(e);
        used.add(e.key);
        if (result.length >= 9) break;
      }
    }

    // Final trim to nearest multiple of 3
    final target = result.length >= 7 ? 9 : (result.length >= 4 ? 6 : 3);
    if (result.length > target) {
      return result.sublist(0, target);
    }
    // If still not a multiple of 3, trim down
    final remainder = result.length % 3;
    if (remainder != 0 && result.length > 3) {
      return result.sublist(0, result.length - remainder);
    }
    return result;
  }

  Widget _buildValue(BuildContext context, String value) {
    final v = value.toLowerCase().trim();
    final theme = Theme.of(context);
    if (v == 'true' || v == 'yes' || v == 'var' || v == 'evet' || v == '✓') {
      return Icon(Icons.check_circle_rounded, color: theme.colorScheme.primary, size: 20);
    }
    if (v == 'false' || v == 'no' || v == 'yok' || v == 'hayır' || v == '✗') {
      return Icon(Icons.cancel_rounded, color: theme.colorScheme.error, size: 20);
    }
    // Auto-size: try 13sp, fall back to 11sp for long text
    final fontSize = value.length > 16 ? 11.0 : 13.0;
    return Text(
      value,
      style: GoogleFonts.plusJakartaSans(
        fontSize: fontSize,
        fontWeight: FontWeight.w700,
        color: theme.colorScheme.onSurface,
      ),
      textAlign: TextAlign.center,
      maxLines: 2,
      overflow: TextOverflow.ellipsis,
    );
  }

  @override
  Widget build(BuildContext context) {
    final specs = _collectKeySpecs();
    if (specs.isEmpty) return const SizedBox.shrink();

    final theme = Theme.of(context);
    final rows = (specs.length / 3).ceil();

    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.4),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: theme.dividerColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.auto_awesome_rounded, size: 16, color: theme.colorScheme.primary),
              const SizedBox(width: 6),
              Text(
                'Key Specs',
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: theme.colorScheme.onSurface,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          // Build rows with IntrinsicHeight for equal cell heights
          for (int row = 0; row < rows; row++) ...[
            if (row > 0) const SizedBox(height: 8),
            IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (int col = 0; col < 3; col++) ...[
                    if (col > 0) const SizedBox(width: 8),
                    Expanded(
                      child: () {
                        final idx = row * 3 + col;
                        if (idx >= specs.length) return const SizedBox.shrink();
                        final entry = specs[idx];
                        return Container(
                          constraints: const BoxConstraints(minHeight: 80, maxHeight: 100),
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 8),
                          decoration: BoxDecoration(
                            color: theme.colorScheme.surface,
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: theme.dividerColor.withValues(alpha: 0.5)),
                          ),
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(
                                _iconForSpec(entry.key),
                                size: 18,
                                color: theme.colorScheme.primary.withValues(alpha: 0.7),
                              ),
                              const SizedBox(height: 4),
                              Flexible(child: _buildValue(context, entry.value)),
                              const SizedBox(height: 2),
                              Text(
                                entry.key,
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 10,
                                  fontWeight: FontWeight.w500,
                                  color: theme.colorScheme.onSurface.withValues(alpha: 0.5),
                                ),
                                textAlign: TextAlign.center,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ],
                          ),
                        );
                      }(),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}
