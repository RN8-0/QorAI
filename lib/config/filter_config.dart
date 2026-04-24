/// Filter configuration per product category (epey.com-style filtering).
library;

enum FilterType { multiSelect, rangeSlider, toggle }

class FilterOption {
  final String id;
  final String label;
  const FilterOption({required this.id, required this.label});
}

class FilterDefinition {
  final String id;
  final String label;
  final FilterType type;
  final List<FilterOption>? options;
  final double? minValue;
  final double? maxValue;
  final String? unit;

  /// When true, options are populated dynamically from loaded product data.
  final bool isDynamic;

  /// Keys to look up in product specSections / specs maps.
  final List<String> specKeys;

  const FilterDefinition({
    required this.id,
    required this.label,
    required this.type,
    this.options,
    this.minValue,
    this.maxValue,
    this.unit,
    this.isDynamic = false,
    this.specKeys = const [],
  });

  FilterDefinition withOptions(List<FilterOption> newOptions) =>
      FilterDefinition(
        id: id,
        label: label,
        type: type,
        options: newOptions,
        minValue: minValue,
        maxValue: maxValue,
        unit: unit,
        isDynamic: isDynamic,
        specKeys: specKeys,
      );

  FilterDefinition withRange({double? minValue, double? maxValue}) =>
      FilterDefinition(
        id: id,
        label: label,
        type: type,
        options: options,
        minValue: minValue ?? this.minValue,
        maxValue: maxValue ?? this.maxValue,
        unit: unit,
        isDynamic: isDynamic,
        specKeys: specKeys,
      );
}

// ---------------------------------------------------------------------------
// Shared dynamic brand filter – options populated at runtime from products
// ---------------------------------------------------------------------------
const _dynamicBrandFilter = FilterDefinition(
  id: 'brand',
  label: 'Brand',
  type: FilterType.multiSelect,
  options: [],
  isDynamic: true,
  specKeys: ['brand'],
);

const _operatingSystemSpecKeys = [
  'Operating System',
  'OPERATING SYSTEM',
  'OS',
  'Platform',
  'Device Operating System',
  'Cihaz İşletim Sistemi',
  'İşletim Sistemi',
];

// ---------------------------------------------------------------------------
// Per-category filter definitions
// ---------------------------------------------------------------------------

const List<FilterDefinition> _smartphoneFilters = [
  _dynamicBrandFilter,
  FilterDefinition(
    id: 'ram',
    label: 'RAM',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: '2_gb', label: '2 GB'),
      FilterOption(id: '3_gb', label: '3 GB'),
      FilterOption(id: '4_gb', label: '4 GB'),
      FilterOption(id: '6_gb', label: '6 GB'),
      FilterOption(id: '8_gb', label: '8 GB'),
      FilterOption(id: '12_gb', label: '12 GB'),
      FilterOption(id: '16_gb', label: '16 GB'),
    ],
    specKeys: ['Memory (RAM)', 'RAM', 'memory ram'],
  ),
  FilterDefinition(
    id: 'storage',
    label: 'Storage',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: '16_gb', label: '16 GB'),
      FilterOption(id: '32_gb', label: '32 GB'),
      FilterOption(id: '64_gb', label: '64 GB'),
      FilterOption(id: '128_gb', label: '128 GB'),
      FilterOption(id: '256_gb', label: '256 GB'),
      FilterOption(id: '512_gb', label: '512 GB'),
      FilterOption(id: '1_tb', label: '1 TB'),
    ],
    specKeys: ['Internal Storage', 'storage', 'internal storage'],
  ),
  FilterDefinition(
    id: 'screen_size',
    label: 'Screen Size',
    type: FilterType.rangeSlider,
    minValue: 3.5,
    maxValue: 7.5,
    unit: 'in',
    specKeys: ['Screen Size', 'screen size'],
  ),
  FilterDefinition(
    id: 'battery',
    label: 'Battery Capacity',
    type: FilterType.rangeSlider,
    minValue: 1500,
    maxValue: 7000,
    unit: 'mAh',
    specKeys: [
      'Battery Capacity',
      'battery capacity',
      'Battery Capacity (Typical)',
    ],
  ),
  FilterDefinition(
    id: 'os',
    label: 'Operating System',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: 'android', label: 'Android'),
      FilterOption(id: 'ios', label: 'iOS'),
    ],
    specKeys: _operatingSystemSpecKeys,
  ),
  FilterDefinition(
    id: 'screen_tech',
    label: 'Screen Technology',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: 'ips', label: 'IPS'),
      FilterOption(id: 'oled', label: 'OLED'),
      FilterOption(id: 'amoled', label: 'AMOLED'),
      FilterOption(id: 'super_amoled', label: 'Super AMOLED'),
      FilterOption(id: 'lcd', label: 'LCD'),
      FilterOption(id: 'ltpo', label: 'LTPO'),
      FilterOption(id: 'dynamic_amoled', label: 'Dynamic AMOLED'),
    ],
    specKeys: ['Screen Technology', 'screen technology'],
  ),
  FilterDefinition(
    id: 'refresh_rate',
    label: 'Refresh Rate',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: '60_hz', label: '60 Hz'),
      FilterOption(id: '90_hz', label: '90 Hz'),
      FilterOption(id: '120_hz', label: '120 Hz'),
      FilterOption(id: '144_hz', label: '144 Hz'),
      FilterOption(id: '165_hz', label: '165 Hz'),
      FilterOption(id: '240_hz', label: '240 Hz'),
    ],
    specKeys: ['Screen Refresh Rate', 'refresh rate'],
  ),
  FilterDefinition(
    id: 'five_g',
    label: '5G',
    type: FilterType.toggle,
    specKeys: ['5G'],
  ),
  FilterDefinition(
    id: 'nfc',
    label: 'NFC',
    type: FilterType.toggle,
    specKeys: ['NFC'],
  ),
  FilterDefinition(
    id: 'wireless_charging',
    label: 'Wireless Charging',
    type: FilterType.toggle,
    specKeys: ['Wireless Charging'],
  ),
  FilterDefinition(
    id: 'fast_charging',
    label: 'Fast Charging',
    type: FilterType.toggle,
    specKeys: ['Fast Charging'],
  ),
  FilterDefinition(
    id: 'fingerprint',
    label: 'Fingerprint Reader',
    type: FilterType.toggle,
    specKeys: ['Fingerprint Reader', 'fingerprint'],
  ),
  FilterDefinition(
    id: 'water_resistance',
    label: 'Water Resistance',
    type: FilterType.toggle,
    specKeys: ['Water Resistance'],
  ),
];

