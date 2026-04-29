const fs = require('fs');
const file = 'lib/presentation/widgets/filter_bottom_sheet.dart';
let txt = fs.readFileSync(file, 'utf8');

const replacement = `SliderTheme(
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
        ),`;

txt = txt.replace(/const SizedBox\(height: 10\),\s*_buildSingleSlider\([\s\S]*?\(value\) =>[\s\S]*?def\),\s*\),\s*const SizedBox\(height: 8\),\s*_buildSingleSlider\([\s\S]*?\(value\) =>[\s\S]*?def\),\s*\),/s, replacement);
fs.writeFileSync(file, txt, 'utf8');
console.log('done range');
