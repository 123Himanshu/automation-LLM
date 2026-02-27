import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { Sheet, PdfPrintSettings } from '@excelflow/shared';
import { buildCellRef } from '@excelflow/shared';

@Injectable()
export class PdfExportService implements OnModuleDestroy {
  private readonly logger = new Logger(PdfExportService.name);

  /** Singleton browser instance — reused across exports to avoid cold-start overhead */
  private browserInstance: import('playwright').Browser | null = null;
  private browserLaunchPromise: Promise<import('playwright').Browser | null> | null = null;

  async onModuleDestroy(): Promise<void> {
    if (this.browserInstance) {
      await this.browserInstance.close().catch(() => {});
      this.browserInstance = null;
      this.browserLaunchPromise = null;
      this.logger.log('Playwright browser closed on module destroy');
    }
  }

  /** Get or create a singleton browser. Concurrent callers share the same launch promise. */
  private async getBrowser(): Promise<import('playwright').Browser | null> {
    if (this.browserInstance?.isConnected()) return this.browserInstance;

    // Reset stale reference if browser disconnected
    this.browserInstance = null;

    // If another call is already launching, wait for it
    if (this.browserLaunchPromise) return this.browserLaunchPromise;

    this.browserLaunchPromise = (async () => {
      try {
        const pw = await import('playwright');
        const browser = await pw.chromium.launch({ headless: true });
        this.browserInstance = browser;
        this.logger.log('Playwright browser launched (singleton)');
        return browser;
      } catch {
        this.logger.warn('Playwright not installed — PDF export will return HTML fallback');
        this.browserLaunchPromise = null;
        return null;
      }
    })();

    const result = await this.browserLaunchPromise;
    if (!result) this.browserLaunchPromise = null;
    return result;
  }

  /** Export sheets to a PDF buffer (no disk writes) */
  async exportToBuffer(sheets: Sheet[], settings: PdfPrintSettings): Promise<Buffer> {
    const html = this.buildHtml(sheets, settings);
    const browser = await this.getBrowser();

    if (!browser) {
      return Buffer.from(html, 'utf-8');
    }

    // Use a new context + page per export (isolated, but shares the browser process)
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await page.setContent(html, { waitUntil: 'networkidle' });

      const pdfBuffer = await page.pdf({
        format: 'A4',
        landscape: settings.orientation === 'landscape',
        printBackground: true,
        margin: { top: '1cm', bottom: '1cm', left: '1cm', right: '1cm' },
      });

      this.logger.log(`PDF exported to buffer (${sheets.length} sheets)`);
      return Buffer.from(pdfBuffer);
    } finally {
      await context.close();
    }
  }

  private buildHtml(sheets: Sheet[], settings: PdfPrintSettings): string {
    const sheetsToRender = this.selectSheets(sheets, settings);
    const tables = sheetsToRender
      .map((s) => this.sheetToHtmlTable(s, settings))
      .join('\n');

    return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<style>
  body { font-family: Arial, sans-serif; font-size: 10px; margin: 0; padding: 8px; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
  th, td { padding: 4px 6px; text-align: left; ${settings.gridlines ? 'border: 1px solid #ccc;' : ''} }
  th { background: #f0f0f0; font-weight: bold; }
  h2 { font-size: 14px; margin: 10px 0 5px; }
  .page-break { page-break-after: always; }
</style>
</head><body>${tables}</body></html>`;
  }

  private selectSheets(sheets: Sheet[], settings: PdfPrintSettings): Sheet[] {
    if (settings.scope === 'all_sheets') return sheets;
    if (settings.scope === 'summary') {
      return sheets.filter((s) => s.name.toLowerCase().startsWith('summary'));
    }
    return sheets.length > 0 ? [sheets[0]!] : [];
  }

  private sheetToHtmlTable(sheet: Sheet, _settings: PdfPrintSettings): string {
    const { startRow, startCol, endRow, endCol } = sheet.usedRange;
    let html = `<h2>${this.escapeHtml(sheet.name)}</h2><table>`;

    for (let r = startRow; r <= endRow; r++) {
      const tag = r === startRow ? 'th' : 'td';
      html += '<tr>';
      for (let c = startCol; c <= endCol; c++) {
        const ref = buildCellRef(c, r);
        const cell = sheet.cells[ref];
        const display = cell?.computedValue ?? cell?.value ?? '';
        html += `<${tag}>${this.escapeHtml(String(display))}</${tag}>`;
      }
      html += '</tr>';
    }

    html += '</table>';
    return html;
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
