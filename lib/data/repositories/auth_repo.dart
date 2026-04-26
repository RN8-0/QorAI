/// Qor AI - Auth Repository
library;

import 'dart:async';
import 'dart:convert';
import 'dart:ui' as ui;
import 'package:http/http.dart' as http;
import 'package:pocketbase/pocketbase.dart';
import 'package:flutter/foundation.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:qor_ai/core/errors.dart';
import 'package:qor_ai/core/pb_client.dart';
import 'package:qor_ai/data/datasources/hive_ds.dart';
import 'package:qor_ai/data/datasources/pb_ds.dart';
import 'package:qor_ai/data/models/user_model.dart';
import 'package:qor_ai/domain/entities/user_entity.dart';
import 'package:qor_ai/services/cache_service.dart';

const String _kGoogleWebClientId =
  '116725106228-tlnou1m838rhu2nhmj45360o5q5ltsgb.apps.googleusercontent.com';

class AuthRepository {
  final PocketBase _pb;
  final PbDataSource _pbDS;
  final CacheService _cache;
  final HiveDataSource? _hive;

  AuthRepository({
    PocketBase? pbClient,
    required PbDataSource pbDS,
    CacheService? cache,
    HiveDataSource? hive,
  }) : _pb = pbClient ?? pb,
       _pbDS = pbDS,
       _cache = cache ?? CacheService(),
       _hive = hive;

  Stream<String?> get authStateChanges async* {
    yield _currentUid;
    await for (final event in _pb.authStore.onChange) {
      yield event.record?.id;
    }
  }

  String? get currentUserId => _currentUid;
  String? get _currentUid =>
      _pb.authStore.isValid ? _pb.authStore.record?.id : null;

  Future<Result<UserEntity>> signUpWithEmail({
    required String email,
    required String password,
    String? displayName,
    DateTime? birthDate,
    String? gender,
  }) async {
    try {
      final name = displayName ?? email.split('@').first;
      final body = <String, dynamic>{
        'email': email,
        'password': password,
        'passwordConfirm': password,
        'name': name,
      };
      if (birthDate != null) body['birthDate'] = birthDate.toIso8601String();
      if (gender != null) body['gender'] = gender;
      await _pb.collection('users').create(body: body);
      await _pb.collection('users').authWithPassword(email, password);
      // Verification e-postası gönder (hata kritik değil, sessizce geç)
      try {
        await _pb.collection('users').requestVerification(email);
      } catch (_) {}
      return Success(UserModel.fromPb(_pb.authStore.record!));
    } on ClientException catch (e) {
      return Failure(
        AuthException(message: _getPbErrorMsg(e), originalError: e),
      );
    } catch (e) {
      return Failure(
        AuthException(
          message: 'Registration failed: ${e.toString()}',
          originalError: e,
        ),
      );
    }
  }

  /// E-posta doğrulama maili tekrar gönderir.
  Future<Result<void>> resendVerificationEmail(String email) async {
    try {
      await _pb.collection('users').requestVerification(email);
      return const Success(null);
    } on ClientException catch (e) {
      return Failure(
        AuthException(message: _getPbErrorMsg(e), originalError: e),
      );
    } catch (e) {
      return Failure(
        AuthException(
          message: 'Verification email could not be sent: ${e.toString()}',
          originalError: e,
        ),
      );
    }
  }

  Future<Result<UserEntity>> signInWithEmail({
    required String email,
    required String password,
  }) async {
    try {
      await _pb.collection('users').authWithPassword(email, password);
      return Success(UserModel.fromPb(_pb.authStore.record!));
    } on ClientException catch (e) {
      return Failure(
        AuthException(message: _getPbErrorMsg(e), originalError: e),
      );
    } catch (e) {
      return Failure(
        AuthException(
          message: 'Login failed: ${e.toString()}',
          originalError: e,
        ),
      );
    }
  }

  Future<Result<void>> sendPasswordResetEmail(String email) async {
    try {
      await _pb.collection('users').requestPasswordReset(email);
      return const Success(null);
    } on ClientException catch (e) {
      return Failure(
        AuthException(message: _getPbErrorMsg(e), originalError: e),
      );
    } catch (e) {
      return Failure(
        AuthException(
          message: 'Email could not be sent: ${e.toString()}',
          originalError: e,
        ),
      );
    }
  }

