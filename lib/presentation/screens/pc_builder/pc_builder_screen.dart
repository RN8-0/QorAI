/// Qor AI - PC Builder (PCPartPicker-style with compatibility)
library;

import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:qor_ai/core/email_verification_gate.dart';
import 'package:qor_ai/core/errors.dart';
import 'package:qor_ai/core/theme.dart';
import 'package:qor_ai/core/qor_limit_messages.dart';
import 'package:qor_ai/domain/entities/product_entity.dart';
import 'package:qor_ai/presentation/providers/providers.dart';
import 'package:qor_ai/presentation/screens/pc_builder/pc_builder_localization.dart';
import 'package:qor_ai/presentation/widgets/qor_badges.dart';
import 'package:qor_ai/presentation/widgets/paywall_sheet.dart';
import 'package:qor_ai/presentation/widgets/login_required_dialog.dart';
import 'package:qor_ai/routing/router.dart';
import 'package:qor_ai/core/spec_word_dictionary.dart' as pc_spec_dict;
import 'package:qor_ai/services/spec_translation_service.dart';

/// App-theme gradient (brandDeepBlue → brandBlue → brandCyan).
const _accentGradient = LinearGradient(
  colors: [AppTheme.brandDeepBlue, AppTheme.brandBlue, AppTheme.brandCyan],
  begin: Alignment.topLeft,
  end: Alignment.bottomRight,
);

// Component Category Definitions

enum PcComponent {
  cpu,
  motherboard,
  ram,
  gpu,
  storage,
  psu,
  pcCase,
  cooler,
  monitor,
  keyboard,
  mouse,
  headset;

  String label(BuildContext context) {
    final l = context.l10n;
    return switch (this) {
      cpu => l?.catCpus ?? 'CPU',
      motherboard => l?.catMotherboards ?? 'Motherboard',
      ram => l?.catRam ?? 'RAM',
      gpu => l?.catGpus ?? 'Graphics Card',
      storage => l?.catSsd ?? 'Storage',
      psu => l?.catPsu ?? 'Power Supply',
      pcCase => l?.catCases ?? 'Case',
      cooler => l?.catCoolers ?? 'Cooler',
      monitor => _pcText(context, en: 'Monitor', tr: 'Monitör'),
      keyboard => _pcText(context, en: 'Keyboard', tr: 'Klavye'),
      mouse => _pcText(context, en: 'Mouse', tr: 'Mouse'),
      headset => _pcText(context, en: 'Headset', tr: 'Kulaklık'),
    };
  }

  String get categoryId => switch (this) {
    cpu => 'cpus',
    motherboard => 'motherboards',
    ram => 'ram',
    gpu => 'gpus',
    storage => 'ssd',
    psu => 'psu',
    pcCase => 'cases',
    cooler => 'coolers',
    monitor => 'monitors',
    keyboard => 'keyboards',
    mouse => 'mice',
    headset => 'headsets',
  };

  IconData get icon => switch (this) {
    cpu => Icons.memory_rounded,
    motherboard => Icons.developer_board_rounded,
    ram => Icons.sd_storage_rounded,
    gpu => Icons.videogame_asset_rounded,
    storage => Icons.storage_rounded,
    psu => Icons.bolt_rounded,
    pcCase => Icons.computer_rounded,
    cooler => Icons.air_rounded,
    monitor => Icons.monitor_rounded,
    keyboard => Icons.keyboard_rounded,
    mouse => Icons.mouse_rounded,
    headset => Icons.headset_rounded,
  };

  Color get accentColor => switch (this) {
    cpu => AppTheme.brandBlue,
    motherboard => const Color(0xFF10B981),
    ram => AppTheme.brandDeepBlue,
    gpu => const Color(0xFFEF4444),
    storage => const Color(0xFFF59E0B),
    psu => const Color(0xFFF97316),
    pcCase => AppTheme.brandCyan,
    cooler => const Color(0xFF14B8A6),
    monitor => AppTheme.brandBlue,
    keyboard => const Color(0xFFEC4899),
    mouse => const Color(0xFF84CC16),
    headset => const Color(0xFF0EA5E9),
  };

  // Default TDP estimates when spec data is missing
  double get defaultTdp => switch (this) {
    cpu => 95,
    motherboard => 15,
    ram => 10,
    gpu => 200,
    storage => 5,
    psu => 0, // PSU is the source, not a consumer
    pcCase => 5, // Fans
    cooler => 10,
    monitor => 40,
    keyboard => 2,
    mouse => 1,
    headset => 2,
  };
}

String _pcText(BuildContext context, {required String en, required String tr}) {
  return localizePcBuilderText(context, en: en, tr: tr);
}

// Compatibility Helper

class _Compat {
  static String _normalizeSocket(String raw) {
    var s = raw
        .trim()
        .toUpperCase()
        .replaceAll('SOCKET', '')
        .replaceAll('FCLGA', 'LGA');
    // Strip non-alphanumeric (spaces, hyphens, etc.) first.
    s = s.replaceAll(RegExp(r'[^A-Z0-9]'), '');
    // Normalize Threadripper socket names so "STR5" and "TR5" compare equal.
    // sTR4 → uppercase STR4 → strip 'S' prefix → TR4
    // This handles both sTR4/sTR5 (official) and TR4/TR5 (shorthand) forms.
    if (s.startsWith('STR') &&
        s.length > 3 &&
        RegExp(r'^STR\d+$').hasMatch(s)) {
      s = s.substring(1); // STR5 → TR5
    }
    return s;
  }

  static String? _specValue(ProductEntity p, List<String> keys) {
    for (final key in keys) {
      final v = p.specs[key];
      if (v != null && v.toString().trim().isNotEmpty) {
        return v.toString().trim();
      }
    }
    return null;
  }

  static Iterable<String> _allTexts(ProductEntity p) sync* {
    yield p.name;
    for (final v in p.specs.values) {
      if (v != null) yield v.toString();
    }
    for (final entry in p.keySpecs.entries) {
      yield '${entry.key}: ${entry.value}';
    }
  }

  static int? _extractNumber(String? raw) {
    if (raw == null || raw.isEmpty) return null;
    final m = RegExp(r'(\d{2,5})').firstMatch(raw);
    return m == null ? null : int.tryParse(m.group(1)!);
  }

  static String? socket(ProductEntity p) {
    final parsed = socketTokens(p);
    if (parsed.isNotEmpty) return parsed.first;
    for (final key in [
      'Socket',
      'socket',
      'Processor Socket',
      'processor socket',
      'Soket',
    ]) {
      final v = p.specs[key];
      if (v != null && v.toString().trim().isNotEmpty) {
        return v.toString().trim().toUpperCase();
      }
    }
    // Try extracting from product name (for products missing spec data)
    final name = p.name.toUpperCase();
    final socketPatterns = [
      RegExp(r'\bLGA\s*(\d{3,4})\b'), // LGA1200, LGA1700, LGA1851
      RegExp(r'\bFCLGA\s*(\d{3,4})\b'), // FCLGA1200
      RegExp(r'\bAM[345]\b'), // AM3, AM4, AM5
      RegExp(r'\bTRX\d+\b'), // TRX40, TRX50 (legacy platform)
      RegExp(r'\bSTR\d+\b'), // sTR4, sTR5 (official Threadripper socket)
      RegExp(r'\bTR\d+\b'), // TR4, TR5 (shorthand in many product names)
      RegExp(r'\bWRX\d+\b'), // WRX80, WRX90 (AMD Threadripper Pro platform)
      RegExp(r'\bSTRP\d+\b'), // STRP9 (Intel Xeon Scalable)
    ];
    for (final pattern in socketPatterns) {
      final m = pattern.firstMatch(name);
      if (m != null) return m.group(0)!.replaceAll(' ', '');
    }
    return null;
  }

  static Set<String> socketTokens(ProductEntity p) {
    final found = <String>{};

    void addToken(String raw) {
      final normalized = _normalizeSocket(raw);
      if (normalized.isNotEmpty) found.add(normalized);
    }

    for (final value in _allTexts(p)) {
      final text = value.toUpperCase();
      for (final match in RegExp(
        // LGA (Intel): LGA1200, LGA1700, LGA1851, FCLGA variants
        r'\b(?:FC)?LGA\s*\d{3,4}\b'
        // AMD desktop: AM3, AM4, AM5
        r'|\bAM[345]\b'
        // AMD Threadripper legacy: TRX40, TRX50 (platform designation)
        r'|\bTRX\d+\b'
        // AMD Threadripper modern: sTR4, sTR5 (official socket name)
        r'|\bSTR\d+\b'
        // AMD Threadripper shorthand used in many product names: TR4, TR5, TR6
        r'|\bTR\d+\b'
        // AMD EPYC/WRX platform: WRX80, WRX90
        r'|\bWRX\d+\b'
        // Intel Xeon Scalable Processor socket
        r'|\bSTRP\d+\b',
      ).allMatches(text)) {
        addToken(match.group(0)!);
      }
    }

    for (final raw in [
      _specValue(p, ['Socket', 'socket', 'Processor Socket']),
      _specValue(p, [
        'Compatible Sockets',
        'Socket Support',
        'Supported Socket',
      ]),
    ]) {
      if (raw == null) continue;
      for (final part in raw.split(RegExp(r'[,/|;]'))) {
        final trimmed = part.trim();
        if (trimmed.isEmpty) continue;
        for (final match in RegExp(
          r'(?:FC)?LGA\s*\d{3,4}|AM[345]|TRX\d+|STR\d+|TR\d+|WRX\d+|STRP\d+',
        ).allMatches(trimmed.toUpperCase())) {
          addToken(match.group(0)!);
        }
      }
    }

    return found;
  }

  static bool supportsSocket(ProductEntity p, String targetSocket) {
    final target = _normalizeSocket(targetSocket);
    if (target.isEmpty) return false;
    final tokens = socketTokens(p);
    if (tokens.isEmpty) return false;
    return tokens.any(
      (token) =>
          token == target || token.contains(target) || target.contains(token),
    );
  }

  static String? memoryType(ProductEntity p) {
    // Check specific spec keys first for DDR mentions
    for (final key in [
      'Memory Technology',
      'memory technology',
      'Memory Type',
      'RAM Type',
      'Supported Memory Types',
      'Memory Standard',
      'Bellek Tipi',
      'Bellek Teknolojisi',
      'Type',
      'Technology',
      'Memory',
      'Bellek',
      'DDR',
      'Tip',
      'Teknoloji',
      'Memory Kit',
      'Kit',
      'Standard',
      'Standart',
    ]) {
      final v = p.specs[key];
      if (v != null && v.toString().trim().isNotEmpty) {
        final str = v.toString().trim().toUpperCase();
        final matches = RegExp(
          r'DDR\d',
        ).allMatches(str).map((m) => m.group(0)!).toSet();
        if (matches.length == 1) return matches.first;
        if (matches.length > 1) return null; // multi-gen support → no filter
      }
    }
    // Scan ALL spec values for DDR mention
    for (final v in p.specs.values) {
      if (v == null) continue;
      final str = v.toString().toUpperCase();
      final m = RegExp(r'\bDDR(\d)\b').firstMatch(str);
      if (m != null) return 'DDR${m.group(1)}';
    }
    // Fallback: product name (many RAM products have DDR in their name)
    final nameUp = p.name.toUpperCase();
    final ddr = RegExp(r'\bDDR(\d)\b').firstMatch(nameUp);
    if (ddr != null) return 'DDR${ddr.group(1)}';
    // Check for DDR without word boundary (e.g. "DDR4-3200" in name)
    final ddrLoose = RegExp(r'DDR(\d)').firstMatch(nameUp);
    if (ddrLoose != null) return 'DDR${ddrLoose.group(1)}';
    // Detect DDR generation from model numbers where D3/D4/D5 is used (e.g. "OWC1333D3W8M64K")
    final dModel = RegExp(r'D(3|4|5)(?=[A-Z0-9])').firstMatch(nameUp);
    if (dModel != null) return 'DDR${dModel.group(1)}';
    // Detect by speed suffix that uniquely identifies gen: speeds ≤2133 → DDR3, 2133-6400 → DDR4/DDR5
    // (too ambiguous to infer reliably, so return null)
    return null;
  }

  static double? tdp(ProductEntity p) {
    for (final key in [
      'TDP',
      'Thermal Design Power (TDP)',
      'Power Consumption',
      'Wattage',
      'Max Power',
      'Güç Tüketimi',
    ]) {
      final v = p.specs[key]?.toString();
      if (v != null && v.isNotEmpty) {
        final match = RegExp(r'(\d+)').firstMatch(v);
        if (match != null) return double.tryParse(match.group(1)!);
      }
    }
    return null;
  }

  static double? psuWattage(ProductEntity p) {
    for (final key in ['Power', 'Wattage', 'Output Power', 'Maximum Power']) {
      final v = p.specs[key]?.toString();
      if (v != null && v.isNotEmpty) {
        final match = RegExp(r'(\d+)').firstMatch(v);
        if (match != null) return double.tryParse(match.group(1)!);
      }
    }
    // Try extracting from name (e.g. "750W")
    final wMatch = RegExp(r'(\d{3,4})\s*[Ww]').firstMatch(p.name);
    if (wMatch != null) return double.tryParse(wMatch.group(1)!);
    return null;
  }

  static double? recommendedSystemPower(ProductEntity p) {
    final raw = _specValue(p, [
      'Recommended System Power',
      'Recommended PSU',
      'Recommended Power Supply',
    ]);
    final watts = _extractNumber(raw);
    return watts?.toDouble();
  }

  /// Searches all spec values for a query string
  static bool matchesSpecSearch(ProductEntity p, String query) {
    for (final v in _allTexts(p)) {
      if (v.toLowerCase().contains(query)) return true;
    }
    return false;
  }

  static int searchScore(ProductEntity p, String query) {
    final normalized = query.trim().toLowerCase();
    if (normalized.isEmpty) return 1;

    final tokens = normalized
        .split(RegExp(r'\s+'))
        .where((t) => t.trim().isNotEmpty)
        .toList();
    final name = p.name.toLowerCase();
    final brand = (p.brand ?? '').toLowerCase();
    final specText = _allTexts(p).join(' ').toLowerCase();

    var score = 0;
    if (name == normalized) score += 160;
    if (name.startsWith(normalized)) score += 120;
    if (name.contains(normalized)) score += 90;
    if (brand == normalized) score += 80;
    if (brand.contains(normalized)) score += 45;
    if (specText.contains(normalized)) score += 25;

    for (final token in tokens) {
      if (name.startsWith(token)) score += 32;
      if (name.contains(token)) score += 22;
      if (brand.contains(token)) score += 14;
      if (specText.contains(token)) score += 8;
    }

    return score;
  }

  /// GPU power connector — returns '6-pin','8-pin','12-pin','16-pin' or null
  static String? gpuPowerConnector(ProductEntity p) {
    for (final key in [
      'Power Connector',
      'PCI-E Power',
      'Supplementary Power',
      'Power Connectors',
      'PCIe Power',
    ]) {
      final v = p.specs[key]?.toString().toLowerCase();
      if (v != null && v.isNotEmpty) {
        if (v.contains('16') || v.contains('12vhpwr') || v.contains('600')) {
          return '16-pin (12VHPWR)';
        }
        if (v.contains('2x8') || v.contains('8+8') || v.contains('two 8')) {
          return '2×8-pin';
        }
        if (v.contains('8+6') || v.contains('8-pin + 6')) return '8+6-pin';
        if (v.contains('8')) return '8-pin';
        if (v.contains('6')) return '6-pin';
        return v;
      }
    }
    // Infer from TDP
    final w = tdp(p);
    if (w != null) {
      if (w >= 300) return '16-pin (12VHPWR)';
      if (w >= 200) return '2×8-pin';
      if (w >= 100) return '8-pin';
      if (w >= 70) return '6-pin';
    }
    return null;
  }

  static bool gpuNeedsModernPsu(ProductEntity p) {
    final conn = gpuPowerConnector(p)?.toLowerCase() ?? '';
    if (conn.contains('16') ||
        conn.contains('12vhpwr') ||
        conn.contains('12v-2x6')) {
      return true;
    }
    final gpuPower = tdp(p) ?? recommendedSystemPower(p);
    return (gpuPower ?? 0) >= 450;
  }

  /// Form factor — ATX / mATX / mITX / E-ATX
  static String? formFactor(ProductEntity p) {
    for (final key in [
      'Form Factor',
      'Motherboard Form Factor',
      'Case Type',
      'Compatible Motherboard Form Factor',
    ]) {
      final v = p.specs[key]?.toString().toUpperCase();
      if (v != null && v.isNotEmpty) {
        if (v.contains('E-ATX') || v.contains('EATX') || v.contains('XL-ATX')) {
          return 'E-ATX';
        }
        if (v.contains('MATX') ||
            v.contains('MICRO-ATX') ||
            v.contains('MICRO ATX') ||
            v.contains('M-ATX')) {
          return 'mATX';
        }
        if (v.contains('MINI-ITX') ||
            v.contains('MINI ITX') ||
            v.contains('MITX') ||
            v.contains('ITX')) {
          return 'mITX';
        }
        if (v.contains('ATX')) return 'ATX';
        return v;
      }
    }
    // Infer from name
    final n = p.name.toUpperCase();
    if (n.contains('MINI-ITX') || n.contains('MINI ITX') || n.contains('ITX')) {
      return 'mITX';
    }
    if (n.contains('MATX') || n.contains('MICRO ATX') || n.contains('M-ATX')) {
      return 'mATX';
    }
    if (n.contains('E-ATX') || n.contains('EATX')) return 'E-ATX';
    return null;
  }

  static int? gpuLengthMm(ProductEntity p) {
    final raw = _specValue(p, [
      'GPU Length',
      'Graphics Card Length',
      'Card Length',
      'Length',
    ]);
    return _extractNumber(raw);
  }

  static int? caseMaxGpuLengthMm(ProductEntity p) {
    final raw = _specValue(p, [
      'GPU Length (max)',
      'Max GPU Length',
      'GPU Clearance',
      'Maximum GPU Length',
    ]);
    return _extractNumber(raw);
  }

  static bool motherboardHasM2(ProductEntity p) {
    final raw = _specValue(p, ['M.2 Slot', 'M.2 Slot Count', 'M.2 Features']);
    if (raw == null) return false;
    return raw.toLowerCase().contains('yes') || _extractNumber(raw) != null;
  }

  static bool motherboardHasSata(ProductEntity p) {
    final raw = _specValue(p, ['SATA Slot', 'SATA Slot Count']);
    if (raw == null) return false;
    return raw.toLowerCase().contains('yes') || _extractNumber(raw) != null;
  }

  static bool isM2Storage(ProductEntity p) {
    final frame = _specValue(p, ['Frame Size'])?.toLowerCase() ?? '';
    final connection =
        _specValue(p, [
          'Connection Interface',
          'Transfer Protocol',
          'Bus',
          'Bus Standard',
        ])?.toLowerCase() ??
        '';
    final text = '$frame $connection ${p.name}'.toLowerCase();
    return text.contains('m.2') || text.contains('m2') || text.contains('nvme');
  }

  static bool isSataStorage(ProductEntity p) {
    final frame = _specValue(p, ['Frame Size'])?.toLowerCase() ?? '';
    final connection =
        _specValue(p, [
          'Connection Interface',
          'Transfer Protocol',
          'Bus',
          'Bus Standard',
        ])?.toLowerCase() ??
        '';
    final text = '$frame $connection ${p.name}'.toLowerCase();
    return text.contains('sata') || text.contains('2.5');
  }

  static bool psuSupportsModernGpu(ProductEntity p) {
    final text = _allTexts(p).join(' ').toLowerCase();
    return text.contains('atx 3') ||
        text.contains('atx3') ||
        text.contains('pcie 5') ||
        text.contains('pcie5') ||
        text.contains('12vhpwr') ||
        text.contains('12v-2x6');
  }

  /// Checks if two form factors are compatible (MB fits in Case)
  static bool formFactorCompatible(String? mbFf, String? caseFf) {
    if (mbFf == null || caseFf == null) return true; // unknown = assume ok
    // Ordering: mITX < mATX < ATX < E-ATX
    const order = {'mITX': 0, 'mATX': 1, 'ATX': 2, 'E-ATX': 3};
    final mb = order[mbFf] ?? 2;
    final cs = order[caseFf] ?? 2;
    return mb <= cs; // MB must be <= case capacity
  }

  /// PSU form factor for case
  // ignore: unused_element
  static String? psuFormFactor(ProductEntity p) {
    for (final key in ['Form Factor', 'PSU Form Factor']) {
      final v = p.specs[key]?.toString().toUpperCase();
      if (v != null && v.isNotEmpty) {
        if (v.contains('SFX')) return 'SFX';
        if (v.contains('ATX')) return 'ATX';
        return v;
      }
    }
    return null;
  }

