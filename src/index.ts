// import ts from 'typescript'; // used as value, passed in by tsserver at runtime
import tss from 'typescript/lib/tsserverlibrary'; // used as type only

import { create } from './create';

export = (mod: { typescript: typeof tss }) => {
  return { create };
};
