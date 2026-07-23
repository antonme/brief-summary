#!/usr/bin/env python3
"""Process icon: resize to multiple sizes."""

from PIL import Image

def main():
    # Load the original icon
    input_path = "new_icons/icon_a.png"
    print(f"Loading {input_path}...")

    img = Image.open(input_path)
    print(f"Original size: {img.size}, mode: {img.mode}")

    # Define target sizes
    sizes = [16, 32, 48, 128]

    # Create resized versions
    for size in sizes:
        print(f"Creating {size}x{size} version...")
        resized = img.resize((size, size), Image.Resampling.LANCZOS)

        # Determine output filename (match existing naming convention)
        if size == 32:
            output_path = f"assets/icon-{size}.png"  # Note: uses dash not underscore
        else:
            output_path = f"assets/icon_{size}.png"

        resized.save(output_path, "PNG")
        print(f"  Saved to {output_path}")

    print("\nAll icons created successfully!")

if __name__ == "__main__":
    main()
