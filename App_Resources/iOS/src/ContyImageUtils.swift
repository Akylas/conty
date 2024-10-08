import Foundation
import UIKit

@objcMembers
@objc(ContyImageUtils)
class ContyImageUtils : NSObject {
  // Struct to represent BMP header and DIB header fields
  struct BMPHeader {
    var fileSize: UInt32
    var pixelArrayOffset: UInt32
    var dibHeaderSize: UInt32
    var width: Int32
    var height: Int32
    var bitDepth: UInt16
    var compression: UInt32
    var imageSize: UInt32
    var colorsUsed: UInt32
    var bottomUp: Bool
  }
  
  // Function to read UInt16 from Data at a specific offset (little-endian)
  static  func readUInt16(from data: Data, offset: Int) -> UInt16 {
    return data.subdata(in: offset..<(offset + 2)).withUnsafeBytes { $0.load(as: UInt16.self) }.littleEndian
  }
  
  // Function to read UInt32 from Data at a specific offset (little-endian)
  static func readUInt32(from data: Data, offset: Int) -> UInt32 {
    return data.subdata(in: offset..<(offset + 4)).withUnsafeBytes { $0.load(as: UInt32.self) }.littleEndian
  }
  
  // Function to parse BMP headers
  static func parseBMPHeader(data: Data) -> BMPHeader {
    let fileSize = readUInt32(from: data, offset: 2)
    let pixelArrayOffset = readUInt32(from: data, offset: 10)
    let dibHeaderSize = readUInt32(from: data, offset: 14)
    let width = Int32(readUInt32(from: data, offset: 18))
    var height = Int32(readUInt32(from: data, offset: 22))
    let bitDepth = readUInt16(from: data, offset: 28)
    let compression = readUInt32(from: data, offset: 30)
    let imageSize = readUInt32(from: data, offset: 34)
    let colorsUsed = readUInt32(from: data, offset: 46)
    var bottom_up = true
    if(height < 0) {
      height *= -1
      bottom_up = false
    }
    
    return BMPHeader(fileSize: fileSize, pixelArrayOffset: pixelArrayOffset, dibHeaderSize: dibHeaderSize, width: width, height: height, bitDepth: bitDepth, compression: compression, imageSize: imageSize, colorsUsed: colorsUsed, bottomUp: bottom_up)
  }
  
  // Function to decompress RLE4 encoded pixel data
  static func decompressRLE4(data: Data, width: Int, height: Int, colorPalette: [UInt8], header: BMPHeader) -> [UInt8] {
    // Prepare the output array, which will store each pixel
    var pixels = [UInt8](repeating: 0, count: width * height * 4)
    if(header.compression == 2){
      //            data.fill(0xff);
      
      var location = 0
      var pos = Int(header.pixelArrayOffset)
      var lines = header.bottomUp ? height-1 : 0
      var low_nibble = false//for all count of pixel
      
      func setPixelData(rgbIndex: Int){
        pixels[location] = 0;
        pixels[location + 1] = colorPalette[rgbIndex * 4 + 0]
        pixels[location + 2] = colorPalette[rgbIndex * 4 + 1]
        pixels[location + 3] = colorPalette[rgbIndex * 4 + 2]
        location+=4;
      }
      
      while(true){
        let a =  Int(data[pos])
        let b = Int(data[pos+1])
        pos += 2
        //absolute mode
        if(a == 0){
          if(b == 0){//line end
            if(header.bottomUp){
              lines -= 1
            }else{
              lines += 1
            }
            location = lines*width*4;
            low_nibble = false;
            continue;
          }else if(b == 1){//image end
            break;
          }else if(b == 2){
            //offset x,y
            let x = Int(data[pos])
            let y = Int(data[pos+1])
            pos += 2
            if(header.bottomUp){
              lines -= y
            }else{
              lines += y
            }
            
            location += (y * width * 4 + x * 4)
          }else{
            var c = Int(data[pos])
            pos += 1
            for i in 0..<b{
              if (low_nibble) {
                setPixelData(rgbIndex: Int((c & 0x0f)))
              } else {
                setPixelData(rgbIndex: Int((c & 0xf0)>>4))
              }
              
              if (((i & 1) == 1) && ((i+1) < b)){
                c = Int(data[pos])
                pos += 1
              }
              
              low_nibble = !low_nibble;
            }
            
            if ((((b + 1) >> 1) & 1 ) == 1){
              pos += 1
            }
          }
          
        }else{//encoded mode/
          for _ in 0..<a{
            if (low_nibble) {
              setPixelData(rgbIndex: Int((b & 0x0f)))
            } else {
              setPixelData(rgbIndex: Int((b & 0xf0)>>4))
            }
            low_nibble = !low_nibble;
          }
        }
        
      }
    }else{
      
      //          var xlen = Math.ceil(width/2);
      //          var mode = xlen%4;
      //          for (var y = height - 1; y >= 0; y--) {
      //            var line = bottom_up ? y : height - 1 - y
      //            for (var x = 0; x < xlen; x++) {
      //              var b = buffer.readUInt8(pos++);
      //              var location = line * width * 4 + x*2*4;
      //
      //              var before = b>>4;
      //              var after = b&0x0F;
      //
      //              var rgb = palette[before];
      //              data[location] = 0;
      //              data[location + 1] = rgb.blue;
      //              data[location + 2] = rgb.green;
      //              data[location + 3] = rgb.red;
      //
      //
      //              if(x*2+1>=width)break;
      //
      //              rgb = palette[after];
      //
      //              data[location+4] = 0;
      //              data[location+4 + 1] = rgb.blue;
      //              data[location+4 + 2] = rgb.green;
      //              data[location+4 + 3] = rgb.red;
      //
      //            }
      //
      //            if (mode != 0){
      //              pos+=(4 - mode);
      //            }
      //          }
      
    }
    return pixels
  }
  
