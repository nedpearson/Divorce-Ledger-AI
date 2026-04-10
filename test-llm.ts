import 'dotenv/config';
import fs from 'fs';
import { azureDocumentIntelligenceProvider } from './server/services/ai/providers/AzureDocumentIntelligenceProvider';
import { openaiReasoningProvider } from './server/services/ai/providers/OpenAIReasoningProvider';
import { parseFinancialDocument } from './server/services/parseDocument';

async function testLLM() {
  const filePath = 'C:\\Users\\nedpe\\Desktop\\House Bills\\Entergy\\Entergy_Jan_2026.pdf';
  const buffer = fs.readFileSync(filePath);
  const result = await azureDocumentIntelligenceProvider.analyzeDocumentBuffer(buffer, 'application/pdf');
  
  console.log('Sending into OpenAI prompt logic...');
  try {
    const aiResult = await parseFinancialDocument(result.text, 'Entergy_Jan_2026.pdf');
    console.log(JSON.stringify(aiResult, null, 2));
  } catch (e: any) {
    console.error('LLM threw:', e.message);
  }
}

testLLM().catch(console.error);
