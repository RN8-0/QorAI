import re

with open('lib/presentation/widgets/filter_bottom_sheet.dart', 'r', encoding='utf-8') as f:
    content = f.read()

pattern = re.compile(
    r'_buildSingleSlider\(\s*label:\s*_fallbackText\(en:\s*\'Minimum\',\s*tr:\s*\'Minimum\'\).*?\)\),\s*Row\(', 
    re.DOTALL
)

replacement = '''SliderTheme(
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
          ),
          Row('''

new_content = pattern.sub(replacement, content)

with open('lib/presentation/widgets/filter_bottom_sheet.dart', 'w', encoding='utf-8') as f:
    f.write(new_content)
