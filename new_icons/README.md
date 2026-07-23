# Icon Processing Guide

This folder contains source icons and scripts for processing them into browser extension-ready icons.

## Overview

Browser extensions require icons in multiple sizes (16px, 32px, 48px, 128px). Our processing pipeline:

1. **Remove background** - Make background transparent
2. **Simplify colors** - Reduce to 2-3 solid colors (removes dithering/noise)
3. **Crop to content** - Remove empty transparent space
4. **Resize to squares** - Create all required sizes with aspect ratio preserved

## Processing Workflow

### For Multi-Color Icons (like icon_a)

**Source:** `icon_a.png` - Blue glasses + yellow star on checkerboard background

**Steps:**

1. Run `remove_checkerboard.py` to process the full-size image:
   ```bash
   python3 remove_checkerboard.py
   ```
   - Detects and removes checkerboard background (2 colors)
   - Simplifies foreground to 2 solid colors (blue + yellow)
   - Outputs: `assets/new_icon_full_transparent_test.png`

2. Verify the test output looks good (transparent background, solid colors)

3. Run `create_all_icons.py` to create all sizes:
   ```bash
   python3 create_all_icons.py
   ```
   - Loads the processed full-size image
   - Crops to content bounding box
   - Creates 16, 32, 48, 128px versions
   - Outputs: `assets/new_icon_{size}.png`

### For Single-Color Icons (like icon_b)

**Source:** `icon_b.jpg` - Dark gray glasses + star on solid background

**Steps:**

1. Run `process_icon_b.py` to create test version:
   ```bash
   python3 process_icon_b.py
   ```
   - Detects background color from corners
   - Converts foreground to single solid color
   - Crops to content
   - Outputs test files for verification

2. Verify the test output (48px preview)

3. Run `create_icon_b_sizes.py` to create all sizes:
   ```bash
   python3 create_icon_b_sizes.py
   ```
   - Creates 16, 32, 48, 128px versions
   - Outputs: `assets/new_icon_b_{size}.png`

## Script Reference

### `remove_checkerboard.py`
**Purpose:** Process multi-color icons with checkerboard backgrounds

**How it works:**
- Samples edge pixels to detect the two checkerboard colors
- Uses RGB thresholds to identify foreground colors (blue/yellow)
- Maps all blue-ish pixels to solid blue RGB(66, 135, 245)
- Maps all yellow-ish pixels to solid yellow RGB(255, 193, 7)
- Makes everything else transparent

**Key parameters:**
- `tolerance=50` - How close to background colors to remove (line 74)
- Blue detection: `r < 180 and b > 160 and b > r` (line 38)
- Yellow detection: `r > 200 and g > 140 and b < 150` (line 34)

### `process_icon_b.py`
**Purpose:** Process single-color icons with solid backgrounds

**How it works:**
- Samples corner pixel to get background color
- Defines target foreground color RGB(55, 65, 75)
- Calculates color difference for each pixel
- If similar to background (tolerance 80), make transparent
- Otherwise, snap to solid foreground color

**Key parameters:**
- `DARK_GRAY = (55, 65, 75)` - Target color (line 15)
- `bg_diff < 80` - Background detection tolerance (line 37)

### `create_all_icons.py`
**Purpose:** Create all sizes from processed icon_a

**Functions:**
- `crop_to_content()` - Uses PIL's getbbox() to find non-transparent pixels
- `resize_to_square()` - Scales to fit in square, centers on transparent canvas

### `create_icon_b_sizes.py`
**Purpose:** Create all sizes from processed icon_b

Same as `create_all_icons.py` but reads from `new_icon_b_full_test.png`

## Adding New Icons

### For new multi-color icons:

1. Place source image in `new_icons/` folder (e.g., `icon_c.png`)

2. Copy and modify `remove_checkerboard.py`:
   - Change `input_path` to your source file (line 66)
   - Adjust color detection thresholds if needed (lines 33-40)
   - Update target colors if not blue/yellow (lines 14-15)
   - Change output path (line 77)

3. Copy and modify `create_all_icons.py`:
   - Change `input_path` to your test output (line 53)
   - Change output filename pattern (line 73)

### For new single-color icons:

1. Place source image in `new_icons/` folder (e.g., `icon_d.jpg`)

2. Copy and modify `process_icon_b.py`:
   - Change `input_path` to your source file (line 68)
   - Adjust target color if not dark gray (line 15)
   - Adjust background tolerance if needed (line 37)

3. Copy and modify `create_icon_b_sizes.py`:
   - Change `input_path` to your test output (line 18)
   - Change output filename pattern (line 32)

## Important Notes

### Color Detection Tips

- **For backgrounds:** The scripts sample corners/edges where background is most likely
- **For foreground:** Adjust RGB thresholds based on your icon's colors
- **Tolerance values:** Lower = stricter matching, higher = more pixels converted

### Testing is Critical

Always create and verify test images before generating all sizes. Check:
- Background is fully transparent (no noise/artifacts)
- Foreground colors are solid (no dithering)
- Icon edges are clean (no weird patterns)

### File Size Optimization

All scripts use `optimize=True` in PIL's save method, which:
- Runs PNG through optimization
- Reduces file size without quality loss
- Typical results: 500B-2KB for small sizes, 8-10KB for 128px

## Updating manifest.json

After creating new icons, update `manifest.json` to reference them:

```json
"icons": {
  "16": "assets/new_icon_c_16.png",
  "32": "assets/new_icon_c_32.png",
  "48": "assets/new_icon_c_48.png",
  "128": "assets/new_icon_c_128.png"
},
"action": {
  "default_popup": "src/pages/popup.html",
  "default_icon": {
    "16": "assets/new_icon_c_16.png",
    "32": "assets/new_icon_c_32.png",
    "48": "assets/new_icon_c_48.png",
    "128": "assets/new_icon_c_128.png"
  }
}
```

## Dependencies

- Python 3
- PIL/Pillow: `pip install Pillow`

## Examples

Current icons processed:

- **icon_a** → `new_icon_{16,32,48,128}.png` (blue + yellow, 3 colors)
- **icon_b** → `new_icon_b_{16,32,48,128}.png` (dark gray, 2 colors)

Both maintain aspect ratio and are centered in square canvases with transparent backgrounds.
