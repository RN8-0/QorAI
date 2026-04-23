/// Modern filter bottom sheet widget.
library;

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:qor_ai/config/filter_config.dart';
import 'package:qor_ai/core/theme.dart';
import 'package:qor_ai/presentation/models/filter_models.dart';

// ---------------------------------------------------------------------------
// Public entry-point
// ---------------------------------------------------------------------------

Future<FilterState?> showFilterBottomSheet({
  required BuildContext context,
  required String categoryId,
  required FilterState initialState,
  List<dynamic> products = const [],
}) {
  return showModalBottomSheet<FilterState>(
    context: context,
    isScrollControlled: true,
    useSafeArea: false,
    backgroundColor: Colors.transparent,
    barrierColor: Colors.black.withValues(alpha: 0.55),
    builder: (_) => _FilterBottomSheet(
      categoryId: categoryId,
      initialState: initialState,
      products: products,
    ),
  );
}

// ---------------------------------------------------------------------------
// Internal sheet widget
// ---------------------------------------------------------------------------

class _FilterBottomSheet extends StatefulWidget {
  const _FilterBottomSheet({
    required this.categoryId,
    required this.initialState,
    this.products = const [],
  });

  final String categoryId;
  final FilterState initialState;
  final List<dynamic> products;

  @override
  State<_FilterBottomSheet> createState() => _FilterBottomSheetState();
}

class _FilterBottomSheetState extends State<_FilterBottomSheet> {
  late FilterState _state;
  late final List<FilterDefinition> _definitions;

  bool get _isTurkish =>
      Localizations.localeOf(context).languageCode.toLowerCase() == 'tr';

  String _fallbackText({required String en, required String tr}) {
    return _isTurkish ? tr : en;
  }

  @override
  void initState() {
    super.initState();
    _state = widget.initialState;
    _definitions = FilterConfig.getFiltersWithProducts(
      widget.categoryId,
      widget.products,
    );
  }

  void _reset() => setState(() => _state = const FilterState());

  void _apply() => Navigator.of(context).pop(_state);

  // ── multi-select helpers ──────────────────────────────────────────────────

  Set<String> _selectedFor(String filterId) =>
      _state.multiSelect[filterId] ?? {};

  void _toggleOption(String filterId, String optionId) {
    final current = Set<String>.from(_selectedFor(filterId));
    if (current.contains(optionId)) {
      current.remove(optionId);
    } else {
      current.add(optionId);
    }
    final updated = Map<String, Set<String>>.from(_state.multiSelect);
    if (current.isEmpty) {
      updated.remove(filterId);
    } else {
      updated[filterId] = current;
    }
    setState(() => _state = _state.copyWith(multiSelect: updated));
  }

  void _clearSection(FilterDefinition def) {
    setState(() {
      switch (def.type) {
        case FilterType.multiSelect:
          final updated = Map<String, Set<String>>.from(_state.multiSelect);
          updated.remove(def.id);
          _state = _state.copyWith(multiSelect: updated);
        case FilterType.rangeSlider:
          final updated = Map<String, RangeValues>.from(_state.ranges);
          updated.remove(def.id);
          _state = _state.copyWith(ranges: updated);
        case FilterType.toggle:
          final updated = Map<String, bool?>.from(_state.toggles);
          updated.remove(def.id);
          _state = _state.copyWith(toggles: updated);
      }
    });
  }

  // ── range helpers ─────────────────────────────────────────────────────────

  RangeValues _rangeFor(FilterDefinition def) =>
      _state.ranges[def.id] ??
      RangeValues(def.minValue ?? 0, def.maxValue ?? 100);

  void _updateRange(String filterId, RangeValues values, FilterDefinition def) {
    final updated = Map<String, RangeValues>.from(_state.ranges);
    if (values.start == (def.minValue ?? 0) &&
        values.end == (def.maxValue ?? 100)) {
      updated.remove(filterId);
    } else {
      updated[filterId] = values;
    }
    setState(() => _state = _state.copyWith(ranges: updated));
  }

  // ── toggle helpers ────────────────────────────────────────────────────────

  bool? _toggleFor(String filterId) => _state.toggles[filterId];

  void _setToggle(String filterId, bool? value) {
    final updated = Map<String, bool?>.from(_state.toggles);
    if (value == null) {
      updated.remove(filterId);
    } else {
      updated[filterId] = value;
    }
    setState(() => _state = _state.copyWith(toggles: updated));
  }

