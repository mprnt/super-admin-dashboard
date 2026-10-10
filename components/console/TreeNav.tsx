'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { activePath, nodeMatches, type TreeNode, type TreeSection } from '../../lib/tree.ts';
import { StatusDot, cx } from '../ui/primitives';

const STORAGE_KEY = 'mprnt-sa-tree-open';

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
    // Storage can be blocked. The tree still works; it just forgets its open branches.
  }
}

/**
 * The navigator. Every partner, QR point, printer and person is a node, and
 * every node is a page. The branch the operator is on opens by itself. The
 * open/closed state is remembered on this device only: it is a convenience,
 * and it holds nothing sensitive.
 */
export function TreeNav({
  sections,
  pathname,
  onNavigate,
}: {
  sections: TreeSection[];
  pathname: string;
  onNavigate?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setOpen(readOpen());
    setLoaded(true);
  }, []);

  const trail = useMemo(() => activePath(sections, pathname), [sections, pathname]);

  // Open the branch the operator is on, without closing anything else.
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
    <nav aria-label="Console navigation" className="flex h-full flex-col">
      <div className="border-b border-line p-3">
        <label className="block">
          <span className="sr-only">Filter the tree</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter partners, printers, staff"
            className="w-full rounded border border-line bg-bg px-2.5 py-1.5 text-sm text-ink placeholder:text-mute/70 focus:border-amber focus:outline-none focus-visible:ring-2 focus-visible:ring-amber/40"
          />
        </label>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-3">
        {sections.map((section) => (
          <div key={section.id} className="mb-4">
            <h2 className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-mute">{section.title}</h2>
            <ul className="space-y-px">
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
          'group flex items-center gap-1 rounded pr-1 transition',
          isActive ? 'bg-amber/15 text-ink' : onTrail ? 'text-ink' : 'text-mute hover:bg-raised hover:text-ink'
        )}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${node.label}`}
            aria-expanded={expanded}
            onClick={() => onToggle(node.id)}
            className="grid h-7 w-5 shrink-0 place-items-center rounded text-xs text-mute hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber"
          >
            <span aria-hidden className={cx('transition-transform', expanded && 'rotate-90')}>
              ▸
            </span>
          </button>
        ) : (
          <span aria-hidden className="w-5 shrink-0" />
        )}

        <Link
          href={node.href}
          aria-current={isActive ? 'page' : undefined}
          onClick={onNavigate}
          className="flex min-w-0 flex-1 items-center gap-2 rounded py-1.5 text-[13px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber"
        >
          {node.tone && <StatusDot tone={node.tone} />}
          <span className="min-w-0 truncate">{highlight(node.label, filtering ? query : '')}</span>
          {node.meta && <span className="ml-auto shrink-0 truncate font-mono text-[10px] text-mute">{node.meta}</span>}
        </Link>
      </div>

      {hasChildren && expanded && (
        <ul className="space-y-px">
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
      <mark className="rounded-sm bg-amber/30 text-ink">{text.slice(at, at + q.length)}</mark>
      {text.slice(at + q.length)}
    </>
  );
}
