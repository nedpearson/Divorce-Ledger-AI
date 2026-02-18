export interface PdfAnalysisResult {
  isScanned: boolean;
  type: 'digital-native' | 'scanned' | 'mixed' | 'unknown';
  hasText: boolean;
  pageCount?: number;
  confidence: number;
  needsOcr: boolean;
}

export async function analyzePdfType(pdfBuffer: Buffer): Promise<PdfAnalysisResult> {
  try {
    const pdfData = pdfBuffer.toString('binary');
    
    const hasFontObjects = /\/Font\s/.test(pdfData) || /\/Font>/.test(pdfData);
    const hasTextObjects = /\/Text/.test(pdfData) || /\(.*\)\s*Tj/.test(pdfData) || /BT\s/.test(pdfData);
    const hasImageXObjects = /\/XObject/.test(pdfData) && /\/Image/.test(pdfData);
    
    const pageMatches = pdfData.match(/\/Type\s*\/Page[^s]/g);
    const pageCount = pageMatches ? pageMatches.length : 1;

    if (hasFontObjects && hasTextObjects) {
      if (hasImageXObjects) {
        return {
          isScanned: false,
          type: 'mixed',
          hasText: true,
          pageCount,
          confidence: 0.85,
          needsOcr: false,
        };
      }
      return {
        isScanned: false,
        type: 'digital-native',
        hasText: true,
        pageCount,
        confidence: 0.95,
        needsOcr: false,
      };
    }

    if (hasImageXObjects && !hasFontObjects && !hasTextObjects) {
      return {
        isScanned: true,
        type: 'scanned',
        hasText: false,
        pageCount,
        confidence: 0.90,
        needsOcr: true,
      };
    }

    if (hasImageXObjects) {
      return {
        isScanned: true,
        type: 'scanned',
        hasText: hasFontObjects,
        pageCount,
        confidence: 0.75,
        needsOcr: true,
      };
    }

    return {
      isScanned: false,
      type: 'unknown',
      hasText: hasFontObjects || hasTextObjects,
      pageCount,
      confidence: 0.5,
      needsOcr: true,
    };
  } catch (error) {
    console.error('[PdfAnalyzer] Analysis failed:', error);
    return {
      isScanned: true,
      type: 'unknown',
      hasText: false,
      confidence: 0.3,
      needsOcr: true,
    };
  }
}

export async function extractTextFromDigitalPdf(pdfBuffer: Buffer): Promise<string | null> {
  try {
    const pdfParseModule = await import('pdf-parse');
    const pdfParse = (pdfParseModule as unknown as { default?: (buffer: Buffer) => Promise<{ text: string }> }).default || (pdfParseModule as unknown as (buffer: Buffer) => Promise<{ text: string }>);
    const result = await pdfParse(pdfBuffer);
    
    const text = result.text?.trim() || '';
    
    if (text.length < 50) {
      return null;
    }
    
    return text;
  } catch (error) {
    console.error('[PdfAnalyzer] Text extraction failed:', error);
    return null;
  }
}

export async function analyzePdfFromBase64(base64Data: string): Promise<PdfAnalysisResult> {
  const buffer = Buffer.from(base64Data, 'base64');
  return analyzePdfType(buffer);
}

export async function extractTextFromBase64Pdf(base64Data: string): Promise<string | null> {
  const buffer = Buffer.from(base64Data, 'base64');
  return extractTextFromDigitalPdf(buffer);
}
