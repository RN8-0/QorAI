/// Compair - PC Builder (PCPartPicker-style with compatibility)
library;

import 'dart:math';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:compair/core/theme.dart';
import 'package:compair/domain/entities/product_entity.dart';
import 'package:compair/presentation/providers/providers.dart';
import 'package:compair/routing/router.dart';

/// App-theme gradient (brandDeepBlue → brandBlue → brandCyan).
const _accentGradient = LinearGradient(
  colors: [AppTheme.brandDeepBlue, AppTheme.brandBlue, AppTheme.brandCyan],
  begin: Alignment.topLeft,
  end: Alignment.bottomRight,
);

// Component Category Definitions

enum PcComponent {
  cpu, motherboard, ram, gpu, storage, psu, pcCase, cooler, monitor, keyboard, mouse, headset;

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
      monitor => 'Monitor',
      keyboard => 'Keyboard',
      mouse => 'Mouse',
      headset => 'Headset',
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

// Compatibility Helper

class _Compat {
  static String? socket(ProductEntity p) {
    for (final key in ['Socket', 'socket', 'Processor Socket', 'processor socket', 'Soket']) {
      final v = p.specs[key];
      if (v != null && v.toString().trim().isNotEmpty) return v.toString().trim().toUpperCase();
    }
    // Try extracting from product name (for products missing spec data)
    final name = p.name.toUpperCase();
    final socketPatterns = [
      RegExp(r'\bLGA\s*(\d{3,4})\b'),  // LGA1200, LGA1700, LGA1851
      RegExp(r'\bFCLGA\s*(\d{3,4})\b'), // FCLGA1200
      RegExp(r'\bAM[345]\b'),            // AM3, AM4, AM5
      RegExp(r'\bTRX\d+\b'),             // TRX40, TRX50
      RegExp(r'\bSTRP\d+\b'),            // STRP9
    ];
    for (final pattern in socketPatterns) {
      final m = pattern.firstMatch(name);
      if (m != null) return m.group(0)!.replaceAll(' ', '');
    }
    return null;
  }

