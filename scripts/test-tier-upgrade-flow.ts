// Test script for tier upgrade flow
// Run with: npx tsx scripts/test-tier-upgrade-flow.ts

const BASE_URL = 'http://localhost:5000/api';

async function testTierUpgradeFlow() {
  console.log('TIER UPGRADE FLOW TEST\n');
  console.log('='.repeat(70) + '\n');

  try {
    const userId = 'demo-user';

    // 1. Check initial tier stats
    console.log('1. Checking initial tier stats...');
    const initialStatsRes = await fetch(`${BASE_URL}/users/${userId}/tier-stats`);
    const initialStatsData = await initialStatsRes.json();
    const initialStats = initialStatsData.data;

    console.log(`   Current Tier: ${initialStats.currentTier}`);
    console.log(`   Violations This Month: ${initialStats.usage.violationsThisMonth}`);
    console.log(`   Recommended Tier: ${initialStats.recommendedTier}`);
    console.log(`   Voice Remaining: ${initialStats.usage.voiceRemaining}`);
    console.log(`   Media Remaining: ${initialStats.usage.mediaRemaining}\n`);

    // 2. Get current violations count
    console.log('2. Checking violations count...');
    const violCountRes = await fetch(`${BASE_URL}/users/violations-this-month`);
    const violCountData = await violCountRes.json();

    console.log(`   Total Violations This Month: ${violCountData.data.count}\n`);

    // 3. Test violation creation (if within limits)
    console.log('3. Testing violation creation...');
    const testViolation = {
      type: 'harassment',
      description:
        'Test violation for tier upgrade flow - verbal abuse recorded during custody exchange',
      location: 'School parking lot',
      environment: 'demo',
    };

    const createRes = await fetch(`${BASE_URL}/violations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testViolation),
    });
    const createData = await createRes.json();

    if (createData.id) {
      console.log(`   Created violation: ${createData.id}`);

      // 4. Test AI classification
      console.log('\n4. Testing AI classification...');

      // First save a transcript
      const transcriptRes = await fetch(`${BASE_URL}/violations/${createData.id}/transcript`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript:
            'You need to listen to me. I told you not to take the kids without my permission. This is getting out of control.',
        }),
      });
      const transcriptData = await transcriptRes.json();
      console.log(`   Transcript saved: ${transcriptData.success}`);

      // Then classify
      const classifyRes = await fetch(`${BASE_URL}/violations/${createData.id}/classify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const classifyData = await classifyRes.json();

      if (classifyData.success) {
        console.log(`   Classification: ${classifyData.data.type}`);
        console.log(`   Confidence: ${(classifyData.data.confidence * 100).toFixed(0)}%`);
        console.log(`   Severity: ${classifyData.data.severity}`);
        console.log(
          `   Detected Patterns: ${classifyData.data.detectedPatterns?.join(', ') || 'None'}`
        );
      }
    } else {
      console.log(`   Skipped (limit reached or error): ${createData.message || createData.error}`);
    }

    // 5. Update user tier metrics
    console.log('\n5. Updating user tier metrics...');
    const updateTierRes = await fetch(`${BASE_URL}/users/${userId}/update-tier`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const tierUpdate = await updateTierRes.json();

    console.log(`   Total Violations: ${tierUpdate.data.totalViolations}`);
    console.log(`   Recommended Tier: ${tierUpdate.data.recommendedTier}\n`);

    // 6. Get final tier stats
    console.log('6. Getting final tier stats...');
    const finalStatsRes = await fetch(`${BASE_URL}/users/${userId}/tier-stats`);
    const finalStatsData = await finalStatsRes.json();
    const finalStats = finalStatsData.data;

    console.log(`   Current Tier: ${finalStats.currentTier}`);
    console.log(`   Recommended Tier: ${finalStats.recommendedTier}`);
    console.log(`   Usage:`);
    console.log(
      `     - Violations: ${finalStats.usage.violationsThisMonth} (${finalStats.usage.violationsRemaining} remaining)`
    );
    console.log(
      `     - Voice: ${finalStats.usage.voiceTranscriptionsThisMonth} (${finalStats.usage.voiceRemaining} remaining)`
    );
    console.log(
      `     - Media: ${finalStats.usage.mediaUploadsThisMonth} (${finalStats.usage.mediaRemaining} remaining)`
    );
    console.log(`   Tier Limits:`);
    console.log(`     - Max File Size: ${finalStats.tierLimits.maxFileSizeMb}MB`);
    console.log(`     - Max Violations/Month: ${finalStats.tierLimits.maxViolationsPerMonth}`);
    console.log(`     - Max Voice/Month: ${finalStats.tierLimits.maxVoicePerMonth}`);
    console.log(`     - Max Media/Month: ${finalStats.tierLimits.maxMediaPerMonth}\n`);

    console.log('='.repeat(70));
    console.log('TIER UPGRADE FLOW TEST COMPLETED!\n');
  } catch (error: any) {
    console.error('TEST FAILED:');
    console.error(error.message);
    process.exit(1);
  }
}

testTierUpgradeFlow();
