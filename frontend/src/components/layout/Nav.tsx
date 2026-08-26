import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/cn';

interface NavItem {
  to: string;
  label: string;
  /** `/` would otherwise match every route, so the dashboard link is exact. */
  end?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/units', label: 'Rental units' },
  { to: '/reservations', label: 'Reservations' },
];

export function Nav() {
  return (
    <nav aria-label="Main" className="flex items-center gap-1">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              isActive ? 'bg-accent-50 text-accent-700' : 'text-ink-600 hover:bg-ink-100',
            )
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
