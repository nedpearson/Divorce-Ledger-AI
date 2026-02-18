I need to implement a complete monetization system AND enhanced voice/media capture features for DivorceASE AI.

=== PHASE 1: DATABASE & TIER MANAGEMENT ===

1. Add these columns to users table:
   - tier (VARCHAR, default 'free')
   - stripe_customer_id (VARCHAR)
   - stripe_subscription_id (VARCHAR)
   - subscription_status (VARCHAR)
   - cases_count (INT, default 0)
   - violations_count_this_month (INT, default 0)
   - billing_cycle_start (DATE)

2. Add these columns to violations table:
   - audio_transcript (TEXT) - stores voice-to-text transcription
   - media_files (JSON) - array of image/video/screenshot URLs
   - ai_classification (VARCHAR) - AI-suggested violation type
   - ai_confidence_score (DECIMAL) - 0-100% confidence in classification
   - voice_notes (TEXT) - additional voice notes about the violation
   - media_descriptions (JSON) - AI-generated descriptions of uploaded media

3. Create tier configuration with these limits:
   FREE TIER ($0):
   - 1 case, 25 violations/month
   - Voice-to-text: 10 transcriptions/month
   - Media uploads: 5 photos/month (watermarked)
   - AI classification: Manual only
   
   INDIVIDUAL TIER ($12/mo):
   - 1 case, unlimited violations
   - Voice-to-text: 100 transcriptions/month
   - Media uploads: 50 photos/videos/month
   - AI classification: Basic pattern detection
   
   PRO TIER ($49/mo):
   - Unlimited cases/violations
   - Voice-to-text: Unlimited
   - Media uploads: Unlimited
   - AI classification: Advanced with confidence scoring
   - Screenshot OCR text extraction
   
   TEAM TIER ($149/mo):
   - Everything in Pro + 3-5 users
   - Shared media library
   - Team collaboration on classifications
   
   ENTERPRISE TIER ($399/mo):
   - Unlimited everything
   - Custom AI training on firm's case history
   - White-label options
   - API access

=== PHASE 2: VOICE-TO-TEXT & MEDIA CAPTURE ===

4. Implement voice recording in "Document Violation" flow:
   - Add microphone button in Description field
   - Use Web Speech API for real-time transcription
   - Save both audio file AND transcript to database
   - Allow user to edit transcript before submitting
   - Voice input should work for:
     * Violation description
     * Notes field
     * Classification instructions (e.g., "This should be classified as financial misconduct")
   
5. Add "Voice-to-Violation" quick capture mode:
   - Single button on home screen: "Tell Me What Happened"
   - Records user narrating entire incident
   - AI extracts:
     * Violation type from keywords
     * Date/time from speech
     * Key details for description
     * Emotional tone (for context)
   - User reviews and confirms before saving
   
6. Implement smart media upload:
   - Camera button: Take photo now
   - Gallery button: Select from device
   - Screenshot button: Annotate and crop
   - Video button: Record up to 2min (free) or unlimited (paid)
   
7. Add AI media analysis:
   - OCR for text messages/emails in photos
   - Object detection (e.g., "Photo contains: person, document, timestamp")
   - Auto-suggest violation type based on image content
   - Extract dates from photos (EXIF data + visual date recognition)
   - Redaction tool for sensitive info in images

8. Voice-assisted classification:
   - After uploading photo/screenshot, prompt: "Tell me what this shows"
   - User explains via voice
   - AI combines image analysis + voice description to suggest classification
   - Show confidence score: "85% confident this is: Parenting Plan Violation"
   - User can accept or override

=== PHASE 3: ENHANCED UI FLOW ===

9. Update "Document Violation" screen to include:

   STEP 1: CHOOSE INPUT METHOD
   [Voice Input] [Camera] [Gallery] [Video] [Type It]
   
   STEP 2: CAPTURE
   - If Voice: Show waveform, real-time transcript
   - If Camera/Gallery: Show preview with annotation tools
   - If Video: Recording timer, flip camera option
   
   STEP 3: AI CLASSIFICATION (Auto-suggest)
   "Based on your input, this appears to be:"
   [Suggested Type] (85% confidence)
   [Tap to change] or [Voice: "Actually, this is..."]
   
   STEP 4: NOTES (Optional)
   [Microphone icon] "Add voice notes to explain more"
   OR
   [Type additional details]
   
   STEP 5: REVIEW & SUBMIT
   - Preview: Media + Transcript + Classification
   - Edit any field
   - [SUBMIT] → Auto-sends to lawyer

