module.exports = [
"[externals]/react/jsx-dev-runtime [external] (react/jsx-dev-runtime, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("react/jsx-dev-runtime", () => require("react/jsx-dev-runtime"));

module.exports = mod;
}),
"[externals]/react [external] (react, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("react", () => require("react"));

module.exports = mod;
}),
"[project]/Desktop/Divorce-Ledger-AI/frontend/src/lib/supabase.ts [ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

return __turbopack_context__.a(async (__turbopack_handle_async_dependencies__, __turbopack_async_result__) => { try {

__turbopack_context__.s([
    "auth",
    ()=>auth,
    "default",
    ()=>__TURBOPACK__default__export__,
    "storage",
    ()=>storage,
    "supabase",
    ()=>supabase
]);
var __TURBOPACK__imported__module__$5b$externals$5d2f40$supabase$2f$supabase$2d$js__$5b$external$5d$__$2840$supabase$2f$supabase$2d$js$2c$__esm_import$2c$__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$node_modules$2f40$supabase$2f$supabase$2d$js$29$__ = __turbopack_context__.i("[externals]/@supabase/supabase-js [external] (@supabase/supabase-js, esm_import, [project]/Desktop/Divorce-Ledger-AI/frontend/node_modules/@supabase/supabase-js)");
var __turbopack_async_dependencies__ = __turbopack_handle_async_dependencies__([
    __TURBOPACK__imported__module__$5b$externals$5d2f40$supabase$2f$supabase$2d$js__$5b$external$5d$__$2840$supabase$2f$supabase$2d$js$2c$__esm_import$2c$__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$node_modules$2f40$supabase$2f$supabase$2d$js$29$__
]);
[__TURBOPACK__imported__module__$5b$externals$5d2f40$supabase$2f$supabase$2d$js__$5b$external$5d$__$2840$supabase$2f$supabase$2d$js$2c$__esm_import$2c$__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$node_modules$2f40$supabase$2f$supabase$2d$js$29$__] = __turbopack_async_dependencies__.then ? (await __turbopack_async_dependencies__)() : __turbopack_async_dependencies__;
;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables');
}
const supabase = (0, __TURBOPACK__imported__module__$5b$externals$5d2f40$supabase$2f$supabase$2d$js__$5b$external$5d$__$2840$supabase$2f$supabase$2d$js$2c$__esm_import$2c$__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$node_modules$2f40$supabase$2f$supabase$2d$js$29$__["createClient"])(supabaseUrl, supabaseAnonKey, {
    auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
    }
});
const auth = {
    /**
   * Sign up a new user
   */ signUp: async (email, password, metadata)=>{
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: metadata
            }
        });
        if (error) throw error;
        return data;
    },
    /**
   * Sign in with email and password
   */ signIn: async (email, password)=>{
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });
        if (error) throw error;
        return data;
    },
    /**
   * Sign in with OAuth provider
   */ signInWithOAuth: async (provider)=>{
        const { data, error } = await supabase.auth.signInWithOAuth({
            provider,
            options: {
                redirectTo: `${window.location.origin}/auth/callback`
            }
        });
        if (error) throw error;
        return data;
    },
    /**
   * Sign out
   */ signOut: async ()=>{
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
    },
    /**
   * Get current user
   */ getUser: async ()=>{
        const { data: { user } } = await supabase.auth.getUser();
        return user;
    },
    /**
   * Get current session
   */ getSession: async ()=>{
        const { data: { session } } = await supabase.auth.getSession();
        return session;
    },
    /**
   * Reset password
   */ resetPassword: async (email)=>{
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/auth/reset-password`
        });
        if (error) throw error;
    },
    /**
   * Update password
   */ updatePassword: async (newPassword)=>{
        const { error } = await supabase.auth.updateUser({
            password: newPassword
        });
        if (error) throw error;
    },
    /**
   * Listen to auth state changes
   */ onAuthStateChange: (callback)=>{
        return supabase.auth.onAuthStateChange((event, session)=>{
            callback(session?.user ?? null);
        });
    }
};
const storage = {
    /**
   * Generate signed URL for file
   */ getSignedUrl: async (bucket, path, expiresIn = 3600)=>{
        const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
        if (error) throw error;
        return data.signedUrl;
    },
    /**
   * Upload file
   */ upload: async (bucket, path, file)=>{
        const { data, error } = await supabase.storage.from(bucket).upload(path, file);
        if (error) throw error;
        return data;
    },
    /**
   * Download file
   */ download: async (bucket, path)=>{
        const { data, error } = await supabase.storage.from(bucket).download(path);
        if (error) throw error;
        return data;
    },
    /**
   * Delete file
   */ remove: async (bucket, paths)=>{
        const { error } = await supabase.storage.from(bucket).remove(paths);
        if (error) throw error;
    }
};
const __TURBOPACK__default__export__ = supabase;
__turbopack_async_result__();
} catch(e) { __turbopack_async_result__(e); } }, false);}),
"[project]/Desktop/Divorce-Ledger-AI/frontend/src/store/authStore.ts [ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

return __turbopack_context__.a(async (__turbopack_handle_async_dependencies__, __turbopack_async_result__) => { try {

__turbopack_context__.s([
    "useAuthStore",
    ()=>useAuthStore
]);
var __TURBOPACK__imported__module__$5b$externals$5d2f$zustand__$5b$external$5d$__$28$zustand$2c$__esm_import$2c$__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$node_modules$2f$zustand$29$__ = __turbopack_context__.i("[externals]/zustand [external] (zustand, esm_import, [project]/Desktop/Divorce-Ledger-AI/frontend/node_modules/zustand)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$zustand$2f$middleware__$5b$external$5d$__$28$zustand$2f$middleware$2c$__esm_import$2c$__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$node_modules$2f$zustand$29$__ = __turbopack_context__.i("[externals]/zustand/middleware [external] (zustand/middleware, esm_import, [project]/Desktop/Divorce-Ledger-AI/frontend/node_modules/zustand)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$src$2f$lib$2f$supabase$2e$ts__$5b$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Desktop/Divorce-Ledger-AI/frontend/src/lib/supabase.ts [ssr] (ecmascript)");
var __turbopack_async_dependencies__ = __turbopack_handle_async_dependencies__([
    __TURBOPACK__imported__module__$5b$externals$5d2f$zustand__$5b$external$5d$__$28$zustand$2c$__esm_import$2c$__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$node_modules$2f$zustand$29$__,
    __TURBOPACK__imported__module__$5b$externals$5d2f$zustand$2f$middleware__$5b$external$5d$__$28$zustand$2f$middleware$2c$__esm_import$2c$__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$node_modules$2f$zustand$29$__,
    __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$src$2f$lib$2f$supabase$2e$ts__$5b$ssr$5d$__$28$ecmascript$29$__
]);
[__TURBOPACK__imported__module__$5b$externals$5d2f$zustand__$5b$external$5d$__$28$zustand$2c$__esm_import$2c$__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$node_modules$2f$zustand$29$__, __TURBOPACK__imported__module__$5b$externals$5d2f$zustand$2f$middleware__$5b$external$5d$__$28$zustand$2f$middleware$2c$__esm_import$2c$__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$node_modules$2f$zustand$29$__, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$src$2f$lib$2f$supabase$2e$ts__$5b$ssr$5d$__$28$ecmascript$29$__] = __turbopack_async_dependencies__.then ? (await __turbopack_async_dependencies__)() : __turbopack_async_dependencies__;
;
;
;
const useAuthStore = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$zustand__$5b$external$5d$__$28$zustand$2c$__esm_import$2c$__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$node_modules$2f$zustand$29$__["create"])()((0, __TURBOPACK__imported__module__$5b$externals$5d2f$zustand$2f$middleware__$5b$external$5d$__$28$zustand$2f$middleware$2c$__esm_import$2c$__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$node_modules$2f$zustand$29$__["persist"])((set, get)=>({
        user: null,
        loading: false,
        initialized: false,
        setUser: (user)=>set({
                user
            }),
        setLoading: (loading)=>set({
                loading
            }),
        setInitialized: (initialized)=>set({
                initialized
            }),
        signIn: async (email, password)=>{
            set({
                loading: true
            });
            try {
                const { user } = await __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$src$2f$lib$2f$supabase$2e$ts__$5b$ssr$5d$__$28$ecmascript$29$__["auth"].signIn(email, password);
                set({
                    user,
                    loading: false
                });
            } catch (error) {
                set({
                    loading: false
                });
                throw error;
            }
        },
        signUp: async (email, password, fullName)=>{
            set({
                loading: true
            });
            try {
                const { user } = await __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$src$2f$lib$2f$supabase$2e$ts__$5b$ssr$5d$__$28$ecmascript$29$__["auth"].signUp(email, password, {
                    full_name: fullName
                });
                set({
                    user,
                    loading: false
                });
            } catch (error) {
                set({
                    loading: false
                });
                throw error;
            }
        },
        signOut: async ()=>{
            set({
                loading: true
            });
            try {
                await __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$src$2f$lib$2f$supabase$2e$ts__$5b$ssr$5d$__$28$ecmascript$29$__["auth"].signOut();
                set({
                    user: null,
                    loading: false
                });
            } catch (error) {
                set({
                    loading: false
                });
                throw error;
            }
        },
        initialize: async ()=>{
            if (get().initialized) return;
            set({
                loading: true
            });
            try {
                const user = await __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$src$2f$lib$2f$supabase$2e$ts__$5b$ssr$5d$__$28$ecmascript$29$__["auth"].getUser();
                set({
                    user,
                    loading: false,
                    initialized: true
                });
                // Listen to auth state changes
                __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$src$2f$lib$2f$supabase$2e$ts__$5b$ssr$5d$__$28$ecmascript$29$__["auth"].onAuthStateChange((user)=>{
                    set({
                        user
                    });
                });
            } catch (error) {
                set({
                    loading: false,
                    initialized: true
                });
            }
        }
    }), {
    name: 'auth-storage',
    partialize: (state)=>({
            user: state.user
        })
}));
__turbopack_async_result__();
} catch(e) { __turbopack_async_result__(e); } }, false);}),
"[project]/Desktop/Divorce-Ledger-AI/frontend/src/store/workspaceStore.ts [ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

return __turbopack_context__.a(async (__turbopack_handle_async_dependencies__, __turbopack_async_result__) => { try {

__turbopack_context__.s([
    "useWorkspaceStore",
    ()=>useWorkspaceStore
]);
var __TURBOPACK__imported__module__$5b$externals$5d2f$zustand__$5b$external$5d$__$28$zustand$2c$__esm_import$2c$__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$node_modules$2f$zustand$29$__ = __turbopack_context__.i("[externals]/zustand [external] (zustand, esm_import, [project]/Desktop/Divorce-Ledger-AI/frontend/node_modules/zustand)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$zustand$2f$middleware__$5b$external$5d$__$28$zustand$2f$middleware$2c$__esm_import$2c$__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$node_modules$2f$zustand$29$__ = __turbopack_context__.i("[externals]/zustand/middleware [external] (zustand/middleware, esm_import, [project]/Desktop/Divorce-Ledger-AI/frontend/node_modules/zustand)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$src$2f$lib$2f$supabase$2e$ts__$5b$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Desktop/Divorce-Ledger-AI/frontend/src/lib/supabase.ts [ssr] (ecmascript)");
var __turbopack_async_dependencies__ = __turbopack_handle_async_dependencies__([
    __TURBOPACK__imported__module__$5b$externals$5d2f$zustand__$5b$external$5d$__$28$zustand$2c$__esm_import$2c$__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$node_modules$2f$zustand$29$__,
    __TURBOPACK__imported__module__$5b$externals$5d2f$zustand$2f$middleware__$5b$external$5d$__$28$zustand$2f$middleware$2c$__esm_import$2c$__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$node_modules$2f$zustand$29$__,
    __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$src$2f$lib$2f$supabase$2e$ts__$5b$ssr$5d$__$28$ecmascript$29$__
]);
[__TURBOPACK__imported__module__$5b$externals$5d2f$zustand__$5b$external$5d$__$28$zustand$2c$__esm_import$2c$__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$node_modules$2f$zustand$29$__, __TURBOPACK__imported__module__$5b$externals$5d2f$zustand$2f$middleware__$5b$external$5d$__$28$zustand$2f$middleware$2c$__esm_import$2c$__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$node_modules$2f$zustand$29$__, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$src$2f$lib$2f$supabase$2e$ts__$5b$ssr$5d$__$28$ecmascript$29$__] = __turbopack_async_dependencies__.then ? (await __turbopack_async_dependencies__)() : __turbopack_async_dependencies__;
;
;
;
const useWorkspaceStore = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$zustand__$5b$external$5d$__$28$zustand$2c$__esm_import$2c$__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$node_modules$2f$zustand$29$__["create"])()((0, __TURBOPACK__imported__module__$5b$externals$5d2f$zustand$2f$middleware__$5b$external$5d$__$28$zustand$2f$middleware$2c$__esm_import$2c$__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$node_modules$2f$zustand$29$__["persist"])((set, get)=>({
        profile: null,
        workspaces: [],
        activeWorkspaceId: null,
        activeWorkspace: null,
        loading: false,
        initialized: false,
        setProfile: (profile)=>set({
                profile
            }),
        setWorkspaces: (workspaces)=>{
            const state = get();
            set({
                workspaces
            });
            // Auto-select workspace if none selected
            if (!state.activeWorkspaceId && workspaces.length > 0) {
                const primary = workspaces.find((w)=>w.is_primary) || workspaces[0];
                set({
                    activeWorkspaceId: primary.workspace_id,
                    activeWorkspace: primary
                });
            } else if (state.activeWorkspaceId) {
                // Update active workspace data
                const active = workspaces.find((w)=>w.workspace_id === state.activeWorkspaceId);
                set({
                    activeWorkspace: active || null
                });
            }
        },
        setActiveWorkspaceId: (workspaceId)=>{
            const state = get();
            const workspace = state.workspaces.find((w)=>w.workspace_id === workspaceId);
            set({
                activeWorkspaceId: workspaceId,
                activeWorkspace: workspace || null
            });
        },
        setLoading: (loading)=>set({
                loading
            }),
        loadProfile: async (userId)=>{
            try {
                const { data, error } = await __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$src$2f$lib$2f$supabase$2e$ts__$5b$ssr$5d$__$28$ecmascript$29$__["supabase"].from('profiles').select('*').eq('id', userId).single();
                if (error) throw error;
                set({
                    profile: data
                });
            } catch (error) {
                console.error('Failed to load profile:', error);
                throw error;
            }
        },
        loadWorkspaces: async (userId)=>{
            try {
                const { data, error } = await __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$src$2f$lib$2f$supabase$2e$ts__$5b$ssr$5d$__$28$ecmascript$29$__["supabase"].from('active_workspace_memberships').select('*').eq('user_id', userId).order('is_primary', {
                    ascending: false
                }).order('created_at', {
                    ascending: true
                });
                if (error) throw error;
                get().setWorkspaces(data || []);
            } catch (error) {
                console.error('Failed to load workspaces:', error);
                throw error;
            }
        },
        switchWorkspace: (workspaceId)=>{
            const state = get();
            const workspace = state.workspaces.find((w)=>w.workspace_id === workspaceId);
            if (workspace) {
                set({
                    activeWorkspaceId: workspaceId,
                    activeWorkspace: workspace
                });
                // Trigger page navigation based on workspace type
                if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
                ;
            }
        },
        initialize: async (userId)=>{
            if (get().initialized) return;
            set({
                loading: true
            });
            try {
                await Promise.all([
                    get().loadProfile(userId),
                    get().loadWorkspaces(userId)
                ]);
                set({
                    initialized: true,
                    loading: false
                });
            } catch (error) {
                console.error('Failed to initialize workspace store:', error);
                set({
                    loading: false,
                    initialized: true
                });
                throw error;
            }
        },
        reset: ()=>{
            set({
                profile: null,
                workspaces: [],
                activeWorkspaceId: null,
                activeWorkspace: null,
                loading: false,
                initialized: false
            });
        },
        // Computed properties
        isPlatformAdmin: ()=>{
            const { profile } = get();
            return profile?.platform_role === 'super_admin' || profile?.platform_role === 'support_admin';
        },
        isSuperAdmin: ()=>{
            const { profile } = get();
            return profile?.platform_role === 'super_admin';
        },
        hasWorkspaceRole: (role)=>{
            const { activeWorkspace } = get();
            return activeWorkspace?.role === role;
        },
        canAccessSuperAdmin: ()=>{
            return get().isPlatformAdmin();
        },
        canAccessFirmDashboard: ()=>{
            const { activeWorkspace } = get();
            return activeWorkspace?.workspace_type === 'firm' && [
                'firm_owner',
                'firm_admin',
                'firm_staff'
            ].includes(activeWorkspace.role);
        },
        canAccessConsumerDashboard: ()=>{
            const { activeWorkspace } = get();
            return activeWorkspace?.workspace_type === 'consumer' && activeWorkspace.role === 'consumer';
        }
    }), {
    name: 'workspace-storage',
    partialize: (state)=>({
            activeWorkspaceId: state.activeWorkspaceId,
            profile: state.profile
        })
}));
__turbopack_async_result__();
} catch(e) { __turbopack_async_result__(e); } }, false);}),
"[project]/Desktop/Divorce-Ledger-AI/frontend/src/pages/_app.tsx [ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

return __turbopack_context__.a(async (__turbopack_handle_async_dependencies__, __turbopack_async_result__) => { try {

__turbopack_context__.s([
    "default",
    ()=>App
]);
var __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/react/jsx-dev-runtime [external] (react/jsx-dev-runtime, cjs)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$react__$5b$external$5d$__$28$react$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/react [external] (react, cjs)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$src$2f$store$2f$authStore$2e$ts__$5b$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Desktop/Divorce-Ledger-AI/frontend/src/store/authStore.ts [ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$src$2f$store$2f$workspaceStore$2e$ts__$5b$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Desktop/Divorce-Ledger-AI/frontend/src/store/workspaceStore.ts [ssr] (ecmascript)");
var __turbopack_async_dependencies__ = __turbopack_handle_async_dependencies__([
    __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$src$2f$store$2f$authStore$2e$ts__$5b$ssr$5d$__$28$ecmascript$29$__,
    __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$src$2f$store$2f$workspaceStore$2e$ts__$5b$ssr$5d$__$28$ecmascript$29$__
]);
[__TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$src$2f$store$2f$authStore$2e$ts__$5b$ssr$5d$__$28$ecmascript$29$__, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$src$2f$store$2f$workspaceStore$2e$ts__$5b$ssr$5d$__$28$ecmascript$29$__] = __turbopack_async_dependencies__.then ? (await __turbopack_async_dependencies__)() : __turbopack_async_dependencies__;
;
;
;
;
;
function App({ Component, pageProps }) {
    const { initialize: initializeAuth, user } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$src$2f$store$2f$authStore$2e$ts__$5b$ssr$5d$__$28$ecmascript$29$__["useAuthStore"])();
    const { initialize: initializeWorkspace, initialized: workspaceInitialized } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$src$2f$store$2f$workspaceStore$2e$ts__$5b$ssr$5d$__$28$ecmascript$29$__["useWorkspaceStore"])();
    (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react__$5b$external$5d$__$28$react$2c$__cjs$29$__["useEffect"])(()=>{
        // Initialize auth on app start
        initializeAuth();
    }, [
        initializeAuth
    ]);
    (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react__$5b$external$5d$__$28$react$2c$__cjs$29$__["useEffect"])(()=>{
        // Initialize workspace context when user is authenticated
        if (user && !workspaceInitialized) {
            initializeWorkspace(user.id).catch((error)=>{
                console.error('Failed to initialize workspace:', error);
            });
        }
    }, [
        user,
        workspaceInitialized,
        initializeWorkspace
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])(Component, {
        ...pageProps
    }, void 0, false, {
        fileName: "[project]/Desktop/Divorce-Ledger-AI/frontend/src/pages/_app.tsx",
        lineNumber: 25,
        columnNumber: 10
    }, this);
}
__turbopack_async_result__();
} catch(e) { __turbopack_async_result__(e); } }, false);}),
"[externals]/zustand [external] (zustand, esm_import, [project]/Desktop/Divorce-Ledger-AI/frontend/node_modules/zustand)", ((__turbopack_context__) => {
"use strict";

return __turbopack_context__.a(async (__turbopack_handle_async_dependencies__, __turbopack_async_result__) => { try {

const mod = await __turbopack_context__.y("zustand-c44e112ee157fa13");

__turbopack_context__.n(mod);
__turbopack_async_result__();
} catch(e) { __turbopack_async_result__(e); } }, true);}),
"[externals]/zustand/middleware [external] (zustand/middleware, esm_import, [project]/Desktop/Divorce-Ledger-AI/frontend/node_modules/zustand)", ((__turbopack_context__) => {
"use strict";

return __turbopack_context__.a(async (__turbopack_handle_async_dependencies__, __turbopack_async_result__) => { try {

const mod = await __turbopack_context__.y("zustand-c44e112ee157fa13/middleware");

__turbopack_context__.n(mod);
__turbopack_async_result__();
} catch(e) { __turbopack_async_result__(e); } }, true);}),
"[externals]/@supabase/supabase-js [external] (@supabase/supabase-js, esm_import, [project]/Desktop/Divorce-Ledger-AI/frontend/node_modules/@supabase/supabase-js)", ((__turbopack_context__) => {
"use strict";

return __turbopack_context__.a(async (__turbopack_handle_async_dependencies__, __turbopack_async_result__) => { try {

const mod = await __turbopack_context__.y("@supabase/supabase-js-edee5c7ac6768822");

__turbopack_context__.n(mod);
__turbopack_async_result__();
} catch(e) { __turbopack_async_result__(e); } }, true);}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__f8053d5b._.js.map