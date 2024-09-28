import Foundation
import UIKit

@objcMembers
@objc(ImageUtils)
class ImageUtils : NSObject {
  // BMP Header is 14 bytes, DIB header is typically 40 bytes (for BITMAPINFOHEADER)
  static  let bmpHeaderSize = 14
  static let dibHeaderSize = 40

  struct BMPHeader {
    var fileType: UInt16
    var fileSize: UInt32
    var reserved1: UInt16
    var reserved2: UInt16
    var offset: UInt32
    var headerSize: UInt32
    var width: Int32
    var height: Int32
    var planes: UInt16
    var bitsPerPixel: UInt16
    var compression: UInt32
    var imageSize: UInt32
    var xPixelsPerMeter: Int32
    var yPixelsPerMeter: Int32
    var colorsUsed: UInt32
    var importantColors: UInt32
  }

  func readBMP(data bitmapData: [UInt8]) -> BMPHeader? {
      var offset = 0
      var header = BMPHeader()
      header.fileType = bitmapData[offset..<offset+2].withUnsafeBytes { $0.load(as: UInt16.self) }.bigEndian
      offset += 2
      header.fileSize = bitmapData[offset..<offset+4].withUnsafeBytes { $0.load(as: UInt32.self) }.bigEndian
      offset += 4
      header.reserved1 = bitmapData[offset..<offset+2].withUnsafeBytes { $0.load(as: UInt16.self) }.bigEndian
      offset += 2
      header.reserved2 = bitmapData[offset..<offset+2].withUnsafeBytes { $0.load(as: UInt16.self) }.bigEndian
      offset += 2
      header.offset = bitmapData[offset..<offset+4].withUnsafeBytes { $0.load(as: UInt32.self) }.bigEndian
      offset += 4
      header.headerSize = bitmapData[offset..<offset+4].withUnsafeBytes { $0.load(as: UInt32.self) }.bigEndian
      offset += 4
      header.width = bitmapData[offset..<offset+4].withUnsafeBytes { $0.load(as: Int32.self) }.bigEndian
      offset += 4
      header.height = bitmapData[offset..<offset+4].withUnsafeBytes { $0.load(as: Int32.self) }.bigEndian
      offset += 4
      header.planes = bitmapData[offset..<offset+2].withUnsafeBytes { $0.load(as: UInt16.self) }.bigEndian
      offset += 2
      header.bitsPerPixel = bitmapData[offset..<offset+2].withUnsafeBytes { $0.load(as: UInt16.self) }.bigEndian
      offset += 2
      header.compression = bitmapData[offset..<offset+4].withUnsafeBytes { $0.load(as: UInt32.self) }.bigEndian
      offset += 4
      header.imageSize = bitmapData[offset..<offset+4].withUnsafeBytes { $0.load(as: UInt32.self) }.bigEndian
      offset += 4
      header.xPixelsPerMeter = bitmapData[offset..<offset+4].withUnsafeBytes { $0.load(as: Int32.self) }.bigEndian
      offset += 4
      header.yPixelsPerMeter = bitmapData[offset..<offset+4].withUnsafeBytes { $0.load(as: Int32.self) }.bigEndian
      offset += 4
      header.colorsUsed = bitmapData[offset..<offset+4].withUnsafeBytes { $0.load(as: UInt32.self) }.bigEndian
      offset += 4
      header.importantColors = bitmapData[offset..<offset+4].withUnsafeBytes { $0.load(as: UInt32.self) }.bigEndian
      
      return header
  }

  static func loadPossible4Bitmap(_ str: String) -> UIImage? {
    var bitmapData: [UInt8] = []
    
    do {
        let data = try Data(contentsOf: URL(fileURLWithPath: str))
        bitmapData = Array(data)
    } else {
      return nil
    }
    guard let header = readBMPHeader(data: data) else { return nil }
    
    let width = Int(header.width)
    let height = abs(Int(header.height))
    var pixels = [UInt8](repeating: 0, count: width * height)
    
    // Assuming the BMP file is uncompressed (BI_RGB) and has a bits per pixel of 4
    if header.bitsPerPixel == 4 {
        for y in 0..<height {
            for x in 0..<width {
                let byteIndex = (y * width + x) / 2
                var value: UInt8 = 0
                if x % 2 == 0 {
                    value = bitmapData[header.offset + byteIndex] >> 4
                } else {
                    value = bitmapData[header.offset + byteIndex] & 0x0F
                }
                pixels[y * width + x] = value
            }
        }
    }
    
    let colorSpace = CGColorSpaceCreateDeviceGray()
    var bitmapInfo = CGBitmapInfo(rawValue: CGImageAlphaInfo.none.rawValue)
    let context = CGContext(data: &pixels, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width, space: colorSpace, bitmapInfo: bitmapInfo.rawValue)
    
    if let cgImage = context?.makeImage() {
        return UIImage(cgImage: cgImage)
    }
    
    return nil
  }
}
