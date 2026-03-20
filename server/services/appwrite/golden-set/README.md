# Golden Set - Accuracy Governance

This directory contains the accuracy governance framework for validating extraction pipeline quality.

## Overview

The golden set is a collection of 50-200 representative documents with known correct extractions.
It is used to validate that changes to prompts, models, or schemas do not regress extraction quality.

## Directory Structure

```
golden-set/
  types.ts          # Schema for golden set documents and metrics
  fixtures.ts       # Document definitions with expected extractions
  evaluator.ts      # Evaluation logic and metric calculation
  ci-validate.ts    # CI validation script
  baseline.json     # Current baseline metrics (auto-generated)
  files/            # Actual document files (PDF, images)
  reports/          # Historical evaluation reports
```

## Usage

### Run Validation

```bash
# Run with mock data (framework validation)
npx tsx server/services/appwrite/golden-set/ci-validate.ts

# Run with verbose output
npx tsx server/services/appwrite/golden-set/ci-validate.ts --verbose

# Update baseline after changes
npx tsx server/services/appwrite/golden-set/ci-validate.ts --update-baseline
```

### Add Documents to Golden Set

1. Add the document file to `golden-set/files/` with a unique name
2. Add a corresponding entry in `fixtures.ts` with:
   - Document metadata (id, name, category, file type)
   - Expected extractions (dates, amounts, entities, line items)
   - `shouldAutoFinalize` flag (false for documents requiring review)

### Metrics Tracked

- **Date Accuracy**: Exact date match (YYYY-MM-DD format)
- **Amount Accuracy**: Amounts within 1% tolerance
- **Category Accuracy**: Correct document category
- **Entity Accuracy**: Correct vendor/payee/payer extraction
- **Line Item Accuracy**: Correct line item amounts
- **False Finalization Rate**: Documents that should require review but were auto-finalized

### CI Integration

The CI validation script exits with code 1 if:

- Any metric regresses more than 2% from baseline
- False finalization rate increases more than 1%

Add to CI pipeline:

```yaml
- name: Golden Set Validation
  run: npx tsx server/services/appwrite/golden-set/ci-validate.ts
```

## Baseline Management

- First run creates a baseline automatically
- Use `--update-baseline` after intentional improvements
- Never update baseline without reviewing metrics
