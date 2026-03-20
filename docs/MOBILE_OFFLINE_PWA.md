# Mobile Offline PWA Guide

## Overview

The Divorce Ledger now includes a fully offline-capable Progressive Web App (PWA) that allows you to capture documents and violations on your mobile device, even without an internet connection. Data automatically syncs when you're on the same WiFi network as your desktop.

## Features

✅ **Offline-First**: Works completely offline - capture documents and violations anywhere  
✅ **Automatic WiFi Sync**: Syncs automatically when on the same network as desktop  
✅ **Quick Capture**: Opens directly to document capture page  
✅ **Installable**: Installs as a standalone app on your phone  
✅ **Background Sync**: Syncs in the background when connection is restored  
✅ **Local Storage**: All data stored securely on your device until synced

## Installation

### Desktop Setup

1. **Start the Application**:

   ```bash
   npm run dev
   ```

2. **Navigate to Mobile Install Page**:
   - Open `http://localhost:5000/mobile-install` in your browser
   - Or add `/mobile-install` to your deployment URL

3. **Display QR Code**:
   - The page shows a QR code and the installation URL
   - Keep this page open for scanning with your phone

### Mobile Installation

#### iPhone / iPad (Safari)

1. **Scan QR Code**: Open Camera app and scan the QR code
2. **Open Link**: Tap the notification to open in Safari
3. **Add to Home Screen**:
   - Tap the Share button (□ with ↑)
   - Scroll down and tap "Add to Home Screen"
   - Tap "Add" in the top right
4. **Launch**: Tap the new app icon on your home screen

#### Android (Chrome)

1. **Scan QR Code**: Open Camera app or QR scanner
2. **Open Link**: Tap to open in Chrome
3. **Install App**:
   - Tap the banner that appears, or
   - Tap menu (⋮) → "Install app" or "Add to Home screen"
   - Tap "Install"
4. **Launch**: Open the app from your app drawer or home screen

## Usage

### Quick Capture

The app opens directly to the Quick Capture page where you can:

1. **Capture Documents**:
   - Tap "Scan Document" or use camera button
   - Take a photo or select from gallery
   - Add title and category
   - Save (stored locally if offline)

2. **Report Violations**:
   - Tap "Report Violation"
   - Fill in violation details
   - Add photos/videos if needed
   - Save (stored locally if offline)

### Offline Mode

When offline, the app:

- ✅ Allows full document and violation capture
- ✅ Stores all data locally in IndexedDB
- ✅ Shows offline indicator in the header
- ✅ Displays pending sync count
- ✅ Queues all changes for later sync

### WiFi Sync

#### Automatic Sync

The app automatically syncs when:

1. You return to the same WiFi network as your desktop
2. Every 30 seconds (checks for pending items)
3. When device comes back online (background sync)

#### Manual Sync

1. **Check Sync Status**:
   - Look for sync indicator in app header
   - Shows: Online/Offline status, Pending count, Last sync time

2. **Force Sync**:
   - Tap the sync indicator
   - View pending items
   - Tap "Sync Now" button

3. **View Progress**:
   - Sync status updates in real-time
   - Shows items synced and any errors

## Configuration

### Server URL (Optional)

If your desktop is on a specific IP address:

1. **Find Desktop IP**:
   - Visit `/mobile-install` on desktop
   - Look for "Network" section showing your IP

2. **Configure on Mobile**:
   - Open browser console
   - Run: `localStorage.setItem('sync-server-url', 'http://192.168.x.x:5000')`
   - Replace with your desktop's IP

### Sync Interval

Default: 30 seconds. To change:

```typescript
import { startAutoSync } from '@/lib/wifi-sync';

// Check every 60 seconds instead
startAutoSync(60000);
```

## Technical Architecture

### Storage

**IndexedDB Schema**:

- `documents`: Offline documents with file Blobs
- `violations`: Offline violations with media files
- `syncQueue`: Pending PATCH/DELETE operations
- `syncMetadata`: Last sync time, server URL, pending count

**Storage Limits**:

- Chrome/Android: ~6% of free disk space
- Safari/iOS: 50MB initially, requests more as needed

### Sync Strategy

1. **Network Detection**:
   - Pings `/api/health` to check server reachability
   - Only syncs if server responds (same network)

2. **Conflict Resolution**:
   - Client-wins strategy (mobile data overwrites)
   - Timestamps used for ordering
   - No automatic merge (user must resolve)

3. **Retry Logic**:
   - Failed items remain in sync queue
   - Retried on next sync attempt
   - Errors logged but don't block other items

### Service Worker

**Caching Strategy**:

- Navigation: Never cached (always fresh HTML)
- API calls: Network-first, cache fallback
- Static assets: Network-first, cache fallback

**Background Sync**:

