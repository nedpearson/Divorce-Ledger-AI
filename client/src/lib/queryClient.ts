import { QueryClient, QueryFunction } from '@tanstack/react-query';

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    if (res.status === 401) {
      // Clear local auth state and redirect to login
      localStorage.removeItem('user');
      if (window.location.pathname !== '/') {
        window.location.href = '/';
      }
    }
    const text = (await res.text()) || res.statusText;
    let message = text;
    try {
      const json = JSON.parse(text);
      message = json.message || json.error || text;
    } catch (e) {
      // fallback to status text
    }
    const error = new Error(message);
    (error as any).status = res.status;
    throw error;
  }
}

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  try {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      const user = JSON.parse(userStr);
      if (user?.id) {
        headers['X-User-Id'] = user.id;
      }
    }
    const environment = localStorage.getItem('environment');
    if (environment) {
      headers['X-Environment'] = environment;
    }
  } catch {
    // ignore parsing errors
  }
  return headers;
}

// --- STRANGLER PATTERN MIGRATION ADAPTER ---
// Safely maps specific domains to the Python backend based on feature flags.
// Automatically falls back to the Express Node backend if the Python handler fails or 404s.
const ENABLE_PYTHON_MIGRATION = import.meta.env.VITE_ENABLE_PYTHON_MIGRATION === 'true';
const PYTHON_API_URL = import.meta.env.VITE_PYTHON_API_URL || 'http://localhost:8000';

const PYTHON_ROUTES = [
  /^\/api\/workspaces(\/|$)/, // Domain 1: Tenant Handling
  /^\/api\/documents\/upload(\/|$)/, // Domain 2: Python Document Parsing
  // Future domains appended here safely once stabilized
];

function getTargetUrl(url: string): string {
  if (!ENABLE_PYTHON_MIGRATION) return url;
  if (PYTHON_ROUTES.some((route) => route.test(url))) {
    // Explicitly scope the url to standard hostname formatting
    return `${PYTHON_API_URL}${url.startsWith('/') ? '' : '/'}${url}`;
  }
  return url;
}

export async function safeRouterFetch(url: string, options: RequestInit): Promise<Response> {
  const targetUrl = getTargetUrl(url);

  try {
    const res = await fetch(targetUrl, options);

    // Fallback logic if python was hit but explicitly crashed (5XX) or genuinely failed to discover route (404)
    if (targetUrl !== url && !res.ok && (res.status === 404 || res.status >= 500)) {
      console.warn(`[Python API Adapter] Fallback triggered for ${url} (Status: ${res.status})`);
      return fetch(url, options); // Fallback to original Express backend
    }

    return res;
  } catch (error) {
    if (targetUrl !== url) {
      console.warn(
        `[Python API Adapter] Network failure on ${targetUrl}, falling back to Express:`,
        error
      );
      return fetch(url, options);
    }
    throw error;
  }
}
// ------------------------------------------

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined
): Promise<Response> {
  const authHeaders = getAuthHeaders();
  const headers: Record<string, string> = {
    ...authHeaders,
    ...(data ? { 'Content-Type': 'application/json' } : {}),
  };

  const res = await safeRouterFetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: 'include',
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = 'returnNull' | 'throw';
export const getQueryFn: <T>(options: { on401: UnauthorizedBehavior }) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const segments = queryKey as unknown[];
    const url = segments.filter((s): s is string => typeof s === 'string').join('/');
    const environment = localStorage.getItem('environment') || 'demo';
    const authHeaders = {
      ...getAuthHeaders(),
      'X-Environment': environment,
    };
    const res = await safeRouterFetch(url, {
      credentials: 'include',
      headers: authHeaders,
    });

    if (unauthorizedBehavior === 'returnNull' && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: 'throw' }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