  // Function to convert BMP data to UIImage
  static func bmpToUIImage(data: Data) -> UIImage? {
    // Parse BMP and DIB headers
    let bmpHeader = parseBMPHeader(data: data)
    
    // Verify that the image is RLE4 compressed
    if bmpHeader.bitDepth != 4 || bmpHeader.compression != 2 {
      return nil
    }
    
    // Extract the color palette (4 bytes per color, usually 16 colors for 4-bit BMPs)
    let colorPaletteOffset = 14 + Int(bmpHeader.dibHeaderSize)
    let colorPaletteSize = Int(bmpHeader.colorsUsed == 0 ? 1 << bmpHeader.bitDepth : bmpHeader.colorsUsed) * 4
    let colorPalette = Array(data[colorPaletteOffset..<(colorPaletteOffset + colorPaletteSize)])
    
    
    // Decompress the RLE4 pixel data
    let pixels = decompressRLE4(data: data, width: Int(bmpHeader.width), height: Int(bmpHeader.height), colorPalette: colorPalette, header: bmpHeader)
    //    let indexedPixels = pixels.map { UInt8($0) }
    // Map the decompressed pixels to RGBA values using the color palette
    //    let rgbaPixels = mapPixelsToColors(pixels: pixels, colorPalette: colorPalette, width: Int(bmpHeader.width), height: Int(bmpHeader.height))
    
    // Create a UIImage from the RGBA pixel data
    let providerRef = CGDataProvider(data: NSData(bytes: pixels, length: pixels.count) as CFData)
    let cgImage = CGImage(
      width: Int(bmpHeader.width),
      height: Int(bmpHeader.height),
      bitsPerComponent: 8,
      bitsPerPixel: 32,
      bytesPerRow: Int(bmpHeader.width) * 4,
      space: CGColorSpaceCreateDeviceRGB(),
      bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.noneSkipFirst.rawValue),
      provider: providerRef!,
      decode: nil,
      shouldInterpolate: true,
      intent: .defaultIntent
    )
    
    return UIImage(cgImage: cgImage!)
  }
  
  static func loadPossible4Bitmap(_ str: String) -> UIImage? {
    var data: Data
    
    do {
      data = try Data(contentsOf: URL(fileURLWithPath: str))
      //        bitmapData = Array(data)
    } catch {
      return nil
    }
    return bmpToUIImage(data:data)
  }
}
