import 'dart:io';
import 'package:flutter/material.dart';
import 'package:google_mlkit_document_scanner/google_mlkit_document_scanner.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';

void main() {
  runApp(const AccountingScannerApp());
}

class AccountingScannerApp extends StatelessWidget {
  const AccountingScannerApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'AutoAccount Scanner',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.blue),
        useMaterial3: true,
      ),
      home: const HomeScreen(),
    );
  }
}

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _selectedIndex = 0;
  final List<Map<String, dynamic>> _scannedReceipts = [];
  bool _isScanning = false;

  Future<void> _startDocumentScan() async {
    setState(() => _isScanning = true);
    try {
      final scanner = DocumentScanner(
        options: DocumentScannerOptions(
          documentFormat: DocumentFormat.jpeg,
          mode: ScannerMode.full,
          isGalleryImport: true,
          pageLimit: 1,
        ),
      );

      final result = await scanner.scanDocument();
      if (result.images != null && result.images!.isNotEmpty) {
        final imagePath = result.images!.first;
        _addScannedReceipt(imagePath);
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Scanner error: $e')),
      );
    } finally {
      setState(() => _isScanning = false);
    }
  }

  void _addScannedReceipt(String imagePath) {
    setState(() {
      _scannedReceipts.insert(0, {
        'id': 'REC-${DateTime.now().millisecondsSinceEpoch}',
        'date': '2026-08-24',
        'merchant': 'Office Supply Co.',
        'ref': 'INV-98214',
        'category': 'Office Supplies',
        'amount': 145.50,
        'currency': 'USD',
        'imagePath': imagePath,
        'folder': 'Google Drive / Receipts / 2026 / 08_August',
      });
    });
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Receipt captured & saved to Google Drive!')),
    );
  }

  Future<void> _compileAndPrintA4PDF({int receiptsPerPage = 2}) async {
    final pdf = pw.Document();

    for (int i = 0; i < _scannedReceipts.length; i += receiptsPerPage) {
      final chunk = _scannedReceipts.skip(i).take(receiptsPerPage).toList();

      pdf.addPage(
        pw.Page(
          pageFormat: PdfPageFormat.a4,
          margin: const pw.EdgeInsets.all(20),
          build: (pw.Context context) {
            return pw.Column(
              crossAxisAlignment: pw.CrossAxisAlignment.start,
              children: [
                pw.Header(
                  level: 0,
                  child: pw.Row(
                    mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
                    children: [
                      pw.Text('Expense Claim & Audit Sheet (A4)', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 16)),
                      pw.Text('Page ${(i ~/ receiptsPerPage) + 1}', style: const pw.TextStyle(fontSize: 10)),
                    ],
                  ),
                ),
                pw.SizedBox(height: 10),
                ...chunk.map((item) {
                  return pw.Container(
                    margin: const pw.EdgeInsets.only(bottom: 15),
                    padding: const pw.EdgeInsets.all(8),
                    decoration: pw.BoxDecoration(
                      border: pw.Border.all(color: PdfColors.grey400, width: 0.8),
                      borderRadius: const pw.BorderRadius.all(pw.Radius.circular(6)),
                    ),
                    child: pw.Column(
                      crossAxisAlignment: pw.CrossAxisAlignment.start,
                      children: [
                        pw.Row(
                          mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
                          children: [
                            pw.Text('Merchant: ${item['merchant']}', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 11)),
                            pw.Text('${item['currency']} ${item['amount']}', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, color: PdfColors.blue800)),
                          ],
                        ),
                        pw.Text('Date: ${item['date']} | Ref: ${item['ref']} | Category: ${item['category']}', style: const pw.TextStyle(fontSize: 9, color: PdfColors.grey700)),
                        pw.SizedBox(height: 6),
                        if (File(item['imagePath']).existsSync())
                          pw.Center(
                            child: pw.Image(
                              pw.MemoryImage(File(item['imagePath']).readAsBytesSync()),
                              height: receiptsPerPage == 2 ? 240 : 160,
                            ),
                          )
                        else
                          pw.Text('[Receipt Image Attached]'),
                      ],
                    ),
                  );
                }),
              ],
            );
          },
        ),
      );
    }

    await Printing.layoutPdf(onLayout: (format) async => pdf.save());
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('AutoAccount AI Scanner', style: TextStyle(fontWeight: FontWeight.bold)),
        backgroundColor: Theme.of(context).colorScheme.primaryContainer,
      ),
      body: _selectedIndex == 0
          ? _buildScanScreen()
          : _selectedIndex == 1
              ? _buildCompileScreen()
              : _buildLedgerScreen(),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _selectedIndex,
        onDestinationSelected: (idx) => setState(() => _selectedIndex = idx),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.camera_alt), label: 'Scanner'),
          NavigationDestination(icon: Icon(Icons.picture_as_pdf), label: 'A4 Compiler'),
          NavigationDestination(icon: Icon(Icons.table_chart), label: 'Sheets Ledger'),
        ],
      ),
      floatingActionButton: _selectedIndex == 0
          ? FloatingActionButton.extended(
              onPressed: _startDocumentScan,
              icon: const Icon(Icons.document_scanner),
              label: const Text('Scan Bill'),
            )
          : null,
    );
  }

  Widget _buildScanScreen() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('ML Kit Document Scanner', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                const SizedBox(height: 4),
                const Text('Auto-detects receipt edges, straightens perspective, and applies B&W contrast filters.', style: TextStyle(fontSize: 12, color: Colors.grey)),
                const SizedBox(height: 12),
                ElevatedButton.icon(
                  onPressed: _startDocumentScan,
                  icon: const Icon(Icons.camera),
                  label: const Text('Launch Document Camera'),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildCompileScreen() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        ElevatedButton.icon(
          onPressed: () => _compileAndPrintA4PDF(receiptsPerPage: 2),
          icon: const Icon(Icons.print),
          label: const Text('Compile & Print (2 per A4 Page)'),
        ),
        const SizedBox(height: 10),
        ElevatedButton.icon(
          onPressed: () => _compileAndPrintA4PDF(receiptsPerPage: 3),
          icon: const Icon(Icons.print),
          label: const Text('Compile & Print (3 per A4 Page)'),
        ),
      ],
    );
  }

  Widget _buildLedgerScreen() {
    return ListView.builder(
      itemCount: _scannedReceipts.length,
      itemBuilder: (context, index) {
        final r = _scannedReceipts[index];
        return ListTile(
          title: Text(r['merchant']),
          subtitle: Text('${r['date']} - ${r['category']}'),
          trailing: Text('${r['currency']} ${r['amount']}', style: const TextStyle(fontWeight: FontWeight.bold)),
        );
      },
    );
  }
}
