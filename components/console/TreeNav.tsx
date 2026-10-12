'use client';

import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import { activePath, nodeMatches, type TreeNode, type TreeSection } from '../../lib/tree.ts';
import { StatusDot, cx } from '../ui/primitives';
import { Icons } from '../ui/icons';

/**
 * The navigator: a flat, sectioned list. Each partner is one row, and its pages are
 * the tabs across the top of that partner, so nothing is listed twice.
 */
export function TreeNav({ sections, pathname, onNavigate }: { sections: TreeSection[]; pathname: string; onNavigate?: () => void }) {
  const [query, setQuery] = useState('');
  const filtering = query.trim().length > 0;

  const trail = useMemo(() => activePath(sections, pathname), [sections, pathname]);
  const activeId = trail[trail.length - 1];

  return (
    <nav aria-label="Navigator" className="flex h-full min-h-0 flex-col">
      <div className="px-3 pb-2 pt-3">
        <label className="relative block">
          <span className="sr-only">Filter the navigator</span>
          <span aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-mute">
            <Icons.search />
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter partners"
            className="h-10 w-full rounded-full border border-line bg-bg pl-10 pr-4 text-sm text-ink placeholder:text-mute/80 focus:border-brand-text focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-text/40"
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-6 pt-2">
        {sections.map((section) => {
          const nodes = section.nodes.filter((n) => !filtering || nodeMatches(n, query));
          if (nodes.length === 0) return null;
          return (
            <div key={section.id} className="mb-5">
              <h2 className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-mute">{section.title}</h2>
              <ul className="space-y-0.5">
                {nodes.map((node) => (
                  <Row key={node.id} node={node} active={node.id === activeId} onNavigate={onNavigate} />
                ))}
              </ul>
            </div>
          );
        })}
        {filtering && sections.every((s) => s.nodes.every((n) => !nodeMatches(n, query))) && (
          <p className="px-3 py-6 text-sm text-mute">No partner matches “{query}”. Press ⌘K to search printers and people.</p>
        )}
      </div>
    </nav>
  );
}

function Row({ node, active, onNavigate }: { node: TreeNode; active: boolean; onNavigate?: () => void }) {
  return (
    <li>
      <Link
        href={node.href}
        aria-current={active ? 'page' : undefined}
        onClick={onNavigate}
        className={cx(
          'relative flex min-h-[44px] items-center gap-2.5 rounded-xl px-3 text-[14px] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-text',
          active ? 'bg-brand-soft font-semibold text-brand-text' : 'text-ink hover:bg-raised'
        )}
      >
        {active && <span aria-hidden className="absolute inset-y-2 left-0 w-1 rounded-full bg-brand" />}
        {node.tone && <StatusDot tone={node.tone} />}
        <span className="min-w-0 flex-1 truncate">{node.label}</span>
        {node.meta && <Meta>{node.meta}</Meta>}
      </Link>
    </li>
  );
}

function Meta({ children }: { children: ReactNode }) {
  return <span className="max-w-[7rem] shrink-0 truncate rounded-full bg-raised px-2 py-0.5 text-[11px] font-medium text-mute">{children}</span>;
}
