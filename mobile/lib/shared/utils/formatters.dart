import 'package:intl/intl.dart';

String formatDate(DateTime dt) => DateFormat('MMM d, y').format(dt);
String formatTime(DateTime dt) => DateFormat('HH:mm').format(dt);
String formatDateTime(DateTime dt) => DateFormat('MMM d, HH:mm').format(dt);
String formatCurrency(double amount, {String symbol = '\$'}) =>
    '$symbol${NumberFormat('#,##0.00').format(amount)}';
String formatCompact(int n) => NumberFormat.compact().format(n);
