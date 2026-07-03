import Foundation
import Vision
import AppKit

// asis-ocr <image-path>
// 이미지에서 텍스트를 인식해 줄 단위로 stdout 에 출력. 실패 시 stderr + 비정상 종료.
// macOS Vision(VNRecognizeTextRequest) 기반 — 한국어+영어. 시스템 프레임워크라
// 런타임 의존성 없음(빌드 시 유니버설 바이너리로 컴파일해 앱 번들에 포함).
guard CommandLine.arguments.count > 1 else {
  FileHandle.standardError.write(Data("usage: asis-ocr <image-path>\n".utf8))
  exit(2)
}
let path = CommandLine.arguments[1]

guard let image = NSImage(contentsOfFile: path),
      let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil)
else {
  FileHandle.standardError.write(Data("이미지를 열 수 없음: \(path)\n".utf8))
  exit(1)
}

let request = VNRecognizeTextRequest { req, _ in
  guard let observations = req.results as? [VNRecognizedTextObservation] else { return }
  let lines = observations.compactMap { $0.topCandidates(1).first?.string }
  print(lines.joined(separator: "\n"))
}
request.recognitionLevel = .accurate
request.recognitionLanguages = ["ko-KR", "en-US"]
request.usesLanguageCorrection = true

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
do {
  try handler.perform([request])
} catch {
  FileHandle.standardError.write(Data("OCR 실패: \(error)\n".utf8))
  exit(1)
}
