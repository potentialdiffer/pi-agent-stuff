import { GeneratedImage } from "../config/types.js";
import { DEFAULT_CONFIG, getPiImagePath } from "../config/constants.js";
import * as fs from "node:fs";
import * as path from "node:path";
import { Image, type Component } from "@earendil-works/pi-tui";

// ============================================================================
// Image Display Module
// Handles formatting images for display in pi's TUI
// ============================================================================

interface ImageDisplayResult {
  content: Array<{
    type: "text" | "image";
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  details: {
    fileName: string;
    fileType: string;
    size: number;
    width?: number;
    height?: number;
    savedPath?: string;
    savedPaths?: string[];
  };
}

/**
 * Format image for display in pi
 * Converts to base64 and creates proper content structure
 * Saves image to .pi-images directory
 */
export function formatImageForDisplay(
  image: GeneratedImage,
  options: {
    includeText?: boolean;
    textPrefix?: string;
    saveToPiImages?: boolean;
  } = {}
): ImageDisplayResult {
  const { includeText = true, textPrefix = "Generated image:", saveToPiImages = true } = options;

  // Convert to base64
  const base64Data = image.data.toString("base64");

  // Save to .pi-images directory
  let savedPath: string | undefined;
  if (saveToPiImages) {
    try {
      const piImagePath = getPiImagePath(image.fileName);
      fs.writeFileSync(piImagePath, image.data);
      savedPath = piImagePath;
    } catch (error) {
      console.error("[Mistral Image] Failed to save image to .pi-images:", error);
    }
  }

  const content: ImageDisplayResult["content"] = [];

  // Add descriptive text
  if (includeText) {
    content.push({
      type: "text",
      text: textPrefix,
    });
  }

  // Add image
  content.push({
    type: "image",
    data: base64Data,
    mimeType: image.mimeType,
  });

  // Extract dimensions if possible
  const dimensions = extractImageDimensions(image.data, image.mimeType);

  return {
    content,
    details: {
      fileName: image.fileName,
      fileType: image.mimeType.split("/")[1] || "png",
      size: image.size,
      savedPath,
      ...dimensions,
    },
  };
}

/**
 * Format multiple images for display
 * Saves images to .pi-images directory
 */
export function formatImagesForDisplay(
  images: GeneratedImage[],
  options: {
    includeText?: boolean;
    textPrefix?: string;
    saveToPiImages?: boolean;
  } = {}
): ImageDisplayResult {
  const { includeText = true, textPrefix = "Generated images:", saveToPiImages = true } = options;

  const content: ImageDisplayResult["content"] = [];

  if (includeText) {
    content.push({
      type: "text",
      text: textPrefix,
    });
  }

  const savedPaths: string[] = [];

  for (const image of images) {
    const base64Data = image.data.toString("base64");

    // Save to .pi-images directory with correct extension based on MIME type
    if (saveToPiImages) {
      try {
        const correctFileName = getFileNameWithCorrectExtension(image.fileName, image.mimeType);
        const piImagePath = getPiImagePath(correctFileName);
        fs.writeFileSync(piImagePath, image.data);
        savedPaths.push(piImagePath);
      } catch (error) {
        console.error("[Mistral Image] Failed to save image to .pi-images:", error);
      }
    }

    content.push({
      type: "image",
      data: base64Data,
      mimeType: image.mimeType,
    });
  }

  // For multiple images, aggregate details
  const totalSize = images.reduce((sum, img) => sum + img.size, 0);
  const fileTypes = [...new Set(images.map(img => img.mimeType.split("/")[1] || "png"))];

  return {
    content,
    details: {
      fileName: `${images.length}-images`,
      fileType: fileTypes.join(","),
      size: totalSize,
      savedPaths,
    },
  };
}

/**
 * Extract image dimensions from binary data
 * Supports PNG, JPEG, GIF, WebP
 */
function extractImageDimensions(data: Buffer, mimeType?: string): { width?: number; height?: number } {
  if (data.length < 8) {
    return {};
  }

  // Use MIME type as hint for faster detection
  if (mimeType) {
    if (mimeType === "image/png") {
      if (data.length >= 24 &&
          data[0] === 0x89 &&
          data[1] === 0x50 &&
          data[2] === 0x4E &&
          data[3] === 0x47) {
        const width = (data[16] << 24) | (data[17] << 16) | (data[18] << 8) | data[19];
        const height = (data[20] << 24) | (data[21] << 16) | (data[22] << 8) | data[23];
        return { width, height };
      }
      return {};
    }

    if (mimeType === "image/jpeg") {
      return extractJpegDimensions(data);
    }

    if (mimeType === "image/gif") {
      return extractGifDimensions(data);
    }

    if (mimeType === "image/webp") {
      return extractWebpDimensions(data);
    }
  }

  // Fallback: detect by magic bytes
  // PNG
  if (data.length >= 24 &&
      data[0] === 0x89 &&
      data[1] === 0x50 &&
      data[2] === 0x4E &&
      data[3] === 0x47) {
    const width = (data[16] << 24) | (data[17] << 16) | (data[18] << 8) | data[19];
    const height = (data[20] << 24) | (data[21] << 16) | (data[22] << 8) | data[23];
    return { width, height };
  }

  // JPEG
  if (data.length >= 2 && data[0] === 0xFF && data[1] === 0xD8) {
    return extractJpegDimensions(data);
  }

  // GIF
  if (data.length >= 10 &&
      (data.slice(0, 6).toString("ascii") === "GIF87a" ||
       data.slice(0, 6).toString("ascii") === "GIF89a")) {
    return extractGifDimensions(data);
  }

  // WebP
  if (data.length >= 12 &&
      data.slice(0, 4).toString("ascii") === "RIFF" &&
      data.slice(8, 12).toString("ascii") === "WEBP") {
    return extractWebpDimensions(data);
  }

  return {};
}

function extractJpegDimensions(data: Buffer): { width?: number; height?: number } {
  try {
    let offset = 2;
    while (offset < data.length - 9) {
      if (data[offset] !== 0xFF) {
        offset++;
        continue;
      }
      const marker = data[offset + 1];
      if (marker >= 0xC0 && marker <= 0xC2) {
        const height = data.readUInt16BE(offset + 5);
        const width = data.readUInt16BE(offset + 7);
        return { width, height };
      }
      if (offset + 3 >= data.length) {
        return {};
      }
      const length = data.readUInt16BE(offset + 2);
      if (length < 2) {
        return {};
      }
      offset += 2 + length;
    }
  } catch {
    return {};
  }
  return {};
}

function extractGifDimensions(data: Buffer): { width?: number; height?: number } {
  try {
    if (data.length < 10) return {};
    const width = data.readUInt16LE(6);
    const height = data.readUInt16LE(8);
    return { width, height };
  } catch {
    return {};
  }
}

function extractWebpDimensions(data: Buffer): { width?: number; height?: number } {
  try {
    if (data.length < 30) return {};
    const chunk = data.slice(12, 16).toString("ascii");

    if (chunk === "VP8 ") {
      if (data.length < 30) return {};
      const width = (data[26] | (data[27] << 8)) & 0x3FFF;
      const height = (data[28] | (data[29] << 8)) & 0x3FFF;
      return { width, height };
    }
    else if (chunk === "VP8L") {
      if (data.length < 25) return {};
      const bits = data.readUInt32LE(21);
      const width = (bits & 0x3FFF) + 1;
      const height = ((bits >> 14) & 0x3FFF) + 1;
      return { width, height };
    }
    else if (chunk === "VP8X") {
      if (data.length < 30) return {};
      const width = (data[24] | (data[25] << 8) | (data[26] << 16)) + 1;
      const height = (data[27] | (data[28] << 8) | (data[29] << 16)) + 1;
      return { width, height };
    }
  } catch {
    return {};
  }
  return {};
}

/**
 * Resize image data (placeholder - actual resizing would require image processing library)
 * For now, just returns the original image with a warning if too large
 */
export function checkImageSize(
  image: GeneratedImage,
  maxWidth: number = DEFAULT_CONFIG.MAX_DISPLAY_WIDTH,
  maxHeight: number = DEFAULT_CONFIG.MAX_DISPLAY_HEIGHT
): {
  needsResize: boolean;
  image: GeneratedImage;
  warning?: string;
} {
  const dimensions = extractImageDimensions(image.data, image.mimeType);
  const needsResize =
    (dimensions.width && dimensions.width > maxWidth) ||
    (dimensions.height && dimensions.height > maxHeight);

  if (needsResize) {
    return {
      needsResize: true,
      image,
      warning: `Image dimensions (${dimensions.width}x${dimensions.height}) exceed display limits (${maxWidth}x${maxHeight}). Consider generating a smaller image.`,
    };
  }

  return { needsResize: false, image };
}

/**
 * Create a text summary of the image
 */
export function createImageSummary(
  image: GeneratedImage,
  prompt: string
): string {
  const dimensions = extractImageDimensions(image.data, image.mimeType);
  const sizeKb = Math.round(image.size / 1024);

  const dimensionStr = dimensions.width && dimensions.height
    ? `${dimensions.width}x${dimensions.height}`
    : "unknown";

  return `Image generated: ${prompt.substring(0, 50)}${prompt.length > 50 ? "..." : ""} (${dimensionStr}, ${sizeKb}KB, ${image.mimeType})`;
}

/**
 * Get filename with correct extension based on MIME type
 */
function getFileNameWithCorrectExtension(fileName: string, mimeType: string): string {
  const extensionMap: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
  };
  
