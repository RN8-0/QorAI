/// Compair - Auth Repository
/// Blueprint Section 5.1
///
/// Supported sign-in methods:
/// - Email/Password (register + sign in)
/// - Phone (OTP)
/// - Google
/// - Apple (iOS)
/// - Facebook
library;

import 'package:firebase_auth/firebase_auth.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:compair/core/errors.dart';
import 'package:compair/data/datasources/firebase_ds.dart';
import 'package:compair/data/models/user_model.dart';
import 'package:compair/domain/entities/user_entity.dart';

class AuthRepository {
  final FirebaseAuth _auth;
  final GoogleSignIn _googleSignIn;
  final FirebaseDataSource _firebaseDS;

  AuthRepository({
    FirebaseAuth? auth,
    GoogleSignIn? googleSignIn,
    required FirebaseDataSource firebaseDS,
  })  : _auth = auth ?? FirebaseAuth.instance,
        _googleSignIn = googleSignIn ?? GoogleSignIn(
          // Required for google_sign_in_android 6.x (Credential Manager API)
          serverClientId: '510980756238-budtd0gdrlk91jmim11frucvue5muhbg.apps.googleusercontent.com',
          scopes: [
            'email',
            'https://www.googleapis.com/auth/userinfo.profile',
            // Note: Birthdate and Gender require People API and extra permissions
            // 'https://www.googleapis.com/auth/user.birthday.read',
            // 'https://www.googleapis.com/auth/user.gender.read',
          ],
        ),
        _firebaseDS = firebaseDS;

  /// Listen to current user (Stream)
  Stream<User?> get authStateChanges => _auth.authStateChanges();

  /// Current user
  User? get currentUser => _auth.currentUser;

  // ════════════════════════════════════════════════════
  // ─── EMAIL / PASSWORD ───
  // ════════════════════════════════════════════════════

  /// Sign up with email
  Future<Result<UserEntity>> signUpWithEmail({
    required String email,
    required String password,
    String? displayName,
    DateTime? birthDate,
    String? gender,
  }) async {
    try {
      final userCredential = await _auth.createUserWithEmailAndPassword(
        email: email,
        password: password,
      );

      final firebaseUser = userCredential.user;
      if (firebaseUser == null) {
        return const Failure(AuthException(message: 'Registration failed'));
      }

      // Update display name
      if (displayName != null && displayName.isNotEmpty) {
        await firebaseUser.updateDisplayName(displayName);
      }

      // Send email verification
      await firebaseUser.sendEmailVerification();

      // Create user in Firestore
      final userModel = UserModel(
        uid: firebaseUser.uid,
        email: email,
        displayName: displayName ?? email.split('@').first,
        photoURL: null,
        birthDate: birthDate,
        gender: gender,
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      );
      await _firebaseDS.createUser(userModel);

      return Success(userModel);
    } on FirebaseAuthException catch (e) {
      return Failure(AuthException(
        message: _getFirebaseAuthErrorMessage(e.code),
        originalError: e,
      ));
    } catch (e) {
      return Failure(AuthException(
        message: 'Registration failed: ${e.toString()}',
        originalError: e,
      ));
    }
  }

  /// Sign in with email
  Future<Result<UserEntity>> signInWithEmail({
    required String email,
    required String password,
  }) async {
    try {
      final userCredential = await _auth.signInWithEmailAndPassword(
        email: email,
        password: password,
      );

      final firebaseUser = userCredential.user;
      if (firebaseUser == null) {
        return const Failure(AuthException(message: 'Login failed'));
      }

      var userModel = await _firebaseDS.getUser(firebaseUser.uid);
      if (userModel == null) {
        userModel = UserModel(
          uid: firebaseUser.uid,
          email: firebaseUser.email ?? '',
          displayName: firebaseUser.displayName ?? email.split('@').first,
          photoURL: firebaseUser.photoURL,
          createdAt: DateTime.now(),
          updatedAt: DateTime.now(),
        );
        await _firebaseDS.createUser(userModel);
      }

      return Success(userModel);
    } on FirebaseAuthException catch (e) {
      return Failure(AuthException(
        message: _getFirebaseAuthErrorMessage(e.code),
        originalError: e,
      ));
    } catch (e) {
      return Failure(AuthException(
        message: 'Login failed: ${e.toString()}',
        originalError: e,
      ));
    }
  }

  /// Send password reset email
  Future<Result<void>> sendPasswordResetEmail(String email) async {
    try {
      await _auth.sendPasswordResetEmail(email: email);
      return const Success(null);
    } on FirebaseAuthException catch (e) {
      return Failure(AuthException(
        message: _getFirebaseAuthErrorMessage(e.code),
        originalError: e,
      ));
    } catch (e) {
      return Failure(AuthException(
        message: 'Email could not be sent: ${e.toString()}',
        originalError: e,
      ));
    }
  }


  // ════════════════════════════════════════════════════
  // ─── GOOGLE ───
  // ════════════════════════════════════════════════════

  /// Sign in with Google
  Future<Result<UserEntity>> signInWithGoogle() async {
    try {
      final googleUser = await _googleSignIn.signIn();
      if (googleUser == null) {
        return const Failure(
            AuthException(message: 'Google login cancelled'));
      }

      final googleAuth = await googleUser.authentication;
      final credential = GoogleAuthProvider.credential(
        accessToken: googleAuth.accessToken,
        idToken: googleAuth.idToken,
      );

      final userCredential = await _auth.signInWithCredential(credential);
      final firebaseUser = userCredential.user;

      if (firebaseUser == null) {
        return const Failure(AuthException(message: 'Google login failed'));
      }

      var userModel = await _firebaseDS.getUser(firebaseUser.uid);

      if (userModel == null) {
        userModel = UserModel(
          uid: firebaseUser.uid,
          email: firebaseUser.email ?? '',
          displayName: firebaseUser.displayName ?? '',
          photoURL: firebaseUser.photoURL,
          createdAt: DateTime.now(),
          updatedAt: DateTime.now(),
        );
        await _firebaseDS.createUser(userModel);
      }

      return Success(userModel);
    } catch (e) {
      return Failure(AuthException(
        message: 'Google login failed: ${e.toString()}',
        originalError: e,
      ));
    }
  }

