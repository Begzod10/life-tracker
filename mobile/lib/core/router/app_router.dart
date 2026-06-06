import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../auth/auth_models.dart';
import '../auth/auth_provider.dart';
import '../../features/auth/screens/login_screen.dart';
import '../../features/learning/screens/learning_screen.dart';
import '../../features/library/screens/library_screen.dart';
import '../../features/finance/screens/finance_screen.dart';
import '../../features/tasks/screens/tasks_screen.dart';
import '../../shared/widgets/shell_screen.dart';

final routerProvider = Provider<GoRouter>((ref) {
  final authNotifier = ValueNotifier<AuthState?>(null);

  ref.listen(authProvider, (_, next) {
    authNotifier.value = next.valueOrNull;
  });

  return GoRouter(
    initialLocation: '/learning',
    refreshListenable: authNotifier,
    redirect: (context, state) {
      final auth = authNotifier.value;
      if (auth == null || auth is AuthLoading) return null;

      final isLogin = state.matchedLocation == '/login';
      if (auth is AuthUnauthenticated) return isLogin ? null : '/login';
      if (auth is AuthAuthenticated) return isLogin ? '/learning' : null;
      return null;
    },
    routes: [
      GoRoute(
        path: '/login',
        builder: (_, __) => const LoginScreen(),
      ),
      StatefulShellRoute.indexedStack(
        builder: (_, __, shell) => ShellScreen(navigationShell: shell),
        branches: [
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/learning',
              builder: (_, __) => const LearningScreen(),
            ),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/library',
              builder: (_, __) => const LibraryScreen(),
            ),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/finance',
              builder: (_, __) => const FinanceScreen(),
            ),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/tasks',
              builder: (_, __) => const TasksScreen(),
            ),
          ]),
        ],
      ),
    ],
  );
});