const List<FilterDefinition> _laptopFilters = [
  _dynamicBrandFilter,
  FilterDefinition(
    id: 'processor_brand',
    label: 'Processor Brand',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: 'intel', label: 'Intel'),
      FilterOption(id: 'amd', label: 'AMD'),
      FilterOption(id: 'apple', label: 'Apple'),
      FilterOption(id: 'qualcomm', label: 'Qualcomm'),
    ],
    specKeys: [
      'Processor Brand',
      'processor brand',
      'Processor',
      'CPU',
      'Chip',
      'Chipset',
      'Processor Model',
      'Processor Type',
    ],
  ),
  FilterDefinition(
    id: 'ram',
    label: 'RAM',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: '4_gb', label: '4 GB'),
      FilterOption(id: '8_gb', label: '8 GB'),
      FilterOption(id: '16_gb', label: '16 GB'),
      FilterOption(id: '32_gb', label: '32 GB'),
      FilterOption(id: '64_gb', label: '64 GB'),
    ],
    specKeys: ['Memory (RAM)', 'RAM'],
  ),
  FilterDefinition(
    id: 'storage',
    label: 'Storage',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: '128_gb', label: '128 GB'),
      FilterOption(id: '256_gb', label: '256 GB'),
      FilterOption(id: '512_gb', label: '512 GB'),
      FilterOption(id: '1_tb', label: '1 TB'),
      FilterOption(id: '2_tb', label: '2 TB'),
    ],
    specKeys: ['SSD', 'Internal Storage', 'storage'],
  ),
  FilterDefinition(
    id: 'screen_size',
    label: 'Screen Size',
    type: FilterType.rangeSlider,
    minValue: 11,
    maxValue: 18,
    unit: 'in',
    specKeys: ['Screen Size', 'screen size'],
  ),
  FilterDefinition(
    id: 'os',
    label: 'Operating System',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: 'windows', label: 'Windows'),
      FilterOption(id: 'macos', label: 'macOS'),
      FilterOption(id: 'linux', label: 'Linux'),
      FilterOption(id: 'chromeos', label: 'ChromeOS'),
    ],
    specKeys: _operatingSystemSpecKeys,
  ),
  FilterDefinition(
    id: 'gpu_type',
    label: 'GPU Type',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: 'integrated', label: 'Integrated'),
      FilterOption(id: 'dedicated', label: 'Dedicated'),
    ],
    specKeys: [
      'Graphics Card',
      'GPU',
      'graphics processor',
      'Graphics',
      'Graphics Card Type',
      'Video Card',
    ],
  ),
  FilterDefinition(
    id: 'weight',
    label: 'Weight',
    type: FilterType.rangeSlider,
    minValue: 0.5,
    maxValue: 5.0,
    unit: 'kg',
    specKeys: ['Weight'],
  ),
  FilterDefinition(
    id: 'refresh_rate',
    label: 'Refresh Rate',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: '60_hz', label: '60 Hz'),
      FilterOption(id: '90_hz', label: '90 Hz'),
      FilterOption(id: '120_hz', label: '120 Hz'),
      FilterOption(id: '144_hz', label: '144 Hz'),
      FilterOption(id: '165_hz', label: '165 Hz'),
      FilterOption(id: '240_hz', label: '240 Hz'),
    ],
    specKeys: ['Screen Refresh Rate', 'refresh rate', 'Refresh Rate'],
  ),
];

const List<FilterDefinition> _tabletFilters = [
  _dynamicBrandFilter,
  FilterDefinition(
    id: 'screen_size',
    label: 'Screen Size',
    type: FilterType.rangeSlider,
    minValue: 6,
    maxValue: 14,
    unit: 'in',
    specKeys: ['Screen Size', 'screen size'],
  ),
  FilterDefinition(
    id: 'ram',
    label: 'RAM',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: '2_gb', label: '2 GB'),
      FilterOption(id: '4_gb', label: '4 GB'),
      FilterOption(id: '6_gb', label: '6 GB'),
      FilterOption(id: '8_gb', label: '8 GB'),
      FilterOption(id: '12_gb', label: '12 GB'),
      FilterOption(id: '16_gb', label: '16 GB'),
    ],
    specKeys: ['Memory (RAM)', 'RAM'],
  ),
  FilterDefinition(
    id: 'storage',
    label: 'Storage',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: '32_gb', label: '32 GB'),
      FilterOption(id: '64_gb', label: '64 GB'),
      FilterOption(id: '128_gb', label: '128 GB'),
      FilterOption(id: '256_gb', label: '256 GB'),
      FilterOption(id: '512_gb', label: '512 GB'),
      FilterOption(id: '1_tb', label: '1 TB'),
    ],
    specKeys: ['Internal Storage', 'storage'],
  ),
  FilterDefinition(
    id: 'os',
    label: 'Operating System',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: 'android', label: 'Android'),
      FilterOption(id: 'ipados', label: 'iPadOS'),
      FilterOption(id: 'windows', label: 'Windows'),
    ],
    specKeys: _operatingSystemSpecKeys,
  ),
  FilterDefinition(
    id: 'connectivity',
    label: 'Connectivity',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: 'wi-fi', label: 'Wi-Fi'),
      FilterOption(id: '4g', label: '4G'),
      FilterOption(id: '5g', label: '5G'),
    ],
    specKeys: ['4G', '5G', 'Connectivity'],
  ),
  FilterDefinition(
    id: 'five_g',
    label: '5G',
    type: FilterType.toggle,
    specKeys: ['5G'],
  ),
];

const List<FilterDefinition> _monitorFilters = [
  _dynamicBrandFilter,
  FilterDefinition(
    id: 'screen_size',
    label: 'Screen Size',
    type: FilterType.rangeSlider,
    minValue: 18,
    maxValue: 55,
    unit: 'in',
    specKeys: ['Screen Size', 'screen size'],
  ),
  FilterDefinition(
    id: 'resolution',
    label: 'Resolution',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: 'hd', label: 'HD'),
      FilterOption(id: 'full_hd', label: 'Full HD'),
      FilterOption(id: 'qhd', label: 'QHD'),
      FilterOption(id: '4k_uhd', label: '4K UHD'),
      FilterOption(id: '8k', label: '8K'),
    ],
    specKeys: ['Screen Resolution Standard', 'Resolution'],
  ),
  FilterDefinition(
    id: 'panel_type',
    label: 'Panel Type',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: 'ips', label: 'IPS'),
      FilterOption(id: 'va', label: 'VA'),
      FilterOption(id: 'tn', label: 'TN'),
      FilterOption(id: 'oled', label: 'OLED'),
      FilterOption(id: 'mini_led', label: 'Mini LED'),
      FilterOption(id: 'qled', label: 'QLED'),
    ],
    specKeys: ['Panel Type', 'Screen Technology'],
  ),
  FilterDefinition(
    id: 'refresh_rate',
    label: 'Refresh Rate',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: '60_hz', label: '60 Hz'),
      FilterOption(id: '75_hz', label: '75 Hz'),
      FilterOption(id: '100_hz', label: '100 Hz'),
      FilterOption(id: '120_hz', label: '120 Hz'),
      FilterOption(id: '144_hz', label: '144 Hz'),
      FilterOption(id: '165_hz', label: '165 Hz'),
      FilterOption(id: '180_hz', label: '180 Hz'),
      FilterOption(id: '240_hz', label: '240 Hz'),
      FilterOption(id: '360_hz', label: '360 Hz'),
    ],
    specKeys: ['Screen Refresh Rate', 'Refresh Rate'],
  ),
  FilterDefinition(
    id: 'response_time',
    label: 'Response Time',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: '0.5_ms', label: '0.5 ms'),
      FilterOption(id: '1_ms', label: '1 ms'),
      FilterOption(id: '2_ms', label: '2 ms'),
      FilterOption(id: '4_ms', label: '4 ms'),
      FilterOption(id: '5_ms', label: '5 ms'),
    ],
    specKeys: ['Response Time'],
  ),
  FilterDefinition(
    id: 'hdr',
    label: 'HDR',
    type: FilterType.toggle,
    specKeys: ['HDR'],
  ),
  FilterDefinition(
    id: 'g_sync',
    label: 'G-Sync',
    type: FilterType.toggle,
    specKeys: ['G-Sync', 'NVIDIA G-Sync'],
  ),
  FilterDefinition(
    id: 'freesync',
    label: 'FreeSync',
    type: FilterType.toggle,
    specKeys: ['FreeSync', 'AMD FreeSync'],
  ),
];