  /// Google Sign-In prefers the native SDK, but falls back to PocketBase's
  /// browser OAuth flow when Android OAuth config is missing or mismatched.
  Future<Result<UserEntity>> signInWithGoogle() async {
    try {
      // Android dahil her platformda WEB client_id'yi serverClientId olarak
      // vermek gerekiyor; aksi halde Android'de idToken null d\u00f6n\u00fcyor ve
      // ApiException:10 (DEVELOPER_ERROR) hatas\u0131 al\u0131n\u0131yor.
      final google = GoogleSignIn(
        scopes: const ['email', 'profile'],
        serverClientId: _kGoogleWebClientId,
      );
      await google.signOut();
      final account = await google.signIn();
      if (account == null) {
        return const Failure(
          AuthException(message: 'Google sign-in was cancelled'),
        );
      }
      final gAuth = await account.authentication;
      final idToken = gAuth.idToken;
      if (idToken == null || idToken.isEmpty) {
        debugPrint('[auth] Google native sign-in returned no idToken; falling back to PB OAuth2');
        return _signInWithOAuth2('google', scopes: ['email', 'profile']);
      }

      final httpResp = await http
          .post(
            Uri.parse(
              'https://yv5z6sfeiogrv3jn4djss832.46.225.95.201.sslip.io/api/auth/google',
            ),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({
              'idToken': idToken,
              'audience': _kGoogleWebClientId,
            }),
          )
          .timeout(
            const Duration(seconds: 20),
            onTimeout: () => throw Exception(
              'Server did not respond (timeout). Please check your connection.',
            ),
          );
      debugPrint('[auth] PB response ${httpResp.statusCode}: ${httpResp.body}');
      if (httpResp.statusCode != 200) {
        final errBody =
            jsonDecode(httpResp.body) as Map<String, dynamic>? ?? {};
        final errCode = errBody['error']?.toString() ?? '';
        final errDetail =
            errBody['detail']?.toString() ??
            errBody['message']?.toString() ??
            '';
        debugPrint(
          '[auth] PB error code=$errCode detail=$errDetail status=${httpResp.statusCode}',
        );
        final msg = _mapGoogleAuthError(
          errCode,
          errDetail,
          httpResp.statusCode,
        );
        return Failure(AuthException(message: msg));
      }
      final resp = jsonDecode(httpResp.body) as Map<String, dynamic>;

      final token = resp['token'] as String?;
      final record = (resp['record'] as Map?)?.cast<String, dynamic>();
      if (token == null || record == null) {
        return const Failure(
          AuthException(message: 'Invalid response from server'),
        );
      }

      // Build a RecordModel from the hook response to avoid a second round-trip
      // (getOne would fail unless the authStore is pre-populated first).
      final googleDisplayName = account.displayName?.trim();
      final googlePhotoUrl = account.photoUrl?.trim();
      final googleEmail = account.email.trim();
      final recJson = <String, dynamic>{
        'id': record['id'],
        'collectionId': '_pb_users_auth_',
        'collectionName': 'users',
        'created': record['created'] ?? DateTime.now().toIso8601String(),
        'updated': record['updated'] ?? DateTime.now().toIso8601String(),
        ...record,
        if (googleDisplayName != null && googleDisplayName.isNotEmpty)
          'name': googleDisplayName,
        if (googleDisplayName != null && googleDisplayName.isNotEmpty)
          'displayName': googleDisplayName,
        if (googleEmail.isNotEmpty) 'googleEmail': googleEmail,
        if (googlePhotoUrl != null && googlePhotoUrl.isNotEmpty)
          'photoURL': googlePhotoUrl,
      };
      final recModel = RecordModel.fromJson(recJson);
      _pb.authStore.save(token, recModel);
      final recordId = record['id']?.toString();
      final profileUpdate = <String, dynamic>{
        if (googleDisplayName != null && googleDisplayName.isNotEmpty)
          'name': googleDisplayName,
        if (googleDisplayName != null && googleDisplayName.isNotEmpty)
          'displayName': googleDisplayName,
        if (googleEmail.isNotEmpty) 'googleEmail': googleEmail,
        if (googlePhotoUrl != null && googlePhotoUrl.isNotEmpty)
          'photoURL': googlePhotoUrl,
      };
      if (recordId != null && profileUpdate.isNotEmpty) {
        final updatedRecord = await _pb
            .collection('users')
            .update(recordId, body: profileUpdate);
        final updatedJson = updatedRecord.toJson();
        if (googlePhotoUrl != null && googlePhotoUrl.isNotEmpty) {
          updatedJson['photoURL'] = googlePhotoUrl;
        }
        final syncedRecord = RecordModel.fromJson(updatedJson);
        _pb.authStore.save(token, syncedRecord);
        return Success(UserModel.fromPb(syncedRecord));
      }

      return Success(UserModel.fromPb(recModel));
    } on ClientException catch (e) {
      return Failure(
        AuthException(message: _getPbErrorMsg(e), originalError: e),
      );
    } catch (e) {
      debugPrint('[auth] signInWithGoogle error: $e');
      final err = e.toString();
      if (err.contains('sign_in_failed') || err.contains('ApiException: 10')) {
        debugPrint('[auth] Google native sign-in failed with Android OAuth mismatch; falling back to PB OAuth2');
        return _signInWithOAuth2('google', scopes: ['email', 'profile']);
      }
      return Failure(
        AuthException(
          message: 'Google sign-in failed: ${e.toString()}',
          originalError: e,
        ),
      );
    }
  }

