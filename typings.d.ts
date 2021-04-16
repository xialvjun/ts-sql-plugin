declare module "await-spawn" {
  export default function (cmd: string, args: string[], opts?: object): Promise<Buffer>;
}
