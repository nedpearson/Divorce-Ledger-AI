import PDFDocument from 'pdfkit';
import crypto from 'crypto';
import type { Violation, Transaction } from '@shared/schema';

interface ExportData {
  violations: Violation[];
  transactions: Transaction[];
  userInfo: {
    fullName: string;
    email: string;
  };
  exportDate: Date;
  environment: string;
}

export function generateCourtFilingPDF(data: ExportData): PDFKit.PDFDocument {
  const doc = new PDFDocument({
    size: 'LETTER',
    margins: { top: 50, bottom: 50, left: 50, right: 50 },
    bufferPages: true,
    info: {
      Title: 'Court Filing Document - Divorce Ledger',
      Author: 'Divorce Ledger Platform',
      Subject: 'Case Evidence and Timeline',
    },
  });

  const pageWidth = doc.page.width - 100;

  doc.fontSize(24).font('Helvetica-Bold').text('COURT FILING DOCUMENT', { align: 'center' });
  doc.moveDown(0.5);
  doc
    .fontSize(14)
    .font('Helvetica')
    .text('Divorce Ledger - Forensic Case Management', { align: 'center' });
  doc.moveDown(2);

  doc.rect(50, doc.y, pageWidth, 80).stroke();
  const boxY = doc.y + 10;
  doc.fontSize(10).font('Helvetica-Bold');
  doc.text('Case Information', 60, boxY);
  doc.font('Helvetica').fontSize(9);
  doc.text(`Prepared for: ${data.userInfo.fullName}`, 60, boxY + 15);
  doc.text(`Email: ${data.userInfo.email}`, 60, boxY + 28);
  doc.text(`Export Date: ${data.exportDate.toLocaleString()}`, 60, boxY + 41);
  doc.text(`Document ID: ${generateDocId()}`, 60, boxY + 54);

  if (data.environment === 'demo') {
    doc.save();
    doc.rotate(-45, { origin: [300, 400] });
    doc.fontSize(60).fillColor('#cccccc').opacity(0.3);
    doc.text('DEMO', 150, 350);
    doc.restore();
    doc.fillColor('black').opacity(1);
    doc
      .fontSize(10)
      .fillColor('red')
      .text('DEMO MODE - NOT FOR COURT USE', 350, boxY + 15);
    doc.fillColor('black');
  }

  doc.y = boxY + 90;

  doc.fontSize(16).font('Helvetica-Bold').text('Executive Summary', 50, doc.y);
  doc.moveDown(0.5);
  doc.fontSize(10).font('Helvetica');

  const approvedViolations = data.violations.filter((v) => v.status === 'approved').length;
  const pendingViolations = data.violations.filter((v) => v.status === 'pending').length;
  const totalTransactions = data.transactions.length;

  doc.text(`Total Documented Violations: ${data.violations.length}`);
  doc.text(`Court-Ready Evidence: ${approvedViolations}`);
  doc.text(`Pending Review: ${pendingViolations}`);
  doc.text(`Financial Transactions Tracked: ${totalTransactions}`);
  doc.moveDown(1.5);

  doc.fontSize(16).font('Helvetica-Bold').text('Chronological Timeline');
  doc.moveDown(0.5);

  const allEvents: Array<{ date: Date; type: string; description: string; amount?: number }> = [];

  data.violations.forEach((v) => {
    allEvents.push({
      date: new Date(v.timestamp),
      type: 'Violation',
      description: `${v.type.replace(/_/g, ' ').toUpperCase()}: ${v.description}`,
    });
  });

  data.transactions.forEach((t) => {
    allEvents.push({
      date: new Date(t.date),
      type: 'Transaction',
      description: t.description,
      amount: t.amount,
    });
  });

  allEvents.sort((a, b) => b.date.getTime() - a.date.getTime());

  doc.fontSize(9).font('Helvetica-Bold');
  const tableTop = doc.y;
  doc.text('Date', 50, tableTop, { width: 80 });
  doc.text('Type', 130, tableTop, { width: 70 });
  doc.text('Description', 200, tableTop, { width: 250 });
  doc.text('Amount', 450, tableTop, { width: 80, align: 'right' });

  doc
    .moveTo(50, tableTop + 12)
    .lineTo(530, tableTop + 12)
    .stroke();
  doc.y = tableTop + 18;

  doc.font('Helvetica').fontSize(8);

  allEvents.slice(0, 20).forEach((event) => {
    if (doc.y > 700) {
      doc.addPage();
      doc.y = 50;
    }

    const rowY = doc.y;
    doc.text(event.date.toLocaleDateString(), 50, rowY, { width: 80 });
    doc.text(event.type, 130, rowY, { width: 70 });
    doc.text(event.description.substring(0, 60), 200, rowY, { width: 250 });
    if (event.amount !== undefined) {
      const amountStr =
        event.amount > 0
          ? `+$${(event.amount / 100).toFixed(2)}`
          : `-$${(Math.abs(event.amount) / 100).toFixed(2)}`;
      doc.text(amountStr, 450, rowY, { width: 80, align: 'right' });
    }
    doc.y = rowY + 12;
  });

  doc.addPage();
  doc.fontSize(16).font('Helvetica-Bold').text('Violation History');
  doc.moveDown(0.5);

  data.violations.forEach((violation, index) => {
    if (doc.y > 650) {
      doc.addPage();
      doc.y = 50;
    }

    doc.fontSize(11).font('Helvetica-Bold');
    doc.text(`${index + 1}. ${violation.type.replace(/_/g, ' ').toUpperCase()}`);
    doc.fontSize(9).font('Helvetica');
    doc.text(`Status: ${violation.status.toUpperCase()}`, { indent: 20 });
    doc.text(`Timestamp: ${new Date(violation.timestamp).toLocaleString()}`, { indent: 20 });
    if (violation.location) {
      doc.text(`Location: ${violation.location}`, { indent: 20 });
    }
    doc.text(`Description: ${violation.description}`, { indent: 20 });
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(530, doc.y).stroke();
    doc.moveDown(0.5);
  });

  doc.addPage();
  doc.fontSize(16).font('Helvetica-Bold').text('Chain of Custody Certification');
  doc.moveDown(1);

  doc.fontSize(10).font('Helvetica');
  doc.text('I hereby certify that the evidence contained in this document:');
  doc.moveDown(0.5);
  doc.text('1. Has been collected and preserved using Divorce Ledger platform', { indent: 20 });
  doc.text('2. Timestamps are automatically generated at time of documentation', { indent: 20 });
  doc.text('3. All data has been stored securely with environment separation', { indent: 20 });
  doc.text('4. This export was generated on the date indicated above', { indent: 20 });
  doc.moveDown(1.5);

  doc.text(`Document Hash: ${generateHash(data)}`);
  doc.moveDown(2);

  doc.fontSize(12).font('Helvetica-Bold').text('Attorney Certification');
  doc.moveDown(1);

  doc.fontSize(10).font('Helvetica');
  doc.text('I, the undersigned attorney, certify that I have reviewed the contents of this');
  doc.text('document and believe them to be accurate and complete to the best of my knowledge.');
  doc.moveDown(2);

  doc.text('Attorney Signature: _________________________________');
  doc.moveDown(0.5);
  doc.text('Attorney Name: _________________________________');
  doc.moveDown(0.5);
  doc.text('Bar Number: _________________________________');
  doc.moveDown(0.5);
  doc.text('Date: _________________________________');
  doc.moveDown(2);

  doc.text('Notary Public (if required): _________________________________');
  doc.moveDown(0.5);
  doc.text('Commission Expiration: _________________________________');

  const pageCount = doc.bufferedPageRange().count;
  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i);
    doc.fontSize(8).font('Helvetica');
    doc.text(
      `Page ${i + 1} of ${pageCount} | Divorce Ledger | Generated: ${data.exportDate.toISOString()}`,
      50,
      doc.page.height - 30,
      { align: 'center', width: pageWidth }
    );
  }

  return doc;
}

