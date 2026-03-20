# Divorce Ledger - Design Guidelines

## Design Approach

**Mobile-First, Professional but Approachable**: The app is designed primarily for mobile use as a quick-capture evidence tool. Users need to rapidly scan documents and report violations. The design balances professional credibility with engaging visual elements that make the stressful divorce process feel more manageable.

**Key Principles**:

- Large, thumb-friendly touch targets for mobile
- Quick access to core actions (scan, report) on home screen
- Professional dark theme with vibrant accent gradients
- Subtle animations and micro-interactions for engagement
- Clear visual hierarchy with color-coded categories

## Color Scheme

**Dark Mode (Default)**: Navy-tinted dark theme for professional, trustworthy appearance

- Background: Dark navy (#0f1419 - HSL 220 20% 8%)
- Card background: Slightly lighter navy (#161b22 - HSL 220 18% 11%)
- Primary accent: Royal blue (#3b82f6 - HSL 225 70% 50%) for buttons, links, and key actions
- Text: Light gray/white for high contrast readability
- Borders: Subtle blue-tinted gray for definition without distraction

**Light Mode**: Clean, professional with blue accents

- Background: Light blue-tinted gray (HSL 220 15% 98%)
- Card background: Pure white
- Same primary accent blue for consistency

**Key Colors**:

- Primary (buttons, active states): HSL 225 70% 50% - Royal blue
- Muted text: HSL 220 10% 65% in dark mode
- Destructive actions: Red HSL 0 84% 45%

**Gradient Accents** (for fun visual pop):

- Documents/Scan: Blue to Cyan gradient (from-blue-500 to-cyan-400)
- Violations/Report: Orange to Red gradient (from-orange-500 to-red-400)
- Case Building: Purple to Pink gradient (from-purple-500 to-pink-400)
- AI Features: Cyan to Blue gradient (from-cyan-500 to-blue-500)
- Financial: Green to Emerald gradient (from-green-500 to-emerald-400)

## Reference Inspiration

Primary: QuickBooks Online (compact data presentation), Stripe Dashboard (clean data hierarchy), Gusto (professional but approachable)
Secondary: Linear (typography crispness), Carta (financial data display), Robinhood (mobile-first gradients), Cash App (engaging interactions)

## Mobile-First Layout

**Navigation**:

- Mobile (< 768px): Fixed bottom navigation bar with FAB-style capture button
- Desktop (>= 768px): Traditional sidebar navigation

**Quick Actions (Home Screen)**:

- Two large action cards: "Scan Document" and "Report Violation"
- Gradient borders with icon and label
- Active scale animation on press (0.98 scale)
- Secondary action buttons below: Upload Files, Voice Note

**Touch Targets**:

- Minimum touch target: 44px x 44px
- Primary action buttons: 56px height minimum
- Bottom nav icons: 48px touch area

**Safe Areas**:

- Bottom navigation respects iOS safe area (safe-area-pb class)
- Content has pb-20 on mobile to clear bottom nav

## Typography System

**Font Stack**: Inter (primary) via Google Fonts CDN

- Display/Headings: Inter 600 (Semibold)
- Body: Inter 400 (Regular)
- Data/Numbers: Inter 500 (Medium) - tabular numerals enabled
- Small/Meta: Inter 400 (Regular)

**Scale** (maintaining compact professional density):

- Page Titles: text-2xl (24px)
- Section Headers: text-lg (18px)
- Card Titles: text-base (16px)
- Body/Data: text-sm (14px)
- Labels/Meta: text-xs (12px)

## Layout System

**Spacing Primitives**: Tailwind units of 1, 2, 3, 4, 6, 8, 12

- Tight spacing for data density (p-2, p-3, p-4 for cards)
- Component margins: mb-4, mb-6 for separation
- Section padding: py-6, py-8 for major breaks
- Grid gaps: gap-4 for card grids, gap-2 for compact lists

**Grid Structure**:

- Sidebar: 220px (expanded), 64px (collapsed)
- Main content: max-w-7xl with px-6
- Dashboard cards: grid-cols-1 md:grid-cols-2 lg:grid-cols-4
- Data tables: Full width with horizontal scroll on mobile

## Component Library

**Navigation**:

- Persistent left sidebar with icon + label pattern
- Collapsible to icon-only on smaller screens
- Top bar: minimal height (h-14) with environment toggle, notifications, profile

**Cards** (Primary UI pattern):

- Rounded corners: rounded-lg
- Borders: border with subtle treatment
- Padding: p-4 for standard, p-3 for compact
- Shadow: shadow-sm on hover for interactive cards
- Headers include icon + title + action button

**Data Tables**:

- Striped rows for readability (alternate row treatment)
- Sticky headers on scroll
- Sortable columns with subtle indicators
- Row hover states for interactivity
- Compact row height (py-2)

**Stats/KPI Displays**:

- Large numbers: text-2xl with tabular numerals
- Trend indicators: Small arrows/icons with percentage
- Comparison data below in muted text-xs
- Sparkline charts where valuable (using Chart.js via CDN)

**Forms**:

- Compact input height: h-9
- Labels above inputs: text-sm mb-1
- Helper text: text-xs muted
- Grouped related fields with gap-3
- Multi-column layouts for efficient space use

**Buttons**:

- Primary: h-9 px-4 text-sm rounded-md
- Secondary: Same size, outline variant
- Icon buttons: w-9 h-9 for consistent square
- Button groups: Segmented controls for toggles (LIVE/DEMO)

**Alerts/Badges**:

- Critical: Prominent treatment for financial/legal alerts
- Warning: Mid-level attention
- Info: Subtle notification style
- Badges: Compact pill shapes (px-2 py-0.5 text-xs)

**Charts/Visualizations**:

- Use Chart.js via CDN for financial charts
- Pie charts for asset breakdown
- Line charts for income/expense trends
- Bar charts for comparisons
- Keep chart height contained: h-48 to h-64

## Page-Specific Layouts

**Login Page**:

- Centered card: max-w-md
- Clean, professional with LIVE/DEMO toggle at top
- Minimal decoration, focus on form clarity

**Dashboard**:

- Dense card grid showing key metrics
- Each stat card is clickable for drill-down
- Recent activity feed with compact rows
- Alert section with color-coded severity
- No hero section - immediate data presentation

**Data-Heavy Pages** (Finances, Documents):

- Tab navigation for sub-sections
- Summary metrics at top
- Main content area with tables/lists below
- Filter/search controls in consistent position
- Export buttons in top-right corner

## Icons

**Library**: Heroicons (outline for navigation, solid for status indicators) via CDN

- Navigation: 20px (w-5 h-5)
- Inline with text: 16px (w-4 h-4)
- Large feature icons: 24px (w-6 h-6)

## Interaction Patterns

- Minimal animations - focus on instant feedback
- Hover states: Subtle lightness/shadow changes
- Loading states: Skeleton screens for data tables
- Toast notifications: Top-right corner, auto-dismiss
- Modal overlays: Centered, max-w-2xl, for complex forms

## Accessibility

- Maintain WCAG AA contrast minimums
- All interactive elements keyboard navigable
- Focus indicators on all form inputs and buttons
- Screen reader labels for icon-only buttons
- Consistent tab order throughout application

## Professional Trust Elements

- Consistent data formatting (currency, dates)
- Clear data source attribution
- Verification badges for confirmed data
- Professional avatar placeholders
- Subtle "DEMO MODE" watermark when applicable
