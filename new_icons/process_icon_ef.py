#!/usr/bin/env python3
"""Process icon_e and icon_f: simplify to 4 colors (black, blue, yellow, transparent)."""

from PIL import Image
import os

def process_icon(img):
    """Keep black, blue, and yellow; make background transparent."""
    img = img.convert("RGBA")

    width, height = img.size
    pixels = img.load()

    # Sample background color from corner
    bg_color = pixels[0, 0][:3]
    print(f"  Background color: RGB{bg_color}")

    # Define target colors
    BLACK = (0, 0, 0)
    BLUE = (70, 160, 200)
    YELLOW = (255, 193, 7)

    # Process all pixels
    transparent_count = 0
    black_count = 0
    blue_count = 0
    yellow_count = 0
    total_pixels = width * height

    for y in range(height):
        for x in range(width):
            pixel = pixels[x, y]
            r, g, b = pixel[:3]

            # Check if it's background first
            bg_diff = abs(r - bg_color[0]) + abs(g - bg_color[1]) + abs(b - bg_color[2])

            if bg_diff < 80:
                pixels[x, y] = (r, g, b, 0)
                transparent_count += 1
            # Check if it's yellow (high R, high G, low B)
            elif r > 180 and g > 140 and b < 150:
                pixels[x, y] = (*YELLOW, 255)
                yellow_count += 1
            # Check if it's black/dark
            elif r < 80 and g < 80 and b < 80:
                pixels[x, y] = (*BLACK, 255)
                black_count += 1
            # Check if it's blue/cyan
            elif b > 120 and g > 100 and r < 150 and b > r:
                pixels[x, y] = (*BLUE, 255)
                blue_count += 1
            else:
                pixels[x, y] = (r, g, b, 0)
                transparent_count += 1

    print(f"  Black: {black_count} ({100*black_count/total_pixels:.1f}%)")
    print(f"  Blue: {blue_count} ({100*blue_count/total_pixels:.1f}%)")
    print(f"  Yellow: {yellow_count} ({100*yellow_count/total_pixels:.1f}%)")
    print(f"  Transparent: {transparent_count} ({100*transparent_count/total_pixels:.1f}%)")

    return img

def crop_to_content(img):
    """Crop image to the bounding box of non-transparent pixels."""
    bbox = img.getbbox()
    if bbox:
        return img.crop(bbox)
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

def process_and_create_sizes(icon_name):
    """Process an icon and create all sizes."""
    input_path = f"new_icons/{icon_name}.png"
    print(f"\n{'='*50}")
    print(f"Processing {icon_name}...")
    print(f"{'='*50}")

    img = Image.open(input_path)
    print(f"Original size: {img.size}")

    # Process
    print("\nSimplifying colors...")
    img_processed = process_icon(img)

    # Crop
    img_cropped = crop_to_content(img_processed)
    print(f"\nCropped to: {img_cropped.size}")

    # Create all sizes
    sizes = [16, 32, 48, 128]
    print("\nCreating sizes:")
    for size in sizes:
        resized = resize_to_square(img_cropped, size)
        output_path = f"assets/new_{icon_name}_{size}.png"
        resized.save(output_path, "PNG", optimize=True)

        file_size = os.path.getsize(output_path)
        size_str = f"{file_size}B" if file_size < 1024 else f"{file_size/1024:.1f}KB"
        print(f"  {size}x{size}: {size_str}")

    print(f"\n✓ {icon_name} complete!")

def main():
    process_and_create_sizes("icon_e")
    process_and_create_sizes("icon_f")
    print("\n" + "="*50)
    print("All icons processed successfully!")
    print("="*50)

if __name__ == "__main__":
    main()