  // ════════════════════════════════════════════════════
  // ─── APPLE ───
  // ════════════════════════════════════════════════════

  /// Sign in with Apple
  Future<Result<UserEntity>> signInWithApple() async {
    try {
      final appleProvider = AppleAuthProvider();
      appleProvider.addScope('email');
      appleProvider.addScope('name');

      final userCredential = await _auth.signInWithProvider(appleProvider);
      final firebaseUser = userCredential.user;

      if (firebaseUser == null) {
        return const Failure(AuthException(message: 'Apple login failed'));
      }

      var userModel = await _firebaseDS.getUser(firebaseUser.uid);

      if (userModel == null) {
        userModel = UserModel(
          uid: firebaseUser.uid,
          email: firebaseUser.email ?? '',
          displayName: firebaseUser.displayName ?? '',
          photoURL: firebaseUser.photoURL,
          createdAt: DateTime.now(),
          updatedAt: DateTime.now(),
        );
        await _firebaseDS.createUser(userModel);
      }

      return Success(userModel);
    } catch (e) {
      return Failure(AuthException(
        message: 'Apple login failed: ${e.toString()}',
        originalError: e,
      ));
    }
  }

  // ════════════════════════════════════════════════════
  // ─── ANONYMOUS ───
  // ════════════════════════════════════════════════════

  /// Anonymous sign in
  Future<Result<UserEntity>> signInAnonymously() async {
    try {
      final userCredential = await _auth.signInAnonymously();
      final firebaseUser = userCredential.user;

      if (firebaseUser == null) {
        return const Failure(AuthException(message: 'Anonymous login failed'));
      }

      var userModel = await _firebaseDS.getUser(firebaseUser.uid);

      if (userModel == null) {
        userModel = UserModel(
          uid: firebaseUser.uid,
          email: '',
          displayName: 'User',
          photoURL: null,
          createdAt: DateTime.now(),
          updatedAt: DateTime.now(),
        );
        await _firebaseDS.createUser(userModel);
      }

      return Success(userModel);
    } catch (e) {
      return Failure(AuthException(
        message: 'Anonymous login failed: ${e.toString()}',
        originalError: e,
      ));
    }
  }

  // ════════════════════════════════════════════════════
  // ─── ACCOUNT LINKING ───
  // ════════════════════════════════════════════════════

  /// Link Google account to current user (for subscription purchases)
  Future<Result<void>> linkGoogleAccount() async {
    try {
      final currentUser = _auth.currentUser;
      if (currentUser == null) {
        return const Failure(AuthException(message: 'No user signed in'));
      }

      final googleUser = await _googleSignIn.signIn();
      if (googleUser == null) {
        return const Failure(AuthException(message: 'Google login cancelled'));
      }

      final googleAuth = await googleUser.authentication;
      final credential = GoogleAuthProvider.credential(
        accessToken: googleAuth.accessToken,
        idToken: googleAuth.idToken,
      );

      await currentUser.linkWithCredential(credential);
      return const Success(null);
    } on FirebaseAuthException catch (e) {
      if (e.code == 'credential-already-in-use') {
        return const Failure(AuthException(
          message: 'This Google account is already linked to another user',
        ));
      }
      if (e.code == 'provider-already-linked') {
        return const Failure(AuthException(
          message: 'A Google account is already linked to this user',
        ));
      }
      return Failure(AuthException(
        message: 'Failed to link Google account: ${e.message}',
      ));
    } catch (e) {
      return Failure(AuthException(
        message: 'Failed to link account: $e',
      ));
    }
  }

  // ════════════════════════════════════════════════════
  // ─── COMMON METHODS ───
  // ════════════════════════════════════════════════════

  /// Sign out
  Future<void> signOut() async {
    await Future.wait([
      _auth.signOut(),
      _googleSignIn.signOut(),
    ]);
  }

  /// Update user profile (after Quiz)
  Future<Result<void>> updateUserProfile({
    required String uid,
    required Map<String, dynamic> quizData,
  }) async {
    try {
      quizData['quizCompleted'] = true;
      await _firebaseDS.updateUser(uid, quizData);
      return const Success(null);
    } catch (e) {
      return Failure(FirestoreException(
        message: 'Profile could not be updated: $e',
      ));
    }
  }

  /// Map Firebase Auth error codes to user-friendly messages
  String _getFirebaseAuthErrorMessage(String code) {
    switch (code) {
      case 'email-already-in-use':
        return 'This email address is already in use';
      case 'invalid-email':
        return 'Invalid email address';
      case 'weak-password':
        return 'Password is too weak (at least 6 characters)';
      case 'user-not-found':
        return 'No user found registered with this email';
      case 'wrong-password':
        return 'Wrong password';
      case 'user-disabled':
        return 'This account has been disabled';
      case 'too-many-requests':
        return 'Too many attempts. Please try again later';
      case 'operation-not-allowed':
        return 'This login method is not enabled';
      case 'invalid-verification-code':
        return 'Invalid verification code';
      case 'invalid-verification-id':
        return 'Invalid verification ID';
      case 'invalid-credential':
        return 'Incorrect email or password';
      default:
        return 'An error occurred: $code';
    }
  }
}
