const fs = require('fs');
const file = 'lib/presentation/widgets/filter_bottom_sheet.dart';
let txt = fs.readFileSync(file, 'utf8');

txt = txt.replace(/Widget _buildSingleSlider\(\{[\s\S]*?\{\s*return Column\([\s\S]*?\}\s*\}\r?\n*\r?\n*class _GradientSliderThumbShape/s, 'class _GradientSliderThumbShape');
fs.writeFileSync(file, txt, 'utf8');
