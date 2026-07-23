#!/usr/bin/env python3
"""Simplify icon to 3 colors: blue, yellow, and transparent."""

from PIL import Image

def simplify_to_main_colors(img):
    """Keep only blue and yellow, make everything else transparent."""
    # Convert to RGBA if not already
    img = img.convert("RGBA")

    width, height = img.size
    pixels = img.load()

    # Define target colors
    BLUE = (66, 135, 245)  # A nice solid blue
    YELLOW = (255, 193, 7)  # A nice solid yellow/gold

    print(f"Target colors:")
    print(f"  Blue: RGB{BLUE}")
    print(f"  Yellow: RGB{YELLOW}")

    # Now process all pixels
    transparent_count = 0
    blue_count = 0
    yellow_count = 0
    total_pixels = width * height

    for y in range(height):
        for x in range(width):
            pixel = pixels[x, y]
            r, g, b = pixel[:3]

            # Check if it's a yellow-ish pixel (high R, moderate-high G, low B)
            if r > 200 and g > 140 and b < 150:
                pixels[x, y] = (*YELLOW, 255)
                yellow_count += 1
            # Check if it's a blue-ish pixel (low-moderate R, moderate G, high B)
            elif r < 180 and b > 160 and b > r:
                pixels[x, y] = (*BLUE, 255)
                blue_count += 1
            else:
                # Make transparent (this includes white, gray, beige, etc.)
                pixels[x, y] = (r, g, b, 0)
                transparent_count += 1

    print(f"\nProcessed {total_pixels} pixels:")
    print(f"  Blue pixels: {blue_count} ({100*blue_count/total_pixels:.1f}%)")
    print(f"  Yellow pixels: {yellow_count} ({100*yellow_count/total_pixels:.1f}%)")
    print(f"  Transparent: {transparent_count} ({100*transparent_count/total_pixels:.1f}%)")

    return img

def main():
    # Load the original icon
    input_path = "new_icons/icon_a.png"
    print(f"Loading {input_path}...\n")

    img = Image.open(input_path)
    print(f"Original size: {img.size}, mode: {img.mode}\n")

    # Simplify to main colors
    print("Simplifying to 3 colors (blue, yellow, transparent)...")
    img_simplified = simplify_to_main_colors(img)

    # Save full-size version for verification
    output_path = "assets/new_icon_full_transparent_test.png"
    img_simplified.save(output_path, "PNG")
    print(f"\nSimplified icon saved to {output_path}")
    print("\n✓ Please verify this icon has only 3 colors!")

if __name__ == "__main__":
    main()
