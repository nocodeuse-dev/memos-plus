export type UserAuthorizedImageAction = "paste" | "file-picker" | "drop" | "confirmed-clipboard-import";

export type AuthorizedImageSaveResult =
  | { status: "saved"; fileName: string }
  | { status: "unauthorized" }
  | { status: "failed"; error?: unknown };

export interface AuthorizedImageSaveOptions {
  saveAttachment: (buffer: ArrayBuffer, extension: string) => Promise<string>;
  insertEmbed: (fileName: string) => void;
}

export function isUserAuthorizedImageAction(action: string): action is UserAuthorizedImageAction {
  return action === "paste" || action === "file-picker" || action === "drop" || action === "confirmed-clipboard-import";
}

export async function saveUserAuthorizedImage(
  file: File,
  action: string,
  options: AuthorizedImageSaveOptions
): Promise<AuthorizedImageSaveResult> {
  if (!isUserAuthorizedImageAction(action)) {
    return { status: "unauthorized" };
  }
  try {
    const extension = file.name.split(".").pop() || "png";
    const buffer = await file.arrayBuffer();
    const path = (await options.saveAttachment(buffer, extension)).trim();
    const fileName = path.split("/").pop()?.trim() ?? "";
    if (!fileName) {
      return { status: "failed" };
    }
    options.insertEmbed(fileName);
    return { status: "saved", fileName };
  } catch (error) {
    return { status: "failed", error };
  }
}