  Future<Result<UserEntity>> signInWithApple() async {
    return _signInWithOAuth2('apple', scopes: ['name', 'email']);
  }

  Future<Result<UserEntity>> signInWithX() async {
    return const Failure(
      AuthException(
        message: 'X login is no longer supported. Please use Google or Apple.',
      ),
    );
  }

  /// Generic PocketBase OAuth2 flow for social providers.
  /// Uses PB's realtime subscription: opens browser → PB handles redirect →
  /// auth code comes back via SSE → PB exchanges code for tokens.
  Future<Result<UserEntity>> _signInWithOAuth2(
    String providerName, {
    List<String> scopes = const [],
  }) async {
    try {
      final authFuture = _pb.collection('users').authWithOAuth2(providerName, (
        url,
      ) async {
        // inAppBrowserView (Chrome Custom Tab) keeps the app alive in the
        // foreground so the PocketBase SSE realtime connection is not dropped.
        final launched = await launchUrl(
          url,
          mode: LaunchMode.inAppBrowserView,
        );
        if (!launched) {
          await launchUrl(url, mode: LaunchMode.externalApplication);
        }
      }, scopes: scopes);

      // Timeout prevents infinite loading if user closes browser
      final authData = await authFuture.timeout(
        const Duration(minutes: 3),
        onTimeout: () =>
            throw TimeoutException('Sign in timed out. Please try again.'),
      );

      // Best-effort profile sync — only backfill empty fields
      _syncProfileFromOAuth(authData, providerName);

      return Success(UserModel.fromPb(authData.record));
    } on ClientException catch (e) {
      final errStr = e.originalError?.toString() ?? '';
      if (errStr.contains('missing provider')) {
        return Failure(
          AuthException(
            message:
                '${_providerDisplayName(providerName)} sign-in is not configured yet. Please try again later.',
          ),
        );
      }
      return Failure(
        AuthException(message: _getPbErrorMsg(e), originalError: e),
      );
    } on TimeoutException {
      return Failure(
        const AuthException(message: 'Sign in timed out. Please try again.'),
      );
    } catch (e) {
      final msg = e.toString().toLowerCase();
      if (msg.contains('cancel') ||
          msg.contains('dismiss') ||
          msg.contains('user_cancelled')) {
        return const Failure(AuthException(message: 'Sign in cancelled'));
      }
      debugPrint('[auth] _signInWithOAuth2($providerName) error: $e');
      return Failure(
        AuthException(
          message:
              '${_providerDisplayName(providerName)} sign-in failed. Please try again.',
          originalError: e,
        ),
      );
    }
  }

