import Foundation
import UIKit

@objcMembers
@objc(ImageUtils)
class ImageUtils : NSObject {
  // BMP Header is 14 bytes, DIB header is typically 40 bytes (for BITMAPINFOHEADER)
  static  let bmpHeaderSize = 14
  static let dibHeaderSize = 40
  static func loadPossible4Bitmap(_ str: String) -> UIImage? {
    do {
      
      let data = try Data(referencing: NSData(contentsOfFile : str))
      
      guard data.count > bmpHeaderSize + dibHeaderSize else {
        return UIImage(data: data)
      }
      // Check BMP signature (first 2 bytes should be 'BM')
      let signature = data.withUnsafeBytes { $0.load(as: UInt16.self) }
      guard signature == 0x4D42 else {
        print("Not a valid BMP file (wrong signature).")
        return nil
      }
      
      // Extract the bit depth (at offset 28 from the beginning of the BMP file)
      let bitDepthOffset = 28 // Bit depth is stored at offset 28 (0x1C) in the DIB header
      let bitDepth = Int(data.withUnsafeBytes { $0.load(fromByteOffset: bitDepthOffset, as: UInt16.self) })
      if (bitDepth != 4) {
        return UIImage(data: data)
      }
      
      // Extract width, height, and other properties from DIB header
      let width = Int(data.withUnsafeBytes { $0.load(fromByteOffset: bmpHeaderSize + 4, as: Int32.self) })
      let height = Int(data.withUnsafeBytes { $0.load(fromByteOffset: bmpHeaderSize + 8, as: Int32.self) })
      let bitCount = Int(data.withUnsafeBytes { $0.load(fromByteOffset: bmpHeaderSize + 14, as: UInt16.self) })
      
      guard bitCount == 4 else {
        print("Not a 4-bit BMP image")
        return nil
      }
      
      // Read the color palette (16 colors, each is 4 bytes: R, G, B, reserved)
      let paletteSize = 16 * 4
      let paletteOffset = bmpHeaderSize + dibHeaderSize
      var colorPalette: [UInt32] = []
      
      for i in 0..<16 {
        let blue = data.withUnsafeBytes { $0.load(fromByteOffset: paletteOffset + i * 4, as: UInt8.self) }
        let green = data.withUnsafeBytes { $0.load(fromByteOffset: paletteOffset + i * 4 + 1, as: UInt8.self) }
        let red = data.withUnsafeBytes { $0.load(fromByteOffset: paletteOffset + i * 4 + 2, as: UInt8.self) }
        
        // Combine the red, green, blue into one UInt32 (ARGB format, Alpha is set to 0xFF)
        let color = (0xFF << 24) | (UInt32(red) << 16) | (UInt32(green) << 8) | UInt32(blue)
        colorPalette.append(color)
      }
      
      // Read pixel data (4-bit values, so each byte contains 2 pixels)
      let pixelDataOffset = paletteOffset + paletteSize
      let rowSize = (width + 1) / 2 // Each pixel is 4 bits, so 2 pixels per byte
      
      // Create a buffer to hold the RGBA pixel data
      var pixelBuffer = [UInt32](repeating: 0, count: width * height)
      
      for y in (0..<height).reversed() {
        for x in 0..<rowSize {
          let byte = data.withUnsafeBytes { $0.load(fromByteOffset: pixelDataOffset + y * rowSize + x, as: UInt8.self) }
          
          // First 4-bit pixel (high nibble)
          let highNibble = (byte & 0xF0) >> 4
          if x * 2 < width {
            pixelBuffer[y * width + x * 2] = colorPalette[Int(highNibble)]
          }
          
          // Second 4-bit pixel (low nibble) if it exists in this row
          if x * 2 + 1 < width {
            let lowNibble = byte & 0x0F
            pixelBuffer[y * width + x * 2 + 1] = colorPalette[Int(lowNibble)]
          }
        }
      }
      
      // Create a CGDataProvider from the pixel buffer
      let dataProvider = CGDataProvider(data: NSData(bytes: &pixelBuffer, length: pixelBuffer.count * MemoryLayout<UInt32>.size))
      
      // Create a CGImage from the pixel buffer (RGBA 32-bit per pixel format)
      let colorSpace = CGColorSpaceCreateDeviceRGB()
      let bitmapInfo = CGBitmapInfo.byteOrder32Big.rawValue | CGImageAlphaInfo.premultipliedLast.rawValue
      let cgImage = CGImage(width: width,
                            height: height,
                            bitsPerComponent: 8,
                            bitsPerPixel: 32,
                            bytesPerRow: width * 4,
                            space: colorSpace,
                            bitmapInfo: CGBitmapInfo(rawValue: bitmapInfo),
                            provider: dataProvider!,
                            decode: nil,
                            shouldInterpolate: true,
                            intent: .defaultIntent)
      
      // Convert CGImage to UIImage
      if let cgImage = cgImage {
        return UIImage(cgImage: cgImage)
      }
    } catch {}
    return nil
  }
}
