import {publishExample, readExample} from './publish_example';

const next = readExample('__EXAMPLE_COMMAND_SYSTEM_07_SIDE_EFFECT__', 0) + 1;
publishExample('__EXAMPLE_COMMAND_SYSTEM_07_SIDE_EFFECT__', next);
