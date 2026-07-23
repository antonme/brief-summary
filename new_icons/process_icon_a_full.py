#!/usr/bin/env python3
"""Process icon_a: simplify to 4 colors (blue, yellow, white, transparent)."""

from PIL import Image
from collections import Counter

def simplify_to_main_colors(img):
    """Keep blue, yellow, and white; make checkerboard background transparent."""
    # Convert to RGBA if not already
    img = img.convert("RGBA")

    width, height = img.size
    pixels = img.load()

    # First, detect checkerboard colors from edges
    edge_colors = []
    for x in range(0, width, 10):
        edge_colors.append(pixels[x, 0][:3])
        edge_colors.append(pixels[x, height-1][:3])
    for y in range(0, height, 10):
        edge_colors.append(pixels[0, y][:3])
        edge_colors.append(pixels[width-1, y][:3])

    color_counts = Counter(edge_colors)
    most_common = color_counts.most_common(2)

    bg_color1 = most_common[0][0]
    bg_color2 = most_common[1][0] if len(most_common) > 1 else bg_color1

    print(f"Detected checkerboard colors:")
    print(f"  Color 1: RGB{bg_color1}")
    print(f"  Color 2: RGB{bg_color2}")

    # Define target colors
    BLUE = (66, 135, 245)  # Solid blue for frames
    YELLOW = (255, 193, 7)  # Solid yellow for star
    WHITE = (255, 255, 255)  # White for lenses

    print(f"\nTarget colors:")
    print(f"  Blue: RGB{BLUE}")
    print(f"  Yellow: RGB{YELLOW}")
    print(f"  White: RGB{WHITE}")

    # Process all pixels
    transparent_count = 0
    blue_count = 0
    yellow_count = 0
    white_count = 0
    total_pixels = width * height

    for y in range(height):
        for x in range(width):
            pixel = pixels[x, y]
            r, g, b = pixel[:3]

            # Check if it's checkerboard background first
            bg_diff1 = abs(r - bg_color1[0]) + abs(g - bg_color1[1]) + abs(b - bg_color1[2])
            bg_diff2 = abs(r - bg_color2[0]) + abs(g - bg_color2[1]) + abs(b - bg_color2[2])

            if bg_diff1 < 50 or bg_diff2 < 50:
                # It's background - make transparent
                pixels[x, y] = (r, g, b, 0)
                transparent_count += 1
            # Check if it's a yellow-ish pixel (high R, moderate-high G, low B)
            elif r > 200 and g > 140 and b < 150:
                pixels[x, y] = (*YELLOW, 255)
                yellow_count += 1
            # Check if it's a blue-ish pixel (low-moderate R, moderate G, high B)
            elif r < 180 and b > 160 and b > r:
                pixels[x, y] = (*BLUE, 255)
                blue_count += 1
            # Check if it's white or very light (all RGB values high and similar)
            elif r > 200 and g > 200 and b > 200 and abs(r-g) < 30 and abs(g-b) < 30:
                pixels[x, y] = (*WHITE, 255)
                white_count += 1
            else:
                # Unknown - make transparent
                pixels[x, y] = (r, g, b, 0)
                transparent_count += 1

    print(f"\nProcessed {total_pixels} pixels:")
    print(f"  Blue pixels: {blue_count} ({100*blue_count/total_pixels:.1f}%)")
    print(f"  Yellow pixels: {yellow_count} ({100*yellow_count/total_pixels:.1f}%)")
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
    # Load icon_a
    input_path = "new_icons/icon_a.png"
    print(f"Loading {input_path}...\n")

    img = Image.open(input_path)
    print(f"Original size: {img.size}, mode: {img.mode}\n")

    # Simplify to 4 colors (blue, yellow, white, transparent)
    print("Simplifying to 4 colors (blue, yellow, white, transparent)...")
    img_simplified = simplify_to_main_colors(img)

    # Crop to content
    img_cropped = crop_to_content(img_simplified)

    # Save full-size test version
    test_path = "assets/new_icon_a_full_test.png"
    img_cropped.save(test_path, "PNG")
    print(f"\n✓ Full-size test saved to {test_path}")

    # Create 48px preview
    preview = resize_to_square(img_cropped, 48)
    preview_path = "assets/new_icon_a_test_48.png"
    preview.save(preview_path, "PNG")
    print(f"✓ 48px preview saved to {preview_path}")

    print("\nPlease verify the test images before creating all sizes!")

if __name__ == "__main__":
    main()
