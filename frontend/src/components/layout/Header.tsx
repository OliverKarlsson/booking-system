import { Link } from 'react-router-dom';
import { Nav } from './Nav';

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-ink-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-page items-center justify-between gap-6 px-gutter">
        <Link to="/" className="flex items-center gap-2 text-sm font-semibold text-ink-900">
          <span
            aria-hidden="true"
            className="grid h-7 w-7 place-items-center rounded-md bg-accent-500 text-xs font-bold text-white"
          >
            B
          </span>
          Booking system
        </Link>
        <Nav />
      </div>
    </header>
  );
}
