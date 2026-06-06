import 'package:dio/dio.dart';
import '../api/api_client.dart';
import '../api/api_endpoints.dart';
import '../storage/secure_storage.dart';
import 'auth_models.dart';

class AuthRepository {
  const AuthRepository(this._dio);

  final Dio _dio;

  Future<AuthUser> login(String email, String password) async {
    try {
      final res = await _dio.post(
        ApiEndpoints.login,
        data: {'username': email, 'password': password},
        options: Options(contentType: 'application/x-www-form-urlencoded'),
      );
      final accessToken = res.data['access_token'] as String;
      final refreshToken = res.data['refresh_token'] as String? ?? accessToken;
      await SecureStorage.saveTokens(
        accessToken: accessToken,
        refreshToken: refreshToken,
      );
      return getMe();
    } on DioException catch (e) {
      throw apiError(e);
    }
  }

  Future<AuthUser> getMe() async {
    try {
      final res = await _dio.get(ApiEndpoints.me);
      return AuthUser.fromJson(res.data as Map<String, dynamic>);
    } on DioException catch (e) {
      throw apiError(e);
    }
  }

  Future<void> logout() async {
    try {
      await _dio.post(ApiEndpoints.logout);
    } catch (_) {
      // best-effort
    } finally {
      await SecureStorage.clear();
    }
  }
}