const List<FilterDefinition> _gpuFilters = [
  _dynamicBrandFilter,
  FilterDefinition(
    id: 'series',
    label: 'Series',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: 'rtx_40', label: 'RTX 40'),
      FilterOption(id: 'rtx_30', label: 'RTX 30'),
      FilterOption(id: 'rtx_20', label: 'RTX 20'),
      FilterOption(id: 'gtx_16', label: 'GTX 16'),
      FilterOption(id: 'rx_7000', label: 'RX 7000'),
      FilterOption(id: 'rx_6000', label: 'RX 6000'),
      FilterOption(id: 'arc', label: 'Arc'),
    ],
    specKeys: ['GPU Series', 'Model'],
  ),
  FilterDefinition(
    id: 'vram',
    label: 'VRAM',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: '4_gb', label: '4 GB'),
      FilterOption(id: '6_gb', label: '6 GB'),
      FilterOption(id: '8_gb', label: '8 GB'),
      FilterOption(id: '10_gb', label: '10 GB'),
      FilterOption(id: '12_gb', label: '12 GB'),
      FilterOption(id: '16_gb', label: '16 GB'),
      FilterOption(id: '20_gb', label: '20 GB'),
      FilterOption(id: '24_gb', label: '24 GB'),
    ],
    specKeys: ['Video Memory', 'VRAM', 'Memory Size'],
  ),
  FilterDefinition(
    id: 'memory_type',
    label: 'Memory Type',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: 'gddr5', label: 'GDDR5'),
      FilterOption(id: 'gddr6', label: 'GDDR6'),
      FilterOption(id: 'gddr6x', label: 'GDDR6X'),
      FilterOption(id: 'hbm2', label: 'HBM2'),
      FilterOption(id: 'hbm3', label: 'HBM3'),
    ],
    specKeys: ['Memory Type', 'Video Memory Type'],
  ),
  FilterDefinition(
    id: 'tdp',
    label: 'TDP',
    type: FilterType.rangeSlider,
    minValue: 30,
    maxValue: 500,
    unit: 'W',
    specKeys: ['TDP', 'Power Consumption', 'Thermal Design Power'],
  ),
];

const List<FilterDefinition> _processorFilters = [
  _dynamicBrandFilter,
  FilterDefinition(
    id: 'series',
    label: 'Series',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: 'core_i3', label: 'Core i3'),
      FilterOption(id: 'core_i5', label: 'Core i5'),
      FilterOption(id: 'core_i7', label: 'Core i7'),
      FilterOption(id: 'core_i9', label: 'Core i9'),
      FilterOption(id: 'core_ultra_5', label: 'Core Ultra 5'),
      FilterOption(id: 'core_ultra_7', label: 'Core Ultra 7'),
      FilterOption(id: 'core_ultra_9', label: 'Core Ultra 9'),
      FilterOption(id: 'ryzen_3', label: 'Ryzen 3'),
      FilterOption(id: 'ryzen_5', label: 'Ryzen 5'),
      FilterOption(id: 'ryzen_7', label: 'Ryzen 7'),
      FilterOption(id: 'ryzen_9', label: 'Ryzen 9'),
      FilterOption(id: 'm1', label: 'M1'),
      FilterOption(id: 'm2', label: 'M2'),
      FilterOption(id: 'm3', label: 'M3'),
      FilterOption(id: 'm4', label: 'M4'),
    ],
    specKeys: ['Processor Series', 'CPU Series'],
  ),
  FilterDefinition(
    id: 'cores',
    label: 'Core Count',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: '2', label: '2'),
      FilterOption(id: '4', label: '4'),
      FilterOption(id: '6', label: '6'),
      FilterOption(id: '8', label: '8'),
      FilterOption(id: '10', label: '10'),
      FilterOption(id: '12', label: '12'),
      FilterOption(id: '16', label: '16'),
      FilterOption(id: '24', label: '24'),
      FilterOption(id: '32', label: '32'),
    ],
    specKeys: ['CPU Core', 'Core Count', 'Number of Cores'],
  ),
  FilterDefinition(
    id: 'socket',
    label: 'Socket',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: 'lga1700', label: 'LGA1700'),
      FilterOption(id: 'lga1851', label: 'LGA1851'),
      FilterOption(id: 'am4', label: 'AM4'),
      FilterOption(id: 'am5', label: 'AM5'),
      FilterOption(id: 'tr4', label: 'TR4'),
      FilterOption(id: 'trx50', label: 'TRX50'),
    ],
    specKeys: ['Socket', 'CPU Socket'],
  ),
  FilterDefinition(
    id: 'tdp',
    label: 'TDP',
    type: FilterType.rangeSlider,
    minValue: 10,
    maxValue: 350,
    unit: 'W',
    specKeys: ['TDP', 'Power Consumption'],
  ),
  FilterDefinition(
    id: 'integrated_gpu',
    label: 'Integrated Graphics',
    type: FilterType.toggle,
    specKeys: ['Integrated Graphics', 'integrated gpu'],
  ),
];

const List<FilterDefinition> _headphoneFilters = [
  _dynamicBrandFilter,
  FilterDefinition(
    id: 'type',
    label: 'Type',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: 'over-ear', label: 'Over-ear'),
      FilterOption(id: 'on-ear', label: 'On-ear'),
      FilterOption(id: 'in-ear', label: 'In-ear'),
      FilterOption(id: 'true_wireless', label: 'True Wireless'),
    ],
    specKeys: ['Headphone Type', 'Type'],
  ),
  FilterDefinition(
    id: 'connectivity',
    label: 'Connectivity',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: 'wired', label: 'Wired'),
      FilterOption(id: 'wireless', label: 'Wireless'),
      FilterOption(id: 'both', label: 'Both'),
    ],
    specKeys: ['Connectivity', 'Connection Type', 'Wireless', 'Bluetooth'],
  ),
  FilterDefinition(
    id: 'anc',
    label: 'Active Noise Cancelling',
    type: FilterType.toggle,
    specKeys: ['Active Noise Cancelling', 'Noise Cancellation', 'ANC'],
  ),
  FilterDefinition(
    id: 'microphone',
    label: 'Microphone',
    type: FilterType.toggle,
    specKeys: ['Microphone'],
  ),
];

