part of '../product_detail_screen.dart';

class _DeferredVariantsSection extends StatefulWidget {
  final ProductEntity product;
  const _DeferredVariantsSection({required this.product});

  @override
  State<_DeferredVariantsSection> createState() => _DeferredVariantsSectionState();
}

class _DeferredVariantsSectionState extends State<_DeferredVariantsSection> {
  bool _ready = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      Future.delayed(const Duration(milliseconds: 900), () {
        if (!mounted) return;
        setState(() => _ready = true);
      });
    });
  }

  @override
  Widget build(BuildContext context) {
    if (!_ready) return const SizedBox.shrink();
    return _VariantsSection(product: widget.product);
  }
}

class _VariantsSection extends ConsumerWidget {
  final ProductEntity product;
  const _VariantsSection({required this.product});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final variantsAsync = ref.watch(productVariantsProvider(product));
    return variantsAsync.when(
      loading: () => const SizedBox.shrink(),
      error: (_, _) => const SizedBox.shrink(),
      data: (variants) {
        if (variants.isEmpty) return const SizedBox.shrink();
        final all = [product, ...variants]..sort((a, b) => a.name.compareTo(b.name));

        // Deduplicate by storage label — keep current product or first match
        final seen = <String>{};
        final unique = <ProductEntity>[];
        for (final v in all) {
          final label = _storageLabel(v);
          if (seen.contains(label)) {
            // If the duplicate is the current product, replace the existing one
            if (v.id == product.id) {
              unique.removeWhere((u) => _storageLabel(u) == label);
              unique.add(v);
            }
            continue;
          }
          seen.add(label);
          unique.add(v);
        }
        if (unique.length <= 1) return const SizedBox.shrink();

        return Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Padding(
                padding: const EdgeInsets.only(left: 4, bottom: 6),
                child: Text(
                  Localizations.localeOf(context).languageCode.toLowerCase() == 'tr'
                      ? 'Mevcut Modeller'
                      : 'Available Models',
                  style: TextStyle(
                    fontSize: 11, fontWeight: FontWeight.w600,
                    color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5),
                    letterSpacing: 0.5,
                  ),
                ),
              ),
              SizedBox(
                height: 32,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: unique.length,
                  separatorBuilder: (_, _) => const SizedBox(width: 8),
                  itemBuilder: (context, i) => _VariantChip(
                    product: unique[i],
                    isSelected: unique[i].id == product.id,
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  /// Extract storage-only label for deduplication
  static String _storageLabel(ProductEntity p) {
    return _VariantChip._extractStorageOnly(p);
  }
}

class _VariantChip extends StatelessWidget {
  final ProductEntity product;
  final bool isSelected;
  const _VariantChip({required this.product, required this.isSelected});

  /// Extract storage-only value, ignoring RAM differences.
  /// For "16 GB / 2048 GB" → "2048 GB" (largest = storage)
  /// For "128 GB" → "128 GB"
  static String _extractStorageOnly(ProductEntity p) {
    // Find all GB/TB matches in product name
    final allMatches = RegExp(r'\b(\d+)\s*(TB|GB)\b', caseSensitive: false)
        .allMatches(p.name)
        .toList();

    if (allMatches.length >= 2) {
      // Multiple matches (e.g. "16 GB / 2048 GB") → pick largest = storage
      int bestVal = 0;
      String bestLabel = '';
      for (final m in allMatches) {
        final num = int.tryParse(m.group(1)!) ?? 0;
        final unit = m.group(2)!.toUpperCase();
        final mb = unit == 'TB' ? num * 1024 : num;
        if (mb > bestVal) {
          bestVal = mb;
          bestLabel = '$num $unit';
        }
      }
      if (bestLabel.isNotEmpty) return bestLabel;
    }
    if (allMatches.length == 1) {
      return allMatches.first.group(0)!.trim().toUpperCase();
    }

    // Try RAM/storage combo (e.g. "8/256") → extract storage part
    final comboMatch = RegExp(r'\b(\d+)/(\d+)\b').firstMatch(p.name);
    if (comboMatch != null) {
      return '${comboMatch.group(2)} GB';
    }

    // Try extracting from specs
    final specStorage = _extractStorageFromSpecsStatic(p);
    if (specStorage != null) return specStorage;

    // Fallback: differentiating suffix
    final parts = p.name.trim().split(' ');
    if (parts.length >= 2) return '${parts[parts.length - 2]} ${parts.last}';
    return parts.last;
  }

  static String? _extractStorageFromSpecsStatic(ProductEntity p) {
    final storageRegex = RegExp(r'(\d+)\s*(GB|TB)', caseSensitive: false);
    for (final entry in p.keySpecs.entries) {
      final key = entry.key.toLowerCase();
      if (key.contains('storage') || key.contains('capacity') || key.contains('rom') || key.contains('internal')) {
        final m = storageRegex.firstMatch(entry.value);
        if (m != null) return '${m.group(1)} ${m.group(2)!.toUpperCase()}';
      }
    }
    for (final section in p.specSections.entries) {
      final sKey = section.key.toLowerCase();
      if ((sKey.contains('storage') || sKey.contains('memory')) && section.value is Map) {
        for (final spec in (section.value as Map).entries) {
          final sk = spec.key.toString().toLowerCase();
          if (sk.contains('internal') || sk.contains('storage') || sk.contains('capacity')) {
            final m = storageRegex.firstMatch(spec.value.toString());
            if (m != null) return '${m.group(1)} ${m.group(2)!.toUpperCase()}';
          }
        }
      }
    }
    return null;
  }

  String get _variantLabel => _extractStorageOnly(product);

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final primary = theme.colorScheme.primary;
    return GestureDetector(
      onTap: isSelected ? null : () {
        context.push('/product/${product.id}');
      },
      child: Container(
        height: 32,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: isSelected ? primary : Colors.transparent,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: isSelected ? primary : theme.colorScheme.outline.withValues(alpha: 0.4),
            width: 1,
          ),
        ),
        child: Text(
          _variantLabel,
          style: GoogleFonts.plusJakartaSans(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: isSelected
                ? theme.colorScheme.onPrimary
                : theme.colorScheme.onSurface.withValues(alpha: 0.7),
          ),
        ),
      ),
    );
  }
}
