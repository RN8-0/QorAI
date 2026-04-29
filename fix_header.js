const fs = require('fs');

const path = 'lib/presentation/screens/browse/category_browse_screen.dart';
let content = fs.readFileSync(path, 'utf8');

const target = \            _SortDropdown(value: _sortOption, onChanged: _changeSortOption),
            if (hasFilters) ...[
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                decoration: BoxDecoration(
                  color: context.backgroundColor,
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: context.dividerColor),
                ),
                child: Text(
                  _fallbackText(
                    en: '\\\ matches',
                    tr: '\\\ ürün',
                  ),
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w700,
                    color: context.textSecondary,
                  ),
                ),
              ),
            ],
            const SizedBox(width: 8),\;

const replacement = \            _SortDropdown(value: _sortOption, onChanged: _changeSortOption),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              decoration: BoxDecoration(
                color: context.backgroundColor,
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: context.dividerColor),
              ),
              child: Text(
                _fallbackText(
                  en: '\\\ matches',
                  tr: '\\\ ürün',
                ),
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 11.5,
                  fontWeight: FontWeight.w700,
                  color: context.textSecondary,
                ),
              ),
            ),
            const SizedBox(width: 8),\;

if (content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync(path, content, 'utf8');
    console.log('Successfully replaced header');
} else {
    console.log('Target not found for header!');
}

const path2 = 'lib/presentation/widgets/filter_bottom_sheet.dart';
let content2 = fs.readFileSync(path2, 'utf8');

const target2 = \        _buildSingleSlider(
          label: _fallbackText(en: 'Minimum', tr: 'Minimum'),
          value: current.start.clamp(min, current.end),
          min: min,
          max: current.end,
          isDark: isDark,
          onChanged: (value) =>
              _updateRange(def.id, RangeValues(value, current.end), def),
        ),
        const SizedBox(height: 8),
        _buildSingleSlider(
          label: _fallbackText(en: 'Maximum', tr: 'Maksimum'),
          value: current.end.clamp(current.start, max),
          min: current.start,
          max: max,
          isDark: isDark,
          onChanged: (value) =>
              _updateRange(def.id, RangeValues(current.start, value), def),
        ),\;

const replacement2 = \        SliderTheme(
          data: SliderTheme.of(context).copyWith(
            activeTrackColor: AppTheme.brandCyan,
            inactiveTrackColor: context.dividerColor.withValues(alpha: 0.25),
            thumbColor: Colors.white,
            overlayColor: AppTheme.brandCyan.withValues(alpha: 0.14),
            trackHeight: 4,
            rangeThumbShape: const RoundRangeSliderThumbShape(
              enabledThumbRadius: 10,
              pressedElevation: 6,
            ),
            overlayShape: SliderComponentShape.noOverlay,
          ),
          child: RangeSlider(
            values: RangeValues(current.start.clamp(min, max), current.end.clamp(min, max)),
            min: min,
            max: max,
            onChanged: (values) => _updateRange(def.id, values, def),
          ),
        ),\;

if (content2.includes(target2)) {
    content2 = content2.replace(target2, replacement2);
    // remove _buildSingleSlider entirely 
    content2 = content2.replace(/\\s*Widget _buildSingleSlider\\\([\\s\\S]*?\\}\\n\\n/g, '\\n\\n');
    fs.writeFileSync(path2, content2, 'utf8');
    console.log('Successfully replaced slider');
} else {
    console.log('Target not found for slider!');
}
