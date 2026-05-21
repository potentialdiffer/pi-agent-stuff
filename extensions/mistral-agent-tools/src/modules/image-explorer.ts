import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { Image, Container, Text, Spacer, Box } from "@earendil-works/pi-tui";
import { formatImageForDisplay } from "./image-display.js";
import { GeneratedImage } from "../config/types.js";
import { getPiImagePath } from "../config/constants.js";

// ============================================================================
// Image Explorer Module
// Provides TUI for browsing and displaying images from .pi-images directory
// ============================================================================

interface ImageFileInfo {
  fileName: string;
  fullPath: string;
  mimeType: string;
  size: number;
  stats: fs.Stats;
}

/**
 * Get the .pi-images directory path
 * Uses cwd of running pi session, falls back to project dir
 */
function getImagesDirectory(): string {
  // Primary: cwd/.pi-images
  const cwdDir = path.join(process.cwd(), ".pi-images");
  if (fs.existsSync(cwdDir) && fs.readdirSync(cwdDir).length > 0) {
    return cwdDir;
  }
  
  // Fallback: project dir from module location
  const projectDir = path.resolve(__dirname, "../../.pi-images");
  if (fs.existsSync(projectDir) && fs.readdirSync(projectDir).length > 0) {
    return projectDir;
  }
  
  // Create cwd dir if nothing found
  if (!fs.existsSync(cwdDir)) {
    fs.mkdirSync(cwdDir, { recursive: true });
  }
  return cwdDir;
}

/**
 * Detect MIME type from file data
 */
function detectMimeTypeFromFile(filePath: string): string {
  try {
    const data = fs.readFileSync(filePath);
    if (data.length < 8) return "image/png";

    // PNG
    if (data[0] === 0x89 && 
        data[1] === 0x50 && 
        data[2] === 0x4E && 
        data[3] === 0x47) {
      return "image/png";
    }

    // JPEG
    if (data[0] === 0xFF && data[1] === 0xD8 && data[2] === 0xFF) {
      return "image/jpeg";
    }

    // GIF
    if (data.length >= 6) {
      const sig = data.slice(0, 6).toString("ascii");
      if (sig === "GIF87a" || sig === "GIF89a") {
        return "image/gif";
      }
    }

    // WebP
    if (data.length >= 12) {
      const riff = data.slice(0, 4).toString("ascii");
      const webp = data.slice(8, 12).toString("ascii");
      if (riff === "RIFF" && webp === "WEBP") {
        return "image/webp";
      }
    }

    return "image/png"; // Default
  } catch {
    return "image/png";
  }
}

/**
 * Get list of image files from .pi-images directory
 */
export function getImageFiles(): ImageFileInfo[] {
  const dirPath = getImagesDirectory();
  
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  const files = fs.readdirSync(dirPath);
  const imageFiles: ImageFileInfo[] = [];

  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    try {
      const stats = fs.statSync(fullPath);
      if (stats.isFile()) {
        const mimeType = detectMimeTypeFromFile(fullPath);
        if (mimeType.startsWith("image/")) {
          imageFiles.push({
            fileName: file,
            fullPath,
            mimeType,
            size: stats.size,
            stats,
          });
        }
      }
    } catch {
      // Skip files that can't be read
    }
  }

  // Sort by modification time, newest first
  return imageFiles.sort((a, b) => b.stats.mtimeMs - a.stats.mtimeMs);
}

/**
 * Load an image file as GeneratedImage
 */
function loadImageFile(fileInfo: ImageFileInfo): GeneratedImage {
  const data = fs.readFileSync(fileInfo.fullPath);
  return {
    data,
    mimeType: fileInfo.mimeType,
    fileName: fileInfo.fileName,
    size: data.length,
  };
}

/**
 * Create a text component with styling
 */
function createText(text: string, theme: any, style: "normal" | "dim" | "success" | "error" | "muted" = "normal"): Text {
  const styleMap: Record<string, string> = {
    normal: "fg",
    dim: "dim",
    success: "success",
    error: "error",
    muted: "muted",
  };
  const colorKey = styleMap[style] || "fg";
  return new Text(theme[colorKey](text), 1, 0);
}

/**
 * Create the image explorer TUI component
 */
export class ImageExplorer {
  private images: ImageFileInfo[];
  private _selectedIndex: number;
  private _selectedImage: GeneratedImage | null;

  constructor(images: ImageFileInfo[] = []) {
    this.images = images;
    this._selectedIndex = 0;
    this._selectedImage = null;
  }

  /**
   * Handle key press for navigation
   * Returns true if selection changed or image was selected
   */
  handleKey(key: string): { selectionChanged: boolean; imageSelected: boolean; closed: boolean } {
    if (this.images.length === 0) {
      return { selectionChanged: false, imageSelected: false, closed: false };
    }

    const oldIndex = this._selectedIndex;
    let imageSelected = false;
    let closed = false;

    switch (key) {
      case "j":
      case "ArrowDown":
        this._selectedIndex = Math.min(this._selectedIndex + 1, this.images.length - 1);
        break;
      case "k":
      case "ArrowUp":
        this._selectedIndex = Math.max(this._selectedIndex - 1, 0);
        break;
      case "Enter":
      case " ":
        this.selectImage();
        imageSelected = true;
        break;
      case "q":
      case "Escape":
      case "x":
        closed = true;
        break;
      case "g":
        // Go to top
        this._selectedIndex = 0;
        break;
      case "G":
        // Go to bottom
        this._selectedIndex = this.images.length - 1;
        break;
    }

    return {
      selectionChanged: oldIndex !== this._selectedIndex,
      imageSelected,
      closed
    };
  }

