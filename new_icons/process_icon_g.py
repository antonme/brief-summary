#!/usr/bin/env python3
"""Process icon_g: keep two shades of blue in lenses."""

from PIL import Image
import os

def process_icon(img):
    """Keep black, two blues, and yellow; make background transparent."""
    img = img.convert("RGBA")

    width, height = img.size
    pixels = img.load()

    # Sample background color from corner
    bg_color = pixels[0, 0][:3]
    print(f"Background color: RGB{bg_color}")

    # Define target colors - TWO shades of blue
    BLACK = (0, 0, 0)
    LIGHT_BLUE = (135, 195, 220)  # Lighter shade for lens highlights
    DARK_BLUE = (70, 145, 180)    # Darker shade for lens depth
    YELLOW = (255, 193, 7)

    print(f"\nTarget colors:")
    print(f"  Black: RGB{BLACK}")
    print(f"  Light Blue: RGB{LIGHT_BLUE}")
    print(f"  Dark Blue: RGB{DARK_BLUE}")
    print(f"  Yellow: RGB{YELLOW}")

    # Process all pixels
    transparent_count = 0
    black_count = 0
    light_blue_count = 0
    dark_blue_count = 0
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
            # Check if it's blue - distinguish light vs dark
            elif b > 100 and g > 80 and r < 180 and b > r:
                # Determine if light or dark blue based on overall brightness
                brightness = r + g + b
                if brightness > 480:  # Lighter blue
                    pixels[x, y] = (*LIGHT_BLUE, 255)
                    light_blue_count += 1
                else:  # Darker blue
                    pixels[x, y] = (*DARK_BLUE, 255)
                    dark_blue_count += 1
            else:
                pixels[x, y] = (r, g, b, 0)
                transparent_count += 1

    print(f"\nProcessed {total_pixels} pixels:")
    print(f"  Black: {black_count} ({100*black_count/total_pixels:.1f}%)")
    print(f"  Light Blue: {light_blue_count} ({100*light_blue_count/total_pixels:.1f}%)")
    print(f"  Dark Blue: {dark_blue_count} ({100*dark_blue_count/total_pixels:.1f}%)")
    print(f"  Yellow: {yellow_count} ({100*yellow_count/total_pixels:.1f}%)")
    print(f"  Transparent: {transparent_count} ({100*transparent_count/total_pixels:.1f}%)")

    return img

def crop_to_content(img):
    """Crop image to the bounding box of non-transparent pixels."""
    bbox = img.getbbox()
    if bbox:
        cropped = img.crop(bbox)
        print(f"\nCropped: {img.size} → {cropped.size}")
        return cropped
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
    input_path = "new_icons/icon_g.png"
    print(f"Loading {input_path}...\n")

    img = Image.open(input_path)
    print(f"Original size: {img.size}")

    # Process
    print("\nSimplifying colors (keeping two blue shades)...")
    img_processed = process_icon(img)

    # Crop
    img_cropped = crop_to_content(img_processed)

    # Create all sizes
    sizes = [16, 32, 48, 128]
    print("\nCreating sizes:")
    for size in sizes:
        resized = resize_to_square(img_cropped, size)
        output_path = f"assets/new_icon_g_{size}.png"
        resized.save(output_path, "PNG", optimize=True)

        file_size = os.path.getsize(output_path)
        size_str = f"{file_size}B" if file_size < 1024 else f"{file_size/1024:.1f}KB"
        print(f"  {size}x{size}: {size_str}")

    print("\n✓ icon_g complete!")

if __name__ == "__main__":
    main()
