import type {
  AnyBuiltGroup,
  BuiltNodeFrom,
  CommandEngine,
  EngineConfig,
  GroupBuilder,
} from '../types';

import {attachIntrospection} from './introspection';
import {buildCliRuntime} from './engine';

function isBuiltGroup(value: unknown): value is AnyBuiltGroup {
  return !!value && typeof value === 'object' && (value as {type?: unknown}).type === 'group';
}

export function buildCli<TRoot extends AnyBuiltGroup | GroupBuilder<any>>(root: TRoot, config?: EngineConfig): CommandEngine<BuiltNodeFrom<TRoot> & AnyBuiltGroup> {
  var builtRoot = isBuiltGroup(root) ? root : (root as GroupBuilder<any>).build();
  if (builtRoot.type !== 'group') {
    throw new Error('buildCli() expects a built group or group builder.');
  }

  return attachIntrospection(buildCliRuntime(builtRoot as BuiltNodeFrom<TRoot> & AnyBuiltGroup, config)) as CommandEngine<BuiltNodeFrom<TRoot> & AnyBuiltGroup>;
}
