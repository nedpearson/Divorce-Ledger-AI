import { analysisOrchestrator } from './server/services/ai/AnalysisOrchestrator.js';
import { fileUploadService } from './server/services/storage/fileUploadService.js';
import { documentRepository } from './server/services/storage/documentRepository.js';

const userId = 'd21c3b35-2a34-49cd-9016-8b7d9f1a331f';

(async () => {
  // 1. Upload a test document
  console.log('--- Uploading test document ---');
  const doc = await fileUploadService.handleUpload({
    userId,
    buffer: Buffer.from('This is a bank statement from Chase Bank showing account 1234 with balance $5,432.10'),
    originalName: 'chase-bank-statement-march.pdf',
    mimeType: 'application/pdf',
    size: 80,
    title: 'Chase Bank Statement March',
    category: 'other'
  });
  console.log('Uploaded:', doc.id, doc.status);

  // 2. Run orchestration
  console.log('\n--- Running orchestration ---');
  const result = await analysisOrchestrator.processDocument(doc.id);
  console.log('Orchestration result:', result);

  // 3. Fetch final state
  const final = await documentRepository.getDocument(doc.id);
  console.log('\n--- Final document state ---');
  console.log({
    status: final?.status,
    category: final?.category,
    suggestedCategory: final?.suggestedCategory,
    aiSummary: final?.aiSummary,
    aiConfidence: final?.aiConfidence,
    description: final?.description
  });

  // Cleanup
  await documentRepository.deleteDocument(doc.id);
  console.log('\nTest document cleaned up.');
  process.exit(0);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
