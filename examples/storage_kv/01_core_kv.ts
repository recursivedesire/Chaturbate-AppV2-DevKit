import {StorageKV} from '@lib/storage_kv';

import {publishExample} from '../command_system/publish_example';

const goals = new StorageKV('goal_state');

goals.set('target', 500);
goals.incr('progress', 120);
goals.incr('progress', 40);
goals.decr('progress', 10);

const target = Number(goals.get('target', 0));
const progress = Number(goals.get('progress', 0));
const remaining = Math.max(target - progress, 0);

goals.set('last_winner', 'alice');
goals.remove('last_winner');
const winnerFallback = goals.get('last_winner', 'none');

publishExample('__EXAMPLE_STORAGE_KV_01__', {
  target,
  progress,
  remaining,
  winnerFallback,
});
