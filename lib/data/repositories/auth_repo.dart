/// Compair - Auth Repository
library;

import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:pocketbase/pocketbase.dart';
import 'package:flutter/foundation.dart';
import 'package:google_sign_in/google_sign_in.dart';
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

  Future<Result<UserEntity>> signUpWithEmail({
    required String email,
    required String password,
    String? displayName,
    DateTime? birthDate,
    String? gender,
  }) async {
    try {
      final body = <String, dynamic>{
        'email': email,
        'password': password,
        'passwordConfirm': password,
        'name': displayName ?? email.split('@').first,
      };
      if (birthDate != null) body['birthDate'] = birthDate.toIso8601String();
      if (gender != null) body['gender'] = gender;
      await _pb.collection('users').create(body: body);
      await _pb.collection('users').authWithPassword(email, password);
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
    // Apple Sign-In requires PB HTTPS + Apple provider configuration.
    // Will be enabled when SSL is configured on the PocketBase server.
    return const Failure(
      AuthException(message: 'Apple login will be available soon'),
    );
  }

  Future<Result<UserEntity>> signInAnonymously() async {
    final ts = DateTime.now().millisecondsSinceEpoch;
    return signUpWithEmail(
      email: 'guest_$ts@compair.local',
      password: 'Guest@123456',
      displayName: 'Guest',
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
