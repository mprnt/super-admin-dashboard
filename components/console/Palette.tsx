'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { TreeNode } from '../../lib/tree.ts';
import { Modal } from '../ui/dialogs';
import { StatusDot, cx } from '../ui/primitives';

/**
 * Find anything: partners, QR points, printers, people and every page. Arrow keys
 * move, Enter opens, Escape closes. On a phone it is a full sheet.
 */
export function Palette({ open, onClose, index, onPick }: { open: boolean; onClose: () => void; index: TreeNode[]; onPick: (href: string) => void }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listId = useId();

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = q
      ? index.filter((n) => `${n.label} ${n.meta ?? ''} ${n.kind ?? ''} ${n.href}`.toLowerCase().includes(q))
      : index.filter((n) => n.kind === 'Partner' || n.kind === 'Page');
    return matches.slice(0, 40);
  }, [index, query]);

  // Reset on each opening. Setting state here, rather than in an effect, keeps the
  // list from flashing the previous search.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setQuery('');
      setActive(0);
    }
  }

  useEffect(() => setActive(0), [query]);

  const pick = (node: TreeNode | undefined) => {
    if (!node) return;
    onPick(node.href);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Find" full focusField>
      <div className="flex min-h-0 flex-col gap-3">
        <input
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((i) => Math.min(i + 1, results.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              pick(results[active]);
            }
          }}
          placeholder="A partner, QR point code, printer ID or email"
          autoComplete="off"
          spellCheck={false}
          className="h-12 w-full rounded-full border border-line bg-bg px-5 text-ink placeholder:text-mute/80 focus:border-brand-text focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-text/40"
        />

        <ul id={listId} role="listbox" aria-label="Results" className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {results.length === 0 && <li className="px-3 py-8 text-center text-sm text-mute">Nothing matches “{query}”.</li>}
          {results.map((node, i) => {
            const on = i === active;
            return (
              <li
                key={node.id + node.href}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={on}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(node)}
                className={cx('flex min-h-[52px] cursor-pointer items-center gap-3 rounded-2xl px-4 py-2 text-[15px]', on ? 'bg-brand text-brand-ink' : 'text-ink hover:bg-raised')}
              >
                {node.tone ? <StatusDot tone={on ? 'muted' : node.tone} /> : <span className="w-2.5" aria-hidden />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{node.label}</span>
                  {node.meta && <span className={cx('block truncate text-xs', on ? 'text-brand-ink/80' : 'text-mute')}>{node.meta}</span>}
                </span>
                {node.kind && <span className={cx('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium', on ? 'bg-white/15' : 'bg-raised text-mute')}>{node.kind}</span>}
              </li>
            );
          })}
        </ul>
      </div>
    </Modal>
  );
}
