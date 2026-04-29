import re

with open('lib/presentation/screens/browse/category_browse_screen.dart', 'r', encoding='utf-8') as f:
    content = f.read()

target = '''            _SortDropdown(value: _sortOption, onChanged: _changeSortOption),
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
                    en: '\ matches',
                    tr: '\ ürün',
                  ),
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w700,
                    color: context.textSecondary,
                  ),
                ),
              ),
            ],
            const SizedBox(width: 8),'''

replacement = '''            _SortDropdown(value: _sortOption, onChanged: _changeSortOption),
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
                  en: '\ matches',
                  tr: '\ ürün',
                ),
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 11.5,
                  fontWeight: FontWeight.w700,
                  color: context.textSecondary,
                ),
              ),
            ),
            const SizedBox(width: 8),'''

if target in content:
    with open('lib/presentation/screens/browse/category_browse_screen.dart', 'w', encoding='utf-8') as f:
        f.write(content.replace(target, replacement))
    print('Successfully replaced')
else:
    print('Target not found')