  /// PCIe version from GPU or MB
  // ignore: unused_element
  static String? pcieVersion(ProductEntity p) {
    for (final key in ['PCI Express', 'PCIe', 'Interface', 'PCI-E']) {
      final v = p.specs[key]?.toString();
      if (v != null && v.isNotEmpty) {
        final m = RegExp(
          r'PCIe?\s*(\d+\.?\d*)',
          caseSensitive: false,
        ).firstMatch(v);
        if (m != null) return 'PCIe ${m.group(1)}';
      }
    }
    return null;
  }

  /// Max memory speed supported (for MB or CPU)
  // ignore: unused_element
  static int? maxMemSpeed(ProductEntity p) {
    for (final key in [
      'Memory Speed',
      'Max Memory Speed',
      'Memory Frequency',
      'Supported Memory Speed',
      'Maximum Memory Speed',
    ]) {
      final v = p.specs[key]?.toString();
      if (v != null) {
        final m = RegExp(r'(\d{3,5})').firstMatch(v);
        if (m != null) return int.tryParse(m.group(1)!);
      }
    }
    return null;
  }
}

// ── Compatibility Issue ────────────────────────────────────────────────────────

enum _IssueSeverity { error, warning, info }

class _CompatIssue {
  final _IssueSeverity severity;
  final IconData icon;
  final String title;
  final String detail;
  final PcComponent? component;
  const _CompatIssue({
    required this.severity,
    required this.icon,
    required this.title,
    required this.detail,
    this.component,
  });

  Color get color => switch (severity) {
    _IssueSeverity.error => AppTheme.rose500,
    _IssueSeverity.warning => AppTheme.amber500,
    _IssueSeverity.info => AppTheme.brandBlue,
  };
}

class _UpgradeSuggestion {
  final PcComponent component;
  final ProductEntity product;
  final String reason;
  final int scoreGain;

  const _UpgradeSuggestion({
    required this.component,
    required this.product,
    required this.reason,
    required this.scoreGain,
  });
}

// Animated Progress Ring Painter

class _ProgressRingPainter extends CustomPainter {
  final double progress; // 0.0 - 1.0
  final Color color;
  final Color bgColor;

  _ProgressRingPainter({
    required this.progress,
    required this.color,
    required this.bgColor,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width / 2 - 3;
    final bgPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 4
      ..color = bgColor;
    final fgPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 4
      ..strokeCap = StrokeCap.round
      ..color = color;
    canvas.drawCircle(center, radius, bgPaint);
    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius),
      -pi / 2,
      2 * pi * progress,
      false,
      fgPaint,
    );
  }

  @override
  bool shouldRepaint(_ProgressRingPainter old) =>
      old.progress != progress || old.color != color;
}

// Main PC Builder Screen

class PcBuilderScreen extends ConsumerStatefulWidget {
  const PcBuilderScreen({super.key});
  @override
  ConsumerState<PcBuilderScreen> createState() => _PcBuilderScreenState();
}

