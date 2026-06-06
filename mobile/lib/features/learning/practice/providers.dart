import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/api/api_client.dart';
import '../../../core/api/api_endpoints.dart';
import 'models.dart';

final practiceWordsProvider = FutureProvider.family
    .autoDispose<List<PracticeWord>, ({int count, bool dueOnly})>(
        (ref, params) async {
  final dio = ref.watch(dioProvider);
  final res = await dio.get(
    ApiEndpoints.practiceWords(
      count: params.count,
      dueOnly: params.dueOnly,
    ),
  );
  final list = res.data as List<dynamic>;
  return list
      .map((e) => PracticeWord.fromJson(e as Map<String, dynamic>))
      .toList();
});

class PracticeSessionNotifier
    extends AutoDisposeAsyncNotifier<PracticeSession?> {
  @override
  Future<PracticeSession?> build() async => null;

  Future<PracticeSession?> start(String mode) async {
    state = const AsyncValue.loading();
    final result = await AsyncValue.guard(() async {
      final dio = ref.read(dioProvider);
      final res = await dio.post(ApiEndpoints.practiceSession(mode));
      return PracticeSession.fromJson(res.data as Map<String, dynamic>);
    });
    state = result;
    return result.valueOrNull;
  }

  Future<void> recordResult(int wordId, bool wasCorrect) async {
    final dio = ref.read(dioProvider);
    try {
      await dio.post(ApiEndpoints.practiceResult(wordId, wasCorrect));
    } catch (_) {}
  }

  Future<void> complete(int sessionId, int total, int correct) async {
    final dio = ref.read(dioProvider);
    try {
      await dio.post(
          ApiEndpoints.practiceComplete(sessionId, total, correct));
    } catch (_) {}
    state = const AsyncValue.data(null);
  }
}

final practiceSessionProvider =
    AsyncNotifierProvider.autoDispose<PracticeSessionNotifier, PracticeSession?>(
  PracticeSessionNotifier.new,
);