  /**
   * Select the currently highlighted image
   */
  selectImage(): GeneratedImage | null {
    if (this._selectedIndex >= 0 && this._selectedIndex < this.images.length) {
      const fileInfo = this.images[this._selectedIndex];
      this._selectedImage = loadImageFile(fileInfo);
      return this._selectedImage;
    }
    return null;
  }

  /**
   * Render the image explorer
   */
  render(theme: any, width: number, height: number): Container {
    const container = new Container();

    // Title
    container.addChild(new Text(theme.fg("bold", "🖼️  Image Explorer"), 1, 0));
    container.addChild(new Spacer(1));

    if (this.images.length === 0) {
      container.addChild(new Text(theme.fg("muted", "No images found in .pi-images directory"), 1, 0));
      container.addChild(new Spacer(1));
      container.addChild(new Text(theme.fg("dim", "Press any key to exit"), 1, 0));
      return container;
    }

    // Instructions
    container.addChild(new Text(theme.fg("dim", "↑/k: Up  ↓/j: Down  Enter: Select  q: Quit"), 1, 0));
    container.addChild(new Spacer(1));

    // Image list
    const listWidth = Math.min(width - 4, 80);
    const maxVisibleItems = Math.max(3, Math.floor((height - 8) / 1));
    const startIndex = Math.max(0, this._selectedIndex - Math.floor(maxVisibleItems / 2));
    const endIndex = Math.min(this.images.length, startIndex + maxVisibleItems);

    for (let i = startIndex; i < endIndex; i++) {
      const fileInfo = this.images[i];
      const isSelected = i === this._selectedIndex;
      const prefix = isSelected ? "➤ " : "  ";
      const sizeKb = Math.round(fileInfo.size / 1024);
      const date = fileInfo.stats.mtime.toLocaleDateString();
      const time = fileInfo.stats.mtime.toLocaleTimeString();
      
      const displayName = fileInfo.fileName.length > 40 
        ? fileInfo.fileName.substring(0, 37) + "..." 
        : fileInfo.fileName;
      
      const line = `${prefix}${displayName.padEnd(40)} ${sizeKb}KB  ${date} ${time}`;
      const textColor = isSelected ? "fg" : "dim";
      container.addChild(new Text(theme[textColor](line), 1, 0));
    }

    container.addChild(new Spacer(1));

    // Display selected image preview if available
    if (this.selectedImage) {
      try {
        const displayResult = formatImageForDisplay(this.selectedImage, {
          includeText: false,
          saveToPiImages: false,
        });

        const imageItem = displayResult.content.find(c => c.type === "image");
        if (imageItem && imageItem.data && imageItem.mimeType) {
          const imageTheme = {
            fallbackColor: (str: string) => theme.fg("muted", str)
          };
          
          const imageComponent = new Image(
            imageItem.data,
            imageItem.mimeType,
            imageTheme,
            {
              maxWidthCells: Math.min(width - 4, 60),
              maxHeightCells: Math.min(height - 10, 20)
            }
          );
          container.addChild(imageComponent);
          container.addChild(new Spacer(1));
          
          // Image info
          const info = `Selected: ${this.selectedImage.fileName} (${this.selectedImage.mimeType}, ${Math.round(this.selectedImage.size / 1024)}KB)`;
          container.addChild(new Text(theme.fg("success", info), 1, 0));
        }
      } catch (error) {
        container.addChild(new Text(theme.fg("error", "Error loading image preview"), 1, 0));
      }
    } else {
      // Show info about selected file
      if (this._selectedIndex >= 0 && this._selectedIndex < this.images.length) {
        const fileInfo = this.images[this._selectedIndex];
        const info = `Selected: ${fileInfo.fileName} (${fileInfo.mimeType}, ${Math.round(fileInfo.size / 1024)}KB)`;
        container.addChild(new Text(theme.fg("muted", info), 1, 0));
      }
    }

    return container;
  }

  /**
   * Get the current selection state
   */
  getState(): {
    images: ImageFileInfo[];
    selectedIndex: number;
    selectedImage: GeneratedImage | null;
  } {
    return {
      images: this.images,
      selectedIndex: this._selectedIndex,
      selectedImage: this._selectedImage,
    };
  }

  /**
   * Get selected index
   */
  get selectedIndex(): number {
    return this._selectedIndex;
  }

  /**
   * Get selected image
   */
  get selectedImage(): GeneratedImage | null {
    return this._selectedImage;
  }

  /**
   * Set images
   */
  setImages(images: ImageFileInfo[]): void {
    this.images = images;
    this._selectedIndex = Math.min(this._selectedIndex, images.length - 1);
    if (this._selectedIndex < 0) this._selectedIndex = 0;
  }
}

/**
 * Create an image explorer component
 */
export function createImageExplorer(images?: ImageFileInfo[]): ImageExplorer {
  const imageFiles = images || getImageFiles();
  return new ImageExplorer(imageFiles);
}

/**
 * Refresh the image list in an existing explorer
 */
export function refreshImageExplorer(explorer: ImageExplorer): ImageExplorer {
  const images = getImageFiles();
  explorer = new ImageExplorer(images, {
    onSelect: explorer.onSelect,
    onClose: explorer.onClose,
  });
  return explorer;
}
