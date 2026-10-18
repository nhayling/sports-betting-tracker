import { useEffect, useRef, useState } from 'react';
import { markNotificationsRead, type NotificationItem } from '../api';
import { relativeTime } from '../format';
import { Icon } from './Icon';

/**
 * Bell + dropdown feed. New items stay marked while the panel is open and are
 * marked read when it closes, so opening it never wipes what you came to see.
 * An item about a bet opens that bet.
 */
export function Notifications({
  feed,
  onRead,
  onOpenBet,
  canOpen,
}: {
  feed: { unread: number; items: NotificationItem[] };
  onRead: () => void;
  onOpenBet: (couponId: string) => void;
  /** False for a bet this app can no longer show, so its item stays plain text instead of a dead link. */
  canOpen: (couponId: string) => boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const bell = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  // The listeners below outlive renders; they read the latest count from here.
  const unread = useRef(feed.unread);
  unread.current = feed.unread;

  const close = (refocus = false) => {
    setOpen(false);
    if (refocus) bell.current?.focus();
    if (unread.current > 0) void markNotificationsRead().then(onRead, () => {});
  };
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    const outside = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && closeRef.current();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current(true);
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div className="notes" ref={ref}>
      <button
        ref={bell}
        className="bell"
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        aria-label={`Notifications${feed.unread ? `, ${feed.unread} unread` : ''}`}
      >
        <Icon name="bell" />
        {feed.unread > 0 && <span className="bell-count">{feed.unread > 99 ? '99+' : feed.unread}</span>}
      </button>
      {open && (
        <div className="notes-panel" role="dialog" aria-label="Notifications" tabIndex={-1} ref={panel}>
          {feed.items.length === 0 ? (
            <p className="muted small notes-empty">No notifications yet. Pick hits, misses and bets that need a sync show up here.</p>
          ) : (
            <ul>
              {feed.items.map((n) => {
                const body = (
                  <>
                    <div className="note-title">
                      {!n.readAt && <span className="sr-only">New: </span>}
                      {n.title}
                    </div>
                    <div className="note-body muted">{n.body}</div>
                    <div className="note-time muted">{relativeTime(n.createdAt)}</div>
                  </>
                );
                return (
                  <li key={n.id} className={`note note-${n.kind.toLowerCase()} ${n.readAt ? '' : 'unread'}`}>
                    {n.couponId && canOpen(n.couponId) ? (
                      <button
                        className="note-link"
                        onClick={() => {
                          close();
                          onOpenBet(n.couponId!);
                        }}
                      >
                        {body}
                        <span className="note-go">
                          Show bet <Icon name="chevron" />
                        </span>
                      </button>
                    ) : (
                      body
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
