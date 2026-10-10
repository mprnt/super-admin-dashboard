'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { activePath, nodeMatches, type TreeNode, type TreeSection } from '../../lib/tree.ts';
import { StatusDot, cx } from '../ui/primitives';
import { Icons } from '../ui/icons';

const STORAGE_KEY = 'mprnt-platform-tree-open';

function readOpen(): Set<string> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeOpen(open: Set<string>) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...open]));
  } catch {
    // Storage can be blocked. The navigator still works; it just forgets its open branches.
  }
}

/**
 * The navigator: every partner, QR point, printer and person is a page. The branch
 * the operator is on opens by itself. Open or closed is remembered on this device
 * only, as a convenience.
 */
export function TreeNav({ sections, pathname, onNavigate }: { sections: TreeSection[]; pathname: string; onNavigate?: () => void }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setOpen(readOpen());
    setLoaded(true);
  }, []);

  const trail = useMemo(() => activePath(sections, pathname), [sections, pathname]);

  useEffect(() => {
    if (!loaded || trail.length === 0) return;
    setOpen((current) => {
      const next = new Set(current);
      trail.slice(0, -1).forEach((id) => next.add(id));
      return next;
    });
  }, [trail, loaded]);

  useEffect(() => {
    if (loaded) writeOpen(open);
  }, [open, loaded]);

  const toggle = (id: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const activeId = trail[trail.length - 1];
  const filtering = query.trim().length > 0;

  return (
    <nav aria-label="Navigator" className="flex h-full min-h-0 flex-col">
      <div className="px-4 pb-3 pt-4">
        <label className="relative block">
          <span className="sr-only">Filter the navigator</span>
          <span aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-mute">
            <Icons.search />
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter partners, printers, staff"
            className="w-full min-h-[44px] rounded-full border border-line bg-bg py-2 pl-10 pr-4 text-ink placeholder:text-mute/80 focus:border-brand-text focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-text/40"
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-6">
        {sections.map((section) => (
          <div key={section.id} className="mb-5">
            <h2 className="px-3 pb-1.5 text-xs font-medium text-mute">{section.title}</h2>
            <ul className="space-y-0.5">
              {section.nodes
                .filter((n) => !filtering || nodeMatches(n, query))
                .map((node) => (
                  <Branch
                    key={node.id}
                    node={node}
                    depth={0}
                    activeId={activeId}
                    trail={trail}
                    open={open}
                    filtering={filtering}
                    query={query}
                    onToggle={toggle}
                    onNavigate={onNavigate}
                  />
                ))}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}

function Branch({
  node,
  depth,
  activeId,
  trail,
  open,
  filtering,
  query,
  onToggle,
  onNavigate,
}: {
  node: TreeNode;
  depth: number;
  activeId?: string;
  trail: string[];
  open: Set<string>;
  filtering: boolean;
  query: string;
  onToggle: (id: string) => void;
  onNavigate?: () => void;
}) {
  const hasChildren = Boolean(node.children && node.children.length > 0);
  const expanded = filtering || open.has(node.id);
  const isActive = node.id === activeId;
  const onTrail = trail.includes(node.id);

  return (
    <li>
      <div
        className={cx(
          'flex items-center gap-1 rounded-2xl pr-1 transition',
          isActive ? 'bg-brand text-brand-ink' : onTrail ? 'text-ink' : 'text-ink hover:bg-raised'
        )}
        style={{ paddingLeft: `${depth * 14 + 4}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${node.label}`}
            aria-expanded={expanded}
            onClick={() => onToggle(node.id)}
            className={cx(
              'grid h-11 w-9 shrink-0 place-items-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-text',
              isActive ? 'text-brand-ink' : 'text-mute'
            )}
          >
            <span aria-hidden className={cx('block transition-transform', expanded && 'rotate-90')}>
              <Icons.chevron />
            </span>
          </button>
        ) : (
          <span aria-hidden className="w-9 shrink-0" />
        )}

        <Link
          href={node.href}
          aria-current={isActive ? 'page' : undefined}
          onClick={onNavigate}
          className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2.5 rounded-2xl py-2 text-[15px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-text"
        >
          {node.tone && <StatusDot tone={isActive ? 'muted' : node.tone} />}
          <span className="min-w-0 truncate">{highlight(node.label, filtering ? query : '')}</span>
          {node.meta && <span className={cx('ml-auto shrink-0 truncate text-xs', isActive ? 'text-brand-ink/80' : 'text-mute')}>{node.meta}</span>}
        </Link>
      </div>

      {hasChildren && expanded && (
        <ul className="space-y-0.5">
          {node.children!
            .filter((c) => !filtering || nodeMatches(c, query))
            .map((child) => (
              <Branch
                key={child.id}
                node={child}
                depth={depth + 1}
                activeId={activeId}
                trail={trail}
                open={open}
                filtering={filtering}
                query={query}
                onToggle={onToggle}
                onNavigate={onNavigate}
              />
            ))}
        </ul>
      )}
    </li>
  );
}

function highlight(text: string, query: string): ReactNode {
  const q = query.trim();
  if (!q) return text;
  const at = text.toLowerCase().indexOf(q.toLowerCase());
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded bg-brand-text/25 text-current">{text.slice(at, at + q.length)}</mark>
      {text.slice(at + q.length)}
    </>
  );
}
