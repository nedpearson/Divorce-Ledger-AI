# Quick Start: Mobile Offline App

## 🚀 Quick Setup (5 minutes)

### 1. Start the Server

```bash
npm run dev
```

Wait for: `Server running on http://localhost:5000`

### 2. Open QR Code Page

On desktop, open: **http://localhost:5000/mobile-install**

### 3. Install on Phone

**iPhone**:
- Open Camera → Scan QR code
- Tap notification → Opens in Safari
- Tap Share (□↑) → "Add to Home Screen"
- Tap "Add"

**Android**:
- Open Camera → Scan QR code
- Tap notification → Opens in Chrome
- Tap banner "Install" or Menu (⋮) → "Install app"

### 4. Launch App

Tap the "Divorce Ledger" icon on your home screen.  
It opens directly to **Quick Capture** page!

### 5. Test Offline

1. Capture a document or violation
2. Turn off WiFi on phone
3. Capture another document
4. Turn WiFi back on
5. Watch it sync automatically! (check sync indicator in header)

---

## ✨ Key Features

| Feature | Description |
|---------|-------------|
| 📱 Quick Capture | Opens straight to capture page |
| 🔌 Offline First | Works without internet |
| 🔄 Auto Sync | Syncs when on same WiFi as desktop |
| 📦 Local Storage | Stores documents on phone until synced |
| 🎯 Native Feel | Installs like a real app |

---

## 🔍 Checking Sync Status

Look in the app header (top right):

- **Green dot** = All synced ✅
- **Yellow dot + number** = Items pending sync ⏳
- **Gray dot** = Offline 📵
- **Blue spinning** = Syncing now 🔄

Tap the sync indicator to:
- View pending items
- Force manual sync
- See last sync time

---

## 🌐 Network Setup

### Desktop and Phone on Same WiFi

**Desktop IP shown on QR code page** (e.g., `192.168.1.100`)

Phone must be on the **same WiFi network** for auto-sync to work!

### Public WiFi?

Manual server URL:
```javascript
// In mobile browser console
localStorage.setItem('sync-server-url', 'http://your-desktop-ip:5000');
```

---

## 🛠️ Troubleshooting

### "Can't Install"
- **iOS**: Must use Safari (not Chrome)
- **Android**: Must use Chrome (not Firefox)
- Try refreshing the QR code page

### "Won't Sync"
1. Check both devices on same WiFi
2. Open `http://desktop-ip:5000/api/health` on phone browser
3. Should return: `{"status": "healthy"}`
4. Force sync: Tap sync indicator → "Sync Now"

### "Storage Full"
- Delete old documents on phone
- Sync more frequently
- Browser will prompt for more storage

---

## 📊 How Sync Works

```
Phone (Offline)
    ↓
📸 Capture photo
    ↓
💾 Save to IndexedDB (local storage)
    ↓
📶 Connect to WiFi (same as desktop)
    ↓
🔍 Auto-detect desktop server
    ↓
⬆️ Upload document
    ↓
✅ Mark as synced
    ↓
🗑️ Clear local copy (optional)
```

**Sync happens every 30 seconds when:**
- Online status: ✅
- On same network: ✅
- Has pending items: ✅

---

## 🎓 Usage Tips

1. **Quick Capture Shortcut**:
   - Bookmark `/home?source=pwa` on phone
   - Add to home screen
   - Opens directly to capture

2. **Offline Workflow**:
   - Capture documents throughout the day
   - Return home
   - Connect to WiFi
   - Let it sync automatically

3. **Monitor Sync**:
   - Keep sync indicator visible
   - Check pending count regularly
   - Force sync before important meetings

4. **Battery Saver**:
   - Background sync uses minimal battery
   - Most sync happens when app is open
   - Airplane mode prevents sync attempts

---

## 📱 Supported Devices

| Platform | Browser | Version | Status |
|----------|---------|---------|--------|
| iOS | Safari | 11.3+ | ✅ Full support |
| Android | Chrome | 68+ | ✅ Full support |
| iOS | Chrome | Any | ⚠️ Can't install (use Safari) |
| Android | Firefox | Any | ⚠️ Limited PWA support |

---

## 🔗 Important URLs

| Page | URL | Purpose |
|------|-----|---------|
| QR Code | `/mobile-install` | Desktop page with QR code |
| Quick Capture | `/home?source=pwa` | Direct link to capture |
| Health Check | `/api/health` | Test server connection |
| Network Info | `/api/network-info` | Get desktop IP address |

---

## 📚 Full Documentation

See [MOBILE_OFFLINE_PWA.md](./MOBILE_OFFLINE_PWA.md) for:
- Complete API reference
- Technical architecture
- Security considerations
- Advanced configuration
- Performance optimization

---

## 🎉 You're Ready!

The mobile app is now set up and ready to use! 

**Next steps**:
1. Scan QR code with your phone
2. Install the app
3. Capture your first document
4. Watch it sync automatically

Happy capturing! 📸