10. Add Notes section to violation detail view:
    - Text notes (typed)
    - Voice notes (with playback)
    - Photos/videos attached to notes
    - Timestamps for each note
    - Lawyer can add notes too (with role tag)

=== PHASE 4: FEATURE GATING ===

11. Create middleware that enforces tier limits:
    - Block voice transcriptions if free tier exceeds 10/month
    - Block media uploads if free tier exceeds 5/month
    - Watermark photos in free tier
    - Disable AI classification for free tier (manual dropdown only)
    - Show "Upgrade to Pro" prompts when hitting limits

12. Upgrade prompts trigger when:
    - User tries 11th voice transcription (free tier)
    - User tries 6th photo upload (free tier)
    - User taps AI classification button (free tier)
    - User records video >30 seconds (free tier)

=== PHASE 5: PRICING PAGE ===

13. Create /pricing route with feature comparison table:

    Feature Comparison Table:
    | Feature | Free | Individual | Pro | Team | Enterprise |
    |---------|------|------------|-----|------|------------|
    | Cases | 1 | 1 | ∞ | ∞ | ∞ |
    | Violations/mo | 25 | ∞ | ∞ | ∞ | ∞ |
    | Voice transcriptions | 10/mo | 100/mo | ∞ | ∞ | ∞ |
    | Photo/video uploads | 5/mo | 50/mo | ∞ | ∞ | ∞ |
    | AI classification | Manual only | Basic | Advanced | Advanced | Custom AI |
    | Screenshot OCR | ❌ | ❌ | ✅ | ✅ | ✅ |
    | Video length | 30 sec | 2 min | ∞ | ∞ | ∞ |
    | Voice notes | 10/mo | ∞ | ∞ | ∞ | ∞ |
    | Watermarks | Yes | No | No | No | No |

=== PHASE 6: STRIPE INTEGRATION ===

14. Integrate Stripe Checkout:
    - Create checkout sessions for each paid tier
    - Handle webhook: subscription.created → upgrade user tier
    - Handle webhook: subscription.deleted → downgrade to free
    - Handle webhook: invoice.payment_failed → notify user
    - Add "Manage Subscription" button in profile
    - Support annual billing (20% discount)

15. Usage tracking for billing:
    - Reset violations_count_this_month on billing cycle
    - Track voice_transcriptions_this_month
    - Track media_uploads_this_month
    - Log when users hit limits (for conversion funnel analysis)

=== TECHNICAL REQUIREMENTS ===

Voice-to-Text:
- Use Web Speech API (free, built into browsers)
- Fallback: Deepgram API for better accuracy ($0.0043/min)
- Store audio files in Replit's object storage or AWS S3

AI Classification:
- Use OpenAI GPT-4 Vision API for image analysis ($0.01-0.03/image)
- Use GPT-4 for text classification ($0.03/1K tokens)
- Implement caching to avoid duplicate API calls

Media Storage:
- Replit's built-in storage for small files
- AWS S3 or Cloudflare R2 for production (cheaper)
- Implement automatic compression for photos/videos

=== BUILD ORDER ===

Priority 1 (This week):
- Database schema updates
- Basic voice-to-text in description field
- Photo/video upload with preview
- Feature gating middleware

Priority 2 (Next week):
- AI classification suggestions
- Voice-assisted classification
- Screenshot OCR
- Notes section with voice/media support

Priority 3 (Week 3):
- Pricing page
- Stripe integration
- Usage tracking dashboard

Priority 4 (Week 4):
- "Voice-to-Violation" quick capture
- Advanced AI media analysis
- Admin dashboard for tier management

Start with Priority 1. Show me the updated database schema first, then we'll build the voice recording component.