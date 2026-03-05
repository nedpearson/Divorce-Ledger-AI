import React from "react";
import { type DrilldownType } from "@/components/financial-drilldown-drawer";
import { useDrilldown } from "@/lib/drilldown-context";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export interface DrillDownValueProps extends React.HTMLAttributes<HTMLButtonElement> {
    type: DrilldownType;
    title: string;
    value: React.ReactNode;
    asBadge?: boolean;
}

export function DrillDownValue({ type, title, value, className, asBadge, ...props }: DrillDownValueProps) {
    const { openDrilldown } = useDrilldown();

    const handleDrilldown = (e: React.MouseEvent) => {
        e.stopPropagation();
        openDrilldown({ type, title });
    };

    const baseClasses = "inline-flex items-center gap-1 group whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm transition-colors text-primary hover:text-primary/80";

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <button
                        onClick={handleDrilldown}
                        className={`${baseClasses} ${asBadge ? "px-2 py-0.5 bg-primary/10 hover:bg-primary/20 rounded-md font-medium text-xs" : "font-semibold"} ${className || ""}`}
                        title={`View underlying ${title} records`}
                        aria-label={`View underlying ${title} records`}
                        data-testid={`drilldown-trigger-${type}`}
                        {...props}
                    >
                        <span className={asBadge ? "" : "border-b border-dashed border-primary/50 group-hover:border-primary"}>
                            {value}
                        </span>
                    </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                    Click to view underlying {title.toLowerCase()} records
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}
