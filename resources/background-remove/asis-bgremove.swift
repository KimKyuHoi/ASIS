import Foundation
import Vision
import AppKit
import CoreImage
import ImageIO
import UniformTypeIdentifiers

// asis-bgremove <input-image-path> <output-png-path>
//   입력 이미지에서 전경(피사체) 마스크를 구해 배경을 투명하게(alpha) 만든 PNG 를 저장한다.
//   macOS 14+ Vision 의 VNGenerateForegroundInstanceMaskRequest 사용.
//
// exit code (호출자 backgroundRemove.ts 가 의미를 분기한다)
//   0 : 성공 (output PNG 저장 완료)
//   2 : 잘못된 인자
//   3 : 입력 이미지 열기 실패
//   4 : mask request 수행 실패 (Vision 내부 에러)
//   5 : 전경 인스턴스 없음 — 피사체를 찾지 못함 (배경 제거 대상 아님)
//   6 : 마스크 이미지 생성/인코딩/저장 실패
//   7 : macOS 14 미만 (런타임 게이팅) — 호출 전 TS 단에서도 막지만 이중 안전
//
// Vision 은 시스템 프레임워크라 런타임 의존성 없음 (빌드 시 유니버설 바이너리).

let args = Array(CommandLine.arguments.dropFirst())

guard args.count == 2 else {
  FileHandle.standardError.write(Data("usage: asis-bgremove <input-image-path> <output-png-path>\n".utf8))
  exit(2)
}

let inputPath = args[0]
let outputPath = args[1]

// NSImage 대신 CGImageSource 로 로드 — NSImage.cgImage(forProposedRect:) 는
// Retina backing scale 로 2x 로 그릴 수 있어 출력 픽셀 크기가 입력과 달라진다.
// CGImageSource 는 파일의 native 픽셀 크기 그대로 CGImage 를 만든다.
guard let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: inputPath) as CFURL, nil),
      let cgImage = CGImageSourceCreateImageAtIndex(source, 0, nil)
else {
  FileHandle.standardError.write(Data("이미지를 열 수 없음: \(inputPath)\n".utf8))
  exit(3)
}

// VNGenerateForegroundInstanceMaskRequest / generateMaskedImage 는 macOS 14+ 전용.
// min target 이 13.0 이므로 사용 지점 전체를 #available 블록으로 감싸야 컴파일된다.
// (guard #available … else 로도 좁혀지지만, 사용 지점을 명시적으로 감싸는 형태가
//  버전 게이팅 의도를 코드에 분명히 드러낸다.)
guard #available(macOS 14.0, *) else {
  FileHandle.standardError.write(Data("macOS 14 이상이 필요합니다 (전경 마스크 미지원)\n".utf8))
  exit(7)
}

if #available(macOS 14.0, *) {
  let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
  let request = VNGenerateForegroundInstanceMaskRequest()

  do {
    try handler.perform([request])
  } catch {
    FileHandle.standardError.write(Data("전경 마스크 요청 실패: \(error)\n".utf8))
    exit(4)
  }

  // results 가 비어있으면(nil 또는 첫 요소 없음) 피사체를 찾지 못한 것 — silent 하게
  // 성공 처리하지 않고 전용 exit code 로 호출자가 "피사체 없음" 을 구분하게 한다.
  guard let result = request.results?.first, !result.allInstances.isEmpty else {
    FileHandle.standardError.write(Data("전경 인스턴스 없음 — 피사체를 찾지 못했습니다\n".utf8))
    exit(5)
  }

  do {
    // allInstances = 감지된 모든 전경 인스턴스. croppedToInstancesExtent=false 로
    // 원본 캔버스 크기를 유지한 채 배경만 투명하게 만든 픽셀 버퍼를 얻는다.
    let maskedBuffer = try result.generateMaskedImage(
      ofInstances: result.allInstances,
      from: handler,
      croppedToInstancesExtent: false
    )

    let ciImage = CIImage(cvPixelBuffer: maskedBuffer)
    let ciContext = CIContext()
    guard let outputCGImage = ciContext.createCGImage(ciImage, from: ciImage.extent) else {
      FileHandle.standardError.write(Data("CGImage 변환 실패\n".utf8))
      exit(6)
    }

    guard let destination = CGImageDestinationCreateWithURL(
      URL(fileURLWithPath: outputPath) as CFURL,
      UTType.png.identifier as CFString,
      1,
      nil
    ) else {
      FileHandle.standardError.write(Data("PNG destination 생성 실패\n".utf8))
      exit(6)
    }
    CGImageDestinationAddImage(destination, outputCGImage, nil)
    guard CGImageDestinationFinalize(destination) else {
      FileHandle.standardError.write(Data("PNG 저장 실패: \(outputPath)\n".utf8))
      exit(6)
    }
  } catch {
    FileHandle.standardError.write(Data("마스크 이미지 생성 실패: \(error)\n".utf8))
    exit(6)
  }
}
