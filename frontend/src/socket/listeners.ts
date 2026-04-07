import type { Socket } from 'socket.io-client';
import { useFeedStore } from '../stores/feed';
import { useQueueStore } from '../stores/queue';
import { useNotificationStore } from '../stores/notification';

/**
 * Register all Socket.io event listeners.
 * Called once after socket connects.
 */
export function registerListeners(socket: Socket): void {
  const feedStore = useFeedStore();
  const queueStore = useQueueStore();
  const notify = useNotificationStore();

  // --- Feed events ---
  socket.on('feed:new', (data: { feedId?: string }) => {
    feedStore.incrementNewCount();
    notify.add({ type: 'info', title: 'New Feed', message: `New draft generated: ${data?.feedId || ''}` });
  });

  socket.on('feed:statusChanged', (data: { feedId: string; status: string }) => {
    feedStore.updateFeedStatus(data.feedId, data.status);
    const typeMap: Record<string, 'success' | 'warning' | 'error' | 'info'> = {
      approved: 'success',
      rejected: 'warning',
      posted: 'success',
      failed: 'error',
    };
    notify.add({
      type: typeMap[data.status] || 'info',
      title: 'Feed Updated',
      message: `Feed ${data.status}`,
    });
  });

  socket.on('feed:claimed', (data: { feedId: string; claimedBy: string }) => {
    feedStore.updateFeedClaim(data.feedId, data.claimedBy);
  });

  socket.on('feed:unclaimed', (data: { feedId: string }) => {
    feedStore.updateFeedClaim(data.feedId, null);
  });

  // --- Queue events ---
  socket.on('queue:status', (data: { name: string; status: string }) => {
    queueStore.updateQueueStatus(data.name, data.status);
  });

  socket.on('queue:progress', (data: { queueName: string; message?: string }) => {
    notify.add({ type: 'info', title: `${data.queueName}`, message: data.message || 'Processing...' });
  });

  // --- Scanner events ---
  socket.on('scanner:result', (data: { scanned?: number; hits?: number; feeds?: number }) => {
    notify.add({
      type: 'success',
      title: 'Scan Complete',
      message: `Scanned ${data.scanned || 0}, hits ${data.hits || 0}, feeds ${data.feeds || 0}`,
    });
  });

  // --- Trends events ---
  socket.on('trends:new', (data: { count?: number }) => {
    notify.add({
      type: 'info',
      title: 'New Trends',
      message: `${data.count || 0} new trends pulled`,
    });
  });
}
