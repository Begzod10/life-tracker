import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../dictionary/screens/dictionary_screen.dart';
import '../practice/screens/practice_screen.dart';
import '../exercise/screens/exercise_screen.dart';
import '../dictionary/providers.dart';

class LearningScreen extends ConsumerWidget {
  const LearningScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cs = Theme.of(context).colorScheme;
    final statsAsync = ref.watch(dictionaryWordsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Learning')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          statsAsync.when(
            data: (words) {
              final mastered = words.where((w) => w.statusLabel == 'Mastered').length;
              final due = words.where((w) => w.statusLabel == 'Due').length;
              return _StatsRow(
                total: words.length,
                mastered: mastered,
                due: due,
              );
            },
            loading: () => const SizedBox(
              height: 80,
              child: Center(child: CircularProgressIndicator()),
            ),
            error: (_, __) => const SizedBox.shrink(),
          ),
          const SizedBox(height: 20),
          Text('Study', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 12),
          _FeatureCard(
            icon: Icons.menu_book_outlined,
            title: 'Dictionary',
            subtitle: 'Browse and manage your word collection',
            color: cs.primaryContainer,
            onColor: cs.onPrimaryContainer,
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const DictionaryScreen()),
            ),
          ),
          const SizedBox(height: 10),
          _FeatureCard(
            icon: Icons.psychology_outlined,
            title: 'Practice',
            subtitle: 'Quiz, spelling, and flashcard modes',
            color: cs.secondaryContainer,
            onColor: cs.onSecondaryContainer,
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const PracticeScreen()),
            ),
          ),
          const SizedBox(height: 10),
          _FeatureCard(
            icon: Icons.edit_note_outlined,
            title: 'Exercise',
            subtitle: 'Write sentences and get AI feedback',
            color: cs.tertiaryContainer,
            onColor: cs.onTertiaryContainer,
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const ExerciseScreen()),
            ),
          ),
        ],
      ),
    );
  }
}

class _StatsRow extends StatelessWidget {
  const _StatsRow({
    required this.total,
    required this.mastered,
    required this.due,
  });

  final int total;
  final int mastered;
  final int due;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        _StatChip(label: 'Total', value: total, color: Colors.blue),
        const SizedBox(width: 8),
        _StatChip(label: 'Mastered', value: mastered, color: Colors.green),
        const SizedBox(width: 8),
        _StatChip(label: 'Due', value: due, color: Colors.orange),
      ],
    );
  }
}

class _StatChip extends StatelessWidget {
  const _StatChip({
    required this.label,
    required this.value,
    required this.color,
  });

  final String label;
  final int value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
        decoration: BoxDecoration(
          color: color.withOpacity(0.12),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          children: [
            Text(
              '$value',
              style: TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.bold,
                color: color,
              ),
            ),
            Text(label, style: const TextStyle(fontSize: 12)),
          ],
        ),
      ),
    );
  }
}

class _FeatureCard extends StatelessWidget {
  const _FeatureCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.color,
    required this.onColor,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final Color color;
  final Color onColor;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
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
                  color: color,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, color: onColor),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title,
                        style: const TextStyle(fontWeight: FontWeight.w600)),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.outline,
                        fontSize: 13,
                      ),
                    ),
                  ],
                ),
              ),
              Icon(
                Icons.chevron_right,
                color: Theme.of(context).colorScheme.outline,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
