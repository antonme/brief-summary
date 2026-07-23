#!/usr/bin/env python3
"""Create a test icon to verify transparency."""

from PIL import Image

def main():
    # Load the original icon
    input_path = "new_icons/icon_a.png"
    print(f"Loading {input_path}...")

    img = Image.open(input_path)
    print(f"Original size: {img.size}, mode: {img.mode}")

    # Check if image has transparency
    if img.mode == 'RGBA':
        print("Image has alpha channel (transparency)")
        # Check a sample of pixels for actual transparency
        pixels = img.load()
        transparent_count = 0
        total_checked = 0
        for y in range(0, img.size[1], 100):
            for x in range(0, img.size[0], 100):
                total_checked += 1
                if pixels[x, y][3] < 255:  # Alpha less than 255
                    transparent_count += 1
        print(f"Transparent pixels sampled: {transparent_count}/{total_checked}")
    else:
        print(f"Warning: Image mode is {img.mode}, not RGBA")

    # Create a test 48px version
    print("\nCreating test 48x48 version...")
    test_icon = img.resize((48, 48), Image.Resampling.LANCZOS)

    output_path = "assets/new_icon_test_48.png"
    test_icon.save(output_path, "PNG")
    print(f"Test icon saved to {output_path}")
    print("\nPlease verify this icon has a transparent background before proceeding.")

if __name__ == "__main__":
    main()
