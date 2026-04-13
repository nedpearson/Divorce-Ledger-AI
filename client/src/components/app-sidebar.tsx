import { useLocation, Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard,
  DollarSign,
  FileText,
  AlertTriangle,
  MessageSquare,
  MessageCircle,
  Calendar,
  Scale,
  Users,
  Home,
  BarChart3,
  Bot,
  Settings,
  LogOut,
  ChevronDown,
  History,
  Briefcase,
  Shield,
  ShieldAlert,
  Smartphone,
  ShieldCheck,
  Lightbulb,
  Sparkles,
  ClipboardList,
  BookOpen,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  SidebarSeparator,
} from '@/components/ui/sidebar';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { Coins } from 'lucide-react';

const mainMenuItems = [
  { title: 'Home', url: '/home', icon: Home },
  { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard },
  { title: 'Finances', url: '/finances', icon: DollarSign },
  { title: 'Documents', url: '/documents', icon: FileText },
  { title: 'Violations', url: '/violations', icon: AlertTriangle },
  { title: 'Journal', url: '/journal', icon: BookOpen },
  { title: 'Messages', url: '/communications', icon: MessageCircle },
  { title: 'Calendar', url: '/calendar', icon: Calendar },
];

const legalMenuItems = [
  { title: 'Case Builder', url: '/case-builder', icon: Briefcase },
  { title: 'Case Timeline', url: '/timeline', icon: History },
  { title: 'Legal', url: '/legal', icon: Scale },
  { title: 'Obligations', url: '/obligations', icon: Users },
  { title: 'Property Settlement', url: '/property', icon: Home },
];

const toolsMenuItems = [
  { title: 'Analytics & Reports', url: '/analytics', icon: BarChart3 },
  { title: 'Data Governance', url: '/governance', icon: Shield },
  { title: 'AI Coach', url: '/ai-coach', icon: Bot },
  { title: 'Mobile App', url: '/mobile', icon: Smartphone },
  { title: 'Share Ideas', url: '/recommendations', icon: Lightbulb },
  { title: "What's New", url: '/changelog', icon: Sparkles },
  { title: 'Plans & Pricing', url: '/pricing', icon: Coins },
];

const adminMenuItems = [
  { title: 'Admin Users', url: '/admin/users', icon: ShieldCheck },
  { title: 'Manage Feedback', url: '/admin/recommendations', icon: ClipboardList },
  { title: 'Super Admin', url: '/superadmin', icon: ShieldAlert },
];

const SUPER_ADMIN_EMAIL = 'nedpearson@gmail.com';

export function AppSidebar() {
  const [location] = useLocation();
  const { user, logout, environment } = useAuth();

  const isAdmin = user?.isAdmin || user?.email?.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();

  // Fetch violations count for sidebar badge
  const { data: violations } = useQuery<{ id: number }[]>({
    queryKey: ['/api/violations', environment],
    queryFn: async () => {
      const res = await fetch(`/api/violations?environment=${environment}`, {
        credentials: 'include',
        headers: { 'X-Environment': environment || 'demo' },
      });
      if (!res.ok) return [];
      return res.json();
    },
  });
  const violationsCount = violations?.length ?? 0;

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-primary rounded-md">
            <Scale className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-semibold text-sm">Divorce Ledger</span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs">Main</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainMenuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url}
                    data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <Link href={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span className="flex-1">{item.title}</span>
                      {item.title === 'Violations' && violationsCount > 0 && (
                        <Badge variant="destructive" className="text-xs px-1.5 py-0">
                          {violationsCount}
                        </Badge>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupLabel className="text-xs">Legal & Settlement</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {legalMenuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url}
                    data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <Link href={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupLabel className="text-xs">Tools</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {toolsMenuItems.map((item) => {
                const url =
                  item.url === '/mobile' && environment === 'demo' ? '/mobile?mode=demo' : item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={location === item.url || location.startsWith(item.url + '?')}
                      data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      <Link href={url}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}

              {environment === 'demo' && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={location === '/demo-presentation'}
                    data-testid="nav-demo-presentation"
                  >
                    <Link href="/demo-presentation">
                      <Sparkles className="h-4 w-4" />
                      <span>Demo Tour</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isAdmin && (
          <>
            <SidebarSeparator />
            <SidebarGroup>
              <SidebarGroupLabel className="text-xs text-yellow-600 dark:text-yellow-500">
                Administration
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {adminMenuItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        isActive={location === item.url}
                        data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}
                      >
                        <Link href={item.url}>
                          <item.icon className="h-4 w-4 text-yellow-600 dark:text-yellow-500" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>

      <SidebarFooter className="p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={location === '/settings'}
              data-testid="nav-settings"
            >
              <Link href="/settings">
                <Settings className="h-4 w-4" />
                <span>Settings</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        <SidebarSeparator className="my-2" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center gap-2 w-full p-2 rounded-md hover-elevate transition-colors"
              data-testid="button-user-menu"
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                  {user ? getInitials(user.fullName) : 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 text-left min-w-0">
                <p className="text-sm font-medium truncate">{user?.fullName || 'User'}</p>
                <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {environment === 'demo' && (
              <>
                <div className="px-2 py-1.5 text-xs font-semibold text-orange-600 bg-orange-50 uppercase mt-1 mb-1 rounded-sm text-center">
                  DEMO Mode
                </div>
                <SidebarSeparator className="my-1" />
              </>
            )}
            <DropdownMenuItem
              onClick={logout}
              className="text-destructive focus:text-destructive"
              data-testid="button-logout"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
