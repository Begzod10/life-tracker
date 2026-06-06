class PracticeWord {
  const PracticeWord({
    required this.id,
    required this.word,
    required this.meaning,
    this.exampleSentence,
    this.difficulty,
    this.choices,
  });

  final int id;
  final String word;
  final String meaning;
  final String? exampleSentence;
  final String? difficulty;
  final List<String>? choices;

  factory PracticeWord.fromJson(Map<String, dynamic> j) => PracticeWord(
        id: j['id'] as int,
        word: j['word'] as String,
        meaning: j['meaning'] as String,
        exampleSentence: j['example_sentence'] as String?,
        difficulty: j['difficulty'] as String?,
        choices: (j['choices'] as List<dynamic>?)
            ?.map((e) => e as String)
            .toList(),
      );
}

class PracticeSession {
  const PracticeSession({required this.id, required this.mode});
  final int id;
  final String mode;

  factory PracticeSession.fromJson(Map<String, dynamic> j) => PracticeSession(
        id: j['id'] as int,
        mode: j['mode'] as String? ?? 'quiz',
      );
}