  // ── section badge helpers ─────────────────────────────────────────────────

  int _sectionActiveCount(FilterDefinition def) {
    switch (def.type) {
      case FilterType.multiSelect:
        return _selectedFor(def.id).length;
      case FilterType.rangeSlider:
        return _state.ranges.containsKey(def.id) ? 1 : 0;
      case FilterType.toggle:
        return _toggleFor(def.id) != null ? 1 : 0;
    }
  }

  IconData _iconForSection(FilterDefinition def) {
    final id = def.id.toLowerCase();
    if (id.contains('brand')) return Icons.verified_rounded;
    if (id.contains('price')) return Icons.sell_rounded;
    if (id.contains('score')) return Icons.auto_awesome_rounded;
    if (id.contains('ram') || id.contains('memory')) {
      return Icons.memory_rounded;
    }
    if (id.contains('storage') || id.contains('disk')) {
      return Icons.sd_storage_rounded;
    }
    if (id.contains('screen') || id.contains('display')) {
      return Icons.aspect_ratio_rounded;
    }
    if (id.contains('battery')) return Icons.battery_charging_full_rounded;
    if (id.contains('camera')) return Icons.camera_alt_rounded;
    if (id.contains('os') || id.contains('operating')) {
      return Icons.phone_android_rounded;
    }
    if (id.contains('processor') || id.contains('cpu') || id.contains('chip')) {
      return Icons.developer_board_rounded;
    }
    if (id.contains('gpu')) return Icons.videogame_asset_rounded;
    if (id.contains('connect') || id.contains('wifi') || id.contains('5g')) {
      return Icons.wifi_rounded;
    }
    switch (def.type) {
      case FilterType.multiSelect:
        return Icons.check_circle_outline_rounded;
      case FilterType.rangeSlider:
        return Icons.straighten_rounded;
      case FilterType.toggle:
        return Icons.toggle_on_rounded;
    }
  }

  // ── build ─────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final bg = isDark ? context.surfaceColor : AppTheme.surfaceLight;
    final activeCount = _state.activeCount;