  const currentExtension = path.extname(fileName);
  const targetExtension = extensionMap[mimeType] || ".png";
  
  if (currentExtension.toLowerCase() === targetExtension.toLowerCase()) {
    return fileName;
  }
  
  return fileName.replace(currentExtension, targetExtension);
}

/**
 * Validate image for display
 */
export function validateImageForDisplay(image: GeneratedImage): { 
  valid: boolean; 
  error?: string; 
} {
  // Check size
  if (image.size > DEFAULT_CONFIG.MAX_IMAGE_SIZE_BYTES) {
    return {
      valid: false,
      error: `Image too large: ${Math.round(image.size / 1024 / 1024)}MB > ${Math.round(DEFAULT_CONFIG.MAX_IMAGE_SIZE_BYTES / 1024 / 1024)}MB`,
    };
  }

  // Check data
  if (image.data.length === 0) {
    return { valid: false, error: "Empty image data" };
  }

  // Check MIME type
  if (!image.mimeType.startsWith("image/")) {
    return { valid: false, error: `Invalid MIME type: ${image.mimeType}` };
  }

  return { valid: true };
}

// ============================================================================
// Image Preview Component
// Creates a small preview component for SelectList
// ============================================================================

/**
 * Create a preview component for an image
 * Takes image data and displays it in a small size
 */
