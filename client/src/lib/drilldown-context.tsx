import React, { createContext, useContext, useState } from "react";
import { type DrilldownType } from "@/components/financial-drilldown-drawer";
import { FinancialDrilldownDrawer } from "@/components/financial-drilldown-drawer";
import { useAuth } from "@/lib/auth";

interface DrilldownPayload {
    type: DrilldownType;
    title: string;
}

interface DrilldownContextValue {
    openDrilldown: (payload: DrilldownPayload) => void;
    closeDrilldown: () => void;
}

const DrilldownContext = createContext<DrilldownContextValue | null>(null);

export function DrilldownProvider({ children }: { children: React.ReactNode }) {
    const { environment } = useAuth();
    const [open, setOpen] = useState(false);
    const [payload, setPayload] = useState<DrilldownPayload | null>(null);

    const openDrilldown = (newPayload: DrilldownPayload) => {
        setPayload(newPayload);
        setOpen(true);
    };

    const closeDrilldown = () => {
        setOpen(false);
    };

    return (
        <DrilldownContext.Provider value={{ openDrilldown, closeDrilldown }}>
            {children}
            {payload && (
                <FinancialDrilldownDrawer
                    open={open}
                    onOpenChange={(isOpen) => setOpen(isOpen)}
                    type={payload.type}
                    title={payload.title}
                    environment={environment}
                />
            )}
        </DrilldownContext.Provider>
    );
}

export function useDrilldown() {
    const context = useContext(DrilldownContext);
    if (!context) {
        throw new Error("useDrilldown must be used within a DrilldownProvider");
    }
    return context;
}
