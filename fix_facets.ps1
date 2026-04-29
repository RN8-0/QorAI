$c = Get-Content lib/presentation/screens/browse/category_browse_screen.dart -Raw

$c = $c -replace '_brandFacetsLoaded', '_facetsLoaded'
$c = $c -replace '_cachedBrandFacetsLoaded', '_cachedFacetsLoaded'
$c = $c -replace '_loadBrandFacets', '_loadFacets'

Set-Content lib/presentation/screens/browse/category_browse_screen.dart $c
