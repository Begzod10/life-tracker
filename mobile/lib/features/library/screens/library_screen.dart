import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/api/api_client.dart';
import '../../../core/api/api_endpoints.dart';

class _Book {
  const _Book({
    required this.id,
    required this.title,
    required this.author,
    required this.status,
    this.currentPage,
    this.totalPages,
    this.coverUrl,
    this.language,
  });

  final int id;
  final String title;
  final String author;
  final String status;
  final int? currentPage;
  final int? totalPages;
  final String? coverUrl;
  final String? language;

  double get progress {
    if (currentPage == null || totalPages == null || totalPages == 0) return 0;
    return currentPage! / totalPages!;
  }

  factory _Book.fromJson(Map<String, dynamic> j) => _Book(
        id: j['id'] as int,
        title: j['title'] as String,
        author: j['author'] as String? ?? 'Unknown',
        status: j['status'] as String? ?? 'want_to_read',
        currentPage: j['current_page'] as int?,
        totalPages: j['total_pages'] as int?,
        coverUrl: j['cover_url'] as String?,
        language: j['language'] as String?,
      );
}

final _booksProvider = FutureProvider.autoDispose<List<_Book>>((ref) async {
  final dio = ref.watch(dioProvider);
  final res = await dio.get(ApiEndpoints.books);
  final list = res.data as List<dynamic>;
  return list.map((e) => _Book.fromJson(e as Map<String, dynamic>)).toList();
});

class LibraryScreen extends ConsumerStatefulWidget {
  const LibraryScreen({super.key});

  @override
  ConsumerState<LibraryScreen> createState() => _LibraryScreenState();
}

class _LibraryScreenState extends ConsumerState<LibraryScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs;
  final _statuses = ['all', 'reading', 'want_to_read', 'completed'];
  final _labels = ['All', 'Reading', 'Want to Read', 'Completed'];

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: _statuses.length, vsync: this);
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final booksAsync = ref.watch(_booksProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Library'),
        bottom: TabBar(
          controller: _tabs,
          isScrollable: true,
          tabs: _labels.map((l) => Tab(text: l)).toList(),
        ),
      ),
      body: booksAsync.when(
        data: (books) => TabBarView(
          controller: _tabs,
          children: _statuses.map((status) {
            final filtered = status == 'all'
                ? books
                : books.where((b) => b.status == status).toList();
            if (filtered.isEmpty) {
              return const Center(child: Text('No books here'));
            }
            return ListView.builder(
              padding: const EdgeInsets.all(8),
              itemCount: filtered.length,
              itemBuilder: (_, i) => _BookCard(book: filtered[i]),
            );
          }).toList(),
        ),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text(e.toString())),
      ),
    );
  }
}

class _BookCard extends StatelessWidget {
  const _BookCard({required this.book});
  final _Book book;

  Color _statusColor(BuildContext context) => switch (book.status) {
        'reading' => Theme.of(context).colorScheme.primary,
        'completed' => Colors.green,
        _ => Theme.of(context).colorScheme.outline,
      };

  String _statusLabel() => switch (book.status) {
        'reading' => 'Reading',
        'completed' => 'Completed',
        'want_to_read' => 'Want to read',
        _ => book.status,
      };

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;

    return Card(
      margin: const EdgeInsets.symmetric(vertical: 4, horizontal: 8),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            Container(
              width: 48,
              height: 64,
              decoration: BoxDecoration(
                color: cs.primaryContainer,
                borderRadius: BorderRadius.circular(6),
              ),
              child: Icon(Icons.menu_book, color: cs.onPrimaryContainer),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    book.title,
                    style: const TextStyle(fontWeight: FontWeight.w600),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    book.author,
                    style: TextStyle(color: cs.outline, fontSize: 13),
                  ),
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: _statusColor(context).withOpacity(0.12),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          _statusLabel(),
                          style: TextStyle(
                            fontSize: 11,
                            color: _statusColor(context),
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      if (book.totalPages != null) ...[
                        const SizedBox(width: 8),
                        Text(
                          '${book.currentPage ?? 0} / ${book.totalPages} p',
                          style:
                              TextStyle(fontSize: 12, color: cs.outline),
                        ),
                      ],
                    ],
                  ),
                  if (book.status == 'reading' && book.totalPages != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: LinearProgressIndicator(
                        value: book.progress,
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
