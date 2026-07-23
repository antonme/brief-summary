#!/usr/bin/env python3
"""Process icon_d: simplify to 4 colors (black, blue, white, transparent)."""

from PIL import Image

def simplify_to_main_colors(img):
    """Keep black, blue, and white; make background transparent."""
    # Convert to RGBA if not already
    img = img.convert("RGBA")

    width, height = img.size
    pixels = img.load()

    # Sample background color from corners
    bg_color = pixels[0, 0][:3]
    print(f"Detected background color: RGB{bg_color}")

    # Define target colors
    BLACK = (0, 0, 0)  # Black for frames/outline
    BLUE = (70, 160, 200)  # Cyan/blue for lenses
    WHITE = (255, 255, 255)  # White for star interior

    print(f"\nTarget colors:")
    print(f"  Black: RGB{BLACK}")
    print(f"  Blue: RGB{BLUE}")
    print(f"  White: RGB{WHITE}")

    # Process all pixels
    transparent_count = 0
    black_count = 0
    blue_count = 0
    white_count = 0
    total_pixels = width * height

    for y in range(height):
        for x in range(width):
            pixel = pixels[x, y]
            r, g, b = pixel[:3]

            # Check if it's background first (similar to corner color)
            bg_diff = abs(r - bg_color[0]) + abs(g - bg_color[1]) + abs(b - bg_color[2])

            if bg_diff < 80:
                # It's background - make transparent
                pixels[x, y] = (r, g, b, 0)
                transparent_count += 1
            # Check if it's black/dark (low RGB values)
            elif r < 80 and g < 80 and b < 80:
                pixels[x, y] = (*BLACK, 255)
                black_count += 1
            # Check if it's blue/cyan (moderate R, higher G and B)
            elif b > 120 and g > 100 and r < 150 and b > r:
                pixels[x, y] = (*BLUE, 255)
                blue_count += 1
            # Check if it's white (high RGB values, similar)
            elif r > 200 and g > 200 and b > 200:
                pixels[x, y] = (*WHITE, 255)
                white_count += 1
            else:
                # Unknown - make transparent
                pixels[x, y] = (r, g, b, 0)
                transparent_count += 1

    print(f"\nProcessed {total_pixels} pixels:")
    print(f"  Black pixels: {black_count} ({100*black_count/total_pixels:.1f}%)")
    print(f"  Blue pixels: {blue_count} ({100*blue_count/total_pixels:.1f}%)")
    print(f"  White pixels: {white_count} ({100*white_count/total_pixels:.1f}%)")
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
    # Load icon_d
    input_path = "new_icons/icon_d.png"
    print(f"Loading {input_path}...\n")

    img = Image.open(input_path)
    print(f"Original size: {img.size}, mode: {img.mode}\n")

    # Simplify to 4 colors
    print("Simplifying to 4 colors (black, blue, white, transparent)...")
    img_simplified = simplify_to_main_colors(img)

    # Crop to content
    img_cropped = crop_to_content(img_simplified)

    # Save full-size test version
    test_path = "assets/new_icon_d_full_test.png"
    img_cropped.save(test_path, "PNG")
    print(f"\n✓ Full-size test saved to {test_path}")

    # Create 48px preview
    preview = resize_to_square(img_cropped, 48)
    preview_path = "assets/new_icon_d_test_48.png"
    preview.save(preview_path, "PNG")
    print(f"✓ 48px preview saved to {preview_path}")

    print("\nPlease verify the test images before creating all sizes!")

if __name__ == "__main__":
    main()
