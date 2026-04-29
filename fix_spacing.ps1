$c = Get-Content lib/presentation/widgets/filter_bottom_sheet.dart -Raw
$c = $c -replace '(?s)Wrap\(\s*spacing: 8,\s*runSpacing: 8,\s*children: visibleOptions\.map','Wrap(
              spacing: 6,
              runSpacing: 6,
              children: visibleOptions.map'
$c = $c -replace '(?s)padding: const EdgeInsets.symmetric\(\s*horizontal: 14,\s*vertical: 9,\s*\)','padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 7,
                    )'
$c = $c -replace '(?s)Text\(\s*_displayOptionLabel\(opt.label\),\s*maxLines: 1,\s*overflow: TextOverflow.ellipsis,\s*style: GoogleFonts.plusJakartaSans\(\s*fontSize: 12.5,','Text(
                          _displayOptionLabel(opt.label),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 11.5,'
Set-Content lib/presentation/widgets/filter_bottom_sheet.dart $c
