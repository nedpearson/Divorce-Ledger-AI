-- Divorce Ledger Analytics Queries
-- These queries work with the current schema for tracking platform usage

-- Query 1: Audio violations by AI classification
SELECT 
  ai_classification,
  COUNT(*) as count,
  AVG(severity_score) as avg_severity,
  MAX(severity_score) as max_severity
FROM violations
WHERE audio_transcript IS NOT NULL
GROUP BY ai_classification
ORDER BY count DESC;

-- Query 2: Media uploads by user tier
SELECT 
  u.subscription_tier as tier,
  COUNT(DISTINCT u.id) as users,
  COUNT(e.id) as total_media_uploads,
  COALESCE(SUM(e.file_size), 0) / (1024*1024) as total_size_mb,
  COALESCE(AVG(e.file_size), 0) / 1024 as avg_size_kb
FROM users u
LEFT JOIN cases c ON u.id = c.user_id
LEFT JOIN violations v ON c.id = v.case_id
LEFT JOIN evidence_files e ON v.id = e.violation_id AND e.evidence_source = 'media_upload'
GROUP BY u.subscription_tier;

-- Query 3: Transcription quality metrics
SELECT 
  DATE_TRUNC('day', v.timestamp) as date,
  COUNT(*) as transcriptions,
  AVG(
    CASE 
      WHEN e.evidence_metadata->>'transcript' IS NOT NULL THEN 1
      ELSE 0
    END
  ) as success_rate,
  COUNT(DISTINCT v.case_id) as cases_with_media
FROM violations v
LEFT JOIN evidence_files e ON v.id = e.violation_id AND e.file_type LIKE 'audio%'
WHERE v.audio_transcript IS NOT NULL
GROUP BY DATE_TRUNC('day', v.timestamp)
ORDER BY date DESC;

-- Query 4: High-risk violations from voice (AI classified)
SELECT 
  c.case_number,
  v.id as violation_id,
  v.ai_classification as detected_type,
  v.severity_score,
  v.audio_transcript,
  COUNT(e.id) as supporting_media_count
FROM cases c
JOIN violations v ON c.id = v.case_id
LEFT JOIN evidence_files e ON v.id = e.violation_id AND e.evidence_source = 'media_upload'
WHERE v.audio_transcript IS NOT NULL
  AND v.ai_classification IN ('threats', 'physical_abuse', 'harassment')
  AND v.severity_score > 70
GROUP BY c.case_number, v.id, v.ai_classification, v.severity_score, v.audio_transcript
ORDER BY v.severity_score DESC;

-- Query 5: User tier upgrade candidates
SELECT 
  u.id,
  u.email,
  u.subscription_tier as tier,
  u.violations_count_this_month,
  COUNT(DISTINCT c.id) as active_cases,
  COUNT(DISTINCT e.id) as media_uploads,
  CASE 
    WHEN u.violations_count_this_month > 50 THEN 'enterprise'
    WHEN u.violations_count_this_month > 20 THEN 'pro'
    ELSE 'free'
  END as recommended_tier
FROM users u
LEFT JOIN cases c ON u.id = c.user_id
LEFT JOIN violations v ON c.id = v.case_id
LEFT JOIN evidence_files e ON v.id = e.violation_id AND e.evidence_source = 'media_upload'
WHERE u.violations_count_this_month > 0
GROUP BY u.id, u.email, u.subscription_tier, u.violations_count_this_month
HAVING u.violations_count_this_month >= 20
ORDER BY u.violations_count_this_month DESC;

-- Query 6: Monthly usage summary by tier
SELECT 
  u.subscription_tier as tier,
  COUNT(DISTINCT u.id) as total_users,
  SUM(u.violations_count_this_month) as total_violations,
  SUM(u.voice_transcriptions_this_month) as total_voice_transcriptions,
  SUM(u.media_uploads_this_month) as total_media_uploads,
  AVG(u.violations_count_this_month) as avg_violations_per_user
FROM users u
GROUP BY u.subscription_tier
ORDER BY 
  CASE u.subscription_tier
    WHEN 'enterprise' THEN 1
    WHEN 'team' THEN 2
    WHEN 'pro' THEN 3
    WHEN 'individual' THEN 4
    WHEN 'free' THEN 5
  END;

-- Query 7: Evidence chain of custody audit
SELECT 
  e.id as evidence_id,
  e.file_name,
  e.file_type,
  e.sha256_hash,
  COUNT(coc.id) as custody_events,
  MIN(coc.timestamp) as first_recorded,
  MAX(coc.timestamp) as last_action
FROM evidence_files e
LEFT JOIN chain_of_custody coc ON e.id = coc.evidence_id
GROUP BY e.id, e.file_name, e.file_type, e.sha256_hash
ORDER BY last_action DESC;