class _PcBuilderScreenState extends ConsumerState<PcBuilderScreen>
    with SingleTickerProviderStateMixin {
  final Map<PcComponent, ProductEntity> _selected = {};
  bool _summaryExpanded = false;
  late AnimationController _celebrationController;
  late Animation<double> _celebrationAnim;
  bool _showCelebration = false;
  String? _aiAnalysis;
  bool _aiLoading = false;
  String? _localDiagnosis;
  PcComponent? _upgradeFocus;
  List<_UpgradeSuggestion> _upgradeSuggestions = const [];

  @override
  void initState() {
    super.initState();
    _celebrationController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    );
    _celebrationAnim = CurvedAnimation(
      parent: _celebrationController,
      curve: Curves.elasticOut,
    );
    // Restore state from session provider
    _restoreFromSession();
  }

  void _restoreFromSession() {
    final saved = ref.read(pcBuilderSessionProvider);
    for (final entry in saved.entries) {
      final comp = PcComponent.values
          .where((c) => c.name == entry.key)
          .firstOrNull;
      if (comp != null) _selected[comp] = entry.value;
    }
    _aiAnalysis = ref.read(pcBuilderAiProvider);
    if (_selected.length == PcComponent.values.length) _showCelebration = true;
  }

  void _saveToSession() {
    ref.read(pcBuilderSessionProvider.notifier).state = _selected.map(
      (k, v) => MapEntry(k.name, v),
    );
    ref.read(pcBuilderAiProvider.notifier).state = _aiAnalysis;
  }

  @override
  void dispose() {
    _celebrationController.dispose();
    super.dispose();
  }

  double get _totalScore {
    if (_selected.isEmpty) return 0;
    final scores = _selected.values.map((p) => p.techScore).toList();
    return scores.reduce((a, b) => a + b) / scores.length;
  }

  String? get _selectedSocket {
    final cpu = _selected[PcComponent.cpu];
    if (cpu != null) return _Compat.socket(cpu);
    final mb = _selected[PcComponent.motherboard];
    if (mb != null) return _Compat.socket(mb);
    return null;
  }

  String? get _selectedMemType {
    // Motherboard is most authoritative for memory type
    final mb = _selected[PcComponent.motherboard];
    if (mb != null) {
      final t = _Compat.memoryType(mb);
      if (t != null) return t;
    }
    // CPU platform implies memory type for unambiguous platforms
    final cpu = _selected[PcComponent.cpu];
    if (cpu != null) {
      final t = _Compat.memoryType(cpu);
      if (t != null) return t;
      // Infer from socket where the platform is unambiguous
      final sock = _Compat.socket(cpu);
      if (sock != null) {
        if (sock.contains('AM5')) return 'DDR5';
        if (sock.contains('AM4')) return 'DDR4';
        // Threadripper / Threadripper Pro
        if (sock.contains('TR5') || sock.contains('STR5')) return 'DDR5';
        if (sock.contains('TR4') || sock.contains('STR4')) return 'DDR4';
        if (sock.contains('SWRX8') || sock.contains('WRX8')) return 'DDR4';
        if (sock.contains('TRX50') || sock.contains('WRX90')) return 'DDR5';
        // Intel sockets
        if (sock.contains('1851')) {
          return 'DDR5'; // LGA1851 = Arrow Lake, DDR5 only
        }
        if (sock.contains('1700')) {
          return null; // LGA1700 supports DDR4 or DDR5 — let motherboard decide
        }
        if (sock.contains('1200')) {
          return 'DDR4'; // LGA1200 = Comet Lake, DDR4 only
        }
        if (sock.contains('1151')) {
          return 'DDR4'; // LGA1151 = Coffee Lake, DDR4 only
        }
        // LGA1700 supports both DDR4/DDR5 → null (let MB decide)
      }
    }
    // RAM already selected
    final ram = _selected[PcComponent.ram];
    if (ram != null) return _Compat.memoryType(ram);
    return null;
  }

  double get _estimatedPower {
    double total = 0;
    for (final entry in _selected.entries) {
      if (entry.key == PcComponent.psu) continue;
      final tdp = _Compat.tdp(entry.value);
      total += tdp ?? entry.key.defaultTdp;
    }
    return total;
  }

  double? get _psuWattage {
    final psu = _selected[PcComponent.psu];
    if (psu == null) return null;
    return _Compat.psuWattage(psu);
  }

  double? get _psuHeadroom {
    final w = _psuWattage;
    if (w == null) return null;
    return w - _estimatedPower;
  }

  // ignore: unused_element
  String? get _selectedFormFactor {
    final mb = _selected[PcComponent.motherboard];
    if (mb != null) return _Compat.formFactor(mb);
    final cs = _selected[PcComponent.pcCase];
    if (cs != null) return _Compat.formFactor(cs);
    return null;
  }

  String _analysisLanguageName() {
    return switch (Localizations.localeOf(context).languageCode) {
      'tr' => 'Turkish',
      'de' => 'German',
      'es' => 'Spanish',
      'fr' => 'French',
      'it' => 'Italian',
      'ja' => 'Japanese',
      'pt' => 'Portuguese',
      'ar' => 'Arabic',
      _ => 'English',
    };
  }

  PcComponent? get _primaryUpgradeComponent {
    final compatIssues =
        _compatIssues.where((issue) => issue.component != null).toList()
          ..sort((a, b) => a.severity.index.compareTo(b.severity.index));
    final compatTarget = compatIssues.firstOrNull?.component;
    if (compatTarget != null) return compatTarget;

    final headroom = _psuHeadroom;
    if (headroom != null && headroom < 100) return PcComponent.psu;

    final cpu = _selected[PcComponent.cpu];
    final gpu = _selected[PcComponent.gpu];
    if (cpu != null && gpu != null) {
      final diff = cpu.techScore - gpu.techScore;
      if (diff.abs() >= 14) {
        return diff < 0 ? PcComponent.cpu : PcComponent.gpu;
      }
    }

    const upgradeOrder = [
      PcComponent.cpu,
      PcComponent.gpu,
      PcComponent.ram,
      PcComponent.storage,
      PcComponent.cooler,
      PcComponent.motherboard,
      PcComponent.pcCase,
    ];
    final ranked =
        upgradeOrder
            .where((component) => _selected.containsKey(component))
            .map((component) => MapEntry(component, _selected[component]!))
            .toList()
          ..sort((a, b) => a.value.techScore.compareTo(b.value.techScore));
    return ranked.firstOrNull?.key;
  }

  String _buildDeterministicDiagnosis(PcComponent? focus) {
    final issue = _compatIssues.firstOrNull;
    if (issue != null) {
      return _pcText(
        context,
        en: '${issue.title}: ${issue.detail}',
        tr: '${issue.title}: ${issue.detail}',
      );
    }

    final cpu = _selected[PcComponent.cpu];
    final gpu = _selected[PcComponent.gpu];
    final ram = _selected[PcComponent.ram];
    final headroom = _psuHeadroom;

    if (focus == PcComponent.cpu && cpu != null && gpu != null) {
      return _pcText(
        context,
        en: 'GPU score is noticeably ahead of the CPU, so the processor is the first likely bottleneck under high-refresh gaming loads.',
        tr: 'GPU skoru CPU’dan belirgin şekilde ileride; bu nedenle yüksek tazeleme hızlı oyunlarda ilk darboğaz adayı işlemci oluyor.',
      );
    }
    if (focus == PcComponent.gpu && cpu != null && gpu != null) {
      return _pcText(
        context,
        en: 'CPU platform looks stronger than the selected GPU, so graphics performance is the first upgrade area for gaming and rendering.',
        tr: 'CPU platformu seçili GPU’dan daha güçlü görünüyor; bu nedenle oyun ve render tarafında ilk geliştirme alanı ekran kartı.',
      );
    }
    if (focus == PcComponent.psu && headroom != null) {
      return _pcText(
        context,
        en: 'Power budget is too tight for comfortable spikes and future upgrades. A PSU with more headroom will stabilize the build.',
        tr: 'Güç bütçesi ani yüklenmeler ve gelecekteki yükseltmeler için dar kalıyor. Daha fazla paylı bir PSU sistemi daha güvenli hale getirir.',
      );
    }
    if (focus == PcComponent.ram && ram != null) {
      return _pcText(
        context,
        en: 'Memory is the soft spot of this build, either because of speed/capacity or because the rest of the platform scales higher.',
        tr: 'Bu sistemin yumuşak noktası RAM; kapasite/hız seviyesi ya da platformun geri kalanının daha yükseğe çıkabilmesi nedeniyle önce RAM bakılmalı.',
      );
    }

    return _pcText(
      context,
      en: 'The build is broadly usable, but the next improvement should target the lowest-performing core component to keep the system balanced.',
      tr: 'Sistem genel olarak kullanılabilir durumda; fakat dengeyi korumak için sıradaki geliştirme en zayıf temel bileşene odaklanmalı.',
    );
  }

  bool _isCompatibleUpgrade(PcComponent component, ProductEntity candidate) {
    final socketTarget = _selectedSocket;
    final memTypeTarget = _selectedMemType;
    final selectedMb = component == PcComponent.motherboard
        ? candidate
        : _selected[PcComponent.motherboard];
    final selectedCase = component == PcComponent.pcCase
        ? candidate
        : _selected[PcComponent.pcCase];
    final selectedGpu = component == PcComponent.gpu
        ? candidate
        : _selected[PcComponent.gpu];

    switch (component) {
      case PcComponent.cpu:
        if (socketTarget == null) return true;
        final sock = _Compat.socket(candidate);
        return sock != null &&
            (sock.contains(socketTarget) || socketTarget.contains(sock));
      case PcComponent.motherboard:
        if (socketTarget != null) {
          final sock = _Compat.socket(candidate);
          if (sock == null ||
              (!sock.contains(socketTarget) && !socketTarget.contains(sock))) {
            return false;
          }
        }
        if (selectedCase != null &&
            !_Compat.formFactorCompatible(
              _Compat.formFactor(candidate),
              _Compat.formFactor(selectedCase),
            )) {
          return false;
        }
        return true;
      case PcComponent.ram:
        if (memTypeTarget == null) return true;
        final mem = _Compat.memoryType(candidate);
        return mem != null &&
            (mem.contains(memTypeTarget) || memTypeTarget.contains(mem));
      case PcComponent.gpu:
        final gpuLength = _Compat.gpuLengthMm(candidate);
        final caseLimit = selectedCase == null
            ? null
            : _Compat.caseMaxGpuLengthMm(selectedCase);
        if (gpuLength != null && caseLimit != null && gpuLength > caseLimit) {
          return false;
        }
        return true;
      case PcComponent.storage:
        if (selectedMb == null) return true;
        if (_Compat.isM2Storage(candidate) &&
            !_Compat.motherboardHasM2(selectedMb)) {
          return false;
        }
        if (_Compat.isSataStorage(candidate) &&
            !_Compat.motherboardHasSata(selectedMb)) {
          return false;
        }
        return true;
      case PcComponent.psu:
        final watt = _Compat.psuWattage(candidate);
        final required = max(
          (_estimatedPower * 1.25).ceilToDouble(),
          selectedGpu == null
              ? 0.0
              : (_Compat.recommendedSystemPower(selectedGpu) ?? 0.0),
        );
        return watt != null && watt >= required;
      case PcComponent.pcCase:
        if (selectedMb != null &&
            !_Compat.formFactorCompatible(
              _Compat.formFactor(selectedMb),
              _Compat.formFactor(candidate),
            )) {
          return false;
        }
        final gpuLength = selectedGpu == null
            ? null
            : _Compat.gpuLengthMm(selectedGpu);
        final caseLimit = _Compat.caseMaxGpuLengthMm(candidate);
        if (gpuLength != null && caseLimit != null && gpuLength > caseLimit) {
          return false;
        }
        return true;
      case PcComponent.cooler:
        if (socketTarget == null) return true;
        return _Compat.supportsSocket(candidate, socketTarget) ||
            _Compat.socketTokens(candidate).isEmpty;
      case PcComponent.monitor:
      case PcComponent.keyboard:
      case PcComponent.mouse:
      case PcComponent.headset:
        return true;
    }
  }

  String _upgradeReason(
    PcComponent component,
    ProductEntity current,
    ProductEntity candidate,
  ) {
    final gain = (candidate.techScore - current.techScore).round();
    return switch (component) {
      PcComponent.cpu => _pcText(
        context,
        en: 'Keeps the ${_selectedSocket ?? "current"} platform while adding about +$gain score.',
        tr: '${_selectedSocket ?? "mevcut"} platformunda kalıp yaklaşık +$gain puan kazandırıyor.',
      ),
      PcComponent.gpu => _pcText(
        context,
        en: 'Raises graphics headroom by about +$gain score without breaking the current case fit rules.',
        tr: 'Mevcut kasa uyumunu bozmadan grafik tarafında yaklaşık +$gain puanlık pay açıyor.',
      ),
      PcComponent.psu => _pcText(
        context,
        en: 'Adds cleaner power margin with ${(_Compat.psuWattage(candidate) ?? 0).round()}W capacity.',
        tr: '${(_Compat.psuWattage(candidate) ?? 0).round()}W kapasiteyle daha rahat güç payı sunuyor.',
      ),
      PcComponent.cooler => _pcText(
        context,
        en: 'Matches the current socket and is a stronger thermal fit for the selected processor.',
        tr: 'Mevcut soketle eşleşiyor ve seçili işlemci için daha güçlü bir termal eşleşme sunuyor.',
      ),
      PcComponent.storage => _pcText(
        context,
        en: 'Fits the motherboard storage layout and improves overall drive quality by about +$gain score.',
        tr: 'Anakart depolama yapısına uyuyor ve disk kalitesini yaklaşık +$gain puan artırıyor.',
      ),
      PcComponent.ram => _pcText(
        context,
        en: 'Stays on ${_selectedMemType ?? "the current memory platform"} and improves balance.',
        tr: '${_selectedMemType ?? "mevcut bellek platformunda"} kalıp sistem dengesini iyileştiriyor.',
      ),
      PcComponent.motherboard => _pcText(
        context,
        en: 'Keeps the platform socket while giving the build a stronger board foundation.',
        tr: 'Platform soketini korurken sisteme daha güçlü bir anakart temeli veriyor.',
      ),
      PcComponent.pcCase => _pcText(
        context,
        en: 'Preserves motherboard and GPU fit while improving overall case quality.',
        tr: 'Anakart ve GPU sığmasını korurken kasa kalitesini yükseltiyor.',
      ),
      _ => _pcText(
        context,
        en: 'A safer overall upgrade choice for this build.',
        tr: 'Bu kurulum icin daha guvenli bir genel upgrade secenegi.',
      ),
    };
  }

  Future<List<_UpgradeSuggestion>> _loadUpgradeSuggestions(
    PcComponent component,
  ) async {
    final current = _selected[component];
    if (current == null) return const [];

    final pool = await ref.read(
      pcBuilderProductsProvider(component.categoryId).future,
    );
    final candidates =
        pool
            .where((p) => p.id != current.id)
            .where((p) => p.techScore > current.techScore + 3)
            .where((p) => _isCompatibleUpgrade(component, p))
            .toList()
          ..sort((a, b) {
            final priceA = a.prices['US'] ?? a.prices.values.firstOrNull ?? 0.0;
            final priceB = b.prices['US'] ?? b.prices.values.firstOrNull ?? 0.0;
            final valueA = a.techScore - (priceA > 0 ? priceA / 250 : 0);
            final valueB = b.techScore - (priceB > 0 ? priceB / 250 : 0);
            return valueB.compareTo(valueA);
          });

    return candidates.take(3).map((candidate) {
      return _UpgradeSuggestion(
        component: component,
        product: candidate,
        reason: _upgradeReason(component, current, candidate),
        scoreGain: (candidate.techScore - current.techScore).round(),
      );
    }).toList();
  }

  /// Returns all current compatibility issues in the build
  List<_CompatIssue> get _compatIssues {
    final issues = <_CompatIssue>[];
    final cpu = _selected[PcComponent.cpu];
    final mb = _selected[PcComponent.motherboard];
    final ram = _selected[PcComponent.ram];
    final gpu = _selected[PcComponent.gpu];
    final psu = _selected[PcComponent.psu];
    final cs = _selected[PcComponent.pcCase];
    final cooler = _selected[PcComponent.cooler];

    // 1. CPU ↔ Motherboard socket mismatch
    if (cpu != null && mb != null) {
      final cpuSock = _Compat.socket(cpu);
      final mbSock = _Compat.socket(mb);
      if (cpuSock != null &&
          mbSock != null &&
          cpuSock != mbSock &&
          !cpuSock.contains(mbSock) &&
          !mbSock.contains(cpuSock)) {
        issues.add(
          _CompatIssue(
            severity: _IssueSeverity.error,
            icon: Icons.error_rounded,
            title: _pcText(
              context,
              en: 'Socket Mismatch',
              tr: 'Soket Uyumsuzluğu',
            ),
            detail: _pcText(
              context,
              en: 'CPU socket ($cpuSock) ≠ Motherboard socket ($mbSock)',
              tr: 'CPU soketi ($cpuSock) ≠ Anakart soketi ($mbSock)',
            ),
            component: PcComponent.motherboard,
          ),
        );
      }
    }

    // 2. RAM ↔ Motherboard/CPU memory type
    if (ram != null) {
      final ramType = _Compat.memoryType(ram);
      final required = _selectedMemType;
      if (ramType != null && required != null && ramType != required) {
        issues.add(
          _CompatIssue(
            severity: _IssueSeverity.error,
            icon: Icons.error_rounded,
            title: _pcText(
              context,
              en: 'RAM Type Mismatch',
              tr: 'RAM Türü Uyumsuzluğu',
            ),
            detail: _pcText(
              context,
              en: 'RAM is $ramType but system requires $required',
              tr: 'RAM türü $ramType ancak sistem $required gerektiriyor',
            ),
            component: PcComponent.ram,
          ),
        );
      }
    }

    // 3. MB ↔ Case form factor
    if (mb != null && cs != null) {
      final mbFf = _Compat.formFactor(mb);
      final csFf = _Compat.formFactor(cs);
      if (!_Compat.formFactorCompatible(mbFf, csFf)) {
        issues.add(
          _CompatIssue(
            severity: _IssueSeverity.error,
            icon: Icons.error_rounded,
            title: _pcText(
              context,
              en: 'Form Factor Mismatch',
              tr: 'Form Faktörü Uyumsuzluğu',
            ),
            detail: _pcText(
              context,
              en: 'Motherboard ($mbFf) won\'t fit in this case ($csFf)',
              tr: 'Anakart ($mbFf) bu kasaya ($csFf) sığmaz',
            ),
            component: PcComponent.pcCase,
          ),
        );
      }
    }

    // 4. PSU insufficient
    if (psu != null) {
      final headroom = _psuHeadroom;
      if (headroom != null && headroom < 0) {
        issues.add(
          _CompatIssue(
            severity: _IssueSeverity.error,
            icon: Icons.bolt_rounded,
            title: _pcText(context, en: 'PSU Insufficient', tr: 'PSU Yetersiz'),
            detail: _pcText(
              context,
              en: 'System needs ${_estimatedPower.round()}W but PSU provides ${_psuWattage!.round()}W (${headroom.round()}W short)',
              tr: 'Sistem ${_estimatedPower.round()}W istiyor ancak PSU ${_psuWattage!.round()}W sağlıyor (${headroom.round()}W eksik)',
            ),
            component: PcComponent.psu,
          ),
        );
      } else if (headroom != null && headroom < 100) {
        issues.add(
          _CompatIssue(
            severity: _IssueSeverity.warning,
            icon: Icons.warning_rounded,
            title: _pcText(
              context,
              en: 'PSU Headroom Low',
              tr: 'PSU Payı Düşük',
            ),
            detail: _pcText(
              context,
              en: 'Only +${headroom.round()}W headroom — consider a higher wattage PSU',
              tr: 'Sadece +${headroom.round()}W güç payı var — daha yüksek watt PSU düşünün',
            ),
            component: PcComponent.psu,
          ),
        );
      }
    }

    // 5. CPU cooler socket compatibility
    if (cooler != null && cpu != null) {
      final cpuSock = _Compat.socket(cpu);
      final coolerSockets = _Compat.socketTokens(cooler);
      if (cpuSock != null &&
          coolerSockets.isNotEmpty &&
          !_Compat.supportsSocket(cooler, cpuSock)) {
        issues.add(
          _CompatIssue(
            severity: _IssueSeverity.error,
            icon: Icons.air_rounded,
            title: _pcText(
              context,
              en: 'Cooler Socket Mismatch',
              tr: 'Soğutucu Soket Uyumsuzluğu',
            ),
            detail: _pcText(
              context,
              en: 'Cooler supports ${coolerSockets.join(", ")}, CPU needs $cpuSock mounting',
              tr: 'Sogutucu ${coolerSockets.join(", ")} destekliyor, CPU ise $cpuSock montaji istiyor',
            ),
            component: PcComponent.cooler,
          ),
        );
      }
    }

    // 6. GPU ↔ Case clearance mismatch
    if (gpu != null && cs != null) {
      final gpuLength = _Compat.gpuLengthMm(gpu);
      final caseLimit = _Compat.caseMaxGpuLengthMm(cs);
      if (gpuLength != null && caseLimit != null && gpuLength > caseLimit) {
        issues.add(
          _CompatIssue(
            severity: _IssueSeverity.error,
            icon: Icons.straighten_rounded,
            title: _pcText(
              context,
              en: 'GPU Clearance Mismatch',
              tr: 'GPU Boyut Uyumsuzlugu',
            ),
            detail: _pcText(
              context,
              en: 'GPU length ${gpuLength}mm exceeds case limit ${caseLimit}mm',
              tr: 'GPU uzunlugu ${gpuLength}mm, kasanin ${caseLimit}mm limitini asiyor',
            ),
            component: PcComponent.pcCase,
          ),
        );
      }
    }

    // 7. Storage ↔ Motherboard slot mismatch
    final storage = _selected[PcComponent.storage];
    if (storage != null && mb != null) {
      final isM2 = _Compat.isM2Storage(storage);
      final isSata = _Compat.isSataStorage(storage);
      if (isM2 && !_Compat.motherboardHasM2(mb)) {
        issues.add(
          _CompatIssue(
            severity: _IssueSeverity.error,
            icon: Icons.storage_rounded,
            title: _pcText(
              context,
              en: 'Storage Slot Mismatch',
              tr: 'Depolama Yuvasi Uyumsuzlugu',
            ),
            detail: _pcText(
              context,
              en: 'Selected SSD is M.2/NVMe but motherboard does not advertise an M.2 slot',
              tr: 'Secili SSD M.2/NVMe ancak anakartta M.2 yuvasi gorunmuyor',
            ),
            component: PcComponent.storage,
          ),
        );
      } else if (isSata && !_Compat.motherboardHasSata(mb)) {
        issues.add(
          _CompatIssue(
            severity: _IssueSeverity.error,
            icon: Icons.storage_rounded,
            title: _pcText(
              context,
              en: 'Storage Slot Mismatch',
              tr: 'Depolama Yuvasi Uyumsuzlugu',
            ),
            detail: _pcText(
              context,
              en: 'Selected SSD requires SATA but motherboard does not advertise a SATA port',
              tr: 'Secili SSD SATA istiyor ancak anakartta SATA girisi gorunmuyor',
            ),
            component: PcComponent.storage,
          ),
        );
      }
    }

    // 8. GPU power connector / PSU generation warning
    if (gpu != null && psu != null) {
      final gpuConn = _Compat.gpuPowerConnector(gpu);
      if (gpuConn != null &&
          gpuConn.contains('16') &&
          !_Compat.psuSupportsModernGpu(psu)) {
        issues.add(
          _CompatIssue(
            severity: _IssueSeverity.warning,
            icon: Icons.power_rounded,
            title: _pcText(
              context,
              en: 'Modern GPU Power Check',
              tr: 'Modern GPU Güç Kontrolü',
            ),
            detail: _pcText(
              context,
              en: 'GPU needs a modern 16-pin / 12VHPWR-style feed, but PSU metadata does not clearly advertise ATX 3.x / PCIe 5 support.',
              tr: 'GPU modern 16-pin / 12VHPWR benzeri bağlantı istiyor; PSU verisinde ATX 3.x / PCIe 5 desteği net görünmüyor.',
            ),
            component: PcComponent.gpu,
          ),
        );
      }
    }

    return issues;
  }

  double get _totalPrice {
    double total = 0;
    for (final p in _selected.values) {
      final price = p.prices['US'] ?? p.prices.values.firstOrNull ?? 0;
      total += price;
    }
    return total;
  }

  void _openPicker(PcComponent component) async {
    // Free tier: unlimited component slots — only the AI analysis is gated.
    // (The old 5-slot cap has been removed so users can build any configuration
    //  freely; the paywall only applies when they request the AI analysis.)

    final result = await showModalBottomSheet<ProductEntity>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (_) => DraggableScrollableSheet(
        initialChildSize: 0.92,
        minChildSize: 0.5,
        maxChildSize: 0.95,
        builder: (context, scrollController) => ClipRRect(
          borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
          child: _ComponentPickerPage(
            component: component,
            currentSelection: _selected[component],
            socketFilter:
                (component == PcComponent.motherboard ||
                    component == PcComponent.cooler)
                ? _selectedSocket
                : null,
            memTypeFilter: component == PcComponent.ram
                ? _selectedMemType
                : null,
            formFactorFilter:
                (component == PcComponent.pcCase &&
                    _selected[PcComponent.motherboard] != null)
                ? _Compat.formFactor(_selected[PcComponent.motherboard]!)
                : (component == PcComponent.motherboard &&
                      _selected[PcComponent.pcCase] != null)
                ? _Compat.formFactor(_selected[PcComponent.pcCase]!)
                : null,
            allSelected: Map.from(_selected),
            scrollController: scrollController,
          ),
        ),
      ),
    );
    if (result != null && mounted) {
      // Before applying the new selection, figure out which previously-selected
      // components become incompatible so we can auto-clear them and warn.
      final oldSocket = _selectedSocket;
      final oldMemType = _selectedMemType;
      final oldFormFactor = _selected[PcComponent.motherboard] != null
          ? _Compat.formFactor(_selected[PcComponent.motherboard]!)
          : null;

      setState(() {
        _selected[component] = result;
        _aiAnalysis = null;
        _localDiagnosis = null;
        _upgradeFocus = null;
        _upgradeSuggestions = const [];
      });

      // Detect compatibility breakage caused by the change.
      final newSocket = _selectedSocket;
      final newMemType = _selectedMemType;
      final newFormFactor = _selected[PcComponent.motherboard] != null
          ? _Compat.formFactor(_selected[PcComponent.motherboard]!)
          : null;

      final removed = <String>[];
      setState(() {
        // CPU socket changed → clear incompatible motherboard / cooler.
        if (oldSocket != null && newSocket != null && oldSocket != newSocket) {
          final mb = _selected[PcComponent.motherboard];
          if (mb != null) {
            final mbSocket = _Compat.socket(mb);
            if (mbSocket != null && mbSocket != newSocket) {
              _selected.remove(PcComponent.motherboard);
              removed.add(_pcText(context, tr: 'Anakart', en: 'Motherboard'));
            }
          }
          final cooler = _selected[PcComponent.cooler];
          if (cooler != null) {
            final coolerSocket = _Compat.socket(cooler);
            if (coolerSocket != null && coolerSocket != newSocket) {
              _selected.remove(PcComponent.cooler);
              removed.add(_pcText(context, tr: 'Soğutucu', en: 'Cooler'));
            }
          }
        }
        // Memory type changed → clear incompatible RAM.
        if (oldMemType != null &&
            newMemType != null &&
            oldMemType != newMemType) {
          final ram = _selected[PcComponent.ram];
          if (ram != null) {
            final ramType = _Compat.memoryType(ram);
            if (ramType != null && ramType != newMemType) {
              _selected.remove(PcComponent.ram);
              removed.add(_pcText(context, tr: 'RAM', en: 'RAM'));
            }
          }
        }
        // Form factor changed → clear incompatible case.
        if (oldFormFactor != null &&
            newFormFactor != null &&
            oldFormFactor != newFormFactor) {
          final pcCase = _selected[PcComponent.pcCase];
          if (pcCase != null) {
            final caseFF = _Compat.formFactor(pcCase);
            if (caseFF != null && caseFF != newFormFactor) {
              _selected.remove(PcComponent.pcCase);
              removed.add(_pcText(context, tr: 'Kasa', en: 'Case'));
            }
          }
        }
      });

      if (removed.isNotEmpty && mounted) {
        final removedStr = removed.join(', ');
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              _pcText(
                context,
                tr: '⚠️ Uyumsuz parçalar kaldırıldı: $removedStr',
                en: '⚠️ Incompatible parts removed: $removedStr',
              ),
            ),
            duration: const Duration(seconds: 4),
            backgroundColor: AppTheme.warning,
          ),
        );
      }

      _saveToSession();
      if (_selected.length == PcComponent.values.length && !_showCelebration) {
        _showCelebration = true;
        _celebrationController.forward(from: 0);
      }
    }
  }

  // ignore: unused_element
  void _showUpgradeSnackbar(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        action: SnackBarAction(
          label: 'Premium',
          onPressed: () => showPaywallSheet(context),
        ),
      ),
    );
  }

  void _removeComponent(PcComponent c) {
    setState(() {
      _selected.remove(c);
      _showCelebration = false;
      _aiAnalysis = null;
      _localDiagnosis = null;
      _upgradeFocus = null;
      _upgradeSuggestions = const [];
    });
    _saveToSession();
  }

  void _resetAll() {
    setState(() {
      _selected.clear();
      _showCelebration = false;
      _summaryExpanded = false;
      _aiAnalysis = null;
      _localDiagnosis = null;
      _upgradeFocus = null;
      _upgradeSuggestions = const [];
    });
    _saveToSession();
  }

  void _shareBuild() {
    final buf = StringBuffer('🖥️ My PC Build (Qor AI)\n');
    buf.writeln('═' * 30);
    buf.writeln('Build Score: ${_totalScore.round()}/100');
    buf.writeln('Components: ${_selected.length}/${PcComponent.values.length}');
    buf.writeln('Est. Power Draw: ${_estimatedPower.round()}W');
    if (_psuWattage != null) {
      buf.writeln(
        'PSU: ${_psuWattage!.round()}W (Headroom: ${_psuHeadroom!.round()}W)',
      );
    }
    if (_selectedSocket != null) buf.writeln('Socket: $_selectedSocket');
    if (_selectedMemType != null) buf.writeln('Memory: $_selectedMemType');
    buf.writeln('─' * 30);
    for (final c in PcComponent.values) {
      final p = _selected[c];
      if (p != null) {
        buf.writeln(
          '${c.name.toUpperCase()}: ${p.name} (${p.techScore.round()}/100)',
        );
      } else {
        buf.writeln('${c.name.toUpperCase()}: Not selected');
      }
    }
    buf.writeln('═' * 30);
    buf.writeln('Built with Qor AI');
    Clipboard.setData(ClipboardData(text: buf.toString()));
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Build copied to clipboard!',
            style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w600),
          ),
          behavior: SnackBarBehavior.floating,
          backgroundColor: AppTheme.success,
          duration: const Duration(seconds: 2),
        ),
      );
    }
  }

  Future<void> _runAiAnalysis() async {
    if (_aiLoading) return;
    if (!requireAuth(context)) return;
    if (!await ensureEmailVerified(context, ref)) return;
    if (!mounted) return;
    // Check PC Builder AI limit
    if (_aiAnalysis == null) {
      final sub = ref.read(subscriptionServiceProvider);
      if (!sub.canUsePcBuilderAi) {
        final langCode = Localizations.localeOf(context).languageCode;
        final limitL10n = qorLocalizationsForCode(langCode);
        showModalBottomSheet(
          context: context,
          isScrollControlled: true,
          backgroundColor: Colors.transparent,
          builder: (ctx) {
            return Container(
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
              decoration: BoxDecoration(
                color: const Color(
                  0xFF1A1A1A,
                ), // Fallback dark if not available
                borderRadius: const BorderRadius.vertical(
                  top: Radius.circular(24),
                ),
                border: Border(
                  top: BorderSide(color: Colors.white.withValues(alpha: 0.1)),
                ),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 40,
                    height: 4,
                    margin: const EdgeInsets.only(bottom: 24),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.2),
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                  Row(
                    children: [
                      const Icon(
                        Icons.auto_awesome,
                        color: AppTheme.premiumBase,
                        size: 24,
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          dailyQLimitTitle(langCode),
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 20,
                            fontWeight: FontWeight.w700,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Text(
                    '${buildDailyQLimitMessage(langCode)} ${buildDailyQResetMessage(langCode)}',
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 14,
                      height: 1.6,
                      color: Colors.white.withValues(alpha: 0.7),
                    ),
                  ),
                  const SizedBox(height: 32),
                  SizedBox(
                    width: double.infinity,
                    height: 54,
                    child: ElevatedButton(
                      onPressed: () {
                        Navigator.pop(ctx);
                        showPaywallSheet(context);
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppTheme.premiumBase,
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(16),
                        ),
                        elevation: 0,
                      ),
                      child: Text(
                        limitL10n.premium,
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            );
          },
        );
        return;
      }
      sub.recordPcBuilderAi();
    }
    final focus = _primaryUpgradeComponent;
    setState(() {
      _aiLoading = true;
      _aiAnalysis = null;
      _upgradeFocus = focus;
      _localDiagnosis = _buildDeterministicDiagnosis(focus);
      _upgradeSuggestions = const [];
    });

    try {
      final suggestions = focus == null
          ? const <_UpgradeSuggestion>[]
          : await _loadUpgradeSuggestions(focus);
      final buf = StringBuffer();
      buf.writeln(
        'You are a world-class PC hardware expert. Respond ONLY in the exact format below.',
      );
      buf.writeln('Language for explanations: ${_analysisLanguageName()}.');
      buf.writeln('RULES:');
      buf.writeln(
        '1. Keep ALL section labels exactly as written (uppercase). Do NOT add extra text outside sections.',
      );
      buf.writeln(
        '2. FPS numbers must be REALISTIC integers based on real-world GPU/CPU benchmarks (not theoretical maximums). Use conservative estimates.',
      );
      buf.writeln(
        '3. If any incompatibility exists (socket mismatch, DDR4/DDR5 conflict, PSU too weak, case size mismatch), you MUST flag it in WEAKNESSES and RECOMMENDATIONS as a critical error.',
      );
      buf.writeln(
        '4. Write detailed but efficient analysis. Each bullet can use up to 28 words and may include one short supporting clause.',
      );
      buf.writeln(
        '5. OVERVIEW, THERMALS, and POWER_ANALYSIS may each contain up to 2 short sentences.',
      );
      buf.writeln(
        '6. Mention exact component names when a recommendation depends on a specific bottleneck or incompatibility.',
      );
      buf.writeln();
      buf.writeln('=== BUILD COMPONENTS ===');
      for (final c in PcComponent.values) {
        final p = _selected[c];
        if (p != null) {
          buf.writeln(
            '${c.name.toUpperCase()}: ${p.name} (Score: ${p.techScore.round()}/100)',
          );
          final specs = p.specs.entries
              .take(8)
              .map((e) => '  ${e.key}: ${e.value}')
              .join('\n');
          if (specs.isNotEmpty) buf.writeln(specs);
        }
      }
      buf.writeln();
      buf.writeln('=== SYSTEM METRICS ===');
      buf.writeln('Total power draw: ${_estimatedPower.round()}W');
      if (_psuWattage != null)
        buf.writeln(
          'PSU: ${_psuWattage!.round()}W (headroom: ${_psuHeadroom!.round()}W)',
        );
      if (_selectedSocket != null) buf.writeln('Socket: $_selectedSocket');
      if (_selectedMemType != null) buf.writeln('Memory: $_selectedMemType');
      final gpuConn = _selected[PcComponent.gpu] != null
          ? _Compat.gpuPowerConnector(_selected[PcComponent.gpu]!)
          : null;
      if (gpuConn != null) buf.writeln('GPU connector: $gpuConn');
      buf.writeln('Build score: ${_totalScore.round()}/100');
      buf.writeln(
        'Compatibility issues: ${_compatIssues.isEmpty ? "None" : _compatIssues.map((i) => i.title).join(", ")}',
      );
      buf.writeln();
      if (_localDiagnosis != null) {
        buf.writeln('=== LOCAL DIAGNOSIS ===');
        buf.writeln(_localDiagnosis);
        buf.writeln();
      }
      if (focus != null) {
        buf.writeln('=== PRIMARY UPGRADE TARGET ===');
        buf.writeln(focus.name.toUpperCase());
        buf.writeln();
      }
      if (suggestions.isNotEmpty) {
        buf.writeln('=== COMPATIBLE UPGRADE CANDIDATES ===');
        for (final s in suggestions) {
          buf.writeln(
            '- ${s.component.name.toUpperCase()}: ${s.product.name} (${s.product.techScore.round()}/100) — ${s.reason}',
          );
        }
        buf.writeln();
      }
      buf.writeln('Respond in this EXACT format:');
      buf.writeln();
      buf.writeln(
        'OVERVIEW: [2 short sentences summarizing what this build is good at and where it struggles]',
      );
      buf.writeln();
      buf.writeln('BOTTLENECK: [0-100]% - [component]: [one short sentence]');
      buf.writeln(
        'PERFORMANCE_TIER: [Budget/Mid-Range/High-End/Enthusiast/Ultra]',
      );
      buf.writeln();
      buf.writeln('IDEAL_USE:');
      buf.writeln('- [best use case 1 with context]');
      buf.writeln('- [best use case 2 with context]');
      buf.writeln('- [best use case 3 with context]');
      buf.writeln();
      buf.writeln('FPS_1080P:');
      for (final g in [
        'Fortnite',
        'CS2',
        'Valorant',
        'GTA V',
        'Cyberpunk 2077',
        'Elden Ring',
        'Apex Legends',
        'COD Warzone',
      ]) {
        buf.writeln('- $g: [fps] FPS');
      }
      buf.writeln();
      buf.writeln('FPS_1440P:');
      for (final g in [
        'Fortnite',
        'CS2',
        'Valorant',
        'GTA V',
        'Cyberpunk 2077',
        'Elden Ring',
        'Apex Legends',
        'COD Warzone',
      ]) {
        buf.writeln('- $g: [fps] FPS');
      }
      buf.writeln();
      buf.writeln('FPS_4K:');
      for (final g in [
        'Fortnite',
        'CS2',
        'Valorant',
        'GTA V',
        'Cyberpunk 2077',
        'Elden Ring',
        'Apex Legends',
        'COD Warzone',
      ]) {
        buf.writeln('- $g: [fps] FPS');
      }
      buf.writeln();
      buf.writeln('STRENGTHS:');
      buf.writeln('- [strength 1]');
      buf.writeln('- [strength 2]');
      buf.writeln('- [strength 3]');
      buf.writeln('- [strength 4 if meaningful]');
      buf.writeln();
      buf.writeln('WEAKNESSES:');
      buf.writeln('- [weakness 1]');
      buf.writeln('- [weakness 2]');
      buf.writeln('- [weakness 3]');
      buf.writeln();
      buf.writeln('UPGRADE_PRIORITY: [component] — [why, one sentence]');
      buf.writeln();
      buf.writeln('RECOMMENDATIONS:');
      if (suggestions.isNotEmpty) {
        for (final s in suggestions) {
          final cur = _selected[s.component];
          if (cur == null) continue;
          buf.writeln(
            '- Replace ${cur.name} with ${s.product.name} — [detailed reason]',
          );
        }
      } else {
        buf.writeln('- [Best upgrade direction for this build with reason]');
      }
      buf.writeln();
      buf.writeln(
        'THERMALS: [1-2 short sentences about cooling balance, airflow, and likely thermal pressure]',
      );
      buf.writeln();
      buf.writeln(
        'POWER_ANALYSIS: [1-2 short sentences about PSU adequacy, headroom, and GPU connector requirements]',
      );

      final deepseekService = ref.read(deepSeekServiceProvider);
      final response = await deepseekService.freeTextQuery(buf.toString());

      if (mounted) {
        setState(() {
          _aiAnalysis = response;
          _aiLoading = false;
          _upgradeSuggestions = suggestions;
        });
        _saveToSession();

        // Save history to SharedPreferences
        try {
          final uid = ref.read(authStateProvider).valueOrNull;
          if (uid != null) {
            final prefs = await SharedPreferences.getInstance();
            final key = 'pc_build_history_$uid';
            final historyList = prefs.getStringList(key) ?? [];
            final newEntry = {
              'date': DateTime.now().toIso8601String(),
              'components': _selected.map((k, v) => MapEntry(k.name, v.name)),
              'ai_analysis': response,
              'total_score': _totalScore,
              'estimated_power': _estimatedPower,
              'psu_wattage': _psuWattage,
              'power_headroom': _psuHeadroom,
              'socket': _selectedSocket,
              'memory_type': _selectedMemType,
              'upgrade_focus': focus?.name,
              'compatibility_issues': _compatIssues
                  .map(
                    (issue) => {
                      'title': issue.title,
                      'detail': issue.detail,
                      'severity': issue.severity.name,
                      'component': issue.component?.name,
                    },
                  )
                  .toList(),
            };
            historyList.add(jsonEncode(newEntry));
            await prefs.setStringList(key, historyList);
          }
        } catch (_) {}

        // Mirror AI analysis to users.analyzedProducts so admin panel sees it
        try {
          final uid = ref.read(authStateProvider).valueOrNull;
          if (uid != null) {
            final buildTitle = _selected.values
                .whereType<ProductEntity>()
                .map((p) => p.name)
                .take(3)
                .join(' + ');
            ref.read(pbDataSourceProvider).saveAnalyzedProduct(uid, {
              'timestamp': DateTime.now().toIso8601String(),
              'title': buildTitle.isEmpty ? 'PC Build' : buildTitle,
              'category': 'pc_build',
              'mode': 'pc_builder',
              'verdict': response.substring(0, response.length.clamp(0, 200)),
            });
          }
        } catch (_) {}
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _aiLoading = false;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              _pcText(
                context,
                en: 'AI analysis failed: $e',
                tr: 'AI analizi başarısız oldu: $e',
              ),
            ),
            backgroundColor: AppTheme.rose500,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final sc = _totalScore >= 80
        ? AppTheme.success
        : _totalScore >= 60
        ? AppTheme.brandBlue
        : _totalScore >= 40
        ? AppTheme.amber500
        : AppTheme.rose500;
    final cnt = _selected.length;

    return Scaffold(
      backgroundColor: context.backgroundColor,
      body: CustomScrollView(
        slivers: [
          SliverAppBar(
            expandedHeight: 120,
            pinned: true,
            backgroundColor: context.backgroundColor,
            leading: IconButton(
              icon: Icon(Icons.arrow_back_rounded, color: context.textPrimary),
              onPressed: () =>
                  context.canPop() ? context.pop() : context.go(AppRoutes.home),
            ),
            actions: [
              IconButton(
                icon: Icon(Icons.history_rounded, color: AppTheme.brandBlue),
                tooltip: _pcText(context, tr: 'Geçmiş', en: 'History'),
                onPressed: () => context.push('/pc-builder-history'),
              ),
              if (cnt > 0)
                TextButton.icon(
                  onPressed: _resetAll,
                  icon: const Icon(
                    Icons.restart_alt_rounded,
                    size: 18,
                    color: Color(0xFFEF4444),
                  ),
                  label: Text(
                    context.l10n?.reset ?? 'Sıfırla',
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 12,
                      color: const Color(0xFFEF4444),
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
            ],
            flexibleSpace: FlexibleSpaceBar(
              titlePadding: const EdgeInsets.only(left: 56, bottom: 16),
              title: ShaderMask(
                shaderCallback: (bounds) =>
                    _accentGradient.createShader(bounds),
                child: Text(
                  context.l10n?.pcBuilderTitle ?? 'PC Builder',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                    color: Colors.white,
                  ),
                ),
              ),
            ),
          ),

          // Score card with animated progress ring
          SliverToBoxAdapter(
            child: Container(
              margin: const EdgeInsets.fromLTRB(16, 4, 16, 12),
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    AppTheme.brandBlue.withValues(alpha: 0.08),
                    AppTheme.brandDeepBlue.withValues(alpha: 0.04),
                  ],
                ),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(
                  color: AppTheme.brandBlue.withValues(alpha: 0.15),
                ),
              ),
              child: Row(
                children: [
                  // Animated progress ring
                  SizedBox(
                    width: 62,
                    height: 62,
                    child: Stack(
                      alignment: Alignment.center,
                      children: [
                        CustomPaint(
                          size: const Size(62, 62),
                          painter: _ProgressRingPainter(
                            progress: cnt / PcComponent.values.length,
                            color: sc,
                            bgColor: context.dividerColor,
                          ),
                        ),
                        Container(
                          width: 48,
                          height: 48,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            gradient: cnt > 0
                                ? LinearGradient(
                                    colors: [sc, sc.withValues(alpha: 0.6)],
                                  )
                                : null,
                            color: cnt > 0 ? null : context.surfaceVariantColor,
                          ),
                          child: Center(
                            child: cnt > 0
                                ? Text(
                                    _totalScore.round().toString(),
                                    style: GoogleFonts.plusJakartaSans(
                                      fontSize: 18,
                                      fontWeight: FontWeight.w800,
                                      color: Colors.white,
                                    ),
                                  )
                                : Icon(
                                    Icons.computer_rounded,
                                    size: 22,
                                    color: context.textTertiaryColor,
                                  ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          cnt > 0
                              ? (context.l10n?.buildScore ?? 'Build Score')
                              : (context.l10n?.pcBuilderDesc ??
                                    'Choose components to build your PC'),
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                            color: context.textPrimary,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          _pcText(
                            context,
                            en: '$cnt / ${PcComponent.values.length} components selected',
                            tr: '$cnt / ${PcComponent.values.length} bileşen seçildi',
                          ),
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 11,
                            color: context.textSecondary,
                          ),
                        ),
                        if (_selectedSocket != null ||
                            _selectedMemType != null) ...[
                          const SizedBox(height: 3),
                          Text(
                            '${_selectedSocket != null ? _pcText(context, en: "Socket: $_selectedSocket", tr: "Soket: $_selectedSocket") : ""}${_selectedSocket != null && _selectedMemType != null ? " \u00b7 " : ""}${_selectedMemType ?? ""}',
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 10,
                              color: AppTheme.brandDeepBlue,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                        if (cnt > 0) ...[
                          const SizedBox(height: 6),
                          ClipRRect(
                            borderRadius: BorderRadius.circular(3),
                            child: LinearProgressIndicator(
                              value: cnt / PcComponent.values.length,
                              backgroundColor: context.dividerColor,
                              valueColor: AlwaysStoppedAnimation(sc),
                              minHeight: 3,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),

          // Celebration banner when all 8 selected
          if (_showCelebration && cnt == PcComponent.values.length)
            SliverToBoxAdapter(
              child: AnimatedBuilder(
                animation: _celebrationAnim,
                builder: (context, child) => Transform.scale(
                  scale: 0.8 + 0.2 * _celebrationAnim.value,
                  child: Opacity(
                    opacity: _celebrationAnim.value.clamp(0.0, 1.0),
                    child: child,
                  ),
                ),
                child: Container(
                  margin: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                  padding: const EdgeInsets.symmetric(
                    vertical: 14,
                    horizontal: 16,
                  ),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: [
                        AppTheme.success.withValues(alpha: 0.15),
                        AppTheme.brandBlue.withValues(alpha: 0.1),
                      ],
                    ),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(
                      color: AppTheme.success.withValues(alpha: 0.3),
                    ),
                  ),
                  child: Row(
                    children: [
                      const Text('🎉', style: TextStyle(fontSize: 24)),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              _pcText(
                                context,
                                en: 'Build Complete!',
                                tr: 'Sistem Hazır!',
                              ),
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 15,
                                fontWeight: FontWeight.w800,
                                color: AppTheme.success,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              _pcText(
                                context,
                                en: 'All ${PcComponent.values.length} components selected. Score: ${_totalScore.round()}/100',
                                tr: 'Tüm ${PcComponent.values.length} bileşen seçildi. Puan: ${_totalScore.round()}/100',
                              ),
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 11,
                                color: context.textSecondary,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),

          // Compatibility Issues Panel
          if (_compatIssues.isNotEmpty)
            SliverToBoxAdapter(child: _buildCompatPanel(context)),

          // Power Draw Validation
          if (_selected.isNotEmpty)
            SliverToBoxAdapter(child: _buildPowerSection(context)),

          // Component rows with section headers
          SliverPadding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            sliver: SliverList(
              delegate: SliverChildListDelegate([
                // Core section header
                _buildSectionHeader(
                  context,
                  Icons.memory_rounded,
                  _pcText(
                    context,
                    en: 'Core Components',
                    tr: 'Temel Bileşenler',
                  ),
                  '${[PcComponent.cpu, PcComponent.motherboard, PcComponent.ram, PcComponent.gpu, PcComponent.storage].where((c) => _selected.containsKey(c)).length}/5',
                ),
                ..._buildComponentGroup(context, [
                  PcComponent.cpu,
                  PcComponent.motherboard,
                  PcComponent.ram,
                  PcComponent.gpu,
                  PcComponent.storage,
                ]),
                const SizedBox(height: 12),
                // Cooling & Power
                _buildSectionHeader(
                  context,
                  Icons.bolt_rounded,
                  _pcText(context, en: 'Power & Cooling', tr: 'Güç ve Soğutma'),
                  '${[PcComponent.psu, PcComponent.cooler, PcComponent.pcCase].where((c) => _selected.containsKey(c)).length}/3',
                ),
                ..._buildComponentGroup(context, [
                  PcComponent.psu,
                  PcComponent.cooler,
                  PcComponent.pcCase,
                ]),
                const SizedBox(height: 12),
                // Peripherals
                _buildSectionHeader(
                  context,
                  Icons.devices_rounded,
                  _pcText(context, en: 'Peripherals', tr: 'Çevre Birimleri'),
                  '${[PcComponent.monitor, PcComponent.keyboard, PcComponent.mouse, PcComponent.headset].where((c) => _selected.containsKey(c)).length}/4',
                ),
                ..._buildComponentGroup(context, [
                  PcComponent.monitor,
                  PcComponent.keyboard,
                  PcComponent.mouse,
                  PcComponent.headset,
                ]),
              ]),
            ),
          ),

          // Build Summary Card
          if (_selected.isNotEmpty)
            SliverToBoxAdapter(child: _buildSummaryCard(context, sc, cnt)),

          // AI Build Analysis
          if (_selected.length >= 5)
            SliverToBoxAdapter(child: _buildAiSection(context)),

          SliverToBoxAdapter(
            child: SizedBox(
              height: MediaQuery.of(context).padding.bottom + 100,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSectionHeader(
    BuildContext context,
    IconData icon,
    String title,
    String count,
  ) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8, top: 4),
      child: Row(
        children: [
          Container(
            width: 28,
            height: 28,
            decoration: BoxDecoration(
              gradient: _accentGradient,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(icon, size: 14, color: Colors.white),
          ),
          const SizedBox(width: 10),
          Text(
            title,
            style: GoogleFonts.plusJakartaSans(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: context.textPrimary,
            ),
          ),
          const Spacer(),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: AppTheme.brandBlue.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              count,
              style: GoogleFonts.plusJakartaSans(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: AppTheme.brandBlue,
              ),
            ),
          ),
        ],
      ),
    );
  }

  List<Widget> _buildComponentGroup(
    BuildContext context,
    List<PcComponent> components,
  ) {
    return components.map((c) {
      final p = _selected[c];
      String? note;
      if (c == PcComponent.motherboard && _selectedSocket != null) {
        note = _pcText(
          context,
          en: 'Socket: $_selectedSocket',
          tr: 'Soket: $_selectedSocket',
        );
      }
      if (c == PcComponent.ram && _selectedMemType != null) {
        note = _selectedMemType;
      }
      if (c == PcComponent.cooler && _selectedSocket != null) {
        note = _pcText(
          context,
          en: 'Socket: $_selectedSocket',
          tr: 'Soket: $_selectedSocket',
        );
      }
      return _ComponentRow(
        component: c,
        selectedProduct: p,
        onChoose: () => _openPicker(c),
        onRemove: p != null ? () => _removeComponent(c) : null,
        compatNote: note,
      );
    }).toList();
  }

  Widget _buildAiSection(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            AppTheme.brandDeepBlue.withValues(alpha: 0.08),
            const Color(0xFF3B82F6).withValues(alpha: 0.04),
          ],
        ),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: AppTheme.brandDeepBlue.withValues(alpha: 0.2),
        ),
      ),
      child: Column(
        children: [
          InkWell(
            borderRadius: BorderRadius.circular(16),
            onTap: _aiLoading ? null : _runAiAnalysis,
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Row(
                children: [
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [AppTheme.brandDeepBlue, AppTheme.brandCyan],
                      ),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: _aiLoading
                        ? const Padding(
                            padding: EdgeInsets.all(8),
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Icon(
                            Icons.auto_awesome_rounded,
                            size: 18,
                            color: Colors.white,
                          ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _pcText(
                            context,
                            en: 'AI Build Analysis',
                            tr: 'AI Sistem Analizi',
                          ),
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                            color: context.textPrimary,
                          ),
                        ),
                        Text(
                          _aiAnalysis != null
                              ? _pcText(
                                  context,
                                  en: 'Tap to refresh',
                                  tr: 'Yenilemek için dokunun',
                                )
                              : _pcText(
                                  context,
                                  en: 'Bottleneck \u00b7 FPS \u00b7 Performance',
                                  tr: 'Darboğaz \u00b7 FPS \u00b7 Performans',
                                ),
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 10,
                            color: context.textSecondary,
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (!_aiLoading && _aiAnalysis == null)
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 7,
                      ),
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(
                          colors: [AppTheme.brandDeepBlue, AppTheme.brandCyan],
                        ),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            _pcText(context, en: 'Analyze', tr: 'Analiz Et'),
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              color: Colors.white,
                            ),
                          ),
                          if (!ref.watch(premiumProvider)) ...[
                            const SizedBox(width: 8),
                            QorAmountBadge(
                              amount: ref
                                  .read(subscriptionServiceProvider)
                                  .creditCostForFeature('pc_builder_ai'),
                              color: Colors.white,
                              fontSize: 10,
                              padding: const EdgeInsets.symmetric(
                                horizontal: 8,
                                vertical: 3,
                              ),
                            ),
                            const SizedBox(width: 6),
                            QorBalanceBadge(
                              remaining: ref
                                  .read(subscriptionServiceProvider)
                                  .remainingDailyCredits,
                              total: ref
                                  .read(subscriptionServiceProvider)
                                  .totalDailyCredits,
                              unlimited: false,
                              color: Colors.white,
                              fontSize: 9,
                              padding: const EdgeInsets.symmetric(
                                horizontal: 7,
                                vertical: 3,
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ),
          if (_aiAnalysis != null) ...[
            Divider(height: 1, color: context.dividerColor),
            Padding(
              padding: const EdgeInsets.all(14),
              child: _buildAnalysisContent(context, _aiAnalysis!),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildDeterministicAdviceSection(BuildContext context) {
    if (_localDiagnosis == null && _upgradeSuggestions.isEmpty) {
      return const SizedBox.shrink();
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppTheme.brandBlue.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppTheme.brandBlue.withValues(alpha: 0.18)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.insights_rounded, size: 15, color: AppTheme.brandBlue),
              const SizedBox(width: 6),
              Text(
                _pcText(context, en: 'Build diagnosis', tr: 'Sistem tespiti'),
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: AppTheme.brandBlue,
                ),
              ),
              if (_upgradeFocus != null) ...[
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 3,
                  ),
                  decoration: BoxDecoration(
                    color: _upgradeFocus!.accentColor.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    _upgradeFocus!.label(context),
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      color: _upgradeFocus!.accentColor,
                    ),
                  ),
                ),
              ],
            ],
          ),
          if (_localDiagnosis != null) ...[
            const SizedBox(height: 8),
            Text(
              _localDiagnosis!,
              style: GoogleFonts.plusJakartaSans(
                fontSize: 11,
                color: context.textSecondary,
                height: 1.45,
              ),
            ),
          ],
          if (_upgradeSuggestions.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(
              _pcText(
                context,
                en: 'Recommended products',
                tr: 'Önerilen ürünler',
              ),
              style: GoogleFonts.plusJakartaSans(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: context.textPrimary,
              ),
            ),
            const SizedBox(height: 8),
            ..._upgradeSuggestions.map(
              (suggestion) => Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: context.surfaceVariantColor,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: context.dividerColor),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            suggestion.product.name,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              color: context.textPrimary,
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 3,
                          ),
                          decoration: BoxDecoration(
                            color: suggestion.component.accentColor.withValues(
                              alpha: 0.12,
                            ),
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Text(
                            '+${suggestion.scoreGain}',
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 10,
                              fontWeight: FontWeight.w800,
                              color: suggestion.component.accentColor,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(
                      suggestion.reason,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 10,
                        color: context.textSecondary,
                        height: 1.4,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildAnalysisContent(BuildContext context, String analysis) {
    final sections = <Widget>[];

    if (_localDiagnosis != null || _upgradeSuggestions.isNotEmpty) {
      sections.add(_buildDeterministicAdviceSection(context));
    }

    // Helper: parse bullet lines from a section
    List<String> parseBullets(String text) => text
        .trim()
        .split('\n')
        .where((l) => l.trim().startsWith('-'))
        .map((l) => l.trim().replaceFirst(RegExp(r'^-\s*'), ''))
        .toList();

    // Helper: parse FPS lines into a list of (game, fps) pairs
    List<(String, int)> parseFpsLines(String text) {
      final lines = text
          .trim()
          .split('\n')
          .where((l) => l.trim().startsWith('-'))
          .toList();
      return lines.map((line) {
        final cleaned = line.trim().replaceFirst(RegExp(r'^-\s*'), '');
        final fpsMatch = RegExp(
          r'(\d+)\s*FPS',
          caseSensitive: false,
        ).firstMatch(cleaned);
        final fps = fpsMatch != null
            ? int.tryParse(fpsMatch.group(1)!) ?? 0
            : 0;
        final gameName = cleaned.split(':').first.trim();
        return (gameName, fps);
      }).toList();
    }

    final overviewMatch = RegExp(
      r'OVERVIEW:\s*(.+?)(?=BOTTLENECK:|PERFORMANCE_TIER:|IDEAL_USE:|FPS_1080P:|$)',
      caseSensitive: false,
      dotAll: true,
    ).firstMatch(analysis);
    if (overviewMatch != null) {
      final overviewText = overviewMatch.group(1)!.trim();
      if (overviewText.isNotEmpty) {
        sections.add(
          Container(
            margin: const EdgeInsets.only(bottom: 10),
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [
                  AppTheme.brandDeepBlue.withValues(alpha: 0.10),
                  AppTheme.brandCyan.withValues(alpha: 0.06),
                ],
              ),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: AppTheme.brandDeepBlue.withValues(alpha: 0.18),
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(
                      Icons.insights_rounded,
                      size: 16,
                      color: AppTheme.brandDeepBlue,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      _pcText(context, en: 'Build Overview', tr: 'Build Özeti'),
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                        color: AppTheme.brandDeepBlue,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  overviewText,
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 11,
                    color: context.textSecondary,
                    height: 1.5,
                  ),
                ),
              ],
            ),
          ),
        );
      }
    }

    // ── Bottleneck ──────────────────────────────────────────────────────────
    final bottleneckMatch = RegExp(
      r'BOTTLENECK:\s*(.+)',
      caseSensitive: false,
    ).firstMatch(analysis);
    if (bottleneckMatch != null) {
      final bottleneckText = bottleneckMatch.group(1)!.trim();
      final pctMatch = RegExp(r'(\d+)%').firstMatch(bottleneckText);
      final pct = pctMatch != null ? int.tryParse(pctMatch.group(1)!) ?? 0 : 0;
      final bottleneckColor = pct <= 10
          ? AppTheme.success
          : pct <= 25
          ? AppTheme.amber500
          : AppTheme.rose500;
      final label = pct <= 10
          ? _pcText(context, en: 'Excellent', tr: 'Cok iyi')
          : pct <= 25
          ? _pcText(context, en: 'Moderate', tr: 'Orta')
          : _pcText(context, en: 'Significant', tr: 'Belirgin');

      sections.add(
        Container(
          margin: const EdgeInsets.only(bottom: 10),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: bottleneckColor.withValues(alpha: 0.06),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: bottleneckColor.withValues(alpha: 0.2)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(
                    Icons.monitor_heart_rounded,
                    size: 15,
                    color: bottleneckColor,
                  ),
                  const SizedBox(width: 6),
                  Text(
                    _pcText(
                      context,
                      en: 'Bottleneck analysis',
                      tr: 'Darboğaz analizi',
                    ),
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: bottleneckColor,
                    ),
                  ),
                  const Spacer(),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 2,
                    ),
                    decoration: BoxDecoration(
                      color: bottleneckColor.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      '$pct% · $label',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                        color: bottleneckColor,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Stack(
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(4),
                    child: LinearProgressIndicator(
                      value: pct / 100,
                      minHeight: 10,
                      backgroundColor: context.dividerColor,
                      color: bottleneckColor,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                bottleneckText.replaceAll(RegExp(r'^\d+%\s*[-—]\s*'), ''),
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 11,
                  color: context.textSecondary,
                  height: 1.4,
                ),
              ),
            ],
          ),
        ),
      );
    }

    // ── Performance Tier ─────────────────────────────────────────────────────
    final tierMatch = RegExp(
      r'PERFORMANCE_TIER:\s*(.+)',
      caseSensitive: false,
    ).firstMatch(analysis);
    if (tierMatch != null) {
      final tier = tierMatch.group(1)!.trim();
      final tierColor = (tier.contains('Ultra') || tier.contains('Enthusiast'))
          ? AppTheme.success
          : tier.contains('High')
          ? AppTheme.brandBlue
          : tier.contains('Mid')
          ? AppTheme.amber500
          : AppTheme.rose500;
      final tierEmoji = (tier.contains('Ultra') || tier.contains('Enthusiast'))
          ? '🏆'
          : tier.contains('High')
          ? '🎮'
          : tier.contains('Mid')
          ? '⚡'
          : '🌱';
      sections.add(
        Container(
          margin: const EdgeInsets.only(bottom: 10),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [
                tierColor.withValues(alpha: 0.1),
                tierColor.withValues(alpha: 0.03),
              ],
            ),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: tierColor.withValues(alpha: 0.25)),
          ),
          child: Row(
            children: [
              Text(tierEmoji, style: const TextStyle(fontSize: 18)),
              const SizedBox(width: 10),
              Text(
                _pcText(
                  context,
                  en: 'Performance tier',
                  tr: 'Performans seviyesi',
                ),
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 12,
                  color: context.textSecondary,
                ),
              ),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 4,
                ),
                decoration: BoxDecoration(
                  color: tierColor.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  tier,
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                    color: tierColor,
                  ),
                ),
              ),
            ],
          ),
        ),
      );
    }

    final idealUseMatch = RegExp(
      r'IDEAL_USE:(.*?)(?=FPS_1080P:|FPS_1440P:|FPS_4K:|STRENGTHS:|WEAKNESSES:|$)',
      caseSensitive: false,
      dotAll: true,
    ).firstMatch(analysis);
    if (idealUseMatch != null) {
      final items = parseBullets(idealUseMatch.group(1)!);
      if (items.isNotEmpty) {
        sections.add(
          _bulletSection(
            context,
            _pcText(context, en: '🎯 Ideal Use', tr: '🎯 İdeal Kullanım'),
            items,
            AppTheme.brandBlue,
          ),
        );
      }
    }

    // ── FPS by Resolution (tabbed) ────────────────────────────────────────────
    final fps1080 = RegExp(
      r'FPS_1080P:(.*?)(?=FPS_1440P:|FPS_4K:|STRENGTHS:|WEAKNESSES:|$)',
      caseSensitive: false,
      dotAll: true,
    ).firstMatch(analysis);
    final fps1440 = RegExp(
      r'FPS_1440P:(.*?)(?=FPS_4K:|STRENGTHS:|WEAKNESSES:|$)',
      caseSensitive: false,
      dotAll: true,
    ).firstMatch(analysis);
    final fps4k = RegExp(
      r'FPS_4K:(.*?)(?=STRENGTHS:|WEAKNESSES:|UPGRADE_PRIORITY:|$)',
      caseSensitive: false,
      dotAll: true,
    ).firstMatch(analysis);

    if (fps1080 != null || fps1440 != null || fps4k != null) {
      final data1080 = fps1080 != null
          ? parseFpsLines(fps1080.group(1)!)
          : <(String, int)>[];
      final data1440 = fps1440 != null
          ? parseFpsLines(fps1440.group(1)!)
          : <(String, int)>[];
      final data4k = fps4k != null
          ? parseFpsLines(fps4k.group(1)!)
          : <(String, int)>[];
      sections.add(
        _buildFpsTabPanel(
          data1080: data1080,
          data1440: data1440,
          data4k: data4k,
        ),
      );
    }

    // ── Strengths ─────────────────────────────────────────────────────────────
    final strengthsMatch = RegExp(
      r'STRENGTHS:(.*?)(?=WEAKNESSES:|UPGRADE_PRIORITY:|RECOMMENDATIONS:|THERMALS:|POWER_ANALYSIS:|$)',
      caseSensitive: false,
      dotAll: true,
    ).firstMatch(analysis);
    if (strengthsMatch != null) {
      final items = parseBullets(strengthsMatch.group(1)!);
      if (items.isNotEmpty) {
        sections.add(
          _bulletSection(
            context,
            _pcText(context, en: '💪 Strengths', tr: '💪 Güçlü Yönler'),
            items,
            AppTheme.success,
          ),
        );
      }
    }

    // ── Weaknesses ────────────────────────────────────────────────────────────
    final weaknessMatch = RegExp(
      r'WEAKNESSES:(.*?)(?=UPGRADE_PRIORITY:|RECOMMENDATIONS:|THERMALS:|POWER_ANALYSIS:|$)',
      caseSensitive: false,
      dotAll: true,
    ).firstMatch(analysis);
    if (weaknessMatch != null) {
      final items = parseBullets(weaknessMatch.group(1)!);
      if (items.isNotEmpty) {
        sections.add(
          _bulletSection(
            context,
            _pcText(context, en: '⚠️ Weaknesses', tr: '⚠️ Zayıf Yönler'),
            items,
            AppTheme.amber500,
          ),
        );
      }
    }

    // ── Upgrade Priority ──────────────────────────────────────────────────────
    final upgradeMatch = RegExp(
      r'UPGRADE_PRIORITY:\s*(.+)',
      caseSensitive: false,
    ).firstMatch(analysis);
    if (upgradeMatch != null) {
      final upgradeText = upgradeMatch.group(1)!.trim();
      sections.add(
        Container(
          margin: const EdgeInsets.only(bottom: 10),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: AppTheme.brandDeepBlue.withValues(alpha: 0.06),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: AppTheme.brandDeepBlue.withValues(alpha: 0.15),
            ),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('🎯', style: TextStyle(fontSize: 16)),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _pcText(
                        context,
                        en: 'Upgrade Priority',
                        tr: 'Öncelikli Yükseltme',
                      ),
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: AppTheme.brandDeepBlue,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      upgradeText,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 11,
                        color: context.textSecondary,
                        height: 1.4,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      );
    }

    // ── Recommendations ───────────────────────────────────────────────────────
    final recsMatch = RegExp(
      r'RECOMMENDATIONS:(.*?)(?=THERMALS:|POWER_ANALYSIS:|$)',
      caseSensitive: false,
      dotAll: true,
    ).firstMatch(analysis);
    if (recsMatch != null) {
      final recItems = parseBullets(recsMatch.group(1)!);
      if (recItems.isNotEmpty) {
        sections.add(
          Container(
            margin: const EdgeInsets.only(bottom: 10),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppTheme.brandCyan.withValues(alpha: 0.05),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: AppTheme.brandCyan.withValues(alpha: 0.2),
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(
                      Icons.auto_awesome_rounded,
                      size: 14,
                      color: AppTheme.brandCyan,
                    ),
                    const SizedBox(width: 6),
                    Text(
                      _pcText(
                        context,
                        en: 'AI recommendations',
                        tr: 'AI Önerileri',
                      ),
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: AppTheme.brandCyan,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                ...recItems.map(
                  (item) => Padding(
                    padding: const EdgeInsets.only(bottom: 6),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          margin: const EdgeInsets.only(top: 3),
                          width: 6,
                          height: 6,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: AppTheme.brandCyan,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            item,
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 10,
                              color: context.textSecondary,
                              height: 1.4,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      }
    }

    final thermalsMatch = RegExp(
      r'THERMALS:\s*(.+?)(?=POWER_ANALYSIS:|$)',
      caseSensitive: false,
      dotAll: true,
    ).firstMatch(analysis);
    if (thermalsMatch != null) {
      final thermalsText = thermalsMatch.group(1)!.trim();
      if (thermalsText.isNotEmpty) {
        sections.add(
          Container(
            margin: const EdgeInsets.only(bottom: 10),
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: PcComponent.cooler.accentColor.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                color: PcComponent.cooler.accentColor.withValues(alpha: 0.20),
              ),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(
                  Icons.air_rounded,
                  size: 16,
                  color: PcComponent.cooler.accentColor,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _pcText(context, en: 'Thermals', tr: 'Termal Durum'),
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: PcComponent.cooler.accentColor,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        thermalsText,
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 10,
                          color: context.textSecondary,
                          height: 1.4,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        );
      }
    }

    // ── Power Analysis ────────────────────────────────────────────────────────
    final powerMatch = RegExp(
      r'POWER_ANALYSIS:\s*(.+)',
      caseSensitive: false,
    ).firstMatch(analysis);
    if (powerMatch != null) {
      final powerText = powerMatch.group(1)!.trim();
      sections.add(
        Container(
          margin: const EdgeInsets.only(bottom: 4),
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: PcComponent.psu.accentColor.withValues(alpha: 0.07),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: PcComponent.psu.accentColor.withValues(alpha: 0.2),
            ),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(
                Icons.bolt_rounded,
                size: 16,
                color: PcComponent.psu.accentColor,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _pcText(context, en: 'Power Analysis', tr: 'Güç Analizi'),
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: PcComponent.psu.accentColor,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      powerText,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 10,
                        color: context.textSecondary,
                        height: 1.4,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      );
    }

    if (sections.isEmpty) {
      return SelectableText(
        analysis,
        style: GoogleFonts.plusJakartaSans(
          fontSize: 12,
          color: context.textPrimary,
          height: 1.5,
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: sections,
    );
  }

  Widget _buildFpsTabPanel({
    required List<(String, int)> data1080,
    required List<(String, int)> data1440,
    required List<(String, int)> data4k,
  }) {
    return _FpsTabWidget(
      data1080: data1080,
      data1440: data1440,
      data4k: data4k,
    );
  }

  Widget _bulletSection(
    BuildContext context,
    String title,
    List<String> items,
    Color color,
  ) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: GoogleFonts.plusJakartaSans(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: color,
            ),
          ),
          const SizedBox(height: 4),
          ...items.map(
            (item) => Padding(
              padding: const EdgeInsets.only(bottom: 3),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '\u2022 ',
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 10,
                      color: color,
                    ),
                  ),
                  Expanded(
                    child: Text(
                      item,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 10,
                        color: context.textSecondary,
                        height: 1.3,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCompatPanel(BuildContext context) {
    final issues = _compatIssues;
    final hasErrors = issues.any((i) => i.severity == _IssueSeverity.error);
    final panelColor = hasErrors ? AppTheme.rose500 : AppTheme.amber500;
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 12),
      decoration: BoxDecoration(
        color: panelColor.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: panelColor.withValues(alpha: 0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 6),
            child: Row(
              children: [
                Icon(
                  hasErrors ? Icons.error_rounded : Icons.warning_rounded,
                  size: 16,
                  color: panelColor,
                ),
                const SizedBox(width: 6),
                Text(
                  hasErrors
                      ? '${issues.where((i) => i.severity == _IssueSeverity.error).length} Compatibility Error(s)'
                      : 'Compatibility Warnings',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: panelColor,
                  ),
                ),
                const Spacer(),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 7,
                    vertical: 2,
                  ),
                  decoration: BoxDecoration(
                    color: panelColor.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    '${issues.length}',
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                      color: panelColor,
                    ),
                  ),
                ),
              ],
            ),
          ),
          ...issues.map(
            (issue) => Container(
              margin: const EdgeInsets.fromLTRB(12, 0, 12, 8),
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: issue.color.withValues(alpha: 0.06),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: issue.color.withValues(alpha: 0.2)),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(issue.icon, size: 14, color: issue.color),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          issue.title,
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: issue.color,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          issue.detail,
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 10,
                            color: context.textSecondary,
                            height: 1.3,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 4),
        ],
      ),
    );
  }

  Widget _buildPowerSection(BuildContext context) {
    final power = _estimatedPower;
    final psuW = _psuWattage;
    final headroom = _psuHeadroom;

    Color statusColor;
    String statusText;
    IconData statusIcon;

    if (psuW == null) {
      statusColor = context.textTertiaryColor;
      statusText = _pcText(
        context,
        en: 'Select a PSU to check power',
        tr: 'Gücü kontrol etmek için PSU seçin',
      );
      statusIcon = Icons.info_outline_rounded;
    } else if (headroom! < 0) {
      statusColor = AppTheme.rose500;
      statusText = _pcText(
        context,
        en: 'PSU insufficient! ${headroom.round()}W short',
        tr: 'PSU yetersiz! ${headroom.round()}W eksik',
      );
      statusIcon = Icons.error_rounded;
    } else if (headroom < 100) {
      statusColor = AppTheme.amber500;
      statusText = _pcText(
        context,
        en: 'PSU adequate (+${headroom.round()}W headroom)',
        tr: 'PSU yeterli (+${headroom.round()}W pay)',
      );
      statusIcon = Icons.warning_rounded;
    } else {
      statusColor = AppTheme.success;
      statusText = _pcText(
        context,
        en: 'PSU plenty (+${headroom.round()}W headroom)',
        tr: 'PSU rahat (+${headroom.round()}W pay)',
      );
      statusIcon = Icons.check_circle_rounded;
    }

    return Container(
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: statusColor.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: statusColor.withValues(alpha: 0.2)),
      ),
      child: Row(
        children: [
          Icon(
            Icons.bolt_rounded,
            size: 20,
            color: PcComponent.psu.accentColor,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _pcText(
                    context,
                    en: 'Est. Power: ${power.round()}W${psuW != null ? " / ${psuW.round()}W PSU" : ""}',
                    tr: 'Tahmini Güç: ${power.round()}W${psuW != null ? " / ${psuW.round()}W PSU" : ""}',
                  ),
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: context.textPrimary,
                  ),
                ),
                const SizedBox(height: 3),
                Row(
                  children: [
                    Icon(statusIcon, size: 13, color: statusColor),
                    const SizedBox(width: 4),
                    Flexible(
                      child: Text(
                        statusText,
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 10,
                          color: statusColor,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          if (psuW != null) ...[
            const SizedBox(width: 8),
            SizedBox(
              width: 36,
              height: 36,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  CircularProgressIndicator(
                    value: (power / psuW).clamp(0.0, 1.0),
                    strokeWidth: 3,
                    backgroundColor: context.dividerColor,
                    valueColor: AlwaysStoppedAnimation(statusColor),
                  ),
                  Text(
                    '${((power / psuW) * 100).round()}%',
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 8,
                      fontWeight: FontWeight.w700,
                      color: statusColor,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildSummaryCard(BuildContext context, Color sc, int cnt) {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            context.surfaceVariantColor,
            context.surfaceVariantColor.withValues(alpha: 0.8),
          ],
        ),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: context.dividerColor),
      ),
      child: Column(
        children: [
          // Header (always visible)
          InkWell(
            borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
            onTap: () => setState(() => _summaryExpanded = !_summaryExpanded),
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Row(
                children: [
                  Icon(
                    Icons.summarize_rounded,
                    size: 18,
                    color: AppTheme.brandDeepBlue,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      _pcText(context, en: 'Build Summary', tr: 'Sistem Özeti'),
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: context.textPrimary,
                      ),
                    ),
                  ),
                  Icon(
                    _summaryExpanded
                        ? Icons.expand_less_rounded
                        : Icons.expand_more_rounded,
                    size: 20,
                    color: context.textTertiaryColor,
                  ),
                ],
              ),
            ),
          ),
          // Expandable body
          AnimatedCrossFade(
            firstChild: const SizedBox.shrink(),
            secondChild: Padding(
              padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Divider(height: 1, color: context.dividerColor),
                  const SizedBox(height: 12),
                  // Stats grid
                  Wrap(
                    spacing: 12,
                    runSpacing: 8,
                    children: [
                      _summaryChip(
                        context,
                        _pcText(context, en: 'Components', tr: 'Bileşenler'),
                        '$cnt/${PcComponent.values.length}',
                        sc,
                      ),
                      _summaryChip(
                        context,
                        context.l10n?.buildScore ?? 'Build Score',
                        '${_totalScore.round()}/100',
                        sc,
                      ),
                      _summaryChip(
                        context,
                        _pcText(context, en: 'Est. Power', tr: 'Tahmini Güç'),
                        '${_estimatedPower.round()}W',
                        PcComponent.psu.accentColor,
                      ),
                      if (_psuHeadroom != null)
                        _summaryChip(
                          context,
                          _pcText(context, en: 'PSU Headroom', tr: 'PSU Payı'),
                          '${_psuHeadroom! >= 0 ? "+" : ""}${_psuHeadroom!.round()}W',
                          _psuHeadroom! >= 100
                              ? AppTheme.success
                              : _psuHeadroom! >= 0
                              ? AppTheme.amber500
                              : AppTheme.rose500,
                        ),
                      if (_totalPrice > 0)
                        _summaryChip(
                          context,
                          _pcText(
                            context,
                            en: 'Est. Price',
                            tr: 'Tahmini Fiyat',
                          ),
                          '\$${_totalPrice.round()}',
                          AppTheme.brandBlue,
                        ),
                    ],
                  ),
                  if (_selectedSocket != null || _selectedMemType != null) ...[
                    const SizedBox(height: 10),
                    if (_selectedSocket != null)
                      _summaryInfoRow(
                        context,
                        Icons.memory_rounded,
                        _pcText(context, en: 'Socket', tr: 'Soket'),
                        _selectedSocket!,
                        PcComponent.cpu.accentColor,
                      ),
                    if (_selectedMemType != null)
                      _summaryInfoRow(
                        context,
                        Icons.sd_storage_rounded,
                        _pcText(context, en: 'Memory', tr: 'Bellek'),
                        _selectedMemType!,
                        PcComponent.ram.accentColor,
                      ),
                  ],
                  // Uyumsuz parçalar özet bölümünde göster
                  if (_compatIssues.isNotEmpty) ...[
                    const SizedBox(height: 10),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 8,
                      ),
                      decoration: BoxDecoration(
                        color: AppTheme.rose500.withValues(alpha: 0.08),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(
                          color: AppTheme.rose500.withValues(alpha: 0.3),
                        ),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              const Icon(
                                Icons.warning_amber_rounded,
                                size: 14,
                                color: AppTheme.rose500,
                              ),
                              const SizedBox(width: 6),
                              Text(
                                _pcText(
                                  context,
                                  en: 'Compatibility Issues',
                                  tr: 'Uyumsuzluk Sorunları',
                                ),
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w700,
                                  color: AppTheme.rose500,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 6),
                          ..._compatIssues.map(
                            (issue) => Padding(
                              padding: const EdgeInsets.only(bottom: 3),
                              child: Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Icon(
                                    issue.icon,
                                    size: 12,
                                    color: issue.color,
                                  ),
                                  const SizedBox(width: 6),
                                  Expanded(
                                    child: Text(
                                      issue.title,
                                      style: GoogleFonts.plusJakartaSans(
                                        fontSize: 10,
                                        color: context.textSecondary,
                                        height: 1.4,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                  const SizedBox(height: 14),
                  // Component list
                  ...PcComponent.values.map((c) {
                    final p = _selected[c];
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 4),
                      child: Row(
                        children: [
                          Icon(c.icon, size: 12, color: c.accentColor),
                          const SizedBox(width: 6),
                          SizedBox(
                            width: 72,
                            child: Text(
                              c.label(context).toUpperCase(),
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 9,
                                fontWeight: FontWeight.w700,
                                color: c.accentColor,
                              ),
                            ),
                          ),
                          Expanded(
                            child: Text(
                              p != null
                                  ? p.name
                                  : _pcText(
                                      context,
                                      en: 'Not selected',
                                      tr: 'Seçilmedi',
                                    ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 10,
                                color: p != null
                                    ? context.textPrimary
                                    : context.textTertiaryColor,
                                fontStyle: p != null
                                    ? FontStyle.normal
                                    : FontStyle.italic,
                              ),
                            ),
                          ),
                          if (p != null)
                            Text(
                              '${p.techScore.round()}',
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 10,
                                fontWeight: FontWeight.w700,
                                color: p.techScore >= 80
                                    ? AppTheme.success
                                    : p.techScore >= 60
                                    ? AppTheme.brandBlue
                                    : AppTheme.amber500,
                              ),
                            ),
                        ],
                      ),
                    );
                  }),
                  const SizedBox(height: 12),
                  // Share Build butonu (Geçmiş artık AppBar'da)
                  GestureDetector(
                    onTap: _shareBuild,
                    child: Container(
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      decoration: BoxDecoration(
                        gradient: _accentGradient,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Icon(
                            Icons.share_rounded,
                            size: 14,
                            color: Colors.white,
                          ),
                          const SizedBox(width: 6),
                          Text(
                            _pcText(
                              context,
                              en: 'Share Build',
                              tr: 'Sistemi Paylaş',
                            ),
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: Colors.white,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
            crossFadeState: _summaryExpanded
                ? CrossFadeState.showSecond
                : CrossFadeState.showFirst,
            duration: const Duration(milliseconds: 250),
          ),
        ],
      ),
    );
  }

  Widget _summaryChip(
    BuildContext context,
    String label,
    String value,
    Color color,
  ) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: color.withValues(alpha: 0.2)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            value,
            style: GoogleFonts.plusJakartaSans(
              fontSize: 13,
              fontWeight: FontWeight.w800,
              color: color,
            ),
          ),
          Text(
            label,
            style: GoogleFonts.plusJakartaSans(
              fontSize: 9,
              color: context.textTertiaryColor,
            ),
          ),
        ],
      ),
    );
  }

  Widget _summaryInfoRow(
    BuildContext context,
    IconData icon,
    String label,
    String value,
    Color color,
  ) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        children: [
          Icon(icon, size: 13, color: color),
          const SizedBox(width: 6),
          Text(
            '$label: ',
            style: GoogleFonts.plusJakartaSans(
              fontSize: 11,
              color: context.textTertiaryColor,
            ),
          ),
          Text(
            value,
            style: GoogleFonts.plusJakartaSans(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}

// FPS Tab Panel — animated bars, 1080p / 1440p / 4K tabs

class _FpsTabWidget extends StatefulWidget {
  final List<(String, int)> data1080;
  final List<(String, int)> data1440;
  final List<(String, int)> data4k;
  const _FpsTabWidget({
    required this.data1080,
    required this.data1440,
    required this.data4k,
  });

  @override
  State<_FpsTabWidget> createState() => _FpsTabWidgetState();
}

class _FpsTabWidgetState extends State<_FpsTabWidget>
    with SingleTickerProviderStateMixin {
  int _tab = 0; // 0=1080p, 1=1440p, 2=4K
  late AnimationController _animCtrl;
  late Animation<double> _anim;

  @override
  void initState() {
    super.initState();
    _animCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 600),
    );
    _anim = CurvedAnimation(parent: _animCtrl, curve: Curves.easeOutCubic);
    _animCtrl.forward();
  }

  @override
  void dispose() {
    _animCtrl.dispose();
    super.dispose();
  }

  void _switchTab(int t) {
    if (_tab == t) return;
    setState(() => _tab = t);
    _animCtrl.forward(from: 0);
  }

  List<(String, int)> get _current =>
      [widget.data1080, widget.data1440, widget.data4k][_tab];

  @override
  Widget build(BuildContext context) {
    final tabs = ['1080p', '1440p', '4K'];
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppTheme.brandBlue.withValues(alpha: 0.04),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppTheme.brandBlue.withValues(alpha: 0.15)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header + tabs
          Row(
            children: [
              Icon(
                Icons.videogame_asset_rounded,
                size: 15,
                color: AppTheme.brandBlue,
              ),
              const SizedBox(width: 6),
              Text(
                'Estimated FPS',
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: AppTheme.brandBlue,
                ),
              ),
              const Spacer(),
              Container(
                padding: const EdgeInsets.all(2),
                decoration: BoxDecoration(
                  color: AppTheme.brandBlue.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: List.generate(3, (i) {
                    final sel = _tab == i;
                    return GestureDetector(
                      onTap: () => _switchTab(i),
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 200),
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: sel ? AppTheme.brandBlue : Colors.transparent,
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(
                          tabs[i],
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                            color: sel
                                ? Colors.white
                                : AppTheme.brandBlue.withValues(alpha: 0.6),
                          ),
                        ),
                      ),
                    );
                  }),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          // FPS bars (animated)
          AnimatedBuilder(
            animation: _anim,
            builder: (context, _) {
              final rows = _current;
              if (rows.isEmpty) {
                return Text(
                  'No data',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 11,
                    color: context.textTertiaryColor,
                  ),
                );
              }
              return Column(
                children: rows.map((entry) {
                  final gameName = entry.$1;
                  final fps = entry.$2;
                  final fpsColor = fps >= 144
                      ? AppTheme.success
                      : fps >= 60
                      ? AppTheme.brandBlue
                      : fps >= 30
                      ? AppTheme.amber500
                      : AppTheme.rose500;
                  final barVal = ((fps / 240) * _anim.value).clamp(0.0, 1.0);
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 7),
                    child: Row(
                      children: [
                        SizedBox(
                          width: 88,
                          child: Text(
                            gameName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 10,
                              color: context.textSecondary,
                            ),
                          ),
                        ),
                        Expanded(
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(4),
                            child: LinearProgressIndicator(
                              value: barVal,
                              minHeight: 8,
                              backgroundColor: context.dividerColor,
                              valueColor: AlwaysStoppedAnimation(fpsColor),
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        SizedBox(
                          width: 54,
                          child: Text(
                            '$fps FPS',
                            textAlign: TextAlign.end,
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 10,
                              fontWeight: FontWeight.w800,
                              color: fpsColor,
                            ),
                          ),
                        ),
                      ],
                    ),
                  );
                }).toList(),
              );
            },
          ),
          // Legend
          const SizedBox(height: 4),
          Row(
            children: [
              _dot(AppTheme.success),
              const SizedBox(width: 3),
              Text(
                '144+',
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 9,
                  color: context.textTertiaryColor,
                ),
              ),
              const SizedBox(width: 8),
              _dot(AppTheme.brandBlue),
              const SizedBox(width: 3),
              Text(
                '60+',
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 9,
                  color: context.textTertiaryColor,
                ),
              ),
              const SizedBox(width: 8),
              _dot(AppTheme.amber500),
              const SizedBox(width: 3),
              Text(
                '30+',
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 9,
                  color: context.textTertiaryColor,
                ),
              ),
              const SizedBox(width: 8),
              _dot(AppTheme.rose500),
              const SizedBox(width: 3),
              Text(
                '<30',
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 9,
                  color: context.textTertiaryColor,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _dot(Color c) => Container(
    width: 7,
    height: 7,
    decoration: BoxDecoration(shape: BoxShape.circle, color: c),
  );
}

// Component Row with gradient header

class _ComponentRow extends StatelessWidget {
  final PcComponent component;
  final ProductEntity? selectedProduct;
  final VoidCallback onChoose;
  final VoidCallback? onRemove;
  final String? compatNote;
  const _ComponentRow({
    required this.component,
    this.selectedProduct,
    required this.onChoose,
    this.onRemove,
    this.compatNote,
  });

  @override
  Widget build(BuildContext context) {
    final has = selectedProduct != null;
    final accent = component.accentColor;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        gradient: has
            ? LinearGradient(
                colors: [accent.withValues(alpha: 0.06), Colors.transparent],
                begin: Alignment.centerLeft,
                end: Alignment.centerRight,
              )
            : null,
        color: has ? null : context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: has ? accent.withValues(alpha: 0.3) : context.dividerColor,
        ),
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: onChoose,
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              children: [
                Container(
                  width: 42,
                  height: 42,
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: [
                        accent.withValues(alpha: 0.18),
                        accent.withValues(alpha: 0.08),
                      ],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(component.icon, size: 20, color: accent),
                ),
                const SizedBox(width: 12),
                Expanded(child: has ? _sel(context) : _empty(context)),
                if (has) ...[
                  _badge(selectedProduct!.techScore),
                  const SizedBox(width: 8),
                  GestureDetector(
                    onTap: onRemove,
                    child: Container(
                      width: 30,
                      height: 30,
                      decoration: BoxDecoration(
                        color: AppTheme.rose500.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Icon(
                        Icons.close_rounded,
                        size: 14,
                        color: AppTheme.rose500,
                      ),
                    ),
                  ),
                ] else
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 7,
                    ),
                    decoration: BoxDecoration(
                      gradient: _accentGradient,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      context.l10n?.choose ?? 'Choose',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: Colors.white,
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _empty(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(
        component.label(context),
        style: GoogleFonts.plusJakartaSans(
          fontSize: 13,
          fontWeight: FontWeight.w600,
          color: context.textPrimary,
        ),
      ),
      const SizedBox(height: 2),
      if (compatNote != null)
        Text(
          '\u26a1 $compatNote',
          style: GoogleFonts.plusJakartaSans(
            fontSize: 10,
            color: AppTheme.brandDeepBlue,
            fontWeight: FontWeight.w500,
          ),
        )
      else
        Text(
          context.l10n?.tapToChoose ?? 'Tap to choose',
          style: GoogleFonts.plusJakartaSans(
            fontSize: 10,
            color: context.textTertiaryColor,
          ),
        ),
    ],
  );

  Widget _sel(BuildContext context) {
    final p = selectedProduct!;
    return Row(
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: Container(
            width: 38,
            height: 38,
            color: Colors.white,
            child: p.imageUrl != null && p.imageUrl!.isNotEmpty
                ? CachedNetworkImage(
                    imageUrl: p.imageUrl!,
                    fit: BoxFit.contain,
                    errorWidget: (_, _, _) => Icon(
                      component.icon,
                      size: 18,
                      color: context.textTertiaryColor,
                    ),
                  )
                : Icon(
                    component.icon,
                    size: 18,
                    color: context.textTertiaryColor,
                  ),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                p.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: context.textPrimary,
                ),
              ),
              if (p.brand != null && p.brand!.isNotEmpty)
                Text(
                  p.brand!,
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 10,
                    color: component.accentColor,
                    fontWeight: FontWeight.w500,
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _badge(double score) {
    final c = score >= 80
        ? AppTheme.success
        : score >= 60
        ? AppTheme.brandBlue
        : score >= 40
        ? AppTheme.amber500
        : AppTheme.rose500;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        color: c.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: c.withValues(alpha: 0.3)),
      ),
      child: Text(
        score.round().toString(),
        style: GoogleFonts.plusJakartaSans(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          color: c,
        ),
      ),
    );
  }
}

// Component Picker Page

class _ComponentPickerPage extends ConsumerStatefulWidget {
  final PcComponent component;
  final ProductEntity? currentSelection;
  final String? socketFilter;
  final String? memTypeFilter;
  final String? formFactorFilter;
  final Map<PcComponent, ProductEntity> allSelected;
  final ScrollController? scrollController;
  const _ComponentPickerPage({
    required this.component,
    this.currentSelection,
    this.socketFilter,
    this.memTypeFilter,
    this.formFactorFilter,
    this.allSelected = const {},
    this.scrollController,
  });
  @override
  ConsumerState<_ComponentPickerPage> createState() =>
      _ComponentPickerPageState();
}

class _ComponentPickerPageState extends ConsumerState<_ComponentPickerPage> {
  final TextEditingController _searchController = TextEditingController();
  String _search = '';
  String _sort = 'score';
  final Set<String> _brands = {};
  String? _quickFilter;
  bool _showFilters = false;
  bool _compatOnly = true;
  Timer? _debounceTimer;

  @override
  void initState() {
    super.initState();
  }

  @override
  void dispose() {
    _debounceTimer?.cancel();
    _searchController.dispose();
    super.dispose();
  }

  double get _selectedPowerWithoutPsu {
    double total = 0;
    for (final entry in widget.allSelected.entries) {
      if (entry.key == PcComponent.psu) continue;
      total += _Compat.tdp(entry.value) ?? entry.key.defaultTdp;
    }
    return total;
  }

  double? get _requiredPsuWattage {
    final gpu = widget.allSelected[PcComponent.gpu];
    final estimated = (_selectedPowerWithoutPsu * 1.25).ceilToDouble();
    final recommended = gpu == null
        ? 0.0
        : (_Compat.recommendedSystemPower(gpu) ?? 0.0);
    final required = max(estimated, recommended);
    return required > 0 ? required : null;
  }

  bool get _hasAdditionalCompatFilters {
    return switch (widget.component) {
      PcComponent.gpu => widget.allSelected[PcComponent.pcCase] != null,
      PcComponent.storage =>
        widget.allSelected[PcComponent.motherboard] != null,
      PcComponent.psu =>
        widget.allSelected[PcComponent.gpu] != null ||
            _requiredPsuWattage != null,
      PcComponent.pcCase =>
        widget.allSelected[PcComponent.gpu] != null ||
            widget.allSelected[PcComponent.motherboard] != null,
      _ => false,
    };
  }

  List<String> _compatHints(BuildContext context) {
    return [
      if (widget.socketFilter != null)
        _pcText(
          context,
          en: 'Socket: ${widget.socketFilter}',
          tr: 'Soket: ${widget.socketFilter}',
        ),
      if (widget.memTypeFilter != null) widget.memTypeFilter!,
      if (widget.formFactorFilter != null)
        _pcText(
          context,
          en: 'Form: ${widget.formFactorFilter}',
          tr: 'Form: ${widget.formFactorFilter}',
        ),
      if (widget.component == PcComponent.gpu &&
          widget.allSelected[PcComponent.pcCase] != null)
        _pcText(context, en: 'Case GPU clearance', tr: 'Kasa GPU boslugu'),
      if (widget.component == PcComponent.pcCase &&
          widget.allSelected[PcComponent.gpu] != null)
        _pcText(context, en: 'GPU length', tr: 'GPU uzunlugu'),
      if (widget.component == PcComponent.storage &&
          widget.allSelected[PcComponent.motherboard] != null)
        _pcText(
          context,
          en: 'Motherboard storage slots',
          tr: 'Anakart depolama yuvalari',
        ),
      if (widget.component == PcComponent.psu && _requiredPsuWattage != null)
        _pcText(
          context,
          en: 'Power >= ${_requiredPsuWattage!.round()}W',
          tr: 'Güç >= ${_requiredPsuWattage!.round()}W',
        ),
      if (widget.component == PcComponent.psu &&
          widget.allSelected[PcComponent.gpu] != null &&
          _Compat.gpuNeedsModernPsu(widget.allSelected[PcComponent.gpu]!))
        _pcText(context, en: 'ATX 3.x / PCIe 5', tr: 'ATX 3.x / PCIe 5'),
    ];
  }

  List<MapEntry<String, String>> _quickFilterOptions(
    List<ProductEntity> products,
  ) {
    final options = <MapEntry<String, String>>[];

    void addIfAny(String key, String label, bool Function(ProductEntity) test) {
      if (products.any(test)) options.add(MapEntry(key, label));
    }

    switch (widget.component) {
      case PcComponent.cpu:
        addIfAny('amd', 'AMD', (p) => p.name.toLowerCase().contains('amd'));
        addIfAny(
          'intel',
          'Intel',
          (p) => p.name.toLowerCase().contains('intel'),
        );
        break;
      case PcComponent.motherboard:
      case PcComponent.pcCase:
        addIfAny('atx', 'ATX', (p) => _Compat.formFactor(p) == 'ATX');
        addIfAny('matx', 'mATX', (p) => _Compat.formFactor(p) == 'mATX');
        addIfAny('mitx', 'mITX', (p) => _Compat.formFactor(p) == 'mITX');
        break;
      case PcComponent.ram:
        addIfAny('ddr5', 'DDR5', (p) => _Compat.memoryType(p) == 'DDR5');
        addIfAny('ddr4', 'DDR4', (p) => _Compat.memoryType(p) == 'DDR4');
        addIfAny('32gb', '32GB+', (p) => _Compat.matchesSpecSearch(p, '32gb'));
        break;
      case PcComponent.gpu:
        addIfAny('12v', '16-pin', (p) => _Compat.gpuNeedsModernPsu(p));
        addIfAny('12gb', '12GB+', (p) => _Compat.matchesSpecSearch(p, '12 gb'));
        break;
      case PcComponent.storage:
        addIfAny('m2', 'M.2 / NVMe', (p) => _Compat.isM2Storage(p));
        addIfAny('sata', 'SATA', (p) => _Compat.isSataStorage(p));
        addIfAny('1tb', '1TB+', (p) => _Compat.matchesSpecSearch(p, '1 tb'));
        break;
      case PcComponent.psu:
        addIfAny('atx3', 'ATX 3.x', (p) => _Compat.psuSupportsModernGpu(p));
        addIfAny('750w', '750W+', (p) => (_Compat.psuWattage(p) ?? 0) >= 750);
        addIfAny('850w', '850W+', (p) => (_Compat.psuWattage(p) ?? 0) >= 850);
        break;
      case PcComponent.cooler:
        if (widget.socketFilter != null) {
          addIfAny(
            'socket',
            _pcText(
              context,
              en: 'Socket ${widget.socketFilter}',
              tr: 'Soket ${widget.socketFilter}',
            ),
            (p) =>
                _Compat.supportsSocket(p, widget.socketFilter!) ||
                _Compat.socketTokens(p).isEmpty,
          );
        }
        addIfAny(
          'liquid',
          _pcText(context, en: 'Liquid', tr: 'Sivi'),
          (p) => _Compat.matchesSpecSearch(p, 'liquid'),
        );
        addIfAny(
          'air',
          _pcText(context, en: 'Air', tr: 'Hava'),
          (p) =>
              _Compat.matchesSpecSearch(p, 'air') ||
              _Compat.matchesSpecSearch(p, 'fan'),
        );
        break;
      case PcComponent.monitor:
      case PcComponent.keyboard:
      case PcComponent.mouse:
      case PcComponent.headset:
        break;
    }

    return options;
  }

  bool _matchesQuickFilter(ProductEntity product) {
    switch (_quickFilter) {
      case null:
        return true;
      case 'amd':
        return product.name.toLowerCase().contains('amd');
      case 'intel':
        return product.name.toLowerCase().contains('intel');
      case 'atx':
        return _Compat.formFactor(product) == 'ATX';
      case 'matx':
        return _Compat.formFactor(product) == 'mATX';
      case 'mitx':
        return _Compat.formFactor(product) == 'mITX';
      case 'ddr5':
        return _Compat.memoryType(product) == 'DDR5';
      case 'ddr4':
        return _Compat.memoryType(product) == 'DDR4';
      case '32gb':
        return _Compat.matchesSpecSearch(product, '32gb');
      case '12v':
        return _Compat.gpuNeedsModernPsu(product);
      case '12gb':
        return _Compat.matchesSpecSearch(product, '12 gb');
      case 'm2':
        return _Compat.isM2Storage(product);
      case 'sata':
        return _Compat.isSataStorage(product);
      case '1tb':
        return _Compat.matchesSpecSearch(product, '1 tb');
      case 'atx3':
        return _Compat.psuSupportsModernGpu(product);
      case '750w':
        return (_Compat.psuWattage(product) ?? 0) >= 750;
      case '850w':
        return (_Compat.psuWattage(product) ?? 0) >= 850;
      case 'socket':
        return widget.socketFilter == null ||
            _Compat.supportsSocket(product, widget.socketFilter!) ||
            _Compat.socketTokens(product).isEmpty;
      case 'liquid':
        return _Compat.matchesSpecSearch(product, 'liquid');
      case 'air':
        return _Compat.matchesSpecSearch(product, 'air') ||
            _Compat.matchesSpecSearch(product, 'fan');
      default:
        return true;
    }
  }

  String _sortLabel(BuildContext context) {
    return switch (_sort) {
      'name' => context.l10n?.sortByName ?? 'Name',
      'brand' => context.l10n?.brand ?? 'Brand',
      'price' => context.l10n?.price ?? 'Price',
      'newest' => _pcText(context, en: 'Newest', tr: 'En Yeni'),
      _ => context.l10n?.sortByScore ?? 'Score',
    };
  }

  String? _quickFilterLabel(BuildContext context) {
    return switch (_quickFilter) {
      'amd' => 'AMD',
      'intel' => 'Intel',
      'atx' => 'ATX',
      'matx' => 'mATX',
      'mitx' => 'mITX',
      'ddr5' => 'DDR5',
      'ddr4' => 'DDR4',
      '32gb' => '32GB+',
      '12v' => '16-pin',
      '12gb' => '12GB+',
      'm2' => 'M.2 / NVMe',
      'sata' => 'SATA',
      '1tb' => '1TB+',
      'atx3' => 'ATX 3.x',
      '750w' => '750W+',
      '850w' => '850W+',
      'socket' => _pcText(
        context,
        en: 'Socket ${widget.socketFilter ?? ''}',
        tr: 'Soket ${widget.socketFilter ?? ''}',
      ).trim(),
      'liquid' => _pcText(context, en: 'Liquid', tr: 'Sıvı'),
      'air' => _pcText(context, en: 'Air', tr: 'Hava'),
      _ => null,
    };
  }

  bool get _hasManualFilters {
    return _search.isNotEmpty ||
        _quickFilter != null ||
        _brands.isNotEmpty ||
        _sort != 'score';
  }

  List<String> _activeFilterLabels(BuildContext context) {
    final labels = <String>[];
    if (_search.isNotEmpty) {
      labels.add(
        _pcText(context, en: 'Search: $_search', tr: 'Arama: $_search'),
      );
    }
    final quickLabel = _quickFilterLabel(context);
    if (quickLabel != null && quickLabel.isNotEmpty) {
      labels.add(quickLabel);
    }
    if (_sort != 'score') {
      labels.add(
        _pcText(
          context,
          en: 'Sort: ${_sortLabel(context)}',
          tr: 'Sıralama: ${_sortLabel(context)}',
        ),
      );
    }
    labels.addAll(_brands.take(8));
    return labels;
  }

  void _clearManualFilters({required bool hasCompat}) {
    setState(() {
      _search = '';
      _searchController.clear();
      _sort = 'score';
      _brands.clear();
      _quickFilter = null;
      _showFilters = false;
      _compatOnly = hasCompat;
    });
    // Reset server-side search query
    ref
        .read(pcPickerProvider(widget.component.categoryId).notifier)
        .search('*');
  }

  List<MapEntry<String, String>> _detailEntries(ProductEntity product) {
    final entries = <MapEntry<String, String>>[];

    void addEntry(String key, dynamic value) {
      final text = switch (value) {
        null => '',
        List<dynamic> list => list.where((e) => e != null).join(', '),
        Map<dynamic, dynamic> map =>
          map.entries.map((e) => '${e.key}: ${e.value}').join(', '),
        _ => value.toString(),
      }.trim();
      if (key.trim().isEmpty || text.isEmpty) return;
      entries.add(MapEntry(key, text));
    }

    if (product.specs.isNotEmpty) {
      for (final entry in product.specs.entries) {
        addEntry(entry.key, entry.value);
      }
    } else if (product.keySpecs.isNotEmpty) {
      for (final entry in product.keySpecs.entries) {
        addEntry(entry.key, entry.value);
      }
    } else {
      for (final section in product.specSections.entries) {
        final values = section.value;
        if (values is! Map) continue;
        for (final entry in values.entries) {
          addEntry('${section.key} - ${entry.key}', entry.value);
        }
      }
    }

    return entries;
  }

  String _sentenceCaseLocalized(String text) {
    final t = text.trim();
    if (t.isEmpty) return t;
    final first = t[0];
    final upper = switch (first) {
      'i' => 'İ',
      'ı' => 'I',
      _ => first.toUpperCase(),
    };
    return '$upper${t.substring(1)}';
  }

  String _localizedSpecLabel(BuildContext context, String key) {
    final locale = Localizations.localeOf(context).languageCode;
    if (locale == 'en') return key;
    final svc = SpecTranslationService.instance;
    final normalized = key.trim().replaceAll('_', ' ');
    if (svc.isLoaded) {
      final translated = svc.translateLabelForLocale(normalized, locale);
      if (translated.trim().isNotEmpty &&
          translated.toLowerCase() != normalized.toLowerCase()) {
        return _sentenceCaseLocalized(translated);
      }
    }
    final dictionaryTranslated = pc_spec_dict.translateSpec(normalized, locale);
    if (dictionaryTranslated.trim().isNotEmpty &&
        dictionaryTranslated.toLowerCase() != normalized.toLowerCase()) {
      return _sentenceCaseLocalized(dictionaryTranslated);
    }
    return _sentenceCaseLocalized(normalized);
  }

  String _localizedSpecValue(BuildContext context, String value) {
    final locale = Localizations.localeOf(context).languageCode;
    if (locale == 'en') return value;
    final svc = SpecTranslationService.instance;
    final normalized = value.trim();
    if (svc.isLoaded) {
      final translated = svc.translateValueForLocale(normalized, locale);
      if (translated.trim().isNotEmpty &&
          translated.toLowerCase() != normalized.toLowerCase()) {
        return _sentenceCaseLocalized(translated);
      }
    }
    final dictionaryTranslated = pc_spec_dict.translateSpecValue(
      normalized,
      locale,
    );
    if (dictionaryTranslated.trim().isNotEmpty &&
        dictionaryTranslated.toLowerCase() != normalized.toLowerCase()) {
      return _sentenceCaseLocalized(dictionaryTranslated);
    }
    return _sentenceCaseLocalized(normalized);
  }

  List<ProductEntity> _applyFilters(List<ProductEntity> all) {
    var list = List<ProductEntity>.from(all);
    // Compat — socket filter for MB and cooler (lenient: unknown socket = included)
    if (_compatOnly &&
        widget.socketFilter != null &&
        (widget.component == PcComponent.motherboard ||
            widget.component == PcComponent.cooler)) {
      final t = _Compat._normalizeSocket(widget.socketFilter!);
      list = list.where((p) {
        final tokens = _Compat.socketTokens(p);
        // No socket info in the product data → be lenient, include it.
        if (tokens.isEmpty) return true;
        // Check normalized token set for any overlap with the target socket.
        return tokens.any(
          (tok) => tok == t || tok.contains(t) || t.contains(tok),
        );
      }).toList();
    }
    // Compat — memory type filter for RAM (strict: exclude wrong DDR gen)
    if (_compatOnly &&
        widget.memTypeFilter != null &&
        widget.component == PcComponent.ram) {
      final t = widget.memTypeFilter!.toUpperCase();
      list = list.where((p) {
        final m = _Compat.memoryType(p);
        // Unknown memory type: be lenient ONLY if the product name doesn't
        // contain a clear DDR marker that contradicts the filter.
        if (m == null) {
          final name = p.name.toUpperCase();
          // If name contains a DDR marker that contradicts target → exclude.
          final contradicts = RegExp(r'DDR(\d)').firstMatch(name);
          if (contradicts != null && 'DDR${contradicts.group(1)}' != t) {
            return false;
          }
          return true; // genuinely unknown → include
        }
        return m.contains(t) || t.contains(m);
      }).toList();
    }
    // Compat — form factor filter for Case (must fit MB) or MB (must fit in Case)
    if (_compatOnly &&
        widget.formFactorFilter != null &&
        (widget.component == PcComponent.pcCase ||
            widget.component == PcComponent.motherboard)) {
      list = list.where((p) {
        final ff = _Compat.formFactor(p);
        // No form factor info → be lenient, include it.
        if (ff == null) return true;
        if (widget.component == PcComponent.pcCase) {
          // Case must fit the MB: case must be >= MB form factor
          return _Compat.formFactorCompatible(widget.formFactorFilter, ff);
        } else {
          // MB must fit in Case: MB must be <= case form factor
          return _Compat.formFactorCompatible(ff, widget.formFactorFilter);
        }
      }).toList();
    }
    if (_compatOnly && widget.component == PcComponent.gpu) {
      final selectedCase = widget.allSelected[PcComponent.pcCase];
      final caseLimit = selectedCase == null
          ? null
          : _Compat.caseMaxGpuLengthMm(selectedCase);
      if (caseLimit != null) {
        list = list.where((p) {
          final gpuLength = _Compat.gpuLengthMm(p);
          return gpuLength == null || gpuLength <= caseLimit;
        }).toList();
      }
    }
    if (_compatOnly && widget.component == PcComponent.pcCase) {
      final selectedGpu = widget.allSelected[PcComponent.gpu];
      final gpuLength = selectedGpu == null
          ? null
          : _Compat.gpuLengthMm(selectedGpu);
      if (gpuLength != null) {
        list = list.where((p) {
          final caseLimit = _Compat.caseMaxGpuLengthMm(p);
          return caseLimit == null || caseLimit >= gpuLength;
        }).toList();
      }
    }
    if (_compatOnly && widget.component == PcComponent.storage) {
      final motherboard = widget.allSelected[PcComponent.motherboard];
      if (motherboard != null) {
        list = list.where((p) {
          final isM2 = _Compat.isM2Storage(p);
          final isSata = _Compat.isSataStorage(p);
          if (isM2) return _Compat.motherboardHasM2(motherboard);
          if (isSata) return _Compat.motherboardHasSata(motherboard);
          return true;
        }).toList();
      }
    }
    if (_compatOnly && widget.component == PcComponent.psu) {
      final required = _requiredPsuWattage;
      list = list.where((p) {
        final watt = _Compat.psuWattage(p);
        if (required != null && watt == null) return false;
        if (required != null && watt != null && watt < required) return false;
        return true;
      }).toList();
    }
    if (_quickFilter != null) {
      list = list.where(_matchesQuickFilter).toList();
    }
    // Text search is server-side (pcPickerProvider.search()). No client-side text filter here.
    if (_brands.isNotEmpty) {
      list = list.where((p) => _brands.contains(p.brand)).toList();
    }
    switch (_sort) {
      case 'score':
        list.sort((a, b) => b.techScore.compareTo(a.techScore));
        if (_compatOnly && widget.component == PcComponent.psu) {
          list.sort((a, b) {
            final aModern = _Compat.psuSupportsModernGpu(a) ? 1 : 0;
            final bModern = _Compat.psuSupportsModernGpu(b) ? 1 : 0;
            if (aModern != bModern) return bModern.compareTo(aModern);
            return b.techScore.compareTo(a.techScore);
          });
        }
      case 'name':
        list.sort((a, b) => a.name.compareTo(b.name));
      case 'brand':
        list.sort((a, b) => (a.brand ?? '').compareTo(b.brand ?? ''));
      case 'price':
        list.sort((a, b) {
          final pa = a.prices.isNotEmpty ? a.prices.values.first : 0.0;
          final pb = b.prices.isNotEmpty ? b.prices.values.first : 0.0;
          return pa.compareTo(pb);
        });
      case 'newest':
        list.sort((a, b) => b.lastUpdated.compareTo(a.lastUpdated));
    }
    return list;
  }

  @override
  Widget build(BuildContext context) {
    final accent = widget.component.accentColor;
    final hasCompat =
        widget.socketFilter != null ||
        widget.memTypeFilter != null ||
        widget.formFactorFilter != null ||
        _hasAdditionalCompatFilters;
    // pcPickerProvider: paginated, server-side search — only 30 items at a time.
    // No eager preloading of 4000+ items. Opens instantly, loads more on scroll.
    final pickerState = ref.watch(
      pcPickerProvider(widget.component.categoryId),
    );

    return Scaffold(
      backgroundColor: context.backgroundColor,
      appBar: AppBar(
        backgroundColor: context.backgroundColor,
        surfaceTintColor: Colors.transparent,
        leading: IconButton(
          icon: Icon(Icons.close_rounded, color: context.textPrimary),
          onPressed: () => Navigator.pop(context),
        ),
        title: Row(
          children: [
            Container(
              width: 30,
              height: 30,
              decoration: BoxDecoration(
                color: accent.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(widget.component.icon, size: 16, color: accent),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                widget.component.label(context),
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: context.textPrimary,
                ),
              ),
            ),
          ],
        ),
      ),
      body: Column(
        children: [
          // Search bar
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
            child: Row(
              children: [
                Expanded(
                  child: Container(
                    height: 42,
                    decoration: BoxDecoration(
                      color: context.surfaceVariantColor,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: context.dividerColor),
                    ),
                    child: TextField(
                      controller: _searchController,
                      onChanged: (v) {
                        setState(() => _search = v);
                        _debounceTimer?.cancel();
                        _debounceTimer = Timer(
                          const Duration(milliseconds: 400),
                          () => ref
                              .read(
                                pcPickerProvider(
                                  widget.component.categoryId,
                                ).notifier,
                              )
                              .search(v),
                        );
                      },
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 13,
                        color: context.textPrimary,
                      ),
                      decoration: InputDecoration(
                        hintText: _pcText(
                          context,
                          en: '${context.l10n?.search ?? "Search"} name, brand, specs...',
                          tr: '${context.l10n?.search ?? "Ara"} isim, marka, özellik...',
                        ),
                        hintStyle: GoogleFonts.plusJakartaSans(
                          fontSize: 12,
                          color: context.textTertiaryColor,
                        ),
                        prefixIcon: Icon(
                          Icons.search_rounded,
                          size: 18,
                          color: context.textTertiaryColor,
                        ),
                        suffixIcon: _search.isEmpty
                            ? null
                            : IconButton(
                                onPressed: () => setState(() {
                                  _search = '';
                                  _searchController.clear();
                                }),
                                icon: Icon(
                                  Icons.close_rounded,
                                  size: 18,
                                  color: context.textTertiaryColor,
                                ),
                              ),
                        border: InputBorder.none,
                        contentPadding: const EdgeInsets.symmetric(
                          vertical: 12,
                        ),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 6),
                Container(
                  height: 42,
                  padding: const EdgeInsets.symmetric(horizontal: 10),
                  decoration: BoxDecoration(
                    color: context.surfaceVariantColor,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: context.dividerColor),
                  ),
                  child: DropdownButtonHideUnderline(
                    child: DropdownButton<String>(
                      value: _sort,
                      isDense: true,
                      dropdownColor: context.surfaceVariantColor,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 11,
                        color: context.textPrimary,
                      ),
                      items: [
                        DropdownMenuItem(
                          value: 'score',
                          child: Text(context.l10n?.sortByScore ?? 'Score'),
                        ),
                        DropdownMenuItem(
                          value: 'name',
                          child: Text(context.l10n?.sortByName ?? 'Name'),
                        ),
                        DropdownMenuItem(
                          value: 'brand',
                          child: Text(context.l10n?.brand ?? 'Brand'),
                        ),
                        DropdownMenuItem(
                          value: 'price',
                          child: Text(context.l10n?.price ?? 'Price'),
                        ),
                        DropdownMenuItem(
                          value: 'newest',
                          child: Text(
                            _pcText(context, en: 'Newest', tr: 'En Yeni'),
                          ),
                        ),
                      ],
                      onChanged: (v) => setState(() => _sort = v ?? 'score'),
                    ),
                  ),
                ),
                const SizedBox(width: 6),
                GestureDetector(
                  onTap: () => setState(() => _showFilters = !_showFilters),
                  child: Container(
                    width: 42,
                    height: 42,
                    decoration: BoxDecoration(
                      color: _showFilters
                          ? accent.withValues(alpha: 0.15)
                          : context.surfaceVariantColor,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: _showFilters ? accent : context.dividerColor,
                      ),
                    ),
                    child: Icon(
                      Icons.tune_rounded,
                      size: 18,
                      color: _showFilters ? accent : context.textTertiaryColor,
                    ),
                  ),
                ),
              ],
            ),
          ),
          // Compat toggle
          if (hasCompat)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 2, 16, 4),
              child: Row(
                children: [
                  Icon(
                    Icons.link_rounded,
                    size: 14,
                    color: AppTheme.brandDeepBlue,
                  ),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      '${context.l10n?.compatibleOnly ?? "Compatible only"}: ${_compatHints(context).join(' · ')}',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 11,
                        color: AppTheme.brandDeepBlue,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                  Switch(
                    value: _compatOnly,
                    onChanged: (v) => setState(() => _compatOnly = v),
                    activeTrackColor: AppTheme.brandDeepBlue,
                    materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                ],
              ),
            ),
          // Brand chips — show when filter open and products are loaded
          if (_showFilters)
            Builder(
              builder: (_) {
                final products = pickerState.items;
                if (products.isEmpty) return const SizedBox.shrink();
                final quickFilters = _quickFilterOptions(products);
                return Column(
                  children: [
                    if (quickFilters.isNotEmpty)
                      Container(
                        padding: const EdgeInsets.fromLTRB(16, 4, 16, 2),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              _pcText(
                                context,
                                en: 'Quick Filters',
                                tr: 'Hızlı Filtreler',
                              ),
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                                color: context.textSecondary,
                              ),
                            ),
                            const SizedBox(height: 8),
                            Wrap(
                              spacing: 5,
                              runSpacing: 5,
                              children: [
                                ...quickFilters.map((filter) {
                                  final selected = _quickFilter == filter.key;
                                  return GestureDetector(
                                    onTap: () => setState(() {
                                      _quickFilter = selected
                                          ? null
                                          : filter.key;
                                    }),
                                    child: Container(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 8,
                                        vertical: 5,
                                      ),
                                      decoration: BoxDecoration(
                                        color: selected
                                            ? accent.withValues(alpha: 0.15)
                                            : context.surfaceVariantColor,
                                        borderRadius: BorderRadius.circular(8),
                                        border: Border.all(
                                          color: selected
                                              ? accent
                                              : context.dividerColor,
                                        ),
                                      ),
                                      child: Text(
                                        filter.value,
                                        style: GoogleFonts.plusJakartaSans(
                                          fontSize: 10,
                                          fontWeight: FontWeight.w600,
                                          color: selected
                                              ? accent
                                              : context.textSecondary,
                                        ),
                                      ),
                                    ),
                                  );
                                }),
                              ],
                            ),
                          ],
                        ),
                      ),
                    _brandChipsFromList(context, products),
                  ],
                );
              },
            ),
          if (_hasManualFilters)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 6, 16, 8),
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: accent.withValues(alpha: 0.07),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: accent.withValues(alpha: 0.16)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(
                          _pcText(
                            context,
                            en: 'Active Filters',
                            tr: 'Aktif Filtreler',
                          ),
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: accent,
                          ),
                        ),
                        const Spacer(),
                        GestureDetector(
                          onTap: () =>
                              _clearManualFilters(hasCompat: hasCompat),
                          child: Text(
                            _pcText(
                              context,
                              en: 'Clear all',
                              tr: 'Tümünü temizle',
                            ),
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              color: accent,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: _activeFilterLabels(context)
                          .map(
                            (label) => Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 10,
                                vertical: 6,
                              ),
                              decoration: BoxDecoration(
                                color: context.surfaceColor,
                                borderRadius: BorderRadius.circular(999),
                                border: Border.all(color: context.dividerColor),
                              ),
                              child: Text(
                                label,
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 10,
                                  fontWeight: FontWeight.w600,
                                  color: context.textSecondary,
                                ),
                              ),
                            ),
                          )
                          .toList(),
                    ),
                  ],
                ),
              ),
            ),
          // Count
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 2),
            child: Row(
              children: [
                if (!pickerState.isLoading)
                  Text(
                    pickerState.totalFound > 0
                        ? '${pickerState.totalFound} ${context.l10n?.productsLabel ?? "products"}'
                        : '',
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 11,
                      color: context.textTertiaryColor,
                    ),
                  ),
                const Spacer(),
              ],
            ),
          ),
          // List
          Expanded(
            child: pickerState.isLoading
                ? Center(
                    child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    SizedBox(
                      width: 32,
                      height: 32,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: widget.component.accentColor,
                      ),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      context.l10n?.loading ?? 'Loading...',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 12,
                        color: context.textSecondary,
                      ),
                    ),
                  ],
                ),
              )
            : pickerState.items.isEmpty && !pickerState.isLoading
                ? Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          Icons.search_off_rounded,
                          size: 40,
                          color: context.textTertiaryColor,
                        ),
                        const SizedBox(height: 8),
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 24),
                          child: Text(
                            context.l10n?.noProductsFound ?? 'No products found',
                            textAlign: TextAlign.center,
                            style: GoogleFonts.plusJakartaSans(
                              color: context.textPrimary,
                              fontWeight: FontWeight.w600,
                              fontSize: 15,
                            ),
                          ),
                        ),
                        const SizedBox(height: 16),
                        ElevatedButton.icon(
                          onPressed: () => ref
                              .read(
                                pcPickerProvider(
                                  widget.component.categoryId,
                                ).notifier,
                              )
                              .search('*'),
                          icon: const Icon(Icons.refresh_rounded, size: 16),
                          label: Text(context.l10n?.retry ?? 'Retry'),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: widget.component.accentColor,
                            foregroundColor: Colors.white,
                          ),
                        ),
                      ],
                    ),
                  )
                : _list(context, pickerState.items, pickerState),
          ),
        ],
      ),
    );
  }

  Widget _brandChipsFromList(
    BuildContext context,
    List<ProductEntity> products,
  ) {
    final all = <String>{};
    for (final p in products) {
      if (p.brand != null && p.brand!.isNotEmpty) all.add(p.brand!);
    }
    final sorted = all.toList()..sort();
    if (sorted.isEmpty) return const SizedBox.shrink();
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            _pcText(context, en: 'Brands', tr: 'Markalar'),
            style: GoogleFonts.plusJakartaSans(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: context.textSecondary,
            ),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 5,
            runSpacing: 5,
            children: sorted.map((b) {
              final sel = _brands.contains(b);
              return GestureDetector(
                onTap: () => setState(() {
                  if (sel) {
                    _brands.remove(b);
                  } else {
                    _brands.add(b);
                  }
                }),
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 5,
                  ),
                  decoration: BoxDecoration(
                    color: sel
                        ? widget.component.accentColor.withValues(alpha: 0.15)
                        : context.surfaceVariantColor,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                      color: sel
                          ? widget.component.accentColor
                          : context.dividerColor,
                    ),
                  ),
                  child: Text(
                    b,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 10,
                      fontWeight: FontWeight.w500,
                      color: sel
                          ? widget.component.accentColor
                          : context.textSecondary,
                    ),
                  ),
                ),
              );
            }).toList(),
          ),
        ],
      ),
    );
  }

  Widget _list(BuildContext context, List<ProductEntity> allProducts, PcPickerState pickerState) {
    final f = _applyFilters(allProducts);
    if (f.isEmpty) {
      // Check if compat filter is hiding everything
      final hasCompat =
          widget.socketFilter != null ||
          widget.memTypeFilter != null ||
          widget.formFactorFilter != null ||
          _hasAdditionalCompatFilters;
      final isCompatCause = hasCompat && _compatOnly;
      return Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                isCompatCause
                    ? Icons.filter_alt_off_rounded
                    : Icons.search_off_rounded,
                size: 40,
                color: context.textTertiaryColor,
              ),
              const SizedBox(height: 8),
              Text(
                isCompatCause
                    ? _pcText(
                        context,
                        en: 'No compatible products found.\nTurn off the compatibility filter to see all products.',
                        tr: 'Uyumlu ürün bulunamadı.\nTüm ürünleri görmek için uyumluluk filtresini kapatın.',
                      )
                    : (context.l10n?.noProductsFound ?? 'No products found'),
                textAlign: TextAlign.center,
                style: GoogleFonts.plusJakartaSans(
                  color: context.textSecondary,
                  height: 1.4,
                ),
              ),
              if (isCompatCause) ...[
                const SizedBox(height: 12),
                ElevatedButton.icon(
                  onPressed: () => setState(() => _compatOnly = false),
                  icon: const Icon(Icons.visibility_rounded, size: 16),
                  label: Text(
                    _pcText(
                      context,
                      en: 'Show All ${allProducts.length} Products',
                      tr: 'Tüm ${allProducts.length} Ürünü Göster',
                    ),
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: widget.component.accentColor,
                    foregroundColor: Colors.white,
                  ),
                ),
              ],
              if (_search.isNotEmpty ||
                  _brands.isNotEmpty ||
                  _quickFilter != null) ...[
                const SizedBox(height: 8),
                TextButton(
                  onPressed: () {
                    setState(() {
                      _search = '';
                      _searchController.clear();
                      _brands.clear();
                      _quickFilter = null;
                    });
                    ref
                        .read(
                          pcPickerProvider(
                            widget.component.categoryId,
                          ).notifier,
                        )
                        .search('*');
                  },
                  child: Text(
                    context.l10n?.clearFilters ?? 'Clear Filters',
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 12,
                      color: widget.component.accentColor,
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      );
    }
    // Calculate median price for "Best Value" tag
    final prices =
        f
            .map((p) => p.prices['US'] ?? p.prices.values.firstOrNull ?? 0.0)
            .where((p) => p > 0)
            .toList()
          ..sort();
    final medianPrice = prices.isNotEmpty ? prices[prices.length ~/ 2] : 0.0;
    // +1 for "load more" sentinel when more pages exist or loading more
    final hasLoadMore = pickerState.hasMore || pickerState.isLoadingMore;

    return NotificationListener<ScrollNotification>(
      onNotification: (notification) {
        if (notification.metrics.pixels >=
            notification.metrics.maxScrollExtent - 400) {
          ref
              .read(
                pcPickerProvider(widget.component.categoryId).notifier,
              )
              .loadMore();
        }
        return false;
      },
      child: ListView.builder(
        controller: widget.scrollController,
        padding: const EdgeInsets.fromLTRB(16, 2, 16, 80),
        itemCount: f.length + (hasLoadMore ? 1 : 0),
        itemBuilder: (_, i) {
          if (i == f.length) {
            // Load-more sentinel / spinner
            return Padding(
              padding: const EdgeInsets.symmetric(vertical: 16),
              child: Center(
                child: pickerState.isLoadingMore
                    ? SizedBox(
                        width: 24,
                        height: 24,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: widget.component.accentColor,
                        ),
                      )
                    : const SizedBox.shrink(),
              ),
            );
          }
          final p = f[i];
          final isSel = widget.currentSelection?.id == p.id;
          return _ProductCard(
            product: p,
            component: widget.component,
            isSelected: isSel,
            onTap: () => Navigator.pop(context, p),
            onInfo: () => _showProductDetail(context, p),
            medianPrice: medianPrice,
            socketFilter: widget.socketFilter,
            memTypeFilter: widget.memTypeFilter,
          );
        },
      ),
    );
  }

  /// Shows a spec preview bottom sheet with "Select" button
  void _showProductDetail(BuildContext ctx, ProductEntity p) {
    showModalBottomSheet(
      context: ctx,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (sheetCtx) => DraggableScrollableSheet(
        initialChildSize: 0.75,
        minChildSize: 0.4,
        maxChildSize: 0.95,
        expand: false,
        builder: (builderCtx, sc) {
          final bottomPad = MediaQuery.of(builderCtx).padding.bottom;
          return Consumer(
            builder: (_, ref, _) {
              final detailAsync = ref.watch(productDetailProvider(p.id));
              final detailProduct = switch (detailAsync.valueOrNull) {
                Success<ProductEntity>(data: final product) => product,
                _ => p,
              };
              final detailEntries = _detailEntries(detailProduct);

              return ClipRRect(
                borderRadius: const BorderRadius.vertical(
                  top: Radius.circular(20),
                ),
                child: Scaffold(
                  backgroundColor: ctx.backgroundColor,
                  body: Column(
                    children: [
                      Container(
                        color: ctx.surfaceVariantColor,
                        padding: const EdgeInsets.fromLTRB(16, 12, 16, 14),
                        child: Column(
                          children: [
                            Center(
                              child: Container(
                                width: 36,
                                height: 4,
                                decoration: BoxDecoration(
                                  color: ctx.dividerColor,
                                  borderRadius: BorderRadius.circular(2),
                                ),
                              ),
                            ),
                            const SizedBox(height: 12),
                            Row(
                              children: [
                                ClipRRect(
                                  borderRadius: BorderRadius.circular(10),
                                  child: Container(
                                    width: 52,
                                    height: 52,
                                    color: Colors.white,
                                    child:
                                        detailProduct.imageUrl != null &&
                                            detailProduct.imageUrl!.isNotEmpty
                                        ? CachedNetworkImage(
                                            imageUrl: detailProduct.imageUrl!,
                                            fit: BoxFit.contain,
                                          )
                                        : Icon(
                                            widget.component.icon,
                                            size: 26,
                                            color: ctx.textTertiaryColor,
                                          ),
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        detailProduct.name,
                                        style: GoogleFonts.plusJakartaSans(
                                          fontSize: 14,
                                          fontWeight: FontWeight.w700,
                                          color: ctx.textPrimary,
                                        ),
                                      ),
                                      if (detailProduct.brand != null)
                                        Text(
                                          detailProduct.brand!,
                                          style: GoogleFonts.plusJakartaSans(
                                            fontSize: 12,
                                            color: widget.component.accentColor,
                                          ),
                                        ),
                                    ],
                                  ),
                                ),
                                Container(
                                  width: 44,
                                  height: 44,
                                  decoration: BoxDecoration(
                                    shape: BoxShape.circle,
                                    color: widget.component.accentColor
                                        .withValues(alpha: 0.12),
                                    border: Border.all(
                                      color: widget.component.accentColor
                                          .withValues(alpha: 0.4),
                                    ),
                                  ),
                                  child: Center(
                                    child: Text(
                                      '${detailProduct.techScore.round()}',
                                      style: GoogleFonts.plusJakartaSans(
                                        fontSize: 14,
                                        fontWeight: FontWeight.w800,
                                        color: widget.component.accentColor,
                                      ),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                      Expanded(
                        child: SingleChildScrollView(
                          controller: sc,
                          padding: EdgeInsets.fromLTRB(
                            16,
                            12,
                            16,
                            bottomPad + 12,
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              if (detailAsync.isLoading &&
                                  detailEntries.isEmpty) ...[
                                Center(
                                  child: Padding(
                                    padding: const EdgeInsets.only(bottom: 12),
                                    child: SizedBox(
                                      width: 24,
                                      height: 24,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                        color: widget.component.accentColor,
                                      ),
                                    ),
                                  ),
                                ),
                              ],
                              if (detailProduct.description.isNotEmpty) ...[
                                Text(
                                  detailProduct.description,
                                  style: GoogleFonts.plusJakartaSans(
                                    fontSize: 12,
                                    color: ctx.textSecondary,
                                    height: 1.5,
                                  ),
                                ),
                                const SizedBox(height: 16),
                              ],
                              if (detailEntries.isEmpty)
                                Text(
                                  _pcText(
                                    ctx,
                                    en: 'No specifications available.',
                                    tr: 'Teknik özellik bulunamadı.',
                                  ),
                                  style: GoogleFonts.plusJakartaSans(
                                    fontSize: 12,
                                    color: ctx.textTertiaryColor,
                                  ),
                                )
                              else
                                ...detailEntries.map(
                                  (e) => Container(
                                    margin: const EdgeInsets.only(bottom: 6),
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 12,
                                      vertical: 8,
                                    ),
                                    decoration: BoxDecoration(
                                      color: ctx.surfaceVariantColor,
                                      borderRadius: BorderRadius.circular(10),
                                      border: Border.all(
                                        color: ctx.dividerColor,
                                      ),
                                    ),
                                    child: Row(
                                      children: [
                                        Expanded(
                                          flex: 2,
                                          child: Text(
                                            _localizedSpecLabel(ctx, e.key),
                                            style: GoogleFonts.plusJakartaSans(
                                              fontSize: 11,
                                              fontWeight: FontWeight.w600,
                                              color: ctx.textSecondary,
                                            ),
                                          ),
                                        ),
                                        Expanded(
                                          flex: 3,
                                          child: Text(
                                            _localizedSpecValue(ctx, e.value),
                                            style: GoogleFonts.plusJakartaSans(
                                              fontSize: 11,
                                              fontWeight: FontWeight.w500,
                                              color: ctx.textPrimary,
                                            ),
                                            textAlign: TextAlign.end,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                            ],
                          ),
                        ),
                      ),
                      SafeArea(
                        top: false,
                        child: Container(
                          padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                          decoration: BoxDecoration(
                            color: ctx.backgroundColor,
                            border: Border(
                              top: BorderSide(color: ctx.dividerColor),
                            ),
                          ),
                          child: Row(
                            children: [
                              Expanded(
                                child: OutlinedButton.icon(
                                  onPressed: () {
                                    Navigator.pop(sheetCtx);
                                    ctx.push('/product/${p.id}');
                                  },
                                  icon: const Icon(
                                    Icons.open_in_new_rounded,
                                    size: 16,
                                  ),
                                  label: Text(
                                    ctx.l10n?.viewDetails ?? 'View Details',
                                    style: GoogleFonts.plusJakartaSans(
                                      fontSize: 13,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                  style: OutlinedButton.styleFrom(
                                    foregroundColor:
                                        widget.component.accentColor,
                                    side: BorderSide(
                                      color: widget.component.accentColor,
                                    ),
                                    padding: const EdgeInsets.symmetric(
                                      vertical: 12,
                                    ),
                                  ),
                                ),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: ElevatedButton.icon(
                                  onPressed: () {
                                    Navigator.pop(sheetCtx);
                                    Navigator.pop(ctx, detailProduct);
                                  },
                                  icon: const Icon(
                                    Icons.check_circle_outline_rounded,
                                    size: 16,
                                  ),
                                  label: Text(
                                    ctx.l10n?.selectComponent ?? 'Select',
                                    style: GoogleFonts.plusJakartaSans(
                                      fontSize: 13,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor:
                                        widget.component.accentColor,
                                    foregroundColor: Colors.white,
                                    padding: const EdgeInsets.symmetric(
                                      vertical: 12,
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }
}

// Product Card with Popular/Best Value tags

class _ProductCard extends StatelessWidget {
  final ProductEntity product;
  final PcComponent component;
  final bool isSelected;
  final VoidCallback onTap;
  final VoidCallback? onInfo;
  final double medianPrice;
  final String? socketFilter;
  final String? memTypeFilter;
  const _ProductCard({
    required this.product,
    required this.component,
    required this.isSelected,
    required this.onTap,
    this.onInfo,
    this.medianPrice = 0,
    this.socketFilter,
    this.memTypeFilter,
  });

  String _keySpec() {
    String g(List<String> keys) {
      for (final k in keys) {
        final v = product.specs[k]?.toString();
        if (v != null && v.isNotEmpty) return v;
      }
      return '';
    }

    return switch (component) {
      PcComponent.cpu => [
        g(['Core', 'core', 'Cores']),
        g(['Socket', 'socket']),
        g(['Thermal Design Power (TDP)', 'TDP']),
      ].where((s) => s.isNotEmpty).join(' \u00b7 '),
      PcComponent.motherboard => [
        g(['Processor Socket', 'Socket']),
        g(['Chipset Model', 'Chipset']),
        g(['Memory Technology']),
        g(['Form Factor']),
      ].where((s) => s.isNotEmpty).join(' \u00b7 '),
      PcComponent.ram => [
        g(['Memory Technology', 'Type']),
        g(['Memory Capacity', 'Capacity']),
        g(['Memory Clock Speed', 'Speed']),
      ].where((s) => s.isNotEmpty).join(' \u00b7 '),
      PcComponent.gpu => [
        g(['VRAM', 'Memory', 'Memory Capacity']),
        g(['Boost Clock', 'Clock Speed']),
      ].where((s) => s.isNotEmpty).join(' \u00b7 '),
      PcComponent.storage => [
        g(['Capacity', 'Storage Capacity']),
        g(['Interface', 'Type']),
        g(['Read Speed', 'Sequential Read']),
      ].where((s) => s.isNotEmpty).join(' \u00b7 '),
      PcComponent.psu => [
        g(['Power', 'Wattage', 'Output Power']),
        g(['Certification', 'Efficiency']),
      ].where((s) => s.isNotEmpty).join(' \u00b7 '),
      PcComponent.pcCase => [
        g(['Form Factor']),
        g(['Color', 'Colour']),
        g(['Material']),
      ].where((s) => s.isNotEmpty).join(' \u00b7 '),
      PcComponent.cooler => [
        g(['Fan Speed', 'RPM']),
        g(['Noise Level']),
        g(['Socket', 'Compatible Sockets']),
      ].where((s) => s.isNotEmpty).join(' \u00b7 '),
      PcComponent.monitor => [
        g(['Screen Size', 'Display Size']),
        g(['Resolution']),
        g(['Refresh Rate']),
        g(['Panel Type', 'Panel']),
      ].where((s) => s.isNotEmpty).join(' \u00b7 '),
      PcComponent.keyboard => [
        g(['Switch Type', 'Key Switch']),
        g(['Layout']),
        g(['Connection', 'Connectivity']),
      ].where((s) => s.isNotEmpty).join(' \u00b7 '),
      PcComponent.mouse => [
        g(['DPI', 'Max DPI', 'Sensor']),
        g(['Connection', 'Connectivity']),
        g(['Weight']),
      ].where((s) => s.isNotEmpty).join(' \u00b7 '),
      PcComponent.headset => [
        g(['Driver Size', 'Driver']),
        g(['Frequency Response']),
        g(['Connection', 'Connectivity']),
        g(['Microphone', 'Mic']),
      ].where((s) => s.isNotEmpty).join(' \u00b7 '),
    };
  }

  /// Compatibility warning — only shown when item is INCOMPATIBLE with selection.
  /// When compat filter is ON, incompatible items are already hidden, so no warning needed.
  String? _compatWarning() {
    if (component == PcComponent.ram && memTypeFilter != null) {
      final mem = _Compat.memoryType(product);
      if (mem != null) {
        final t = memTypeFilter!.toUpperCase();
        final isIncompat =
            !mem.toUpperCase().contains(t) && !t.contains(mem.toUpperCase());
        if (isIncompat) return '⚠️ Incompatible: $mem vs $memTypeFilter';
      }
    }
    if ((component == PcComponent.motherboard ||
            component == PcComponent.cooler) &&
        socketFilter != null) {
      final sock = component == PcComponent.cooler
          ? _Compat.socketTokens(product).join(', ')
          : _Compat.socket(product);
      if (sock != null && sock.isNotEmpty) {
        final t = socketFilter!.toUpperCase();
        final isCompat = component == PcComponent.cooler
            ? _Compat.supportsSocket(product, t)
            : (sock.contains(t) || t.contains(sock));
        if (!isCompat) {
          return '⚠️ Socket mismatch: $sock ≠ $socketFilter';
        }
      }
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final accent = component.accentColor;
    final sc = product.techScore >= 80
        ? AppTheme.success
        : product.techScore >= 60
        ? AppTheme.brandBlue
        : product.techScore >= 40
        ? AppTheme.amber500
        : AppTheme.rose500;
    final ks = _keySpec();
    final isPopular = product.techScore > 85;
    final productPrice =
        product.prices['US'] ?? product.prices.values.firstOrNull ?? 0.0;
    final isBestValue =
        product.techScore > 75 &&
        productPrice > 0 &&
        medianPrice > 0 &&
        productPrice <= medianPrice;
    final warn = _compatWarning();

    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      decoration: BoxDecoration(
        color: isSelected
            ? accent.withValues(alpha: 0.08)
            : context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: isSelected ? accent : context.dividerColor,
          width: isSelected ? 1.5 : 1,
        ),
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(10),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(10),
                      child: Container(
                        width: 50,
                        height: 50,
                        color: Colors.white,
                        child:
                            product.imageUrl != null &&
                                product.imageUrl!.isNotEmpty
                            ? CachedNetworkImage(
                                imageUrl: product.imageUrl!,
                                fit: BoxFit.contain,
                                errorWidget: (_, _, _) => Icon(
                                  component.icon,
                                  size: 22,
                                  color: context.textTertiaryColor,
                                ),
                              )
                            : Icon(
                                component.icon,
                                size: 22,
                                color: context.textTertiaryColor,
                              ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          // Tags row
                          if (isPopular || isBestValue)
                            Padding(
                              padding: const EdgeInsets.only(bottom: 3),
                              child: Wrap(
                                spacing: 4,
                                children: [
                                  if (isPopular)
                                    _tag('⭐ Popular', AppTheme.success),
                                  if (isBestValue)
                                    _tag('💎 Best Value', AppTheme.brandBlue),
                                ],
                              ),
                            ),
                          Text(
                            product.name,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: context.textPrimary,
                            ),
                          ),
                          if (product.brand != null &&
                              product.brand!.isNotEmpty) ...[
                            const SizedBox(height: 1),
                            Text(
                              product.brand!,
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 10,
                                color: accent,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ],
                          if (ks.isNotEmpty) ...[
                            const SizedBox(height: 2),
                            Text(
                              ks,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 9,
                                color: context.textTertiaryColor,
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                    const SizedBox(width: 6),
                    Container(
                      width: 38,
                      height: 38,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: sc.withValues(alpha: 0.12),
                        border: Border.all(color: sc.withValues(alpha: 0.3)),
                      ),
                      child: Center(
                        child: Text(
                          product.techScore.round().toString(),
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 13,
                            fontWeight: FontWeight.w800,
                            color: sc,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 4),
                    // Info button to view specs before selecting
                    GestureDetector(
                      onTap: onInfo,
                      child: Container(
                        width: 30,
                        height: 30,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: accent.withValues(alpha: 0.08),
                          border: Border.all(
                            color: accent.withValues(alpha: 0.25),
                          ),
                        ),
                        child: Icon(
                          Icons.info_outline_rounded,
                          size: 15,
                          color: accent,
                        ),
                      ),
                    ),
                    if (isSelected) ...[
                      const SizedBox(width: 4),
                      Icon(Icons.check_circle_rounded, size: 20, color: accent),
                    ],
                  ],
                ),
                // Compatibility warning
                if (warn != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Container(
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: AppTheme.amber500.withValues(alpha: 0.08),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        warn,
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 9,
                          color: AppTheme.amber500,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _tag(String label, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(4),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Text(
        label,
        style: GoogleFonts.plusJakartaSans(
          fontSize: 8,
          fontWeight: FontWeight.w700,
          color: color,
        ),
      ),
    );
  }
}