  static String? memoryType(ProductEntity p) {
    // Check specific spec keys first for DDR mentions
    for (final key in [
      'Memory Technology', 'memory technology', 'Memory Type', 'RAM Type',
      'Supported Memory Types', 'Memory Standard', 'Bellek Tipi', 'Bellek Teknolojisi',
      'Type', 'Technology', 'Memory', 'Bellek', 'DDR', 'Tip', 'Teknoloji',
      'Memory Kit', 'Kit', 'Standard', 'Standart',
    ]) {
      final v = p.specs[key];
      if (v != null && v.toString().trim().isNotEmpty) {
        final str = v.toString().trim().toUpperCase();
        final matches = RegExp(r'DDR\d').allMatches(str).map((m) => m.group(0)!).toSet();
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
    return null;
  }

  static double? tdp(ProductEntity p) {
    for (final key in [
      'TDP', 'Thermal Design Power (TDP)', 'Power Consumption',
      'Wattage', 'Max Power', 'Güç Tüketimi',
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

  /// Searches all spec values for a query string
  static bool matchesSpecSearch(ProductEntity p, String query) {
    for (final v in p.specs.values) {
      if (v != null && v.toString().toLowerCase().contains(query)) return true;
    }
    return false;
  }

  /// GPU power connector — returns '6-pin','8-pin','12-pin','16-pin' or null
  static String? gpuPowerConnector(ProductEntity p) {
    for (final key in ['Power Connector', 'PCI-E Power', 'Supplementary Power', 'Power Connectors', 'PCIe Power']) {
      final v = p.specs[key]?.toString().toLowerCase();
      if (v != null && v.isNotEmpty) {
        if (v.contains('16') || v.contains('12vhpwr') || v.contains('600')) return '16-pin (12VHPWR)';
        if (v.contains('2x8') || v.contains('8+8') || v.contains('two 8')) return '2×8-pin';
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

  /// Form factor — ATX / mATX / mITX / E-ATX
  static String? formFactor(ProductEntity p) {
    for (final key in ['Form Factor', 'Motherboard Form Factor', 'Case Type', 'Compatible Motherboard Form Factor']) {
      final v = p.specs[key]?.toString().toUpperCase();
      if (v != null && v.isNotEmpty) {
        if (v.contains('E-ATX') || v.contains('EATX') || v.contains('XL-ATX')) return 'E-ATX';
        if (v.contains('MATX') || v.contains('MICRO-ATX') || v.contains('MICRO ATX') || v.contains('M-ATX')) return 'mATX';
        if (v.contains('MINI-ITX') || v.contains('MINI ITX') || v.contains('MITX') || v.contains('ITX')) return 'mITX';
        if (v.contains('ATX')) return 'ATX';
        return v;
      }
    }
    // Infer from name
    final n = p.name.toUpperCase();
    if (n.contains('MINI-ITX') || n.contains('MINI ITX') || n.contains('ITX')) return 'mITX';
    if (n.contains('MATX') || n.contains('MICRO ATX') || n.contains('M-ATX')) return 'mATX';
    if (n.contains('E-ATX') || n.contains('EATX')) return 'E-ATX';
    return null;
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
  static String? pcieVersion(ProductEntity p) {
    for (final key in ['PCI Express', 'PCIe', 'Interface', 'PCI-E']) {
      final v = p.specs[key]?.toString();
      if (v != null && v.isNotEmpty) {
        final m = RegExp(r'PCIe?\s*(\d+\.?\d*)', caseSensitive: false).firstMatch(v);
        if (m != null) return 'PCIe ${m.group(1)}';
      }
    }
    return null;
  }

  /// Max memory speed supported (for MB or CPU)
  static int? maxMemSpeed(ProductEntity p) {
    for (final key in ['Memory Speed', 'Max Memory Speed', 'Memory Frequency', 'Supported Memory Speed', 'Maximum Memory Speed']) {
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

// Animated Progress Ring Painter

class _ProgressRingPainter extends CustomPainter {
  final double progress; // 0.0 - 1.0
  final Color color;
  final Color bgColor;

  _ProgressRingPainter({required this.progress, required this.color, required this.bgColor});

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
      final comp = PcComponent.values.where((c) => c.name == entry.key).firstOrNull;
      if (comp != null) _selected[comp] = entry.value;
    }
    _aiAnalysis = ref.read(pcBuilderAiProvider);
    if (_selected.length == PcComponent.values.length) _showCelebration = true;
    // Preload all PC component categories for faster picking
    // pcBuilderProductsProvider is what the picker watches — preload so list is instant on open
    Future.microtask(() {
      for (final comp in PcComponent.values) {
        ref.read(pcBuilderProductsProvider(comp.categoryId));
      }
    });
  }

  void _saveToSession() {
    ref.read(pcBuilderSessionProvider.notifier).state =
        _selected.map((k, v) => MapEntry(k.name, v));
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
        if (sock.contains('1851')) return 'DDR5';  // LGA1851 = Arrow Lake, DDR5 only
        if (sock.contains('1200')) return 'DDR4';  // LGA1200 = Comet Lake, DDR4 only
        if (sock.contains('1151')) return 'DDR4';  // LGA1151 = Coffee Lake, DDR4 only
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

  String? get _selectedFormFactor {
    final mb = _selected[PcComponent.motherboard];
    if (mb != null) return _Compat.formFactor(mb);
    final cs = _selected[PcComponent.pcCase];
    if (cs != null) return _Compat.formFactor(cs);
    return null;
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
      if (cpuSock != null && mbSock != null && cpuSock != mbSock &&
          !cpuSock.contains(mbSock) && !mbSock.contains(cpuSock)) {
        issues.add(_CompatIssue(
          severity: _IssueSeverity.error,
          icon: Icons.error_rounded,
          title: 'Socket Mismatch',
          detail: 'CPU socket ($cpuSock) ≠ Motherboard socket ($mbSock)',
          component: PcComponent.motherboard,
        ));
      }
    }

    // 2. RAM ↔ Motherboard/CPU memory type
    if (ram != null) {
      final ramType = _Compat.memoryType(ram);
      final required = _selectedMemType;
      if (ramType != null && required != null && ramType != required) {
        issues.add(_CompatIssue(
          severity: _IssueSeverity.error,
          icon: Icons.error_rounded,
          title: 'RAM Type Mismatch',
          detail: 'RAM is $ramType but system requires $required',
          component: PcComponent.ram,
        ));
      }
    }

    // 3. MB ↔ Case form factor
    if (mb != null && cs != null) {
      final mbFf = _Compat.formFactor(mb);
      final csFf = _Compat.formFactor(cs);
      if (!_Compat.formFactorCompatible(mbFf, csFf)) {
        issues.add(_CompatIssue(
          severity: _IssueSeverity.error,
          icon: Icons.error_rounded,
          title: 'Form Factor Mismatch',
          detail: 'Motherboard ($mbFf) won\'t fit in this case ($csFf)',
          component: PcComponent.pcCase,
        ));
      }
    }

    // 4. PSU insufficient
    if (psu != null) {
      final headroom = _psuHeadroom;
      if (headroom != null && headroom < 0) {
        issues.add(_CompatIssue(
          severity: _IssueSeverity.error,
          icon: Icons.bolt_rounded,
          title: 'PSU Insufficient',
          detail: 'System needs ${_estimatedPower.round()}W but PSU provides ${_psuWattage!.round()}W (${headroom.round()}W short)',
          component: PcComponent.psu,
        ));
      } else if (headroom != null && headroom < 100) {
        issues.add(_CompatIssue(
          severity: _IssueSeverity.warning,
          icon: Icons.warning_rounded,
          title: 'PSU Tight',
          detail: 'Only +${headroom.round()}W headroom — consider a higher wattage PSU',
          component: PcComponent.psu,
        ));
      }
    }

    // 5. CPU cooler socket compatibility
    if (cooler != null && cpu != null) {
      final coolerSock = _Compat.socket(cooler);
      final cpuSock = _Compat.socket(cpu);
      if (coolerSock != null && cpuSock != null &&
          !coolerSock.contains(cpuSock) && !cpuSock.contains(coolerSock)) {
        issues.add(_CompatIssue(
          severity: _IssueSeverity.error,
          icon: Icons.air_rounded,
          title: 'Cooler Socket Mismatch',
          detail: 'Cooler supports $coolerSock, CPU needs $cpuSock mounting',
          component: PcComponent.cooler,
        ));
      }
    }

    // 6. GPU power connector warning
    if (gpu != null && psu != null) {
      final gpuConn = _Compat.gpuPowerConnector(gpu);
      if (gpuConn != null && gpuConn.contains('16')) {
        issues.add(_CompatIssue(
          severity: _IssueSeverity.info,
          icon: Icons.power_rounded,
          title: 'GPU Requires 16-pin (12VHPWR)',
          detail: 'This GPU needs the newer 12VHPWR connector. Verify your PSU has it or use an adapter.',
          component: PcComponent.gpu,
        ));
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
            socketFilter: (component == PcComponent.motherboard || component == PcComponent.cooler) ? _selectedSocket : null,
            memTypeFilter: component == PcComponent.ram ? _selectedMemType : null,
            formFactorFilter: (component == PcComponent.pcCase && _selected[PcComponent.motherboard] != null)
                ? _Compat.formFactor(_selected[PcComponent.motherboard]!)
                : (component == PcComponent.motherboard && _selected[PcComponent.pcCase] != null)
                    ? _Compat.formFactor(_selected[PcComponent.pcCase]!)
                    : null,
            allSelected: Map.from(_selected),
            scrollController: scrollController,
          ),
        ),
      ),
    );
    if (result != null && mounted) {
      setState(() => _selected[component] = result);
      _saveToSession();
      if (_selected.length == PcComponent.values.length && !_showCelebration) {
        _showCelebration = true;
        _celebrationController.forward(from: 0);
      }
    }
  }

  void _removeComponent(PcComponent c) {
    setState(() {
      _selected.remove(c);
      _showCelebration = false;
    });
    _saveToSession();
  }

  void _resetAll() {
    setState(() {
      _selected.clear();
      _showCelebration = false;
      _summaryExpanded = false;
      _aiAnalysis = null;
    });
    _saveToSession();
  }

  void _shareBuild() {
    final buf = StringBuffer('🖥️ My PC Build (Compair)\n');
    buf.writeln('═' * 30);
    buf.writeln('Build Score: ${_totalScore.round()}/100');
    buf.writeln('Components: ${_selected.length}/${PcComponent.values.length}');
    buf.writeln('Est. Power Draw: ${_estimatedPower.round()}W');
    if (_psuWattage != null) {
      buf.writeln('PSU: ${_psuWattage!.round()}W (Headroom: ${_psuHeadroom!.round()}W)');
    }
    if (_selectedSocket != null) buf.writeln('Socket: $_selectedSocket');
    if (_selectedMemType != null) buf.writeln('Memory: $_selectedMemType');
    buf.writeln('─' * 30);
    for (final c in PcComponent.values) {
      final p = _selected[c];
      if (p != null) {
        buf.writeln('${c.name.toUpperCase()}: ${p.name} (${p.techScore.round()}/100)');
      } else {
        buf.writeln('${c.name.toUpperCase()}: Not selected');
      }
    }
    buf.writeln('═' * 30);
    buf.writeln('Built with Compair');
    Clipboard.setData(ClipboardData(text: buf.toString()));
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Build copied to clipboard!',
            style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w600)),
          behavior: SnackBarBehavior.floating,
          backgroundColor: AppTheme.success,
          duration: const Duration(seconds: 2),
        ),
      );
    }
  }

  Future<void> _runAiAnalysis() async {
    if (_aiLoading) return;
    setState(() { _aiLoading = true; _aiAnalysis = null; });

    try {
      final buf = StringBuffer();
      buf.writeln('You are an expert PC hardware analyst. Analyze this PC build comprehensively.');
      buf.writeln();
      buf.writeln('=== BUILD COMPONENTS ===');
      for (final c in PcComponent.values) {
        final p = _selected[c];
        if (p != null) {
          buf.writeln('${c.name.toUpperCase()}: ${p.name} (Score: ${p.techScore.round()}/100)');
          final specs = p.specs.entries.take(10).map((e) => '  ${e.key}: ${e.value}').join('\n');
          if (specs.isNotEmpty) buf.writeln(specs);
        }
      }
      buf.writeln();
      buf.writeln('=== SYSTEM METRICS ===');
      buf.writeln('Total estimated power draw: ${_estimatedPower.round()}W');
      if (_psuWattage != null) buf.writeln('PSU capacity: ${_psuWattage!.round()}W (headroom: ${_psuHeadroom!.round()}W)');
      if (_selectedSocket != null) buf.writeln('Platform socket: $_selectedSocket');
      if (_selectedMemType != null) buf.writeln('Memory type: $_selectedMemType');
      final gpuConn = _selected[PcComponent.gpu] != null ? _Compat.gpuPowerConnector(_selected[PcComponent.gpu]!) : null;
      if (gpuConn != null) buf.writeln('GPU power connector: $gpuConn');
      buf.writeln('Build score: ${_totalScore.round()}/100');
      buf.writeln();
      buf.writeln('Respond in this EXACT format (do not add extra text outside sections):');
      buf.writeln();
      buf.writeln('BOTTLENECK: [0-100]% - [component name]: [one sentence explanation]');
      buf.writeln('PERFORMANCE_TIER: [Budget/Mid-Range/High-End/Enthusiast/Ultra]');
      buf.writeln();
      buf.writeln('FPS_1080P:');
      buf.writeln('- Fortnite: [fps] FPS');
      buf.writeln('- CS2: [fps] FPS');
      buf.writeln('- Valorant: [fps] FPS');
      buf.writeln('- GTA V: [fps] FPS');
      buf.writeln('- Cyberpunk 2077: [fps] FPS');
      buf.writeln('- Elden Ring: [fps] FPS');
      buf.writeln('- Apex Legends: [fps] FPS');
      buf.writeln('- COD Warzone: [fps] FPS');
      buf.writeln();
      buf.writeln('FPS_1440P:');
      buf.writeln('- Fortnite: [fps] FPS');
      buf.writeln('- CS2: [fps] FPS');
      buf.writeln('- Valorant: [fps] FPS');
      buf.writeln('- GTA V: [fps] FPS');
      buf.writeln('- Cyberpunk 2077: [fps] FPS');
      buf.writeln('- Elden Ring: [fps] FPS');
      buf.writeln('- Apex Legends: [fps] FPS');
      buf.writeln('- COD Warzone: [fps] FPS');
      buf.writeln();
      buf.writeln('FPS_4K:');
      buf.writeln('- Fortnite: [fps] FPS');
      buf.writeln('- CS2: [fps] FPS');
      buf.writeln('- Valorant: [fps] FPS');
      buf.writeln('- GTA V: [fps] FPS');
      buf.writeln('- Cyberpunk 2077: [fps] FPS');
      buf.writeln('- Elden Ring: [fps] FPS');
      buf.writeln('- Apex Legends: [fps] FPS');
      buf.writeln('- COD Warzone: [fps] FPS');
      buf.writeln();
      buf.writeln('STRENGTHS:');
      buf.writeln('- [strength 1]');
      buf.writeln('- [strength 2]');
      buf.writeln('- [strength 3]');
      buf.writeln();
      buf.writeln('WEAKNESSES:');
      buf.writeln('- [weakness 1]');
      buf.writeln('- [weakness 2]');
      buf.writeln('- [weakness 3]');
      buf.writeln();
      buf.writeln('UPGRADE_PRIORITY: [component name] — [why upgrade it first, 1 sentence]');
      buf.writeln();
      buf.writeln('RECOMMENDATIONS:');
      // Only ask for recommendations on the most expensive / impactful components
      final keyComponents = [PcComponent.cpu, PcComponent.gpu, PcComponent.ram, PcComponent.psu];
      for (final c in keyComponents) {
        final p = _selected[c];
        if (p != null) {
          buf.writeln('- Instead of ${p.name}, consider: [specific product name] — [reason, 1 sentence]');
        }
      }
      buf.writeln();
      buf.writeln('POWER_ANALYSIS: [1 sentence about GPU power connector requirements and PSU adequacy, mention specific connector type if relevant]');

      final geminiService = ref.read(geminiServiceProvider);
      final response = await geminiService.freeTextQuery(buf.toString());

      if (mounted) {
        setState(() { _aiAnalysis = response; _aiLoading = false; });
        _saveToSession();
      }
    } catch (e) {
      if (mounted) {
        setState(() { _aiLoading = false; });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('AI analysis failed: $e'), backgroundColor: AppTheme.rose500),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final sc = _totalScore >= 80 ? AppTheme.success
        : _totalScore >= 60 ? AppTheme.brandBlue
        : _totalScore >= 40 ? AppTheme.amber500 : AppTheme.rose500;
    final cnt = _selected.length;

    return Scaffold(
      backgroundColor: context.backgroundColor,
      body: CustomScrollView(
        slivers: [
          SliverAppBar(
            expandedHeight: 120, pinned: true,
            backgroundColor: context.backgroundColor,
            leading: IconButton(icon: Icon(Icons.arrow_back_rounded, color: context.textPrimary), onPressed: () => context.canPop() ? context.pop() : context.go(AppRoutes.home)),
            actions: [
              if (cnt > 0) TextButton.icon(onPressed: _resetAll,
                icon: const Icon(Icons.restart_alt_rounded, size: 18, color: Color(0xFFEF4444)),
                label: Text(context.l10n?.reset ?? 'Reset', style: GoogleFonts.plusJakartaSans(fontSize: 12, color: const Color(0xFFEF4444), fontWeight: FontWeight.w600))),
            ],
            flexibleSpace: FlexibleSpaceBar(
              titlePadding: const EdgeInsets.only(left: 56, bottom: 16),
              title: ShaderMask(
                shaderCallback: (bounds) => _accentGradient.createShader(bounds),
                child: Text('PC Builder', style: GoogleFonts.plusJakartaSans(fontSize: 20, fontWeight: FontWeight.w800, color: Colors.white)),
              ),
            ),
          ),

          // Score card with animated progress ring
          SliverToBoxAdapter(
            child: Container(
              margin: const EdgeInsets.fromLTRB(16, 4, 16, 12),
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                gradient: LinearGradient(colors: [AppTheme.brandBlue.withValues(alpha: 0.08), AppTheme.brandDeepBlue.withValues(alpha: 0.04)]),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: AppTheme.brandBlue.withValues(alpha: 0.15)),
              ),
              child: Row(children: [
                // Animated progress ring
                SizedBox(
                  width: 62, height: 62,
                  child: Stack(alignment: Alignment.center, children: [
                    CustomPaint(
                      size: const Size(62, 62),
                      painter: _ProgressRingPainter(
                        progress: cnt / PcComponent.values.length,
                        color: sc,
                        bgColor: context.dividerColor,
                      ),
                    ),
                    Container(
                      width: 48, height: 48,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: cnt > 0 ? LinearGradient(colors: [sc, sc.withValues(alpha: 0.6)]) : null,
                        color: cnt > 0 ? null : context.surfaceVariantColor,
                      ),
                      child: Center(child: cnt > 0
                        ? Text(_totalScore.round().toString(), style: GoogleFonts.plusJakartaSans(fontSize: 18, fontWeight: FontWeight.w800, color: Colors.white))
                        : Icon(Icons.computer_rounded, size: 22, color: context.textTertiaryColor)),
                    ),
                  ]),
                ),
                const SizedBox(width: 14),
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(cnt > 0 ? (context.l10n?.buildScore ?? 'Build Score') : (context.l10n?.pcBuilderDesc ?? 'Choose components to build your PC'),
                    style: GoogleFonts.plusJakartaSans(fontSize: 14, fontWeight: FontWeight.w700, color: context.textPrimary)),
                  const SizedBox(height: 4),
                  Text('$cnt / ${PcComponent.values.length} components selected',
                    style: GoogleFonts.plusJakartaSans(fontSize: 11, color: context.textSecondary)),
                  if (_selectedSocket != null || _selectedMemType != null) ...[
                    const SizedBox(height: 3),
                    Text('${_selectedSocket != null ? "Socket: $_selectedSocket" : ""}${_selectedSocket != null && _selectedMemType != null ? " \u00b7 " : ""}${_selectedMemType ?? ""}',
                      style: GoogleFonts.plusJakartaSans(fontSize: 10, color: AppTheme.brandDeepBlue, fontWeight: FontWeight.w600)),
                  ],
                  if (cnt > 0) ...[
                    const SizedBox(height: 6),
                    ClipRRect(borderRadius: BorderRadius.circular(3),
                      child: LinearProgressIndicator(value: cnt / PcComponent.values.length, backgroundColor: context.dividerColor, valueColor: AlwaysStoppedAnimation(sc), minHeight: 3)),
                  ],
                ])),
              ]),
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
                  padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 16),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(colors: [
                      AppTheme.success.withValues(alpha: 0.15),
                      AppTheme.brandBlue.withValues(alpha: 0.1),
                    ]),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: AppTheme.success.withValues(alpha: 0.3)),
                  ),
                  child: Row(children: [
                    const Text('🎉', style: TextStyle(fontSize: 24)),
                    const SizedBox(width: 12),
                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('Build Complete!', style: GoogleFonts.plusJakartaSans(fontSize: 15, fontWeight: FontWeight.w800, color: AppTheme.success)),
                      const SizedBox(height: 2),
                      Text('All ${PcComponent.values.length} components selected. Score: ${_totalScore.round()}/100',
                        style: GoogleFonts.plusJakartaSans(fontSize: 11, color: context.textSecondary)),
                    ])),
                  ]),
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
            sliver: SliverList(delegate: SliverChildListDelegate([
              // Core section header
              _buildSectionHeader(context, Icons.memory_rounded, 'Core Components', '${[PcComponent.cpu, PcComponent.motherboard, PcComponent.ram, PcComponent.gpu, PcComponent.storage].where((c) => _selected.containsKey(c)).length}/5'),
              ..._buildComponentGroup(context, [PcComponent.cpu, PcComponent.motherboard, PcComponent.ram, PcComponent.gpu, PcComponent.storage]),
              const SizedBox(height: 12),
              // Cooling & Power
              _buildSectionHeader(context, Icons.bolt_rounded, 'Power & Cooling', '${[PcComponent.psu, PcComponent.cooler, PcComponent.pcCase].where((c) => _selected.containsKey(c)).length}/3'),
              ..._buildComponentGroup(context, [PcComponent.psu, PcComponent.cooler, PcComponent.pcCase]),
              const SizedBox(height: 12),
              // Peripherals
              _buildSectionHeader(context, Icons.devices_rounded, 'Peripherals', '${[PcComponent.monitor, PcComponent.keyboard, PcComponent.mouse, PcComponent.headset].where((c) => _selected.containsKey(c)).length}/4'),
              ..._buildComponentGroup(context, [PcComponent.monitor, PcComponent.keyboard, PcComponent.mouse, PcComponent.headset]),
            ])),
          ),

          // Build Summary Card
          if (_selected.isNotEmpty)
            SliverToBoxAdapter(child: _buildSummaryCard(context, sc, cnt)),

          // AI Build Analysis
          if (_selected.length >= 5)
            SliverToBoxAdapter(child: _buildAiSection(context)),

          SliverToBoxAdapter(child: SizedBox(height: MediaQuery.of(context).padding.bottom + 100)),
        ],
      ),
    );
  }

  Widget _buildSectionHeader(BuildContext context, IconData icon, String title, String count) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8, top: 4),
      child: Row(children: [
        Container(
          width: 28, height: 28,
          decoration: BoxDecoration(
            gradient: _accentGradient,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Icon(icon, size: 14, color: Colors.white),
        ),
        const SizedBox(width: 10),
        Text(title, style: GoogleFonts.plusJakartaSans(fontSize: 13, fontWeight: FontWeight.w700, color: context.textPrimary)),
        const Spacer(),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
          decoration: BoxDecoration(
            color: AppTheme.brandBlue.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Text(count, style: GoogleFonts.plusJakartaSans(fontSize: 11, fontWeight: FontWeight.w600, color: AppTheme.brandBlue)),
        ),
      ]),
    );
  }

  List<Widget> _buildComponentGroup(BuildContext context, List<PcComponent> components) {
    return components.map((c) {
      final p = _selected[c];
      String? note;
      if (c == PcComponent.motherboard && _selectedSocket != null) note = 'Socket: $_selectedSocket';
      if (c == PcComponent.ram && _selectedMemType != null) note = _selectedMemType;
      if (c == PcComponent.cooler && _selectedSocket != null) note = 'Socket: $_selectedSocket';
      return _ComponentRow(component: c, selectedProduct: p, onChoose: () => _openPicker(c), onRemove: p != null ? () => _removeComponent(c) : null, compatNote: note);
    }).toList();
  }

  Widget _buildAiSection(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      decoration: BoxDecoration(
        gradient: LinearGradient(colors: [
          AppTheme.brandDeepBlue.withValues(alpha: 0.08),
          const Color(0xFF3B82F6).withValues(alpha: 0.04),
        ]),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.brandDeepBlue.withValues(alpha: 0.2)),
      ),
      child: Column(children: [
        InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: _aiLoading ? null : _runAiAnalysis,
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(children: [
              Container(
                width: 36, height: 36,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(colors: [AppTheme.brandDeepBlue, AppTheme.brandCyan]),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: _aiLoading
                  ? const Padding(padding: EdgeInsets.all(8), child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Icon(Icons.auto_awesome_rounded, size: 18, color: Colors.white),
              ),
              const SizedBox(width: 12),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('AI Build Analysis', style: GoogleFonts.plusJakartaSans(
                  fontSize: 14, fontWeight: FontWeight.w700, color: context.textPrimary)),
                Text(_aiAnalysis != null ? 'Tap to refresh' : 'Bottleneck \u00b7 FPS \u00b7 Performance',
                  style: GoogleFonts.plusJakartaSans(fontSize: 10, color: context.textSecondary)),
              ])),
              if (!_aiLoading && _aiAnalysis == null)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(colors: [AppTheme.brandDeepBlue, AppTheme.brandCyan]),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text('Analyze', style: GoogleFonts.plusJakartaSans(
                    fontSize: 11, fontWeight: FontWeight.w700, color: Colors.white)),
                ),
            ]),
          ),
        ),
        if (_aiAnalysis != null) ...[
          Divider(height: 1, color: context.dividerColor),
          Padding(
            padding: const EdgeInsets.all(14),
            child: _buildAnalysisContent(context, _aiAnalysis!),
          ),
        ],
      ]),
    );
  }

  Widget _buildAnalysisContent(BuildContext context, String analysis) {
    final sections = <Widget>[];

    // Helper: parse bullet lines from a section
    List<String> parseBullets(String text) =>
        text.trim().split('\n').where((l) => l.trim().startsWith('-')).map((l) => l.trim().replaceFirst(RegExp(r'^-\s*'), '')).toList();

    // Helper: parse FPS lines into a list of (game, fps) pairs
    List<(String, int)> parseFpsLines(String text) {
      final lines = text.trim().split('\n').where((l) => l.trim().startsWith('-')).toList();
      return lines.map((line) {
        final cleaned = line.trim().replaceFirst(RegExp(r'^-\s*'), '');
        final fpsMatch = RegExp(r'(\d+)\s*FPS', caseSensitive: false).firstMatch(cleaned);
        final fps = fpsMatch != null ? int.tryParse(fpsMatch.group(1)!) ?? 0 : 0;
        final gameName = cleaned.split(':').first.trim();
        return (gameName, fps);
      }).toList();
    }

    // ── Bottleneck ──────────────────────────────────────────────────────────
    final bottleneckMatch = RegExp(r'BOTTLENECK:\s*(.+)', caseSensitive: false).firstMatch(analysis);
    if (bottleneckMatch != null) {
      final bottleneckText = bottleneckMatch.group(1)!.trim();
      final pctMatch = RegExp(r'(\d+)%').firstMatch(bottleneckText);
      final pct = pctMatch != null ? int.tryParse(pctMatch.group(1)!) ?? 0 : 0;
      final bottleneckColor = pct <= 10 ? AppTheme.success : pct <= 25 ? AppTheme.amber500 : AppTheme.rose500;
      final label = pct <= 10 ? 'Excellent' : pct <= 25 ? 'Moderate' : 'Significant';

      sections.add(Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: bottleneckColor.withValues(alpha: 0.06),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: bottleneckColor.withValues(alpha: 0.2)),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Icon(Icons.monitor_heart_rounded, size: 15, color: bottleneckColor),
            const SizedBox(width: 6),
            Text('Bottleneck Analysis', style: GoogleFonts.plusJakartaSans(fontSize: 12, fontWeight: FontWeight.w700, color: bottleneckColor)),
            const Spacer(),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(color: bottleneckColor.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(6)),
              child: Text('$pct% · $label', style: GoogleFonts.plusJakartaSans(fontSize: 10, fontWeight: FontWeight.w800, color: bottleneckColor)),
            ),
          ]),
          const SizedBox(height: 8),
          Stack(children: [
            ClipRRect(borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(value: pct / 100, minHeight: 10, backgroundColor: context.dividerColor, color: bottleneckColor)),
          ]),
          const SizedBox(height: 6),
          Text(bottleneckText.replaceAll(RegExp(r'^\d+%\s*[-—]\s*'), ''), style: GoogleFonts.plusJakartaSans(fontSize: 11, color: context.textSecondary, height: 1.4)),
        ]),
      ));
    }

    // ── Performance Tier ─────────────────────────────────────────────────────
    final tierMatch = RegExp(r'PERFORMANCE_TIER:\s*(.+)', caseSensitive: false).firstMatch(analysis);
    if (tierMatch != null) {
      final tier = tierMatch.group(1)!.trim();
      final tierColor = (tier.contains('Ultra') || tier.contains('Enthusiast')) ? AppTheme.success
          : tier.contains('High') ? AppTheme.brandBlue
          : tier.contains('Mid') ? AppTheme.amber500 : AppTheme.rose500;
      final tierEmoji = (tier.contains('Ultra') || tier.contains('Enthusiast')) ? '🏆'
          : tier.contains('High') ? '🎮' : tier.contains('Mid') ? '⚡' : '🌱';
      sections.add(Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          gradient: LinearGradient(colors: [tierColor.withValues(alpha: 0.1), tierColor.withValues(alpha: 0.03)]),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: tierColor.withValues(alpha: 0.25)),
        ),
        child: Row(children: [
          Text(tierEmoji, style: const TextStyle(fontSize: 18)),
          const SizedBox(width: 10),
          Text('Performance Tier', style: GoogleFonts.plusJakartaSans(fontSize: 12, color: context.textSecondary)),
          const Spacer(),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(color: tierColor.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(8)),
            child: Text(tier, style: GoogleFonts.plusJakartaSans(fontSize: 12, fontWeight: FontWeight.w800, color: tierColor)),
          ),
        ]),
      ));
    }

    // ── FPS by Resolution (tabbed) ────────────────────────────────────────────
    final fps1080 = RegExp(r'FPS_1080P:(.*?)(?=FPS_1440P:|FPS_4K:|STRENGTHS:|WEAKNESSES:|$)', caseSensitive: false, dotAll: true).firstMatch(analysis);
    final fps1440 = RegExp(r'FPS_1440P:(.*?)(?=FPS_4K:|STRENGTHS:|WEAKNESSES:|$)', caseSensitive: false, dotAll: true).firstMatch(analysis);
    final fps4k = RegExp(r'FPS_4K:(.*?)(?=STRENGTHS:|WEAKNESSES:|UPGRADE_PRIORITY:|$)', caseSensitive: false, dotAll: true).firstMatch(analysis);

    if (fps1080 != null || fps1440 != null || fps4k != null) {
      final data1080 = fps1080 != null ? parseFpsLines(fps1080.group(1)!) : <(String, int)>[];
      final data1440 = fps1440 != null ? parseFpsLines(fps1440.group(1)!) : <(String, int)>[];
      final data4k = fps4k != null ? parseFpsLines(fps4k.group(1)!) : <(String, int)>[];
      sections.add(_buildFpsTabPanel(data1080: data1080, data1440: data1440, data4k: data4k));
    }

    // ── Strengths ─────────────────────────────────────────────────────────────
    final strengthsMatch = RegExp(r'STRENGTHS:(.*?)(?=WEAKNESSES:|UPGRADE_PRIORITY:|RECOMMENDATIONS:|POWER_ANALYSIS:|$)', caseSensitive: false, dotAll: true).firstMatch(analysis);
    if (strengthsMatch != null) {
      final items = parseBullets(strengthsMatch.group(1)!);
      if (items.isNotEmpty) sections.add(_bulletSection(context, '💪 Strengths', items, AppTheme.success));
    }

    // ── Weaknesses ────────────────────────────────────────────────────────────
    final weaknessMatch = RegExp(r'WEAKNESSES:(.*?)(?=UPGRADE_PRIORITY:|RECOMMENDATIONS:|POWER_ANALYSIS:|$)', caseSensitive: false, dotAll: true).firstMatch(analysis);
    if (weaknessMatch != null) {
      final items = parseBullets(weaknessMatch.group(1)!);
      if (items.isNotEmpty) sections.add(_bulletSection(context, '⚠️ Weaknesses', items, AppTheme.amber500));
    }

    // ── Upgrade Priority ──────────────────────────────────────────────────────
    final upgradeMatch = RegExp(r'UPGRADE_PRIORITY:\s*(.+)', caseSensitive: false).firstMatch(analysis);
    if (upgradeMatch != null) {
      final upgradeText = upgradeMatch.group(1)!.trim();
      sections.add(Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppTheme.brandDeepBlue.withValues(alpha: 0.06),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: AppTheme.brandDeepBlue.withValues(alpha: 0.15)),
        ),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('🎯', style: TextStyle(fontSize: 16)),
          const SizedBox(width: 8),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Upgrade Priority', style: GoogleFonts.plusJakartaSans(fontSize: 11, fontWeight: FontWeight.w700, color: AppTheme.brandDeepBlue)),
            const SizedBox(height: 3),
            Text(upgradeText, style: GoogleFonts.plusJakartaSans(fontSize: 11, color: context.textSecondary, height: 1.4)),
          ])),
        ]),
      ));
    }

    // ── Recommendations ───────────────────────────────────────────────────────
    final recsMatch = RegExp(r'RECOMMENDATIONS:(.*?)(?=POWER_ANALYSIS:|$)', caseSensitive: false, dotAll: true).firstMatch(analysis);
    if (recsMatch != null) {
      final recItems = parseBullets(recsMatch.group(1)!);
      if (recItems.isNotEmpty) {
        sections.add(Container(
          margin: const EdgeInsets.only(bottom: 10),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: AppTheme.brandCyan.withValues(alpha: 0.05),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppTheme.brandCyan.withValues(alpha: 0.2)),
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Icon(Icons.auto_awesome_rounded, size: 14, color: AppTheme.brandCyan),
              const SizedBox(width: 6),
              Text('AI Recommendations', style: GoogleFonts.plusJakartaSans(fontSize: 12, fontWeight: FontWeight.w700, color: AppTheme.brandCyan)),
            ]),
            const SizedBox(height: 8),
            ...recItems.map((item) => Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Container(
                  margin: const EdgeInsets.only(top: 3),
                  width: 6, height: 6,
                  decoration: BoxDecoration(shape: BoxShape.circle, color: AppTheme.brandCyan),
                ),
                const SizedBox(width: 8),
                Expanded(child: Text(item, style: GoogleFonts.plusJakartaSans(fontSize: 10, color: context.textSecondary, height: 1.4))),
              ]),
            )),
          ]),
        ));
      }
    }

    // ── Power Analysis ────────────────────────────────────────────────────────
    final powerMatch = RegExp(r'POWER_ANALYSIS:\s*(.+)', caseSensitive: false).firstMatch(analysis);
    if (powerMatch != null) {
      final powerText = powerMatch.group(1)!.trim();
      sections.add(Container(
        margin: const EdgeInsets.only(bottom: 4),
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: PcComponent.psu.accentColor.withValues(alpha: 0.07),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: PcComponent.psu.accentColor.withValues(alpha: 0.2)),
        ),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(Icons.bolt_rounded, size: 16, color: PcComponent.psu.accentColor),
          const SizedBox(width: 8),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Power Analysis', style: GoogleFonts.plusJakartaSans(fontSize: 11, fontWeight: FontWeight.w700, color: PcComponent.psu.accentColor)),
            const SizedBox(height: 2),
            Text(powerText, style: GoogleFonts.plusJakartaSans(fontSize: 10, color: context.textSecondary, height: 1.4)),
          ])),
        ]),
      ));
    }

    if (sections.isEmpty) {
      return SelectableText(analysis, style: GoogleFonts.plusJakartaSans(fontSize: 12, color: context.textPrimary, height: 1.5));
    }

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: sections);
  }

  Widget _buildFpsTabPanel({
    required List<(String, int)> data1080,
    required List<(String, int)> data1440,
    required List<(String, int)> data4k,
  }) {
    return _FpsTabWidget(data1080: data1080, data1440: data1440, data4k: data4k);
  }

  Widget _bulletSection(BuildContext context, String title, List<String> items, Color color) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(title, style: GoogleFonts.plusJakartaSans(fontSize: 12, fontWeight: FontWeight.w700, color: color)),
        const SizedBox(height: 4),
        ...items.map((item) => Padding(
          padding: const EdgeInsets.only(bottom: 3),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('\u2022 ', style: GoogleFonts.plusJakartaSans(fontSize: 10, color: color)),
            Expanded(child: Text(item, style: GoogleFonts.plusJakartaSans(fontSize: 10, color: context.textSecondary, height: 1.3))),
          ]),
        )),
      ]),
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
            child: Row(children: [
              Icon(hasErrors ? Icons.error_rounded : Icons.warning_rounded, size: 16, color: panelColor),
              const SizedBox(width: 6),
              Text(
                hasErrors ? '${issues.where((i) => i.severity == _IssueSeverity.error).length} Compatibility Error(s)' : 'Compatibility Warnings',
                style: GoogleFonts.plusJakartaSans(fontSize: 12, fontWeight: FontWeight.w700, color: panelColor),
              ),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                decoration: BoxDecoration(color: panelColor.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(6)),
                child: Text('${issues.length}', style: GoogleFonts.plusJakartaSans(fontSize: 11, fontWeight: FontWeight.w800, color: panelColor)),
              ),
            ]),
          ),
          ...issues.map((issue) => Container(
            margin: const EdgeInsets.fromLTRB(12, 0, 12, 8),
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: issue.color.withValues(alpha: 0.06),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: issue.color.withValues(alpha: 0.2)),
            ),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Icon(issue.icon, size: 14, color: issue.color),
              const SizedBox(width: 8),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(issue.title, style: GoogleFonts.plusJakartaSans(fontSize: 11, fontWeight: FontWeight.w700, color: issue.color)),
                const SizedBox(height: 2),
                Text(issue.detail, style: GoogleFonts.plusJakartaSans(fontSize: 10, color: context.textSecondary, height: 1.3)),
              ])),
            ]),
          )),
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
      statusText = 'Select a PSU to check power';
      statusIcon = Icons.info_outline_rounded;
    } else if (headroom! < 0) {
      statusColor = AppTheme.rose500;
      statusText = 'PSU insufficient! ${headroom.round()}W short';
      statusIcon = Icons.error_rounded;
    } else if (headroom < 100) {
      statusColor = AppTheme.amber500;
      statusText = 'PSU adequate (+${headroom.round()}W headroom)';
      statusIcon = Icons.warning_rounded;
    } else {
      statusColor = AppTheme.success;
      statusText = 'PSU plenty (+${headroom.round()}W headroom)';
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
      child: Row(children: [
        Icon(Icons.bolt_rounded, size: 20, color: PcComponent.psu.accentColor),
        const SizedBox(width: 10),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Est. Power: ${power.round()}W${psuW != null ? " / ${psuW.round()}W PSU" : ""}',
            style: GoogleFonts.plusJakartaSans(fontSize: 12, fontWeight: FontWeight.w700, color: context.textPrimary)),
          const SizedBox(height: 3),
          Row(children: [
            Icon(statusIcon, size: 13, color: statusColor),
            const SizedBox(width: 4),
            Flexible(child: Text(statusText,
              style: GoogleFonts.plusJakartaSans(fontSize: 10, color: statusColor, fontWeight: FontWeight.w600))),
          ]),
        ])),
        if (psuW != null) ...[
          const SizedBox(width: 8),
          SizedBox(
            width: 36, height: 36,
            child: Stack(alignment: Alignment.center, children: [
              CircularProgressIndicator(
                value: (power / psuW).clamp(0.0, 1.0),
                strokeWidth: 3,
                backgroundColor: context.dividerColor,
                valueColor: AlwaysStoppedAnimation(statusColor),
              ),
              Text('${((power / psuW) * 100).round()}%',
                style: GoogleFonts.plusJakartaSans(fontSize: 8, fontWeight: FontWeight.w700, color: statusColor)),
            ]),
          ),
        ],
      ]),
    );
  }

  Widget _buildSummaryCard(BuildContext context, Color sc, int cnt) {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      decoration: BoxDecoration(
        gradient: LinearGradient(colors: [
          context.surfaceVariantColor,
          context.surfaceVariantColor.withValues(alpha: 0.8),
        ]),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: context.dividerColor),
      ),
      child: Column(children: [
        // Header (always visible)
        InkWell(
          borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
          onTap: () => setState(() => _summaryExpanded = !_summaryExpanded),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(children: [
              Icon(Icons.summarize_rounded, size: 18, color: AppTheme.brandDeepBlue),
              const SizedBox(width: 10),
              Expanded(child: Text('Build Summary',
                style: GoogleFonts.plusJakartaSans(fontSize: 14, fontWeight: FontWeight.w700, color: context.textPrimary))),
              Icon(
                _summaryExpanded ? Icons.expand_less_rounded : Icons.expand_more_rounded,
                size: 20, color: context.textTertiaryColor,
              ),
            ]),
          ),
        ),
        // Expandable body
        AnimatedCrossFade(
          firstChild: const SizedBox.shrink(),
          secondChild: Padding(
            padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Divider(height: 1, color: context.dividerColor),
              const SizedBox(height: 12),
              // Stats grid
              Wrap(spacing: 12, runSpacing: 8, children: [
                _summaryChip(context, 'Components', '$cnt/${PcComponent.values.length}', sc),
                _summaryChip(context, 'Build Score', '${_totalScore.round()}/100', sc),
                _summaryChip(context, 'Est. Power', '${_estimatedPower.round()}W', PcComponent.psu.accentColor),
                if (_psuHeadroom != null)
                  _summaryChip(context, 'PSU Headroom',
                    '${_psuHeadroom! >= 0 ? "+" : ""}${_psuHeadroom!.round()}W',
                    _psuHeadroom! >= 100 ? AppTheme.success : _psuHeadroom! >= 0 ? AppTheme.amber500 : AppTheme.rose500),
                if (_totalPrice > 0)
                  _summaryChip(context, 'Est. Price', '\$${_totalPrice.round()}', AppTheme.brandBlue),
              ]),
              if (_selectedSocket != null || _selectedMemType != null) ...[
                const SizedBox(height: 10),
                if (_selectedSocket != null)
                  _summaryInfoRow(context, Icons.memory_rounded, 'Socket', _selectedSocket!, PcComponent.cpu.accentColor),
                if (_selectedMemType != null)
                  _summaryInfoRow(context, Icons.sd_storage_rounded, 'Memory', _selectedMemType!, PcComponent.ram.accentColor),
              ],
              const SizedBox(height: 14),
              // Component list
              ...PcComponent.values.map((c) {
                final p = _selected[c];
                return Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: Row(children: [
                    Icon(c.icon, size: 12, color: c.accentColor),
                    const SizedBox(width: 6),
                    SizedBox(width: 72, child: Text(c.name.toUpperCase(),
                      style: GoogleFonts.plusJakartaSans(fontSize: 9, fontWeight: FontWeight.w700, color: c.accentColor))),
                    Expanded(child: Text(
                      p != null ? p.name : 'Not selected',
                      maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 10,
                        color: p != null ? context.textPrimary : context.textTertiaryColor,
                        fontStyle: p != null ? FontStyle.normal : FontStyle.italic,
                      ),
                    )),
                    if (p != null) Text('${p.techScore.round()}',
                      style: GoogleFonts.plusJakartaSans(fontSize: 10, fontWeight: FontWeight.w700,
                        color: p.techScore >= 80 ? AppTheme.success : p.techScore >= 60 ? AppTheme.brandBlue : AppTheme.amber500)),
                  ]),
                );
              }),
              const SizedBox(height: 12),
              // Action buttons
              Row(children: [
                Expanded(child: GestureDetector(
                  onTap: _shareBuild,
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    decoration: BoxDecoration(
                      gradient: _accentGradient,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                      const Icon(Icons.share_rounded, size: 14, color: Colors.white),
                      const SizedBox(width: 6),
                      Text('Share Build', style: GoogleFonts.plusJakartaSans(fontSize: 12, fontWeight: FontWeight.w700, color: Colors.white)),
                    ]),
                  ),
                )),
                const SizedBox(width: 10),
                Expanded(child: GestureDetector(
                  onTap: _resetAll,
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    decoration: BoxDecoration(
                      color: AppTheme.rose500.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: AppTheme.rose500.withValues(alpha: 0.3)),
                    ),
                    child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                      const Icon(Icons.restart_alt_rounded, size: 14, color: AppTheme.rose500),
                      const SizedBox(width: 6),
                      Text('Reset', style: GoogleFonts.plusJakartaSans(fontSize: 12, fontWeight: FontWeight.w700, color: AppTheme.rose500)),
                    ]),
                  ),
                )),
              ]),
            ]),
          ),
          crossFadeState: _summaryExpanded ? CrossFadeState.showSecond : CrossFadeState.showFirst,
          duration: const Duration(milliseconds: 250),
        ),
      ]),
    );
  }

  Widget _summaryChip(BuildContext context, String label, String value, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: color.withValues(alpha: 0.2)),
      ),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Text(value, style: GoogleFonts.plusJakartaSans(fontSize: 13, fontWeight: FontWeight.w800, color: color)),
        Text(label, style: GoogleFonts.plusJakartaSans(fontSize: 9, color: context.textTertiaryColor)),
      ]),
    );
  }

  Widget _summaryInfoRow(BuildContext context, IconData icon, String label, String value, Color color) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(children: [
        Icon(icon, size: 13, color: color),
        const SizedBox(width: 6),
        Text('$label: ', style: GoogleFonts.plusJakartaSans(fontSize: 11, color: context.textTertiaryColor)),
        Text(value, style: GoogleFonts.plusJakartaSans(fontSize: 11, fontWeight: FontWeight.w700, color: color)),
      ]),
    );
  }
}

