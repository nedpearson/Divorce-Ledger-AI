module.exports = [
"[externals]/next/dist/server/app-render/work-async-storage.external.js [external] (next/dist/server/app-render/work-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-async-storage.external.js", () => require("next/dist/server/app-render/work-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/@opentelemetry/api [external] (next/dist/compiled/@opentelemetry/api, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/@opentelemetry/api", () => require("next/dist/compiled/@opentelemetry/api"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-unit-async-storage.external.js [external] (next/dist/server/app-render/work-unit-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-unit-async-storage.external.js", () => require("next/dist/server/app-render/work-unit-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/lib/incremental-cache/tags-manifest.external.js [external] (next/dist/server/lib/incremental-cache/tags-manifest.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/lib/incremental-cache/tags-manifest.external.js", () => require("next/dist/server/lib/incremental-cache/tags-manifest.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/after-task-async-storage.external.js [external] (next/dist/server/app-render/after-task-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/after-task-async-storage.external.js", () => require("next/dist/server/app-render/after-task-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/node:async_hooks [external] (node:async_hooks, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("node:async_hooks", () => require("node:async_hooks"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/app-page-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-page-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[project]/Desktop/Divorce-Ledger-AI/frontend/src/proxy.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "config",
    ()=>config,
    "proxy",
    ()=>proxy
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$node_modules$2f$next$2f$server$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Desktop/Divorce-Ledger-AI/frontend/node_modules/next/server.js [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$node_modules$2f40$supabase$2f$auth$2d$helpers$2d$nextjs$2f$dist$2f$module$2f$index$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/Desktop/Divorce-Ledger-AI/frontend/node_modules/@supabase/auth-helpers-nextjs/dist/module/index.js [middleware] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$node_modules$2f40$supabase$2f$auth$2d$helpers$2d$nextjs$2f$dist$2f$module$2f$createServerClient$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Desktop/Divorce-Ledger-AI/frontend/node_modules/@supabase/auth-helpers-nextjs/dist/module/createServerClient.js [middleware] (ecmascript)");
;
;
async function proxy(req) {
    const res = __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$node_modules$2f$next$2f$server$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["NextResponse"].next();
    const supabase = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$node_modules$2f40$supabase$2f$auth$2d$helpers$2d$nextjs$2f$dist$2f$module$2f$createServerClient$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["createServerClient"])({
        req,
        res
    });
    // Refresh session if expired
    const { data: { session } } = await supabase.auth.getSession();
    const { pathname } = req.nextUrl;
    // Public routes that don't require auth
    const publicRoutes = [
        '/',
        '/auth/login',
        '/auth/signup',
        '/auth/callback',
        '/auth/reset-password'
    ];
    const isPublicRoute = publicRoutes.some((route)=>pathname === route || pathname.startsWith('/api/health'));
    // Redirect logged-in users away from auth pages
    if (session && pathname.startsWith('/auth/') && pathname !== '/auth/callback') {
        return __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$node_modules$2f$next$2f$server$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["NextResponse"].redirect(new URL('/', req.url));
    }
    // Allow public routes
    if (isPublicRoute) {
        return res;
    }
    // Require authentication for all other routes
    if (!session) {
        const redirectUrl = new URL('/auth/login', req.url);
        redirectUrl.searchParams.set('redirect', pathname);
        return __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$node_modules$2f$next$2f$server$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["NextResponse"].redirect(redirectUrl);
    }
    // Load user profile and check roles
    try {
        const { data: profile } = await supabase.from('profiles').select('platform_role').eq('id', session.user.id).single();
        // Super Admin routes
        if (pathname.startsWith('/superadmin')) {
            if (!profile?.platform_role || ![
                'super_admin',
                'support_admin'
            ].includes(profile.platform_role)) {
                return __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$node_modules$2f$next$2f$server$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["NextResponse"].redirect(new URL('/', req.url));
            }
            return res;
        }
        // Firm routes - check workspace membership
        if (pathname.startsWith('/firm')) {
            const { data: workspaces } = await supabase.from('active_workspace_memberships').select('workspace_type, workspace_status, role').eq('user_id', session.user.id).eq('workspace_type', 'firm');
            const firmWorkspace = workspaces?.[0];
            if (!firmWorkspace) {
                return __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$node_modules$2f$next$2f$server$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["NextResponse"].redirect(new URL('/', req.url));
            }
            // Check for pending approval
            if (firmWorkspace.workspace_status === 'pending') {
                if (pathname !== '/firm/pending') {
                    return __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$node_modules$2f$next$2f$server$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["NextResponse"].redirect(new URL('/firm/pending', req.url));
                }
                return res;
            }
            // Check for suspension
            if (firmWorkspace.workspace_status === 'suspended') {
                return __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$node_modules$2f$next$2f$server$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["NextResponse"].redirect(new URL('/firm/suspended', req.url));
            }
            // Check role
            if (![
                'firm_owner',
                'firm_admin',
                'firm_staff'
            ].includes(firmWorkspace.role)) {
                return __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$node_modules$2f$next$2f$server$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["NextResponse"].redirect(new URL('/', req.url));
            }
            return res;
        }
        // Consumer routes
        if (pathname.startsWith('/app')) {
            const { data: workspaces } = await supabase.from('active_workspace_memberships').select('workspace_type, workspace_status, role').eq('user_id', session.user.id).eq('workspace_type', 'consumer');
            const consumerWorkspace = workspaces?.[0];
            if (!consumerWorkspace || consumerWorkspace.role !== 'consumer') {
                return __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$node_modules$2f$next$2f$server$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["NextResponse"].redirect(new URL('/', req.url));
            }
            // Check for pending approval
            if (consumerWorkspace.workspace_status === 'pending') {
                return __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$node_modules$2f$next$2f$server$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["NextResponse"].redirect(new URL('/app/pending', req.url));
            }
            return res;
        }
        // Client portal routes
        if (pathname.startsWith('/client')) {
            const { data: matterAccess } = await supabase.from('matter_access').select('matter_id').eq('user_id', session.user.id).limit(1);
            if (!matterAccess || matterAccess.length === 0) {
                return __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$node_modules$2f$next$2f$server$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["NextResponse"].redirect(new URL('/', req.url));
            }
            return res;
        }
    } catch (error) {
        console.error('Proxy error:', error);
        // On error, redirect to login
        return __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$node_modules$2f$next$2f$server$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["NextResponse"].redirect(new URL('/auth/login', req.url));
    }
    return res;
}
const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|public/).*)'
    ]
};
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__6588b603._.js.map