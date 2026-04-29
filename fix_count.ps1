$c = Get-Content lib/presentation/screens/browse/category_browse_screen.dart -Raw
$c = $c -replace '(?s)// Count chip removed per UX decision\s*const SizedBox.shrink\(\),', '// Product count
            Text(
              _fetchingAll || _loading
                  ? ''...''
                  : ''${_totalProductCount > 0 ? _totalProductCount : _visibleProducts.length} ${_fallbackText(en: ''Products'', tr: ''Ürün'')}'',
              style: GoogleFonts.plusJakartaSans(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: context.textSecondary,
              ),
            ),'
Set-Content lib/presentation/screens/browse/category_browse_screen.dart $c