// FPS Tab Panel — animated bars, 1080p / 1440p / 4K tabs

class _FpsTabWidget extends StatefulWidget {
  final List<(String, int)> data1080;
  final List<(String, int)> data1440;
  final List<(String, int)> data4k;
  const _FpsTabWidget({required this.data1080, required this.data1440, required this.data4k});

  @override
  State<_FpsTabWidget> createState() => _FpsTabWidgetState();
}

class _FpsTabWidgetState extends State<_FpsTabWidget> with SingleTickerProviderStateMixin {
  int _tab = 0; // 0=1080p, 1=1440p, 2=4K
  late AnimationController _animCtrl;
  late Animation<double> _anim;

  @override
  void initState() {
    super.initState();
    _animCtrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 600));
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

  List<(String, int)> get _current => [widget.data1080, widget.data1440, widget.data4k][_tab];

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
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        // Header + tabs
        Row(children: [
          Icon(Icons.videogame_asset_rounded, size: 15, color: AppTheme.brandBlue),
          const SizedBox(width: 6),
          Text('Estimated FPS', style: GoogleFonts.plusJakartaSans(fontSize: 12, fontWeight: FontWeight.w700, color: AppTheme.brandBlue)),
          const Spacer(),
          Container(
            padding: const EdgeInsets.all(2),
            decoration: BoxDecoration(
              color: AppTheme.brandBlue.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(mainAxisSize: MainAxisSize.min, children: List.generate(3, (i) {
              final sel = _tab == i;
              return GestureDetector(
                onTap: () => _switchTab(i),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: sel ? AppTheme.brandBlue : Colors.transparent,
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(tabs[i], style: GoogleFonts.plusJakartaSans(
                    fontSize: 10, fontWeight: FontWeight.w700,
                    color: sel ? Colors.white : AppTheme.brandBlue.withValues(alpha: 0.6))),
                ),
              );
            })),
          ),
        ]),
        const SizedBox(height: 10),
        // FPS bars (animated)
        AnimatedBuilder(
          animation: _anim,
          builder: (context, _) {
            final rows = _current;
            if (rows.isEmpty) return Text('No data', style: GoogleFonts.plusJakartaSans(fontSize: 11, color: context.textTertiaryColor));
            return Column(children: rows.map((entry) {
              final gameName = entry.$1;
              final fps = entry.$2;
              final fpsColor = fps >= 144 ? AppTheme.success : fps >= 60 ? AppTheme.brandBlue : fps >= 30 ? AppTheme.amber500 : AppTheme.rose500;
              final barVal = ((fps / 240) * _anim.value).clamp(0.0, 1.0);
              return Padding(
                padding: const EdgeInsets.only(bottom: 7),
                child: Row(children: [
                  SizedBox(width: 88, child: Text(gameName, maxLines: 1, overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.plusJakartaSans(fontSize: 10, color: context.textSecondary))),
                  Expanded(child: ClipRRect(borderRadius: BorderRadius.circular(4),
                    child: LinearProgressIndicator(value: barVal, minHeight: 8, backgroundColor: context.dividerColor,
                      valueColor: AlwaysStoppedAnimation(fpsColor)))),
                  const SizedBox(width: 8),
                  SizedBox(width: 54, child: Text('$fps FPS', textAlign: TextAlign.end,
                    style: GoogleFonts.plusJakartaSans(fontSize: 10, fontWeight: FontWeight.w800, color: fpsColor))),
                ]),
              );
            }).toList());
          },
        ),
        // Legend
        const SizedBox(height: 4),
        Row(children: [
          _dot(AppTheme.success), const SizedBox(width: 3),
          Text('144+', style: GoogleFonts.plusJakartaSans(fontSize: 9, color: context.textTertiaryColor)),
          const SizedBox(width: 8),
          _dot(AppTheme.brandBlue), const SizedBox(width: 3),
          Text('60+', style: GoogleFonts.plusJakartaSans(fontSize: 9, color: context.textTertiaryColor)),
          const SizedBox(width: 8),
          _dot(AppTheme.amber500), const SizedBox(width: 3),
          Text('30+', style: GoogleFonts.plusJakartaSans(fontSize: 9, color: context.textTertiaryColor)),
          const SizedBox(width: 8),
          _dot(AppTheme.rose500), const SizedBox(width: 3),
          Text('<30', style: GoogleFonts.plusJakartaSans(fontSize: 9, color: context.textTertiaryColor)),
        ]),
      ]),
    );
  }

  Widget _dot(Color c) => Container(width: 7, height: 7, decoration: BoxDecoration(shape: BoxShape.circle, color: c));
}

