import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../../core/api/api_client.dart';
import '../../../core/api/api_endpoints.dart';
import '../../../core/auth/auth_provider.dart';
import '../../../core/auth/auth_models.dart';

class _Expense {
  const _Expense({
    required this.id,
    required this.amount,
    required this.description,
    required this.category,
    required this.date,
  });

  final int id;
  final double amount;
  final String description;
  final String category;
  final DateTime date;

  factory _Expense.fromJson(Map<String, dynamic> j) => _Expense(
        id: j['id'] as int,
        amount: (j['amount'] as num).toDouble(),
        description: j['description'] as String? ?? '',
        category: j['category'] as String? ?? 'other',
        date: DateTime.tryParse(j['date'] as String? ?? '') ?? DateTime.now(),
      );
}

class _Budget {
  const _Budget({
    required this.id,
    required this.name,
    required this.amount,
    required this.spent,
    required this.category,
  });

  final int id;
  final String name;
  final double amount;
  final double spent;
  final String category;

  double get progress => amount > 0 ? (spent / amount).clamp(0, 1) : 0;
  bool get isOverBudget => spent > amount;

  factory _Budget.fromJson(Map<String, dynamic> j) => _Budget(
        id: j['id'] as int,
        name: j['name'] as String,
        amount: (j['amount'] as num).toDouble(),
        spent: (j['spent'] as num?)?.toDouble() ?? 0,
        category: j['category'] as String? ?? 'general',
      );
}

final _expensesProvider =
    FutureProvider.autoDispose<List<_Expense>>((ref) async {
  final authState = ref.watch(authProvider).valueOrNull;
  if (authState is! AuthAuthenticated) return [];
  final dio = ref.watch(dioProvider);
  final res =
      await dio.get(ApiEndpoints.expensesByPerson(authState.user.id));
  final list = res.data as List<dynamic>;
  return list.map((e) => _Expense.fromJson(e as Map<String, dynamic>)).toList();
});

final _budgetsProvider =
    FutureProvider.autoDispose<List<_Budget>>((ref) async {
  final authState = ref.watch(authProvider).valueOrNull;
  if (authState is! AuthAuthenticated) return [];
  final dio = ref.watch(dioProvider);
  final res =
      await dio.get(ApiEndpoints.budgetsByPerson(authState.user.id));
  final list = res.data as List<dynamic>;
  return list.map((e) => _Budget.fromJson(e as Map<String, dynamic>)).toList();
});

class FinanceScreen extends ConsumerStatefulWidget {
  const FinanceScreen({super.key});

  @override
  ConsumerState<FinanceScreen> createState() => _FinanceScreenState();
}

class _FinanceScreenState extends ConsumerState<FinanceScreen>
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
    final expensesAsync = ref.watch(_expensesProvider);
    final budgetsAsync = ref.watch(_budgetsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Finance'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            onPressed: () => _showAddExpenseSheet(context),
          ),
        ],
        bottom: TabBar(
          controller: _tabs,
          tabs: const [
            Tab(text: 'Expenses'),
            Tab(text: 'Budgets'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabs,
        children: [
          // Expenses
          expensesAsync.when(
            data: (expenses) {
              if (expenses.isEmpty) {
                return const Center(child: Text('No expenses yet'));
              }
              // Summary header
              final total = expenses.fold(0.0, (s, e) => s + e.amount);
              return Column(
                children: [
                  _SummaryBanner(total: total, count: expenses.length),
                  Expanded(
                    child: ListView.builder(
                      itemCount: expenses.length,
                      itemBuilder: (_, i) =>
                          _ExpenseRow(expense: expenses[i]),
                    ),
                  ),
                ],
              );
            },
            loading: () =>
                const Center(child: CircularProgressIndicator()),
            error: (e, _) => Center(child: Text(e.toString())),
          ),
          // Budgets
          budgetsAsync.when(
            data: (budgets) {
              if (budgets.isEmpty) {
                return const Center(child: Text('No budgets set'));
              }
              return ListView.builder(
                padding: const EdgeInsets.all(12),
                itemCount: budgets.length,
                itemBuilder: (_, i) => _BudgetCard(budget: budgets[i]),
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

  void _showAddExpenseSheet(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => const _AddExpenseSheet(),
    );
  }
}

class _SummaryBanner extends StatelessWidget {
  const _SummaryBanner({required this.total, required this.count});
  final double total;
  final int count;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(16),
      color: cs.surfaceContainerHighest,
      child: Row(
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Total spent', style: TextStyle(color: cs.outline)),
              Text(
                '\$${NumberFormat('#,##0.00').format(total)}',
                style: Theme.of(context)
                    .textTheme
                    .headlineSmall
                    ?.copyWith(fontWeight: FontWeight.bold),
              ),
            ],
          ),
          const Spacer(),
          Text('$count transactions',
              style: TextStyle(color: cs.outline)),
        ],
      ),
    );
  }
}

