import tss from "typescript/lib/tsserverlibrary";
import { makeCreate } from './lib/create';

export = (mod: { typescript: typeof tss }) => {
  const create = makeCreate(mod);
  return { create };
};
