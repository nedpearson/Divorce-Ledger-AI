# Divorce Ledger AI - Frontend

Next.js 14 frontend application for the Divorce Ledger AI document management system.

## Features

- **Modern UI**: Built with Next.js 14, React 18, and Tailwind CSS
- **Authentication**: Supabase Auth with email/password and OAuth (Google, GitHub)
- **Document Management**: Upload, classify, view, and manage legal documents
- **Real-time Updates**: Auto-refreshing document lists and classifications
- **State Management**: Zustand for efficient global state
- **File Uploads**: Progress tracking with multi-step upload flow
- **Storage Quota**: Visual storage usage with quota enforcement
- **Responsive Design**: Mobile-first design with Tailwind CSS
- **TypeScript**: Full type safety with strict mode enabled

## Tech Stack

- **Framework**: Next.js 14.1.0
- **Language**: TypeScript 5.3.3
- **Styling**: Tailwind CSS 3.4.1
- **State**: Zustand 4.5.0
- **HTTP Client**: Axios 1.6.5
- **Auth/Database**: Supabase (@supabase/supabase-js 2.39.0)
- **Validation**: Zod 3.22.4
- **Icons**: lucide-react 0.316.0
- **Date Formatting**: date-fns 3.3.1

## Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0
- Supabase project configured (see backend README)
- Backend API running (see backend README)

## Installation

1. **Clone the repository** (if not already done):

```bash
cd frontend
```

2. **Install dependencies**:

```bash
npm install
```

3. **Configure environment variables**:

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Edit `.env.local` with your configuration:

```env
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

Get Supabase credentials from: https://app.supabase.com → Your Project → Settings → API

## Development

Start the development server:

```bash
npm run dev
```

The application will be available at http://localhost:3001

### Available Scripts

- `npm run dev` - Start development server (port 3001)
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint
- `npm run typecheck` - Run TypeScript compiler checks

## Production Build

### Local Build

```bash
# Build the application
npm run build

# Start production server
npm start
```

### Docker Build

```bash
# Build Docker image
docker build \
  --build-arg NEXT_PUBLIC_API_URL=https://your-backend-api.com \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key \
  -t divorce-ledger-frontend .

# Run container
docker run -p 3000:3000 divorce-ledger-frontend
```

**Important**: Next.js requires `NEXT_PUBLIC_*` environment variables to be available at **build time**, so they must be passed as `--build-arg` to Docker.

## Environment Variables

### Required

| Variable                        | Description            | Example                   |
| ------------------------------- | ---------------------- | ------------------------- |
| `NEXT_PUBLIC_API_URL`           | Backend API URL        | `https://api.example.com` |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase project URL   | `https://xxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key | `eyJhbGc...`              |

**Note**: Variables prefixed with `NEXT_PUBLIC_` are exposed to the browser. Never put sensitive information in them.

## Project Structure

```
frontend/
├── src/
│   ├── components/          # React components
│   │   ├── Layout.tsx       # Main layout with sidebar
│   │   ├── AuthGuard.tsx    # Route protection
│   │   ├── UploadButton.tsx # File upload with progress
│   │   └── DocumentList.tsx # Document cards/list
│   ├── hooks/               # Custom React hooks
│   │   ├── useAuth.ts       # Authentication hook
│   │   ├── useDocuments.ts  # Document management hook
│   │   └── useUpload.ts     # Upload management hook
│   ├── lib/                 # Libraries and utilities
│   │   ├── supabase.ts      # Supabase client + helpers
│   │   └── api.ts           # Backend API client
│   ├── pages/               # Next.js pages (routes)
│   │   ├── _app.tsx         # App wrapper
│   │   ├── index.tsx        # Landing page
│   │   ├── auth/            # Authentication pages
│   │   ├── documents/       # Document pages
│   │   └── settings/        # Settings page
│   ├── store/               # Zustand state stores
│   │   ├── authStore.ts     # Auth state
│   │   ├── documentStore.ts # Document state
│   │   └── uploadStore.ts   # Upload state
│   └── styles/              # Global styles
│       └── globals.css      # Tailwind + global CSS
├── public/                  # Static assets
├── Dockerfile               # Docker configuration
├── next.config.js           # Next.js configuration
├── tailwind.config.js       # Tailwind CSS configuration
├── tsconfig.json            # TypeScript configuration
└── package.json             # Dependencies and scripts
```

