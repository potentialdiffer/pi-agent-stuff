import type { ExtensionAPI, ExtensionCommandContext, Theme } from "@earendil-works/pi-coding-agent";
import { SelectList, type SelectItem, type SelectListTheme, Image, type Component, matchesKey } from "@earendil-works/pi-tui";
import * as fs from "node:fs";
import { getImageFiles, ImageFileInfo } from "../modules/image-explorer.js";
import { formatImageForDisplay, createImagePreviewFromPath } from "../modules/image-display.js";
import { GeneratedImage } from "../config/types.js";

// ============================================================================
// Image Display Overlay Component
// ============================================================================

/**
 * Format file size in human-readable format
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * Image Display Overlay Component
 */
class ImageDisplayOverlay {
  private imageComponent: Image;
  private doneCallback: () => void;
  private theme: Theme;

  constructor(
    image: GeneratedImage,
    theme: Theme,
    done: () => void
  ) {
    this.theme = theme;
    this.doneCallback = done;
    
    const sizeStr = formatSize(image.size);
    
    const displayResult = formatImageForDisplay(image, {
      includeText: false,
      saveToPiImages: false,
    });

    const imageItem = displayResult.content.find((c: any) => c.type === "image");
    
    if (imageItem && imageItem.data && imageItem.mimeType) {
      const imageTheme = {
        fallbackColor: (str: string) => theme.fg("muted", str)
      };
      this.imageComponent = new Image(
        imageItem.data,
        imageItem.mimeType,
        imageTheme,
        {
          maxWidthCells: 78,
          maxHeightCells: 20
        }
      );
    } else {
      // Fallback for broken image
      this.imageComponent = new Image(
        "",
        "image/png",
        { fallbackColor: (str: string) => theme.fg("muted", str) },
        { maxWidthCells: 1, maxHeightCells: 1 }
      );
    }
  }

  handleInput(data: string): void {
    if (matchesKey(data, "escape") || matchesKey(data, "q") || matchesKey(data, "x") || matchesKey(data, " ") || matchesKey(data, "return") || matchesKey(data, "enter")) {
      this.doneCallback();
    }
  }

  invalidate(): void {
    this.imageComponent.invalidate();
  }

  render(width: number): string[] {
    const th = this.theme;
    const lines = this.imageComponent.render(width);
    
    // Add header and footer
    const headerLine = th.fg("border", "╭") + 
      " ".repeat(width - 2) + 
      th.fg("border", "╮");
    const titleLine = th.fg("border", "│") + 
      " ".padEnd(width - 2) + 
      th.fg("border", "│");
    const footerLine = th.fg("border", "╰") + 
      " ".repeat(width - 2) + 
      th.fg("border", "╯");
    
    return [headerLine, titleLine, ...lines, footerLine];
  }
}

// ============================================================================
// Command Definition
// ============================================================================

/**
 * Create the explore images command
 */
export function createExploreImagesCommand(pi: ExtensionAPI) {
  return {
    description: "Browse and display images from .pi-images directory",
    prompt: "Explore Saved Images",
    
    handler: async (args: string | undefined, ctx: ExtensionCommandContext) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("Image explorer requires interactive mode", "error");
        return;
      }

      const imageFiles = getImageFiles();

      // If args is a number, display that image directly
      if (args && !isNaN(parseInt(args.trim()))) {
        const index = parseInt(args.trim()) - 1;
        if (index >= 0 && index < imageFiles.length) {
          const img = imageFiles[index];
          try {
            const data = fs.readFileSync(img.fullPath);
            const image: GeneratedImage = {
              data,
              mimeType: img.mimeType,
              fileName: img.fileName,
              size: img.size,
            };
            
            await ctx.ui.custom(
              (_tui, theme, _keybindings, done) => new ImageDisplayOverlay(image, theme, done),
              { overlay: true }
            );
          } catch (error) {
            ctx.ui.notify(`Error loading image: ${error}`, "error");
          }
          return;
        }
      }

      if (imageFiles.length === 0) {
        ctx.ui.notify("No images found in .pi-images directory", "warning");
        return;
      }

      // Convert image files to SelectList items
      const selectItems: SelectItem[] = imageFiles.map(img => ({
        value: img.fullPath,
        label: img.fileName,
        description: `${img.mimeType} • ${formatSize(img.size)}`
      }));

      // Show SelectList overlay with preview
      const selectedItem = await ctx.ui.custom<SelectItem | null>(
        (tui, theme, _keybindings, done) => {
          // SelectList with theme
          const selectList = new SelectList(
            selectItems,
            Math.min(selectItems.length, 10),
            {
              selectedPrefix: (t) => theme.fg("accent", "➤ " + t),
              selectedText: (t) => theme.fg("accent", t),
              description: (t) => theme.fg("dim", t),
              scrollInfo: (t) => theme.fg("dim", t),
              noMatch: (t) => theme.fg("muted", t),
            }
          );
          selectList.onSelect = (item) => done(item);
          selectList.onCancel = () => done(null);
          
          // Preview component - start with placeholder
          let previewComponent: Component = {
            render: (w: number) => [theme.fg("dim", "No image selected")],
            invalidate: () => {},
          };
          
          // Update preview when selection changes
          selectList.onSelectionChange = (item: SelectItem) => {
            if (item) {
              const img = imageFiles.find(f => f.fullPath === item.value);
              if (img) {
                previewComponent = createImagePreviewFromPath(
                  img.fullPath,
                  img.mimeType,
                  theme,
                  { maxWidthCells: 80, maxHeightCells: 24 }
                );
              }
            }
            tui.requestRender();
          };
          
          // Initialize preview with first item
          if (selectItems.length > 0) {
            selectList.setSelectedIndex(0);
            const firstImg = imageFiles[0];
            previewComponent = createImagePreviewFromPath(
              firstImg.fullPath,
              firstImg.mimeType,
              theme,
              { maxWidthCells: 80, maxHeightCells: 24 }
            );
            tui.requestRender();
          }

          return {
            render: (w) => {
              // Render list at full width
              const listLines = selectList.render(w);
              
              // Render preview below list
              const previewLines = previewComponent.render(w);
              
              // Add separator and preview label
              const separator = theme.fg("border", "─".repeat(w));
              const previewLabel = theme.fg("accent", "🖼️  Preview:");
              
              return [...listLines, separator, previewLabel, ...previewLines];
            },
            invalidate: () => {
              selectList.invalidate();
              previewComponent.invalidate();
            },
            handleInput: (data) => {
              selectList.handleInput(data);
              tui.requestRender();
            }
          };
        },
        { overlay: true }
      );

      // If an image was selected, display it
      if (selectedItem) {
        const img = imageFiles.find(f => f.fullPath === selectedItem.value);
        if (img) {
          try {
            const data = fs.readFileSync(img.fullPath);
            const image: GeneratedImage = {
              data,
              mimeType: img.mimeType,
              fileName: img.fileName,
              size: img.size,
            };
            
            await ctx.ui.custom(
              (_tui, theme, _keybindings, done) => new ImageDisplayOverlay(image, theme, done),
              { overlay: true }
            );
          } catch (error) {
            ctx.ui.notify(`Error loading image: ${error}`, "error");
          }
        }
      }
    },
  };
}

/**
 * Register the explore images command
 */
export function registerExploreImagesCommand(pi: ExtensionAPI): void {
  pi.registerCommand("explore-images", createExploreImagesCommand(pi));
}