    return Container(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.88,
      ),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: isDark ? 0.45 : 0.12),
            blurRadius: 24,
            offset: const Offset(0, -6),
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // ── drag handle ──
          Container(
            margin: const EdgeInsets.only(top: 10),
            width: 42,
            height: 4,
            decoration: BoxDecoration(
              color: context.textTertiaryColor.withValues(alpha: 0.35),
              borderRadius: BorderRadius.circular(2),
            ),
          ),

          // ── header ──
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 12, 10),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Container(
                  width: 42,
                  height: 42,
                  decoration: BoxDecoration(
                    gradient: AppTheme.primaryGradient,
                    borderRadius: BorderRadius.circular(14),
                    boxShadow: [
                      BoxShadow(
                        color: AppTheme.brandCyan.withValues(alpha: 0.28),
                        blurRadius: 16,
                        offset: const Offset(0, 6),
                      ),
                    ],
                  ),
                  child: const Icon(
                    Icons.tune_rounded,
                    size: 20,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Row(
                        children: [
                          Text(
                            _fallbackText(en: 'Filters', tr: 'Filtreler'),
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 19,
                              fontWeight: FontWeight.w800,
                              color: context.textPrimary,
                              letterSpacing: -0.3,
                            ),
                          ),
                          if (activeCount > 0) ...[
                            const SizedBox(width: 8),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 8,
                                vertical: 3,
                              ),
                              decoration: BoxDecoration(
                                gradient: AppTheme.primaryGradient,
                                borderRadius: BorderRadius.circular(999),
                              ),
                              child: Text(
                                '$activeCount',
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w800,
                                  color: Colors.white,
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
                      const SizedBox(height: 2),
                      Text(
                        _fallbackText(
                          en: 'Refine by brand, specs and price',
                          tr: 'Marka, özellik ve fiyata göre daralt',
                        ),
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                          color: context.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 4),
                if (activeCount > 0)
                  TextButton.icon(
                    onPressed: _reset,
                    icon: Icon(
                      Icons.refresh_rounded,
                      size: 16,
                      color: AppTheme.brandCyan,
                    ),
                    label: Text(
                      _fallbackText(en: 'Reset', tr: 'Sıfırla'),
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: AppTheme.brandCyan,
                      ),
                    ),
                    style: TextButton.styleFrom(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 6,
                      ),
                      minimumSize: Size.zero,
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      visualDensity: VisualDensity.compact,
                      backgroundColor: AppTheme.brandCyan.withValues(
                        alpha: 0.12,
                      ),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(999),
                      ),
                    ),
                  ),
                IconButton(
                  icon: Icon(
                    Icons.close_rounded,
                    color: context.textSecondary,
                    size: 22,
                  ),
                  onPressed: () => Navigator.of(context).pop(),
                  visualDensity: VisualDensity.compact,
                ),
              ],
            ),
          ),

          Divider(
            height: 1,
            thickness: 1,
            color: context.dividerColor.withValues(alpha: 0.25),
          ),

          // ── filter list ──
          Flexible(
            child: ListView.builder(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 6),
              itemCount: _definitions.length,
              shrinkWrap: true,
              itemBuilder: (context, i) {
                final def = _definitions[i];
                return _buildSection(def, isDark);
              },
            ),
          ),

          // ── apply footer ──
          Container(
            padding: EdgeInsets.fromLTRB(
              16,
              10,
              16,
              12 + MediaQuery.of(context).padding.bottom,
            ),
            decoration: BoxDecoration(
              color: bg,
              border: Border(
                top: BorderSide(
                  color: context.dividerColor.withValues(alpha: 0.25),
                ),
              ),
            ),
            child: SizedBox(
              width: double.infinity,
              height: 50,
              child: FilledButton(
                onPressed: _apply,
                style: FilledButton.styleFrom(
                  backgroundColor: Colors.transparent,
                  padding: EdgeInsets.zero,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
                child: Ink(
                  decoration: BoxDecoration(
                    gradient: AppTheme.primaryGradient,
                    borderRadius: BorderRadius.circular(14),
                    boxShadow: [
                      BoxShadow(
                        color: AppTheme.brandCyan.withValues(alpha: 0.22),
                        blurRadius: 12,
                        offset: const Offset(0, 4),
                      ),
                    ],
                  ),
                  child: Center(
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(
                          Icons.check_circle_rounded,
                          size: 20,
                          color: Colors.white,
                        ),
                        const SizedBox(width: 8),
                        Text(
                          activeCount > 0
                              ? _fallbackText(
                                  en: 'Apply ($activeCount)',
                                  tr: 'Uygula ($activeCount)',
                                )
                              : _fallbackText(
                                  en: 'Apply Filters',
                                  tr: 'Filtreleri Uygula',
                                ),
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 15,
                            fontWeight: FontWeight.w800,
                            color: Colors.white,
                            letterSpacing: 0.2,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSection(FilterDefinition def, bool isDark) {
    final activeInSection = _sectionActiveCount(def);
    final hasActive = activeInSection > 0;

    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
        decoration: BoxDecoration(
          color: isDark
              ? context.surfaceVariantColor.withValues(alpha: 0.85)
              : Colors.white,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: hasActive
                ? AppTheme.brandCyan.withValues(alpha: 0.45)
                : context.dividerColor.withValues(alpha: 0.22),
            width: hasActive ? 1.2 : 1.0,
          ),
          boxShadow: [
            BoxShadow(
              color: hasActive
                  ? AppTheme.brandCyan.withValues(alpha: 0.08)
                  : Colors.black.withValues(alpha: isDark ? 0.18 : 0.03),
              blurRadius: hasActive ? 14 : 8,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 34,
                  height: 34,
                  decoration: BoxDecoration(
                    color: hasActive
                        ? AppTheme.brandCyan.withValues(alpha: 0.14)
                        : context.surfaceVariantColor.withValues(alpha: 0.6),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(
                    _iconForSection(def),
                    size: 17,
                    color: hasActive
                        ? AppTheme.brandCyan
                        : context.textSecondary,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    def.label,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 14.5,
                      fontWeight: FontWeight.w700,
                      color: context.textPrimary,
                      letterSpacing: -0.2,
                    ),
                  ),
                ),
                if (hasActive && def.type == FilterType.multiSelect)
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 3,
                    ),
                    decoration: BoxDecoration(
                      color: AppTheme.brandCyan.withValues(alpha: 0.14),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      '$activeInSection',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                        color: AppTheme.brandCyan,
                      ),
                    ),
                  ),
                if (hasActive) ...[
                  const SizedBox(width: 4),
                  InkWell(
                    onTap: () => _clearSection(def),
                    borderRadius: BorderRadius.circular(999),
                    child: Padding(
                      padding: const EdgeInsets.all(4),
                      child: Icon(
                        Icons.close_rounded,
                        size: 14,
                        color: context.textSecondary,
                      ),
                    ),
                  ),
                ],
              ],
            ),
            const SizedBox(height: 12),
            switch (def.type) {
              FilterType.multiSelect => _buildMultiSelect(def, isDark),
              FilterType.rangeSlider => _buildRangeSlider(def, isDark),
              FilterType.toggle => _buildToggle(def, isDark),
            },
          ],
        ),
      ),
    );
  }

  // ── multiSelect ───────────────────────────────────────────────────────────

  Widget _buildMultiSelect(FilterDefinition def, bool isDark) {
    final selected = _selectedFor(def.id);
    final options = def.options ?? [];
    if (options.isEmpty) return const SizedBox.shrink();

    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: options.map((opt) {
        final isSelected = selected.contains(opt.id);
        return GestureDetector(
          onTap: () => _toggleOption(def.id, opt.id),
          behavior: HitTestBehavior.opaque,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            curve: Curves.easeOut,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
            decoration: BoxDecoration(
              gradient: isSelected ? AppTheme.primaryGradient : null,
              color: isSelected
                  ? null
                  : (isDark
                        ? context.surfaceColor.withValues(alpha: 0.6)
                        : context.surfaceVariantColor.withValues(alpha: 0.7)),
              borderRadius: BorderRadius.circular(999),
              border: Border.all(
                color: isSelected
                    ? Colors.transparent
                    : context.dividerColor.withValues(alpha: 0.35),
                width: 1,
              ),
              boxShadow: isSelected
                  ? [
                      BoxShadow(
                        color: AppTheme.brandCyan.withValues(alpha: 0.28),
                        blurRadius: 10,
                        offset: const Offset(0, 4),
                      ),
                    ]
                  : null,
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (isSelected) ...[
                  const Icon(
                    Icons.check_rounded,
                    size: 14,
                    color: Colors.white,
                  ),
                  const SizedBox(width: 5),
                ],
                Text(
                  opt.label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 12.5,
                    fontWeight: isSelected
                        ? FontWeight.w700
                        : FontWeight.w600,
                    color: isSelected ? Colors.white : context.textPrimary,
                    letterSpacing: -0.1,
                  ),
                ),
              ],
            ),
          ),
        );
      }).toList(),
    );
  }

  // ── rangeSlider ───────────────────────────────────────────────────────────

  Widget _buildRangeSlider(FilterDefinition def, bool isDark) {
    final current = _rangeFor(def);
    final unit = def.unit != null ? ' ${def.unit}' : '';
    final min = def.minValue ?? 0.0;
    final max = def.maxValue ?? 100.0;
    final isDecimal = (max - min) < 50;

    String fmt(double v) =>
        isDecimal ? v.toStringAsFixed(1) : v.round().toString();

    return Column(
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            _RangeValuePill(text: '${fmt(current.start)}$unit'),
            Container(
              width: 24,
              height: 2,
              color: context.dividerColor.withValues(alpha: 0.4),
            ),
            _RangeValuePill(text: '${fmt(current.end)}$unit'),
          ],
        ),
        const SizedBox(height: 4),
        SliderTheme(
          data: SliderTheme.of(context).copyWith(
            activeTrackColor: AppTheme.brandCyan,
            inactiveTrackColor: context.dividerColor.withValues(alpha: 0.25),
            thumbColor: Colors.white,
            overlayColor: AppTheme.brandCyan.withValues(alpha: 0.14),
            trackHeight: 4,
            rangeThumbShape: _GradientRangeThumbShape(
              enabledThumbRadius: 10,
              borderColor: AppTheme.brandCyan,
            ),
            showValueIndicator: ShowValueIndicator.never,
          ),
          child: RangeSlider(
            values: current,
            min: min,
            max: max,
            onChanged: (v) => _updateRange(def.id, v, def),
          ),
        ),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              '${fmt(min)}$unit',
              style: GoogleFonts.plusJakartaSans(
                fontSize: 10.5,
                fontWeight: FontWeight.w500,
                color: context.textTertiaryColor,
              ),
            ),
            Text(
              '${fmt(max)}$unit',
              style: GoogleFonts.plusJakartaSans(
                fontSize: 10.5,
                fontWeight: FontWeight.w500,
                color: context.textTertiaryColor,
              ),
            ),
          ],
        ),
      ],
    );
  }

  // ── toggle ────────────────────────────────────────────────────────────────

  Widget _buildToggle(FilterDefinition def, bool isDark) {
    final value = _toggleFor(def.id);
    final selectedIndex = value == null ? 0 : (value ? 1 : 2);

    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: isDark
            ? context.surfaceColor.withValues(alpha: 0.6)
            : context.surfaceVariantColor.withValues(alpha: 0.6),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: context.dividerColor.withValues(alpha: 0.25),
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: _ToggleButton(
              label: _fallbackText(en: 'Any', tr: 'Fark etmez'),
              selected: selectedIndex == 0,
              onTap: () => _setToggle(def.id, null),
            ),
          ),
          Expanded(
            child: _ToggleButton(
              label: _fallbackText(en: 'Yes', tr: 'Evet'),
              selected: selectedIndex == 1,
              onTap: () => _setToggle(def.id, true),
            ),
          ),
          Expanded(
            child: _ToggleButton(
              label: _fallbackText(en: 'No', tr: 'Hayır'),
              selected: selectedIndex == 2,
              onTap: () => _setToggle(def.id, false),
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Small reusable pieces
// ---------------------------------------------------------------------------

class _RangeValuePill extends StatelessWidget {
  const _RangeValuePill({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            AppTheme.brandCyan.withValues(alpha: 0.18),
            AppTheme.brandBlue.withValues(alpha: 0.14),
          ],
        ),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: AppTheme.brandCyan.withValues(alpha: 0.28),
        ),
      ),
      child: Text(
        text,
        style: GoogleFonts.plusJakartaSans(
          fontSize: 12.5,
          fontWeight: FontWeight.w700,
          color: AppTheme.brandCyan,
          letterSpacing: -0.1,
        ),
      ),
    );
  }
}

