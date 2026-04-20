/// Modern filter bottom sheet widget.
library;

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:compair/config/filter_config.dart';
import 'package:compair/core/theme.dart';
import 'package:compair/presentation/models/filter_models.dart';

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
    useSafeArea: true,
    backgroundColor: Colors.transparent,
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

  // ── range helpers ─────────────────────────────────────────────────────────

  RangeValues _rangeFor(FilterDefinition def) =>
      _state.ranges[def.id] ??
      RangeValues(def.minValue ?? 0, def.maxValue ?? 100);

  void _updateRange(String filterId, RangeValues values, FilterDefinition def) {
    final updated = Map<String, RangeValues>.from(_state.ranges);
    // Remove if back to defaults to avoid counting it as "active"
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

  // ── build ─────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final bg = isDark ? context.surfaceColor : AppTheme.surfaceLight;
    final activeCount = _state.activeCount;

    return Container(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.85,
      ),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        border: Border(
          top: BorderSide(color: AppTheme.brandCyan.withValues(alpha: 0.15)),
        ),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // ── handle ──
          Container(
            margin: const EdgeInsets.only(top: 8),
            width: 36,
            height: 4,
            decoration: BoxDecoration(
              color: AppTheme.brandCyan.withValues(alpha: 0.3),
              borderRadius: BorderRadius.circular(2),
            ),
          ),

          // ── header ──
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 14, 12, 12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 38,
                  height: 38,
                  decoration: BoxDecoration(
                    gradient: AppTheme.primaryGradient,
                    borderRadius: BorderRadius.circular(12),
                    boxShadow: [
                      BoxShadow(
                        color: AppTheme.brandCyan.withValues(alpha: 0.22),
                        blurRadius: 14,
                        offset: const Offset(0, 6),
                      ),
                    ],
                  ),
                  child: const Icon(
                    Icons.tune_rounded,
                    size: 16,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(width: 10),
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
                              fontSize: 18,
                              fontWeight: FontWeight.w700,
                              color: context.textPrimary,
                            ),
                          ),
                          if (activeCount > 0) ...[
                            const SizedBox(width: 8),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 8,
                                vertical: 2,
                              ),
                              decoration: BoxDecoration(
                                color: AppTheme.brandCyan.withValues(
                                  alpha: 0.15,
                                ),
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: Text(
                                '$activeCount',
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w700,
                                  color: AppTheme.brandCyan,
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        _fallbackText(
                          en: 'Refine results with brand, specs and price.',
                          tr: 'Marka, teknik özellik ve fiyata göre daralt.',
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
                const SizedBox(width: 8),
                if (activeCount > 0)
                  TextButton(
                    onPressed: _reset,
                    style: TextButton.styleFrom(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 6,
                      ),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(20),
                      ),
                      backgroundColor: AppTheme.brandCyan.withValues(
                        alpha: 0.10,
                      ),
                    ),
                    child: Text(
                      _fallbackText(en: 'Reset', tr: 'Sıfırla'),
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: AppTheme.brandCyan,
                      ),
                    ),
                  ),
                IconButton(
                  icon: Icon(
                    Icons.close_rounded,
                    color: context.textSecondary,
                    size: 20,
                  ),
                  onPressed: () => Navigator.of(context).pop(),
                  visualDensity: VisualDensity.compact,
                ),
              ],
            ),
          ),

          if (activeCount > 0)
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 10),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 6,
                  ),
                  decoration: BoxDecoration(
                    color: AppTheme.brandCyan.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(
                      color: AppTheme.brandCyan.withValues(alpha: 0.16),
                    ),
                  ),
                  child: Text(
                    _fallbackText(
                      en: '$activeCount active filter${activeCount == 1 ? '' : 's'}',
                      tr: '$activeCount aktif filtre',
                    ),
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: AppTheme.brandCyan,
                    ),
                  ),
                ),
              ),
            ),

          Divider(
            height: 1,
            color: context.dividerColor.withValues(alpha: 0.3),
          ),

          // ── filter list ──
          Flexible(
            child: ListView.builder(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 8),
              itemCount: _definitions.length,
              shrinkWrap: true,
              itemBuilder: (context, i) {
                final def = _definitions[i];
                return _buildSection(def, isDark);
              },
            ),
          ),

          // ── apply button ──
          Container(
            padding: EdgeInsets.fromLTRB(
              20,
              12,
              20,
              16 + MediaQuery.of(context).padding.bottom + AppTheme.navBarTotalClearance,
            ),
            decoration: BoxDecoration(
              border: Border(
                top: BorderSide(
                  color: context.dividerColor.withValues(alpha: 0.2),
                ),
              ),
            ),
            child: SizedBox(
              width: double.infinity,
              height: 52,
              child: FilledButton(
                onPressed: _apply,
                style: FilledButton.styleFrom(
                  backgroundColor: Colors.transparent,
                  padding: EdgeInsets.zero,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                  ),
                ),
                child: Ink(
                  decoration: BoxDecoration(
                    gradient: AppTheme.primaryGradient,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Center(
                    child: Text(
                      activeCount > 0
                          ? _fallbackText(
                              en: 'Apply Filters ($activeCount)',
                              tr: 'Filtreleri Uygula ($activeCount)',
                            )
                          : _fallbackText(
                              en: 'Apply Filters',
                              tr: 'Filtreleri Uygula',
                            ),
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                        color: Colors.white,
                      ),
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
    return Padding(
      padding: const EdgeInsets.only(bottom: 20),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: context.surfaceVariantColor.withValues(
            alpha: isDark ? 1 : 0.9,
          ),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(
            color: context.dividerColor.withValues(alpha: 0.22),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    def.label,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: context.textPrimary,
                    ),
                  ),
                ),
                if (_selectedFor(def.id).isNotEmpty ||
                    _state.ranges.containsKey(def.id)) ...[
                  Container(
                    width: 8,
                    height: 8,
                    decoration: const BoxDecoration(
                      color: AppTheme.brandCyan,
                      shape: BoxShape.circle,
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

    // Fixed 3-column grid so all chips are equal width and symmetric.
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 3,
        crossAxisSpacing: 8,
        mainAxisSpacing: 8,
        childAspectRatio: 2.8,
      ),
      itemCount: options.length,
      itemBuilder: (context, i) {
        final opt = options[i];
        final isSelected = selected.contains(opt.id);
        return GestureDetector(
          onTap: () => _toggleOption(def.id, opt.id),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: isSelected
                  ? AppTheme.brandCyan.withValues(alpha: 0.15)
                  : context.surfaceVariantColor,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: isSelected
                    ? AppTheme.brandCyan.withValues(alpha: 0.5)
                    : context.dividerColor.withValues(alpha: 0.3),
                width: isSelected ? 1.2 : 0.8,
              ),
            ),
            child: Text(
              opt.label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
              style: GoogleFonts.plusJakartaSans(
                fontSize: 12,
                fontWeight: isSelected ? FontWeight.w600 : FontWeight.w400,
                color: isSelected ? AppTheme.brandCyan : context.textSecondary,
              ),
            ),
          ),
        );
      },
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
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: AppTheme.brandCyan.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                '${fmt(current.start)}$unit',
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: AppTheme.brandCyan,
                ),
              ),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: AppTheme.brandCyan.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                '${fmt(current.end)}$unit',
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: AppTheme.brandCyan,
                ),
              ),
            ),
          ],
        ),
        SliderTheme(
          data: SliderTheme.of(context).copyWith(
            activeTrackColor: AppTheme.brandCyan,
            inactiveTrackColor: context.dividerColor.withValues(alpha: 0.3),
            thumbColor: AppTheme.brandCyan,
            overlayColor: AppTheme.brandCyan.withValues(alpha: 0.1),
            trackHeight: 3,
            thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 7),
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
                fontSize: 10,
                color: context.textTertiaryColor,
              ),
            ),
            Text(
              '${fmt(max)}$unit',
              style: GoogleFonts.plusJakartaSans(
                fontSize: 10,
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

    return Row(
      children: [
        _ToggleButton(
          label: _fallbackText(en: 'Any', tr: 'Fark etmez'),
          selected: selectedIndex == 0,
          onTap: () => _setToggle(def.id, null),
          isFirst: true,
        ),
        _ToggleButton(
          label: _fallbackText(en: 'Yes', tr: 'Evet'),
          selected: selectedIndex == 1,
          onTap: () => _setToggle(def.id, true),
        ),
        _ToggleButton(
          label: _fallbackText(en: 'No', tr: 'Hayır'),
          selected: selectedIndex == 2,
          onTap: () => _setToggle(def.id, false),
          isLast: true,
        ),
      ],
    );
  }
}

class _ToggleButton extends StatelessWidget {
  const _ToggleButton({
    required this.label,
    required this.selected,
    required this.onTap,
    this.isFirst = false,
    this.isLast = false,
  });
  final String label;
  final bool selected;
  final VoidCallback onTap;
  final bool isFirst;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    final radius = BorderRadius.horizontal(
      left: isFirst ? const Radius.circular(12) : Radius.zero,
      right: isLast ? const Radius.circular(12) : Radius.zero,
    );
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
        decoration: BoxDecoration(
          color: selected
              ? AppTheme.brandCyan.withValues(alpha: 0.15)
              : Colors.transparent,
          borderRadius: radius,
          border: Border.all(
            color: selected
                ? AppTheme.brandCyan
                : context.dividerColor.withValues(alpha: 0.3),
          ),
        ),
        child: Text(
          label,
          style: GoogleFonts.plusJakartaSans(
            fontSize: 13,
            fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
            color: selected ? AppTheme.brandCyan : context.textSecondary,
          ),
        ),
      ),
    );
  }
}
