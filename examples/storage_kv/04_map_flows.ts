import {StorageKV} from '@lib/storage_kv';

import {publishExample} from '../command_system/publish_example';

const store = new StorageKV('limitcam_access');
const map = store.map('sessions', 'username');

map.set({username: 'alice', minutes: 30});
map.set({username: 'bob', minutes: 20});

const alice = map.get('alice');

const iterUsers: string[] = [];
const iterator = map.iter();
while (iterator.next()) {
  iterUsers.push(iterator.value().username);
}

map.remove('bob');
const afterRemove = map.get('bob', 'missing');

map.clear();
const afterClear = map.get('alice', 'missing');

publishExample('__EXAMPLE_STORAGE_KV_04__', {
  aliceMinutes: alice.minutes,
  iterUsers: iterUsers.sort(),
  afterRemove,
  afterClear,
});
