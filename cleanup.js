const fs = require('fs');

const file1 = 'lib/presentation/widgets/filter_bottom_sheet.dart';
let txt1 = fs.readFileSync(file1, 'utf8');

// The file currently has two consecutive SliderThemes for RangeSlider...
const rx = /SliderTheme\([\s\S]*?RangeSlider\([\s\S]*?\),\s*\),\s*const SizedBox\(height: 8\),\s*SliderTheme\([\s\S]*?RangeSlider\([\s\S]*?\),\s*\),/;
const singleSliderTheme = SliderTheme(
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
        ),;

txt1 = txt1.replace(rx, singleSliderTheme);

// Also remove _buildSingleSlider entirely
txt1 = txt1.replace(/Widget _buildSingleSlider\(\{[\s\S]*?\}\s*\}\n*class _GradientSliderThumbShape/, 'class _GradientSliderThumbShape');

fs.writeFileSync(file1, txt1, 'utf8');

const file2 = 'lib/presentation/screens/browse/category_browse_screen.dart';
let txt2 = fs.readFileSync(file2, 'utf8');
txt2 = txt2.replace(/_SortDropdown\(value:\s*_sortOption,\s*onChanged:\s*_changeSortOption\),\s*if\s*\(hasFilters\)\s*\.\.\.\[(.*?)\],\s*const SizedBox\(width:\s*8\),/s, 
  '_SortDropdown(value: _sortOption, onChanged: _changeSortOption), SizedBox(width: 8),');
  
// For safety, let's also just try doing this statically 
txt2 = txt2.replace(/if \(hasFilters\) \.\.\.\[([\s\S]*?)\]/g, '');
fs.writeFileSync(file2, txt2, 'utf8');
console.log('clean done');
