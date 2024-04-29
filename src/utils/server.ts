/**
 * 解析命令行参数
 * @example
 * const args = process.argv.slice(2);
 * const options = parse_argv(args);
 */
export function parse_argv<T extends Record<string, any>>(args: string[]) {
  // @ts-ignore
  const options: T = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];
    if (key.startsWith("-")) {
      const k = key.replace(/^-{1,}/, "");
      const v = (() => {
        if (value === undefined) {
          return true;
        }
        if (value.toLowerCase() === "true") {
          return true;
        }
        if (value.toLowerCase() === "false") {
          return false;
        }
        return value;
      })();
      // @ts-ignore
      options[k] = v;
    }
  }
  return options;
}
