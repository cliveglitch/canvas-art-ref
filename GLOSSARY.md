# Canvas Art Ref

Tools for drawing and painting reference boards built on Obsidian's native Canvas, which stays the only editor and file format. Behaviour follows PureRef, approximated wherever PureRef's handbook is silent or Canvas works differently.

## Canvas

**Image card**:
A canvas card that shows an image file from the vault.
_Avoid_: image node, picture

**Group**:
A native canvas group. Cards fully inside its bounds belong to it; partly overlapping cards do not.

**Selected images**:
The image cards an image action applies to: selected image cards plus image cards fully inside selected groups.
_Avoid_: selection (when only images are meant)

**Selection order**:
The order of selected images: selected image cards first, then each selected group's images in reading order (top to bottom, then left to right). The Canvas stand-in for PureRef's hierarchy order.
_Avoid_: hierarchy order

**Addition order**:
The order in which this plugin first saw each image card on a canvas, independent of Canvas's layer order. Removed cards keep their place.
_Avoid_: insertion order, layer order

**Natural size**:
The pixel width and height of an image's source file.
_Avoid_: source resolution, intrinsic size

## Layout

**Image action**:
One user-facing layout operation on selected images: an arrangement, an alignment, a normalization, or Scale selection.

**Layout plan**:
Every position and size change one layout operation will make to a canvas, including the groups that must change to keep their cards inside.
_Avoid_: layout result, rectangles

**Group fit**:
The rule that sizes a group around all the cards it contains, innermost groups first, with fixed padding and edges rounded outward to whole canvas pixels. A group can grow or shrink, as PureRef groups adjust to their content.
_Avoid_: group expansion, group padding

**Optimize group**:
Applying group fit to selected groups on demand, without moving any cards. Image actions apply it to the groups they touch.
_Avoid_: shrink group, fit group

**Size source**:
Which target a normalization matches: the first selected image (From first) or the average of all selected images (Average).
_Avoid_: normalize source, reference image

**Reverse on repeat**:
Repeating the same sorted arrangement on the same images reverses its order.

## Asset folders

**Images folder** / **Notes folder**:
Where new pasted or dropped images, and new Markdown notes, are created for a canvas.

**Canvas folders**:
A per-canvas override of the images and notes folders. Blank inherits the plugin default; `/` means the vault root.
_Avoid_: board folders, folder overrides

## Storage

**Plugin data**:
Everything the plugin remembers outside `.canvas` files: default folders, canvas folders, image spacing, size source, and addition order, each kept per canvas path.
_Avoid_: settings (when addition order is included), plugin state
