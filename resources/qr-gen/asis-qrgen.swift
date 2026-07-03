import Foundation
import CoreImage
import AppKit

// asis-qrgen <payload> <output-png-path>
//   payload 문자열을 QR 코드로 인코딩해 <output-png-path> 에 PNG 로 저장한다.
// CoreImage 의 CIQRCodeGenerator 는 macOS 시스템 프레임워크라 런타임 의존성 없음
// (빌드 시 유니버설 바이너리, build-ocr.sh 와 동일한 결). 성공 시 exit 0,
// 실패 시 stderr 에 원인 출력 후 non-zero 로 종료한다(조용한 실패 금지).
let args = Array(CommandLine.arguments.dropFirst())

guard args.count == 2 else {
  FileHandle.standardError.write(Data("usage: asis-qrgen <payload> <output-png-path>\n".utf8))
  exit(2)
}

let payload = args[0]
let outPath = args[1]

guard !payload.isEmpty else {
  FileHandle.standardError.write(Data("payload 가 비어 있음\n".utf8))
  exit(2)
}

// QR 인코딩 — inputMessage 는 payload 의 UTF-8 데이터.
guard let filter = CIFilter(name: "CIQRCodeGenerator") else {
  FileHandle.standardError.write(Data("CIQRCodeGenerator 를 생성할 수 없음\n".utf8))
  exit(1)
}
let payloadData = Data(payload.utf8)
filter.setValue(payloadData, forKey: "inputMessage")
// 오류 정정 레벨 M (기본값이지만 의도를 명시). L < M < Q < H 순으로 견고.
filter.setValue("M", forKey: "inputCorrectionLevel")

guard let ciImage = filter.outputImage else {
  FileHandle.standardError.write(Data("QR outputImage 생성 실패\n".utf8))
  exit(1)
}

// CIQRCodeGenerator 출력은 모듈당 1px 이라 매우 작다. 정수배(10x) 로 확대해
// 선명한 PNG 로 만든다 — 정수배라 모듈 격자가 뭉개지지 않는다.
let scaled = ciImage.transformed(by: CGAffineTransform(scaleX: 10, y: 10))

// NSBitmapImageRep(ciImage:) 는 CIImage 의 투명 배경을 불투명 흰색으로 평탄화한다.
// 핀 윈도우가 transparent 라 배경이 투명하면 흰 모듈이 보이지 않는데, 이 평탄화
// 덕분에 quiet zone/흰 모듈이 alpha=1.0 불투명 흰색으로 저장된다(실측 확인).
let rep = NSBitmapImageRep(ciImage: scaled)
guard let pngData = rep.representation(using: .png, properties: [:]) else {
  FileHandle.standardError.write(Data("PNG 인코딩 실패\n".utf8))
  exit(1)
}

do {
  try pngData.write(to: URL(fileURLWithPath: outPath))
} catch {
  FileHandle.standardError.write(Data("PNG 저장 실패: \(error)\n".utf8))
  exit(1)
}
