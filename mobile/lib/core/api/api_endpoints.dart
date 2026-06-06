class ApiEndpoints {
  static const String baseUrl = String.fromEnvironment(
    'API_URL',
    defaultValue: 'https://cybrix.uz/api',
  );

  // Auth
  static String get login => '$baseUrl/auth/login';
  static String get register => '$baseUrl/auth/register';
  static String get logout => '$baseUrl/auth/logout';
  static String get me => '$baseUrl/auth/me';
  static String get refresh => '$baseUrl/auth/refresh';
  static String get googleAuth => '$baseUrl/auth/google';

  // Profile
  static String get profile => '$baseUrl/profile';

  // Dictionary
  static String get dictionary => '$baseUrl/dictionary/';
  static String dictionaryItem(int id) => '$baseUrl/dictionary/$id';
  static String get dictionaryFolders => '$baseUrl/dictionary/folders/';
  static String get dictionaryModules => '$baseUrl/dictionary/modules/';
  static String get dictionaryStats => '$baseUrl/dictionary/stats';
  static String get dictionaryAiWordDetails => '$baseUrl/dictionary/ai/word-details';

  // Practice
  static String practiceWords({
    int count = 10,
    String? difficulty,
    int? moduleId,
    int? folderId,
    bool dueOnly = false,
  }) {
    final p = <String, String>{'count': '$count'};
    if (difficulty != null) p['difficulty'] = difficulty;
    if (moduleId != null) p['module_id'] = '$moduleId';
    if (folderId != null) p['folder_id'] = '$folderId';
    if (dueOnly) p['due_only'] = 'true';
    final qs = p.entries.map((e) => '${e.key}=${e.value}').join('&');
    return '$baseUrl/practice/words?$qs';
  }

  static String practiceResult(int wordId, bool wasCorrect) =>
      '$baseUrl/practice/result?word_id=$wordId&was_correct=$wasCorrect';

  static String practiceSession(String mode) =>
      '$baseUrl/practice/session?mode=$mode';

  static String practiceComplete(int sessionId, int total, int correct) =>
      '$baseUrl/practice/session/$sessionId/complete?total_questions=$total&correct_answers=$correct';

  static String get practiceActiveSession => '$baseUrl/practice/session/active';

  static String practiceDiscard(int sessionId) =>
      '$baseUrl/practice/session/$sessionId';

  // Exercises
  static String exerciseWords({int count = 5, int? moduleId, int? folderId}) {
    final p = <String, String>{'count': '$count'};
    if (moduleId != null) p['module_id'] = '$moduleId';
    if (folderId != null) p['folder_id'] = '$folderId';
    final qs = p.entries.map((e) => '${e.key}=${e.value}').join('&');
    return '$baseUrl/exercises/words?$qs';
  }

  static String get exerciseGrade => '$baseUrl/exercises/grade';

  // Books / Library
  static String get books => '$baseUrl/books';
  static String book(int id) => '$baseUrl/books/$id';
  static String bookFile(int id) => '$baseUrl/books/$id/file';
  static String bookHighlights(int id) => '$baseUrl/books/$id/highlights';
  static String get booksStats => '$baseUrl/books/stats/overview';

  // Finance
  static String get expensesCreate => '$baseUrl/expenses/';
  static String expensesByPerson(int personId) =>
      '$baseUrl/expenses/by-person/$personId';
  static String expense(int id) => '$baseUrl/expenses/$id';

  static String get budgetsCreate => '$baseUrl/budgets/';
  static String budgetsByPerson(int personId) =>
      '$baseUrl/budgets/by-person/$personId';
  static String budget(int id) => '$baseUrl/budgets/$id';

  static String get savingsCreate => '$baseUrl/savings/';
  static String savingsByPerson(int personId) =>
      '$baseUrl/savings/by-person/$personId';
  static String saving(int id) => '$baseUrl/savings/$id';

  static String monthlyReport(String month) =>
      '$baseUrl/financial-analytics/monthly-report/$month';
  static String netWorth() => '$baseUrl/financial-analytics/net-worth';

  // Tasks
  static String get tasks => '$baseUrl/tasks';
  static String task(int id) => '$baseUrl/tasks/$id';
  static String tasksByPerson(int personId) =>
      '$baseUrl/tasks/person/$personId';

  // Timetable
  static String timetable({String? dateFrom, String? dateTo}) {
    final p = <String>[];
    if (dateFrom != null) p.add('date_from=$dateFrom');
    if (dateTo != null) p.add('date_to=$dateTo');
    return '$baseUrl/timetable/${p.isNotEmpty ? '?${p.join('&')}' : ''}';
  }

  static String get timetableCreate => '$baseUrl/timetable/';
  static String timetableItem(int id) => '$baseUrl/timetable/$id';
  static String timetableToggle(int id) => '$baseUrl/timetable/$id/toggle';

  // Goals
  static String get goals => '$baseUrl/goals';
  static String goal(int id) => '$baseUrl/goals/$id';
  static String goalsByPerson(int personId) =>
      '$baseUrl/goals/person/$personId';
}
