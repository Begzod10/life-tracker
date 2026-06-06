import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/api/api_client.dart';
import '../../../core/api/api_endpoints.dart';
import 'models.dart';

final dictionaryWordsProvider =
    FutureProvider.autoDispose<List<DictionaryWord>>((ref) async {
  final dio = ref.watch(dioProvider);
  final res = await dio.get(ApiEndpoints.dictionary);
  final list = res.data as List<dynamic>;
  return list
      .map((e) => DictionaryWord.fromJson(e as Map<String, dynamic>))
      .toList();
});

final dictionaryFoldersProvider =
    FutureProvider.autoDispose<List<DictionaryFolder>>((ref) async {
  final dio = ref.watch(dioProvider);
  final res = await dio.get(ApiEndpoints.dictionaryFolders);
  final list = res.data as List<dynamic>;
  return list
      .map((e) => DictionaryFolder.fromJson(e as Map<String, dynamic>))
      .toList();
});

final dictionaryModulesProvider =
    FutureProvider.autoDispose<List<DictionaryModule>>((ref) async {
  final dio = ref.watch(dioProvider);
  final res = await dio.get(ApiEndpoints.dictionaryModules);
  final list = res.data as List<dynamic>;
  return list
      .map((e) => DictionaryModule.fromJson(e as Map<String, dynamic>))
      .toList();
});

class AddWordNotifier extends AutoDisposeAsyncNotifier<void> {
  @override
  Future<void> build() async {}

  Future<void> addWord({
    required String word,
    required String meaning,
    String? example,
    String? difficulty,
    int? folderId,
    int? moduleId,
  }) async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() async {
      final dio = ref.read(dioProvider);
      await dio.post(
        ApiEndpoints.dictionary,
        data: {
          'word': word,
          'meaning': meaning,
          if (example != null) 'example_sentence': example,
          if (difficulty != null) 'difficulty': difficulty,
          if (folderId != null) 'folder_id': folderId,
          if (moduleId != null) 'module_id': moduleId,
        },
      );
      ref.invalidate(dictionaryWordsProvider);
    });
  }

  Future<void> deleteWord(int id) async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() async {
      final dio = ref.read(dioProvider);
      await dio.delete(ApiEndpoints.dictionaryItem(id));
      ref.invalidate(dictionaryWordsProvider);
    });
  }
}

final addWordProvider =
    AsyncNotifierProvider.autoDispose<AddWordNotifier, void>(
  AddWordNotifier.new,
);