// Component Row with gradient header

class _ComponentRow extends StatelessWidget {
  final PcComponent component;
  final ProductEntity? selectedProduct;
  final VoidCallback onChoose;
  final VoidCallback? onRemove;
  final String? compatNote;
  const _ComponentRow({required this.component, this.selectedProduct, required this.onChoose, this.onRemove, this.compatNote});

  @override
  Widget build(BuildContext context) {
    final has = selectedProduct != null;
    final accent = component.accentColor;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        gradient: has ? LinearGradient(
          colors: [accent.withValues(alpha: 0.06), Colors.transparent],
          begin: Alignment.centerLeft, end: Alignment.centerRight,
        ) : null,
        color: has ? null : context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: has ? accent.withValues(alpha: 0.3) : context.dividerColor),
      ),
      child: Material(color: Colors.transparent, child: InkWell(borderRadius: BorderRadius.circular(16), onTap: onChoose,
        child: Padding(padding: const EdgeInsets.all(12), child: Row(children: [
          Container(width: 42, height: 42,
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [accent.withValues(alpha: 0.18), accent.withValues(alpha: 0.08)],
                begin: Alignment.topLeft, end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(component.icon, size: 20, color: accent)),
          const SizedBox(width: 12),
          Expanded(child: has ? _sel(context) : _empty(context)),
          if (has) ...[
            _badge(selectedProduct!.techScore),
            const SizedBox(width: 8),
            GestureDetector(onTap: onRemove, child: Container(width: 30, height: 30,
              decoration: BoxDecoration(color: AppTheme.rose500.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(8)),
              child: const Icon(Icons.close_rounded, size: 14, color: AppTheme.rose500))),
          ] else
            Container(padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
              decoration: BoxDecoration(gradient: _accentGradient, borderRadius: BorderRadius.circular(10)),
              child: Text(context.l10n?.choose ?? 'Choose', style: GoogleFonts.plusJakartaSans(fontSize: 11, fontWeight: FontWeight.w700, color: Colors.white))),
        ])))),
    );
  }

  Widget _empty(BuildContext context) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
    Text(component.label(context), style: GoogleFonts.plusJakartaSans(fontSize: 13, fontWeight: FontWeight.w600, color: context.textPrimary)),
    const SizedBox(height: 2),
    if (compatNote != null) Text('\u26a1 $compatNote', style: GoogleFonts.plusJakartaSans(fontSize: 10, color: AppTheme.brandDeepBlue, fontWeight: FontWeight.w500))
    else Text(context.l10n?.tapToChoose ?? 'Tap to choose', style: GoogleFonts.plusJakartaSans(fontSize: 10, color: context.textTertiaryColor)),
  ]);

  Widget _sel(BuildContext context) {
    final p = selectedProduct!;
    return Row(children: [
      ClipRRect(borderRadius: BorderRadius.circular(8), child: SizedBox(width: 38, height: 38,
        child: p.imageUrl != null && p.imageUrl!.isNotEmpty
          ? CachedNetworkImage(imageUrl: p.imageUrl!, fit: BoxFit.contain, errorWidget: (_, __, ___) => Icon(component.icon, size: 18, color: context.textTertiaryColor))
          : Icon(component.icon, size: 18, color: context.textTertiaryColor))),
      const SizedBox(width: 10),
      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(p.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: GoogleFonts.plusJakartaSans(fontSize: 12, fontWeight: FontWeight.w600, color: context.textPrimary)),
        if (p.brand != null && p.brand!.isNotEmpty) Text(p.brand!, style: GoogleFonts.plusJakartaSans(fontSize: 10, color: component.accentColor, fontWeight: FontWeight.w500)),
      ])),
    ]);
  }

  Widget _badge(double score) {
    final c = score >= 80 ? AppTheme.success : score >= 60 ? AppTheme.brandBlue : score >= 40 ? AppTheme.amber500 : AppTheme.rose500;
    return Container(padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(color: c.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(8), border: Border.all(color: c.withValues(alpha: 0.3))),
      child: Text(score.round().toString(), style: GoogleFonts.plusJakartaSans(fontSize: 11, fontWeight: FontWeight.w700, color: c)));
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
  ConsumerState<_ComponentPickerPage> createState() => _ComponentPickerPageState();
}

