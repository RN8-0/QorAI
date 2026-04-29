import re

with open('lib/presentation/widgets/filter_bottom_sheet.dart', 'r', encoding='utf-8') as f:
    content = f.read()

pattern = re.compile(r'\s*Widget _buildSingleSlider\(.*?\)\s*\{.*?(?:Slider\(.*?\)|\}).*?\)\s*;\s*\}', re.DOTALL)
new_content = pattern.sub('', content)

with open('lib/presentation/widgets/filter_bottom_sheet.dart', 'w', encoding='utf-8') as f:
    f.write(new_content)
