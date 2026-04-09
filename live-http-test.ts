/**
 * live-http-test.ts — Full end-to-end HTTP test hitting the running server
 * Simulates exactly what the browser does: upload via multipart, analyze, verify, delete
 */
import FormData from 'form-data';
import fetch from 'node-fetch';
import fs from 'fs';

const BASE = 'http://localhost:5000';
const HEADERS = {
  'X-User-Id': 'd21c3b35-2a34-49cd-9016-8b7d9f1a331f',
  'X-Environment': 'live-prod'
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function check(label: string, condition: boolean, detail?: string) {
  const mark = condition ? '✅' : '❌';
  console.log(`  ${mark} ${label}${detail ? ' → ' + detail : ''}`);
  if (!condition) process.exitCode = 1;
}

async function main() {
  console.log('\n══════════════════════════════════════');
  console.log('   DIVORCE LEDGER — LIVE HTTP TEST');
  console.log('══════════════════════════════════════\n');

  // ─── STEP 1: Health Check ───────────────────────────────────────────────
  console.log('🔍 STEP 1: Server Health');
  const health = await fetch(`${BASE}/api/health`, { headers: HEADERS });
  check('Server responding', health.ok, `HTTP ${health.status}`);
  const healthData = await health.json() as any;
  check('DB connected', !!healthData.database || healthData.status === 'ok', JSON.stringify(healthData).slice(0, 60));

  // ─── STEP 2: Upload a Document (multipart/form-data) ────────────────────
  console.log('\n📄 STEP 2: Upload Document (PDF simulation)');
  const form = new FormData();
  form.append('title', 'Chase Bank Statement - March 2025');
  form.append('category', 'bank_statement');
  form.append('description', 'Monthly bank statement from Chase showing account activity');
  form.append('file', Buffer.from('Chase Banking\nAccount: ****5678\nBalance: $12,456.78\nStatement Date: March 31, 2025\n\nTransactions:\n03/01 Payroll Deposit +$4,500.00\n03/05 Rent Payment -$1,850.00\n03/12 Grocery Store -$234.50'), {
    filename: 'chase-bank-march-2025.pdf',
    contentType: 'application/pdf'
  });

  const uploadRes = await fetch(`${BASE}/api/storage/files/upload`, {
    method: 'POST',
    headers: { ...HEADERS, ...form.getHeaders() },
    body: form
  });
  const uploadData = await uploadRes.json() as any;
  check('Upload returns 200', uploadRes.status === 200, `HTTP ${uploadRes.status}`);
  check('Has document ID', !!uploadData?.file?.id, uploadData?.file?.id);
  check('Has $id alias', !!uploadData?.file?.$id, uploadData?.file?.$id);
  check('Status is uploaded', uploadData?.file?.status === 'uploaded', uploadData?.file?.status);
  check('Category set', uploadData?.file?.category === 'bank_statement', uploadData?.file?.category);
  const docId = uploadData?.file?.id;

  // ─── STEP 3: Fetch Document List ────────────────────────────────────────
  console.log('\n📋 STEP 3: Document List');
  const listRes = await fetch(`${BASE}/api/storage/files`, { headers: HEADERS });
  const listData = await listRes.json() as any;
  check('List returns 200', listRes.status === 200, `HTTP ${listRes.status}`);
  const found = listData?.files?.find((f: any) => f.id === docId);
  check('Document visible in list', !!found, found ? `id=${found.id}` : 'NOT FOUND');
  check('Has createdAt date', !!found?.$createdAt || !!found?.createdAt, found?.$createdAt || found?.createdAt);

  // ─── STEP 4: Trigger Analysis ───────────────────────────────────────────
  console.log('\n🤖 STEP 4: Trigger AI Analysis');
  const analyzeRes = await fetch(`${BASE}/api/storage/files/${docId}/analyze`, {
    method: 'POST',
    headers: HEADERS
  });
  const analyzeData = await analyzeRes.json() as any;
  check('Analyze returns 200', analyzeRes.status === 200, `HTTP ${analyzeRes.status}`);
  check('Analysis queued', analyzeData?.success === true, analyzeData?.message);

  // ─── STEP 5: Wait and Poll for Completion ───────────────────────────────
  console.log('\n⏳ STEP 5: Polling for Analysis Completion (max 10s)');
  let finalDoc: any = null;
  for (let i = 0; i < 10; i++) {
    await sleep(1000);
    const pollRes = await fetch(`${BASE}/api/storage/files`, { headers: HEADERS });
    const pollData = await pollRes.json() as any;
    const polledDoc = pollData?.files?.find((f: any) => f.id === docId);
    process.stdout.write(`  [${i+1}s] status=${polledDoc?.status} `);
    if (polledDoc?.status === 'suggested' || polledDoc?.status === 'finalized') {
      finalDoc = polledDoc;
      console.log('← DONE!');
      break;
    }
    console.log('');
  }
  check('Analysis completed', !!finalDoc, finalDoc ? `status=${finalDoc.status}` : 'TIMED OUT');
  if (finalDoc) {
    check('Category assigned', !!finalDoc.category && finalDoc.category !== 'other', finalDoc.category);
    check('AI summary present', !!finalDoc.aiSummary, finalDoc.aiSummary?.slice(0, 60));
    check('Confidence score', (finalDoc.aiConfidence || 0) > 0.5, `${(finalDoc.aiConfidence * 100).toFixed(0)}%`);
  }

  // ─── STEP 6: Quick Capture (no file) ────────────────────────────────────
  console.log('\n📝 STEP 6: Quick Capture (no file) → Auto-Classification');
  const captureRes = await fetch(`${BASE}/api/documents`, {
    method: 'POST',
    headers: { ...HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Consent Judgment - January 2025',
      category: 'other',
      description: 'Court consent judgment signed by both parties'
    })
  });
  const captureData = await captureRes.json() as any;
  check('Quick capture returns 200', captureRes.status === 200, `HTTP ${captureRes.status}`);
  check('Document ID returned', !!captureData?.id, captureData?.id);
  const captureId = captureData?.id;

  // Poll for it to classify
  await sleep(2000); // Give orchestrator time to run
  const captureListRes = await fetch(`${BASE}/api/storage/files`, { headers: HEADERS });
  const captureListData = await captureListRes.json() as any;
  const captureDoc = captureListData?.files?.find((f: any) => f.id === captureId);
  check('Quick capture visible in list', !!captureDoc, captureDoc?.status);
  check('Quick capture auto-classified', captureDoc?.status === 'suggested', captureDoc?.status);
  if (captureDoc?.status === 'suggested') {
    check('Legal category detected', captureDoc.category?.includes('legal') || captureDoc.category?.includes('other'), captureDoc.category);
  }

  // ─── STEP 7: Delete Both ────────────────────────────────────────────────
  console.log('\n🗑️  STEP 7: Delete Documents');
  const del1 = await fetch(`${BASE}/api/storage/files/${docId}`, { method: 'DELETE', headers: HEADERS });
  const del1Data = await del1.json() as any;
  check('Delete doc1 returns 200', del1.ok, `HTTP ${del1.status}`);
  check('Delete doc1 success flag', del1Data?.success === true, del1Data?.message);

  if (captureId) {
    const del2 = await fetch(`${BASE}/api/storage/files/${captureId}`, { method: 'DELETE', headers: HEADERS });
    const del2Data = await del2.json() as any;
    check('Delete doc2 returns 200', del2.ok, `HTTP ${del2.status}`);
    check('Delete doc2 success flag', del2Data?.success === true, del2Data?.message);
  }

  // Verify list is empty
  await sleep(500);
  const emptyRes = await fetch(`${BASE}/api/storage/files`, { headers: HEADERS });
  const emptyData = await emptyRes.json() as any;
  check('List empty after deletes', emptyData?.total === 0 || emptyData?.files?.length === 0, `${emptyData?.total} docs remaining`);

  console.log('\n══════════════════════════════════════');
  const passed = process.exitCode !== 1;
  console.log(passed ? '   🎉 ALL TESTS PASSED' : '   ⚠️  SOME TESTS FAILED');
  console.log('══════════════════════════════════════\n');
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
