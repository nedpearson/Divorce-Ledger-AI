# LLM Configuration for Document Analysis

## Overview

This application now supports multiple LLM providers for document scanning and auto-categorization:

- **Claude 3.5 Sonnet** (Anthropic) - **RECOMMENDED** for financial documents
- **GPT-4o** (OpenAI) - Excellent for vision and OCR
- **Gemini 2.0 Flash** (Google) - Cost-effective for high-volume processing

## Configuration

### 1. Set the Model (Optional)

By default, the system uses **Claude 3.5 Sonnet** for best accuracy. To change the model, set the environment variable:

```bash
# Use Claude 3.5 Sonnet (default - RECOMMENDED for financial/legal documents)
DOCUMENT_ANALYSIS_MODEL=claude

# Use GPT-4o (excellent for vision/OCR)
DOCUMENT_ANALYSIS_MODEL=gpt-4o

# Use GPT-4o Mini (cost-effective OpenAI)
DOCUMENT_ANALYSIS_MODEL=gpt-4o-mini

# Use Gemini 2.0 Flash (fastest and cheapest)
DOCUMENT_ANALYSIS_MODEL=gemini-2.0-flash

# Use Gemini 1.5 Flash (legacy)
DOCUMENT_ANALYSIS_MODEL=gemini-1.5-flash
```

### 2. Set API Keys

#### For Claude (Anthropic)

```bash
ANTHROPIC_API_KEY=your-anthropic-api-key-here
# OR for Replit AI Integration:
AI_INTEGRATIONS_ANTHROPIC_API_KEY=your-key-here
```

#### For OpenAI

```bash
OPENAI_API_KEY=your-openai-api-key-here
# OR for Replit AI Integration:
AI_INTEGRATIONS_OPENAI_API_KEY=your-key-here
AI_INTEGRATIONS_OPENAI_BASE_URL=https://replit-proxy-url  # Optional
```

#### For Gemini

```bash
GEMINI_API_KEY=your-gemini-api-key-here
# OR for Replit AI Integration:
AI_INTEGRATIONS_GEMINI_API_KEY=your-key-here
AI_INTEGRATIONS_GEMINI_BASE_URL=https://replit-proxy-url  # Optional
```

## Model Comparison

| Model                 | Provider  | Best For                        | Vision | Cost (per 1M tokens) | Accuracy   |
| --------------------- | --------- | ------------------------------- | ------ | -------------------- | ---------- |
| **Claude 3.5 Sonnet** | Anthropic | Financial docs, structured data | ✅     | $3/$15 (in/out)      | ⭐⭐⭐⭐⭐ |
| **GPT-4o**            | OpenAI    | Vision, OCR, images             | ✅     | $2.50/$10            | ⭐⭐⭐⭐⭐ |
| **GPT-4o Mini**       | OpenAI    | Cost-effective                  | ✅     | $0.15/$0.60          | ⭐⭐⭐⭐   |
| **Gemini 2.0 Flash**  | Google    | High volume                     | ✅     | $0.01/$0.04          | ⭐⭐⭐⭐   |
| **Gemini 1.5 Flash**  | Google    | Legacy                          | ✅     | $0.075/$0.30         | ⭐⭐⭐     |

## Why Claude 3.5 Sonnet is Recommended

For a divorce/legal/financial document system, **Claude 3.5 Sonnet** offers:

1. **Best-in-class structured data extraction** - Superior at pulling financial details from receipts, invoices, and statements
2. **Excellent reasoning** - Better understands context for categorization decisions
3. **High accuracy for legal documents** - Trained on extensive legal and financial data
4. **Reliable JSON output** - Follows complex extraction instructions precisely
5. **Vision support** - Can analyze both text and scanned images

## Cost Considerations

For a typical financial document:

- **Claude 3.5 Sonnet**: ~$0.01-0.05 per document (best accuracy)
- **GPT-4o**: ~$0.008-0.04 per document (excellent for images)
- **GPT-4o Mini**: ~$0.001-0.005 per document (good balance)
- **Gemini 2.0 Flash**: ~$0.0001-0.001 per document (most economical)

## Usage Examples

### Default (Claude 3.5 Sonnet)

No configuration needed - will use Claude automatically if `ANTHROPIC_API_KEY` is set.

### Switch to GPT-4o

```bash
# .env file
DOCUMENT_ANALYSIS_MODEL=gpt-4o
OPENAI_API_KEY=your-key-here
```

### Switch to Gemini for Cost Savings

```bash
# .env file
DOCUMENT_ANALYSIS_MODEL=gemini-2.0-flash
GEMINI_API_KEY=your-key-here
```

## Monitoring

The system logs which model is being used on startup:

```
[Document Analysis] Using claude (claude-3-5-sonnet-20241022)
```

You can also check the `analysis_runs` collection in Appwrite to see:

- `modelProvider`: Which provider was used (claude/openai/gemini)
- `modelVersion`: The specific model version
- `estimatedCost`: Cost for that analysis

## Troubleshooting

### "API key not configured" Error

Make sure you have the appropriate API key set for your chosen model:

- Claude: `ANTHROPIC_API_KEY`
- OpenAI: `OPENAI_API_KEY`
- Gemini: `GEMINI_API_KEY`

### Model Not Switching

1. Check that `DOCUMENT_ANALYSIS_MODEL` is spelled correctly
2. Restart the server after changing environment variables
3. Verify the API key for the new model is set

### High Costs

- Switch to a cheaper model like `gpt-4o-mini` or `gemini-2.0-flash`
- Monitor the `analysis_runs` collection for cost per document
- Consider implementing rate limits or daily caps

## Migration from Previous Version

The system will automatically use Claude 3.5 Sonnet if you:

1. Install the Anthropic SDK: `npm install @anthropic-ai/sdk` ✅ (already done)
2. Set `ANTHROPIC_API_KEY` in your environment
3. Restart the server

To continue using Gemini, set:

```bash
DOCUMENT_ANALYSIS_MODEL=gemini-2.0-flash
```

## Best Practices

1. **Start with Claude** for maximum accuracy with financial documents
2. **Use GPT-4o** if you process many scanned images or photos
3. **Switch to Gemini** only if cost is the primary concern
4. **Monitor costs** via the `analysis_runs` collection
5. **Test multiple models** with your specific documents to find the best fit