- Registers for 'sync-offline-data' tag
- Triggered when device comes online
- Notifies app to run sync

## Troubleshooting

### App Won't Install

**iOS**:

- Must use Safari (not Chrome or Firefox)
- Check if already installed
- Try refreshing the page

**Android**:

- Must use Chrome or Edge
- Check "Unknown sources" permission if needed
- Clear browser cache and retry

### Sync Not Working

1. **Check Connection**:
   - Verify both devices on same WiFi
   - Open `/api/health` on mobile browser
   - Should return: `{"status": "healthy"}`

2. **Check Pending Items**:
   - Tap sync indicator
   - View pending counts
   - Try manual sync

3. **Check Console**:
   - Open browser DevTools on mobile
   - Look for `[WiFi Sync]` logs
   - Check for error messages

4. **Reset Sync State**:
   ```javascript
   // In mobile browser console
   import { clearAllOfflineData } from '@/lib/offline-db';
   await clearAllOfflineData();
   ```

### Storage Full

**Check Usage**:

```javascript
import { getStorageInfo } from '@/lib/offline-db';
const info = await getStorageInfo();
console.log('Usage:', info.usage, 'Quota:', info.quota);
```

**Clear Old Data**:

- Manually delete old documents/violations
- Sync regularly to upload and clear local storage
- Browser may automatically prompt to increase quota

## API Reference

### WiFi Sync Functions

```typescript
// Start automatic sync (default: 30s interval)
startAutoSync(intervalMs?: number): void

// Stop automatic sync
stopAutoSync(): void

// Manually trigger sync
syncOfflineData(): Promise<SyncResult>

// Get current sync status
getSyncStatus(): SyncStatus

// Listen for status changes
onSyncStatusChange(listener: (status: SyncStatus) => void): () => void

// Configure server URL
setServerUrl(url: string): void
getConfiguredServerUrl(): string | null
clearServerUrl(): void

// Register background sync
registerBackgroundSync(): Promise<void>
triggerBackgroundSync(): void
```

### Offline Database Functions

```typescript
// Documents
saveOfflineDocument(doc: OfflineDocument): Promise<string>
getOfflineDocuments(): Promise<OfflineDocument[]>
getUnsyncedDocuments(): Promise<OfflineDocument[]>
markDocumentSynced(id: string): Promise<void>
deleteOfflineDocument(id: string): Promise<void>

// Violations
saveOfflineViolation(violation: OfflineViolation): Promise<string>
getOfflineViolations(): Promise<OfflineViolation[]>
getUnsyncedViolations(): Promise<OfflineViolation[]>
markViolationSynced(id: string): Promise<void>
deleteOfflineViolation(id: string): Promise<void>

// Metadata
setSyncMetadata(metadata: Partial<SyncMetadata>): Promise<void>
getSyncMetadata(): Promise<SyncMetadata>

// Storage
getStorageInfo(): Promise<{ usage: number; quota: number }>
clearAllOfflineData(): Promise<void>
```

## Security Considerations

1. **Data Encryption**:
   - Data stored in IndexedDB (browser's encrypted storage)
   - HTTPS required in production
   - Credentials sent with sync requests

2. **Authentication**:
   - User must be logged in to sync
   - Session cookies included in requests
   - Server validates authentication

3. **Network Security**:
   - Only syncs on same local network
   - No automatic sync on public WiFi
   - Manual server URL configuration available

## Performance

### App Size

- Initial load: ~2-3 MB (JS/CSS/fonts)
- Service worker: ~5 KB
- Cached after first load

### Storage Usage

- Document (1 MB photo): ~1.1 MB (includes metadata)
- Violation with 3 photos: ~3-4 MB
- Typical user: 50-100 MB over time

### Sync Speed

- 1 document: ~500ms - 2s (depends on file size)
- 10 documents: ~5-20s
- Network bandwidth limited

## Updates

The PWA automatically updates when:

1. **New Version Available**:
   - Service worker detects update
   - Downloads in background
   - User prompted to refresh

2. **Force Update**:
   - Refresh app (pull down to refresh)
   - Close and reopen app
   - Wait for automatic update check (every hour)

## Support

For issues or questions:

1. Check this guide
2. Review console logs (`[WiFi Sync]`, `[SW]` prefixes)
3. Check GitHub issues
4. Contact support with:
   - Device type and OS version
   - Browser version
   - Error messages from console
   - Steps to reproduce

## Roadmap

Future enhancements:

- [ ] Push notifications for sync completion
- [ ] Conflict resolution UI
- [ ] Selective sync (choose what to upload)
- [ ] Sync progress bar
- [ ] Offline analytics
- [ ] Multi-device conflict handling
- [ ] Export offline data
- [ ] QR code sharing between devices
