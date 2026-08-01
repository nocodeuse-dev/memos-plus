export type ClipboardImageImportResult = "cancelled" | "empty" | "saved" | "failed";

export interface ClipboardImageImportOptions {
  confirmImport: () => Promise<boolean>;
  readClipboardImage: () => Promise<File | null>;
  saveConfirmedImage: (file: File) => Promise<boolean>;
}

export async function importClipboardImageWithConfirmation(options: ClipboardImageImportOptions): Promise<ClipboardImageImportResult> {
  if (!(await options.confirmImport())) {
    return "cancelled";
  }
  const image = await options.readClipboardImage();
  if (!image) {
    return "empty";
  }
  return (await options.saveConfirmedImage(image)) ? "saved" : "failed";
}
