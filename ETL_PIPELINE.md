# Divorce Ledger - ETL Pipeline Documentation

## Overview

The ETL (Extract, Transform, Load) pipeline provides a complete data warehouse solution for Divorce Ledger, enabling analytics, reporting, and business intelligence.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         ETL PIPELINE                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐          │
│  │  EXTRACTION  │───▶│TRANSFORMATION│───▶│   LOADING    │          │
│  │              │    │              │    │              │          │
│  │ • Users      │    │ • Normalize  │    │ • Dim Tables │          │
│  │ • Violations │    │ • JSONB Parse│    │ • Fact Tables│          │
│  │ • Billing    │    │ • Dedupe     │    │ • Indexes    │          │
│  │ • Evidence   │    │ • Enrich     │    │ • Audit Log  │          │
│  └──────────────┘    └──────────────┘    └──────────────┘          │
│         │                   │                   │                   │
│         ▼                   ▼                   ▼                   │
│  ┌──────────────────────────────────────────────────────┐          │
│  │              DATA QUALITY CHECKS                      │          │
│  │  • Null checks  • Row counts  • Referential integrity │          │
│  │  • Freshness    • Range validation  • Duplicates      │          │
│  └──────────────────────────────────────────────────────┘          │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Data Warehouse Schema

### Dimension Tables

| Table                    | Description                                              |
| ------------------------ | -------------------------------------------------------- |
| `dim_time`               | Date/time dimension with day, week, month, quarter, year |
| `dim_user`               | User dimension with SCD Type 2 for tier changes          |
| `dim_subscription`       | Subscription tier reference data                         |
| `dim_violation_category` | Violation category taxonomy                              |
| `dim_case`               | Case dimension with status tracking                      |
| `dim_payment_method`     | Payment method reference                                 |
| `dim_media_type`         | Evidence media type reference                            |

### Fact Tables

| Table                        | Description                              |
| ---------------------------- | ---------------------------------------- |
| `fact_user_activity`         | User activity events                     |
| `fact_billing_event`         | Billing and payment events               |
| `fact_violation`             | Violation records with enriched metadata |
| `fact_financial_transaction` | Financial transactions across all types  |
| `fact_evidence_usage`        | Evidence file usage metrics              |
| `fact_quickbooks_sync`       | QuickBooks sync events                   |

### Control Tables

| Table                  | Description                       |
| ---------------------- | --------------------------------- |
| `etl_job_log`          | ETL job execution history         |
| `etl_data_quality_log` | Data quality check results        |
| `etl_watermark`        | Incremental extraction watermarks |

## API Endpoints

### Status & History

```bash
# Get ETL status and scheduler info
GET /api/etl/status

# Get job execution history
GET /api/etl/history?limit=20

# Get data quality report
GET /api/etl/quality/:jobId?
```

### Run Pipelines (Requires x-admin-secret header)

```bash
# Run full ETL pipeline
POST /api/etl/run/full
curl -X POST http://localhost:5000/api/etl/run/full \
  -H "x-admin-secret: YOUR_SECRET"

# Run incremental pipeline (uses watermarks)
POST /api/etl/run/incremental

# Run users-only pipeline
POST /api/etl/run/users

# Run violations-only pipeline
POST /api/etl/run/violations
```

### Scheduler Control

```bash
# Start ETL scheduler
POST /api/etl/scheduler/start

# Stop ETL scheduler
POST /api/etl/scheduler/stop

# Trigger specific job
POST /api/etl/scheduler/trigger/:jobName

# Enable/disable job
POST /api/etl/scheduler/enable/:jobName
POST /api/etl/scheduler/disable/:jobName
```

## Scheduled Jobs

| Job Name            | Schedule            | Description                 |
| ------------------- | ------------------- | --------------------------- |
| `full_pipeline`     | 2:00 AM daily       | Full ETL with all sources   |
| `hourly_violations` | Every hour (0 min)  | Incremental violations sync |
| `hourly_users`      | Every hour (30 min) | Incremental users sync      |

## Error Handling

### Retry Logic

The pipeline implements exponential backoff with jitter:

- **Max Retries**: 3 attempts
- **Base Delay**: 1 second
- **Backoff**: 2^attempt \* base + random(0-500ms)

### Data Quality Checks

| Check Type    | Severity | Description                      |
| ------------- | -------- | -------------------------------- |
| `null_check`  | critical | Required fields must not be null |
| `row_count`   | warning  | Row count variance < 2%          |
| `referential` | critical | Foreign key integrity            |
| `freshness`   | warning  | Data < 2 hours old               |
| `range`       | warning  | Numeric values within bounds     |

### Error Recovery

1. Failed jobs are logged to `etl_job_log` with error details
2. Partial success retains loaded data
3. Watermarks only update after successful extraction
4. Dead-letter pattern for corrupt records

## JSONB Transformation

The pipeline handles semi-structured data from:

### Violations Metadata

```json
{
  "ai_classification": "custody_violation",
  "ai_confidence": 0.87,
  "evidence_count": 3,
  "location": "123 Main St"
}
```

Transformed to:

- `fact_violation.ai_classification`
- `fact_violation.ai_confidence`
- `fact_violation.evidence_count`
- `fact_violation.location`

### Evidence Metadata

```json
{
  "source": "mobile_upload",
  "device": "iPhone 15",
  "gps_coordinates": {...}
}
```

Transformed to:

- `fact_evidence_usage.evidence_source`
- Flattened device info

## Setup

### 1. Apply Migrations

```bash
psql $DATABASE_URL < migrations/warehouse-schema.sql
```

### 2. Initialize Time Dimension

The pipeline auto-populates `dim_time` with dates from 2024-2027 on first run.

### 3. Start Scheduler

```bash
curl -X POST http://localhost:5000/api/etl/scheduler/start \
  -H "x-admin-secret: YOUR_SECRET"
```

## Monitoring

### Check Pipeline Status

```bash
curl http://localhost:5000/api/etl/status
```

Response:

```json
{
  "scheduler": {
    "isRunning": true,
    "jobs": [
      {
        "id": "full_pipeline",
        "name": "Full ETL Pipeline",
        "lastRun": "2026-01-05T02:00:00Z",
        "nextRun": "2026-01-06T02:00:00Z",
        "enabled": true
      }
    ]
  },
  "recentJobs": [...]
}
```

### Quality Dashboard Query

```sql
SELECT
  check_name,
  check_type,
  COUNT(*) as total_checks,
  SUM(CASE WHEN passed THEN 1 ELSE 0 END) as passed,
  SUM(CASE WHEN NOT passed AND severity = 'critical' THEN 1 ELSE 0 END) as critical_failures
FROM etl_data_quality_log
WHERE checked_at > NOW() - INTERVAL '24 hours'
GROUP BY check_name, check_type;
```

## Best Practices

1. **Run full pipeline during off-peak hours** (default: 2 AM)
2. **Monitor quality checks** for critical failures
3. **Use incremental pipelines** for near-real-time data
4. **Review job history** regularly for performance trends
5. **Set up alerts** for job failures via scheduler hooks
