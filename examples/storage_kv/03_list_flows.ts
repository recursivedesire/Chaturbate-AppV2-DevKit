import {StorageKV} from '@lib/storage_kv';

import {publishExample} from '../command_system/publish_example';

const store = new StorageKV('reminder_queue');
const list = store.list('entries', true);

list.add({id: 1, text: 'Hydrate reminder'});
list.add({id: 2, text: 'Stretch reminder'});
list.add({id: 3, text: 'Vote reminder'});

list.remove(1);
const beforeDefrag = list.getAll().map((item) => item.id);

list.defrag();
const afterDefrag = list.getAll().map((item) => item.id);

const iterIds: number[] = [];
const iterator = list.iter();
while (iterator.next()) {
  iterIds.push(iterator.value().id);
}

publishExample('__EXAMPLE_STORAGE_KV_03__', {
  beforeDefrag,
  afterDefrag,
  iterIds,
});
