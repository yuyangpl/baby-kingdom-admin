import { useFeedStore } from '../stores/feed';
import { useQueueStore } from '../stores/queue';
import { useNotificationStore } from '../stores/notification';

/**
 * Register all Socket.io event listeners.
 * Called once after socket connects.
 */
export function registerListeners(socket) {
  const feedStore = useFeedStore();
  const queueStore = useQueueStore();
  const notify = useNotificationStore();

  // --- Feed events ---
  socket.on('feed:new', (data) => {
    feedStore.incrementNewCount();
    notify.add({ type: 'info', title: 'New Feed', message: `New draft generated: ${data?.feedId || ''}` });
  });

  socket.on('feed:statusChanged', (data) => {
    feedStore.updateFeedStatus(data.feedId, data.status);
    const typeMap = { approved: 'success', rejected: 'warning', posted: 'success', failed: 'error' };
    notify.add({
      type: typeMap[data.status] || 'info',
      title: 'Feed Updated',
      message: `Feed ${data.status}`,
    });
  });

  socket.on('feed:claimed', (data) => {
    feedStore.updateFeedClaim(data.feedId, data.claimedBy);
  });

  socket.on('feed:unclaimed', (data) => {
    feedStore.updateFeedClaim(data.feedId, null);
  });

  // --- Queue events ---
  socket.on('queue:status', (data) => {
    queueStore.updateQueueStatus(data.name, data.status);
  });

  socket.on('queue:progress', (data) => {
    notify.add({ type: 'info', title: `${data.queueName}`, message: data.message || 'Processing...' });
  });

  // --- Scanner events ---
  socket.on('scanner:result', (data) => {
    notify.add({
      type: 'success',
      title: 'Scan Complete',
      message: `Scanned ${data.scanned || 0}, hits ${data.hits || 0}, feeds ${data.feeds || 0}`,
    });
  });

  // --- Trends events ---
  socket.on('trends:new', (data) => {
    notify.add({
      type: 'info',
      title: 'New Trends',
      message: `${data.count || 0} new trends pulled`,
    });
  });
}
