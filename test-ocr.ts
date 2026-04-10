import 'dotenv/config';
import fs from 'fs';
import { azureDocumentIntelligenceProvider } from './server/services/ai/providers/AzureDocumentIntelligenceProvider';

async function testOCR() {
  const filePath = 'C:\\Users\\nedpe\\Desktop\\House Bills\\Entergy\\Entergy_Jan_2026.pdf';
  const buffer = fs.readFileSync(filePath);
  
  console.log('Sending to Azure...');
  const result = await azureDocumentIntelligenceProvider.analyzeDocumentBuffer(buffer, 'application/pdf');
  
  console.log('Azure OCR Result Length:', result.text.length);
  console.log('First 500 chars:', result.text.substring(0, 500));
  
  process.exit(0);
}

testOCR().catch(console.error);
