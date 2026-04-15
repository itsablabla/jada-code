/**
 * Shim for @tauri-apps/plugin-dialog — uses browser native dialogs.
 */

export interface OpenDialogOptions {
  multiple?: boolean;
  directory?: boolean;
  filters?: Array<{ name: string; extensions: string[] }>;
  defaultPath?: string;
  title?: string;
}

export async function open(
  options?: OpenDialogOptions,
): Promise<string | string[] | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    if (options?.multiple) input.multiple = true;
    if (options?.filters) {
      input.accept = options.filters
        .flatMap((f) => f.extensions.map((e) => `.${e}`))
        .join(",");
    }
    input.onchange = () => {
      if (!input.files || input.files.length === 0) {
        resolve(null);
        return;
      }
      if (options?.multiple) {
        resolve(Array.from(input.files).map((f) => f.name));
      } else {
        resolve(input.files[0].name);
      }
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export async function save(): Promise<string | null> {
  return null;
}
