import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../../core/api/api_client.dart';
import '../../../core/api/api_endpoints.dart';
import '../../../core/auth/auth_provider.dart';
import '../../../core/auth/auth_models.dart';

class _Task {
  const _Task({
    required this.id,
    required this.title,
    required this.completed,
    this.description,
    this.dueDate,
    this.priority,
  });

  final int id;
  final String title;
  final bool completed;
  final String? description;
  final DateTime? dueDate;
  final String? priority;

  factory _Task.fromJson(Map<String, dynamic> j) => _Task(
        id: j['id'] as int,
        title: j['title'] as String,
        completed: j['completed'] as bool? ?? false,
        description: j['description'] as String?,
        dueDate: j['due_date'] != null
            ? DateTime.tryParse(j['due_date'] as String)
            : null,
        priority: j['priority'] as String?,
      );
}

class _TimetableEntry {
  const _TimetableEntry({
    required this.id,
    required this.title,
    required this.startTime,
    required this.endTime,
    required this.completed,
    this.category,
  });

  final int id;
  final String title;
  final String startTime;
  final String endTime;
  final bool completed;
  final String? category;

  factory _TimetableEntry.fromJson(Map<String, dynamic> j) =>
      _TimetableEntry(
        id: j['id'] as int,
        title: j['title'] as String,
        startTime: j['start_time'] as String? ?? '',
        endTime: j['end_time'] as String? ?? '',
        completed: j['completed'] as bool? ?? false,
        category: j['category'] as String?,
      );
}

final _tasksProvider =
    FutureProvider.autoDispose<List<_Task>>((ref) async {
  final authState = ref.watch(authProvider).valueOrNull;
  if (authState is! AuthAuthenticated) return [];
  final dio = ref.watch(dioProvider);
  final res = await dio.get(ApiEndpoints.tasksByPerson(authState.user.id));
  final list = res.data as List<dynamic>;
  return list.map((e) => _Task.fromJson(e as Map<String, dynamic>)).toList();
});

final _todayScheduleProvider =
    FutureProvider.autoDispose<List<_TimetableEntry>>((ref) async {
  final dio = ref.watch(dioProvider);
  final today = DateFormat('yyyy-MM-dd').format(DateTime.now());
  final res = await dio.get(
    ApiEndpoints.timetable(dateFrom: today, dateTo: today),
  );
  final list = res.data as List<dynamic>;
  return list
      .map((e) => _TimetableEntry.fromJson(e as Map<String, dynamic>))
      .toList();
});

class TasksScreen extends ConsumerStatefulWidget {
  const TasksScreen({super.key});

  @override
  ConsumerState<TasksScreen> createState() => _TasksScreenState();
}

class _TasksScreenState extends ConsumerState<TasksScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final tasksAsync = ref.watch(_tasksProvider);
    final scheduleAsync = ref.watch(_todayScheduleProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Tasks'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            onPressed: () => _showAddTaskSheet(context),
          ),
        ],
        bottom: TabBar(
          controller: _tabs,
          tabs: const [
            Tab(text: 'Tasks'),
            Tab(text: "Today's Schedule"),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabs,
        children: [
          // Tasks
          tasksAsync.when(
            data: (tasks) {
              final pending =
                  tasks.where((t) => !t.completed).toList();
              final done = tasks.where((t) => t.completed).toList();
              if (tasks.isEmpty) {
                return const Center(child: Text('No tasks yet'));
              }
              return ListView(
                children: [
                  if (pending.isNotEmpty) ...[
                    _SectionHeader('Pending (${pending.length})'),
                    ...pending.map((t) => _TaskTile(
                          task: t,
                          onToggle: () => _toggleTask(t),
                        )),
                  ],
                  if (done.isNotEmpty) ...[
                    _SectionHeader('Completed (${done.length})'),
                    ...done.map((t) => _TaskTile(
                          task: t,
                          onToggle: () => _toggleTask(t),
                        )),
                  ],
                ],
              );
            },
            loading: () =>
                const Center(child: CircularProgressIndicator()),
            error: (e, _) => Center(child: Text(e.toString())),
          ),
          // Timetable
          scheduleAsync.when(
            data: (entries) {
              if (entries.isEmpty) {
                return Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.calendar_today_outlined,
                          size: 48,
                          color: Theme.of(context).colorScheme.outline),
                      const SizedBox(height: 8),
                      const Text("No schedule for today"),
                    ],
                  ),
                );
              }
              return ListView.builder(
                padding: const EdgeInsets.all(12),
                itemCount: entries.length,
                itemBuilder: (_, i) =>
                    _ScheduleCard(entry: entries[i]),
              );
            },
            loading: () =>
                const Center(child: CircularProgressIndicator()),
            error: (e, _) => Center(child: Text(e.toString())),
          ),
        ],
      ),
    );
  }

  Future<void> _toggleTask(_Task task) async {
    final dio = ref.read(dioProvider);
    try {
      await dio.patch(
        ApiEndpoints.task(task.id),
        data: {'completed': !task.completed},
      );
      ref.invalidate(_tasksProvider);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e')),
        );
      }
    }
  }

  void _showAddTaskSheet(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => const _AddTaskSheet(),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
      child: Text(
        text,
        style: Theme.of(context).textTheme.labelLarge?.copyWith(
              color: Theme.of(context).colorScheme.outline,
            ),
      ),
    );
  }
}

