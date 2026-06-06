import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/api/api_client.dart';
import '../../../../core/api/api_endpoints.dart';

class ExerciseScreen extends ConsumerStatefulWidget {
  const ExerciseScreen({super.key});

  @override
  ConsumerState<ExerciseScreen> createState() => _ExerciseScreenState();
}

class _ExerciseScreenState extends ConsumerState<ExerciseScreen> {
  int _count = 5;
  List<_ExerciseWord>? _words;
  bool _loading = false;
  List<_WordResult>? _results;

  Future<void> _loadWords() async {
    setState(() => _loading = true);
    try {
      final dio = ref.read(dioProvider);
      final res = await dio.get(ApiEndpoints.exerciseWords(count: _count));
      final list = (res.data as List<dynamic>)
          .map((e) => _ExerciseWord.fromJson(e as Map<String, dynamic>))
          .toList();
      setState(() {
        _words = list;
        _loading = false;
      });
    } catch (e) {
      setState(() => _loading = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e')),
        );
      }
    }
  }

  Future<void> _grade() async {
    if (_words == null) return;
    setState(() => _loading = true);
    try {
      final dio = ref.read(dioProvider);
      final res = await dio.post(
        ApiEndpoints.exerciseGrade,
        data: {
          'answers': _words!.map((w) => {
                'word_id': w.id,
                'sentence': w.sentence,
              }).toList(),
        },
      );
      final list = (res.data as List<dynamic>)
          .map((e) => _WordResult.fromJson(e as Map<String, dynamic>))
          .toList();
      setState(() {
        _results = list;
        _loading = false;
      });
    } catch (e) {
      setState(() => _loading = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error grading: $e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_results != null) return _buildResults();
    if (_words != null) return _buildWriting();
    return _buildSetup();
  }

  Widget _buildSetup() {
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Exercise')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Write sentences',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 8),
            Text(
              'Use your dictionary words in sentences and get AI feedback',
              style: TextStyle(color: cs.outline),
            ),
            const SizedBox(height: 32),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Number of words',
                        style: TextStyle(fontWeight: FontWeight.w600)),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      children: [3, 5, 8, 10].map((n) {
                        final sel = _count == n;
                        return ChoiceChip(
                          label: Text('$n'),
                          selected: sel,
                          onSelected: (_) => setState(() => _count = n),
                        );
                      }).toList(),
                    ),
                  ],
                ),
              ),
            ),
            const Spacer(),
            FilledButton(
              onPressed: _loading ? null : _loadWords,
              child: _loading
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Start Exercise'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildWriting() {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Exercise'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => setState(() => _words = null),
        ),
      ),
      body: Column(
        children: [
          Expanded(
            child: ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: _words!.length,
              itemBuilder: (_, i) => _WordInputCard(
                word: _words![i],
                index: i,
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: FilledButton(
              onPressed: _loading ? null : _grade,
              child: _loading
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Submit for Grading'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildResults() {
    return Scaffold(
      appBar: AppBar(title: const Text('Results')),
      body: Column(
        children: [
          Expanded(
            child: ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: _results!.length,
              itemBuilder: (_, i) => _ResultCard(result: _results![i]),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => setState(() {
                      _words = null;
                      _results = null;
                    }),
                    child: const Text('New Exercise'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton(
                    onPressed: () => Navigator.pop(context),
                    child: const Text('Done'),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ExerciseWord {
  _ExerciseWord({
    required this.id,
    required this.word,
    required this.meaning,
    this.exampleSentence,
  }) : sentence = '';

  final int id;
  final String word;
  final String meaning;
  final String? exampleSentence;
  String sentence;

  factory _ExerciseWord.fromJson(Map<String, dynamic> j) => _ExerciseWord(
        id: j['id'] as int,
        word: j['word'] as String,
        meaning: j['meaning'] as String,
        exampleSentence: j['example_sentence'] as String?,
      );
}

class _WordResult {
  const _WordResult({
    required this.wordId,
    required this.word,
    required this.sentence,
    required this.score,
    required this.feedback,
    this.suggestedRevision,
  });

  final int wordId;
  final String word;
  final String sentence;
  final int score;
  final String feedback;
  final String? suggestedRevision;

  factory _WordResult.fromJson(Map<String, dynamic> j) => _WordResult(
        wordId: j['word_id'] as int,
        word: j['word'] as String? ?? '',
        sentence: j['sentence'] as String? ?? '',
        score: (j['score'] as num?)?.toInt() ?? 0,
        feedback: j['feedback'] as String? ?? '',
        suggestedRevision: j['suggested_revision'] as String?,
      );
}

class _WordInputCard extends StatefulWidget {
  const _WordInputCard({required this.word, required this.index});
  final _ExerciseWord word;
  final int index;

  @override
  State<_WordInputCard> createState() => _WordInputCardState();
}

class _WordInputCardState extends State<_WordInputCard> {
  late final _ctrl = TextEditingController();

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(
                  widget.word.word,
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 16,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    '— ${widget.word.meaning}',
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.outline,
                      fontSize: 13,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _ctrl,
              decoration: const InputDecoration(
                hintText: 'Write a sentence using this word...',
                isDense: true,
              ),
              maxLines: 3,
              onChanged: (v) => widget.word.sentence = v,
            ),
          ],
        ),
      ),
    );
  }
}

class _ResultCard extends StatelessWidget {
  const _ResultCard({required this.result});
  final _WordResult result;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final color = result.score >= 8
        ? Colors.green
        : result.score >= 5
            ? Colors.orange
            : cs.error;

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(
                  result.word,
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 16,
                  ),
                ),
                const Spacer(),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: color.withOpacity(0.15),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    '${result.score}/10',
                    style: TextStyle(
                      color: color,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              result.sentence,
              style: TextStyle(
                fontStyle: FontStyle.italic,
                color: cs.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 8),
            Text(result.feedback),
            if (result.suggestedRevision != null) ...[
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: cs.primaryContainer.withOpacity(0.5),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Suggested:',
                      style: TextStyle(
                        color: cs.primary,
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(result.suggestedRevision!),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
