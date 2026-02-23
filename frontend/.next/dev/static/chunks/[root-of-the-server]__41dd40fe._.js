(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[turbopack]/browser/dev/hmr-client/hmr-client.ts [client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/// <reference path="../../../shared/runtime-types.d.ts" />
/// <reference path="../../runtime/base/dev-globals.d.ts" />
/// <reference path="../../runtime/base/dev-protocol.d.ts" />
/// <reference path="../../runtime/base/dev-extensions.ts" />
__turbopack_context__.s([
    "connect",
    ()=>connect,
    "setHooks",
    ()=>setHooks,
    "subscribeToUpdate",
    ()=>subscribeToUpdate
]);
function connect({ addMessageListener, sendMessage, onUpdateError = console.error }) {
    addMessageListener((msg)=>{
        switch(msg.type){
            case 'turbopack-connected':
                handleSocketConnected(sendMessage);
                break;
            default:
                try {
                    if (Array.isArray(msg.data)) {
                        for(let i = 0; i < msg.data.length; i++){
                            handleSocketMessage(msg.data[i]);
                        }
                    } else {
                        handleSocketMessage(msg.data);
                    }
                    applyAggregatedUpdates();
                } catch (e) {
                    console.warn('[Fast Refresh] performing full reload\n\n' + "Fast Refresh will perform a full reload when you edit a file that's imported by modules outside of the React rendering tree.\n" + 'You might have a file which exports a React component but also exports a value that is imported by a non-React component file.\n' + 'Consider migrating the non-React component export to a separate file and importing it into both files.\n\n' + 'It is also possible the parent component of the component you edited is a class component, which disables Fast Refresh.\n' + 'Fast Refresh requires at least one parent function component in your React tree.');
                    onUpdateError(e);
                    location.reload();
                }
                break;
        }
    });
    const queued = globalThis.TURBOPACK_CHUNK_UPDATE_LISTENERS;
    if (queued != null && !Array.isArray(queued)) {
        throw new Error('A separate HMR handler was already registered');
    }
    globalThis.TURBOPACK_CHUNK_UPDATE_LISTENERS = {
        push: ([chunkPath, callback])=>{
            subscribeToChunkUpdate(chunkPath, sendMessage, callback);
        }
    };
    if (Array.isArray(queued)) {
        for (const [chunkPath, callback] of queued){
            subscribeToChunkUpdate(chunkPath, sendMessage, callback);
        }
    }
}
const updateCallbackSets = new Map();
function sendJSON(sendMessage, message) {
    sendMessage(JSON.stringify(message));
}
function resourceKey(resource) {
    return JSON.stringify({
        path: resource.path,
        headers: resource.headers || null
    });
}
function subscribeToUpdates(sendMessage, resource) {
    sendJSON(sendMessage, {
        type: 'turbopack-subscribe',
        ...resource
    });
    return ()=>{
        sendJSON(sendMessage, {
            type: 'turbopack-unsubscribe',
            ...resource
        });
    };
}
function handleSocketConnected(sendMessage) {
    for (const key of updateCallbackSets.keys()){
        subscribeToUpdates(sendMessage, JSON.parse(key));
    }
}
// we aggregate all pending updates until the issues are resolved
const chunkListsWithPendingUpdates = new Map();
function aggregateUpdates(msg) {
    const key = resourceKey(msg.resource);
    let aggregated = chunkListsWithPendingUpdates.get(key);
    if (aggregated) {
        aggregated.instruction = mergeChunkListUpdates(aggregated.instruction, msg.instruction);
    } else {
        chunkListsWithPendingUpdates.set(key, msg);
    }
}
function applyAggregatedUpdates() {
    if (chunkListsWithPendingUpdates.size === 0) return;
    hooks.beforeRefresh();
    for (const msg of chunkListsWithPendingUpdates.values()){
        triggerUpdate(msg);
    }
    chunkListsWithPendingUpdates.clear();
    finalizeUpdate();
}
function mergeChunkListUpdates(updateA, updateB) {
    let chunks;
    if (updateA.chunks != null) {
        if (updateB.chunks == null) {
            chunks = updateA.chunks;
        } else {
            chunks = mergeChunkListChunks(updateA.chunks, updateB.chunks);
        }
    } else if (updateB.chunks != null) {
        chunks = updateB.chunks;
    }
    let merged;
    if (updateA.merged != null) {
        if (updateB.merged == null) {
            merged = updateA.merged;
        } else {
            // Since `merged` is an array of updates, we need to merge them all into
            // one, consistent update.
            // Since there can only be `EcmascriptMergeUpdates` in the array, there is
            // no need to key on the `type` field.
            let update = updateA.merged[0];
            for(let i = 1; i < updateA.merged.length; i++){
                update = mergeChunkListEcmascriptMergedUpdates(update, updateA.merged[i]);
            }
            for(let i = 0; i < updateB.merged.length; i++){
                update = mergeChunkListEcmascriptMergedUpdates(update, updateB.merged[i]);
            }
            merged = [
                update
            ];
        }
    } else if (updateB.merged != null) {
        merged = updateB.merged;
    }
    return {
        type: 'ChunkListUpdate',
        chunks,
        merged
    };
}
function mergeChunkListChunks(chunksA, chunksB) {
    const chunks = {};
    for (const [chunkPath, chunkUpdateA] of Object.entries(chunksA)){
        const chunkUpdateB = chunksB[chunkPath];
        if (chunkUpdateB != null) {
            const mergedUpdate = mergeChunkUpdates(chunkUpdateA, chunkUpdateB);
            if (mergedUpdate != null) {
                chunks[chunkPath] = mergedUpdate;
            }
        } else {
            chunks[chunkPath] = chunkUpdateA;
        }
    }
    for (const [chunkPath, chunkUpdateB] of Object.entries(chunksB)){
        if (chunks[chunkPath] == null) {
            chunks[chunkPath] = chunkUpdateB;
        }
    }
    return chunks;
}
function mergeChunkUpdates(updateA, updateB) {
    if (updateA.type === 'added' && updateB.type === 'deleted' || updateA.type === 'deleted' && updateB.type === 'added') {
        return undefined;
    }
    if (updateA.type === 'partial') {
        invariant(updateA.instruction, 'Partial updates are unsupported');
    }
    if (updateB.type === 'partial') {
        invariant(updateB.instruction, 'Partial updates are unsupported');
    }
    return undefined;
}
function mergeChunkListEcmascriptMergedUpdates(mergedA, mergedB) {
    const entries = mergeEcmascriptChunkEntries(mergedA.entries, mergedB.entries);
    const chunks = mergeEcmascriptChunksUpdates(mergedA.chunks, mergedB.chunks);
    return {
        type: 'EcmascriptMergedUpdate',
        entries,
        chunks
    };
}
function mergeEcmascriptChunkEntries(entriesA, entriesB) {
    return {
        ...entriesA,
        ...entriesB
    };
}
function mergeEcmascriptChunksUpdates(chunksA, chunksB) {
    if (chunksA == null) {
        return chunksB;
    }
    if (chunksB == null) {
        return chunksA;
    }
    const chunks = {};
    for (const [chunkPath, chunkUpdateA] of Object.entries(chunksA)){
        const chunkUpdateB = chunksB[chunkPath];
        if (chunkUpdateB != null) {
            const mergedUpdate = mergeEcmascriptChunkUpdates(chunkUpdateA, chunkUpdateB);
            if (mergedUpdate != null) {
                chunks[chunkPath] = mergedUpdate;
            }
        } else {
            chunks[chunkPath] = chunkUpdateA;
        }
    }
    for (const [chunkPath, chunkUpdateB] of Object.entries(chunksB)){
        if (chunks[chunkPath] == null) {
            chunks[chunkPath] = chunkUpdateB;
        }
    }
    if (Object.keys(chunks).length === 0) {
        return undefined;
    }
    return chunks;
}
function mergeEcmascriptChunkUpdates(updateA, updateB) {
    if (updateA.type === 'added' && updateB.type === 'deleted') {
        // These two completely cancel each other out.
        return undefined;
    }
    if (updateA.type === 'deleted' && updateB.type === 'added') {
        const added = [];
        const deleted = [];
        const deletedModules = new Set(updateA.modules ?? []);
        const addedModules = new Set(updateB.modules ?? []);
        for (const moduleId of addedModules){
            if (!deletedModules.has(moduleId)) {
                added.push(moduleId);
            }
        }
        for (const moduleId of deletedModules){
            if (!addedModules.has(moduleId)) {
                deleted.push(moduleId);
            }
        }
        if (added.length === 0 && deleted.length === 0) {
            return undefined;
        }
        return {
            type: 'partial',
            added,
            deleted
        };
    }
    if (updateA.type === 'partial' && updateB.type === 'partial') {
        const added = new Set([
            ...updateA.added ?? [],
            ...updateB.added ?? []
        ]);
        const deleted = new Set([
            ...updateA.deleted ?? [],
            ...updateB.deleted ?? []
        ]);
        if (updateB.added != null) {
            for (const moduleId of updateB.added){
                deleted.delete(moduleId);
            }
        }
        if (updateB.deleted != null) {
            for (const moduleId of updateB.deleted){
                added.delete(moduleId);
            }
        }
        return {
            type: 'partial',
            added: [
                ...added
            ],
            deleted: [
                ...deleted
            ]
        };
    }
    if (updateA.type === 'added' && updateB.type === 'partial') {
        const modules = new Set([
            ...updateA.modules ?? [],
            ...updateB.added ?? []
        ]);
        for (const moduleId of updateB.deleted ?? []){
            modules.delete(moduleId);
        }
        return {
            type: 'added',
            modules: [
                ...modules
            ]
        };
    }
    if (updateA.type === 'partial' && updateB.type === 'deleted') {
        // We could eagerly return `updateB` here, but this would potentially be
        // incorrect if `updateA` has added modules.
        const modules = new Set(updateB.modules ?? []);
        if (updateA.added != null) {
            for (const moduleId of updateA.added){
                modules.delete(moduleId);
            }
        }
        return {
            type: 'deleted',
            modules: [
                ...modules
            ]
        };
    }
    // Any other update combination is invalid.
    return undefined;
}
function invariant(_, message) {
    throw new Error(`Invariant: ${message}`);
}
const CRITICAL = [
    'bug',
    'error',
    'fatal'
];
function compareByList(list, a, b) {
    const aI = list.indexOf(a) + 1 || list.length;
    const bI = list.indexOf(b) + 1 || list.length;
    return aI - bI;
}
const chunksWithIssues = new Map();
function emitIssues() {
    const issues = [];
    const deduplicationSet = new Set();
    for (const [_, chunkIssues] of chunksWithIssues){
        for (const chunkIssue of chunkIssues){
            if (deduplicationSet.has(chunkIssue.formatted)) continue;
            issues.push(chunkIssue);
            deduplicationSet.add(chunkIssue.formatted);
        }
    }
    sortIssues(issues);
    hooks.issues(issues);
}
function handleIssues(msg) {
    const key = resourceKey(msg.resource);
    let hasCriticalIssues = false;
    for (const issue of msg.issues){
        if (CRITICAL.includes(issue.severity)) {
            hasCriticalIssues = true;
        }
    }
    if (msg.issues.length > 0) {
        chunksWithIssues.set(key, msg.issues);
    } else if (chunksWithIssues.has(key)) {
        chunksWithIssues.delete(key);
    }
    emitIssues();
    return hasCriticalIssues;
}
const SEVERITY_ORDER = [
    'bug',
    'fatal',
    'error',
    'warning',
    'info',
    'log'
];
const CATEGORY_ORDER = [
    'parse',
    'resolve',
    'code generation',
    'rendering',
    'typescript',
    'other'
];
function sortIssues(issues) {
    issues.sort((a, b)=>{
        const first = compareByList(SEVERITY_ORDER, a.severity, b.severity);
        if (first !== 0) return first;
        return compareByList(CATEGORY_ORDER, a.category, b.category);
    });
}
const hooks = {
    beforeRefresh: ()=>{},
    refresh: ()=>{},
    buildOk: ()=>{},
    issues: (_issues)=>{}
};
function setHooks(newHooks) {
    Object.assign(hooks, newHooks);
}
function handleSocketMessage(msg) {
    sortIssues(msg.issues);
    handleIssues(msg);
    switch(msg.type){
        case 'issues':
            break;
        case 'partial':
            // aggregate updates
            aggregateUpdates(msg);
            break;
        default:
            // run single update
            const runHooks = chunkListsWithPendingUpdates.size === 0;
            if (runHooks) hooks.beforeRefresh();
            triggerUpdate(msg);
            if (runHooks) finalizeUpdate();
            break;
    }
}
function finalizeUpdate() {
    hooks.refresh();
    hooks.buildOk();
    // This is used by the Next.js integration test suite to notify it when HMR
    // updates have been completed.
    // TODO: Only run this in test environments (gate by `process.env.__NEXT_TEST_MODE`)
    if (globalThis.__NEXT_HMR_CB) {
        globalThis.__NEXT_HMR_CB();
        globalThis.__NEXT_HMR_CB = null;
    }
}
function subscribeToChunkUpdate(chunkListPath, sendMessage, callback) {
    return subscribeToUpdate({
        path: chunkListPath
    }, sendMessage, callback);
}
function subscribeToUpdate(resource, sendMessage, callback) {
    const key = resourceKey(resource);
    let callbackSet;
    const existingCallbackSet = updateCallbackSets.get(key);
    if (!existingCallbackSet) {
        callbackSet = {
            callbacks: new Set([
                callback
            ]),
            unsubscribe: subscribeToUpdates(sendMessage, resource)
        };
        updateCallbackSets.set(key, callbackSet);
    } else {
        existingCallbackSet.callbacks.add(callback);
        callbackSet = existingCallbackSet;
    }
    return ()=>{
        callbackSet.callbacks.delete(callback);
        if (callbackSet.callbacks.size === 0) {
            callbackSet.unsubscribe();
            updateCallbackSets.delete(key);
        }
    };
}
function triggerUpdate(msg) {
    const key = resourceKey(msg.resource);
    const callbackSet = updateCallbackSets.get(key);
    if (!callbackSet) {
        return;
    }
    for (const callback of callbackSet.callbacks){
        callback(msg);
    }
    if (msg.type === 'notFound') {
        // This indicates that the resource which we subscribed to either does not exist or
        // has been deleted. In either case, we should clear all update callbacks, so if a
        // new subscription is created for the same resource, it will send a new "subscribe"
        // message to the server.
        // No need to send an "unsubscribe" message to the server, it will have already
        // dropped the update stream before sending the "notFound" message.
        updateCallbackSets.delete(key);
    }
}
}),
"[project]/Desktop/Divorce-Ledger-AI/frontend/src/lib/supabase.ts [client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

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
var __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$client$5d$__$28$ecmascript$29$__ = /*#__PURE__*/ __turbopack_context__.i("[project]/Desktop/Divorce-Ledger-AI/frontend/node_modules/next/dist/build/polyfills/process.js [client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$node_modules$2f40$supabase$2f$supabase$2d$js$2f$dist$2f$index$2e$mjs__$5b$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/Desktop/Divorce-Ledger-AI/frontend/node_modules/@supabase/supabase-js/dist/index.mjs [client] (ecmascript) <locals>");
;
const supabaseUrl = __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$client$5d$__$28$ecmascript$29$__["default"].env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$client$5d$__$28$ecmascript$29$__["default"].env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables');
}
const supabase = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$node_modules$2f40$supabase$2f$supabase$2d$js$2f$dist$2f$index$2e$mjs__$5b$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["createClient"])(supabaseUrl, supabaseAnonKey, {
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
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/Desktop/Divorce-Ledger-AI/frontend/src/store/authStore.ts [client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useAuthStore",
    ()=>useAuthStore
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$node_modules$2f$zustand$2f$esm$2f$index$2e$mjs__$5b$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/Desktop/Divorce-Ledger-AI/frontend/node_modules/zustand/esm/index.mjs [client] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$node_modules$2f$zustand$2f$esm$2f$middleware$2e$mjs__$5b$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Desktop/Divorce-Ledger-AI/frontend/node_modules/zustand/esm/middleware.mjs [client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$src$2f$lib$2f$supabase$2e$ts__$5b$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Desktop/Divorce-Ledger-AI/frontend/src/lib/supabase.ts [client] (ecmascript)");
;
;
;
const useAuthStore = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$node_modules$2f$zustand$2f$esm$2f$index$2e$mjs__$5b$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["create"])()((0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$node_modules$2f$zustand$2f$esm$2f$middleware$2e$mjs__$5b$client$5d$__$28$ecmascript$29$__["persist"])((set, get)=>({
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
                const { user } = await __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$src$2f$lib$2f$supabase$2e$ts__$5b$client$5d$__$28$ecmascript$29$__["auth"].signIn(email, password);
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
                const { user } = await __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$src$2f$lib$2f$supabase$2e$ts__$5b$client$5d$__$28$ecmascript$29$__["auth"].signUp(email, password, {
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
                await __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$src$2f$lib$2f$supabase$2e$ts__$5b$client$5d$__$28$ecmascript$29$__["auth"].signOut();
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
                const user = await __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$src$2f$lib$2f$supabase$2e$ts__$5b$client$5d$__$28$ecmascript$29$__["auth"].getUser();
                set({
                    user,
                    loading: false,
                    initialized: true
                });
                // Listen to auth state changes
                __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$src$2f$lib$2f$supabase$2e$ts__$5b$client$5d$__$28$ecmascript$29$__["auth"].onAuthStateChange((user)=>{
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
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/Desktop/Divorce-Ledger-AI/frontend/src/store/workspaceStore.ts [client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useWorkspaceStore",
    ()=>useWorkspaceStore
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$node_modules$2f$zustand$2f$esm$2f$index$2e$mjs__$5b$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/Desktop/Divorce-Ledger-AI/frontend/node_modules/zustand/esm/index.mjs [client] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$node_modules$2f$zustand$2f$esm$2f$middleware$2e$mjs__$5b$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Desktop/Divorce-Ledger-AI/frontend/node_modules/zustand/esm/middleware.mjs [client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$src$2f$lib$2f$supabase$2e$ts__$5b$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Desktop/Divorce-Ledger-AI/frontend/src/lib/supabase.ts [client] (ecmascript)");
;
;
;
const useWorkspaceStore = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$node_modules$2f$zustand$2f$esm$2f$index$2e$mjs__$5b$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["create"])()((0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$node_modules$2f$zustand$2f$esm$2f$middleware$2e$mjs__$5b$client$5d$__$28$ecmascript$29$__["persist"])((set, get)=>({
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
                const { data, error } = await __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$src$2f$lib$2f$supabase$2e$ts__$5b$client$5d$__$28$ecmascript$29$__["supabase"].from('profiles').select('*').eq('id', userId).single();
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
                const { data, error } = await __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$src$2f$lib$2f$supabase$2e$ts__$5b$client$5d$__$28$ecmascript$29$__["supabase"].from('active_workspace_memberships').select('*').eq('user_id', userId).order('is_primary', {
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
                if ("TURBOPACK compile-time truthy", 1) {
                    if (workspace.workspace_type === 'firm') {
                        window.location.href = '/firm';
                    } else {
                        window.location.href = '/app';
                    }
                }
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
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/Desktop/Divorce-Ledger-AI/frontend/src/pages/_app.tsx [client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>App
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Desktop/Divorce-Ledger-AI/frontend/node_modules/react/jsx-dev-runtime.js [client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Desktop/Divorce-Ledger-AI/frontend/node_modules/react/index.js [client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$src$2f$store$2f$authStore$2e$ts__$5b$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Desktop/Divorce-Ledger-AI/frontend/src/store/authStore.ts [client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$src$2f$store$2f$workspaceStore$2e$ts__$5b$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Desktop/Divorce-Ledger-AI/frontend/src/store/workspaceStore.ts [client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
;
;
;
;
function App({ Component, pageProps }) {
    _s();
    const { initialize: initializeAuth, user } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$src$2f$store$2f$authStore$2e$ts__$5b$client$5d$__$28$ecmascript$29$__["useAuthStore"])();
    const { initialize: initializeWorkspace, initialized: workspaceInitialized } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$src$2f$store$2f$workspaceStore$2e$ts__$5b$client$5d$__$28$ecmascript$29$__["useWorkspaceStore"])();
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "App.useEffect": ()=>{
            // Initialize auth on app start
            initializeAuth();
        }
    }["App.useEffect"], [
        initializeAuth
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "App.useEffect": ()=>{
            // Initialize workspace context when user is authenticated
            if (user && !workspaceInitialized) {
                initializeWorkspace(user.id).catch({
                    "App.useEffect": (error)=>{
                        console.error('Failed to initialize workspace:', error);
                    }
                }["App.useEffect"]);
            }
        }
    }["App.useEffect"], [
        user,
        workspaceInitialized,
        initializeWorkspace
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Component, {
        ...pageProps
    }, void 0, false, {
        fileName: "[project]/Desktop/Divorce-Ledger-AI/frontend/src/pages/_app.tsx",
        lineNumber: 25,
        columnNumber: 10
    }, this);
}
_s(App, "Gns5XNHexyDdyw2dGCjB52XXm0w=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$src$2f$store$2f$authStore$2e$ts__$5b$client$5d$__$28$ecmascript$29$__["useAuthStore"],
        __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Divorce$2d$Ledger$2d$AI$2f$frontend$2f$src$2f$store$2f$workspaceStore$2e$ts__$5b$client$5d$__$28$ecmascript$29$__["useWorkspaceStore"]
    ];
});
_c = App;
var _c;
__turbopack_context__.k.register(_c, "App");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[next]/entry/page-loader.ts { PAGE => \"[project]/Desktop/Divorce-Ledger-AI/frontend/src/pages/_app.tsx [client] (ecmascript)\" } [client] (ecmascript)", ((__turbopack_context__, module, exports) => {

const PAGE_PATH = "/_app";
(window.__NEXT_P = window.__NEXT_P || []).push([
    PAGE_PATH,
    ()=>{
        return __turbopack_context__.r("[project]/Desktop/Divorce-Ledger-AI/frontend/src/pages/_app.tsx [client] (ecmascript)");
    }
]);
// @ts-expect-error module.hot exists
if (module.hot) {
    // @ts-expect-error module.hot exists
    module.hot.dispose(function() {
        window.__NEXT_P.push([
            PAGE_PATH
        ]);
    });
}
}),
"[hmr-entry]/hmr-entry.js { ENTRY => \"[project]/Desktop/Divorce-Ledger-AI/frontend/src/pages/_app\" }", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.r("[next]/entry/page-loader.ts { PAGE => \"[project]/Desktop/Divorce-Ledger-AI/frontend/src/pages/_app.tsx [client] (ecmascript)\" } [client] (ecmascript)");
}),
]);

//# sourceMappingURL=%5Broot-of-the-server%5D__41dd40fe._.js.map