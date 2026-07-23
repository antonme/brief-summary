#!/usr/bin/env python3
"""Process icon_h and icon_i: keep star gradient (yellow → orange → red)."""

from PIL import Image
import os

def process_icon(img):
    """Keep black, blue, and star gradient; make background transparent."""
    img = img.convert("RGBA")

    width, height = img.size
    pixels = img.load()

    # Sample background color from corner
    bg_color = pixels[0, 0][:3]
    print(f"  Background: RGB{bg_color}")

    # Define target colors
    BLACK = (0, 0, 0)
    BLUE = (100, 175, 210)        # Single blue for lenses
    # Star gradient: yellow → orange → red-orange
    YELLOW = (255, 220, 50)       # Tips - bright yellow
    ORANGE = (255, 165, 30)       # Middle - orange
    RED_ORANGE = (240, 100, 30)   # Center - red-orange

    # Process all pixels
    counts = {
        'black': 0, 'blue': 0,
        'yellow': 0, 'orange': 0, 'red_orange': 0, 'transparent': 0
    }
    total_pixels = width * height

    for y in range(height):
        for x in range(width):
            pixel = pixels[x, y]
            r, g, b = pixel[:3]

            # Check if it's background first
            bg_diff = abs(r - bg_color[0]) + abs(g - bg_color[1]) + abs(b - bg_color[2])

            if bg_diff < 80:
                pixels[x, y] = (r, g, b, 0)
                counts['transparent'] += 1
            # Check if it's black/dark
            elif r < 80 and g < 80 and b < 80:
                pixels[x, y] = (*BLACK, 255)
                counts['black'] += 1
            # Check if it's blue (for lenses) - single color
            elif b > 100 and g > 80 and r < 180 and b > r:
                pixels[x, y] = (*BLUE, 255)
                counts['blue'] += 1
            # Check if it's in the yellow/orange/red spectrum (star)
            elif r > 180 and g > 50 and b < 150 and r > b:
                # Classify based on green value and red/green ratio
                if g > 180:  # High green = yellow
                    pixels[x, y] = (*YELLOW, 255)
                    counts['yellow'] += 1
                elif g > 100:  # Medium green = orange
                    pixels[x, y] = (*ORANGE, 255)
                    counts['orange'] += 1
                else:  # Low green = red-orange
                    pixels[x, y] = (*RED_ORANGE, 255)
                    counts['red_orange'] += 1
            else:
                pixels[x, y] = (r, g, b, 0)
                counts['transparent'] += 1

    print(f"  Black: {counts['black']} ({100*counts['black']/total_pixels:.1f}%)")
    print(f"  Blue: {counts['blue']} ({100*counts['blue']/total_pixels:.1f}%)")
    print(f"  Yellow: {counts['yellow']} ({100*counts['yellow']/total_pixels:.1f}%)")
    print(f"  Orange: {counts['orange']} ({100*counts['orange']/total_pixels:.1f}%)")
    print(f"  Red-Orange: {counts['red_orange']} ({100*counts['red_orange']/total_pixels:.1f}%)")
    print(f"  Transparent: {counts['transparent']} ({100*counts['transparent']/total_pixels:.1f}%)")

    return img

def crop_to_content(img):
    bbox = img.getbbox()
    if bbox:
        cropped = img.crop(bbox)
        print(f"  Cropped: {img.size} → {cropped.size}")
        return cropped
    return img

def resize_to_square(img, size):
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
    print(f"\n{'='*50}")
    print(f"Processing {icon_name}...")
    print(f"{'='*50}")

    img = Image.open(f"new_icons/{icon_name}.png")
    print(f"Original: {img.size}\n")

    img_processed = process_icon(img)
    img_cropped = crop_to_content(img_processed)

    sizes = [16, 32, 48, 128]
    print("\n  Creating sizes:")
    for size in sizes:
        resized = resize_to_square(img_cropped, size)
        output_path = f"assets/new_{icon_name}_{size}.png"
        resized.save(output_path, "PNG", optimize=True)

        file_size = os.path.getsize(output_path)
        size_str = f"{file_size}B" if file_size < 1024 else f"{file_size/1024:.1f}KB"
        print(f"    {size}x{size}: {size_str}")

    print(f"\n✓ {icon_name} complete!")

def main():
    process_and_create_sizes("icon_h")
    process_and_create_sizes("icon_i")
    print("\n" + "="*50)
    print("All icons processed!")
    print("="*50)

if __name__ == "__main__":
    main()