const List<FilterDefinition> _smartwatchFilters = [
  _dynamicBrandFilter,
  FilterDefinition(
    id: 'os_compat',
    label: 'Compatible OS',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: 'android', label: 'Android'),
      FilterOption(id: 'ios', label: 'iOS'),
      FilterOption(id: 'both', label: 'Both'),
    ],
    specKeys: ['Compatible OS', 'Operating System'],
  ),
  FilterDefinition(
    id: 'gps',
    label: 'GPS',
    type: FilterType.toggle,
    specKeys: ['GPS', 'Navigation'],
  ),
  FilterDefinition(
    id: 'nfc',
    label: 'NFC',
    type: FilterType.toggle,
    specKeys: ['NFC'],
  ),
  FilterDefinition(
    id: 'water_resistance',
    label: 'Water Resistance',
    type: FilterType.toggle,
    specKeys: ['Water Resistance'],
  ),
  FilterDefinition(
    id: 'health_features',
    label: 'Health Features',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: 'heart_rate', label: 'Heart Rate'),
      FilterOption(id: 'spo2', label: 'SpO2'),
      FilterOption(id: 'ecg', label: 'ECG'),
      FilterOption(id: 'fall_detection', label: 'Fall Detection'),
    ],
    specKeys: ['Health Features', 'Sensors'],
  ),
];

const List<FilterDefinition> _cameraFilters = [
  _dynamicBrandFilter,
  FilterDefinition(
    id: 'type',
    label: 'Camera Type',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: 'dslr', label: 'DSLR'),
      FilterOption(id: 'mirrorless', label: 'Mirrorless'),
      FilterOption(id: 'compact', label: 'Compact'),
      FilterOption(id: 'bridge', label: 'Bridge'),
    ],
    specKeys: ['Camera Type', 'Type'],
  ),
  FilterDefinition(
    id: 'sensor',
    label: 'Sensor Size',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: 'full_frame', label: 'Full Frame'),
      FilterOption(id: 'aps-c', label: 'APS-C'),
      FilterOption(id: 'micro_four_thirds', label: 'Micro Four Thirds'),
      FilterOption(id: '1_inch', label: '1 inch'),
    ],
    specKeys: ['Sensor Size', 'Sensor Type'],
  ),
  FilterDefinition(
    id: 'megapixels',
    label: 'Megapixels',
    type: FilterType.rangeSlider,
    minValue: 12,
    maxValue: 100,
    unit: 'MP',
    specKeys: ['Megapixels', 'Resolution'],
  ),
  FilterDefinition(
    id: 'video',
    label: 'Video Resolution',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: '1080p', label: '1080p'),
      FilterOption(id: '4k', label: '4K'),
      FilterOption(id: '6k', label: '6K'),
      FilterOption(id: '8k', label: '8K'),
    ],
    specKeys: ['Video Resolution', 'Video Recording Resolution'],
  ),
];

const List<FilterDefinition> _tvFilters = [
  _dynamicBrandFilter,
  FilterDefinition(
    id: 'screen_size',
    label: 'Screen Size',
    type: FilterType.rangeSlider,
    minValue: 32,
    maxValue: 100,
    unit: 'in',
    specKeys: ['Screen Size', 'screen size'],
  ),
  FilterDefinition(
    id: 'resolution',
    label: 'Resolution',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: 'hd', label: 'HD'),
      FilterOption(id: 'full_hd', label: 'Full HD'),
      FilterOption(id: '4k', label: '4K'),
      FilterOption(id: '8k', label: '8K'),
    ],
    specKeys: ['Screen Resolution Standard', 'Resolution'],
  ),
  FilterDefinition(
    id: 'panel_type',
    label: 'Panel Type',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: 'oled', label: 'OLED'),
      FilterOption(id: 'qled', label: 'QLED'),
      FilterOption(id: 'led', label: 'LED'),
      FilterOption(id: 'mini_led', label: 'Mini LED'),
      FilterOption(id: 'neo_qled', label: 'Neo QLED'),
    ],
    specKeys: ['Panel Type', 'Screen Technology'],
  ),
  FilterDefinition(
    id: 'refresh_rate',
    label: 'Refresh Rate',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: '50_hz', label: '50 Hz'),
      FilterOption(id: '60_hz', label: '60 Hz'),
      FilterOption(id: '100_hz', label: '100 Hz'),
      FilterOption(id: '120_hz', label: '120 Hz'),
    ],
    specKeys: ['Screen Refresh Rate', 'Refresh Rate'],
  ),
  FilterDefinition(
    id: 'smart_tv',
    label: 'Smart TV',
    type: FilterType.toggle,
    specKeys: ['Smart TV', 'Operating System'],
  ),
];

const List<FilterDefinition> _consoleFilters = [
  _dynamicBrandFilter,
  FilterDefinition(
    id: 'storage',
    label: 'Storage',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: '256_gb', label: '256 GB'),
      FilterOption(id: '512_gb', label: '512 GB'),
      FilterOption(id: '1_tb', label: '1 TB'),
      FilterOption(id: '2_tb', label: '2 TB'),
    ],
    specKeys: ['Internal Storage', 'storage'],
  ),
];

const List<FilterDefinition> _keyboardFilters = [
  _dynamicBrandFilter,
  FilterDefinition(
    id: 'type',
    label: 'Switch Type',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: 'mechanical', label: 'Mechanical'),
      FilterOption(id: 'membrane', label: 'Membrane'),
      FilterOption(id: 'optical', label: 'Optical'),
      FilterOption(id: 'wireless', label: 'Wireless'),
    ],
    specKeys: ['Switch Type', 'Keyboard Type'],
  ),
  FilterDefinition(
    id: 'wireless',
    label: 'Wireless',
    type: FilterType.toggle,
    specKeys: ['Wireless', 'Connectivity'],
  ),
  FilterDefinition(
    id: 'rgb',
    label: 'RGB',
    type: FilterType.toggle,
    specKeys: ['RGB', 'Backlight'],
  ),
  FilterDefinition(
    id: 'layout',
    label: 'Layout',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: 'full_size', label: 'Full Size'),
      FilterOption(id: 'tkl', label: 'TKL'),
      FilterOption(id: '75_percent', label: '75%'),
      FilterOption(id: '65_percent', label: '65%'),
      FilterOption(id: '60_percent', label: '60%'),
    ],
    specKeys: ['Layout', 'Form Factor'],
  ),
];

const List<FilterDefinition> _mouseFilters = [
  _dynamicBrandFilter,
  FilterDefinition(
    id: 'wireless',
    label: 'Wireless',
    type: FilterType.toggle,
    specKeys: ['Wireless', 'Connectivity'],
  ),
  FilterDefinition(
    id: 'dpi',
    label: 'DPI',
    type: FilterType.rangeSlider,
    minValue: 400,
    maxValue: 36000,
    unit: 'DPI',
    specKeys: ['DPI', 'Max DPI'],
  ),
  FilterDefinition(
    id: 'rgb',
    label: 'RGB',
    type: FilterType.toggle,
    specKeys: ['RGB', 'Backlight'],
  ),
];

