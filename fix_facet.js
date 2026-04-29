const fs = require('fs');
const file = 'lib/data/datasources/pb_ds.dart';
let txt = fs.readFileSync(file, 'utf8');

txt = txt.replace(/Future<List<FilterOption>> getTypesenseBrandFacets\(\{[^]*?return options;\n    \} catch/m,
\Future<Map<String, List<FilterOption>>> getTypesenseFacets({
    required String category,
    int maxFacetValues = 300,
    List<String> facets = const ['brand'],
  }) async {
    try {
      final sw = Stopwatch()...start();
      final variants = _categoryVariants(category);
      final filterBy = variants.length == 1
          ? 'category:=\'
          : 'category:[\]';
      final response = await _dio.get(
        '/collections/products/documents/search',
        queryParameters: {
          'q': '*',
          'filter_by': filterBy,
          'per_page': 0,
          'facet_by': facets.join(','),
          'max_facet_values': maxFacetValues,
        },
      );
      sw.stop();
      final Map<String, List<FilterOption>> results = {};
      final facetCounts = response.data['facet_counts'] as List?;
      if (facetCounts != null) {
        for (final fc in facetCounts) {
          final fieldName = fc['field_name'] as String;
          final counts = fc['counts'] as List? ?? [];
          final options = <FilterOption>[];
          for (final c in counts) {
            final value = c['value']?.toString() ?? '';
            if (value.isNotEmpty) {
              options.add(
                FilterOption(
                  id: value.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), '_'),
                  label: value,
                ),
              );
            }
          }
          results[fieldName] = options;
        }
      }
      return results;
    } catch\);

fs.writeFileSync(file, txt, 'utf8');
console.log('done');
