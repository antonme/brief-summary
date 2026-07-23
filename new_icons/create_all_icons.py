#!/usr/bin/env python3
"""Create all icon sizes: crop to content, then resize."""

from PIL import Image

def crop_to_content(img):
    """Crop image to the bounding box of non-transparent pixels."""
    # Get the bounding box of non-transparent pixels
    bbox = img.getbbox()

    if bbox:
        print(f"Original size: {img.size}")
        print(f"Content bounding box: {bbox}")

        # Crop to bounding box
        cropped = img.crop(bbox)
        print(f"Cropped size: {cropped.size}")

        # Calculate how much space was removed
        width_removed = img.size[0] - cropped.size[0]
        height_removed = img.size[1] - cropped.size[1]
        print(f"Removed: {width_removed}px width, {height_removed}px height")

        return cropped
    else:
        print("Warning: Could not find content bounding box")
        return img

def resize_to_square(img, size):
    """Resize image to fit in a square, maintaining aspect ratio with padding."""
    # If already square, just resize
    if img.size[0] == img.size[1]:
        return img.resize((size, size), Image.Resampling.LANCZOS)

    # Calculate scaling to fit in square while maintaining aspect ratio
    ratio = min(size / img.size[0], size / img.size[1])
    new_size = (int(img.size[0] * ratio), int(img.size[1] * ratio))

    # Resize maintaining aspect ratio
    resized = img.resize(new_size, Image.Resampling.LANCZOS)

    # Create square canvas with transparency
    square = Image.new('RGBA', (size, size), (0, 0, 0, 0))

    # Paste resized image centered in square
    offset = ((size - new_size[0]) // 2, (size - new_size[1]) // 2)
    square.paste(resized, offset, resized)

    return square

def main():
    # Load the full-size transparent version
    input_path = "assets/new_icon_full_transparent_test.png"
    print(f"Loading {input_path}...\n")

    img = Image.open(input_path)
    print(f"Source image: {img.size}, mode: {img.mode}\n")

    # Crop to content first
    print("Cropping to content bounding box...")
    cropped = crop_to_content(img)
    print()

    # Define target sizes
    sizes = [16, 32, 48, 128]

    # Create resized versions with NEW filenames
    print("Creating icon sizes:")
    for size in sizes:
        print(f"  {size}x{size}...", end=" ")
        resized = resize_to_square(cropped, size)

        output_path = f"assets/new_icon_{size}.png"
        resized.save(output_path, "PNG", optimize=True)

        # Get file size
        import os
        file_size = os.path.getsize(output_path)
        if file_size < 1024:
            size_str = f"{file_size}B"
        else:
            size_str = f"{file_size/1024:.1f}KB"

        print(f"✓ {size_str}")

    print("\n✓ All icon sizes created successfully!")

if __name__ == "__main__":
    main()