const List<FilterDefinition> _motherboardFilters = [
  _dynamicBrandFilter,
  FilterDefinition(
    id: 'socket',
    label: 'Socket',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: 'lga_1700', label: 'LGA 1700'),
      FilterOption(id: 'lga_1200', label: 'LGA 1200'),
      FilterOption(id: 'am4', label: 'AM4'),
      FilterOption(id: 'am5', label: 'AM5'),
    ],
    specKeys: ['Socket', 'CPU Socket', 'Processor Socket'],
  ),
  FilterDefinition(
    id: 'form_factor',
    label: 'Form Factor',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: 'atx', label: 'ATX'),
      FilterOption(id: 'micro_atx', label: 'Micro-ATX'),
      FilterOption(id: 'mini_itx', label: 'Mini-ITX'),
      FilterOption(id: 'e_atx', label: 'E-ATX'),
    ],
    specKeys: ['Form Factor', 'Board Size'],
  ),
  FilterDefinition(
    id: 'chipset',
    label: 'Chipset',
    type: FilterType.multiSelect,
    options: [],
    isDynamic: true,
    specKeys: ['Chipset'],
  ),
];

const List<FilterDefinition> _speakerFilters = [
  _dynamicBrandFilter,
  FilterDefinition(
    id: 'wireless',
    label: 'Wireless',
    type: FilterType.toggle,
    specKeys: ['Wireless', 'Bluetooth'],
  ),
];

const List<FilterDefinition> _routerFilters = [
  _dynamicBrandFilter,
  FilterDefinition(
    id: 'wifi_standard',
    label: 'Wi-Fi Standard',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: 'wifi_5', label: 'Wi-Fi 5 (ac)'),
      FilterOption(id: 'wifi_6', label: 'Wi-Fi 6 (ax)'),
      FilterOption(id: 'wifi_6e', label: 'Wi-Fi 6E'),
      FilterOption(id: 'wifi_7', label: 'Wi-Fi 7 (be)'),
    ],
    specKeys: ['Wi-Fi Standard', 'WiFi Standard', 'Wireless Standard'],
  ),
  FilterDefinition(
    id: 'mesh',
    label: 'Mesh Support',
    type: FilterType.toggle,
    specKeys: ['Mesh', 'Mesh Support'],
  ),
];

const List<FilterDefinition> _powerBankFilters = [
  _dynamicBrandFilter,
  FilterDefinition(
    id: 'capacity',
    label: 'Capacity',
    type: FilterType.rangeSlider,
    minValue: 5000,
    maxValue: 30000,
    unit: 'mAh',
    specKeys: ['Battery Capacity', 'Capacity'],
  ),
];

const List<FilterDefinition> _genericFilters = [
  _dynamicBrandFilter,
  FilterDefinition(
    id: 'price',
    label: 'Price Range',
    type: FilterType.rangeSlider,
    minValue: 0,
    maxValue: 50000,
    unit: '\$',
    isDynamic: true,
    specKeys: ['price', 'Price'],
  ),
  FilterDefinition(
    id: 'tech_score',
    label: 'Score Range',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: '0-40', label: '0–40 (Poor)'),
      FilterOption(id: '40-60', label: '40–60 (Average)'),
      FilterOption(id: '60-80', label: '60–80 (Good)'),
      FilterOption(id: '80-100', label: '80–100 (Excellent)'),
    ],
    specKeys: ['techScore'],
  ),
];

// ---------------------------------------------------------------------------
// Missing category filters — covers all scraper categories
// ---------------------------------------------------------------------------

const List<FilterDefinition> _desktopFilters = [
  _dynamicBrandFilter,
  FilterDefinition(
    id: 'processor_brand',
    label: 'Processor Brand',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: 'intel', label: 'Intel'),
      FilterOption(id: 'amd', label: 'AMD'),
    ],
    specKeys: ['Processor Brand', 'Processor'],
  ),
  FilterDefinition(
    id: 'ram',
    label: 'RAM',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: '8_gb', label: '8 GB'),
      FilterOption(id: '16_gb', label: '16 GB'),
      FilterOption(id: '32_gb', label: '32 GB'),
      FilterOption(id: '64_gb', label: '64 GB'),
    ],
    specKeys: ['Memory (RAM)', 'RAM'],
  ),
  FilterDefinition(
    id: 'storage',
    label: 'Storage',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: '256_gb', label: '256 GB'),
      FilterOption(id: '512_gb', label: '512 GB'),
      FilterOption(id: '1_tb', label: '1 TB'),
      FilterOption(id: '2_tb', label: '2 TB'),
    ],
    specKeys: ['SSD', 'Internal Storage', 'HDD'],
  ),
];

const List<FilterDefinition> _ramModuleFilters = [
  _dynamicBrandFilter,
  FilterDefinition(
    id: 'capacity',
    label: 'Capacity',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: '8_gb', label: '8 GB'),
      FilterOption(id: '16_gb', label: '16 GB'),
      FilterOption(id: '32_gb', label: '32 GB'),
      FilterOption(id: '64_gb', label: '64 GB'),
    ],
    specKeys: ['Capacity', 'Memory Size', 'RAM Capacity'],
  ),
  FilterDefinition(
    id: 'ram_type',
    label: 'Type',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: 'ddr4', label: 'DDR4'),
      FilterOption(id: 'ddr5', label: 'DDR5'),
    ],
    specKeys: ['Memory Type', 'Type', 'RAM Type'],
  ),
  FilterDefinition(
    id: 'speed',
    label: 'Speed',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: '3200_mhz', label: '3200 MHz'),
      FilterOption(id: '3600_mhz', label: '3600 MHz'),
      FilterOption(id: '4800_mhz', label: '4800 MHz'),
      FilterOption(id: '5600_mhz', label: '5600 MHz'),
      FilterOption(id: '6000_mhz', label: '6000 MHz'),
    ],
    specKeys: ['Speed', 'Frequency', 'Clock Speed'],
  ),
];

const List<FilterDefinition> _ssdFilters = [
  _dynamicBrandFilter,
  FilterDefinition(
    id: 'capacity',
    label: 'Capacity',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: '256_gb', label: '256 GB'),
      FilterOption(id: '512_gb', label: '512 GB'),
      FilterOption(id: '1_tb', label: '1 TB'),
      FilterOption(id: '2_tb', label: '2 TB'),
      FilterOption(id: '4_tb', label: '4 TB'),
    ],
    specKeys: ['Capacity', 'Storage Capacity'],
  ),
  FilterDefinition(
    id: 'form_factor',
    label: 'Form Factor',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: 'm.2', label: 'M.2'),
      FilterOption(id: '2.5', label: '2.5"'),
      FilterOption(id: 'mSATA', label: 'mSATA'),
    ],
    specKeys: ['Form Factor', 'Interface'],
  ),
  FilterDefinition(
    id: 'read_speed',
    label: 'Read Speed',
    type: FilterType.rangeSlider,
    minValue: 100,
    maxValue: 12000,
    unit: 'MB/s',
    specKeys: ['Sequential Read Speed', 'Read Speed'],
  ),
];

