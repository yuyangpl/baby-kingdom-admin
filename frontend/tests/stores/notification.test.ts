import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useNotificationStore } from '@/stores/notification';

vi.mock('element-plus', () => ({
  ElNotification: vi.fn(),
}));

describe('Notification Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('add creates a notification item with correct fields', () => {
    const store = useNotificationStore();
    store.add({ type: 'success', title: 'Done', message: 'All good' });
    expect(store.items).toHaveLength(1);
    expect(store.items[0]).toMatchObject({
      type: 'success',
      title: 'Done',
      message: 'All good',
      read: false,
    });
    expect(store.items[0].id).toBeTruthy();
  });

  it('unreadCount counts only unread items', () => {
    const store = useNotificationStore();
    store.add({ type: 'info', title: 'A', message: 'msg1' });
    store.add({ type: 'info', title: 'B', message: 'msg2' });
    store.items[0].read = true;
    expect(store.unreadCount).toBe(1);
  });

  it('markAllRead marks all items as read', () => {
    const store = useNotificationStore();
    store.add({ type: 'info', title: 'A', message: 'msg1' });
    store.add({ type: 'info', title: 'B', message: 'msg2' });
    store.markAllRead();
    expect(store.unreadCount).toBe(0);
    store.items.forEach(n => expect(n.read).toBe(true));
  });

  it('drops oldest item when more than 50 items are added', () => {
    const store = useNotificationStore();
    // Add 50 items
    for (let i = 0; i < 50; i++) {
      store.add({ type: 'info', title: `Title ${i}`, message: `msg ${i}` });
    }
    expect(store.items).toHaveLength(50);
    // The oldest is at the end (unshift adds to front)
    const oldestTitle = store.items[49].title;
    // Add one more to trigger the pop
    store.add({ type: 'info', title: 'New Item', message: 'new' });
    expect(store.items).toHaveLength(50);
    // The oldest should have been removed
    expect(store.items.find(n => n.title === oldestTitle)).toBeUndefined();
    // The newest should be at the front
    expect(store.items[0].title).toBe('New Item');
  });
});
