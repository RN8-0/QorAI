/// Compair - Auth Repository
library;

import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:pocketbase/pocketbase.dart';
import 'package:flutter/foundation.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:compair/core/errors.dart';
import 'package:compair/core/pb_client.dart';
import 'package:compair/data/datasources/pb_ds.dart';
import 'package:compair/data/models/user_model.dart';
import 'package:compair/domain/entities/user_entity.dart';

const String _kGoogleWebClientId =
    '510980756238-budtd0gdrlk91jmim11frucvue5muhbg.apps.googleusercontent.com';

class AuthRepository {
  final PocketBase _pb;
  final PbDataSource _pbDS;

  AuthRepository({PocketBase? pbClient, required PbDataSource pbDS})
    : _pb = pbClient ?? pb,
      _pbDS = pbDS;

  Stream<String?> get authStateChanges async* {
    yield _currentUid;
    await for (final event in _pb.authStore.onChange) {
      yield event.record?.id;
    }
  }

  String? get currentUserId => _currentUid;
  String? get _currentUid =>
      _pb.authStore.isValid ? _pb.authStore.record?.id : null;

  // signUpWithEmail, signInWithEmail, sendPasswordResetEmail removed
  // — email/password auth has been disabled in favor of social logins.

  /// Google Sign-In via native SDK -> PB hook (/api/auth/google).
  /// On mobile we use the free `google_sign_in` package to obtain a Google
  /// ID token (audience = our web client id), then POST it to a PB JS hook
  /// which validates it with Google's tokeninfo endpoint and upserts the
  /// user in `users`. No Firebase, no client secret on device.
  Future<Result<UserEntity>> signInWithGoogle() async {
    try {
      final google = GoogleSignIn(
        scopes: const ['email', 'profile'],
        serverClientId: _kGoogleWebClientId,
      );
      await google.signOut();
      final account = await google.signIn();
      if (account == null) {
        return const Failure(
          AuthException(message: 'Google ile giriş iptal edildi'),
        );
      }
      final gAuth = await account.authentication;
      final idToken = gAuth.idToken;
      if (idToken == null || idToken.isEmpty) {
        return const Failure(
          AuthException(
            message: 'Google kimlik doğrulaması başarısız (idToken yok)',
          ),
        );
      }

      final httpResp = await http
          .post(
            Uri.parse(
              'https://yv5z6sfeiogrv3jn4djss832.46.225.95.201.sslip.io/api/auth/google',
            ),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({'idToken': idToken}),
          )
          .timeout(
            const Duration(seconds: 20),
            onTimeout: () => throw Exception(
              'Sunucu yanıt vermedi (timeout). İnternet bağlantınızı kontrol edin.',
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
          AuthException(message: 'Sunucudan geçersiz yanıt alındı'),
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
      return Failure(
        AuthException(
          message: 'Google ile giriş yapılamadı: ${e.toString()}',
          originalError: e,
        ),
      );
    }
  }

  Future<Result<UserEntity>> signInWithApple() async {
    return _signInWithOAuth2('apple', scopes: ['name', 'email']);
  }

  Future<Result<UserEntity>> signInWithFacebook() async {
    return _signInWithOAuth2('facebook', scopes: ['email', 'public_profile']);
  }

  Future<Result<UserEntity>> signInWithX() async {
    return _signInWithOAuth2('twitter', scopes: ['tweet.read', 'users.read']);
  }

  /// Generic PocketBase OAuth2 flow for social providers.
  /// Uses PB's realtime subscription: opens browser → PB handles redirect →
  /// auth code comes back via SSE → PB exchanges code for tokens.
  Future<Result<UserEntity>> _signInWithOAuth2(
    String providerName, {
    List<String> scopes = const [],
  }) async {
    try {
      final authFuture = _pb.collection('users').authWithOAuth2(
        providerName,
        (url) async {
          await launchUrl(url, mode: LaunchMode.externalApplication);
        },
        scopes: scopes,
      );

      // Timeout prevents infinite loading if user closes browser
      final authData = await authFuture.timeout(
        const Duration(minutes: 3),
        onTimeout: () => throw TimeoutException(
          'Giriş zaman aşımına uğradı. Lütfen tekrar deneyin.',
        ),
      );

      // Best-effort profile sync — only backfill empty fields
      _syncProfileFromOAuth(authData, providerName);

      return Success(UserModel.fromPb(authData.record));
    } on ClientException catch (e) {
      final errStr = e.originalError?.toString() ?? '';
      if (errStr.contains('missing provider')) {
        return Failure(AuthException(
          message:
              '${_providerDisplayName(providerName)} ile giriş henüz yapılandırılmadı. Lütfen daha sonra tekrar deneyin.',
        ));
      }
      return Failure(
        AuthException(message: _getPbErrorMsg(e), originalError: e),
      );
    } on TimeoutException {
      return Failure(
        const AuthException(
          message: 'Giriş zaman aşımına uğradı. Lütfen tekrar deneyin.',
        ),
      );
    } catch (e) {
      final msg = e.toString().toLowerCase();
      if (msg.contains('cancel') ||
          msg.contains('dismiss') ||
          msg.contains('user_cancelled')) {
        return const Failure(
          AuthException(message: 'Giriş iptal edildi'),
        );
      }
      debugPrint('[auth] _signInWithOAuth2($providerName) error: $e');
      return Failure(
        AuthException(
          message:
              '${_providerDisplayName(providerName)} ile giriş yapılamadı. Lütfen tekrar deneyin.',
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
        final providerAvatar = (meta['avatarURL'] ?? meta['avatarUrl'])
                ?.toString()
                .trim() ??
            '';

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
          final updated =
              await _pb.collection('users').update(record.id, body: updates);
          final updatedJson = updated.toJson();
          if (providerAvatar.isNotEmpty && existingPhoto.isEmpty) {
            updatedJson['photoURL'] = providerAvatar;
          }
          _pb.authStore.save(
            authData.token,
            RecordModel.fromJson(updatedJson),
          );
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
      case 'twitter':
        return 'X';
      case 'apple':
        return 'Apple';
      default:
        return provider;
    }
  }

  Future<Result<UserEntity>> signInAnonymously() async {
    // Guest mode — no real auth, just navigate as unauthenticated user.
    return const Failure(
      AuthException(message: 'Guest mode: no account created'),
    );
  }

  Future<Result<void>> linkGoogleAccount() async => const Success(null);

  Future<void> signOut() async {
    _pb.authStore.clear();
  }

  Future<Result<void>> deleteCurrentUser() async {
    final uid = _currentUid;
    if (uid == null) {
      return const Failure(
        AuthException(message: 'Silinecek oturum acik bir hesap bulunamadi'),
      );
    }

    try {
      try {
        final recentlyViewed = await _pb
            .collection('recently_viewed')
            .getFullList(filter: 'userId = "$uid"');
        for (final record in recentlyViewed) {
          await _pb.collection('recently_viewed').delete(record.id);
        }
      } catch (e) {
        debugPrint(
          '[auth] failed to delete related recently_viewed records: $e',
        );
      }

      await _pb.collection('users').delete(uid);
      _pb.authStore.clear();
      return const Success(null);
    } on ClientException catch (e) {
      return Failure(
        AuthException(message: _getPbErrorMsg(e), originalError: e),
      );
    } catch (e) {
      return Failure(
        AuthException(
          message: 'Hesap silinemedi: ${e.toString()}',
          originalError: e,
        ),
      );
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
      if (data['email'] != null) return 'This email address is already in use';
      if (data['password'] != null) {
        return 'Password is too short (min 8 chars)';
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
      return 'Invalid data provided';
    }
    if (e.statusCode == 401) return 'Incorrect email or password';
    if (e.statusCode == 403) return 'This action is not allowed';
    if (e.statusCode == 404) return 'No account found for this email';
    return 'An error occurred (${e.statusCode})';
  }

  String _mapGoogleAuthError(String code, String detail, int status) {
    switch (code) {
      case 'invalid_token':
        return 'Google kimlik doğrulaması başarısız. Lütfen tekrar deneyin.';
      case 'audience_mismatch':
        return 'Google yapılandırma hatası (audience_mismatch). Lütfen destek ile iletişime geçin.';
      case 'missing_idToken':
        return 'Google token alınamadı. Lütfen tekrar deneyin.';
      case 'tokeninfo_failed':
        return 'Google ile bağlantı kurulamadı. İnternet bağlantınızı kontrol edin.';
      case 'hook_fatal':
        return 'Sunucu hatası: $detail';
      default:
        if (status == 401) return 'Google ile kimlik doğrulaması başarısız.';
        if (status >= 500) {
          return 'Sunucu geçici olarak kullanılamıyor. Lütfen tekrar deneyin.';
        }
        return code.isNotEmpty
            ? '$code: $detail'
            : (detail.isNotEmpty ? detail : 'Bilinmeyen hata ($status)');
    }
  }
}
