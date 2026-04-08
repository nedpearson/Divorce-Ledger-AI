import { fileUploadService } from './server/services/storage/fileUploadService.js';

(async () => {
  try {
    const res = await fileUploadService.handleUpload({
      userId: 'd21c3b35-2a34-49cd-9016-8b7d9f1a331f',
      buffer: Buffer.from('test content'),
      originalName: 'test.txt',
      mimeType: 'text/plain',
      size: 12,
      title: 'Test Doc',
      category: 'other'
    });
    console.log('SUCCESS:', JSON.stringify(res, null, 2));
  } catch(e: any) {
    console.error('ERROR:', e.message);
    console.error(e.stack);
  }
  process.exit(0);
})();
