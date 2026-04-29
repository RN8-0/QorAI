const fs = require('fs');

const file1 = 'lib/presentation/screens/browse/category_browse_screen.dart';
let txt1 = fs.readFileSync(file1, 'utf8');

const target1 = '            _SortDropdown(value: _sortOption, onChanged: _changeSortOption),\r\n            if (hasFilters) ...[\r\n              const SizedBox(width: 8),\r\n              Container(\r\n                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),\r\n                decoration: BoxDecoration(\r\n                  color: context.backgroundColor,\r\n                  borderRadius: BorderRadius.circular(999),\r\n                  border: Border.all(color: context.dividerColor),\r\n                ),\r\n                child: Text(\r\n                  _fallbackText(\r\n                    en: \'\ matches\',\r\n                    tr: \'\ ürün\',\r\n                  ),\r\n                  style: GoogleFonts.plusJakartaSans(\r\n                    fontSize: 11.5,\r\n                    fontWeight: FontWeight.w700,\r\n                    color: context.textSecondary,\r\n                  ),\r\n                ),\r\n              ),\r\n            ],\r\n            const SizedBox(width: 8),';
            
const replace1 = '            _SortDropdown(value: _sortOption, onChanged: _changeSortOption),\r\n            const SizedBox(width: 8),\r\n            Container(\r\n              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),\r\n              decoration: BoxDecoration(\r\n                color: context.backgroundColor,\r\n                borderRadius: BorderRadius.circular(999),\r\n                border: Border.all(color: context.dividerColor),\r\n              ),\r\n              child: Text(\r\n                _fallbackText(\r\n                  en: \'\ matches\',\r\n                  tr: \'\ ürün\',\r\n                ),\r\n                style: GoogleFonts.plusJakartaSans(\r\n                  fontSize: 11.5,\r\n                  fontWeight: FontWeight.w700,\r\n                  color: context.textSecondary,\r\n                ),\r\n              ),\r\n            ),\r\n            const SizedBox(width: 8),';

txt1 = txt1.replace(target1, replace1);
fs.writeFileSync(file1, txt1, 'utf8');


const file2 = 'lib/presentation/widgets/filter_bottom_sheet.dart';
let txt2 = fs.readFileSync(file2, 'utf8');

const rx = /_buildSingleSlider\([\s\S]*?def\),\n        \),/;
const rx2 = /_buildSingleSlider\([\s\S]*?def\),\r\n        \),/;

const r2 = 'SliderTheme(data: SliderTheme.of(context).copyWith(activeTrackColor: AppTheme.brandCyan,inactiveTrackColor: context.dividerColor.withValues(alpha: 0.25),thumbColor: Colors.white,overlayColor: AppTheme.brandCyan.withValues(alpha: 0.14),trackHeight: 4,rangeThumbShape: const RoundRangeSliderThumbShape(enabledThumbRadius: 10,pressedElevation: 6,),overlayShape: SliderComponentShape.noOverlay,),child: RangeSlider(values: RangeValues(current.start.clamp(min, max), current.end.clamp(min, max)),min: min,max: max,onChanged: (values) => _updateRange(def.id, values, def),),),';

txt2 = txt2.replace(rx, r2).replace(rx2, r2);
txt2 = txt2.replace(/\s*Widget _buildSingleSlider\([\s\S]*?\}\s*\}\r?\n*$/, '\n}\n');
fs.writeFileSync(file2, txt2, 'utf8');
console.log('done!');
