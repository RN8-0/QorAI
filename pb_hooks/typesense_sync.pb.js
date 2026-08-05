/// pb_hooks/typesense_sync.pb.js
/// PocketBase server-side hook: keeps the Typesense `products` index in sync
/// with the PocketBase `products` collection.
///
/// Fires on every create / update / delete — even when the change is made
/// directly in PocketBase's built-in admin UI (/_/), not just via the
/// Qor AI admin web panel.
///
/// DİKKAT — JSVM KAPSAM KURALI: PocketBase her handler'ı İZOLE bir kapsamda
/// çalıştırır; dosya kapsamında tanımlı fonksiyonlar handler'ın İÇİNDEN
/// GÖRÜNMEZ. Yardımcılar eskiden bu dosyada tanımlıydı ve handler'lardan
/// çağrılıyordu; sonuç: her ürün kaydında
///     [typesense_sync] create hook error: ReferenceError: tsUpsert is not defined
/// yani senkron hiç çalışmadı, yeni ürünler Typesense'e YALNIZCA Score Engine
/// ve gecelik backfill sayesinde girdi. Yardımcılar artık
/// pb_hooks/typesense_lib.js modülünde ve her handler onu KENDİ İÇİNDE
/// require ediyor. Aynı tuzak search_proxy.pb.js'te de not edilmiş.

onRecordAfterCreateSuccess(function (e) {
  try {
    require(`${__hooks}/typesense_lib.js`).tsUpsert(e.record);
  } catch (err) {
    console.log('[typesense_sync] create hook error:', err);
  }
}, 'products');

onRecordAfterUpdateSuccess(function (e) {
  try {
    require(`${__hooks}/typesense_lib.js`).tsUpsert(e.record);
  } catch (err) {
    console.log('[typesense_sync] update hook error:', err);
  }
}, 'products');

onRecordAfterDeleteSuccess(function (e) {
  try {
    require(`${__hooks}/typesense_lib.js`).tsDelete(e.record.id);
  } catch (err) {
    console.log('[typesense_sync] delete hook error:', err);
  }
}, 'products');
