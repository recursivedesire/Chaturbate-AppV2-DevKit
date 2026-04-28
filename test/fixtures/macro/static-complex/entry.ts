import { VALUE } from '@lib/macro';

const userName = 'Nova';
const payload = {user: {name: userName}, nums: [1, 2, 3]};
const part = 'ready';
const output = VALUE(() => `${payload.user.name}:${payload.nums.join(',')}:state-${part}`);
(globalThis as any).__VALUE_STATIC_COMPLEX__ = output;
