import { describe, expect, it, vi } from "vitest";
import { importClipboardImageWithConfirmation } from "../src/clipboardImageImport";
import { saveUserAuthorizedImage } from "../src/imageSaveAuthorization";

function imageFile(name = "selected.png"): File {
  return {
    name,
    type: "image/png",
    arrayBuffer: vi.fn(async () => new ArrayBuffer(4))
  } as unknown as File;
}

describe("image save authorization", () => {
  it("keeps manual image paste saving and link insertion working", async () => {
    const saveAttachment = vi.fn(async () => "attachments/pasted.png");
    const insertEmbed = vi.fn();

    const result = await saveUserAuthorizedImage(imageFile("pasted.png"), "paste", { saveAttachment, insertEmbed });

    expect(result).toEqual({ status: "saved", fileName: "pasted.png" });
    expect(saveAttachment).toHaveBeenCalledOnce();
    expect(insertEmbed).toHaveBeenCalledWith("pasted.png");
  });

  it("keeps manually selected image saving working", async () => {
    const saveAttachment = vi.fn(async () => "attachments/selected.png");
    const insertEmbed = vi.fn();

    const result = await saveUserAuthorizedImage(imageFile(), "file-picker", { saveAttachment, insertEmbed });

    expect(result.status).toBe("saved");
    expect(saveAttachment).toHaveBeenCalledOnce();
    expect(insertEmbed).toHaveBeenCalledWith("selected.png");
  });

  it("rejects automatic image saving before creating a file or link", async () => {
    const saveAttachment = vi.fn(async () => "attachments/automatic.png");
    const insertEmbed = vi.fn();

    const result = await saveUserAuthorizedImage(imageFile(), "automatic", { saveAttachment, insertEmbed });

    expect(result).toEqual({ status: "unauthorized" });
    expect(saveAttachment).not.toHaveBeenCalled();
    expect(insertEmbed).not.toHaveBeenCalled();
  });

  it("does not insert an invalid link when saving fails", async () => {
    const insertEmbed = vi.fn();

    const result = await saveUserAuthorizedImage(imageFile(), "paste", {
      saveAttachment: async () => {
        throw new Error("disk full");
      },
      insertEmbed
    });

    expect(result.status).toBe("failed");
    expect(insertEmbed).not.toHaveBeenCalled();
  });

  it("does not read, create, or insert anything when clipboard image import is cancelled", async () => {
    const readClipboardImage = vi.fn(async () => imageFile());
    const saveConfirmedImage = vi.fn(async () => true);

    const result = await importClipboardImageWithConfirmation({
      confirmImport: async () => false,
      readClipboardImage,
      saveConfirmedImage
    });

    expect(result).toBe("cancelled");
    expect(readClipboardImage).not.toHaveBeenCalled();
    expect(saveConfirmedImage).not.toHaveBeenCalled();
  });

  it("reads and saves only after explicit clipboard import confirmation", async () => {
    const order: string[] = [];

    const result = await importClipboardImageWithConfirmation({
      confirmImport: async () => {
        order.push("confirm");
        return true;
      },
      readClipboardImage: async () => {
        order.push("read");
        return imageFile("clipboard.png");
      },
      saveConfirmedImage: async () => {
        order.push("save");
        return true;
      }
    });

    expect(result).toBe("saved");
    expect(order).toEqual(["confirm", "read", "save"]);
  });
});
