/**
 * Offline Queue - saves failed API actions to localStorage and retries when online
 */

export interface QueuedAction {
  id: string;
  type: 'delivery' | 'signature' | 'photos' | 'checker-toggle' | 'checker-note' | 'checker-line-note' | 'checker-pallet';
  endpoint: string;
  method: 'POST' | 'PATCH' | 'PUT';
  data: any;
  timestamp: number;
  retries: number;
}

const QUEUE_KEY = 'offline_queue';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function getQueue(): QueuedAction[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addToQueue(action: Omit<QueuedAction, 'id' | 'timestamp' | 'retries'>): void {
  const queue = getQueue();
  queue.push({
    ...action,
    id: generateId(),
    timestamp: Date.now(),
    retries: 0,
  });
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function removeFromQueue(id: string): void {
  const queue = getQueue().filter((a) => a.id !== id);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function clearQueue(): void {
  localStorage.removeItem(QUEUE_KEY);
}

export function getQueueCount(): number {
  return getQueue().length;
}

/**
 * Process all queued actions - call this when coming back online
 */
export async function processQueue(
  apiCall: (method: string, endpoint: string, data: any) => Promise<any>
): Promise<{ success: number; failed: number }> {
  const queue = getQueue();
  if (queue.length === 0) return { success: 0, failed: 0 };

  let success = 0;
  let failed = 0;

  for (const action of queue) {
    try {
      await apiCall(action.method, action.endpoint, action.data);
      removeFromQueue(action.id);
      success++;
    } catch {
      // Update retry count
      action.retries++;
      if (action.retries >= 5) {
        // Too many retries, remove from queue
        removeFromQueue(action.id);
        failed++;
      } else {
        // Update in queue with incremented retry count
        const currentQueue = getQueue();
        const idx = currentQueue.findIndex((a) => a.id === action.id);
        if (idx >= 0) {
          currentQueue[idx] = action;
          localStorage.setItem(QUEUE_KEY, JSON.stringify(currentQueue));
        }
        failed++;
      }
    }
  }

  return { success, failed };
}
