import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/api/api_client.dart';
import '../models.dart';
import '../providers.dart';

class PracticeScreen extends ConsumerWidget {
  const PracticeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(title: const Text('Practice')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Practice your words',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 8),
            Text(
              'Choose a mode to start a practice session',
              style: Theme.of(context)
                  .textTheme
                  .bodyMedium
                  ?.copyWith(color: Theme.of(context).colorScheme.outline),
            ),
            const SizedBox(height: 32),
            _ModeCard(
              icon: Icons.quiz_outlined,
              title: 'Quiz Mode',
              subtitle: 'Choose the correct meaning from 4 options',
              onTap: () => _startPractice(context, ref, 'quiz'),
            ),
            const SizedBox(height: 12),
            _ModeCard(
              icon: Icons.edit_outlined,
              title: 'Spelling Mode',
              subtitle: 'Type the word from memory',
              onTap: () => _startPractice(context, ref, 'spelling'),
            ),
            const SizedBox(height: 12),
            _ModeCard(
              icon: Icons.visibility_outlined,
              title: 'Flashcard Mode',
              subtitle: 'Flip cards and self-assess',
              onTap: () => _startPractice(context, ref, 'flashcard'),
            ),
          ],
        ),
      ),
    );
  }

  void _startPractice(BuildContext context, WidgetRef ref, String mode) {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => _PracticeSession(mode: mode)),
    );
  }
}

class _ModeCard extends StatelessWidget {
  const _ModeCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Card(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: cs.primaryContainer,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, color: cs.onPrimaryContainer),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title,
                        style: const TextStyle(fontWeight: FontWeight.w600)),
                    const SizedBox(height: 4),
                    Text(
                      subtitle,
                      style: TextStyle(
                          color: cs.outline, fontSize: 13),
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right, color: cs.outline),
            ],
          ),
        ),
      ),
    );
  }
}

class _PracticeSession extends ConsumerStatefulWidget {
  const _PracticeSession({required this.mode});
  final String mode;

  @override
  ConsumerState<_PracticeSession> createState() => _PracticeSessionState();
}

class _PracticeSessionState extends ConsumerState<_PracticeSession> {
  static const _count = 10;
  List<PracticeWord>? _words;
  int _index = 0;
  int _correct = 0;
  bool _loading = true;
  bool _done = false;
  PracticeSession? _session;

