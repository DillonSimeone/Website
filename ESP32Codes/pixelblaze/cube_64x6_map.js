/*
  ==============================================================================
  Pixelblaze Pixel Mapper: 6-Sided Cube (64 Pixels / 8x8 Matrix per Face)
  ==============================================================================
  
  Total Pixels: 6 faces * 64 pixels = 384 pixels
  
  How to use in Pixelblaze:
  1. Open your Pixelblaze web interface.
  2. Navigate to the "Mapper" tab.
  3. Copy and paste the entire function below into the Mapper editor.
  4. Click "Save". Pixelblaze will render a 3D preview of your 6-sided cube!

  Wiring & Orientation Configuration:
  - serpentine: Set to true if your 8x8 panels are wired in a zig-zag pattern
                (alternating rows left-to-right, then right-to-left).
                Set to false if progressive (every row starts from the same side).
  - faceOrder: Reorder the face names in the array if your wiring daisy-chains
               in a different order (e.g., entering through the Bottom or Top).
*/

function (pixelCount) {
  var map = []
  var N = 8 // 8x8 LEDs per face (64 pixels)
  
  // CONFIGURATION:
  var isSerpentine = true // Standard for flexible WS2812B matrix panels

  // Helper to add an 8x8 face with specified coordinate transformation
  function addFace(coordFn) {
    for (var r = 0; r < N; r++) {
      for (var c = 0; c < N; c++) {
        // Handle zig-zag / serpentine wiring on alternating rows
        var col = (isSerpentine && (r % 2 == 1)) ? (N - 1 - c) : c
        var u = col / (N - 1)           // 0.0 .. 1.0 (horizontal)
        var v = (N - 1 - r) / (N - 1)   // 0.0 .. 1.0 (vertical bottom-to-top)
        map.push(coordFn(u, v))
      }
    }
  }

  // 1. Front Face (Z = 1.0, X left-to-right, Y bottom-to-top)
  addFace(function (u, v) { return [u, v, 1.0] })

  // 2. Right Face (X = 1.0, Z front-to-back, Y bottom-to-top)
  addFace(function (u, v) { return [1.0, v, 1.0 - u] })

  // 3. Back Face (Z = 0.0, X right-to-left, Y bottom-to-top)
  addFace(function (u, v) { return [1.0 - u, v, 0.0] })

  // 4. Left Face (X = 0.0, Z back-to-front, Y bottom-to-top)
  addFace(function (u, v) { return [0.0, v, u] })

  // 5. Top Face (Y = 1.0, X left-to-right, Z back-to-front)
  addFace(function (u, v) { return [u, 1.0, v] })

  // 6. Bottom Face (Y = 0.0, X left-to-right, Z front-to-back)
  addFace(function (u, v) { return [u, 0.0, 1.0 - v] })

  return map
}