class _ToggleButton extends StatelessWidget {
  const _ToggleButton({
    required this.label,
    required this.selected,
    required this.onTap,
  });
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        curve: Curves.easeOut,
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          gradient: selected ? AppTheme.primaryGradient : null,
          borderRadius: BorderRadius.circular(10),
          boxShadow: selected
              ? [
                  BoxShadow(
                    color: AppTheme.brandCyan.withValues(alpha: 0.28),
                    blurRadius: 10,
                    offset: const Offset(0, 4),
                  ),
                ]
              : null,
        ),
        alignment: Alignment.center,
        child: Text(
          label,
          style: GoogleFonts.plusJakartaSans(
            fontSize: 13,
            fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
            color: selected ? Colors.white : context.textSecondary,
            letterSpacing: -0.1,
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Custom range-slider thumb: white center + brand-cyan border + soft shadow.
// ---------------------------------------------------------------------------

class _GradientRangeThumbShape extends RangeSliderThumbShape {
  const _GradientRangeThumbShape({
    this.enabledThumbRadius = 10,
    required this.borderColor,
  });

  final double enabledThumbRadius;
  final Color borderColor;

  @override
  Size getPreferredSize(bool isEnabled, bool isDiscrete) =>
      Size.fromRadius(enabledThumbRadius);

  @override
  void paint(
    PaintingContext context,
    Offset center, {
    required Animation<double> activationAnimation,
    required Animation<double> enableAnimation,
    bool isDiscrete = false,
    bool isEnabled = false,
    bool isOnTop = false,
    required SliderThemeData sliderTheme,
    TextDirection textDirection = TextDirection.ltr,
    Thumb thumb = Thumb.start,
    bool isPressed = false,
  }) {
    final canvas = context.canvas;

    // Shadow
    final shadowPaint = Paint()
      ..color = borderColor.withValues(alpha: 0.35)
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 4);
    canvas.drawCircle(
      center.translate(0, 2),
      enabledThumbRadius,
      shadowPaint,
    );

    // Border
    final borderPaint = Paint()
      ..color = borderColor
      ..style = PaintingStyle.fill;
    canvas.drawCircle(center, enabledThumbRadius, borderPaint);

    // Inner fill
    final innerPaint = Paint()..color = Colors.white;
    canvas.drawCircle(center, enabledThumbRadius - 3, innerPaint);
  }
}
