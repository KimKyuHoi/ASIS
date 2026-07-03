import Foundation
import Vision
import AppKit

// asis-ocr [--barcode] <image-path>
//   기본     : 이미지의 텍스트를 인식해 줄 단위로 stdout 출력 (OCR, 한국어+영어).
//   --barcode: 이미지의 QR/바코드 payload 를 줄 단위로 stdout 출력.
// macOS Vision 기반 — 시스템 프레임워크라 런타임 의존성 없음(빌드 시 유니버설 바이너리).
let args = Array(CommandLine.arguments.dropFirst())
let barcodeMode = args.contains("--barcode")
let pathArg = args.last

guard let path = pathArg, !path.hasPrefix("--") else {
  FileHandle.standardError.write(Data("usage: asis-ocr [--barcode] <image-path>\n".utf8))
  exit(2)
}

guard let image = NSImage(contentsOfFile: path),
      let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil)
else {
  FileHandle.standardError.write(Data("이미지를 열 수 없음: \(path)\n".utf8))
  exit(1)
}

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])

if barcodeMode {
  let request = VNDetectBarcodesRequest { req, _ in
    let observations = (req.results as? [VNBarcodeObservation]) ?? []
    let payloads = observations.compactMap { $0.payloadStringValue }
    print(payloads.joined(separator: "\n"))
  }
  do {
    try handler.perform([request])
  } catch {
    FileHandle.standardError.write(Data("바코드 인식 실패: \(error)\n".utf8))
    exit(1)
  }
} else {
  let request = VNRecognizeTextRequest { req, _ in
    guard let observations = req.results as? [VNRecognizedTextObservation] else { return }
    let lines = observations.compactMap { $0.topCandidates(1).first?.string }
    print(lines.joined(separator: "\n"))
  }
  request.recognitionLevel = .accurate
  request.recognitionLanguages = ["ko-KR", "en-US"]
  request.usesLanguageCorrection = true
  do {
    try handler.perform([request])
  } catch {
    FileHandle.standardError.write(Data("OCR 실패: \(error)\n".utf8))
    exit(1)
  }
}