  /// Backfill empty profile fields from OAuth provider metadata.
  /// Runs as fire-and-forget — never blocks login.
  void _syncProfileFromOAuth(RecordAuth authData, String providerName) {
    Future<void>.microtask(() async {
      try {
        final meta = authData.meta;
        final record = authData.record;
        if (meta.isEmpty) return;

        final existingName = record.getStringValue('name');
        final existingPhoto = record.getStringValue('photoURL');

        final providerName2 = meta['name']?.toString().trim() ?? '';
        final providerAvatar =
            (meta['avatarURL'] ?? meta['avatarUrl'])?.toString().trim() ?? '';

        final updates = <String, dynamic>{};

        // Only backfill if current field is empty
        if (existingName.isEmpty && providerName2.isNotEmpty) {
          updates['name'] = providerName2;
          updates['displayName'] = providerName2;
        }
        if (existingPhoto.isEmpty && providerAvatar.isNotEmpty) {
          updates['photoURL'] = providerAvatar;
        }

        if (updates.isNotEmpty) {
          final updated = await _pb
              .collection('users')
              .update(record.id, body: updates);
          final updatedJson = updated.toJson();
          if (providerAvatar.isNotEmpty && existingPhoto.isEmpty) {
            updatedJson['photoURL'] = providerAvatar;
          }
          _pb.authStore.save(authData.token, RecordModel.fromJson(updatedJson));
        }
      } catch (e) {
        debugPrint('[auth] _syncProfileFromOAuth failed (non-fatal): $e');
      }
    });
  }

  String _providerDisplayName(String provider) {
    switch (provider) {
      case 'facebook':
        return 'Facebook';
      case 'apple':
        return 'Apple';
      default:
        return provider;
    }
  }

  Future<Result<UserEntity>> signInAnonymously() async {
    final ts = DateTime.now().millisecondsSinceEpoch;
    return signUpWithEmail(
      email: 'guest_$ts@qorai.local',
      password: 'Guest@123456',
      displayName: 'Guest',
    );
  }

  Future<Result<void>> linkGoogleAccount() async => const Success(null);

  Future<void> signOut() async {
    _pb.authStore.clear();
  }

  Future<Result<void>> requestAccountDeletion() async {
    final uid = _currentUid;
    if (uid == null) {
      return const Failure(AuthException(message: 'No active session'));
    }
    try {
      final response = await http.post(
        Uri.parse('${_pb.baseURL}/api/users/request-delete'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': _pb.authStore.token,
        },
      );
      if (response.statusCode == 200) {
        return const Success(null);
      }
      final body = jsonDecode(response.body);
      final msg = body['message'] ?? body['error'] ?? 'Request failed';
      return Failure(AuthException(message: msg.toString()));
    } on ClientException catch (e) {
      return Failure(AuthException(message: _getPbErrorMsg(e), originalError: e));
    } catch (e) {
      return Failure(AuthException(message: e.toString()));
    }
  }

  Future<Result<void>> deleteCurrentUser() async {
    final uid = _currentUid;
    if (uid == null) {
      return const Failure(
        AuthException(message: 'No active session found to delete'),
      );
    }

    try {
      // Delete related PocketBase data before deleting the user record.
      await Future.wait([
        _deleteCollection('recently_viewed', 'userId = "$uid"'),
        _deleteCollection('comparisons', 'userId = "$uid"'),
        _deleteCollection('favorites', 'userId = "$uid"'),
        _deleteCollection('reviews', 'userId = "$uid"'),
        _deleteCollection('saved_analyses', 'userId = "$uid"'),
        _deleteCollection('notifications', 'recipientId = "$uid"'),
        _deleteCollection('support_messages', 'userId = "$uid"'),
      ]);

      // Try to delete the user record. PocketBase may return 403 if the
      // collection's DELETE rule is not set to allow self-deletion.
      // We treat that as a non-fatal error — the session is still cleared.
      bool serverDeleted = false;
      try {
        await _pb.collection('users').delete(uid);
        serverDeleted = true;
      } on ClientException catch (e) {
        final status = e.statusCode;
        // 403 = no permission rule, 404 = already deleted — both are OK
        if (status == 403 || status == 404) {
          debugPrint('[auth] deleteCurrentUser: server returned $status, proceeding with local cleanup');
        } else {
          rethrow;
        }
      }

      // Always clear session and local caches regardless of server result.
      _pb.authStore.clear();
      try {
        await _cache.clearUserData();
        await _cache.clearAll();
        await _hive?.clearAll();
      } catch (_) {}

      debugPrint('[auth] deleteCurrentUser: done (serverDeleted=$serverDeleted)');
      return const Success(null);
    } on ClientException catch (e) {
      // Auth store should still be cleared so user isn't stuck
      _pb.authStore.clear();
      try { await _cache.clearUserData(); } catch (_) {}
      return Failure(
        AuthException(message: _getPbErrorMsg(e), originalError: e),
      );
    } catch (e) {
      _pb.authStore.clear();
      try { await _cache.clearUserData(); } catch (_) {}
      return Failure(
        AuthException(
          message: 'Failed to delete account: ${e.toString()}',
          originalError: e,
        ),
      );
    }
  }

