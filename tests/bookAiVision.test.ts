import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import {
  slicePdfFirstPages,
  testGeminiConnection,
  getGeminiApiKey,
  isAiOcrEnabled,
  analyzeBookWithGemini,
} from '../server/services/bookAiService';
import { extractDocumentMetadata } from '../server/utils/authorExtractor';

describe('Book AI Multimodal Vision & OCR Service', () => {
  const scratchDir = path.resolve(__dirname, '../scratch');
  if (!fs.existsSync(scratchDir)) {
    fs.mkdirSync(scratchDir, { recursive: true });
  }

  it('slices multi-page PDF files cleanly to the first 3 pages', async () => {
    // Create a 5-page PDF
    const doc = await PDFDocument.create();
    for (let i = 1; i <= 5; i++) {
      const page = doc.addPage([400, 600]);
    }
    const pdfBytes = await doc.save();
    const testPdfPath = path.join(scratchDir, 'test-5-pages.pdf');
    fs.writeFileSync(testPdfPath, Buffer.from(pdfBytes));

    const slicedBuffer = await slicePdfFirstPages(testPdfPath, 3);
    expect(slicedBuffer).toBeInstanceOf(Buffer);

    // Verify sliced document has exactly 3 pages
    const slicedDoc = await PDFDocument.load(slicedBuffer);
    expect(slicedDoc.getPageCount()).toBe(3);

    try { fs.unlinkSync(testPdfPath); } catch {}
  });

  it('reports failure gracefully when Gemini API key is missing or blank', async () => {
    const result = await testGeminiConnection('');
    expect(result.success).toBe(false);
    expect(result.message).toContain('لم يتم توفير مفتاح');
  });

  it('reports failure gracefully when Gemini API key is invalid', async () => {
    const result = await testGeminiConnection('AIzaSyInvalidFakeKey123456789');
    expect(result.success).toBe(false);
    expect(result.message).toContain('فشل الاتصال');
  });

  it('identifies scanned image PDF (sparse text) and marks it as isScanned', async () => {
    // Create a PDF with no text stream (simulating a scanned book photo)
    const doc = await PDFDocument.create();
    doc.addPage([500, 700]);
    const pdfBytes = await doc.save();
    const scannedPdfPath = path.join(scratchDir, 'test-scanned-empty.pdf');
    fs.writeFileSync(scannedPdfPath, Buffer.from(pdfBytes));

    // When Gemini is not configured, it falls back safely without crashing
    const meta = await extractDocumentMetadata(scannedPdfPath, 'pdf');
    expect(meta.isScanned).toBe(true);
    expect(meta.author).toBeNull();

    try { fs.unlinkSync(scannedPdfPath); } catch {}
  });

  it('rejects invalid or empty imageBase64 in extractTextFromImageSnippet', async () => {
    const { extractTextFromImageSnippet } = await import('../server/services/bookAiService');
    const res = await extractTextFromImageSnippet('');
    expect(res.text).toBe('');
    expect(res.engine).toBe('fallback');
    expect(res.error).toContain('لم يتم استلام صورة صالحة');
  });

  it('extracts Arabic text from an image snippet using offline Windows native OCR fallback', async () => {
    if (process.platform !== 'win32') return;

    const { extractTextFromImageSnippet } = await import('../server/services/bookAiService');
    const { execFileSync } = await import('child_process');
    const os = await import('os');

    // Create a 1-line Arabic bitmap via System.Drawing
    const genPs = path.join(os.tmpdir(), `test_snippet_${Date.now()}.ps1`);
    const outImg = path.join(os.tmpdir(), `test_snippet_${Date.now()}.png`);
    fs.writeFileSync(genPs, `
Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap(350, 90)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::White)
$font = New-Object System.Drawing.Font('Arial', 22)
$brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::Black)
$g.DrawString('الحكمة ضالة المؤمن', $font, $brush, 15, 20)
$g.Dispose()
$bmp.Save('${outImg.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
`);

    try {
      execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', genPs]);
      const imgBytes = fs.readFileSync(outImg);
      const base64Str = imgBytes.toString('base64');

      const result = await extractTextFromImageSnippet(base64Str, 'image/png');
      expect(result.text).toBeTruthy();
      expect(result.text).toContain('الحكمة');
      expect(result.confidence).toBeGreaterThan(0);
    } finally {
      try { fs.unlinkSync(genPs); } catch {}
      try { fs.unlinkSync(outImg); } catch {}
    }
  });
});
