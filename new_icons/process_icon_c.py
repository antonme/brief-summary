#!/usr/bin/env python3
"""Process icon_c: simplify to 2 colors (black + transparent)."""

from PIL import Image

def process_icon_c(img):
    """Keep only black foreground, make background transparent."""
    # Convert to RGBA
    img = img.convert("RGBA")

    width, height = img.size
    pixels = img.load()

    # Sample background color from corners
    bg_color = pixels[0, 0][:3]
    print(f"Background color: RGB{bg_color}")

    # Define target foreground color (solid black)
    BLACK = (0, 0, 0)
    print(f"Target foreground color: RGB{BLACK}")

    # Process all pixels
    transparent_count = 0
    foreground_count = 0
    total_pixels = width * height

    for y in range(height):
        for x in range(width):
            pixel = pixels[x, y]
            r, g, b = pixel[:3]

            # Calculate difference from background
            bg_diff = abs(r - bg_color[0]) + abs(g - bg_color[1]) + abs(b - bg_color[2])

            # If similar to background, make transparent
            if bg_diff < 80:  # tolerance for background
                pixels[x, y] = (r, g, b, 0)
                transparent_count += 1
            else:
                # It's foreground - snap to black
                pixels[x, y] = (*BLACK, 255)
                foreground_count += 1

    print(f"\nProcessed {total_pixels} pixels:")
    print(f"  Foreground (black): {foreground_count} ({100*foreground_count/total_pixels:.1f}%)")
    print(f"  Transparent: {transparent_count} ({100*transparent_count/total_pixels:.1f}%)")

    return img

def crop_to_content(img):
    """Crop image to the bounding box of non-transparent pixels."""
    bbox = img.getbbox()

    if bbox:
        print(f"\nCropping to content:")
        print(f"  Original size: {img.size}")
        print(f"  Bounding box: {bbox}")

        cropped = img.crop(bbox)
        print(f"  Cropped size: {cropped.size}")

        width_removed = img.size[0] - cropped.size[0]
        height_removed = img.size[1] - cropped.size[1]
        print(f"  Removed: {width_removed}px width, {height_removed}px height")

        return cropped
    else:
        print("Warning: Could not find content bounding box")
        return img

def resize_to_square(img, size):
    """Resize image to fit in a square, maintaining aspect ratio."""
    if img.size[0] == img.size[1]:
        return img.resize((size, size), Image.Resampling.LANCZOS)

    ratio = min(size / img.size[0], size / img.size[1])
    new_size = (int(img.size[0] * ratio), int(img.size[1] * ratio))

    resized = img.resize(new_size, Image.Resampling.LANCZOS)

    square = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    offset = ((size - new_size[0]) // 2, (size - new_size[1]) // 2)
    square.paste(resized, offset, resized)

    return square

def main():
    # Load icon_c
    input_path = "new_icons/icon_c.png"
    print(f"Loading {input_path}...\n")

    img = Image.open(input_path)
    print(f"Original size: {img.size}, mode: {img.mode}\n")

    # Process to 2 colors
    print("Processing to 2 colors (black + transparent)...")
    img_processed = process_icon_c(img)

    # Crop to content
    img_cropped = crop_to_content(img_processed)

    # Save full-size test version
    test_path = "assets/new_icon_c_full_test.png"
    img_cropped.save(test_path, "PNG")
    print(f"\n✓ Full-size test saved to {test_path}")

    # Create 48px preview
    preview = resize_to_square(img_cropped, 48)
    preview_path = "assets/new_icon_c_test_48.png"
    preview.save(preview_path, "PNG")
    print(f"✓ 48px preview saved to {preview_path}")

    print("\nPlease verify the test images before creating all sizes!")

if __name__ == "__main__":
    main()
