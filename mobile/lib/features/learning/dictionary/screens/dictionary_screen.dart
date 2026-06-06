import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models.dart';
import '../providers.dart';
import '../../../../shared/widgets/async_value_widget.dart';

class DictionaryScreen extends ConsumerStatefulWidget {
  const DictionaryScreen({super.key});

  @override
  ConsumerState<DictionaryScreen> createState() => _DictionaryScreenState();
}

class _DictionaryScreenState extends ConsumerState<DictionaryScreen> {
  final _search = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final wordsAsync = ref.watch(dictionaryWordsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Dictionary'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            onPressed: () => _showAddWordSheet(context),
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(56),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: TextField(
              controller: _search,
              decoration: const InputDecoration(
                hintText: 'Search words...',
                prefixIcon: Icon(Icons.search),
                isDense: true,
              ),
              onChanged: (v) => setState(() => _query = v.toLowerCase()),
            ),
          ),
        ),
      ),
      body: AsyncValueWidget(
        value: wordsAsync,
        data: (words) {
          final filtered = _query.isEmpty
              ? words
              : words
                  .where((w) =>
                      w.word.toLowerCase().contains(_query) ||
                      w.meaning.toLowerCase().contains(_query))
                  .toList();

          if (filtered.isEmpty) {
            return const Center(child: Text('No words found'));
          }

          return ListView.builder(
            padding: const EdgeInsets.all(8),
            itemCount: filtered.length,
            itemBuilder: (ctx, i) => _WordCard(word: filtered[i]),
          );
        },
      ),
    );
  }

  void _showAddWordSheet(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => const _AddWordSheet(),
    );
  }
}

class _WordCard extends ConsumerWidget {
  const _WordCard({required this.word});

  final DictionaryWord word;

  Color _statusColor(String status, ColorScheme cs) => switch (status) {
        'Mastered' => Colors.green,
        'Due' => cs.error,
        'Weak' => Colors.orange,
        'Learning' => cs.primary,
        _ => cs.outline,
      };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cs = Theme.of(context).colorScheme;
    final status = word.statusLabel;

    return Card(
      margin: const EdgeInsets.symmetric(vertical: 4, horizontal: 8),
      child: ListTile(
        title: Text(
          word.word,
          style: const TextStyle(fontWeight: FontWeight.w600),
        ),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(word.meaning, maxLines: 2, overflow: TextOverflow.ellipsis),
            if (word.moduleName != null)
              Text(
                word.moduleName!,
                style: TextStyle(color: cs.outline, fontSize: 12),
              ),
          ],
        ),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: _statusColor(status, cs).withOpacity(0.15),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                status,
                style: TextStyle(
                  fontSize: 11,
                  color: _statusColor(status, cs),
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            PopupMenuButton<String>(
              onSelected: (v) {
                if (v == 'delete') {
                  ref.read(addWordProvider.notifier).deleteWord(word.id);
                }
              },
              itemBuilder: (_) => [
                const PopupMenuItem(value: 'delete', child: Text('Delete')),
              ],
            ),
          ],
        ),
        isThreeLine: word.moduleName != null,
      ),
    );
  }
}

class _AddWordSheet extends ConsumerStatefulWidget {
  const _AddWordSheet();

  @override
  ConsumerState<_AddWordSheet> createState() => _AddWordSheetState();
}

class _AddWordSheetState extends ConsumerState<_AddWordSheet> {
  final _form = GlobalKey<FormState>();
  final _wordCtrl = TextEditingController();
  final _meaningCtrl = TextEditingController();
  final _exampleCtrl = TextEditingController();
  String _difficulty = 'medium';
  int? _selectedModule;

  @override
  void dispose() {
    _wordCtrl.dispose();
    _meaningCtrl.dispose();
    _exampleCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    await ref.read(addWordProvider.notifier).addWord(
          word: _wordCtrl.text.trim(),
          meaning: _meaningCtrl.text.trim(),
          example: _exampleCtrl.text.trim().isEmpty
              ? null
              : _exampleCtrl.text.trim(),
          difficulty: _difficulty,
          moduleId: _selectedModule,
        );
    if (mounted) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final modulesAsync = ref.watch(dictionaryModulesProvider);
    final addState = ref.watch(addWordProvider);

    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
        left: 16,
        right: 16,
        top: 24,
      ),
      child: Form(
        key: _form,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Add Word',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _wordCtrl,
              decoration: const InputDecoration(labelText: 'Word'),
              textCapitalization: TextCapitalization.none,
              validator: (v) =>
                  v == null || v.trim().isEmpty ? 'Required' : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _meaningCtrl,
              decoration: const InputDecoration(labelText: 'Meaning'),
              validator: (v) =>
                  v == null || v.trim().isEmpty ? 'Required' : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _exampleCtrl,
              decoration:
                  const InputDecoration(labelText: 'Example sentence (optional)'),
              maxLines: 2,
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              value: _difficulty,
              decoration: const InputDecoration(labelText: 'Difficulty'),
              items: ['easy', 'medium', 'hard']
                  .map((d) =>
                      DropdownMenuItem(value: d, child: Text(d.toUpperCase())))
                  .toList(),
              onChanged: (v) => setState(() => _difficulty = v!),
            ),
            const SizedBox(height: 12),
            modulesAsync.when(
              data: (modules) => DropdownButtonFormField<int?>(
                value: _selectedModule,
                decoration: const InputDecoration(labelText: 'Module (optional)'),
                items: [
                  const DropdownMenuItem<int?>(
                    value: null,
                    child: Text('None'),
                  ),
                  ...modules.map(
                    (m) => DropdownMenuItem(value: m.id, child: Text(m.name)),
                  ),
                ],
                onChanged: (v) => setState(() => _selectedModule = v),
              ),
              loading: () => const LinearProgressIndicator(),
              error: (_, __) => const SizedBox.shrink(),
            ),
            const SizedBox(height: 20),
            FilledButton(
              onPressed: addState.isLoading ? null : _submit,
              child: addState.isLoading
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Add Word'),
            ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }
}
