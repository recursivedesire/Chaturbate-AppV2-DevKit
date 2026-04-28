export type AstNode = {
  type: string;
  id?: {name?: string};
  declarations?: Array<{id?: {name?: string}}>;
};

export type Pipeline = 'compat' | 'macro' | 'macro+compat' | 'compat+macro';

export type TransformFixtureOptions = {
  fixture: string;
  pipeline: Pipeline;
  entry?: string;
  enableAliases?: boolean;
  useProjectConfig?: boolean;
  env?: Record<string, string | undefined>;
  setup?: (workDir: string) => void;
};

export type TransformFixtureResult = {
  code: string;
  ast: any;
  sourceType: string;
  stderr: string[];
  error?: Error;
  workDir: string;
  cleanup: () => void;
};
