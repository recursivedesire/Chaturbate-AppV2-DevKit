import type { Thing } from './module';
import { consume, valueFactory } from './module';

const value: Thing = { name: 'typed' };
consume(value);
valueFactory();