const List<FilterDefinition> _psuFilters = [
  _dynamicBrandFilter,
  FilterDefinition(
    id: 'wattage',
    label: 'Wattage',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: '450w', label: '450W'),
      FilterOption(id: '550w', label: '550W'),
      FilterOption(id: '650w', label: '650W'),
      FilterOption(id: '750w', label: '750W'),
      FilterOption(id: '850w', label: '850W'),
      FilterOption(id: '1000w', label: '1000W'),
    ],
    specKeys: ['Power', 'Wattage', 'Output Power'],
  ),
  FilterDefinition(
    id: 'certification',
    label: 'Efficiency',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: '80_plus', label: '80 PLUS'),
      FilterOption(id: '80_plus_bronze', label: '80 PLUS Bronze'),
      FilterOption(id: '80_plus_gold', label: '80 PLUS Gold'),
      FilterOption(id: '80_plus_platinum', label: '80 PLUS Platinum'),
    ],
    specKeys: ['Certification', '80 PLUS', 'Efficiency'],
  ),
  FilterDefinition(
    id: 'modular',
    label: 'Modular',
    type: FilterType.toggle,
    specKeys: ['Modular', 'Cable Management'],
  ),
];

const List<FilterDefinition> _caseFilters = [
  _dynamicBrandFilter,
  FilterDefinition(
    id: 'form_factor',
    label: 'Form Factor',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: 'atx', label: 'ATX'),
      FilterOption(id: 'micro_atx', label: 'Micro-ATX'),
      FilterOption(id: 'mini_itx', label: 'Mini-ITX'),
      FilterOption(id: 'e_atx', label: 'E-ATX'),
    ],
    specKeys: ['Motherboard Support', 'Form Factor', 'Case Type'],
  ),
  FilterDefinition(
    id: 'tempered_glass',
    label: 'Tempered Glass',
    type: FilterType.toggle,
    specKeys: ['Side Panel', 'Tempered Glass'],
  ),
];

const List<FilterDefinition> _coolerFilters = [
  _dynamicBrandFilter,
  FilterDefinition(
    id: 'type',
    label: 'Type',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: 'air', label: 'Air'),
      FilterOption(id: 'aio_liquid', label: 'AIO Liquid'),
    ],
    specKeys: ['Cooling Type', 'Type'],
  ),
  FilterDefinition(
    id: 'radiator_size',
    label: 'Radiator Size',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: '120mm', label: '120mm'),
      FilterOption(id: '240mm', label: '240mm'),
      FilterOption(id: '280mm', label: '280mm'),
      FilterOption(id: '360mm', label: '360mm'),
    ],
    specKeys: ['Radiator Size', 'Fan Size'],
  ),
];

const List<FilterDefinition> _projectorFilters = [
  _dynamicBrandFilter,
  FilterDefinition(
    id: 'resolution',
    label: 'Resolution',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: 'hd', label: 'HD (720p)'),
      FilterOption(id: 'full_hd', label: 'Full HD (1080p)'),
      FilterOption(id: '4k', label: '4K'),
    ],
    specKeys: ['Resolution', 'Native Resolution'],
  ),
  FilterDefinition(
    id: 'brightness',
    label: 'Brightness',
    type: FilterType.rangeSlider,
    minValue: 500,
    maxValue: 10000,
    unit: 'lm',
    specKeys: ['Brightness', 'Lumens'],
  ),
  FilterDefinition(
    id: 'technology',
    label: 'Technology',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: 'dlp', label: 'DLP'),
      FilterOption(id: 'lcd', label: 'LCD'),
      FilterOption(id: 'laser', label: 'Laser'),
      FilterOption(id: 'led', label: 'LED'),
    ],
    specKeys: ['Display Technology', 'Projection Technology'],
  ),
];

const List<FilterDefinition> _soundbarFilters = [
  _dynamicBrandFilter,
  FilterDefinition(
    id: 'channels',
    label: 'Channels',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: '2.0', label: '2.0'),
      FilterOption(id: '2.1', label: '2.1'),
      FilterOption(id: '3.1', label: '3.1'),
      FilterOption(id: '5.1', label: '5.1'),
      FilterOption(id: '7.1', label: '7.1'),
    ],
    specKeys: ['Channels', 'Channel Configuration'],
  ),
  FilterDefinition(
    id: 'subwoofer',
    label: 'Subwoofer Included',
    type: FilterType.toggle,
    specKeys: ['Subwoofer', 'Wireless Subwoofer'],
  ),
  FilterDefinition(
    id: 'dolby_atmos',
    label: 'Dolby Atmos',
    type: FilterType.toggle,
    specKeys: ['Dolby Atmos'],
  ),
];

const List<FilterDefinition> _actionCameraFilters = [
  _dynamicBrandFilter,
  FilterDefinition(
    id: 'resolution',
    label: 'Video Resolution',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: '1080p', label: '1080p'),
      FilterOption(id: '4k', label: '4K'),
      FilterOption(id: '5.3k', label: '5.3K'),
      FilterOption(id: '8k', label: '8K'),
    ],
    specKeys: ['Video Resolution', 'Max Video Resolution'],
  ),
  FilterDefinition(
    id: 'waterproof',
    label: 'Waterproof',
    type: FilterType.toggle,
    specKeys: ['Waterproof', 'Water Resistance'],
  ),
  FilterDefinition(
    id: 'stabilization',
    label: 'Image Stabilization',
    type: FilterType.toggle,
    specKeys: ['Image Stabilization', 'Stabilization'],
  ),
];

const List<FilterDefinition> _printerFilters = [
  _dynamicBrandFilter,
  FilterDefinition(
    id: 'type',
    label: 'Type',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: 'inkjet', label: 'Inkjet'),
      FilterOption(id: 'laser', label: 'Laser'),
      FilterOption(id: 'tank', label: 'Tank System'),
    ],
    specKeys: ['Printing Technology', 'Type'],
  ),
  FilterDefinition(
    id: 'color',
    label: 'Color Printing',
    type: FilterType.toggle,
    specKeys: ['Color Printing', 'Color'],
  ),
  FilterDefinition(
    id: 'scanner',
    label: 'Scanner',
    type: FilterType.toggle,
    specKeys: ['Scanner', 'Multifunction'],
  ),
  FilterDefinition(
    id: 'wifi',
    label: 'Wi-Fi',
    type: FilterType.toggle,
    specKeys: ['Wi-Fi', 'Wireless'],
  ),
];

const List<FilterDefinition> _robotVacuumFilters = [
  _dynamicBrandFilter,
  FilterDefinition(
    id: 'mopping',
    label: 'Mopping',
    type: FilterType.toggle,
    specKeys: ['Mopping', 'Wet Cleaning'],
  ),
  FilterDefinition(
    id: 'self_emptying',
    label: 'Self-Emptying',
    type: FilterType.toggle,
    specKeys: ['Self-Emptying', 'Auto Empty'],
  ),
  FilterDefinition(
    id: 'suction_power',
    label: 'Suction Power',
    type: FilterType.rangeSlider,
    minValue: 1000,
    maxValue: 12000,
    unit: 'Pa',
    specKeys: ['Suction Power'],
  ),
];

