import { Building, User, Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';

interface Workspace {
  id: string;
  name: string;
  type: 'consumer' | 'firm';
  role: 'owner' | 'admin' | 'staff' | 'client';
}

interface WorkspaceSwitcherProps {
  currentWorkspace: Workspace;
  workspaces: Workspace[];
  onSwitch: (workspaceId: string) => void;
}

export function WorkspaceSwitcher({
  currentWorkspace,
  workspaces,
  onSwitch,
}: WorkspaceSwitcherProps) {
  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'owner':
        return 'default';
      case 'admin':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full justify-between">
          <div className="flex items-center gap-2 overflow-hidden">
            {currentWorkspace.type === 'firm' ? (
              <Building className="h-4 w-4 shrink-0" />
            ) : (
              <User className="h-4 w-4 shrink-0" />
            )}
            <span className="truncate">{currentWorkspace.name}</span>
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[300px]">
        <DropdownMenuLabel>Your Workspaces</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {workspaces.map((workspace) => (
          <DropdownMenuItem
            key={workspace.id}
            onClick={() => onSwitch(workspace.id)}
            className="flex items-center justify-between cursor-pointer"
          >
            <div className="flex items-center gap-2 overflow-hidden">
              {workspace.type === 'firm' ? (
                <Building className="h-4 w-4 shrink-0" />
              ) : (
                <User className="h-4 w-4 shrink-0" />
              )}
              <span className="truncate">{workspace.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={getRoleBadgeVariant(workspace.role)} className="text-xs">
                {workspace.role}
              </Badge>
              {workspace.id === currentWorkspace.id && <Check className="h-4 w-4" />}
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