## Key Components

### Layout (`src/components/Layout.tsx`)

- Fixed sidebar navigation
- User profile section
- Conditional rendering based on auth state

### AuthGuard (`src/components/AuthGuard.tsx`)

- Protects routes requiring authentication
- Redirects to login if not authenticated
- Shows loading state while checking auth

### UploadButton (`src/components/UploadButton.tsx`)

- File upload with validation (type, size, quota)
- Progress tracking with status updates
- Visual storage usage bar

### DocumentList (`src/components/DocumentList.tsx`)

- Document cards with badges
- File type icons
- Status and type indicators
- Empty state handling

## State Management

### Auth Store (`src/store/authStore.ts`)

- User authentication state
- Persistent to localStorage
- Auto-initializes on app load
- Listens to Supabase auth changes

### Document Store (`src/store/documentStore.ts`)

- Document list with pagination
- Filters (type, status, search)
- CRUD operations
- Classification triggers

### Upload Store (`src/store/uploadStore.ts`)

- Upload progress tracking (4-step process)
- Storage quota monitoring
- Active upload tracking
- Auto-cleanup on completion

## API Integration

The frontend communicates with the backend API using Axios with automatic JWT token management:

```typescript
// Example API call (handled by custom hooks)
const documents = await api.documents.list({ page: 1, limit: 20 });
```

**Token Management**:

- Request interceptor adds JWT from Supabase session
- Response interceptor handles 401 errors
- Automatic token refresh and request retry
- Redirect to login on refresh failure

## Authentication Flow

1. User visits protected route
2. AuthGuard checks authentication state
3. If not authenticated, redirect to `/auth/login`
4. User signs in/up with email or OAuth
5. Supabase creates session, stores JWT
6. AuthStore updates with user info
7. Redirect to `/documents`

## File Upload Flow

1. User selects file(s) via UploadButton
2. Validate file type, size, and storage quota
3. Call `uploadFile()` from uploadStore:
   - **Step 1 (10%)**: Generate signed URL from backend
   - **Step 2 (30%)**: Upload to Supabase Storage
   - **Step 3 (70%)**: Complete upload, create document record
   - **Step 4 (100%)**: Mark complete, auto-remove after 3s
4. Document list auto-refreshes

## Deployment

### Railway Deployment

See [railway-notes.md](./railway-notes.md) for detailed Railway deployment instructions.

### Manual Deployment

1. Build the application:

```bash
npm run build
```

2. Set environment variables on your hosting platform

3. Start the production server:

```bash
npm start
```

## Security Considerations

- **Environment Variables**: Only `NEXT_PUBLIC_*` vars are exposed to browser
- **Authentication**: JWT tokens stored in Supabase session (httpOnly recommended)
- **API Calls**: Authorization header automatically added
- **CORS**: Backend must allow frontend origin
- **CSP**: Content Security Policy configured in next.config.js
- **Security Headers**: HSTS, X-Frame-Options, etc. configured

## Troubleshooting

### Build Errors

**Error**: "Module not found: Can't resolve '@/...'"

**Solution**: Ensure `tsconfig.json` has path aliases configured:

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

### Runtime Errors

**Error**: "Failed to fetch" or network errors

**Solution**: Check that `NEXT_PUBLIC_API_URL` is correct and backend is running

**Error**: "supabase is not defined"

**Solution**: Ensure Supabase environment variables are set correctly

### Authentication Issues

**Error**: "User not authenticated" after login

**Solution**: Check that Supabase URL and anon key are correct. Verify browser can reach Supabase.

**Error**: OAuth redirect fails

**Solution**: Add redirect URL to Supabase: Dashboard → Authentication → URL Configuration → Add `https://yourdomain.com/auth/callback`

## Contributing

1. Follow TypeScript strict mode guidelines
2. Use Tailwind CSS for styling (no custom CSS unless necessary)
3. Create custom hooks for complex logic
4. Use Zustand stores for global state
5. Add proper error handling to all async operations
6. Include loading states for async UI updates

## Support

For issues or questions:

- Check backend README and ensure API is running
- Verify all environment variables are set correctly
- Check browser console for error messages
- Review Network tab for failed API calls

## License

MIT
