// Magaza fiyat listesi PAYLASILAN widget testi.
//
// Urun sayfasi ve karsilastirma kolonu AYNI widget'i kullanir; bu test
// siralamayi (ucuzdan pahaliya), magaza-basina-tek kuralini, siki ulke
// kuralini ve linksiz vitrin satirinin tiklanamazligini dogrular.
// (Karsilastirma ekrani giris kapisinin arkasinda oldugu icin UI'dan
// kosturulamiyor; bu test tam olarak o render yolunu calistirir.)
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:qor_ai/core/theme.dart';
import 'package:qor_ai/core/utils.dart';
import 'package:qor_ai/data/models/other_models.dart';
import 'package:qor_ai/presentation/widgets/shared/store_offer_list.dart';

ProductOfferModel _o(
  String store,
  double price, {
  String url = '',
  String country = 'TR',
}) {
  return ProductOfferModel(
    id: '$store-$price-$country',
    productId: 'p1',
    store: store,
    network: url.isEmpty ? 'epey_store' : 'epey_amazon',
    storeDomain: url.isEmpty ? '${store.toLowerCase()}.com' : '',
    country: country,
    price: price,
    currency: 'TRY',
    url: url,
    directUrl: url,
    inStock: true,
    expiresAt: DateTime.now().toUtc().add(const Duration(days: 3)),
    lastCheckedAt: DateTime.now().toUtc(),
  );
}

void main() {
  final offers = [
    _o('Beymen', 79499),
    _o('Amazon.com.tr', 76499, url: 'https://www.amazon.com.tr/dp/X'),
    _o('Turkcell Pasaj', 77999),
    _o('Hepsiburada', 76499),
    _o('Hepsiburada', 88000), // ayni magaza, pahali -> elenmeli
    _o('MediaMarkt', 10, country: 'DE'), // baska ulke -> ASLA girmez
  ];

  test('ucuzdan pahaliya siralanir, magaza basina tek satir kalir', () {
    final rows = bestPerStore(sortOffersForCountry(offers, 'TR'));
    expect(rows.map((o) => o.store).toList(),
        ['Amazon.com.tr', 'Hepsiburada', 'Turkcell Pasaj', 'Beymen']);
    expect(rows.map((o) => o.price).toList(), [76499, 76499, 77999, 79499]);
  });

  test('siki ulke kurali: baska pazarin fiyati listeye girmez', () {
    final rows = sortOffersForCountry(offers, 'TR');
    expect(rows.any((o) => o.country == 'DE'), isFalse);
  });

  testWidgets('linksiz vitrin satiri tiklanamaz, linkli satir tiklanabilir',
      (tester) async {
    tester.view.physicalSize = const Size(1080, 1600);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(MaterialApp(
      theme: AppTheme.lightTheme,
      home: Scaffold(
        body: StoreOfferList(offers: offers, country: 'TR', productId: 'p1'),
      ),
    ));
    await tester.pump();

    final inkWells = tester.widgetList<InkWell>(find.byType(InkWell)).toList();
    expect(inkWells.length, 4);
    // Ilk satir Amazon (linkli) -> onTap dolu; kalan uc vitrin satiri -> null.
    expect(inkWells.first.onTap, isNotNull);
    expect(inkWells.skip(1).every((w) => w.onTap == null), isTrue);
  });

  testWidgets('compact varyant ayni satirlari cizer', (tester) async {
    tester.view.physicalSize = const Size(600, 1200);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(MaterialApp(
      theme: AppTheme.lightTheme,
      home: Scaffold(
        body: SizedBox(
          width: 240,
          child: StoreOfferList(
            offers: offers,
            country: 'TR',
            productId: 'p1',
            compact: true,
          ),
        ),
      ),
    ));
    await tester.pump();
    expect(find.byType(StoreOfferRow), findsNWidgets(4));
  });

  _compactTests();
}

// ── Dar kolon (karsilastirma) fiyat kirpilmasi ────────────────────────────
// BUG (kullanici): karsilastirma kolonunda fiyat "₺105.999,0" diye KIRPILIYOR,
// magaza adi sifir genislige eziliyordu. Compact satir artik logo + fiyat.
void _compactTests() {
  test('compact fiyat kurussuz yazilir (dar kolonda kirpilmasin)', () {
    expect(AppUtils.formatCurrencyCompact(105999, 'TRY').contains(','), isFalse);
    expect(AppUtils.formatCurrencyCompact(105999, 'TRY').contains('105.999'), isTrue);
    // Kucuk tutarda kurus ANLAMLI -> korunur.
    expect(AppUtils.formatCurrencyCompact(9.99, 'USD').contains('.99'), isTrue);
  });

  testWidgets('compact satir 110px kolonda TASMAZ', (tester) async {
    tester.view.physicalSize = const Size(400, 800);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    final offers = [
      _o('Hepsiburada', 105999.0),
      _o('Amazon.com.tr', 120799.0, url: 'https://www.amazon.com.tr/dp/X'),
    ];
    await tester.pumpWidget(MaterialApp(
      theme: AppTheme.lightTheme,
      home: Scaffold(
        body: Center(
          child: SizedBox(
            width: 110,
            child: StoreOfferList(
              offers: offers,
              country: 'TR',
              productId: 'p1',
              compact: true,
            ),
          ),
        ),
      ),
    ));
    await tester.pump();
    // Tasma olsaydi Flutter test hatasi firlatirdi; ayrica fiyat metni TAM olmali.
    expect(find.textContaining('105.999'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
