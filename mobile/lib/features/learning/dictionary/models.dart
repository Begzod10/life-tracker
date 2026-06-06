class DictionaryWord {
  const DictionaryWord({
    required this.id,
    required this.word,
    required this.meaning,
    this.exampleSentence,
    this.difficulty,
    this.folderId,
    this.moduleId,
    this.folderName,
    this.moduleName,
    this.intervalDays,
    this.lapses,
    this.nextReviewAt,
  });

  final int id;
  final String word;
  final String meaning;
  final String? exampleSentence;
  final String? difficulty;
  final int? folderId;
  final int? moduleId;
  final String? folderName;
  final String? moduleName;
  final int? intervalDays;
  final int? lapses;
  final DateTime? nextReviewAt;

  String get statusLabel {
    if (intervalDays == null) return 'New';
    if (intervalDays! >= 21) return 'Mastered';
    if (lapses != null && lapses! >= 3) return 'Weak';
    final now = DateTime.now();
    if (nextReviewAt != null && nextReviewAt!.isBefore(now)) return 'Due';
    return 'Learning';
  }

  factory DictionaryWord.fromJson(Map<String, dynamic> j) => DictionaryWord(
        id: j['id'] as int,
        word: j['word'] as String,
        meaning: j['meaning'] as String,
        exampleSentence: j['example_sentence'] as String?,
        difficulty: j['difficulty'] as String?,
        folderId: j['folder_id'] as int?,
        moduleId: j['module_id'] as int?,
        folderName: j['folder_name'] as String?,
        moduleName: j['module_name'] as String?,
        intervalDays: j['interval_days'] as int?,
        lapses: j['lapses'] as int?,
        nextReviewAt: j['next_review_at'] != null
            ? DateTime.tryParse(j['next_review_at'] as String)
            : null,
      );
}

class DictionaryFolder {
  const DictionaryFolder({required this.id, required this.name});
  final int id;
  final String name;
  factory DictionaryFolder.fromJson(Map<String, dynamic> j) =>
      DictionaryFolder(id: j['id'] as int, name: j['name'] as String);
}

class DictionaryModule {
  const DictionaryModule({
    required this.id,
    required this.name,
    this.folderId,
  });
  final int id;
  final String name;
  final int? folderId;
  factory DictionaryModule.fromJson(Map<String, dynamic> j) =>
      DictionaryModule(
        id: j['id'] as int,
        name: j['name'] as String,
        folderId: j['folder_id'] as int?,
      );
}
