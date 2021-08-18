import crypto from 'crypto';

const sqlCache = new Set();

export const addToSqlCache = (command: string, command_args: string[]) => {
  return sqlCache.add(
    crypto.createHash('sha1').update(`${command}${command_args.join()}`).digest('hex')
  );
};

export const existsInSqlCache = (command: string, command_args: string[]) => {
  return sqlCache.has(
    crypto.createHash('sha1').update(`${command}${command_args.join()}`).digest('hex')
  );
};
