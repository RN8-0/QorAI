$c = Get-Content lib/presentation/screens/browse/category_browse_screen.dart -Raw

$c = $c -replace '        // Inject brand options from Typesense facets when available —\r?\n        // avoids fetching all products just for the brand list\.\r?\n        if \(_brandFacetOptions\.isNotEmpty\) \{\r?\n          defs = defs\r?\n              \.map<FilterDefinition>\(\(def\) \{\r?\n                if \(def\.id == ''brand''\) return def\.withOptions\(_brandFacetOptions\);\r?\n                return def;\r?\n              \}\)\r?\n              \.toList\(growable: false\);\r?\n        \}', 
"        if (_typesenseFacets.isNotEmpty) {
          defs = defs
              .map<FilterDefinition>((def) {
                String facetKey = def.id;
                if (def.id == 'storage') facetKey = 'internal_storage';
                if (_typesenseFacets.containsKey(facetKey)) {
                  return def.withOptions(_typesenseFacets[facetKey]!);
                }
                return def;
              })
              .toList(growable: false);
        }"

Set-Content lib/presentation/screens/browse/category_browse_screen.dart $c
