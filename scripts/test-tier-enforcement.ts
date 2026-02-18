// Test script for tier enforcement
// Run with: npx tsx scripts/test-tier-enforcement.ts

const BASE_URL = 'http://localhost:5000/api';

async function testTierEnforcement() {
  console.log('TIER ENFORCEMENT TEST\n');
  console.log('='.repeat(70) + '\n');

  try {
    const userId = 'demo-user';

    // 1. Get current usage metrics
    console.log('1. Getting current usage metrics...');
    const metricsRes = await fetch(`${BASE_URL}/users/${userId}/usage-metrics`);
    const metricsData = await metricsRes.json();
    const metrics = metricsData.data;

    console.log(`   Tier: ${metrics.metrics.tier}`);
    console.log(`   Violations: ${metrics.metrics.violationsThisMonth} (${metrics.usagePercentage.violations}%)`);
    console.log(`   Storage: ${metrics.metrics.storageUsedMB.toFixed(1)}MB / ${metrics.tierLimits.maxStorageMB}MB (${metrics.usagePercentage.storage}%)`);
    console.log(`   Cases: ${metrics.metrics.casesActive} (${metrics.usagePercentage.cases}%)\n`);

    // 2. Check if can upload file (small)
    console.log('2. Checking upload permission (small file: 5MB)...');
    const checkSmallRes = await fetch(`${BASE_URL}/users/${userId}/check-upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileSizeMB: 5 }),
    });
    const checkSmallData = await checkSmallRes.json();

    if (checkSmallData.data.allowed) {
      console.log(`   Upload allowed`);
      if (checkSmallData.data.warning) {
        console.log(`   Warning: ${checkSmallData.data.warning}`);
      }
    } else {
      console.log(`   Upload blocked: ${checkSmallData.data.reason}`);
    }
    console.log();

    // 3. Check if can upload file (large - might exceed limit)
    console.log('3. Checking upload permission (large file: 200MB)...');
    const checkLargeRes = await fetch(`${BASE_URL}/users/${userId}/check-upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileSizeMB: 200 }),
    });
    const checkLargeData = await checkLargeRes.json();

    if (checkLargeData.data.allowed) {
      console.log(`   Upload allowed`);
      if (checkLargeData.data.warning) {
        console.log(`   Warning: ${checkLargeData.data.warning}`);
      }
    } else {
      console.log(`   Upload blocked: ${checkLargeData.data.reason}`);
    }
    console.log();

    // 4. Get tier recommendation
    console.log('4. Getting tier upgrade recommendation...');
    const recRes = await fetch(`${BASE_URL}/users/${userId}/tier-recommendation`);
    const recData = await recRes.json();
    const rec = recData.data;

    console.log(`   Current: ${rec.currentTier}`);
    console.log(`   Recommended: ${rec.recommendedTier}`);
    console.log(`   Reason: ${rec.reason}`);
    if (rec.upgradeCostSavings) {
      console.log(`   Benefit: ${rec.upgradeCostSavings}`);
    }
    console.log();

    // 5. Log usage
    console.log('5. Logging usage metrics...');
    await fetch(`${BASE_URL}/users/${userId}/log-usage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ environment: 'demo' }),
    });
    console.log(`   Usage logged to audit table\n`);

    console.log('='.repeat(70));
    console.log('TIER ENFORCEMENT TEST COMPLETED!\n');

    console.log('Summary:');
    console.log(`   Current Tier: ${metrics.metrics.tier}`);
    console.log(`   Tier Limits:`);
    console.log(`     - Max File: ${metrics.tierLimits.maxFileSizeMB}MB`);
    console.log(`     - Max Storage: ${metrics.tierLimits.maxStorageMB || 'Unlimited'}MB`);
    console.log(`     - Max Violations: ${metrics.tierLimits.maxViolationsPerMonth || 'Unlimited'}`);
    console.log(`     - Max Cases: ${metrics.tierLimits.maxCases || 'Unlimited'}`);
    console.log(`   Upload Checks:`);
    console.log(`     - 5MB file: ${checkSmallData.data.allowed ? 'Allowed' : 'Blocked'}`);
    console.log(`     - 200MB file: ${checkLargeData.data.allowed ? 'Allowed' : 'Blocked'}`);
    console.log(`   Next Action: ${rec.currentTier !== rec.recommendedTier ? `Consider upgrading to ${rec.recommendedTier}` : 'No upgrade needed'}`);

  } catch (error: any) {
    console.error('TEST FAILED:');
    console.error(error.message);
    process.exit(1);
  }
}

testTierEnforcement();
