#!/usr/bin/env python3
"""Create all icon_b sizes from the processed full-size version."""

from PIL import Image
import os

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
    # Load the full-size processed version
    input_path = "assets/new_icon_b_full_test.png"
    print(f"Loading {input_path}...\n")

    img = Image.open(input_path)
    print(f"Source image: {img.size}, mode: {img.mode}\n")

    # Define target sizes
    sizes = [16, 32, 48, 128]

    # Create resized versions
    print("Creating icon_b sizes:")
    for size in sizes:
        print(f"  {size}x{size}...", end=" ")
        resized = resize_to_square(img, size)

        output_path = f"assets/new_icon_b_{size}.png"
        resized.save(output_path, "PNG", optimize=True)

        # Get file size
        file_size = os.path.getsize(output_path)
        if file_size < 1024:
            size_str = f"{file_size}B"
        else:
            size_str = f"{file_size/1024:.1f}KB"

        print(f"✓ {size_str}")

    print("\n✓ All icon_b sizes created successfully!")

if __name__ == "__main__":
    main()
