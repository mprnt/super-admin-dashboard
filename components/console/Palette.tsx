'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { flattenTree, type TreeNode, type TreeSection } from '../../lib/tree.ts';
import { StatusDot, cx } from '../ui/primitives';

/**
 * Jump to any node in the tree from the keyboard: partners, QR points, printers,
 * people and every section. Arrow keys move, Enter opens, Escape closes.
 */
export function Palette({
  open,
  onClose,
  sections,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  sections: TreeSection[];
  onPick: (href: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();

  const nodes = useMemo(() => flattenTree(sections), [sections]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = q
      ? nodes.filter((n) => `${n.label} ${n.meta ?? ''} ${n.href}`.toLowerCase().includes(q))
      : nodes.filter((n) => !n.children || n.children.length === 0).slice(0, 12);
    return matches.slice(0, 40);
  }, [nodes, query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setIndex(0);
      requestAnimationFrame(() => input.current?.focus());
    }
  }, [open]);

  useEffect(() => setIndex(0), [query]);

  if (!open) return null;

  const pick = (node: TreeNode | undefined) => {
    if (!node) return;
    onPick(node.href);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 px-3 pt-[12vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Find in the platform" className="w-full max-w-xl overflow-hidden rounded-lg border border-line bg-surface shadow-2xl">
        <div className="border-b border-line p-3">
          <input
            ref={input}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={results[index] ? `${listId}-${index}` : undefined}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setIndex((i) => Math.min(i + 1, results.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                pick(results[index]);
              } else if (e.key === 'Escape') {
                onClose();
              }
            }}
            placeholder="Partner name, QR point code, printer ID, person's email…"
            className="w-full bg-transparent px-1 py-1 text-base text-ink placeholder:text-mute/70 focus:outline-none"
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <ul id={listId} role="listbox" className="max-h-[50vh] overflow-y-auto p-1.5">
          {results.length === 0 && <li className="px-3 py-6 text-center text-sm text-mute">Nothing matches “{query}”.</li>}
          {results.map((node, i) => (
            <li
              key={node.id + node.href}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === index}
              onMouseEnter={() => setIndex(i)}
              onClick={() => pick(node)}
              className={cx('flex cursor-pointer items-center gap-3 rounded px-3 py-2 text-sm', i === index ? 'bg-amber/15 text-ink' : 'text-mute')}
            >
              {node.tone ? <StatusDot tone={node.tone} /> : <span className="w-2" aria-hidden />}
              <span className="min-w-0 flex-1 truncate text-ink">{node.label}</span>
              {node.meta && <span className="shrink-0 truncate font-mono text-[11px] text-mute">{node.meta}</span>}
            </li>
          ))}
        </ul>

        <div className="flex items-center justify-between border-t border-line px-3 py-2 text-[11px] text-mute">
          <span>↑ ↓ to move · Enter to open · Esc to close</span>
          <span className="font-mono">{results.length} shown</span>
        </div>
      </div>
    </div>
  );
}