  // Flashcard / quiz state
  bool _flipped = false;
  String? _selectedChoice;
  bool? _isCorrect;
  final _spellingCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _loadWords();
  }

  @override
  void dispose() {
    _spellingCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadWords() async {
    final dio = ref.read(dioProvider);
    try {
      final params = (count: _count, dueOnly: false);
      final wordsAsync = ref.read(practiceWordsProvider(params));
      final words = await wordsAsync.when(
        data: (d) async => d,
        loading: () async {
          // wait for it
          await Future.delayed(const Duration(milliseconds: 200));
          return ref
              .read(practiceWordsProvider(params))
              .valueOrNull;
        },
        error: (_, __) async => null,
      );
      if (words == null || words.isEmpty) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('No words to practice!')),
          );
          Navigator.pop(context);
        }
        return;
      }
      try {
        final res = await dio.post(
          'http://10.0.2.2:8010/api/practice/session?mode=${widget.mode}',
        );
        _session =
            PracticeSession.fromJson(res.data as Map<String, dynamic>);
      } catch (_) {}
      setState(() {
        _words = words;
        _loading = false;
      });
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e')),
        );
        Navigator.pop(context);
      }
    }
  }

  Future<void> _recordAndAdvance(bool wasCorrect) async {
    final word = _words![_index];
    if (wasCorrect) _correct++;
    final dio = ref.read(dioProvider);
    try {
      await dio.post(
        'http://10.0.2.2:8010/api/practice/result?word_id=${word.id}&was_correct=$wasCorrect',
      );
    } catch (_) {}

    await Future.delayed(const Duration(milliseconds: 800));

    if (_index + 1 >= _words!.length) {
      if (_session != null) {
        try {
          await dio.post(
            'http://10.0.2.2:8010/api/practice/session/${_session!.id}/complete?total_questions=${_words!.length}&correct_answers=$_correct',
          );
        } catch (_) {}
      }
      setState(() => _done = true);
    } else {
      setState(() {
        _index++;
        _flipped = false;
        _selectedChoice = null;
        _isCorrect = null;
        _spellingCtrl.clear();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }
    if (_done) return _buildResults();
    return _buildQuestion();
  }

  Widget _buildQuestion() {
    final word = _words![_index];
    final progress = (_index + 1) / _words!.length;

    return Scaffold(
      appBar: AppBar(
        title: Text('${_index + 1} / ${_words!.length}'),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(4),
          child: LinearProgressIndicator(value: progress),
        ),
      ),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: switch (widget.mode) {
          'flashcard' => _FlashCard(
              word: word,
              flipped: _flipped,
              onFlip: () => setState(() => _flipped = !_flipped),
              onCorrect: () => _recordAndAdvance(true),
              onWrong: () => _recordAndAdvance(false),
            ),
          'quiz' => _QuizCard(
              word: word,
              selected: _selectedChoice,
              isCorrect: _isCorrect,
              onSelect: (choice) {
                final correct = choice == word.meaning;
                setState(() {
                  _selectedChoice = choice;
                  _isCorrect = correct;
                });
                _recordAndAdvance(correct);
              },
            ),
          _ => _SpellingCard(
              word: word,
              controller: _spellingCtrl,
              isCorrect: _isCorrect,
              onSubmit: () {
                final input = _spellingCtrl.text.trim().toLowerCase();
                final correct = word.word.toLowerCase() == input;
                setState(() => _isCorrect = correct);
                _recordAndAdvance(correct);
              },
            ),
        },
      ),
    );
  }

  Widget _buildResults() {
    final cs = Theme.of(context).colorScheme;
    final pct = (_correct / _words!.length * 100).round();

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Icon(
                pct >= 70 ? Icons.emoji_events : Icons.replay,
                size: 80,
                color: pct >= 70 ? Colors.amber : cs.outline,
              ),
              const SizedBox(height: 24),
              Text(
                '$pct%',
                textAlign: TextAlign.center,
                style: Theme.of(context)
                    .textTheme
                    .displayMedium
                    ?.copyWith(fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 8),
              Text(
                '$_correct / ${_words!.length} correct',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 40),
              FilledButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Done'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _FlashCard extends StatelessWidget {
  const _FlashCard({
    required this.word,
    required this.flipped,
    required this.onFlip,
    required this.onCorrect,
    required this.onWrong,
  });

  final PracticeWord word;
  final bool flipped;
  final VoidCallback onFlip;
  final VoidCallback onCorrect;
  final VoidCallback onWrong;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Column(
      children: [
        Expanded(
          child: GestureDetector(
            onTap: onFlip,
            child: Card(
              color: cs.surfaceContainerHighest,
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        flipped ? word.meaning : word.word,
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.headlineMedium,
                      ),
                      if (!flipped)
                        Padding(
                          padding: const EdgeInsets.only(top: 16),
                          child: Text(
                            'Tap to reveal',
                            style: TextStyle(color: cs.outline),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
        if (flipped) ...[
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: onWrong,
                  icon: const Icon(Icons.close, color: Colors.red),
                  label: const Text('Wrong'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.red,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: FilledButton.icon(
                  onPressed: onCorrect,
                  icon: const Icon(Icons.check),
                  label: const Text('Correct'),
                ),
              ),
            ],
          ),
        ],
      ],
    );
  }
}

class _QuizCard extends StatelessWidget {
  const _QuizCard({
    required this.word,
    required this.selected,
    required this.isCorrect,
    required this.onSelect,
  });

  final PracticeWord word;
  final String? selected;
  final bool? isCorrect;
  final void Function(String) onSelect;

  @override
  Widget build(BuildContext context) {
    final choices = word.choices ?? [word.meaning];

    return Column(
      children: [
        Card(
          color: Theme.of(context).colorScheme.surfaceContainerHighest,
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Center(
              child: Text(
                word.word,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.headlineMedium,
              ),
            ),
          ),
        ),
        const SizedBox(height: 24),
        Expanded(
          child: ListView(
            children: choices.map((c) {
              Color? color;
              if (selected != null) {
                if (c == word.meaning) {
                  color = Colors.green;
                } else if (c == selected) {
                  color = Colors.red;
                }
              }
              return Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: OutlinedButton(
                  onPressed: selected == null ? () => onSelect(c) : null,
                  style: OutlinedButton.styleFrom(
                    side: color != null
                        ? BorderSide(color: color, width: 2)
                        : null,
                    padding: const EdgeInsets.all(16),
                  ),
                  child: Text(c, textAlign: TextAlign.center),
                ),
              );
            }).toList(),
          ),
        ),
      ],
    );
  }
}

class _SpellingCard extends StatelessWidget {
  const _SpellingCard({
    required this.word,
    required this.controller,
    required this.isCorrect,
    required this.onSubmit,
  });

  final PracticeWord word;
  final TextEditingController controller;
  final bool? isCorrect;
  final VoidCallback onSubmit;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Card(
          color: Theme.of(context).colorScheme.surfaceContainerHighest,
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Center(
              child: Text(
                word.meaning,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.titleLarge,
              ),
            ),
          ),
        ),
        const SizedBox(height: 24),
        TextField(
          controller: controller,
          enabled: isCorrect == null,
          autofocus: true,
          decoration: InputDecoration(
            labelText: 'Type the word',
            suffixIcon: isCorrect == null
                ? null
                : Icon(
                    isCorrect! ? Icons.check_circle : Icons.cancel,
                    color: isCorrect! ? Colors.green : Colors.red,
                  ),
          ),
          onSubmitted: (_) => isCorrect == null ? onSubmit() : null,
        ),
        const SizedBox(height: 16),
        if (isCorrect == null)
          FilledButton(
            onPressed: onSubmit,
            child: const Text('Submit'),
          ),
        if (isCorrect == false)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
              'Correct: ${word.word}',
              style: const TextStyle(color: Colors.green),
            ),
          ),
      ],
    );
  }
}