const List<FilterDefinition> _droneFilters = [
  _dynamicBrandFilter,
  FilterDefinition(
    id: 'camera_resolution',
    label: 'Camera',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: '1080p', label: '1080p'),
      FilterOption(id: '4k', label: '4K'),
      FilterOption(id: '8k', label: '8K'),
    ],
    specKeys: ['Camera Resolution', 'Video Resolution'],
  ),
  FilterDefinition(
    id: 'flight_time',
    label: 'Flight Time',
    type: FilterType.rangeSlider,
    minValue: 10,
    maxValue: 60,
    unit: 'min',
    specKeys: ['Flight Time', 'Max Flight Time'],
  ),
  FilterDefinition(
    id: 'obstacle_avoidance',
    label: 'Obstacle Avoidance',
    type: FilterType.toggle,
    specKeys: ['Obstacle Avoidance', 'Obstacle Sensing'],
  ),
];

const List<FilterDefinition> _webcamFilters = [
  _dynamicBrandFilter,
  FilterDefinition(
    id: 'resolution',
    label: 'Resolution',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: '720p', label: '720p'),
      FilterOption(id: '1080p', label: '1080p'),
      FilterOption(id: '4k', label: '4K'),
    ],
    specKeys: ['Resolution', 'Video Resolution'],
  ),
  FilterDefinition(
    id: 'autofocus',
    label: 'Autofocus',
    type: FilterType.toggle,
    specKeys: ['Autofocus', 'Auto Focus'],
  ),
];

const List<FilterDefinition> _eReaderFilters = [
  _dynamicBrandFilter,
  FilterDefinition(
    id: 'screen_size',
    label: 'Screen Size',
    type: FilterType.rangeSlider,
    minValue: 5,
    maxValue: 11,
    unit: 'in',
    specKeys: ['Screen Size'],
  ),
  FilterDefinition(
    id: 'waterproof',
    label: 'Waterproof',
    type: FilterType.toggle,
    specKeys: ['Waterproof', 'Water Resistance'],
  ),
  FilterDefinition(
    id: 'storage',
    label: 'Storage',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: '8_gb', label: '8 GB'),
      FilterOption(id: '16_gb', label: '16 GB'),
      FilterOption(id: '32_gb', label: '32 GB'),
    ],
    specKeys: ['Internal Storage', 'Storage'],
  ),
];

const List<FilterDefinition> _vrHeadsetFilters = [
  _dynamicBrandFilter,
  FilterDefinition(
    id: 'standalone',
    label: 'Standalone',
    type: FilterType.toggle,
    specKeys: ['Standalone', 'PC Required'],
  ),
  FilterDefinition(
    id: 'resolution',
    label: 'Display Resolution',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: '2k', label: '2K'),
      FilterOption(id: '4k', label: '4K'),
    ],
    specKeys: ['Resolution', 'Display Resolution'],
  ),
];

const List<FilterDefinition> _gamepadFilters = [
  _dynamicBrandFilter,
  FilterDefinition(
    id: 'wireless',
    label: 'Wireless',
    type: FilterType.toggle,
    specKeys: ['Wireless', 'Bluetooth', 'Connection Type'],
  ),
  FilterDefinition(
    id: 'platform',
    label: 'Platform',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: 'pc', label: 'PC'),
      FilterOption(id: 'playstation', label: 'PlayStation'),
      FilterOption(id: 'xbox', label: 'Xbox'),
      FilterOption(id: 'switch', label: 'Nintendo Switch'),
      FilterOption(id: 'mobile', label: 'Mobile'),
    ],
    specKeys: ['Platform', 'Compatibility'],
  ),
  FilterDefinition(
    id: 'connection_type',
    label: 'Connection Type',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: 'wired', label: 'Kablolu'),
      FilterOption(id: 'wireless', label: 'Kablosuz'),
      FilterOption(id: 'bluetooth', label: 'Bluetooth'),
      FilterOption(id: '2_4ghz', label: '2.4 GHz'),
    ],
    specKeys: ['Connection Type', 'Connectivity', 'Wireless', 'Bluetooth'],
  ),
  FilterDefinition(
    id: 'battery_life',
    label: 'Battery Life',
    type: FilterType.rangeSlider,
    minValue: 0,
    maxValue: 80,
    unit: 'saat',
    specKeys: ['Battery Life', 'Battery', 'Pil Ömrü', 'Runtime'],
  ),
  FilterDefinition(
    id: 'vibration',
    label: 'Vibration',
    type: FilterType.toggle,
    specKeys: ['Vibration', 'Haptic', 'Titreşim'],
  ),
  FilterDefinition(
    id: 'gyro_controls',
    label: 'Gyro Controls',
    type: FilterType.toggle,
    specKeys: ['Gyro', 'Gyroscope', 'Motion Control', 'Jiroskop'],
  ),
  FilterDefinition(
    id: 'back_buttons',
    label: 'Back Buttons',
    type: FilterType.toggle,
    specKeys: ['Back Buttons', 'Paddles', 'Programmable Buttons'],
  ),
  FilterDefinition(
    id: 'hall_effect',
    label: 'Hall Effect',
    type: FilterType.toggle,
    specKeys: ['Hall Effect', 'Hall Sensor', 'Hall Effect Joystick'],
  ),
];

const List<FilterDefinition> _microphoneFilters = [
  _dynamicBrandFilter,
  FilterDefinition(
    id: 'type',
    label: 'Type',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: 'condenser', label: 'Condenser'),
      FilterOption(id: 'dynamic', label: 'Dynamic'),
      FilterOption(id: 'usb', label: 'USB'),
    ],
    specKeys: ['Type', 'Microphone Type'],
  ),
  FilterDefinition(
    id: 'pattern',
    label: 'Polar Pattern',
    type: FilterType.multiSelect,
    options: [
      FilterOption(id: 'cardioid', label: 'Cardioid'),
      FilterOption(id: 'omnidirectional', label: 'Omnidirectional'),
      FilterOption(id: 'bidirectional', label: 'Bidirectional'),
    ],
    specKeys: ['Polar Pattern', 'Pattern'],
  ),
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

class FilterConfig {
  FilterConfig._();

  static const Map<String, String> _trLabelMap = {
    'Brand': 'Marka',
    'Price Range': 'Fiyat Aralığı',
    'Score Range': 'Skor Aralığı',
    'Wireless': 'Kablosuz',
    'Platform': 'Platform',
    'Connection Type': 'Bağlantı Tipi',
    'Battery Life': 'Pil Ömrü',
    'Vibration': 'Titreşim',
    'Gyro Controls': 'Jiroskop Kontrolü',
    'Back Buttons': 'Arka Tuşlar',
    'Hall Effect': 'Hall Effect',
    'Storage': 'Depolama',
    'Screen Size': 'Ekran Boyutu',
    'Operating System': 'İşletim Sistemi',
    'Processor Brand': 'İşlemci Markası',
    'Processor': 'İşlemci',
    'Resolution': 'Çözünürlük',
    'Refresh Rate': 'Yenileme Hızı',
    'Panel Type': 'Panel Tipi',
    'Camera Type': 'Kamera Tipi',
    'Sensor Size': 'Sensör Boyutu',
    'Video Resolution': 'Video Çözünürlüğü',
    'Smart TV': 'Akıllı TV',
    'Switch Type': 'Switch Türü',
    'Layout': 'Dizilim',
    'DPI': 'DPI',
    'Socket': 'Soket',
    'Form Factor': 'Form Faktörü',
    'Chipset': 'Yonga Seti',
    'Wi-Fi Standard': 'Wi-Fi Standardı',
    'Mesh Support': 'Mesh Desteği',
    'Capacity': 'Kapasite',
    'Display Resolution': 'Ekran Çözünürlüğü',
    'Type': 'Tip',
    'Polar Pattern': 'Kutup Deseni',
  };