function generateDocId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `DAI-${timestamp}-${random}`.toUpperCase();
}

// Generate PDF with "FREE TIER" watermark on all pages
export function generateWatermarkedCourtFilingPDF(data: ExportData): PDFKit.PDFDocument {
  const doc = generateCourtFilingPDF(data);

  // Add watermark to all pages
  const pageCount = doc.bufferedPageRange().count;
  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i);
    doc.save();
    doc.rotate(-45, { origin: [300, 400] });
    doc.fontSize(80).fillColor('#cccccc').opacity(0.15);
    doc.text('FREE TIER', 80, 300, { align: 'center' });
    doc.restore();
    doc.fillColor('black').opacity(1);

    // Add upgrade banner
    doc.fontSize(10).fillColor('#ff6b6b');
    doc.text(
      'Upgrade to Pro to remove watermark and access all features: divorceledger.live/pricing',
      50,
      doc.page.height - 50,
      { align: 'center', width: doc.page.width - 100 }
    );
    doc.fillColor('black');
  }

  return doc;
}

function generateHash(data: ExportData): string {
  const content = JSON.stringify({
    violations: data.violations.map((v) => ({
      id: v.id,
      timestamp: v.timestamp,
      description: v.description,
    })),
    transactions: data.transactions.map((t) => ({ id: t.id, date: t.date, amount: t.amount })),
    exportDate: data.exportDate.toISOString(),
    user: data.userInfo.email,
  });
  return crypto.createHash('sha256').update(content).digest('hex').toUpperCase();
}
