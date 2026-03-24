import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { type DrilldownType } from '@/components/financial-drilldown-drawer';
import { FinancialDrilldownDrawer } from '@/components/financial-drilldown-drawer';
import { UniversalDrilldownDrawer } from '@/components/ui/universal-drilldown-drawer';
import { DrilldownRequest } from '@shared/schema';
import { useAuth } from '@/lib/auth';

type LegacyPayload = { type: DrilldownType; title: string };
type UnifiedDrilldownPayload = DrilldownRequest | LegacyPayload;

function isLegacy(payload: UnifiedDrilldownPayload): payload is LegacyPayload {
  return 'type' in payload && 'title' in payload;
}

interface DrilldownContextValue {
  openDrilldown: (payload: UnifiedDrilldownPayload) => void;
  popDrilldown: () => void;
  closeDrilldown: () => void;
}

const DrilldownContext = createContext<DrilldownContextValue | null>(null);

export function DrilldownProvider({ children }: { children: React.ReactNode }) {
  const { environment } = useAuth();
  const [legacyOpen, setLegacyOpen] = useState(false);
  const [legacyPayload, setLegacyPayload] = useState<LegacyPayload | null>(null);
  
  const [stack, setStack] = useState<DrilldownRequest[]>([]);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith('#drilldown=')) {
      try {
        const payload = JSON.parse(atob(hash.replace('#drilldown=', '')));
        if (Array.isArray(payload)) setStack(payload);
      } catch (e) {
        console.error('Failed to parse drilldown hash', e);
      }
    }
  }, []);

  useEffect(() => {
    if (stack.length > 0) {
      window.history.replaceState(null, '', `#drilldown=${btoa(JSON.stringify(stack))}`);
    } else if (window.location.hash.startsWith('#drilldown=')) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, [stack]);

  const openDrilldown = useCallback((payload: UnifiedDrilldownPayload) => {
    if (isLegacy(payload)) {
      setLegacyPayload(payload);
      setLegacyOpen(true);
    } else {
      setStack(prev => [...prev, payload]);
    }
  }, []);

  const popDrilldown = useCallback(() => {
    setStack(prev => prev.slice(0, -1));
  }, []);

  const closeDrilldown = useCallback(() => {
    setLegacyOpen(false);
    setStack([]);
  }, []);

  return (
    <DrilldownContext.Provider value={{ openDrilldown, popDrilldown, closeDrilldown }}>
      {children}
      
      {/* Legacy Fallback Drawer */}
      {legacyPayload && (
        <FinancialDrilldownDrawer
          open={legacyOpen}
          onOpenChange={(isOpen) => !isOpen && closeDrilldown()}
          type={legacyPayload.type}
          title={legacyPayload.title}
          environment={environment}
        />
      )}

      {/* New Universal 8-Layer Drawer */}
      <UniversalDrilldownDrawer
        stack={stack}
        onPop={popDrilldown}
        onClose={closeDrilldown}
        onPush={openDrilldown}
      />
    </DrilldownContext.Provider>
  );
}

export function useDrilldown() {
  const context = useContext(DrilldownContext);
  if (!context) {
    throw new Error('useDrilldown must be used within a DrilldownProvider');
  }
  return context;
}