  static const Map<String, String> _trOptionMap = {
    '0–40 (Poor)': '0–40 (Zayıf)',
    '40–60 (Average)': '40–60 (Orta)',
    '60–80 (Good)': '60–80 (İyi)',
    '80–100 (Excellent)': '80–100 (Mükemmel)',
  };

  static String localizeLabel(String label, {required String languageCode}) {
    if (!languageCode.toLowerCase().startsWith('tr')) return label;
    return _trLabelMap[label] ?? label;
  }

  static String localizeOptionLabel(
    String label, {
    required String languageCode,
  }) {
    if (!languageCode.toLowerCase().startsWith('tr')) return label;
    return _trOptionMap[label] ?? label;
  }

  static List<FilterDefinition> _mergeDefinitions(
    List<FilterDefinition> primary,
    List<FilterDefinition> secondary,
  ) {
    final seen = <String>{};
    final merged = <FilterDefinition>[];

    for (final def in [...primary, ...secondary]) {
      if (seen.add(def.id)) {
        merged.add(def);
      }
    }

    return merged;
  }

  static const Map<String, List<FilterDefinition>> _categoryFilters = {
    'smartphones': _smartphoneFilters,
    'laptops': _laptopFilters,
    'tablets': _tabletFilters,
    'monitors': _monitorFilters,
    'gpus': _gpuFilters,
    'headphones': _headphoneFilters,
    'smartwatches': _smartwatchFilters,
    'processors': _processorFilters,
    'cpus': _processorFilters,
    'cameras': _cameraFilters,
    'consoles': _consoleFilters,
    'keyboards': _keyboardFilters,
    'mice': _mouseFilters,
    'motherboards': _motherboardFilters,
    'speakers': _speakerFilters,
    'routers': _routerFilters,
    'power_banks': _powerBankFilters,
    'powerbanks': _powerBankFilters,
    'tvs': _tvFilters,
    'desktops': _desktopFilters,
    'ram': _ramModuleFilters,
    'ssd': _ssdFilters,
    'psu': _psuFilters,
    'cases': _caseFilters,
    'coolers': _coolerFilters,
    'projectors': _projectorFilters,
    'soundbars': _soundbarFilters,
    'action-cameras': _actionCameraFilters,
    'security-cameras': _genericFilters,
    'gamepads': _gamepadFilters,
    'printers': _printerFilters,
    'webcams': _webcamFilters,
    'robot-vacuums': _robotVacuumFilters,
    'e-readers': _eReaderFilters,
    'drones': _droneFilters,
    'smart-rings': _genericFilters,
    'media-players': _genericFilters,
    'microphones': _microphoneFilters,
    'ip-cameras': _genericFilters,
    'dashcams': _genericFilters,
    'gimbals': _genericFilters,
    'tripods': _genericFilters,
    'lenses': _genericFilters,
    'vr-headsets': _vrHeadsetFilters,
  };

  /// Get static filter definitions for a category.
  static List<FilterDefinition> getFilters(String categoryId) {
    final categoryFilters = _categoryFilters[categoryId.toLowerCase()];
    if (categoryFilters == null) return List<FilterDefinition>.from(_genericFilters);
    return _mergeDefinitions(categoryFilters, _genericFilters);
  }

  /// Get filter definitions with dynamic options populated from products.
  /// Call this when you have the loaded product list available.
  static List<FilterDefinition> getFiltersWithProducts(
    String categoryId,
    List<dynamic> products,
  ) {
    final defs = getFilters(categoryId);
    if (products.isEmpty) return defs;

    return defs.map<FilterDefinition?>((def) {
      if (def.id == 'price' && def.type == FilterType.rangeSlider) {
        final prices = <double>[];
        for (final p in products) {
          try {
            final productPrices = p.prices;
            if (productPrices is Map) {
              for (final value in productPrices.values) {
                if (value is num && value > 0) {
                  prices.add(value.toDouble());
                }
              }
            }
          } catch (_) {}
        }

        if (prices.isNotEmpty) {
          final minPrice = prices.reduce((a, b) => a < b ? a : b);
          final maxPrice = prices.reduce((a, b) => a > b ? a : b);
          final roundedMin = minPrice < 100
              ? 0.0
              : ((minPrice / 100).floor() * 100).toDouble();
          var roundedMax = ((maxPrice / 100).ceil() * 100).toDouble();
          if (roundedMax <= roundedMin) {
            roundedMax = roundedMin + 100;
          }
          return def.withRange(minValue: roundedMin, maxValue: roundedMax);
        }

        // Hide the price filter entirely when the category has no real price
        // data; otherwise the sheet claims price support that the app cannot
        // actually apply.
        return null;
      }

      if (!def.isDynamic) return def;

      if (def.id == 'brand') {
        final brandCount = <String, int>{};
        final brandLabels = <String, String>{};
        for (final p in products) {
          final brand = ((p.brand as String?) ?? '').trim();
          if (brand.isNotEmpty) {
            final normalizedBrand = brand.toLowerCase();
            brandCount[normalizedBrand] = (brandCount[normalizedBrand] ?? 0) + 1;
            final currentLabel = brandLabels[normalizedBrand];
            if (currentLabel == null || brand.length > currentLabel.length) {
              brandLabels[normalizedBrand] = brand;
            }
          }
        }
        final sorted = brandCount.keys.toList()
          ..sort((a, b) {
            final cmp = brandCount[b]!.compareTo(brandCount[a]!);
            if (cmp != 0) return cmp;
            return (brandLabels[a] ?? a).compareTo(brandLabels[b] ?? b);
          });
        return def.withOptions(
          sorted
              .map(
                (b) => FilterOption(
                  id: b.replaceAll(RegExp(r'[^a-z0-9]'), '_'),
                  label: brandLabels[b] ?? b,
                ),
              )
              .toList(),
        );
      }

      // Generic dynamic: extract unique values from product specs
      final valueSet = <String>{};
      for (final p in products) {
        for (final key in def.specKeys) {
          final specs = (p.specs as Map<String, dynamic>?) ?? {};
          final specSections = (p.specSections as Map<String, dynamic>?) ?? {};
          final v = specs[key]?.toString();
          if (v != null && v.isNotEmpty) valueSet.add(v);
          for (final section in specSections.values) {
            if (section is Map) {
              final sv = section[key]?.toString();
              if (sv != null && sv.isNotEmpty) valueSet.add(sv);
            }
          }
        }
      }
      if (valueSet.isEmpty) return def;
      final sorted = valueSet.toList()..sort();
      return def.withOptions(
        sorted
            .map(
              (v) => FilterOption(
                id: v.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), '_'),
                label: v,
              ),
            )
            .toList(),
      );
    }).whereType<FilterDefinition>().toList();
  }
}
