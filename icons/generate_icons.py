import struct
import zlib
import math

def create_png(width, height, get_pixel):
    raw_data = bytearray()
    for y in range(height):
        raw_data.append(0)  # filter type 0 (None)
        for x in range(width):
            r, g, b, a = get_pixel(x, y, width, height)
            raw_data.extend([r, g, b, a])
    
    def chunk(tag, data):
        return (struct.pack('>I', len(data)) +
                tag +
                data +
                struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff))

    header = b'\x89PNG\r\n\x1a\n'
    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    ihdr = chunk(b'IHDR', ihdr_data)
    idat = chunk(b'IDAT', zlib.compress(bytes(raw_data), 9))
    iend = chunk(b'IEND', b'')
    return header + ihdr + idat + iend

def get_icon_pixel(x, y, w, h):
    # Normalized coords [0, 1]
    nx = (x + 0.5) / w
    ny = (y + 0.5) / h

    # Rounded rectangle background
    corner_r = 0.22
    # Distance to corner bounds
    dx = max(0.0, abs(nx - 0.5) - (0.5 - corner_r))
    dy = max(0.0, abs(ny - 0.5) - (0.5 - corner_r))
    dist = math.hypot(dx, dy)
    
    if dist > corner_r:
        return (0, 0, 0, 0)
    
    # Smooth edge
    alpha = 1.0
    edge = corner_r - dist
    if edge < (1.0 / w):
        alpha = max(0.0, min(1.0, edge * w))

    # Gradient background (deep indigo to vibrant blue)
    bg_r = int(37 + (59 - 37) * ny)
    bg_g = int(99 + (130 - 99) * (1 - nx))
    bg_b = int(235 + (246 - 235) * nx)

    # Decode arrows / letter motif
    # Draw simple "B" or decoding brackets: "< / >" or "64"
    # Let's draw lightning / decode icon:
    # Left arrow '<' and right arrow '>' or center '64'
    # For high visibility across 16, 48, 128:
    # Let's draw a white stylized tag / decode bracket symbol
    is_fg = False
    
    # Draw a stylized "B" on left or decode lightning/arrows
    # Let's draw an open bracket on left and close bracket on right with a slash in middle
    # Slash: from (0.6, 0.25) to (0.4, 0.75)
    # Line width ~ 0.08
    # Slash equation: line from (0.58, 0.25) to (0.42, 0.75)
    px = nx - 0.5
    py = ny - 0.5
    
    # Center slash
    # line: py = -3.125 * px
    dist_slash = abs(3.125 * px + py) / math.sqrt(3.125**2 + 1)
    if dist_slash < 0.045 and -0.26 <= py <= 0.26:
        is_fg = True
        
    # Left chevron '<': vertex at (-0.28, 0)
    # top arm: from (-0.14, -0.22) to (-0.28, 0)
    # bottom arm: from (-0.14, 0.22) to (-0.28, 0)
    # Let's check distance to line segments:
    def dist_to_segment(x, y, x1, y1, x2, y2):
        l2 = (x2 - x1)**2 + (y2 - y1)**2
        if l2 == 0: return math.hypot(x - x1, y - y1)
        t = max(0, min(1, ((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) / l2))
        proj_x = x1 + t * (x2 - x1)
        proj_y = y1 + t * (y2 - y1)
        return math.hypot(x - proj_x, y - proj_y)

    d_l1 = dist_to_segment(px, py, -0.16, -0.24, -0.30, 0.0)
    d_l2 = dist_to_segment(px, py, -0.30, 0.0, -0.16, 0.24)
    if min(d_l1, d_l2) < 0.045:
        is_fg = True

    # Right chevron '>': vertex at (0.30, 0)
    d_r1 = dist_to_segment(px, py, 0.16, -0.24, 0.30, 0.0)
    d_r2 = dist_to_segment(px, py, 0.30, 0.0, 0.16, 0.24)
    if min(d_r1, d_r2) < 0.045:
        is_fg = True

    if is_fg:
        return (255, 255, 255, int(255 * alpha))
    else:
        return (bg_r, bg_g, bg_b, int(255 * alpha))

for size in [16, 48, 128]:
    png_bytes = create_png(size, size, get_icon_pixel)
    with open(f'icons/icon{size}.png', 'wb') as f:
        f.write(png_bytes)
print("Icons generated successfully.")