class _TaskTile extends StatelessWidget {
  const _TaskTile({required this.task, required this.onToggle});
  final _Task task;
  final VoidCallback onToggle;

  Color _priorityColor(BuildContext context) => switch (task.priority) {
        'high' => Colors.red,
        'medium' => Colors.orange,
        _ => Theme.of(context).colorScheme.outline,
      };

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Checkbox(
        value: task.completed,
        onChanged: (_) => onToggle(),
      ),
      title: Text(
        task.title,
        style: TextStyle(
          decoration:
              task.completed ? TextDecoration.lineThrough : null,
          color: task.completed
              ? Theme.of(context).colorScheme.outline
              : null,
        ),
      ),
      subtitle: task.dueDate != null
          ? Text(
              'Due ${DateFormat('MMM d').format(task.dueDate!)}',
              style: TextStyle(
                color: task.dueDate!.isBefore(DateTime.now()) &&
                        !task.completed
                    ? Colors.red
                    : Theme.of(context).colorScheme.outline,
                fontSize: 12,
              ),
            )
          : null,
      trailing: task.priority != null
          ? Container(
              width: 8,
              height: 8,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: _priorityColor(context),
              ),
            )
          : null,
    );
  }
}

class _ScheduleCard extends ConsumerWidget {
  const _ScheduleCard({required this.entry});
  final _TimetableEntry entry;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cs = Theme.of(context).colorScheme;

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              entry.startTime,
              style: TextStyle(
                fontWeight: FontWeight.bold,
                color: cs.primary,
                fontSize: 13,
              ),
            ),
            Text(
              entry.endTime,
              style: TextStyle(color: cs.outline, fontSize: 11),
            ),
          ],
        ),
        title: Text(
          entry.title,
          style: TextStyle(
            decoration:
                entry.completed ? TextDecoration.lineThrough : null,
            color: entry.completed ? cs.outline : null,
          ),
        ),
        subtitle: entry.category != null
            ? Text(entry.category!, style: TextStyle(color: cs.outline))
            : null,
        trailing: IconButton(
          icon: Icon(
            entry.completed
                ? Icons.check_circle
                : Icons.radio_button_unchecked,
            color: entry.completed ? Colors.green : cs.outline,
          ),
          onPressed: () async {
            final dio = ref.read(dioProvider);
            try {
              await dio.post(ApiEndpoints.timetableToggle(entry.id));
              ref.invalidate(_todayScheduleProvider);
            } catch (_) {}
          },
        ),
      ),
    );
  }
}

class _AddTaskSheet extends ConsumerStatefulWidget {
  const _AddTaskSheet();

  @override
  ConsumerState<_AddTaskSheet> createState() => _AddTaskSheetState();
}

class _AddTaskSheetState extends ConsumerState<_AddTaskSheet> {
  final _form = GlobalKey<FormState>();
  final _titleCtrl = TextEditingController();
  final _descCtrl = TextEditingController();
  String _priority = 'medium';
  DateTime? _dueDate;
  bool _submitting = false;

  @override
  void dispose() {
    _titleCtrl.dispose();
    _descCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    setState(() => _submitting = true);
    try {
      final authState = ref.read(authProvider).valueOrNull;
      if (authState is! AuthAuthenticated) return;
      final dio = ref.read(dioProvider);
      await dio.post(
        ApiEndpoints.tasks,
        data: {
          'title': _titleCtrl.text.trim(),
          'description': _descCtrl.text.trim(),
          'priority': _priority,
          'person_id': authState.user.id,
          if (_dueDate != null)
            'due_date': DateFormat('yyyy-MM-dd').format(_dueDate!),
        },
      );
      ref.invalidate(_tasksProvider);
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
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
            Text('Add Task', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 16),
            TextFormField(
              controller: _titleCtrl,
              decoration: const InputDecoration(labelText: 'Title'),
              validator: (v) =>
                  v == null || v.trim().isEmpty ? 'Required' : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _descCtrl,
              decoration:
                  const InputDecoration(labelText: 'Description (optional)'),
              maxLines: 2,
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              value: _priority,
              decoration: const InputDecoration(labelText: 'Priority'),
              items: const [
                DropdownMenuItem(value: 'low', child: Text('Low')),
                DropdownMenuItem(value: 'medium', child: Text('Medium')),
                DropdownMenuItem(value: 'high', child: Text('High')),
              ],
              onChanged: (v) => setState(() => _priority = v!),
            ),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: () async {
                final picked = await showDatePicker(
                  context: context,
                  initialDate: DateTime.now(),
                  firstDate: DateTime.now(),
                  lastDate:
                      DateTime.now().add(const Duration(days: 365)),
                );
                if (picked != null) setState(() => _dueDate = picked);
              },
              icon: const Icon(Icons.calendar_today),
              label: Text(_dueDate == null
                  ? 'Set due date'
                  : DateFormat('MMM d, y').format(_dueDate!)),
            ),
            const SizedBox(height: 20),
            FilledButton(
              onPressed: _submitting ? null : _submit,
              child: _submitting
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Add Task'),
            ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }
}
