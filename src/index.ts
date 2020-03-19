// import ts from 'typescript'; // used as value, passed in by tsserver at runtime
import tss from 'typescript/lib/tsserverlibrary'; // used as type only

import { makeCreate } from './create';

export = (mod: { typescript: typeof tss }) => {
  const create = makeCreate(mod);
  return { create };
};