class _ComponentPickerPageState extends ConsumerState<_ComponentPickerPage> {
  String _search = '';
  String _sort = 'score';
  final Set<String> _brands = {};
  bool _showFilters = false;
  bool _compatOnly = true;

  List<ProductEntity> _applyFilters(List<ProductEntity> all) {
    var list = List<ProductEntity>.from(all);
    // Compat — socket filter for MB and cooler (lenient: unknown socket = included with lower priority)
    if (_compatOnly && widget.socketFilter != null && (widget.component == PcComponent.motherboard || widget.component == PcComponent.cooler)) {
      final t = widget.socketFilter!.toUpperCase();
      list = list.where((p) {
        final s = _Compat.socket(p);
        if (s == null) return true; // no socket info → cannot verify → include (might be compatible)
        return s.contains(t) || t.contains(s);
      }).toList();
    }
    // Compat — memory type filter for RAM (lenient: unknown mem type = included)
    if (_compatOnly && widget.memTypeFilter != null && widget.component == PcComponent.ram) {
      final t = widget.memTypeFilter!.toUpperCase();
      list = list.where((p) {
        final m = _Compat.memoryType(p);
        if (m == null) return true; // no memory type info → cannot verify → include
        return m.contains(t) || t.contains(m);
      }).toList();
    }
    // Compat — form factor filter for Case (must fit MB) or MB (must fit in Case)
    if (_compatOnly && widget.formFactorFilter != null &&
        (widget.component == PcComponent.pcCase || widget.component == PcComponent.motherboard)) {
      list = list.where((p) {
        final ff = _Compat.formFactor(p);
        if (ff == null) return true; // unknown → allow
        if (widget.component == PcComponent.pcCase) {
          // Case must fit the MB: case must be >= MB form factor
          return _Compat.formFactorCompatible(widget.formFactorFilter, ff);
        } else {
          // MB must fit in Case: MB must be <= case form factor
          return _Compat.formFactorCompatible(ff, widget.formFactorFilter);
        }
      }).toList();
    }
    // Search: prioritize name/brand match, only use spec search if no name/brand hits
    if (_search.isNotEmpty) {
      final nameMatches = list.where((p) =>
        p.name.toLowerCase().contains(_search) ||
        (p.brand ?? '').toLowerCase().contains(_search)
      ).toList();
      if (nameMatches.isNotEmpty) {
        list = nameMatches;
      } else {
        list = list.where((p) =>
          _Compat.matchesSpecSearch(p, _search)
        ).toList();
      }
    }
    if (_brands.isNotEmpty) list = list.where((p) => _brands.contains(p.brand)).toList();
    switch (_sort) {
      case 'score': list.sort((a, b) => b.techScore.compareTo(a.techScore));
      case 'name': list.sort((a, b) => a.name.compareTo(b.name));
      case 'brand': list.sort((a, b) => (a.brand ?? '').compareTo(b.brand ?? ''));
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
    final hasCompat = widget.socketFilter != null || widget.memTypeFilter != null || widget.formFactorFilter != null;
    // pcBuilderProductsProvider: cache-first, no deduplication → all variants shown, instant after preload
    final productsAsync = ref.watch(pcBuilderProductsProvider(widget.component.categoryId));

    return Scaffold(
      backgroundColor: context.backgroundColor,
      appBar: AppBar(
        backgroundColor: context.backgroundColor, surfaceTintColor: Colors.transparent,
        leading: IconButton(icon: Icon(Icons.close_rounded, color: context.textPrimary), onPressed: () => Navigator.pop(context)),
        title: Row(children: [
          Container(width: 30, height: 30,
            decoration: BoxDecoration(color: accent.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(8)),
            child: Icon(widget.component.icon, size: 16, color: accent)),
          const SizedBox(width: 10),
          Expanded(child: Text(widget.component.label(context),
            style: GoogleFonts.plusJakartaSans(fontSize: 16, fontWeight: FontWeight.w700, color: context.textPrimary))),
        ]),
      ),
      body: Column(children: [
        // Search bar
        Padding(padding: const EdgeInsets.fromLTRB(16, 4, 16, 4), child: Row(children: [
          Expanded(child: Container(height: 42,
            decoration: BoxDecoration(color: context.surfaceVariantColor, borderRadius: BorderRadius.circular(12), border: Border.all(color: context.dividerColor)),
            child: TextField(
              onChanged: (v) => setState(() => _search = v.trim().toLowerCase()),
              style: GoogleFonts.plusJakartaSans(fontSize: 13, color: context.textPrimary),
              decoration: InputDecoration(
                hintText: '${context.l10n?.search ?? "Search"} name, brand, specs...',
                hintStyle: GoogleFonts.plusJakartaSans(fontSize: 12, color: context.textTertiaryColor),
                prefixIcon: Icon(Icons.search_rounded, size: 18, color: context.textTertiaryColor),
                border: InputBorder.none, contentPadding: const EdgeInsets.symmetric(vertical: 12))))),
          const SizedBox(width: 6),
          Container(height: 42, padding: const EdgeInsets.symmetric(horizontal: 10),
            decoration: BoxDecoration(color: context.surfaceVariantColor, borderRadius: BorderRadius.circular(12), border: Border.all(color: context.dividerColor)),
            child: DropdownButtonHideUnderline(child: DropdownButton<String>(
              value: _sort, isDense: true, dropdownColor: context.surfaceVariantColor,
              style: GoogleFonts.plusJakartaSans(fontSize: 11, color: context.textPrimary),
              items: [
                DropdownMenuItem(value: 'score', child: Text(context.l10n?.sortByScore ?? 'Score')),
                DropdownMenuItem(value: 'name', child: Text(context.l10n?.sortByName ?? 'Name')),
                DropdownMenuItem(value: 'brand', child: Text(context.l10n?.brand ?? 'Brand')),
                DropdownMenuItem(value: 'price', child: Text(context.l10n?.price ?? 'Price')),
                DropdownMenuItem(value: 'newest', child: Text('Newest')),
              ], onChanged: (v) => setState(() => _sort = v ?? 'score')))),
          const SizedBox(width: 6),
          GestureDetector(onTap: () => setState(() => _showFilters = !_showFilters),
            child: Container(width: 42, height: 42,
              decoration: BoxDecoration(
                color: _showFilters ? accent.withValues(alpha: 0.15) : context.surfaceVariantColor,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: _showFilters ? accent : context.dividerColor)),
              child: Icon(Icons.tune_rounded, size: 18, color: _showFilters ? accent : context.textTertiaryColor))),
        ])),
        // Compat toggle
        if (hasCompat)
          Padding(padding: const EdgeInsets.fromLTRB(16, 2, 16, 4), child: Row(children: [
            Icon(Icons.link_rounded, size: 14, color: AppTheme.brandDeepBlue),
            const SizedBox(width: 6),
            Expanded(child: Text(
              '${context.l10n?.compatibleOnly ?? "Compatible only"}: ${[
                if (widget.socketFilter != null) 'Socket: ${widget.socketFilter}',
                if (widget.memTypeFilter != null) widget.memTypeFilter!,
                if (widget.formFactorFilter != null) 'Form: ${widget.formFactorFilter}',
              ].join(' · ')}',
              style: GoogleFonts.plusJakartaSans(fontSize: 11, color: AppTheme.brandDeepBlue, fontWeight: FontWeight.w500))),
            Switch(value: _compatOnly, onChanged: (v) => setState(() => _compatOnly = v), activeTrackColor: AppTheme.brandDeepBlue, materialTapTargetSize: MaterialTapTargetSize.shrinkWrap),
          ])),
        // Brand chips — show when filter open and products are loaded
        if (_showFilters)
          Builder(builder: (_) {
            final products = productsAsync.valueOrNull;
            if (products == null) return const SizedBox.shrink();
            return _brandChipsFromList(context, products);
          }),
        // Count
        Padding(padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 2), child: Row(children: [
          Builder(builder: (_) {
            final products = productsAsync.valueOrNull;
            if (products == null) return const SizedBox.shrink();
            return Text('${_applyFilters(products).length} ${context.l10n?.productsLabel ?? "products"}',
              style: GoogleFonts.plusJakartaSans(fontSize: 11, color: context.textTertiaryColor));
          }),
          const Spacer(),
          if (_brands.isNotEmpty) GestureDetector(onTap: () => setState(() => _brands.clear()),
            child: Text(context.l10n?.clearFilters ?? 'Clear', style: GoogleFonts.plusJakartaSans(fontSize: 10, color: AppTheme.brandBlue))),
        ])),
        // List
        Expanded(child: productsAsync.when(
          loading: () => Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
            SizedBox(width: 32, height: 32, child: CircularProgressIndicator(strokeWidth: 2, color: widget.component.accentColor)),
            const SizedBox(height: 12),
            Text(context.l10n?.loading ?? 'Loading...', style: GoogleFonts.plusJakartaSans(fontSize: 12, color: context.textSecondary)),
          ])),
          error: (err, _) => Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
            Icon(Icons.error_outline, size: 40, color: AppTheme.rose500),
            const SizedBox(height: 8),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Text(err.toString(), textAlign: TextAlign.center,
                style: GoogleFonts.plusJakartaSans(fontSize: 12, color: context.textSecondary)),
            ),
            const SizedBox(height: 12),
            ElevatedButton.icon(
              onPressed: () {
                clearPcBuilderCache(widget.component.categoryId);
                ref.invalidate(pcBuilderProductsProvider(widget.component.categoryId));
              },
              icon: const Icon(Icons.refresh_rounded, size: 16),
              label: Text(context.l10n?.retry ?? 'Retry'),
            ),
          ])),
          data: (products) => products.isEmpty
            ? Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
                Icon(Icons.inventory_2_outlined, size: 40, color: context.textTertiaryColor),
                const SizedBox(height: 8),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 24),
                  child: Text('${widget.component.label(context)} products haven\'t been scraped yet',
                    textAlign: TextAlign.center,
                    style: GoogleFonts.plusJakartaSans(color: context.textSecondary)),
                ),
                const SizedBox(height: 12),
                ElevatedButton.icon(
                  onPressed: () {
                    clearPcBuilderCache(widget.component.categoryId);
                    ref.invalidate(pcBuilderProductsProvider(widget.component.categoryId));
                  },
                  icon: const Icon(Icons.refresh_rounded, size: 16),
                  label: Text(context.l10n?.retry ?? 'Retry'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: widget.component.accentColor,
                    foregroundColor: Colors.white,
                  ),
                ),
              ]))
            : _list(context, products),
        )),
      ]),
    );
  }

  Widget _brandChipsFromList(BuildContext context, List<ProductEntity> products) {
    final all = <String>{};
    for (final p in products) { if (p.brand != null && p.brand!.isNotEmpty) all.add(p.brand!); }
    final sorted = all.toList()..sort();
    if (sorted.isEmpty) return const SizedBox.shrink();
    return Container(padding: const EdgeInsets.fromLTRB(16, 4, 16, 6), child: Wrap(spacing: 5, runSpacing: 5,
      children: sorted.map((b) {
        final sel = _brands.contains(b);
        return GestureDetector(onTap: () => setState(() { if (sel) _brands.remove(b); else _brands.add(b); }),
          child: Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
            decoration: BoxDecoration(
              color: sel ? widget.component.accentColor.withValues(alpha: 0.15) : context.surfaceVariantColor,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: sel ? widget.component.accentColor : context.dividerColor)),
            child: Text(b, style: GoogleFonts.plusJakartaSans(fontSize: 10, fontWeight: FontWeight.w500, color: sel ? widget.component.accentColor : context.textSecondary))));
      }).toList()));
  }

  Widget _list(BuildContext context, List<ProductEntity> allProducts) {
    final f = _applyFilters(allProducts);
    if (f.isEmpty) {
      // Check if compat filter is hiding everything
      final hasCompat = widget.socketFilter != null || widget.memTypeFilter != null || widget.formFactorFilter != null;
      final isCompatCause = hasCompat && _compatOnly;
      return Center(child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 24),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Icon(isCompatCause ? Icons.filter_alt_off_rounded : Icons.search_off_rounded, size: 40, color: context.textTertiaryColor),
          const SizedBox(height: 8),
          Text(isCompatCause
            ? 'No compatible products found.\nTurn off the compatibility filter to see all products.'
            : (context.l10n?.noProductsFound ?? 'No products found'),
            textAlign: TextAlign.center,
            style: GoogleFonts.plusJakartaSans(color: context.textSecondary, height: 1.4)),
          if (isCompatCause) ...[
            const SizedBox(height: 12),
            ElevatedButton.icon(
              onPressed: () => setState(() => _compatOnly = false),
              icon: const Icon(Icons.visibility_rounded, size: 16),
              label: Text('Show All ${allProducts.length} Products'),
              style: ElevatedButton.styleFrom(
                backgroundColor: widget.component.accentColor,
                foregroundColor: Colors.white,
              ),
            ),
          ],
          if (_search.isNotEmpty || _brands.isNotEmpty) ...[
            const SizedBox(height: 8),
            TextButton(
              onPressed: () => setState(() { _search = ''; _brands.clear(); }),
              child: Text(context.l10n?.clearFilters ?? 'Clear Filters',
                style: GoogleFonts.plusJakartaSans(fontSize: 12, color: widget.component.accentColor)),
            ),
          ],
        ]),
      ));
    }
    // Calculate median price for "Best Value" tag
    final prices = f.map((p) => p.prices['US'] ?? p.prices.values.firstOrNull ?? 0.0).where((p) => p > 0).toList()..sort();
    final medianPrice = prices.isNotEmpty ? prices[prices.length ~/ 2] : 0.0;

    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(16, 2, 16, 80), itemCount: f.length,
      itemBuilder: (_, i) {
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
      });
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
          return ClipRRect(
            borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
            child: Scaffold(
              backgroundColor: ctx.backgroundColor,
              body: Column(children: [
                // Handle + header
                Container(
                  color: ctx.surfaceVariantColor,
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 14),
                  child: Column(children: [
                    Center(child: Container(width: 36, height: 4,
                      decoration: BoxDecoration(color: ctx.dividerColor, borderRadius: BorderRadius.circular(2)))),
                    const SizedBox(height: 12),
                    Row(children: [
                      ClipRRect(borderRadius: BorderRadius.circular(10), child: Container(
                        width: 52, height: 52, color: ctx.surfaceColor,
                        child: p.imageUrl != null && p.imageUrl!.isNotEmpty
                          ? CachedNetworkImage(imageUrl: p.imageUrl!, fit: BoxFit.contain)
                          : Icon(widget.component.icon, size: 26, color: ctx.textTertiaryColor))),
                      const SizedBox(width: 12),
                      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(p.name, style: GoogleFonts.plusJakartaSans(fontSize: 14, fontWeight: FontWeight.w700, color: ctx.textPrimary)),
                        if (p.brand != null) Text(p.brand!, style: GoogleFonts.plusJakartaSans(fontSize: 12, color: widget.component.accentColor)),
                      ])),
                      // Tech score badge
                      Container(width: 44, height: 44,
                        decoration: BoxDecoration(shape: BoxShape.circle,
                          color: widget.component.accentColor.withValues(alpha: 0.12),
                          border: Border.all(color: widget.component.accentColor.withValues(alpha: 0.4))),
                        child: Center(child: Text('${p.techScore.round()}',
                          style: GoogleFonts.plusJakartaSans(fontSize: 14, fontWeight: FontWeight.w800, color: widget.component.accentColor)))),
                    ]),
                  ]),
                ),
                // Specs list
                Expanded(child: SingleChildScrollView(
                  controller: sc,
                  padding: EdgeInsets.fromLTRB(16, 12, 16, bottomPad + 12),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    if (p.description != null && p.description!.isNotEmpty) ...[
                      Text(p.description!, style: GoogleFonts.plusJakartaSans(fontSize: 12, color: ctx.textSecondary, height: 1.5)),
                      const SizedBox(height: 16),
                    ],
                    if (p.specs.isEmpty)
                      Text('No specifications available.', style: GoogleFonts.plusJakartaSans(fontSize: 12, color: ctx.textTertiaryColor))
                    else
                      ...p.specs.entries.map((e) => Container(
                        margin: const EdgeInsets.only(bottom: 6),
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                        decoration: BoxDecoration(
                          color: ctx.surfaceVariantColor,
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: ctx.dividerColor),
                        ),
                        child: Row(children: [
                          Expanded(flex: 2, child: Text(e.key, style: GoogleFonts.plusJakartaSans(
                            fontSize: 11, fontWeight: FontWeight.w600, color: ctx.textSecondary))),
                          Expanded(flex: 3, child: Text(e.value.toString(), style: GoogleFonts.plusJakartaSans(
                            fontSize: 11, fontWeight: FontWeight.w500, color: ctx.textPrimary), textAlign: TextAlign.end)),
                        ]),
                      )),
                  ]),
                )),
                // Bottom action buttons — always visible above safe area
                SafeArea(
                  top: false,
                  child: Container(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                    decoration: BoxDecoration(
                      color: ctx.backgroundColor,
                      border: Border(top: BorderSide(color: ctx.dividerColor)),
                    ),
                    child: Row(children: [
                      Expanded(child: OutlinedButton.icon(
                        onPressed: () {
                          Navigator.pop(sheetCtx);
                          ctx.push('/product/${p.id}');
                        },
                        icon: const Icon(Icons.open_in_new_rounded, size: 16),
                        label: Text(ctx.l10n?.viewDetails ?? 'View Details',
                          style: GoogleFonts.plusJakartaSans(fontSize: 13, fontWeight: FontWeight.w600)),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: widget.component.accentColor,
                          side: BorderSide(color: widget.component.accentColor),
                          padding: const EdgeInsets.symmetric(vertical: 12)),
                      )),
                      const SizedBox(width: 10),
                      Expanded(child: ElevatedButton.icon(
                        onPressed: () {
                          Navigator.pop(sheetCtx); // close detail sheet
                          Navigator.pop(ctx, p); // close picker with selection
                        },
                        icon: const Icon(Icons.check_circle_outline_rounded, size: 16),
                        label: Text(ctx.l10n?.selectComponent ?? 'Select',
                          style: GoogleFonts.plusJakartaSans(fontSize: 13, fontWeight: FontWeight.w700)),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: widget.component.accentColor,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 12)),
                      )),
                    ]),
                  ),
                ),
              ]),
            ),
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
    required this.product, required this.component, required this.isSelected,
    required this.onTap, this.onInfo, this.medianPrice = 0, this.socketFilter, this.memTypeFilter,
  });

  String _keySpec() {
    String g(List<String> keys) { for (final k in keys) { final v = product.specs[k]?.toString(); if (v != null && v.isNotEmpty) return v; } return ''; }
    return switch (component) {
      PcComponent.cpu => [g(['Core','core','Cores']), g(['Socket','socket']), g(['Thermal Design Power (TDP)','TDP'])].where((s) => s.isNotEmpty).join(' \u00b7 '),
      PcComponent.motherboard => [g(['Processor Socket','Socket']), g(['Chipset Model','Chipset']), g(['Memory Technology']), g(['Form Factor'])].where((s) => s.isNotEmpty).join(' \u00b7 '),
      PcComponent.ram => [g(['Memory Technology','Type']), g(['Memory Capacity','Capacity']), g(['Memory Clock Speed','Speed'])].where((s) => s.isNotEmpty).join(' \u00b7 '),
      PcComponent.gpu => [g(['VRAM','Memory','Memory Capacity']), g(['Boost Clock','Clock Speed'])].where((s) => s.isNotEmpty).join(' \u00b7 '),
      PcComponent.storage => [g(['Capacity','Storage Capacity']), g(['Interface','Type']), g(['Read Speed','Sequential Read'])].where((s) => s.isNotEmpty).join(' \u00b7 '),
      PcComponent.psu => [g(['Power','Wattage','Output Power']), g(['Certification','Efficiency'])].where((s) => s.isNotEmpty).join(' \u00b7 '),
      PcComponent.pcCase => [g(['Form Factor']), g(['Color','Colour']), g(['Material'])].where((s) => s.isNotEmpty).join(' \u00b7 '),
      PcComponent.cooler => [g(['Fan Speed','RPM']), g(['Noise Level']), g(['Socket','Compatible Sockets'])].where((s) => s.isNotEmpty).join(' \u00b7 '),
      PcComponent.monitor => [g(['Screen Size','Display Size']), g(['Resolution']), g(['Refresh Rate']), g(['Panel Type','Panel'])].where((s) => s.isNotEmpty).join(' \u00b7 '),
      PcComponent.keyboard => [g(['Switch Type','Key Switch']), g(['Layout']), g(['Connection','Connectivity'])].where((s) => s.isNotEmpty).join(' \u00b7 '),
      PcComponent.mouse => [g(['DPI','Max DPI','Sensor']), g(['Connection','Connectivity']), g(['Weight'])].where((s) => s.isNotEmpty).join(' \u00b7 '),
      PcComponent.headset => [g(['Driver Size','Driver']), g(['Frequency Response']), g(['Connection','Connectivity']), g(['Microphone','Mic'])].where((s) => s.isNotEmpty).join(' \u00b7 '),
    };
  }

  /// Compatibility warning — only shown when item is INCOMPATIBLE with selection.
  /// When compat filter is ON, incompatible items are already hidden, so no warning needed.
  String? _compatWarning() {
    if (component == PcComponent.ram && memTypeFilter != null) {
      final mem = _Compat.memoryType(product);
      if (mem != null) {
        final t = memTypeFilter!.toUpperCase();
        final isIncompat = !mem.toUpperCase().contains(t) && !t.contains(mem.toUpperCase());
        if (isIncompat) return '⚠️ Incompatible: $mem vs $memTypeFilter';
      }
    }
    if ((component == PcComponent.motherboard || component == PcComponent.cooler) &&
        socketFilter != null) {
      final sock = _Compat.socket(product);
      if (sock != null) {
        final t = socketFilter!.toUpperCase();
        if (!sock.contains(t) && !t.contains(sock)) {
          return '⚠️ Socket mismatch: $sock ≠ $socketFilter';
        }
      }
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final accent = component.accentColor;
    final sc = product.techScore >= 80 ? AppTheme.success : product.techScore >= 60 ? AppTheme.brandBlue : product.techScore >= 40 ? AppTheme.amber500 : AppTheme.rose500;
    final ks = _keySpec();
    final isPopular = product.techScore > 85;
    final productPrice = product.prices['US'] ?? product.prices.values.firstOrNull ?? 0.0;
    final isBestValue = product.techScore > 75 && productPrice > 0 && medianPrice > 0 && productPrice <= medianPrice;
    final warn = _compatWarning();

    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      decoration: BoxDecoration(
        color: isSelected ? accent.withValues(alpha: 0.08) : context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: isSelected ? accent : context.dividerColor, width: isSelected ? 1.5 : 1)),
      child: Material(color: Colors.transparent, child: InkWell(borderRadius: BorderRadius.circular(14), onTap: onTap,
        child: Padding(padding: const EdgeInsets.all(10), child: Column(mainAxisSize: MainAxisSize.min, children: [
          Row(children: [
            ClipRRect(borderRadius: BorderRadius.circular(10), child: Container(width: 50, height: 50, color: context.surfaceColor,
              child: product.imageUrl != null && product.imageUrl!.isNotEmpty
                ? CachedNetworkImage(imageUrl: product.imageUrl!, fit: BoxFit.contain, errorWidget: (_, __, ___) => Icon(component.icon, size: 22, color: context.textTertiaryColor))
                : Icon(component.icon, size: 22, color: context.textTertiaryColor))),
            const SizedBox(width: 10),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              // Tags row
              if (isPopular || isBestValue) Padding(
                padding: const EdgeInsets.only(bottom: 3),
                child: Wrap(spacing: 4, children: [
                  if (isPopular) _tag('⭐ Popular', AppTheme.success),
                  if (isBestValue) _tag('💎 Best Value', AppTheme.brandBlue),
                ]),
              ),
              Text(product.name, maxLines: 2, overflow: TextOverflow.ellipsis, style: GoogleFonts.plusJakartaSans(fontSize: 12, fontWeight: FontWeight.w600, color: context.textPrimary)),
              if (product.brand != null && product.brand!.isNotEmpty) ...[const SizedBox(height: 1), Text(product.brand!, style: GoogleFonts.plusJakartaSans(fontSize: 10, color: accent, fontWeight: FontWeight.w500))],
              if (ks.isNotEmpty) ...[const SizedBox(height: 2), Text(ks, maxLines: 1, overflow: TextOverflow.ellipsis, style: GoogleFonts.plusJakartaSans(fontSize: 9, color: context.textTertiaryColor))],
            ])),
            const SizedBox(width: 6),
            Container(width: 38, height: 38, decoration: BoxDecoration(shape: BoxShape.circle, color: sc.withValues(alpha: 0.12), border: Border.all(color: sc.withValues(alpha: 0.3))),
              child: Center(child: Text(product.techScore.round().toString(), style: GoogleFonts.plusJakartaSans(fontSize: 13, fontWeight: FontWeight.w800, color: sc)))),
            const SizedBox(width: 4),
            // Info button to view specs before selecting
            GestureDetector(
              onTap: onInfo,
              child: Container(width: 30, height: 30,
                decoration: BoxDecoration(shape: BoxShape.circle,
                  color: accent.withValues(alpha: 0.08),
                  border: Border.all(color: accent.withValues(alpha: 0.25))),
                child: Icon(Icons.info_outline_rounded, size: 15, color: accent)),
            ),
            if (isSelected) ...[const SizedBox(width: 4), Icon(Icons.check_circle_rounded, size: 20, color: accent)],
          ]),
          // Compatibility warning
          if (warn != null) Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: AppTheme.amber500.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text(warn, style: GoogleFonts.plusJakartaSans(fontSize: 9, color: AppTheme.amber500, fontWeight: FontWeight.w600)),
            ),
          ),
        ])))),
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
      child: Text(label, style: GoogleFonts.plusJakartaSans(fontSize: 8, fontWeight: FontWeight.w700, color: color)),
    );
  }
}

