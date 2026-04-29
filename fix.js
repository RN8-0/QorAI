const fs = require('fs');

const file1 = 'lib/presentation/screens/browse/category_browse_screen.dart';
let txt1 = fs.readFileSync(file1, 'utf8');

const t1 = '            _SortDropdown(value: _sortOption, onChanged: _changeSortOption),\n            if (hasFilters) ...[\n              const SizedBox(width: 8),\n              Container(\n                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),\n                decoration: BoxDecoration(\n                  color: context.backgroundColor,\n                  borderRadius: BorderRadius.circular(999),\n                  border: Border.all(color: context.dividerColor),\n                ),\n                child: Text(\n                  _fallbackText(\n                    en: \'\ matches\',\n                    tr: \'\ ürün\',\n                  ),\n                  style: GoogleFonts.plusJakartaSans(\n                    fontSize: 11.5,\n                    fontWeight: FontWeight.w700,\n                    color: context.textSecondary,\n                  ),\n                ),\n              ),\n            ],\n            const SizedBox(width: 8),';
            
const r1 = '            _SortDropdown(value: _sortOption, onChanged: _changeSortOption),\n            const SizedBox(width: 8),\n            Container(\n              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),\n              decoration: BoxDecoration(\n                color: context.backgroundColor,\n                borderRadius: BorderRadius.circular(999),\n                border: Border.all(color: context.dividerColor),\n              ),\n              child: Text(\n                _fallbackText(\n                  en: \'\ matches\',\n                  tr: \'\ ürün\',\n                ),\n                style: GoogleFonts.plusJakartaSans(\n                  fontSize: 11.5,\n                  fontWeight: FontWeight.w700,\n                  color: context.textSecondary,\n                ),\n              ),\n            ),\n            const SizedBox(width: 8),';

txt1 = txt1.replace(t1, r1).replace(t1.replace(/\n/g, '\r\n'), r1.replace(/\n/g, '\r\n'));
fs.writeFileSync(file1, txt1, 'utf8');


const file2 = 'lib/presentation/widgets/filter_bottom_sheet.dart';
let txt2 = fs.readFileSync(file2, 'utf8');

const rx = /_buildSingleSlider\([\s\S]*?def\),\n        \),/;

const r2 = SliderTheme(
          data: SliderTheme.of(context).copyWith(
            activeTrackColor: AppTheme.brandCyan,
            inactiveTrackColor: context.dividerColor.withValues({alpha: 0.25}),
            thumbColor: Colors.white,
            overlayColor: AppTheme.brandCyan.withValues({alpha: 0.14}),
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

txt2 = txt2.replace(rx, r2.replace(/\{/g, '').replace(/\}/g, ''));
txt2 = txt2.replace(/\s*Widget _buildSingleSlider\([\s\S]*?\}\s*\}\n*$/, '\n}\n');
fs.writeFileSync(file2, txt2, 'utf8');
console.log('done!');