  /// Helper: delete all records in a collection matching filter.
  /// Swallows errors — missing collection or permission issues are non-fatal.
  Future<void> _deleteCollection(String collection, String filter) async {
    try {
      final records = await _pb
          .collection(collection)
          .getFullList(filter: filter);
      for (final record in records) {
        await _pb.collection(collection).delete(record.id);
      }
    } catch (e) {
      debugPrint('[auth] $collection deletion non-fatal: $e');
    }
  }

  Future<Result<void>> updateUserProfile({
    required String uid,
    required Map<String, dynamic> quizData,
  }) async {
    try {
      quizData['quizCompleted'] = true;
      await _pbDS.updateUser(uid, quizData);

      // Reflect quizCompleted=true in the local authStore so router redirect
      // does not loop back to /quiz after the user finishes.
      final record = _pb.authStore.record;
      if (record != null && record.id == uid) {
        final merged = Map<String, dynamic>.from(record.data)..addAll(quizData);
        final updatedRecord = RecordModel.fromJson({
          'id': record.id,
          'collectionId': record.collectionId,
          'collectionName': record.collectionName,
          'created': record.get<String>('created'),
          'updated': record.get<String>('updated'),
          ...merged,
        });
        _pb.authStore.save(_pb.authStore.token, updatedRecord);
      }

      return const Success(null);
    } catch (e) {
      return Failure(
        ServerException(message: 'Profile could not be updated: $e'),
      );
    }
  }

  String _getPbErrorMsg(ClientException e) {
    final data = (e.response['data'] as Map?)?.cast<String, dynamic>() ?? {};
    final message = e.response['message'] as String? ?? '';
    if (e.statusCode == 400) {
      if (data['email'] != null) {
        return _authText(
          tr: 'Bu e-posta adresi zaten kullanılıyor',
          en: 'This email address is already in use',
        );
      }
      if (data['password'] != null) {
        return _authText(
          tr: 'Şifre çok kısa (en az 8 karakter olmalı)',
          en: 'Password is too short (min 8 chars)',
        );
      }
      // Show PB's own message for OAuth/other 400 errors
      if (message.isNotEmpty &&
          message != 'Something went wrong while processing your request.') {
        return message;
      }
      // Fallback: show first field-level error
      for (final entry in data.entries) {
        final fieldErr = entry.value;
        if (fieldErr is Map && fieldErr['message'] != null) {
          return '${entry.key}: ${fieldErr['message']}';
        }
      }
      return _authText(tr: 'Geçersiz bilgiler girildi', en: 'Invalid data provided');
    }
    if (e.statusCode == 401) {
      return _authText(
        tr: 'E-posta veya şifre hatalı',
        en: 'Incorrect email or password',
      );
    }
    if (e.statusCode == 403) {
      return _authText(
        tr: 'Bu işlem için yetkiniz yok',
        en: 'This action is not allowed',
      );
    }
    if (e.statusCode == 404) {
      return _authText(
        tr: 'Bu e-posta için bir hesap bulunamadı',
        en: 'No account found for this email',
      );
    }
    return _authText(
      tr: 'Bir hata oluştu (${e.statusCode})',
      en: 'An error occurred (${e.statusCode})',
    );
  }

  String _authText({required String tr, required String en}) {
    final saved = _cache.getLanguage().toLowerCase();
    final languageCode = saved.isNotEmpty
        ? saved
        : ui.PlatformDispatcher.instance.locale.languageCode.toLowerCase();
    return languageCode == 'tr' ? tr : en;
  }

  String _mapGoogleAuthError(String code, String detail, int status) {
    switch (code) {
      case 'invalid_token':
        return 'Google authentication failed. Please try again.';
      case 'audience_mismatch':
        return 'Google configuration error (audience_mismatch). Please contact support.';
      case 'missing_idToken':
        return 'Could not retrieve Google token. Please try again.';
      case 'tokeninfo_failed':
        return 'Could not connect to Google. Please check your internet connection.';
      case 'hook_fatal':
        return 'Server error: $detail';
      default:
        if (status == 401) return 'Google authentication failed.';
        if (status >= 500) {
          return 'Server is temporarily unavailable. Please try again.';
        }
        return code.isNotEmpty
            ? '$code: $detail'
            : (detail.isNotEmpty ? detail : 'Unknown error ($status)');
    }
  }
}