class _ExpenseRow extends StatelessWidget {
  const _ExpenseRow({required this.expense});
  final _Expense expense;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return ListTile(
      leading: CircleAvatar(
        backgroundColor: cs.primaryContainer,
        child: Text(
          expense.category.isNotEmpty
              ? expense.category[0].toUpperCase()
              : '?',
          style: TextStyle(color: cs.onPrimaryContainer),
        ),
      ),
      title: Text(expense.description.isNotEmpty
          ? expense.description
          : expense.category),
      subtitle: Text(DateFormat('MMM d, y').format(expense.date)),
      trailing: Text(
        '-\$${NumberFormat('#,##0.00').format(expense.amount)}',
        style: const TextStyle(
          color: Colors.red,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

class _BudgetCard extends StatelessWidget {
  const _BudgetCard({required this.budget});
  final _Budget budget;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final color = budget.isOverBudget ? cs.error : cs.primary;

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(budget.name,
                    style: const TextStyle(fontWeight: FontWeight.w600)),
                const Spacer(),
                if (budget.isOverBudget)
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: cs.errorContainer,
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      'Over budget',
                      style: TextStyle(
                          fontSize: 11,
                          color: cs.onErrorContainer,
                          fontWeight: FontWeight.w600),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Text(
                  '\$${NumberFormat('#,##0').format(budget.spent)}',
                  style: TextStyle(color: color, fontWeight: FontWeight.w500),
                ),
                Text(
                  ' / \$${NumberFormat('#,##0').format(budget.amount)}',
                  style: TextStyle(color: cs.outline),
                ),
              ],
            ),
            const SizedBox(height: 8),
            LinearProgressIndicator(
              value: budget.progress,
              color: color,
              borderRadius: BorderRadius.circular(3),
            ),
          ],
        ),
      ),
    );
  }
}

class _AddExpenseSheet extends ConsumerStatefulWidget {
  const _AddExpenseSheet();

  @override
  ConsumerState<_AddExpenseSheet> createState() => _AddExpenseSheetState();
}

class _AddExpenseSheetState extends ConsumerState<_AddExpenseSheet> {
  final _form = GlobalKey<FormState>();
  final _amountCtrl = TextEditingController();
  final _descCtrl = TextEditingController();
  String _category = 'food';
  bool _submitting = false;

  static const _categories = [
    'food', 'transport', 'entertainment', 'health',
    'education', 'shopping', 'utilities', 'other',
  ];

  @override
  void dispose() {
    _amountCtrl.dispose();
    _descCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    setState(() => _submitting = true);
    try {
      final dio = ref.read(dioProvider);
      await dio.post(
        ApiEndpoints.expensesCreate,
        data: {
          'amount': double.parse(_amountCtrl.text.trim()),
          'description': _descCtrl.text.trim(),
          'category': _category,
          'date': DateFormat('yyyy-MM-dd').format(DateTime.now()),
        },
      );
      ref.invalidate(_expensesProvider);
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
            Text('Add Expense',
                style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 16),
            TextFormField(
              controller: _amountCtrl,
              decoration: const InputDecoration(
                labelText: 'Amount',
                prefixText: '\$ ',
              ),
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              validator: (v) {
                if (v == null || v.isEmpty) return 'Required';
                if (double.tryParse(v) == null) return 'Enter a valid number';
                return null;
              },
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _descCtrl,
              decoration: const InputDecoration(labelText: 'Description'),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              value: _category,
              decoration: const InputDecoration(labelText: 'Category'),
              items: _categories
                  .map((c) => DropdownMenuItem(
                      value: c,
                      child: Text(
                          c[0].toUpperCase() + c.substring(1))))
                  .toList(),
              onChanged: (v) => setState(() => _category = v!),
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
                  : const Text('Add Expense'),
            ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }
}