export function createImagePreview(
  image: GeneratedImage,
  theme: any,
  options: { maxWidthCells?: number; maxHeightCells?: number } = {}
): Component {
  const { maxWidthCells = 20, maxHeightCells = 10 } = options;

  // Convert Buffer to base64
  const base64Data = image.data.toString("base64");

  const previewImage = new Image(
    base64Data,
    image.mimeType,
    {
      fallbackColor: (str: string) => theme.fg("muted", str),
    },
    {
      maxWidthCells,
      maxHeightCells,
    }
  );

  return previewImage;
}

/**
 * Create a preview component from a file path
 * Reads the file and creates a preview
 */
export function createImagePreviewFromPath(
  filePath: string,
  mimeType: string,
  theme: any,
  options: { maxWidthCells?: number; maxHeightCells?: number } = {}
): Component {
  try {
    const data = fs.readFileSync(filePath);
    const image: GeneratedImage = {
      data,
      mimeType,
      fileName: path.basename(filePath),
      size: fs.statSync(filePath).size,
    };
    return createImagePreview(image, theme, options);
  } catch (error) {
    // Return text component with error message
    const fileName = path.basename(filePath);
    return {
      render: (w: number) => [
        theme.fg("error", `Preview error: ${fileName}`),
        theme.fg("dim", `Error: ${error}`),
      ],
      invalidate: () => {},
    };
  }
}
